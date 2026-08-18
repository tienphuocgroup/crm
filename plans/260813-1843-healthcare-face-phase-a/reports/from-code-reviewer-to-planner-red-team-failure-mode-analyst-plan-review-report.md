# Red-team plan review — Failure Mode Analyst

Plan: `plans/260813-1843-healthcare-face-phase-a/`
Reviewer: code-reviewer (hostile pass, failure modes only)
Date: 2026-08-13
Verified against: `dev` @ e835e19 (local == origin/dev)

## Finding 1: Org delete destroys the surviving journey's entire history via `Activity.companyId` Cascade

- **Severity:** Critical
- **Location:** Phase 3, sections "Architecture / Schema" and "Service invariants"
- **Flaw:** The plan changes only `Deal.companyId` from Cascade to SetNull and claims "Deleting an organization must not delete a client's journey history — the journey survives with `companyId = null`". But `Activity.companyId` has its own `onDelete: Cascade` FK, and every stage-change activity is written WITH `companyId` set. The plan never touches this FK.
- **Failure scenario:** User deletes an organization. The journey row survives with `companyId = null` (as designed). Postgres then cascade-deletes every Activity row where `companyId` = the deleted org — including all STAGE_CHANGE, NOTE, CALL rows of the surviving journey. The journey survives as a husk: empty timeline, `recomputeAfterDelete` recomputes `lastActivityAt` from zero remaining activities → NULL. The exact outcome the plan promises to prevent (loss of journey history) happens through a sibling FK. Phase 3's success criterion "correct `lastActivityAt`" passes vacuously (null is "correct" for destroyed data).
- **Evidence:**
  - `packages/db/prisma/schema.prisma:1088-1089` — `companyId String?` / `company Company? @relation(..., onDelete: Cascade)` on Activity
  - `apps/api/src/deals/deals.service.ts:427-437` — stage-change `tx.activity.create({ data: { ..., companyId: deal.companyId, dealId: deal.id, meta: {from, to} } })`
  - `apps/api/src/crm/activity-stamp.service.ts:118-159` — `recomputeAfterDelete` sets `lastActivityAt` from max of remaining activities
- **Suggested fix:** Phase 3 must also change `Activity.companyId` to `SetNull` (or stop stamping `companyId` on deal-scoped activities), and add a test: delete org → journey timeline still renders its stage history and `lastActivityAt` is unchanged.

## Finding 2: The JSON backfill targets a table where the events do not exist; the real store and three more event types are missed

- **Severity:** Critical
- **Location:** Phase 2, "Migration SQL shape" step 4 and Implementation Step 2
- **Flaw:** Step 4 says: backfill `Activity` meta, "Same treatment for `AgentEvent` payloads carrying `deal.stage.changed` {from, to}". Grep shows zero write sites that put `deal.stage.changed` into `AgentEvent`. API-emitted CRM events persist as **`AgentTask`** rows (`kind: "agent-event"`), with a NESTED shape: `payload.data.from` / `payload.data.to`, not a flat `{from, to}`. `AgentEvent` writers are only agent transcript/audit code (`builder-input.ts:69`, `audit.ts:22`). Additionally, `deal.closed` and `deal.opened` payloads carry `{from, to}` stage strings, and `deal.created` carries `stage` — the plan backfills none of them.
- **Failure scenario:** The migration author writes `UPDATE "agentEvent" ... WHERE type = 'deal.stage.changed'` — it matches zero rows, "succeeds", and the gate passes. All historical `agentTask.payload.data` stage strings keep `CLOSED_WON`/`DEMO_BOOKED`. Queued-but-undrained agent-event tasks (`finishedAt: null`) carry old strings into post-swap agent code whose `isOpen` was rewritten against `CLOSED_DEAL_STAGES` — `"CLOSED_WON"` no longer matches any closed stage and a closed deal is classified open. If instead the author "fixes" the table name but keeps the flat `{from, to}` UPDATE shape, it corrupts or no-ops against the nested `payload.data` structure. Idempotency is unspecified in either case.
- **Evidence:**
  - `apps/api/src/agent/agent-trigger.service.ts:169-174` — `withCrmEvents` persists via `createEventTask`; `:442-455` — `tx.agentTask.create({ data: { kind: "agent-event", payload: input } })`
  - `apps/api/test/agent-events.spec.ts:110-140` — asserts these payloads land in `db.agentTask.findMany({ where: { kind: "agent-event" } })`, nested `payload.data`, incl. free-form `from: "NEGOTIATION"`
  - `apps/api/src/deals/deals.service.ts:446-470` — `deal.closed` / `deal.opened` emits with `{from, to}`; `:267-278` — create-path emits with `stage` / `to: stage`
  - Grep `deal.stage.changed` across `apps/api/src`, `apps/agent/agent`, `packages/db/src`: only `deals.service.ts:440` (emit) and `crm-events.ts:25` (catalog). No AgentEvent writer.
- **Suggested fix:** Rewrite step 4 against reality: enumerate stores by write site (`activity.meta` flat `{from,to}` WHERE `type='STAGE_CHANGE'`; `agentTask.payload.data.{from,to,stage}` WHERE `kind='agent-event'` AND `payload->>'type' IN ('deal.stage.changed','deal.closed','deal.opened','deal.created')`). Specify WHERE-scoped, idempotent UPDATEs. Add a post-backfill assertion query (old-string count = 0) to the gate.

## Finding 3: "Timeline falls back to raw string render" is false — a missed backfill row crashes the timeline component

- **Severity:** High
- **Location:** Phase 2, "Risk Assessment" (backfill risk) and "Migration SQL shape" step 4
- **Flaw:** The plan's mitigation for a missed JSON shape is "timeline falls back to raw string render (verify during step 2, note actual fallback behavior)". The code has no fallback. `dealStageLabelKey` is `PRESENTATION[stage].labelKey`; for any string outside the new 6-value map, `PRESENTATION[stage]` is `undefined` and `.labelKey` throws TypeError. The call site launders the untyped meta with `as never`, so the compiler is silenced by design.
- **Failure scenario:** One pre-migration STAGE_CHANGE Activity row escapes the backfill (or the backfill misfires per Finding 2). A user opens that deal's record sheet. `stageChange(entry.meta)` returns `{from: "DEMO_BOOKED", ...}` → `PRESENTATION["DEMO_BOOKED"]` is undefined → TypeError inside the client component → the whole timeline (or its error boundary) crashes for that record, permanently, until a data fix ships. Acceptance criterion "stage-change history renders new labels" fails as a crash, not a cosmetic miss — and nothing in the gates detects it, because gates never render migrated legacy rows.
- **Evidence:**
  - `apps/app/lib/deal-stage.ts:55-57` — `return PRESENTATION[stage].labelKey;` (no guard)
  - `apps/app/components/crm/timeline/timeline-entry.tsx:78-82` — `deals(dealStageLabelKey(change.from as never))`
  - Free-form strings are legal in this meta path: `apps/api/test/agent-events.spec.ts:125` (`"NEGOTIATION"`); plan step 6 itself acknowledges "meta is free-form"
- **Suggested fix:** Two-line hardening in scope: make `dealStageLabelKey` total (unknown → return the raw string or a fallback key). Plus the post-backfill count assertion from Finding 2. Delete the false "falls back" claim from the plan.

## Finding 4: Deploy ordering — the enum swap runs mid-build while old code serves, and the plan defers the decision instead of making one

- **Severity:** High
- **Location:** Phase 2, "Pre-flight gate" and "Risk Assessment" (preview-DB risk)
- **Flaw:** The plan says "Fork deploy target (Cloudflare) to be confirmed in the pre-flight gate". The fork governance plan already answers this: "the app deploys on Vercel today"; the Cloudflare move is an unexecuted separate plan. So the live mechanism is: `prisma migrate deploy` runs DURING the crm-api production build, gated `VERCEL_ENV === "production"`, while the previous deployment keeps serving. An enum SWAP (unlike an additive migration) makes every `deal` row instantly unreadable by the old Prisma client, and every write of an old value invalid. The plan treats this as an unknown to "confirm", not a failure mode to handle.
- **Failure scenario:** Three concrete windows, none addressed:
  1. Preview of `feat/healthcare-face-phase-a` (previews share the production `DATABASE_URL`): new client enum reads `DEMO_BOOKED` from prod rows → Prisma inconsistent-column-data error on every deal/dashboard query; writes of `INQUIRY` rejected by Postgres (`invalid input value for enum`). The entire deals surface of the preview 500s the moment the preview exists.
  2. Release deploy: migration commits during the build; old production functions serve until promotion → same crash class on live production for the build+promotion window.
  3. Rollback hole: Vercel instant-rollback redeploys old code against the already-swapped enum → production stays broken. The deployment rollback path is dead the moment the migration lands; only the data-level rollback (Finding 5) remains, and it is incomplete.
  Secondary: `ALTER COLUMN ... TYPE ... USING` takes ACCESS EXCLUSIVE and rewrites the table plus its `@@index([stage])` — brief, but it runs while old code is querying it.
- **Evidence:**
  - `apps/api/scripts/build-func.mjs:167,188-189` — `VERCEL_ENV === "production"` gate; `bun x prisma migrate deploy` during build
  - `docs/setup.md:103-115` — "Migrations run on the production deploy, and nowhere else"; "Preview deploys share the production database"; "a preview of a branch that adds a migration ... pages that touch them fail"
  - `plans/260812-2132-fork-actions-downstream-vendor/plan.md:70-74` — Cloudflare is "a separate plan"; Vercel is current
  - `packages/db/prisma/schema.prisma:936` — `@@index([stage])`
- **Suggested fix:** The pre-flight gate must produce decisions, not confirmations: (a) state in the PR that previews of this branch are broken by design (or disable them); (b) accept and time-box the promotion-window outage explicitly; (c) document that deployment rollback is invalid post-migration and the only rollback is the Finding-5 data path. If prod holds zero deal rows (plausible on this fork), say so and collapse all three windows to "none" — but that must be verified, not assumed.

## Finding 5: The rollback record covers one of three mutated stores, and two folds are many-to-one

- **Severity:** High
- **Location:** Phase 2, "Pre-flight gate" ("this snapshot is the rollback record") and plan.md "Key risks" 1-2
- **Flaw:** The designated rollback record is `SELECT id, stage FROM deal` to "a local file". The migration mutates three stores: `deal.stage`, `activity.meta`, `agentTask.payload`. The mapping is many-to-one twice (`QUALIFIED_TO_BUY` and `DECISION_MAKER_BOUGHT_IN` → `CONSULT_DONE`; `UNQUALIFIED_TO_BUY` and `CLOSED_LOST` → `LOST`), so a reverse CASE cannot reconstruct the JSON blobs, and the snapshot restores only `deal.stage`. There is also no written restore procedure, format, or storage location for the "local file".
- **Failure scenario:** Migration ships; a week later the user reverses the 6-stage decision or the fold proves wrong. `deal.stage` is restorable from the snapshot. Every backfilled `activity.meta` and `agentTask.payload` `{from: "CONSULT_DONE"}` is ambiguous — was it QUALIFIED_TO_BUY or DECISION_MAKER_BOUGHT_IN? History is permanently rewritten; the timeline after rollback shows stage names that never existed at the time. The plan's own phrase "reversible by documented mapping" (Requirements) is false for the JSON stores.
- **Evidence:**
  - `phase-02-stage-model-swap.md` "Stage mapping" table — two many-to-one folds
  - `phase-02-stage-model-swap.md` "Pre-flight gate" — snapshot is deals only
  - Mutated stores per Finding 2 evidence: `deals.service.ts:436` (activity meta), `agent-trigger.service.ts:451-455` (agentTask payload)
- **Suggested fix:** Snapshot all three: `activity(id, meta) WHERE type='STAGE_CHANGE'` and `agentTask(id, payload) WHERE kind='agent-event'` alongside the deal snapshot — or have the migration itself write originals to a rollback table in the same transaction. Write the restore procedure down (three UPDATE-from-snapshot statements), or delete the word "reversible" from Requirements.

## Finding 6: CASE with no ELSE, over a production schema the plan itself marks UNKNOWN, on a repo with a documented schema-drift incident

- **Severity:** Medium
- **Location:** Phase 2, "Migration SQL shape" step 2
- **Flaw:** The `USING (CASE stage::text ... END)` shape has no ELSE branch and no failure contract. Under the checked-in schema this is total (exactly 7 enum values, all 7 mapped). But the plan's own risk register says production data state is UNKNOWN, and `docs/setup.md` documents a real incident where production was shaped by `db push` from a laptop — objects existed in prod that no migration defines, for days, undetected by `migrate deploy`.
- **Failure scenario:** Prod enum was ever touched out-of-band (the documented failure class for this exact repo) and holds a value the CASE misses. CASE yields NULL → cast/NOT NULL violation → migration transaction aborts → per Finding 4 this aborts the production BUILD, mid-release. The release is bricked at the worst moment, with a Postgres error as the only diagnostic. Silent alternative is worse: if the column were ever made nullable, NULL rows would land silently.
- **Evidence:**
  - `packages/db/prisma/schema.prisma:169-177` — 7 values, matching the 7 mapping rows (total today)
  - `plan.md` "Key risks" 2 — "Production data state on the fork is unverified"
  - `docs/setup.md:116-133` — the `db push`/`migrate diff` divergence incident ("an object in the database that no migration defines")
- **Suggested fix:** Add to the pre-flight: `SELECT DISTINCT stage FROM deal` against every real DB, asserted equal to the 7 known values. In the SQL, add an ELSE that fails loudly with a meaningful message (e.g., raise via a CASE-else casting an impossible sentinel), so an abort names the bad value instead of a bare cast error.

## Finding 7: The test database only migrates forward; the enum swap bricks pre-push on every other branch until a manual drop

- **Severity:** Medium
- **Location:** Phase 2, Implementation Step 7 and Phase 4, Success Criteria ("pre-push hook passes")
- **Flaw:** `test-db.ts` creates the `_test` database if missing and runs `prisma migrate deploy` — forward only; no reset path exists for it (`db:reset` targets `DATABASE_URL`, guarded by `require-local-db.ts`, not the test DB). The pre-push hook runs the full `check-types lint test` suite. The plan spans ~14 days as a commit sequence on one branch, with a dependency plan (`260812-2301-vietnamese-locale`) still awaiting user verification — cross-branch work during the window is likely.
- **Failure scenario:** Developer runs tests on `feat/healthcare-face-phase-a` — `crm_test` now has the 6-value enum. They switch to `dev` for a vietnamese-locale fix and push. Pre-push runs the agent integration suite, which seeds `DealStage.CONTRACT_SENT` / `DEMO_BOOKED` → Postgres rejects the enum value → every test touching deals fails → push blocked. `migrate deploy` cannot go backward; no script resets the test DB; the developer must know to `DROP DATABASE crm_test` by hand. Nothing in the plan mentions this; the "fresh db:reset && db:seed" gate in step 7 resets the dev DB, not the test DB.
- **Evidence:**
  - `packages/db/scripts/test-db.ts:37-80` — create-if-missing + `prisma migrate deploy`; no drop/reset
  - `.githooks/pre-push` — runs `bun run check-types`, `lint`, `test`
  - `apps/agent/test/preamble.integration.spec.ts:77` — seeds `DealStage.CONTRACT_SENT`
  - `plan.md` Dependencies — vietnamese-locale "awaiting-user-verification"
- **Suggested fix:** One line in Phase 2 step 7: "switching branches across the enum boundary requires dropping `crm_test` (the test DB never resets)". Better: teach `test-db.ts` to reset when `migrate deploy` fails, or note `CRM_SKIP_HOOKS` as the documented escape.

## Finding 8: Contract check — `deals.create` has a second caller the plan's file list omits, and it is the very pattern Phase 3 says to "follow"

- **Severity:** Medium
- **Location:** Phase 3, "Related Code Files" (contact record sheet item) and "Contracts"
- **Flaw:** Contract Verifier enumeration of `trpc.deals.create` callers: **2** — `create-deal-sheet.tsx:97` (listed) and `components/crm/record-sheet/quick-add.tsx:274` (not listed anywhere in the plan). The plan's contact-sheet instruction is "follow the pattern the company sheet uses to open the create-deal sheet" — but the company sheet's pattern IS `quick-add.tsx`, whose deal form takes `companyId: string` as a REQUIRED prop and submits it unconditionally. Reusing it from a contact sheet requires loosening that prop and its submit path — real work the plan reduces to "locate the sheet's action area during implementation".
- **Failure scenario:** Implementer follows the plan's file list, wires the new `contactId` flow only into `create-deal-sheet.tsx`, and either (a) discovers mid-implementation that the record-sheet surface is a different component with an incompatible required prop, re-planning under time pressure, or (b) bolts a parallel one-off create form onto the contact sheet — exactly the parallel-reimplementation failure mode this codebase's rules prohibit. Either way the "existing company-scoped behavior unchanged" requirement is now guarded by zero listed files for one of the two create paths.
- **Evidence:**
  - Caller enumeration (grep `deals.create`, non-generated, non-test): `apps/app/app/(app)/[slug]/deals/create-deal-sheet.tsx:97`, `apps/app/components/crm/record-sheet/quick-add.tsx:274` — 2 callers total
  - `apps/app/components/crm/record-sheet/quick-add.tsx:248-253` — `companyId: string` required prop; `:302` — submitted unconditionally
- **Suggested fix:** Add `quick-add.tsx` to Phase 3's Related Code Files with the concrete change: `companyId` prop becomes optional (or a `target: {companyId?} | {contactId?}` shape), submit path adjusted, and the contact-sheet action reuses this component rather than growing a sibling.

## Fact Checker verification table

| Claim (plan citation) | Verdict |
| --- | --- |
| P2: `deals.service.ts:238` hardcoded `"DEMO_BOOKED"` create default | VERIFIED (deals.service.ts:238) |
| P2: `deals.service.ts:84` LOSING set | VERIFIED (deals.service.ts:84) |
| P2: `accounts.ts:524-529` untyped `isOpen` raw strings | VERIFIED (accounts.ts:524-529) |
| P2: `lookup.ts:73` `won` → `CLOSED_WON` | VERIFIED (lookup.ts:73) |
| P2: `dashboard.service.ts:205,228` CLOSED_WON/CLOSED_LOST | VERIFIED (205, 228) |
| P2: `deals.contracts.ts:36` stageEnum from `Object.values(DealStage)` | VERIFIED (37-39) |
| P2: `rollup.service.ts:549` `deals_by_stage` | VERIFIED (547-550) |
| P2: `create-deal-sheet.tsx:78` initial `"DEMO_BOOKED"` | VERIFIED (~78) |
| P2: `stage-change.tsx:149,154`; `stage-stepper.tsx:17,40,65`; `deals-bulk-actions.tsx:156` | VERIFIED (all) |
| P2: `seed.ts:250-259,615-616,724-725`; 786 lines; PRNG 20260731 | VERIFIED |
| P2: preamble spec asserts literal `(CONTRACT_SENT)` | VERIFIED (preamble.integration.spec.ts:119,141) |
| P2: `agent-events.spec.ts:125` free-form `{from,to}` strings | VERIFIED (~125, `"NEGOTIATION"`) |
| P2: "timeline-entry.tsx:80 maps through dealStageLabelKey" | VERIFIED behavior at `components/crm/timeline/timeline-entry.tsx:78-82` (plan path lacks `timeline/` segment) |
| P2 risk: "timeline falls back to raw string render" | FAILED — `deal-stage.ts:55-57` throws TypeError on unknown stage |
| P2: "AgentEvent payloads carrying deal.stage.changed" | FAILED — store is `agentTask` (`agent-trigger.service.ts:451`); zero AgentEvent writers of that type |
| P2: enum has exactly the 7 mapped values | VERIFIED (schema.prisma:169-177) |
| P3: `schema.prisma:906-945` Deal model | VERIFIED (~906-945, `@@index([stage])` at 936) |
| P3: `deals.contracts.ts:41-56` create/update inputs | VERIFIED |
| P3: `create-deal-sheet.tsx:113` submit gate, `:56` companyId prop | VERIFIED (~112-113, ~56) |
| P3: docs/api.md — targets collected inside the transaction | VERIFIED (docs/api.md:226-231; companies.service.ts:409-423 order is correct) |
| P3: `blankToNull` convention | VERIFIED (`apps/api/src/crm/values.ts` via contacts.service.ts:24) |
| P3: dashboard `biggestOpen`/`recentActivity` include company | VERIFIED (dashboard.service.ts:147,163,260,282) |
| P3: "journey history survives org delete" | FAILED — Activity.companyId Cascade (schema.prisma:1089) destroys it |
| P1: 10 namespaces × 2 locales | VERIFIED (10 files in en/, en+vi dirs) |
| P1: comparator "app package's i18n:catalogs script" | FAILED — script is in ROOT package.json:14, not apps/app |
| P1: `ui-strings.ts` DEFAULT_UI_STRINGS; `crm-events.ts` labels; settings language keys | VERIFIED (ui-strings.ts:50; crm-events.ts:26; en/settings.json:222-224) |
| P4: pre-push hook runs full gates | VERIFIED (.githooks/pre-push: check-types, lint, test) |

## Contract Verifier

- `trpc.deals.create` callers: **2** — `create-deal-sheet.tsx:97`, `quick-add.tsx:274`. Plan lists 1. See Finding 8.
- `dealCreateInput.companyId` consumers: router `deals.router.ts:44-46` → `deals.service.create` (`:237-`). Optionality change flows through; service create path is in the plan's list.

## Issues

1. BROKEN — Phase 3 claim "journey history survives org delete" is false. `Activity.companyId` cascades.
   Fix: not done. Plan must add `Activity.companyId` SetNull + a survival test. (Finding 1)
2. BROKEN — Phase 2 backfill names `AgentEvent`. The events live in `agentTask.payload`, nested.
   Fix: not done. Rewrite step 4 against the real write sites; add `deal.closed/opened/created`. (Finding 2)
3. RISK — A missed backfill row crashes the timeline. The plan's claimed fallback does not exist.
   Fix: not done. Make `dealStageLabelKey` total; add a post-backfill count gate. (Finding 3)
4. RISK — Migration runs mid-build while old code serves. Previews and rollback break.
   Fix: not done. Pre-flight must decide, not confirm. (Finding 4)
5. RISK — Rollback snapshot covers deals only. JSON backfills are many-to-one and irreversible.
   Fix: not done. Snapshot all three stores; write the restore procedure. (Finding 5)
6. RISK — CASE has no ELSE over an UNKNOWN prod schema with a documented drift incident.
   Fix: not done. Pre-flight DISTINCT check + loud ELSE. (Finding 6)
7. RISK — Test DB never resets. Branch switch after the swap blocks every push.
   Fix: not done. Document the drop, or add reset to test-db.ts. (Finding 7)
8. NOT DONE — Second `deals.create` caller (`quick-add.tsx`) absent from Phase 3 file list.
   Fix: not done. Add it with the prop-loosening change. (Finding 8)

# Red-team plan review — security adversary — Phase A healthcare face

Reviewer: code-reviewer (staff-engineer red team, security adversary lens)
Date: 2026-08-13
Plan: `plans/260813-1843-healthcare-face-phase-a/`
Scope respected: 6-stage set, relabel-only, hard fork, minimal v1 are locked. All findings attack implementation soundness with new codebase evidence.

## Finding 1: Company delete wipes the surviving journey's entire timeline — the phase's core invariant is broken

- **Severity:** Critical
- **Location:** Phase 3, section "Architecture > Schema" and "Related Code Files"
- **Flaw:** The plan changes only `Deal.companyId` to `SetNull` and declares "Deleting an organization must not delete a client's journey history — the journey survives". But every timeline activity of a deal is stamped with the deal's `companyId`, and `Activity.company` is `onDelete: Cascade`. `AgentConversation.company` is also `Cascade`. The plan's migration list contains only the Deal FK.
- **Failure scenario:** Clinic deletes a referral-partner organization. The journey row survives with `companyId = null` — and the DB cascade simultaneously deletes every stage-change entry, note, call, and task on that journey, plus its agent conversations. The "surviving" journey is an empty shell. Phase 3's success criterion "correct `lastActivityAt`" then recomputes over a wiped table and stamps null, masking the loss.
- **Evidence:**
  - `packages/db/prisma/schema.prisma:1088-1089` — `Activity.company Company? ... onDelete: Cascade`
  - `packages/db/prisma/schema.prisma:513-514` — `AgentConversation.company ... onDelete: Cascade`
  - `apps/api/src/activities/activities.service.ts:126,137,220-227` — every deal activity resolves and stores the deal's `companyId`
  - `apps/api/src/deals/deals.service.ts:437` — stage-change activity created with `companyId: deal.companyId`
  - `apps/api/src/companies/companies.service.ts:404-427` — delete flow relies on these cascades
  - Phase 3 file list: only `schema.prisma:906-945` (Deal) + one deal-FK migration
- **Suggested fix:** Phase 3 must decide FK behavior for `Activity.companyId` and `AgentConversation.companyId` (SetNull for activities that still have a `dealId`/`contactId`, or reassignment in the delete transaction). `targetsOf` ordering alone cannot save data the DB cascade removes.

## Finding 2: The backfill-miss mitigation rests on a fallback that does not exist — timeline render throws

- **Severity:** High
- **Location:** Phase 2, section "Risk Assessment" ("timeline falls back to raw string render") and "Architecture > Migration SQL shape" step 4
- **Flaw:** `stageChange()` only checks the meta values are strings, then `dealStageLabelKey(change.from as never)` does `PRESENTATION[stage].labelKey` — an unmapped string yields `undefined.labelKey`, a TypeError. There is no raw-string fallback anywhere on this path.
- **Failure scenario:** The backfill misses one JSON shape (the exact risk the plan names — meta is free-form, proven by fixtures using `"NEGOTIATION"`). Post-migration, opening that deal/company sheet throws in the client component and the whole timeline fails to render — not one degraded row.
- **Evidence:**
  - `apps/app/components/crm/timeline/timeline-entry.tsx:29-33` — parser accepts any string
  - `apps/app/components/crm/timeline/timeline-entry.tsx:80-81` — `deals(dealStageLabelKey(change.from as never))`
  - `apps/app/lib/deal-stage.ts:55-57` — `return PRESENTATION[stage].labelKey;` — no guard
  - `apps/api/test/agent-events.spec.ts:125` — free-form `"NEGOTIATION"` proves unmapped strings occur
  - Contrast: `apps/app/components/agent-builder/deal-list-result.tsx:138-145,181` has a real fallback (`humaniseStage`); the timeline does not
- **Suggested fix:** Before the migration lands, give `dealStageLabelKey` (or the timeline call site) an explicit unknown-value fallback. Then the backfill-miss risk is actually the cosmetic degradation the plan claims.

## Finding 3: Phase 3's "follow the compiler" safety net has enumerable holes the plan does not name

- **Severity:** High
- **Location:** Phase 3, section "Implementation Steps" step 1 ("every `deal.company` access that stops compiling is the null-safety worklist")
- **Flaw:** Phase 2 explicitly flags its compiler-invisible sites; Phase 3 claims the compiler is the worklist and flags none. At least two classes escape it: (a) the `setStage` `$queryRaw` result is hand-asserted as `companyId: string` — after the schema change it is silently `string | null` at runtime; (b) scalar `deal.companyId` used in Prisma `where` clauses keeps compiling while its meaning flips: `where: { companyId: null }` filters `companyId IS NULL`.
- **Failure scenario:** For (b): the plan does list `contactOptions` as a modify target, but nothing forces the change — the file compiles clean after Phase 3 and a reviewer trusting "the compiler is the net" ships a picker that, for org-less journeys, offers only contacts who themselves have no organization instead of "all contacts" as specified. For (a): `deal.companyId` null flows through the raw-SQL type lie into emit payloads and `stamp.touch` with no compile error; today's downstream happens to tolerate null, but nothing marks this site for the implementer.
- **Evidence:**
  - `apps/api/src/deals/deals.service.ts:390-392` — `tx.$queryRaw<Array<{ id: string; stage: DealStage; companyId: string }>>`
  - `apps/api/src/deals/deals.service.ts:433,443,451,463,479` — that value fans out into activity create, event payloads, `stamp.touch`
  - `apps/api/src/deals/deals.service.ts:491-509` — `contactOptions` `where: { companyId: deal.companyId }` compiles unchanged with null
  - Phase 2 names its untyped sites (`accounts.ts`, `deals.service.ts:238`); Phase 3 names none
- **Suggested fix:** Phase 3 must carry its own compiler-invisible list: the `$queryRaw` cast at `deals.service.ts:390` and every scalar `companyId` `where`/payload use. Grep `companyId` in `deals.service.ts` is the checklist, not tsc.

## Finding 4: The migration only auto-applies when `VERCEL_ENV === "production"` — on the fork's deploy target it may never run

- **Severity:** High
- **Location:** Phase 2, section "Risk Assessment" (preview-deploy risk) and "Pre-flight gate"
- **Flaw:** The plan treats the deploy question as "confirm which databases exist" and notes previews lack the new enum. The stronger fact: migration application itself is gated on Vercel's env var. The fork's infrastructure is Cloudflare-flavored (plan itself says "Fork deploy target (Cloudflare) to be confirmed"). On any non-Vercel target the gate never fires, `prisma migrate deploy` never runs, and the release deploy ships new code against the old enum — production-wide, not preview-only.
- **Failure scenario:** Release merges. Deploy succeeds (the gate silently skips: "skipping migrations, only production applies them"). Every deals query now sends `'INQUIRY'`/`'ENROLLED'` to a Postgres enum that has neither value — `invalid input value for enum "DealStage"` on the deals table, dashboard, create sheet, and agent lookups. The app is down for its core object while the build log claims success.
- **Evidence:**
  - `apps/api/scripts/build-func.mjs:167` — `const isProductionDeployment = process.env.VERCEL_ENV === "production";`
  - `apps/api/scripts/build-func.mjs:180,188-189` — skip message and the gated `prisma migrate deploy`
  - `docs/setup.md:100-115` — "Migrations run on the production deploy, and nowhere else"; shared `DATABASE_URL` across all envs
- **Suggested fix:** Promote "how does the migration reach the fork's production DB" from a pre-flight footnote to a named deliverable of Phase 2 with its own acceptance criterion. If the target is not Vercel, the plan must specify the manual `migrate deploy` step and its ordering relative to the code deploy.

## Finding 5: AgentEvent backfill scope misses three of the four stage-carrying event types

- **Severity:** Medium
- **Location:** Phase 2, section "Architecture > Migration SQL shape" step 4
- **Flaw:** The backfill names only `deal.stage.changed` payloads. `deal.closed` and `deal.opened` also carry `{from, to}` stage strings, and `deal.created` carries `{stage}` — all written by the same service.
- **Failure scenario:** Post-migration, builder replay (`agentEvent.findUnique` feeding recorded events back into agent-builder runs) and any payload inspection surface `CLOSED_WON`/`DEMO_BOOKED` — values that no longer exist in the enum — while `deal.stage.changed` rows show new values. The stated goal "backfill stage strings stored in AgentEvent payloads" is silently three-quarters unmet.
- **Evidence:**
  - `apps/api/src/deals/deals.service.ts:268-279` — `deal.created` `data: { companyId, stage }`; `deal.closed` `data: { ..., from: null, to: stage }`
  - `apps/api/src/deals/deals.service.ts:447-471` — `deal.closed` and `deal.opened` with `{from, to}`
  - `apps/agent/agent/lib/builder-input.ts:40,51` — recorded events are replayed
- **Suggested fix:** Backfill `WHERE type IN ('deal.stage.changed','deal.closed','deal.opened')` for `{from,to}` and `'deal.created'` for `{stage}`, or state explicitly that only `deal.stage.changed` is worth rewriting and why.

## Finding 6: "Reversible by documented mapping" is false — the mapping is many-to-one and the snapshot covers only `deal.stage`

- **Severity:** Medium
- **Location:** Phase 2, sections "Requirements > Non-functional" and "Pre-flight gate"
- **Flaw:** Four of seven old values collapse into two new ones (`QUALIFIED_TO_BUY` + `DECISION_MAKER_BOUGHT_IN` → `CONSULT_DONE`; `CLOSED_LOST` + `UNQUALIFIED_TO_BUY` → `LOST`). A mapping cannot reverse a fold. The pre-flight snapshot is `SELECT id, stage FROM deal` — it covers deal rows only. The same lossy fold is applied to `Activity.meta` blobs and `AgentEvent` payloads, for which no snapshot is taken; those rewrites are unrecoverable.
- **Failure scenario:** Migration lands, a problem forces rollback. Deal rows restore from the snapshot. Every backfilled `{from, to}` in Activity meta and AgentEvent payloads stays collapsed — historical stage-change entries now disagree with the restored deal states, permanently.
- **Evidence:**
  - Phase 2 mapping table (four-into-two fold) vs. requirement text "reversible by documented mapping"
  - Pre-flight text: snapshot scope is `SELECT id, stage FROM deal` only
  - `apps/api/src/deals/deals.service.ts:437` — meta `{from, to}` is data the backfill rewrites and the snapshot ignores
- **Suggested fix:** Either widen the snapshot (`activity` rows `WHERE type = 'STAGE_CHANGE'` + stage-carrying `agentEvent` rows), or change the requirement wording to "forward-only; snapshot restores deal rows only".

## Finding 7: Phase 3 plans a "None" option for a company facet that does not exist

- **Severity:** Medium
- **Location:** Phase 3, section "Related Code Files" (`deals-table.tsx` — "company facet includes 'None'")
- **Flaw:** The deals table has exactly three facets — owner, stage, closing — and `dealListInput` carries exactly those three filter fields. There is no company facet to add "None" to. Making one is a new contract surface: `dealListInput`, `buildWhere`, `facetCounts` aggregation, UI — none of it scoped, none in the success criteria.
- **Failure scenario:** Implementer either silently drops the line (org-less journeys are then reachable only by scrolling) or builds an unscoped facet mid-phase — contract change, `trpc:generate`, count queries — inside a phase estimated without it.
- **Evidence:**
  - `apps/app/app/(app)/[slug]/deals/deals-table.tsx:153-176` — facets: owner, stage, closing only
  - `apps/api/src/deals/deals.contracts.ts:29-32` — `dealListInput`: `owner`, `stage`, `closing`
- **Suggested fix:** Either scope the company facet as an explicit deliverable (contract + counts + UI) or delete the claim and state how org-less journeys are found.

## Finding 8: "Attaches the contact on create" has no backend pathway in the plan's contract list

- **Severity:** Medium
- **Location:** Phase 3, sections "Contracts" and "Related Code Files" (create-deal-sheet `contactId` prop)
- **Flaw:** The Contracts section changes only `companyId` optionality. `dealCreateInput` has no `contactId`; `create()` never writes `DealContact`. The promised behavior therefore requires either an unlisted contract field plus a transactional attach, or a client-side create-then-attach pair.
- **Failure scenario:** Implementer takes the only path the plan permits: two sequential mutations. The attach fails (network, validation) after create succeeds — result is a journey with no organization AND no client, precisely the orphan the client-first model exists to prevent, discoverable only via the table (see Finding 7). Note the second call is only legal because of the new null-company attach rule; for a deal created with an organization pre-filled from a client of a different organization, `attachContact` still rejects — the UI pairing "companyId pre-fill + contactId pre-fill" can produce a guaranteed-failing second call.
- **Evidence:**
  - `apps/api/src/deals/deals.contracts.ts:41-49` — `dealCreateInput`: no `contactId`
  - `apps/api/src/deals/deals.service.ts:252-266` — create writes `deal` only, no `DealContact`
  - `apps/api/src/deals/deals.service.ts:512-530` — attach is a separate mutation with the company-match guard
- **Suggested fix:** Add `contactId` to `dealCreateInput` and attach inside `withCrmEvents` in `create()`, or explicitly accept the two-call flow and define the failure UX and the org+contact mismatch case.

## Finding 9: Phase 1's ICU-restructure allowance can break the inline relative-time script, which does not speak ICU

- **Severity:** Medium
- **Location:** Phase 1, section "Terminology map" (vi note: "Plural/ICU messages restructure where vi needs it — restructure means touching both")
- **Flaw:** `common.json` `relativeTime*` values bypass next-intl formatting: the hydrator reads them with `t.raw()` and inlines them into a script whose `p()` helper does literal `split("{count}")/join` substitution. The plan hands all of `common.json` (72 hits) to a haiku agent and explicitly permits en+vi ICU restructures, which the comparator will approve as long as both locales change. A `relativeTime*` value restructured to real ICU plural syntax passes every gate and renders as literal ICU source text in every timestamp.
- **Failure scenario:** vi plural restructure touches `relativeTimeMinutes` in both locales ("{count, plural, other {# phút trước}}"). `i18n:check`, comparator, `check-types` all green. Every relative timestamp in the app renders the raw ICU string. Injection, for completeness, is foreclosed: `scriptJson` is `JSON.stringify` + `<`→`<` and the sink is `textContent` — a hostile catalog value cannot escape the script context (verified, not a finding).
- **Evidence:**
  - `apps/app/components/local-date-time-hydrator.tsx:12` — `localDateTimeLabels((key) => t.raw(key) as string)`
  - `apps/app/lib/local-date-time-script.ts:41` — `p=function(m,k,v){return m.split("{"+k+"}").join(v)}` (no ICU)
  - `apps/app/lib/local-date-time-script.ts:34-36` — `scriptJson` escaping (injection foreclosed)
  - `apps/app/messages/en/common.json:174` — `relativeTime*` lives in a batch the skill rewrites
- **Suggested fix:** Add `relativeTime*` (and any other `t.raw`-consumed keys) to the skill's never-restructure list next to the `general.language*` endonyms; the gates cannot catch this class.

## Fact Checker verification table

| Plan claim | Verdict |
| --- | --- |
| P1: 10 namespaces × 2 locales in `apps/app/messages/{en,vi}` | VERIFIED (dir listing, 10+10 files) |
| P1: `ui-strings.ts` `DEFAULT_UI_STRINGS` mirrors `en/ui.json` | VERIFIED (packages/ui/src/lib/ui-strings.ts:1-40, en/ui.json) |
| P1: `crm-events.ts` labels "Deal stage changed" etc. | VERIFIED (packages/db/src/crm-events.ts:20-39) |
| P1: comparator script path `apps/app/scripts/i18n/catalogs.ts` | VERIFIED (file exists; script is in ROOT package.json:14, not the app package as the plan says) |
| P1: `VI_MESSAGES: typeof EN_MESSAGES` parity | VERIFIED (apps/app/i18n/request.ts:42) |
| P2: `deals.service.ts:238` hardcoded `"DEMO_BOOKED"` | VERIFIED (deals.service.ts:238) |
| P2: `deals.service.ts:84` LOSING set | VERIFIED (deals.service.ts:84) |
| P2: `accounts.ts:524-529` untyped stage strings | VERIFIED (accounts.ts:526-528) |
| P2: `lookup.ts:73` `CLOSED_WON` | VERIFIED (lookup.ts:73) |
| P2: `dashboard.service.ts:205,228` | VERIFIED (205, 228) |
| P2: `create-deal-sheet.tsx:78` initial stage | VERIFIED (line 78) |
| P2: `stage-change.tsx:149,154`; `stage-stepper.tsx:17,40,65`; `deals-bulk-actions.tsx:156` | VERIFIED (all lines) |
| P2: `seed.ts:250-259,615-616,724-725`; 786 lines; PRNG `20260731` | VERIFIED (wc -l = 786; seed.ts:22,250-259,615-616,724-725) |
| P2: `deals.contracts.ts:36` stageEnum | VERIFIED (lines 37-39; off by one) |
| P2: `rollup.service.ts:549` `deals_by_stage` | VERIFIED (lines 547-550) |
| P2: `timeline-entry.tsx:80` maps meta through `dealStageLabelKey` | VERIFIED (apps/app/components/crm/timeline/timeline-entry.tsx:80 — note path is `crm/timeline/`, not `crm/`) |
| P2: "timeline falls back to raw string render" | FAILED — no fallback; `PRESENTATION[stage].labelKey` throws (deal-stage.ts:55-57; Finding 2) |
| P2: `agent-events.spec.ts:125` free-form `{from,to}` | VERIFIED (line 125: `from: "NEGOTIATION"`) |
| P2: preamble spec asserts literal `(CONTRACT_SENT)` | VERIFIED (preamble.integration.spec.ts:119,141) |
| P2: migration convention `YYYYMMDDHHMMSS_snake_case` | VERIFIED (packages/db/prisma/migrations listing) |
| P2: enum used only by `deal.stage` | VERIFIED (schema grep: schema.prisma:916 only) |
| P3: `schema.prisma:906-945` Deal model, `onDelete: Cascade` | VERIFIED (906, 912) |
| P3: `deals.contracts.ts:41-56` create/update inputs | VERIFIED (43: create companyId required; 56: update companyId optional, not nullable) |
| P3: dashboard `biggestOpen`/`recentActivity` include company | VERIFIED (dashboard.service.ts:122,147,163,260,282) |
| P3: create-deal-sheet lines 56 (companyId prop) and 113 (submit gate) | VERIFIED (both) |
| P3: contacts survive company delete ("SetNull" precedent) | VERIFIED (schema.prisma:370) |
| P3: deals-table "company facet" | FAILED — no company facet exists (deals-table.tsx:153-176; Finding 7) |
| P3: "collect targets inside the transaction" doc behavior | VERIFIED (companies.service.ts:408-421) |
| P4: seed structure / data-table line ranges ~48-314 | VERIFIED (stage pools at 250-259 within range) |
| Adversary brief: catalog-value injection via `local-date-time-script.ts` | VERIFIED SAFE — `scriptJson` escapes, sink is `textContent` (local-date-time-script.ts:34-36,41; Finding 9 covers the non-injection breakage) |

## Contract Verifier enumerations

- `deals.create` callers: 2 UI (`create-deal-sheet.tsx:97`, `record-sheet/quick-add.tsx:274`) + router (`deals.router.ts:46`). Plan lists only `create-deal-sheet`; `quick-add`'s `QuickAddDeal` always passes `companyId` — unaffected, but unlisted.
- `deals.contactOptions` callers: 1 UI (`quick-add.tsx:178`) + cache invalidation (`lib/trpc/cache.ts:167,177`) + router (`deals.router.ts:68`). `AttachDealContact` takes `companyName: string` for its empty-state placeholder (`quick-add.tsx:160-165,203`) — its caller passes `deal.company.name`; nullable type will flag the caller, but the placeholder copy needs a null-company variant the plan does not mention.
- `deals.attachContact` callers: 1 UI (`quick-add.tsx:182`) + router (`deals.router.ts:73`). None in `apps/agent`.
- `DealStage` literal consumers (non-test, non-generated): 13 files — exactly matches the Phase 2 list (grep table in Finding evidence). Test files with literals: 8 (`agent-transcript`, `lookup`, `preamble`, `durable-agent-runtime`, `accounts` integration specs; api `bulk`, `currency-totals`, `agent-events`) — plan lists all 8; found no separate "e2e" spec containing stage literals.
- Agent trigger/dispatch/manifest: zero stage-value dependencies (grep `stage` in `custom-agent-dispatch.ts`, `schedules/dispatch.ts`, `agent-manifest.ts` = 0 hits) — the plan's claim that dispatch is unaffected holds.

## Issues

1. BROKEN (if shipped as planned) — Company delete cascades erase surviving journeys' timelines. Finding 1.
   Fix: change `Activity`/`AgentConversation` company FKs in Phase 3.
2. BROKEN (if shipped as planned) — A missed meta backfill crashes the timeline; the plan's fallback claim is false. Finding 2.
   Fix: add an unknown-stage fallback before migrating.
3. RISK — Migration auto-apply is Vercel-gated; the fork's target can skip it in production. Finding 4.
   Fix: make deploy mechanism a Phase 2 deliverable.
4. RISK — Phase 3 compiler net misses `$queryRaw` cast and scalar `companyId` where-clauses. Finding 3.
   Fix: add an explicit non-compiler worklist to Phase 3.
5. NOT DONE — AgentEvent backfill covers 1 of 4 stage-carrying event types. Finding 5.
6. NOT DONE — Rollback snapshot omits Activity meta and AgentEvent payloads; fold is irreversible. Finding 6.
7. NOT DONE — Company facet "None" targets a facet that does not exist. Finding 7.
8. NOT DONE — Create-from-client attach has no backend contract; two-call flow is non-atomic. Finding 8.
9. RISK — ICU restructure of `t.raw`-consumed `relativeTime*` keys passes all gates and breaks timestamps. Finding 9.

Status: DONE

# Red-team plan review: Healthcare Face Phase A (assumption destroyer)

Reviewer: code-reviewer. Date: 2026-08-13. Tree verified in sync with origin/dev (e835e19).
All claims below are grep-verified against the working tree.

## Finding 1: Company delete cascades away the surviving journey's history

- **Severity:** Critical
- **Location:** Phase 3, section "Architecture > Schema" and "Service invariants"
- **Flaw:** The plan changes `Deal.companyId` to `SetNull` so "deleting an organization must not delete a client's journey history — the journey survives." The journey ROW survives. Its history does not. `Activity.company` is `onDelete: Cascade`, and every stage-change activity is stamped with `companyId: deal.companyId` at write time. The plan handles recompute ordering but never mentions the Activity cascade.
- **Failure scenario:** User deletes an organization. Its journeys survive with `companyId = null` — and every STAGE_CHANGE activity, note, call, and task stamped with that companyId is deleted by the FK cascade. The surviving journey opens to an empty timeline and `lastActivityAt = null`. The stated product rationale is defeated by an FK one hop away. Phase 3's success criterion "correct `lastActivityAt`" passes vacuously (recompute of nothing).
- **Evidence:** packages/db/prisma/schema.prisma Activity model (`company Company? @relation(... onDelete: Cascade)`, plus contact and deal Cascade on same model); apps/api/src/deals/deals.service.ts:427-437 (`tx.activity.create({ ... companyId: deal.companyId, dealId: deal.id, meta: { from, to } })`); apps/api/src/companies/companies.service.ts:409-424 (targets collected, then `tx.company.delete`).
- **Suggested fix:** Phase 3 must decide: also flip `Activity.companyId` to `SetNull` (with recompute of surviving deal/contact stamps), or re-stamp deal-anchored activities to `companyId = null` before delete. Either way it is a schema + migration + recompute change the plan currently does not list.

## Finding 2: Create-from-client cites a UI pattern that does not exist and needs unlisted API surface

- **Severity:** Critical
- **Location:** Phase 3, sections "Contracts" and "Related Code Files" (create sheet / contact sheet bullets)
- **Flaw:** Three factual failures stack. (a) `dealCreateInput` has no `contactId`; `attachContact` is a separate mutation with a company-scope invariant. The contracts section changes only `companyId`. (b) "mirrors the existing `companyId` pre-fill prop, line 56" — the prop exists but has ZERO callers; the only `CreateDealSheet` usage is `<CreateDealSheet />` with no props. (c) "follow the pattern the company sheet uses to open the create-deal sheet" — the company sheet never opens the create-deal sheet; it renders an inline `QuickAddDeal` form that calls `trpc.deals.create` directly.
- **Failure scenario:** Implementer reaches the contact-sheet task, finds no pattern to follow, and must invent one of: (1) new `contactId` field on `dealCreateInput` + attach inside the create transaction — new API surface the plan never lists; or (2) client-side chain `deals.create` → `deals.attachContact` — two mutations where failure of the second leaves a journey created without its client, with no rollback. The phase's headline success criterion ("created ... from a client record" with client pre-attached) is unimplementable as specified.
- **Evidence:** apps/api/src/deals/deals.contracts.ts:40-48 (create input fields: name, companyId, ownerId, stage, amountCents, currency, expectedCloseDate — no contactId); apps/api/src/deals/deals.service.ts:512-548 (attachContact separate, company invariant at 523-527); grep "CreateDealSheet" → sole caller apps/app/app/(app)/[slug]/deals/page.tsx:39; apps/app/components/crm/record-sheet/company-sheet.tsx:64,121,181-182 (QuickAddDeal inline); apps/app/components/crm/record-sheet/quick-add.tsx:247,274 (`trpc.deals.create`).
- **Suggested fix:** Pick the design in the plan: add `contactId` to `dealCreateInput` + transactional attach in `deals.service.create` (list contract, generated server.ts, service, and test changes), and replace the "company sheet pattern" bullet with a `QuickAddDeal`-style inline form or an explicit new sheet wiring.

## Finding 3: The timeline fallback the migration relies on does not exist — unmapped stage meta crashes the render

- **Severity:** High
- **Location:** Phase 2, sections "Migration SQL shape" (step 4) and "Risk Assessment" (Activity/AgentEvent backfill risk)
- **Flaw:** The plan's mitigation for a missed backfill row is "timeline falls back to raw string render (verify during step 2)". False. `dealStageLabelKey(stage)` is `PRESENTATION[stage].labelKey` with no guard, and timeline-entry feeds it raw meta strings through `as never` casts, blinding the compiler. `PRESENTATION[unknownString]` is `undefined`; `.labelKey` throws TypeError in a client component.
- **Failure scenario:** After Phase 2 replaces `PRESENTATION` with the six new stages, ANY Activity meta `{from, to}` holding an old or free-form value — one row missed by the JSON backfill, or a free-form value like "NEGOTIATION" which the repo's own fixtures prove is legal — throws during render. The whole timeline for that record crashes for every viewer. The plan's own step 6 insists meta is free-form and must stay free-form, which makes the no-fallback lookup a standing landmine, not just a migration-window risk.
- **Evidence:** apps/app/lib/deal-stage.ts:55-57 (`return PRESENTATION[stage].labelKey;` — no fallback); apps/app/components/crm/timeline/timeline-entry.tsx:29-33 (loose meta parse), 80-81 (`dealStageLabelKey(change.from as never)`); free-form proof: apps/api/test/agent-events.spec.ts:125, apps/agent/test/durable-agent-runtime.integration.spec.ts:236.
- **Suggested fix:** Make the guard a Phase 2 code change, not a hoped-for behavior: `dealStageLabelKey` (or the timeline call site) returns the raw string when the stage is not in `PRESENTATION`. Land it BEFORE the data migration.

## Finding 4: Backfill spec covers one of four event payload shapes carrying stage strings

- **Severity:** Medium
- **Location:** Phase 2, section "Migration SQL shape", step 4
- **Flaw:** The plan backfills `Activity` meta and "`AgentEvent` payloads carrying `deal.stage.changed` `{from, to}`". Three more persisted payload shapes carry stage strings: `deal.created` `{stage}`, `deal.closed` `{from, to}` (emitted both at create and at setStage), `deal.opened` `{from, to}`.
- **Failure scenario:** Migration runs as written. Old `deal.created`/`deal.closed`/`deal.opened` AgentEvent rows keep `DEMO_BOOKED`/`CLOSED_WON` strings. Agent context assembled from event history mixes two vocabularies; the Phase 2 success criterion "grep = 0 hits" is about source only, so nothing detects the stale data.
- **Evidence:** apps/api/src/deals/deals.service.ts:267-272 (`deal.created`, `data: { companyId, stage }`), 273-280 (`deal.closed` at create, `{from: null, to: stage}`), 440-444 (`deal.stage.changed`), 445-451 (`deal.closed`), 458-462 (`deal.opened`); fixture confirming stored shape: apps/agent/test/e2e/load.e2e.ts:165.
- **Suggested fix:** Enumerate all four event types in the backfill UPDATE, keyed by payload field (`stage` vs `from`/`to`).

## Finding 5: Six `stage*` catalog keys are owned by neither phase — "Deal closed." toast survives the whole plan

- **Severity:** High
- **Location:** Phase 1, "Architecture" step 3 + Implementation step 5; Phase 2, "Related Code Files" (deals.json bullet)
- **Flaw:** en/deals.json has 17 `stage*` keys. Phase 1 orders haiku agents to skip ALL `stage*` keys and its leftover grep pipes through `grep -v stage`. Phase 2 enumerates 7 label keys to replace plus 4 to keep-with-updated-values (`stageAllTabLabel`, `stageOpenOption`, `stageClosedOption`, `stageHelp`). Six keys are in nobody's list: `stageChangeHeadline`, `stageChangeReasonPlaceholder`, `stageClosedToast`, `stageLabel`, `stageSection`, `stageUpdatedToast`.
- **Failure scenario:** Both phases complete, all listed gates green. A demo user closes a journey and the toast reads "Deal closed." The lost-reason placeholder reads "Went with an incumbent vendor" — B2B sales flavor in the flagship healthcare flow. This directly violates plan.md acceptance criterion 1, and no gate can catch it: Phase 1's sweep excludes `stage`, Phase 2's grep targets enum names, the pseudo walk detects hardcoded strings, not vocabulary.
- **Evidence:** apps/app/messages/en/deals.json values: `"stageClosedToast": "Deal closed."`, `"stageChangeReasonPlaceholder": "Went with an incumbent vendor"` (full 17-key list via `grep -o '"stage[A-Za-z]*"'`); phase-01 step 5 (`| grep -v stage`); phase-02 Related Code Files deals.json bullet (7 + 4 enumeration).
- **Suggested fix:** Phase 2's deals.json bullet must say "audit every `stage*` key value", or Phase 1's skip rule must narrow to the 7 label keys only.

## Finding 6: Phase 3's compiler net has a hole (raw SQL) and no design for the company-anchored agent context

- **Severity:** High
- **Location:** Phase 3, "Implementation Steps" step 1 and "Related Code Files"
- **Flaw:** "follow the compiler: every `deal.company` access that stops compiling is the null-safety worklist" overclaims twice. (a) `setStage` reads the deal via `$queryRaw` with a hand-written type `{ companyId: string }` — a cast, never checked; after the schema change it silently lies and `null` flows into the activity stamp and event payloads without any compile error. Phase 2 lists its two untyped sites; Phase 3 lists none. (b) The phase's file list omits `apps/agent` entirely, yet the agent's deal context is company-anchored throughout — `deal.company.id` at accounts.ts:386 and a whole context builder keyed on `companyId`. The compiler WILL stop there (agent runs `tsc --noEmit`), and the plan gives zero direction on what the Agent tab shows for an org-less journey; the naive early-return silently guts the agent panel for exactly the journeys this phase introduces.
- **Failure scenario:** (a) Org-less journey gets a stage change; raw-SQL row has `companyId: null` typed as `string`; no compile error anywhere; event payload `companyId: null` ships to consumers written against strings. (b) Implementer hits the accounts.ts compile error mid-phase with no accepted design, invents one under deadline, and the flagship "client-first journey" ships with a dead Agent tab that no listed test covers.
- **Evidence:** apps/api/src/deals/deals.service.ts:389-396 (`tx.$queryRaw<Array<{ id: string; stage: DealStage; companyId: string }>>`), 432, 440-444 (null flows to activity + emit); apps/agent/agent/lib/accounts.ts:88-146 (context keyed on companyId), 380-389 (`deal.company.id` twice); apps/agent/package.json:15 (`"check-types": "tsc --noEmit"`); phase-03 Related Code Files (no apps/agent entry).
- **Suggested fix:** Add the raw-SQL site to an explicit untyped-site list; add an `apps/agent` bullet with the decided behavior for null-company deals (e.g., contact-anchored context or explicit "no account context" copy).

## Finding 7: Phase 2's grep gate contradicts its own fixture instruction

- **Severity:** Medium
- **Location:** Phase 2, "Implementation Steps" step 6 vs "Success Criteria" bullet 4
- **Flaw:** Step 6: "`NEGOTIATION` free-form strings in event fixtures stay — do not 'fix' them to enum values." Success criterion: "grep `CLOSED_WON\|DEMO_BOOKED\|CONTRACT_SENT` = 0 hits [in apps/agent] outside migrations." The NEGOTIATION fixtures pair `from: "NEGOTIATION"` with `to: "CLOSED_WON"` — keeping them per step 6 makes the grep gate fail; passing the gate requires editing them against step 6.
- **Failure scenario:** Implementer hits the contradiction at gate time and resolves it silently — most likely by rewriting the fixtures to enum values, destroying the free-form-meta proof the plan says those tests exist to provide (which Finding 3 shows is a live production behavior, not a test nicety).
- **Evidence:** apps/agent/test/durable-agent-runtime.integration.spec.ts:236,258 (`data: { from: "NEGOTIATION", to: "CLOSED_WON" }`); phase-02 step 6 and success criterion 4 text.
- **Suggested fix:** Change the criterion to exclude free-form event-fixture pairs, e.g. grep for the enum names only in non-test agent source, or swap the fixture's `to` value to another free-form string as part of step 6.

## Finding 8: Phase 1's verification is one-sided and rests on two false scout facts

- **Severity:** Medium
- **Location:** Phase 1, "Overview" (scout facts), Implementation steps 3 and 7, "Risk Assessment"
- **Flaw:** Three verified errors. (a) "run via the app package's i18n:catalogs script" — apps/app has no such script; `i18n:catalogs` lives in the ROOT package.json. (b) "ui.json 3 [hits]" and the `DEFAULT_UI_STRINGS` sync step: en/ui.json and ui-strings.ts contain zero deal/company/contact/prospect/lead vocabulary — step 3 is a no-op built on a false count. The only term-map-adjacent value is `"close": "Close"` (a dialog button), which the term map's "close (a deal) → convert, context-judged" rule actively invites a haiku agent to mangle. (c) The keep-list's flagship example, "Contact support" stays, matches no string in any en catalog. Structurally: every listed gate (comparator, `grep deal|company|contact|...`) detects only UNDER-replacement (old words remaining). Nothing detects WRONG replacement — "Client support"-style semantic damage across 431 agent-panel keys × 2 locales passes every gate.
- **Failure scenario:** Haiku rewrites a `Close` button to "Convert" or over-applies "Client" in agent-panel copy. Comparator green (structure unchanged), grep green (no old vocabulary), check-types green. The damage surfaces first in the Phase 4 manual walk — or in a demo.
- **Evidence:** package.json root scripts (`"i18n:catalogs": "bun apps/app/scripts/i18n/catalogs.ts"`) vs apps/app/package.json scripts block (dev/build/start/typegen/check-types/test/lint only); apps/app/messages/en/ui.json (full value list, no sales vocabulary); packages/ui/src/lib/ui-strings.ts (same); `grep -rn "Contact support" apps/app/messages/en/*.json` = 0 hits; `grep -c '":' apps/app/messages/en/agent-panel.json` = 431.
- **Suggested fix:** Fix the script pointer; delete step 3 or reword it as a verify-only check; rebuild the keep-list from strings that exist; add a diff-review step per namespace (human or a second-pass agent diffing old→new values against the term map) so over-replacement has a detector.

## Fact Checker verification table

| Claim (phase) | Verdict |
| --- | --- |
| P1: `i18n:catalogs` is an app-package script | FAILED — root package.json script; absent from apps/app/package.json |
| P1: apps/app/scripts/i18n/catalogs.ts exists | VERIFIED (imports pseudo.ts) |
| P1: ui.json carries 3 sales-vocab hits; DEFAULT_UI_STRINGS needs relabel | FAILED — zero hits in en/ui.json and packages/ui/src/lib/ui-strings.ts |
| P1: "Contact support" keep-list example exists in catalogs | FAILED — 0 grep hits |
| P1: 10 namespaces × 2 locales | VERIFIED (ls messages/en, messages/vi) |
| P1: `VI_MESSAGES: typeof EN_MESSAGES` parity | VERIFIED (apps/app/i18n/request.ts:42) |
| P1: crm-events.ts labels ("Deal stage changed") | VERIFIED (packages/db/src/crm-events.ts:26) |
| P1: standard-fields.ts labels are catalog keys | UNVERIFIED (not sampled) |
| P2: deals.contracts.ts:36 `stageEnum` from `Object.values(DealStage)` | VERIFIED (36-38) |
| P2: stageEnum "auto-adapts" without trpc:generate | VERIFIED — generated/server.ts imports contracts (line 23) and types outputs via `ReturnType<DealsRouter[...]>` (line 40, 264ff); nothing baked |
| P2: deals.service.ts:238 `"DEMO_BOOKED"` default; line 84 LOSING set | VERIFIED |
| P2: dashboard.service.ts:205,228 CLOSED_WON/CLOSED_LOST | VERIFIED |
| P2: accounts.ts:524-529 untyped isOpen | VERIFIED (524-529) |
| P2: lookup.ts:73 `[DealStage.CLOSED_WON]` | VERIFIED |
| P2: rollup.service.ts:549 `deals_by_stage` | VERIFIED (547-550) |
| P2: timeline-entry.tsx:80 maps via dealStageLabelKey | VERIFIED (components/crm/timeline/timeline-entry.tsx:80-81) |
| P2: "timeline falls back to raw string render" | FAILED — no fallback; `PRESENTATION[stage].labelKey` throws (apps/app/lib/deal-stage.ts:55-57) |
| P2: create-deal-sheet.tsx:78; stage-change.tsx:149,154; stage-stepper.tsx:17,40,65; deals-bulk-actions.tsx:156 | VERIFIED (all exact) |
| P2: seed.ts:250-259,615-616,724-725; 786 lines; PRNG 20260731 | VERIFIED |
| P2: agent-events.spec.ts:125 free-form NEGOTIATION | VERIFIED |
| P2: preamble spec asserts literal `(CONTRACT_SENT)` | VERIFIED (preamble.integration.spec.ts:119,141) |
| P2: migration naming convention | VERIFIED (e.g. 20260811212311_slack_install_cancel_delivery_task_subject) |
| P2: preview deploys share production DB (docs/setup.md) | VERIFIED (docs/setup.md:108) |
| P3: schema.prisma:906-945 Deal model; :916 default | VERIFIED |
| P3: dealCreateInput.companyId required w/ message; update already optional | VERIFIED (deals.contracts.ts:41-56) |
| P3: create-sheet companyId prop "mirrors existing pattern" (line 56) | FAILED as pattern — prop exists (line 56) but has zero callers; sole usage `<CreateDealSheet />` at deals/page.tsx:39 |
| P3: company sheet "opens the create-deal sheet" | FAILED — inline QuickAddDeal form (company-sheet.tsx:64,181-182; quick-add.tsx:247,274) |
| P3: deals.create accepts a contact at create time | FAILED — no contactId in dealCreateInput; attachContact separate (deals.service.ts:512) |
| P3: targetsOf collected in-transaction before delete | VERIFIED (companies.service.ts:409-424; activity-stamp.service.ts:89-104) |
| P3: contactOptions company-scoped; attachContact company invariant | VERIFIED (deals.service.ts:491-503, 523-527) |
| P3: dashboard biggestOpen/recentActivity include company non-optionally | VERIFIED (dashboard.service.ts:122,147,163) |
| P4: pseudo locale runnable (`i18n:pseudo`, served locale) | VERIFIED (root script; i18n/request.ts PSEUDO_LOCALE branch) |
| P4: `bun run db:reset && db:seed` exist | VERIFIED (root package.json) |

## Issues

1. BROKEN — Phase 3 as written deletes journey history on org delete. Activity.company cascades.
   Fix: not done. Plan must add an Activity FK decision (Finding 1).
2. BROKEN — Phase 3 create-from-client has no API path and cites a nonexistent UI pattern.
   Fix: not done. Plan must add contactId to the create contract or design the chained flow (Finding 2).
3. RISK — Unmapped stage meta crashes the timeline. The fallback the plan cites does not exist.
   Fix: not done. Add a fallback in dealStageLabelKey before the migration (Finding 3).
4. RISK — Backfill misses deal.created/closed/opened payload stage strings (Finding 4).
   Fix: not done. Enumerate all four event types in the UPDATE.
5. RISK — "Deal closed." toast and vendor placeholder survive both phases (Finding 5).
   Fix: not done. Assign the six unowned stage* keys to Phase 2.
6. RISK — Raw-SQL companyId cast and agent context are outside the compiler net (Finding 6).
   Fix: not done. Add both to Phase 3's explicit worklist.
7. RISK — Phase 2's grep gate and fixture instruction contradict each other (Finding 7).
   Fix: not done. Scope the grep to non-test source.
8. RISK — Phase 1 has three false facts and no detector for wrong replacements (Finding 8).
   Fix: not done. Correct the facts; add a value-diff review step.

Status: DONE
Summary: 8 findings (2 Critical, 3 High, 3 Medium), all grep-verified; the "auto-adapts" tRPC claims survived verification, the Phase 3 UI/API claims and the timeline-fallback claim did not.

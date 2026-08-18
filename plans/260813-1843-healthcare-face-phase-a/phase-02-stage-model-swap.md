---
phase: 2
title: "Stage model swap"
status: done
priority: P1
dependencies: []
effort: "5d"
---

# Phase 2: Stage model swap

## Overview

Swap the `DealStage` Postgres enum from the 7 sales values to 6 healthcare
values, migrate existing rows with a stage mapping, backfill stage strings stored
in `Activity` meta and `AgentTask` agent-event payloads, and update every code
reference. This is the riskiest phase: it rewrites data.

## Requirements

- Functional: pipeline reads INQUIRY → CONSULT_BOOKED → CONSULT_DONE →
  PROPOSAL_SENT → ENROLLED / LOST everywhere. Existing rows land on the mapped
  stage. Stage-change timeline history renders new labels.
- Non-functional: migration is a single hand-written SQL migration following the
  repo convention (`YYYYMMDDHHMMSS_snake_case`). **Forward-only** — the mapping
  folds are many-to-one, so reversal is impossible by mapping; the fallback
  snapshots (pre-flight gate) are the only restore path. <!-- red-team: F6 -->

## Architecture

### Stage mapping (data migration)

| Old (7) | New (6) | Rationale |
| --- | --- | --- |
| DEMO_BOOKED | CONSULT_BOOKED | a booked demo is a booked consultation |
| QUALIFIED_TO_BUY | CONSULT_DONE | qualified after the conversation |
| DECISION_MAKER_BOUGHT_IN | CONSULT_DONE | no healthcare equivalent; pre-proposal |
| CONTRACT_SENT | PROPOSAL_SENT | |
| CLOSED_WON | ENROLLED | |
| CLOSED_LOST | LOST | |
| UNQUALIFIED_TO_BUY | LOST | fold; confirmed in validation session 1 |

New default: `INQUIRY` (schema `@default`, service fallback, UI initial state).
Groupings in `packages/db/src/deal-stage.ts`:
`OPEN_DEAL_STAGES = [INQUIRY, CONSULT_BOOKED, CONSULT_DONE, PROPOSAL_SENT]`,
`CLOSED_DEAL_STAGES = [ENROLLED, LOST]`, `LOSING_DEAL_STAGES = [LOST]`.

### Timeline fallback lands BEFORE the migration <!-- red-team: F4 -->

`dealStageLabelKey` (`apps/app/lib/deal-stage.ts:55-57`) is
`PRESENTATION[stage].labelKey` with no guard, and
`apps/app/components/crm/timeline/timeline-entry.tsx:80-81` feeds it free-form
meta through `as never` casts. Any unmapped string (one missed backfill row;
`"NEGOTIATION"` is proven legal by fixtures) throws a TypeError and crashes the
whole timeline for that record. First commit of this phase: make the label
resolution total — unknown stage renders the raw string (follow the
`humaniseStage` pattern in
`apps/app/components/agent-builder/deal-list-result.tsx:138-145`). Only after
that is a backfill miss cosmetic.

### Migration SQL shape

1. Assertion first <!-- red-team: F9 -->: a `DO $$` block checks
   `SELECT DISTINCT stage FROM "deal"` yields only the 7 known values and
   RAISEs naming any unexpected value. This repo has a documented `db push`
   drift incident (docs/setup.md:116-133); the CASE below must fail loudly,
   never produce NULLs.
2. `CREATE TYPE "DealStage_new"` with the 6 values.
3. `ALTER TABLE "deal" ALTER COLUMN "stage" DROP DEFAULT;` then
   `ALTER COLUMN "stage" TYPE "DealStage_new" USING (CASE stage::text ... END)::"DealStage_new";`
   CASE carries one WHEN per old value — with the step-1 assertion it is total.
4. Drop old type, rename new to `"DealStage"`, set default `'INQUIRY'`.
5. Backfill stored stage strings, written from the WRITE SITES, not from table
   guesses <!-- red-team: F2 -->:
   - `activity` rows with stage-change meta: flat `{from, to}` written at
     `apps/api/src/deals/deals.service.ts:427-437`. Idempotent, WHERE-scoped
     UPDATE mapping old→new inside the JSON. Step 2 of implementation confirms
     the exact `type` discriminator before the SQL is written.
   - `agentTask` rows (`kind = 'agent-event'`): CRM events persist here — NOT
     in `AgentEvent`, which has zero CRM-event writers
     (`apps/api/src/agent/agent-trigger.service.ts:442-455`). The shape is
     NESTED: `payload.data.from` / `payload.data.to` / `payload.data.stage`.
     Four event types carry stage strings, not one:
     `deal.stage.changed` and `deal.opened` (`{from, to}`), `deal.closed`
     (`{from, to}` — also emitted from the create path), `deal.created`
     (`{stage}`) (`deals.service.ts:267-280, 440-470`).
   - Post-backfill assertion in the migration: zero old-value strings remain in
     the targeted rows; RAISE if any survive.

### Pre-flight gate <!-- Updated: Validation Session 1 - prod-data answer -->

The fork deploys on **Vercel today** (fork governance plan: Cloudflare is its
own, unexecuted plan). `prisma migrate deploy` runs DURING the production build,
gated `VERCEL_ENV === "production"` (`apps/api/scripts/build-func.mjs:167,188`),
while the previous deployment serves. Preview deploys share the production
`DATABASE_URL` (docs/setup.md:103-115).

Validation session 1 (2026-08-13): the owner states **no deployed database
holds real journey rows — seed/demo data only**. The gate therefore verifies
rather than negotiates:

1. Run the DISTINCT-stage check against the deployed database and confirm the
   claim (only seeded ids / empty). This is the whole gate on the happy path.
2. One PR-description note covers the deploy window: previews of this branch
   error against the shared DB until release; the promotion window and the dead
   instant-rollback are non-events over seed data — recovery is redeploy +
   `db:reset && db:seed`.
3. FALLBACK — only if step 1 finds real rows (the claim was wrong): full
   protocol. Snapshot all three mutated stores before merging, schedule the
   release, and write the restore statements into the PR:

```sql
\copy (SELECT id, stage FROM "deal") TO 'deal-stage-backup.csv' CSV HEADER
\copy (SELECT id, meta FROM "activity" WHERE <stage-change discriminator>) TO 'activity-meta-backup.csv' CSV HEADER
\copy (SELECT id, payload FROM "agentTask" WHERE kind = 'agent-event') TO 'agenttask-payload-backup.csv' CSV HEADER
```

Restore = re-CREATE the old type, reverse ALTER using the deal CSV, restore the
two JSON columns from their CSVs by id.

## Related Code Files

- Modify (first commit): `apps/app/lib/deal-stage.ts` — total
  `dealStageLabelKey` fallback (Architecture above)
- Modify: `packages/db/prisma/schema.prisma` — enum values + `@default(INQUIRY)`
- Create: `packages/db/prisma/migrations/<ts>_healthcare_deal_stages/migration.sql`
- Modify: `packages/db/src/deal-stage.ts` — groupings (the canonical file)
- Modify: `apps/app/lib/deal-stage.ts` — `ORDER`, `PRESENTATION`, `OPEN_STAGES`,
  `LOSING_STAGES`, `DEAL_STAGE_OPTIONS`, `dealStageColor`
- Modify: `apps/app/messages/{en,vi}/deals.json` — audit ALL 17 `stage*` keys
  <!-- red-team: F8 -->: replace the 7 label keys (`stageInquiry`,
  `stageConsultBooked`, `stageConsultDone`, `stageProposalSent`,
  `stageEnrolled`, `stageLost`); update the values of the other 10
  (`stageAllTabLabel`, `stageOpenOption`, `stageClosedOption`, `stageHelp`,
  `stageChangeHeadline`, `stageChangeReasonPlaceholder` — the "incumbent
  vendor" example becomes a healthcare one, `stageClosedToast` — "Deal
  closed." becomes journey copy, `stageLabel`, `stageSection`,
  `stageUpdatedToast`)
- Modify: `apps/api/src/deals/deals.service.ts:238` — hardcoded `"DEMO_BOOKED"`
  create default → `"INQUIRY"`; line 84 LOSING set follows `LOSING_DEAL_STAGES`
- Modify: `apps/api/src/dashboard/dashboard.service.ts:205,228` — `CLOSED_WON`/
  `CLOSED_LOST` → `ENROLLED`/`LOST`. Win/loss semantics: with the fold, `LOST`
  now includes old unqualified rows (risk 1). `wonThisMonth` etc. keep their API
  field names — internal names are not renamed (decision 5).
- Modify: `apps/agent/agent/lib/accounts.ts:524-529` — `isOpen(stage: string)`
  hardcodes raw strings. Untyped: the compiler will NOT flag this. Rewrite
  against `CLOSED_DEAL_STAGES`/`isClosedStage` from `@crm/db`.
- Modify: `apps/agent/agent/lib/lookup.ts:73` — `won` → `[DealStage.ENROLLED]`
- Modify: `apps/app/app/(app)/[slug]/deals/create-deal-sheet.tsx:78` — initial
  stage state `"DEMO_BOOKED"` → `"INQUIRY"`
- Modify: `apps/app/components/crm/stage-change.tsx:149,154` — lost-reason
  branch `"CLOSED_LOST"` → `"LOST"`
- Modify: `apps/app/components/crm/stage-stepper.tsx:17,40,65` — rail =
  OPEN_STAGES + `ENROLLED`
- Modify: `apps/app/app/(app)/[slug]/deals/deals-bulk-actions.tsx:156` —
  `"CLOSED_LOST"` → `"LOST"`
- Modify: `packages/db/prisma/seed.ts:250-259,615-616,724-725` — stage pools and
  the lost-reason gate updated mechanically so seed still runs (flavor is Phase 4)
- Regenerate: `packages/db/src/generated/prisma/*` (`bun run db:generate`)
- Auto-adapts, verify only: `apps/api/src/deals/deals.contracts.ts:36-39`
  (`stageEnum` from `Object.values(DealStage)` — red-team verified nothing is
  baked into generated server.ts for the enum alone),
  `apps/api/src/telemetry/rollup.service.ts:547-550` (`deals_by_stage` — metric
  keys change; accepted, note in PR)
- Tests: `apps/agent/test/{accounts,lookup,preamble,durable-agent-runtime}.integration.spec.ts`
  (preamble asserts literal `(CONTRACT_SENT)`), `apps/agent/test/e2e/*.e2e.ts`,
  `apps/api/test/{agent-events,bulk,currency-totals}` specs,
  `apps/app/test/agent-transcript.spec.ts`

## Implementation Steps

1. Timeline fallback commit (Architecture above). Lands before everything else.
2. Trace the stage-change write sites to pin the exact `Activity` discriminator
   and the `agentTask.payload` shapes for all four event types; only then write
   the backfill SQL.
3. Pre-flight gate: run the DISTINCT verification against the deployed DB
   (fallback snapshots only if it finds real rows).
4. Schema edit + `bun run db:migrate` to scaffold, then replace with the
   hand-written SQL above. `db:generate`.
5. Update `packages/db/src/deal-stage.ts`, then follow the compiler: every
   listed file, plus the two untyped sites (accounts.ts, deals.service.ts:238)
   which the compiler will not find — do them from this list, not from tsc.
6. Replace/audit all 17 `stage*` catalog keys en+vi; update `PRESENTATION` map.
7. Update tests. `NEGOTIATION`-style free-form fixtures stay free-form — they
   prove meta is free-form and the fallback from step 1 depends on that staying
   true. Where a fixture pairs free-form with an old enum value
   (`durable-agent-runtime.integration.spec.ts:236` has `to: "CLOSED_WON"`),
   the old value may stay: the success-criteria grep is scoped to non-test
   source only. <!-- red-team: F11 -->
8. Test-DB note for the PR <!-- red-team: F10 -->: `crm_test` only migrates
   forward (`packages/db/scripts/test-db.ts` has no reset path). After this
   branch's migration runs, switching to a pre-swap branch bricks pre-push —
   `DROP DATABASE crm_test` (or `CRM_SKIP_HOOKS=1`) is the escape. One line in
   the PR description.
9. Gates: `check-types`, `lint`, `bun run --filter=api test`,
   `bun run --filter=agent test`, fresh `db:reset && db:seed` locally, plus a
   migrated-path check: seed on the old enum, run the migration, verify mapped
   stages and backfilled meta render.

## Success Criteria

- [ ] Six stages render in: stage menu, table facet, create sheet, bulk actions,
      stepper, dashboard donut, timeline history, agent-builder deal list.
- [ ] Fresh DB + migrated DB both work; old seeded rows land on mapped stages.
- [ ] Stage-change timeline entries from before the migration render new labels;
      an artificially unmapped value renders as raw text, not a crash.
- [ ] Migration's post-backfill assertion passes: zero old stage strings in
      `activity` stage-change meta and `agentTask` agent-event payloads.
- [ ] Agent `isOpen` reuses `@crm/db` groupings; grep
      `CLOSED_WON\|DEMO_BOOKED\|CONTRACT_SENT` over `apps/agent/agent/` (non-test
      source) = 0 hits.
- [ ] All 17 `stage*` catalog values read healthcare (en + vi).
- [ ] PR description carries: the pre-flight verification result, the
      deploy-window note, the test-DB note.
- [ ] All tests green.

## Risk Assessment

- RISK — UNQUALIFIED_TO_BUY → LOST fold changes historical win-rate math
  (`dashboard.service.ts:228` deliberately excluded it from losses). Accepted:
  locked 6-stage set; validation session 1 confirmed the fold and that no real
  rows exist.
- RISK — a backfill miss survives. Mitigation: write sites traced first (step
  2), post-backfill assertion RAISEs, and the timeline fallback (step 1) makes
  any residue cosmetic, not a crash.
- RISK — telemetry `deals_by_stage` series breaks continuity. Accepted on the
  fork; note in PR description.
- RISK — deploy window: previews broken until release. Accepted over seed-only
  data (validation session 1); one PR note. Fallback protocol stands if the
  DISTINCT check contradicts the claim.

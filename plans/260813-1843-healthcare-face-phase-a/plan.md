---
title: "Healthcare reshape Phase A: Face"
description: "Relabel the UI to healthcare vocabulary at the i18n layer, swap DealStage to healthcare stages with a data migration, make companyId optional on Deal, and ship clinic-flavored seed data. No model renames."
status: done
priority: P1
effort: "15d"
branch: "feat/healthcare-face-phase-a"
tags: [healthcare-reshape, i18n, prisma, migration, seed]
blockedBy: [260812-2301-vietnamese-locale]
blocks: []
created: "2026-08-13T11:47:43.862Z"
createdBy: "ck:plan"
source: skill
---

# Healthcare reshape Phase A: Face

## Overview

Phase A of the healthcare CRM reshape (roadmap in
[`plans/reports/brainstorm-260813-1601-healthcare-crm-reshape-report.md`](../reports/brainstorm-260813-1601-healthcare-crm-reshape-report.md), v2).
Goal: every demo reads healthcare-shaped. Four changes, no model renames:

1. Relabel all UI vocabulary (Deal→Journey, Company→Organization, Contact→Client)
   at the i18n layer only, driven by a repo-local haiku relabel skill.
2. Swap the `DealStage` enum to INQUIRY → CONSULT_BOOKED → CONSULT_DONE →
   PROPOSAL_SENT → ENROLLED / LOST, with a stage-mapping data migration.
3. Make `Deal.companyId` optional; journeys start from a client.
4. Clinic-flavored seed data.

Locked decisions 1–8 from the brainstorm v2 are not reopened here. Schema keeps
`Deal`/`Company`/`Contact`. Event names keep `deal.*` strings. tRPC router names
unchanged.

**Execution shape.** One branch off `dev` (`feat/healthcare-face-phase-a`), one PR
into `dev`. Phases are a commit sequence, not separate PRs. English and Vietnamese
catalog changes land together (docs/i18n.md rule). Phases 1–3 are independent of
each other; Phase 4 needs all three.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Relabel skill and catalogs](./phase-01-relabel-skill-and-catalogs.md) | Done |
| 2 | [Stage model swap](./phase-02-stage-model-swap.md) | Done |
| 3 | [Client-first journeys](./phase-03-client-first-journeys.md) | Done |
| 4 | [Clinic seed and gates](./phase-04-clinic-seed-and-gates.md) | Done |

## Dependencies

- `260812-2301-vietnamese-locale` (status: awaiting-user-verification). The vi
  catalogs this plan rewrites come from that plan; it is merged into `dev`
  (PR #4) but the user has not verified it. Verify before starting Phase 1.
- No other unfinished plan overlaps. `260811-1541-multilingual-english-first`
  and `260812-2132-fork-actions-downstream-vendor` are complete.

## Acceptance criteria

- [ ] App UI (en and vi) shows Journey / Organization / Client vocabulary; no
      sales vocabulary outside the keep-list. Verified by grep sweep +
      per-namespace diff review + pseudo-locale walk.
- [ ] Pipeline stages are the six healthcare stages everywhere: table facets,
      stage menu, stepper, bulk actions, dashboard donut, timeline entries —
      including all 17 `stage*` catalog values (toasts, placeholders, help).
- [ ] Existing deal rows migrate to mapped stages; stage-change history in
      `Activity` meta and `agentTask` agent-event payloads is backfilled with a
      zero-old-strings assertion; an unmapped stray renders as raw text, never
      a crash.
- [ ] A journey can be created with no organization, from the deals page and
      from a client record (atomic attach). All company renders are null-safe.
- [ ] Deleting an organization leaves its journeys, their activity history,
      their agent conversations, and correct `lastActivityAt`.
- [ ] `bun run db:seed` produces a believable clinic pipeline.
- [ ] Gates green: `check-types`, `lint`, `test`, `i18n:check`,
      `i18n:catalogs`, trpc:generate committed if contracts changed.
- [ ] Native Vietnamese review of the new terms is done (or explicitly waived).

## Key risks (detail in phase files)

1. RISK — 7→6 stage fold: `UNQUALIFIED_TO_BUY` merges into `LOST`. Historical
   win-rate math changes. Accepted and confirmed in validation session 1;
   forward-only migration, snapshots only as fallback (Phase 2).
2. RESOLVED (validation session 1) — Owner states no deployed database holds
   real journey rows. Phase 2's pre-flight gate verifies with a DISTINCT-stage
   check; the full snapshot/scheduling protocol stands as fallback if the check
   contradicts the claim.
3. RISK — vi terms need native review (~15h incl. plural restructure). Phase 4
   gate; `t.raw`-consumed keys are never restructured (Phase 1).
4. RISK — Compiler-invisible sites: agent `accounts.ts` raw stage strings
   (Phase 2), `setStage` `$queryRaw` cast and scalar `companyId` where-clauses
   (Phase 3). Each phase carries an explicit untyped-site worklist.

## Red Team Review

### Session — 2026-08-13
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst
(3 parallel, hostile, evidence-required). Raw findings: 25; deduplicated: 13.
**Findings:** 13 (13 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 5 High, 5 Medium
**Reports:** `reports/from-code-reviewer-to-planner-red-team-{security-adversary,assumption-destroyer,failure-mode-analyst}-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Org delete cascade-wipes surviving journey history (`Activity`/`AgentConversation` company FKs) | Critical | Accept | Phase 3 |
| 2 | Backfill targeted `AgentEvent`; events live in `agentTask.payload.data` (nested), 4 event types not 1 | Critical | Accept | Phase 2 |
| 3 | Create-from-client had no backend path; cited UI patterns nonexistent (`QuickAddDeal` is the real surface) | Critical | Accept | Phase 3 |
| 4 | "Timeline falls back to raw string" was false — unmapped stage meta throws | High | Accept | Phase 2 |
| 5 | Deploy mechanics: Vercel mid-build migration, broken previews, dead instant-rollback | High | Accept | Phase 2 |
| 6 | Rollback snapshot covered 1 of 3 mutated stores; folds are many-to-one | High | Accept | Phase 2 |
| 7 | Compiler-net holes: `$queryRaw` cast, scalar `companyId` wheres, agent company-anchored context | High | Accept | Phase 3 |
| 8 | Six `stage*` catalog keys owned by neither phase ("Deal closed." toast survives) | High | Accept | Phases 1, 2 |
| 9 | Migration CASE had no ELSE over an UNKNOWN prod schema with drift precedent | Medium | Accept | Phase 2 |
| 10 | Test DB migrates forward only; branch switch after swap bricks pre-push | Medium | Accept | Phase 2 |
| 11 | Grep gate contradicted keep-fixtures instruction | Medium | Accept | Phase 2 |
| 12 | Phase 1 false facts (`i18n:catalogs` location, ui.json hits, keep-list example); no over-replacement detector | Medium | Accept | Phase 1 |
| 13 | `t.raw`-consumed `relativeTime*` keys break on ICU restructure, invisible to gates | Medium | Accept | Phase 1 |

### Whole-Plan Consistency Sweep — 2026-08-13

All five plan files re-read after applying the 13 findings. Grep sweep over the
13 decision deltas (AgentEvent-as-store, kanban, false fallback claim,
app-package script location, invented keep-list example, "reversible" claim,
ui.json hit count, nonexistent UI patterns, company facet scope, Cloudflare
deploy assumption, stage-key ownership, grep-gate scoping, sync-vs-verify
ui-strings): zero stale claims remain. Surviving mentions are deliberate — the
review log above, phase-02's statement of why `AgentEvent` is not the backfill
store, phase-02's Vercel-today deploy fact, phase-03's no-company-facet scope
note. Effort totals reconciled (3+6+4+3 = 16d; revised to 15d by validation session 1). Phases table statuses untouched
(CLI-owned). No unresolved contradictions; plan is ready for validate or cook.

## Validation Log

### Session 1 — 2026-08-13
**Trigger:** post-red-team validation (mode=prompt), before implementation
**Questions asked:** 6
**Verification pass:** skipped per guard — Red Team Review above carries three
fact-checker evidence tables; no `[UNVERIFIED]` tags remained.

#### Questions & Answers

1. **[Risks]** Does any deployed database hold real journey/deal rows beyond seed data?
   - Options: Unknown — assume real | No real rows | Yes, real rows
   - **Answer:** No real rows
   - **Rationale:** Collapses the Phase 2 pre-flight to a DISTINCT verification;
     deploy-window consequences become non-events over seed data.
2. **[Tradeoffs]** Accept the UNQUALIFIED_TO_BUY → LOST fold changing historical win-rate math?
   - Options: Fold into LOST | Decide at pre-flight | Keep a 7th value
   - **Answer:** Fold into LOST
   - **Rationale:** Locked 6-stage set holds; metric shift accepted knowingly.
3. **[Architecture]** How to handle the Vercel mid-build migration window (broken previews, promotion window, dead instant-rollback)?
   - Options: Accept, note in PR | Schedule the release | Zero-downtime path
   - **Answer:** Accept, note in PR
   - **Rationale:** Trivial over seed-only data; one PR note suffices.
4. **[Assumptions]** When are the Vietnamese terms settled?
   - Options: Drafts now, review Phase 4 | Settle before Phase 1 | Provide terms now
   - **Answer:** Drafts now, review Phase 4
   - **Rationale:** Term re-run is designed cheap; Phase 1 stays unblocked.
5. **[Scope]** landing.json scope?
   - Options: Mechanical swap only | Rewrite landing in Phase 1 | Skip landing.json
   - **Answer:** Mechanical swap only
   - **Rationale:** Positioning rewrite is a later deliberate writing task.
6. **[Scope]** One PR into dev, or PR per phase?
   - Options: One PR | PR per phase
   - **Answer:** One PR
   - **Rationale:** Matches round-1 precedent; en+vi and enum changes stay atomic.

#### Confirmed Decisions
- Stage fold to LOST — locked set holds, metric shift accepted.
- Deploy window accepted with a PR note — seed-only data.
- VI terms: drafts + Phase 4 native review.
- Landing: mechanical term swap only.
- Execution: one branch, one PR into dev.

#### Action Items
- [x] Phase 2 pre-flight rewritten: DISTINCT verification on the happy path,
      full snapshot/scheduling protocol demoted to fallback. Effort 6d → 5d;
      plan 16d → 15d.

#### Impact on Phases
- Phase 2: pre-flight gate, implementation step 3, success criteria, risks
  updated (`<!-- Updated: Validation Session 1 - prod-data answer -->`).
- Phases 1, 3, 4: no changes — answers confirmed the plan as written.

### Whole-Plan Consistency Sweep — Session 1
All five files re-read after propagation. The only decision delta was the
prod-data answer; greps for the superseded framing ("four pre-flight
decisions", "four recorded deploy decisions", unconditional "three-store
snapshots", UNKNOWN prod-data risk) return only intentional mentions (the
fallback protocol and this log). Effort totals reconciled (3+5+4+3 = 15d).
No unresolved contradictions.

## Implementation Log

### Session — 2026-08-13 (implementation)
Executed on branch `feat/healthcare-face-phase-a`, 9 commits, one PR into dev.
All four phases done. Gates green: 824 tests (app 152 / api 358 / agent 314),
check-types, lint, i18n:check, i18n:catalogs, i18n:pseudo. Migration replayed
on a scratch DB with adversarial rows. Final review: 0 critical, 0 high,
1 medium (documented in docs/api.md), 6 low (3 fixed).

### Verification — 2026-08-13 (owner)
Owner reseeded the dev DB, signed in (M365), walked the seeded app and
approved ("very good"). The owner is a native Vietnamese speaker; the vi
walk stands as the native review — a term change remains one
terminology.md edit + skill re-run. Outstanding at release time: the
pre-flight DISTINCT-stage check against the deployed database (no Vercel
link on the dev machine); carried in the PR description.

---
title: "Jev message triage: eval harness, foundation, Zalo inbox triage"
description: "Add TypeSafe AI's Jev as a direct-lane judgment in apps/agent. Measure Vietnamese accuracy first, then triage every inbound Zalo message for intent, urgency and language, and surface it in the inbox."
status: in-progress
priority: P2
branch: "feat/zalo-oa-chat"
tags: [feature, agent, messaging, database, api, frontend, i18n]
blockedBy: [260916-0000-customer-messaging-vietnam, 260916-0000-customer-messaging-vietnam-codex]
blocks: []
created: "2026-09-22T01:34:33.711Z"
createdBy: "ck:plan"
source: skill
---

# Jev message triage: eval harness, foundation, Zalo inbox triage

## Overview

Jev (TypeSafe AI) returns typed, calibrated answers to narrow questions in under
500 ms. This plan wires it in as a vendor client in `apps/agent`, measures how it
performs on Vietnamese Zalo messages, and then runs one judgment per inbound
message: intent, urgency, language, and an injection guard. The inbox filters,
sorts and badges on the result. Nothing auto-replies. Nothing links a contact.

Source: `plans/reports/brainstorm-260922-0455-jev-typesafe-integration-report.md`.
Sections 3, 4, 6.1 and 6.2 are the spec. Phases 2 and 3 of that report (mailbox
and form screening, research pre-triage, identity gate) are **out of scope** here.

Decisions already made on 2026-09-22, not reopened:

- TypeSafe is a model provider. Customer text may be Jev state. Amend the egress rule
  to name exactly what leaves: the inbound body and up to three earlier inbound bodies
  from the same thread. Rep replies are not sent in this release.
- Approach A. Jev runs as direct-lane task kinds in `apps/agent`. Never in `apps/api`.
- Plain `fetch`, not `@typesafe-ai/sdk`. One endpoint, one pinned model, zero
  dependencies. The SDK's Node 20 floor is not the reason.
- Pin `jev-1.13.0`. Aliases move without notice.
- Every threshold comes from the phase 1 eval. No live verdict before it.
- Retry on the direct lane follows the `runBrand` contract: return without
  completing and let the lease re-claim, three attempts, then the backfill script.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundation and Vietnamese eval harness](./phase-01-foundation-and-vietnamese-eval-harness.md) | In progress — gate passed, fixture review open |
| 2 | [Message-triage task kind](./phase-02-message-triage-task-kind.md) | Pending |
| 3 | [Inbox filter sort and badge](./phase-03-inbox-filter-sort-and-badge.md) | Pending |

## Dependencies

- Phase 1 is the base. Phase 2 needs the client, config and the eval numbers.
  Phase 3 needs the columns from phase 2.
- **Gate between 1 and 2:** intent accuracy on Vietnamese at the chosen confidence
  band is 85% or better, injection recall 80% or better, false-positive rate 5% or
  lower. Below that, stop and report. Do not build phase 2.
- Cross-plan: `260916-0000-customer-messaging-vietnam` owns the writer, the schema
  and the inbox this plan extends. It is awaiting user verification and uncommitted.
  `260916-0000-customer-messaging-vietnam-codex` hardens the same files and is pending.
  Both must land before phase 2 touches `messaging-writer.service.ts`,
  `messaging.service.ts` and `thread-list.tsx`. Phase 1 has no overlap and can start now.
- Deploy order for phase 2: agent before API, rollback API before agent.
- Gate between 1 and 2: evaluated 2026-09-23, PASS (intent 92.1% at ≥0.7, injection recall 100%, FP 1.0% at 0.35). Report: reports/jev-eval-260923-gate-result-report.md.

## Acceptance criteria

- `bun run --filter=agent jev:eval` prints accuracy per question per confidence
  band and the injection recall and false-positive rate over a synthetic labelled
  Vietnamese sample set, writes results without message bodies, and exits non-zero
  when the key is missing.
- With `TYPESAFE_API_KEY` unset, every Jev path returns "not configured". Nothing
  throws. The capability line prints `off` at boot.
- An inbound Zalo text gets `intent`, `urgency`, `language` and `triagedAt` on its
  `Message` row within one dispatch tick. The thread carries the verdict of its
  newest triaged inbound message, null included, under concurrent handlers.
- A retryable Jev failure leaves the task open for the lease to re-claim, three
  attempts at most. A 401 never stamps. `backfill:triage` recovers every untriaged
  message whatever the cause.
- One Zalo identity gets at most `maxPerIdentityPerDay` paid calls in 24 hours.
- Message text never reaches a log line, a telemetry event, a task outcome, a fixture
  file or an eval result.
- The inbox filters by intent and sorts by urgency with nulls last and stable cursor
  paging. A null verdict shows no badge. Every new string exists in `en` and `vi`
  and `i18n:check` passes.
- `bun run check-types`, `bun run lint` and the agent, api, app and telemetry test
  suites pass.

## Rules this plan obeys

`AGENTS.md`, `docs/api.md`, `docs/agent.md`, `docs/messaging.md`, `docs/environment.md`,
`docs/telemetry.md`, `docs/i18n.md`, `docs/design.md`. Skills: `.agents/skills/eve`,
`.agents/skills/nestjs-trpc`, `.agents/skills/prisma-database-setup`,
`.agents/skills/nuqs`, `.agents/skills/shadcn`. No code comments. No `Co-Authored-By`.

## Open questions

1. TypeSafe's retention and training policy for `state`. Luan obtains it from
   TypeSafe before the key goes into production; `docs/messaging.md` reserves the line.
2. Should the urgency sort be gated on known contacts, so a stranger cannot climb it?
   Product call. Phase 3 ships without the gate and names the risk.
3. Should rep outbound text ever join `prior` in a later release? Not in this one.
4. Intent filter control in `/messages`: chips beside `needsReply` and `unmatched`,
   or a select. Phase 3 assumes chips, matching the existing filter.
5. The client retries any 5xx once, not 529 only. Confirm or narrow.
6. `bun install` to add `@types/bun` to apps/agent so check-types covers
   scripts/ and test/ (53 pre-existing spec errors to fix).

## Red Team Review

### Session — 2026-09-22
**Findings:** 15 after deduplication of 28 (15 accepted, 0 rejected; finding 7 accepted in part)
**Severity breakdown:** 2 Critical, 5 High, 8 Medium
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst.
Reports in `reports/from-code-reviewer-to-planner-red-team-*-plan-review-report.md`.
Verification: Standard tier, 106 claims checked, 15 failed, all reconciled below.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Throw-to-retry inside a catch-all; a throw never retries within the lease | Critical | Accept | Phase 2 Architecture, steps 7-8; plan.md decisions and acceptance |
| 2 | "A later key triages the backlog" has no mechanism | Critical | Accept | Phase 2 step 9 `backfill:triage`; acceptance |
| 3 | Writer transaction path misdescribed; `createMany` to `create` aborts the transaction on redelivery | High | Accept | Phase 2 Context, Architecture, steps 5-6; rejected the "wrap store in withTasks" variant |
| 4 | Urgency sort puts nulls first and drops the cursor tiebreaker | High | Accept | Phase 3 Architecture, steps 3, 10 |
| 5 | Thread verdict races under concurrency and goes stale on a below-threshold newest | High | Accept | Phase 2 `lastTriagedInboundAt` guarded write; tests h, i |
| 6 | Priority 920 stalls the visible lane; any Zalo user queues unbounded paid calls | High | Accept | Phase 2 priority 600, `maxPerIdentityPerDay`, one retry in the client; rejected per-thread dedup |
| 7 | Injection guard is self-referential; a hit badges as `OTHER` | High | Accept in part | Phase 1 injection gate and 60 labelled lines; phase 2 null on hit; known-contact gate is open question 2 |
| 8 | Per-verdict PostHog event breaks the telemetry contract; `stage: triage` stripped | Medium | Accept | Phase 2 step 10 counters into `install_daily`, `"triage"` in `MESSAGING_STAGES` |
| 9 | Egress amendment understates what leaves; `prior` carried rep text and drafts | Medium | Accept | Phase 2 state shape inbound-only, step 11 wording; open question 1 |
| 10 | Eval cannot see the root `.env`; cwd-relative path; empty bodies contaminate the gate | Medium | Accept | Phase 1 steps 4, 6, 9 and the `expected: skip` fixture shape |
| 11 | Fixtures and eval JSON can carry customer text into git | Medium | Accept | Phase 1 steps 7-9, `jev-fixtures.spec.ts` |
| 12 | Phase 3 extends an RSC prefetch that does not exist; no inbox spec exists | Medium | Accept | Phase 3 Context, step 6, tests |
| 13 | API deployed before the agent sends triage rows into the research lane | Medium | Accept | Phase 2 step 12; plan.md dependencies |
| 14 | A conversation deleted mid-flight becomes an internal failure with telemetry | Medium | Accept | Phase 2 Architecture `updateMany`, step 7, test k |
| 15 | "SDK wants Node 20" is a floor, not a Bun exclusion | Medium | Accept | plan.md decisions |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-foundation-and-vietnamese-eval-harness.md, phase-02-message-triage-task-kind.md, phase-03-inbox-filter-sort-and-badge.md
- Decision deltas checked: 12 (retry contract, backfill script, writer queue path, `createMany` kept, priority 600, daily cap, `lastTriagedInboundAt`, inbound-only `prior`, null on injection hit, counters not events, nulls-last sort with id tiebreaker, no RSC prefetch)
- Reconciled stale references: 9 (priority 920, "60 per tick", "throw so the lease retries", `AgentTaskQueue` extension, `terminal` flag on `Outcome`, `jevVerdict`/`jevError` helpers, `page.tsx` prefetch, `prior` with direction, "SDK wants Node 20")
- Unresolved contradictions: 0

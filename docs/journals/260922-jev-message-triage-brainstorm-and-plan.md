# Jev Message Triage: A Plan That Failed Its Own Retry Story Before Any Code Existed

**Date**: 2026-09-22 04:55–10:10
**Severity**: Low (no code written; two critical plan defects caught before implementation)
**Component**: `plans/260922-0455-jev-message-triage/`, `plans/reports/brainstorm-260922-0455-jev-typesafe-integration-report.md`, egress policy in `docs/agent.md`
**Status**: Planned and red-teamed. Blocked on the two Zalo messaging plans landing. No code.

## What Happened

Researched Jev, TypeSafe AI's "System One" model, public since 2026-09-15. It returns typed, calibrated answers to narrow questions (`noul`, `choice`, `score`) in 70–500 ms at $0.042 per million input tokens. Mapped it against the codebase and found four candidate points: Zalo inbox triage, mailbox and form screening, research pre-triage, and the LinkedIn identity verdict. Luan chose all four for the report and Zalo triage for the first plan.

Two policy decisions came from Luan, not the code: TypeSafe counts as a model provider, so customer message bodies may be Jev state; and form screening flags a contact after filing rather than holding the submission. Everything else was decided in the session and recorded.

The plan has three phases: a client plus a Vietnamese eval harness, a `message-triage` direct-lane task kind, and the inbox filter, sort and badge. Three hostile reviewers then produced 28 findings that collapsed to 15. All 15 were accepted. Two were critical.

## The Brutal Truth

The plan said "throw so the lease retries". The dispatcher does not work that way. A throw from a direct handler reaches `reconcileDirect`, which calls `enrichment.settle()`, which no-ops for a task with no contact or company. The task then sits until its six-minute lease expires, is re-claimed at most three times, and is retired with "the session never reported back". The same step also wrapped the whole body in a catch-all that would have swallowed the throw anyway. Two contradictory sentences in one paragraph, and the acceptance criterion "retries within the lease" was unmeetable as written. The `runBrand` pattern at `dispatch.ts:110`, return without completing, was the contract all along.

The plan also promised "a later key triages the backlog at 60 per tick". Nothing does that. A completed task is never re-claimed, and the writer queues only at insert time. Two weeks without a key would have left every message untriaged forever with the docs claiming otherwise. The fix is a `backfill:triage` script, the same shape as `backfill:facts`, and it doubles as recovery for retired tasks and bad-key periods.

Three reviewers independently found that the writer step described a transaction path that does not exist. `store()` runs its own `$transaction` and queues the profile task after commit; `withTasks` belongs to `queueOutbound`. The proposed `createMany` to `create` switch would have made every Zalo redelivery abort the transaction. The plan was written from a reading of `docs/messaging.md`, which describes `queueOutbound`, not from `store()` itself.

## Technical Details

Decisions that changed under review: priority 600 instead of 920, because a triage badge must never delay a rep-visible picture or a custom agent run, and because 60 items at a 35 s worst case exceeded the 240 s sweep timeout; a per-identity daily cap of 50 paid calls, because the webhook is anonymous and any Zalo user could queue unbounded vendor calls; `prior` is inbound-only, because the draft would have sent rep replies and failed drafts to TypeSafe while the docs said only customer text leaves; an injection hit writes null, never `OTHER`, because badging an attack as a category is worse than no badge; thread verdicts write through an `updateMany` guarded on a new `lastTriagedInboundAt`, because six concurrent handlers made "am I newest" a race; telemetry is daily counters into `install_daily`, because a per-verdict PostHog event would have leaked the clinic's message cadence and broken the one-event-a-day contract; the urgency sort declares `nulls: "last"` and keeps the `id` tiebreaker, because Postgres puts nulls first on a plain `desc` and the cursor needed the tiebreaker.

Facts about Jev worth keeping: 32k tokens of state per request, 1,200 requests per minute, `jev-latest` moves without notice so the plan pins `jev-1.13.0`, English is primary and Vietnamese is unnamed in the docs, and Jev reads state as trusted, so the injection guard is judged by the model being attacked. Phase 1 therefore gates on injection recall and false-positive rate, not intent accuracy alone.

The npm SDK was rejected for plain `fetch`. The first reason given, "SDK wants Node 20 and the agent runs on Bun", was wrong: `>=20` is a floor and Bun does not enforce engines. The decision stands on zero dependencies and one endpoint. A wrong reason gets re-litigated; the plan now states the right one.

## What We Tried

The brainstorm skill's hard gates forced a scout before any question, and the scout found the evidence ledger's rule that no tool accepts a confidence. That killed the obvious idea of feeding a Jev probability into `lib/evidence.ts` before it was proposed, and shaped every surface as a code gate rather than an evidence kind.

The red team ran three lenses in parallel with a Fact Checker plus Contract Verifier role each. Of 106 claims checked, 15 failed. Every failure was a plan claim about existing code, not about Jev. The Jev API shape remains unverifiable from the repo and is marked so.

## Lessons Learned

A plan step that names a retry mechanism must cite the line that implements it. "Throw so the lease retries" cited nothing, and the dispatcher's real contract was one grep away. The same applies to "the backlog is triaged later": name the code that does it or write the script.

Read the function the plan modifies, not the doc that describes its sibling. `docs/messaging.md` was accurate about `queueOutbound` and silent about `store()`, and the plan filled the silence with an assumption.

Three independent reviewers converging on the same five failures is the signal that they were real, not stylistic. The one finding accepted only in part, gating urgency on known contacts, is a product trade-off and is recorded as an open question rather than decided in the plan.

## Open Questions

- TypeSafe's retention and training policy for `state` is not recorded. Luan obtains it before the key goes into production.
- Whether the urgency sort needs a known-contact gate is a product call.
- Whether rep outbound text ever joins `prior` is deferred.

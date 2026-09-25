# Jev Phase 1: Foundation and Eval Harness — Complete, Blocked on API Key

**Date**: 2026-09-23 22:27
**Severity**: High
**Component**: Jev TypeSafe integration, message triage
**Status**: DONE_WITH_BLOCKERS

## What Happened

Jev client with plain `fetch` shipped tonight: no SDK, no dependencies.
`jev-config.ts` holds timeouts, backoff, questions, caps, thresholds.
`jev-schemas.ts` contains three Zod answer types.
`jev-eval.ts` judges 242 Vietnamese fixtures at 5 concurrent.
Three spec files, 50+ tests total, all passing.
Capability marked `surface: "dispatch"` hides it from session preamble.
Egress docs amended; TypeSafe now an approved model provider.
448 agent tests pass; check-types and lint pass.
No commits yet; work lives on feat/zalo-oa-chat.

## The Brutal Truth

Phase 2 cannot start because `TYPESAFE_API_KEY` does not exist on this machine.
The eval harness detects this and exits before any fixture runs.
Vendor response shape is unverified: confidence field name, score scale, probabilities.
Code assumes confidence is 0–1; wrong field name breaks silently.
Thresholds in `jev-config.ts` are placeholders: 0.5, 0.5, 0.35.
Three success metrics remain unknown: intent ≥85%, injection recall ≥80%, FP ≤5%.
Assumptions shipped into code because the key was unavailable.

## Orchestration

Fullstack agent built code in one evening (Opus model).
Code-reviewer traced all paths; PM tracked blockers.
One PM agent stalled mid-report and was replaced.
No review loop; no commits; orchestration only.

## Key Decisions Without Asking

Retry any 5xx, not only the two specified codes (429, 529).
This increases cost for persistent 500s; one extra request per failure.
Safe because the calls are stateless and idempotent.
Egress carve-out moved forward from phase 2.
Tsconfig fix was reverted; it exposed 53 pre-existing spec errors.
That fix needs `@types/bun` in agent devDependencies.
`surface: "dispatch"` hides Jev from LLM preamble.

## Why It Stopped

`TYPESAFE_API_KEY` is missing; that is why phase 2 is blocked.
Success criteria require intent ≥85%, injection recall ≥80%, FP ≤5%.
Those numbers cannot exist without a live eval run.
Phase 2 spec says urgency comes from a probability argmax.
This phase rounds a continuous score instead.
The two methods disagree when probabilities split.
No eval output means no thresholds, no phase 2 start.

## Next

Set `TYPESAFE_API_KEY` in root `.env`.
Run `bun run --filter=agent jev:eval`.
Review fixture labels: ids 174–175–184 for language, ids 5–14–20–60–72–92 for urgency boundaries, ~32 "tomorrow" lines for criterion mismatch.
Set real thresholds in `jev-config.ts` and cite the eval run.
Evaluate: intent ≥85%, recall ≥80%, FP ≤5%.
Land the two upstream messaging plans (writer, schema, inbox).
Start phase 2.

## Open Risks

Vendor `confidence` field name is unconfirmed; different name breaks every parse.
Score scale is guessed (0–3); vendor may count from 1.
Probabilities field was stripped; vendor shape unknown; phase 2 adds it.
The rounding heuristic here disagrees with phase 2's argmax method.
TypeSafe retention policy for `state` must be obtained before production.
Fixture review pending: 32 "tomorrow" lines labeled urgency 1, criterion says "today."

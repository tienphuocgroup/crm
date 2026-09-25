# Phase 1 status — 2026-09-23

From: pm. To: Luan. Plan: `plans/260922-0455-jev-message-triage`.
Branch: `feat/zalo-oa-chat`. Code done. Live eval blocked.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `jev:eval` prints band tables, writes JSON, no bodies | Blocked on key |
| 2 | Thresholds in `jev-config.ts` cite the eval run | Blocked on key |
| 3 | Gate: intent 85%, injection recall 80%, FP rate 5% | Blocked on key |
| 4 | Boot line reads `off` with key unset | Met |
| 5 | `jev-fixtures.spec.ts` passes, every line reviewed | Spec passes. Review pending |
| 6 | No message text in logs, telemetry, fixtures | Met |
| 7 | Agent check-types, lint, tests pass | Met |

## Next actions, in order

| # | Action | Owner |
|---|---|---|
| 1 | Set `TYPESAFE_API_KEY` in root `.env` | Luan |
| 2 | Run `bun run --filter=agent jev:eval` | Luan |
| 3 | Review fixture labels (below) | Luan |
| 4 | Set real thresholds in `jev-config.ts`, cite the run | Agent, after 2-3 |
| 5 | Evaluate the 85/80/5 gate | Agent, after 4 |
| 6 | Land the two messaging plans (writer, schema, inbox) | Luan |
| 7 | Start phase 2 | Agent, after 5 and 6 |

Fixture ids for review (action 3):

- 174, 175, 184 — dominant language check.
- 5, 14, 20, 60, 72, 92 — urgency 2 vs 3.
- About 32 lines with "tomorrow" — labelled urgency 1. Check against the
  "asks for an answer today" criterion.
- 10, 185 — separate check, unspecified reason.

## What is done

Client, config, schemas, capability entry, eval script, fixtures (242 lines),
three spec files. 448 agent tests pass. Check-types and lint pass on the
agent package. Capability hidden from session preamble (`surface: "dispatch"`).
Egress rule 1 and `docs/messaging.md` updated (pulled forward from phase 2
step 11).

## What blocks phase 2

`TYPESAFE_API_KEY` absent. No live eval. No real thresholds. Gate not
evaluated. Two upstream messaging plans still uncommitted.

## Unresolved questions

1. Client retries any 5xx once. Spec named 429 and 529 only. Confirm the
   wider retry or narrow it.
2. `apps/agent/tsconfig.json` excludes `scripts/` and `test/`. Fixing needs
   `bun install` for `@types/bun` and fixes to 53 pre-existing spec errors.
   Schedule this work.
3. TypeSafe retention and training policy for `state` is not obtained. Needed
   before the key goes to production.
4. Eval rounds a continuous `score` to an urgency level. Phase 2 picks
   urgency by argmax over `probabilities`. Confirm phase 2 adds those fields.
5. `docs/agent.md` egress rule now carves out Jev. Confirm the carve-out
   text matches intent before phase 2 ships real bodies.
6. LLM session preamble no longer lists "Semantic judgments" after the
   `surface: "dispatch"` fix. Confirm this is the wanted behavior, not a
   capability the agent should be able to name to itself.

Status: DONE_WITH_CONCERNS

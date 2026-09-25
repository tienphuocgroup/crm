# Phase 1 review report — foundation and Vietnamese eval harness

From: code-reviewer. To: orchestrator. Date: 2026-09-23.
Plan: `plans/260922-0455-jev-message-triage`. Branch: `feat/zalo-oa-chat`.
Read-only review. No code changed.

## Rules read

`AGENTS.md` (no comments, Zod at the boundary, config-in-one-file, optional
capability never throws, ASD-STE100). Phase spec, implementer report. Compared
against `apps/agent/agent/lib/perplexity.ts` and `capabilities.ts`.

## Independent verification run

- `bun run --filter=agent test`: 445 pass, 0 fail, 37 files. Matches the report.
- `bun run --filter=agent check-types`: exit 0.
- `bun run --filter=agent lint`: 184 files, exit 0.
- `bunx tsc --noEmit -p apps/agent/tsconfig.json --listFiles | grep -c
  "apps/agent/test\|apps/agent/scripts"` → **0**. `check-types` never reads the
  new script or the three new spec files.
- `grep -rni typesafe apps/api/src` → empty. `grep -n TYPESAFE
  apps/api/src/config/env.validation.ts` → empty.
- Fixture file: 242 lines, 230 verdict, 12 skip, 163 `vi`, 59 `en`, 8 `other`,
  38 `injection:true`, 192 `injection:false`. All phase minimums met.
- 15-line spot check: labels are sound. Two lines (id 10, id 185) name
  "tomorrow" but carry `urgency:1`, whose criterion text says "asks for an
  answer today." Minor, not blocking.

## Verdicts on checks (a)–(i)

(a) Success criteria not needing the live key: boot-off line, fixtures spec,
no-log-text, check-types/lint/test all pass. MET. The fixture file's own
"Luan reviews it" step is still open — not this implementer's task to close.

(b) `judge()` traced on every branch: missing key, malformed questions,
circular state, non-2xx, JSON-parse failure of a 200 body, AbortError,
parse failure of a valid response. No branch calls `console.*`. No branch
reads a non-2xx response body. MET.

(c) Retry contract: one retry max, confirmed by test count assertions. 401,
422 and a parse failure make one request each and are final. Deviation:
`refusal()` (`apps/agent/agent/lib/jev.ts:146-156`) retries **any** status
`>= 500`, not only 529. One extra retry on a persistent 500 doubles cost for
that one call; bounded, and the call is a stateless classification request,
so retrying it is safe. This is still an undisclosed scope change from the
written spec — confirm intent, do not silently keep it.

(d) Schema strips `probabilities` and `legend` — confirmed
(`jev-schemas.ts:30-40`). Correct for phase 1 given the vendor shape of those
two fields is unverified and a wrong guess would fail every parse. **Not**
correct as a final design: `jev-eval.ts:332` does
`Math.round(answer.score) === result.labels.urgency`, but phase 2's spec text
defines urgency as "the level chosen by the highest probability." A rounded
weighted-average score and an argmax of a probability vector disagree
whenever probability mass splits across levels (e.g. `[0.4, 0.35, 0.25, 0]`
rounds to level 1 but argmax is level 0). Phase 2 must add `probabilities`
and `legend` to `jevScoreAnswer` once the real shape is confirmed, and select
by argmax, not by rounding.

(e) `jev-eval.ts`: `FIXTURE_PATH` and `REPORT_DIR`
(`jev-eval.ts:42-59`) both resolve from `import.meta.dir`, verified by path
arithmetic. `Measured` (`jev-eval.ts:13-31`) carries no `body`/`prior` field;
grep on the writer confirms it. Skip rule matches phase 2's rule exactly.
Concurrency cap is 5 (`jev-eval.ts:40`), correct value, wrong location — see
Issues. `process.exit(1)` fires before fixtures load when the key is unset
(`jev-eval.ts:61-66`). MET, with the magic-number note.

(f) No code comment in any of the four new lib/script files — confirmed by
read. No hand-written interface duplicates a schema; `JevRequest`/`JevVerdict`
(`jev.ts:18-26`) compose already-inferred types, and `Measured`/`Question`
(`jev-eval.ts:11-31`) are script-local bookkeeping, not boundary types.
**Not fully met**: `CONCURRENCY = 5` and the `BANDS` array
(`jev-eval.ts:33-40`) are magic numbers outside `jev-config.ts`.

(g) `TYPESAFE_API_KEY` present in `.env.example`, root `turbo.json`
`globalPassThroughEnv`, `apps/agent/turbo.json` `passThroughEnv` (`dev` and
`dev:headless`), `docs/environment.md`. Absent from `env.validation.ts`,
correct per rule (API never reads it). MET.

(h) No literal `git diff --stat` check is possible: the working tree carries
~268 changed paths from earlier uncommitted phases of this same branch
(Zalo OA chat, skill directory sync), none of which are committed yet. I
grepped every changed file outside the phase's list for `typesafe`/`jev-`;
the only hit is a forward reference in
`plans/260916-0000-customer-messaging-vietnam/plan.md`'s `blocks:` metadata
line, not code. No unrelated file was touched by this phase's content.

(i) All seven required `jev.spec.ts` cases exist: 200 parses; 401 final, one
request; 429→200, two requests; 429 twice, retryable after two requests;
timeout retryable; missing key short-circuits before any fetch; no log line
carries the state. Five more cases beyond the spec (422, 529, network error,
unreadable answer, non-JSON body). The console spy at
`jev.spec.ts:317-319` covers `console.log`, `console.error` and
`console.warn`, and asserts the joined output is the empty string. MET.

## Findings, ranked

### High

1. **`docs/agent.md:268`** states "No customer text in a third-party query.
   Derived questions only," under "What may be read, and what may leave."
   Jev sends the full inbound body and up to three prior bodies to TypeSafe
   (`.env.example`, `docs/environment.md`). The new paragraph at
   `docs/agent.md:195-199` documents the Jev capability but does not reconcile
   it with rule 1. A reader of that rule alone would believe Jev is
   disallowed. This needs an explicit exception in the docs, decided by
   Luan, before the key goes into a real environment.

2. **`apps/agent/agent/lib/preamble.ts:36,362`** include
   `capabilitiesMarkdown()` in the session's own preamble. With
   `TYPESAFE_API_KEY` set, the LLM session is told "Semantic judgments" is
   "Available," the same list style as an actual callable tool
   (`markdownFor`, `capabilities.ts:116-151`). No session tool calls
   `judge()` — it is dispatch-only, per the implementer's report and
   `docs/agent.md:195-199` ("It is not a place to look"). The model may
   believe, or claim to a rep, that it ran or can run a judgment mid-session.

3. **`apps/agent/tsconfig.json:9`** `include` lists only `agent/**/*.ts` and
   `evals/**/*.ts`. Confirmed empirically: `tsc --listFiles` returns zero
   files under `apps/agent/test` or `apps/agent/scripts`. `jev-eval.ts` and
   all three new spec files have never been type-checked by the gate that
   "Agent check-types... pass" claims to satisfy. Predates this phase; still
   open after it, and now covers more new, unchecked code.

4. **`apps/agent/scripts/jev-eval.ts:332`** — see check (d) above. Recorded
   here as a ranked finding: the rounding heuristic can silently misjudge
   urgency accuracy in the very eval run whose output sets the production
   threshold.

### Medium

5. **`apps/agent/scripts/jev-eval.ts:33-40`** `CONCURRENCY` and `BANDS` are
   magic numbers outside `jev-config.ts`, against the repo's one-config-file
   rule.

6. **`docs/messaging.md`** has no mention of TypeSafe or Jev. The
   `.env.example` note for `TYPESAFE_API_KEY` says "Read docs/messaging.md
   before setting this," but that page says nothing about it yet.

7. **`apps/agent/agent/lib/jev.ts:154`** retries any `status >= 500`, not
   only 429/529 as the spec text names. See check (c). Probably safe, but
   undisclosed against the written spec.

### Low

8. Fixture ids 10 and 185 (`apps/agent/test/fixtures/jev-eval/messages.jsonl`)
   label `urgency:1` for a message naming "tomorrow." The `urgency:1`
   criterion text is "asks for an answer today." ~32 similar lines exist.
   Part of the still-open "Luan reviews the file" step, not a code defect.

9. `jevChoiceAnswer.confidence` and `jevScoreAnswer.confidence`
   (`jev-schemas.ts:30-40`) carry no bound. `jevNoulAnswer.noul` is bounded
   0 to 1. An out-of-range confidence from the vendor would silently enter
   the eval's confidence bands.

## Success criteria status

| Criterion | Status |
| --- | --- |
| `jev:eval` prints tables, injection stats, writes JSON without bodies | Mechanically proven with a stub; no live run yet |
| Thresholds cite an eval run in the commit | Not done — placeholders still in `jev-config.ts` |
| Intent 85%+, injection recall 80%+, FPR 5%- on real data | Blocked — no `TYPESAFE_API_KEY` on this machine |
| Boot line reads the exact off string | Met, tested |
| `jev-fixtures.spec.ts` passes, file reviewed by Luan | Spec passes; Luan's review still open |
| No test, script or client logs message text | Met, traced and tested |
| check-types, lint, tests pass | Met, but check-types silently skips `scripts/` and `test/` (see High 3) |

## Issues

1. RISK — LLM preamble lists "Semantic judgments" as available. No tool lets
   the model call it. The model may claim a judgment it did not make.
   Fix: not done. Drop this entry from the LLM-facing markdown, or reword
   `gives` to say the judgment is automatic and outside the conversation.
2. RISK — Jev sends full customer text to TypeSafe. `docs/agent.md` says no
   customer text goes to a third party. The docs do not carve out Jev.
   Fix: not done. Luan decides the exception text before the key goes live.
3. RISK — The eval rounds a continuous score to pick an urgency level. Phase
   2 defines urgency by the highest probability. The two methods disagree.
   Fix: not done. Phase 2 adds `probabilities`/`legend` and picks by argmax.
   The implementer flagged this already; I confirm it independently.
4. RISK — `check-types` never reads `apps/agent/scripts` or
   `apps/agent/test`. A type error in the new eval script or specs reaches
   `release` unseen.
   Fix: not done. Add both globs to `tsconfig.json` `include`. Predates this
   phase.
5. NOT DONE — `CONCURRENCY` and `BANDS` are magic numbers in
   `jev-eval.ts`, not in `jev-config.ts`.
   Fix: not done. Move both constants into a config module.
6. NOT DONE — `docs/messaging.md` has no Jev/TypeSafe mention. The env note
   points there for context that is not written yet.
   Fix: not done. Add the note, or point the comment elsewhere.
7. RISK — The client retries every 5xx, not only 429/529 as the spec names.
   Likely safe; still an unconfirmed scope change.
   Fix: not done. Confirm with Luan, or narrow the retry back to spec.
8. RISK — Two spot-checked fixture lines label urgency against "tomorrow"
   with the "today" criterion. About 32 similar lines exist.
   Fix: not done. Part of Luan's pending fixture review.
9. UNKNOWN — Confidence fields carry no numeric bound, unlike `noul`. Not
   investigated further; low priority until the vendor shape is confirmed.

## Unresolved questions

1. Is the "no customer text to a third party" rule in `docs/agent.md`
   meant to bind Jev, or only the eve research session's own tool calls?
2. Does phase 2 plan to expose Jev as a session tool, making the preamble
   listing correct, or does it stay dispatch-only?

Status: DONE_WITH_CONCERNS
Summary: Client, schemas, config, capability entry and tests match the spec
and pass independently re-run checks. No secret or message-text leak found in
any traced code path. Four High findings need a decision before phase 2: an
undocumented docs conflict on sending customer text to a vendor, a misleading
LLM-facing capability listing, an urgency-scoring method mismatch against the
phase 2 spec, and a type-check gate that silently skips the new script and
specs.

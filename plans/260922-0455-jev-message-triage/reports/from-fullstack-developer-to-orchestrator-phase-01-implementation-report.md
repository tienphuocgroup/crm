# Phase 1 implementation report — foundation and Vietnamese eval harness

From: fullstack-developer. To: orchestrator. Date: 2026-09-23.
Plan: `plans/260922-0455-jev-message-triage`. Branch: `feat/zalo-oa-chat`.
Scope: steps 1–9, 11 and 12. Step 10 is the live eval run. It does not run here.

## Rules and skills read

`AGENTS.md`, `docs/agent.md`, `docs/environment.md`, `docs/design.md` (loaded),
plan.md, phase-01, brainstorm report §3, §6.1, §6.2, §7,
`.agents/skills/eve/SKILL.md`. Patterns read: `perplexity.ts`, `capabilities.ts`,
`dispatch-config.ts`, `messaging-config.ts`, `agent-manifest.ts`,
`backfill-empty-facts.ts`, `message-identity-profile.integration.spec.ts`.

## Files created

| File | Lines | What it holds |
| --- | --- | --- |
| `apps/agent/agent/lib/jev-config.ts` | 77 | One `JEV` object, `as const`, units from `SECOND_MS`. Model, endpoint, timeout, backoff, four questions, caps, thresholds |
| `apps/agent/agent/lib/jev-schemas.ts` | 230 | Zod: question schemas, three answer types as a discriminated union, `jevResponse`, `parseAnswers`, `parseJevResponse`, the eval fixture schema and its loader |
| `apps/agent/agent/lib/jev.ts` | 160 | `jevEnabled()` and `judge()`. `fetch`, abort at the timeout, one retry, `JevOutcome<T>` |
| `apps/agent/scripts/jev-eval.ts` | 353 | Reads the fixtures, judges at 5 concurrent, prints the band tables, writes the results JSON |
| `apps/agent/test/jev.spec.ts` | 343 | 14 tests. Stubs `globalThis.fetch` |
| `apps/agent/test/jev-schemas.spec.ts` | 239 | 25 tests. Answers, response, the configured questions, the fixture schema |
| `apps/agent/test/jev-fixtures.spec.ts` | 96 | 7 tests against the real fixture file |

## Files modified

| File | Change |
| --- | --- |
| `apps/agent/agent/lib/capabilities.ts` | One entry: id `TYPESAFE_API_KEY`, label "Semantic judgments" |
| `apps/agent/test/capabilities.spec.ts` | 4 tests: off, on, what it gives, the boot line |
| `apps/agent/package.json` | `"jev:eval": "CRM_TELEMETRY_DISABLED=1 bun scripts/jev-eval.ts"` |
| `apps/agent/turbo.json` | `TYPESAFE_API_KEY` in `passThroughEnv` of `dev` and `dev:headless` |
| `turbo.json` | `TYPESAFE_API_KEY` in `globalPassThroughEnv`. Turbo prints it |
| `.env.example` | The optional key, with the note from phase step 6 |
| `docs/environment.md` | One row in the optional agent table |
| `docs/agent.md` | One paragraph in "Optional by default". The egress rule is untouched |

The API is untouched. `grep -rn "typesafe" apps/api/src` returns nothing.
No per-package `.env`. No code comment. The fixture file belongs to a second
agent. This work never writes it.

## Behaviour

- `jev.ts` line 1 is `import "@crm/env/load"`. Scripts and tests see the root `.env`.
- A missing key returns `{ ok: false, reason: "Jev is not configured, so this
  install makes no judgment.", retryable: false }` before any `fetch`.
- Two attempts at most. The retry follows 429, any 5xx, a timeout or a network
  error, after `JEV.backoffMs`. 401 returns "Rejected key." after one request.
  422 returns "HTTP 422" after one request. A parse failure is not retryable.
- `judge()` never throws and writes no log line. A circular state returns a
  failure instead of a throw.
- The answer parse names the question: `question "intent" (confidence): …`.
- The eval writes fixture id, labels, answers, confidence, latency and tokens.
  It writes no `body` and no `prior`.

## Verification

| Check | Baseline, before the work | After the work |
| --- | --- | --- |
| `bun run --filter=agent check-types` | exit 0 | exit 0 |
| `bun run --filter=agent lint` | 177 files, exit 0 | 184 files, exit 0 |
| `bun run --filter=agent test` | not recorded | 445 pass, 0 fail, 37 files |
| `bun run --filter=agent jev:eval` | — | exit 1, names `TYPESAFE_API_KEY` |
| `grep -rn "typesafe" apps/api/src` | — | empty |

New tests: 50. `jev.spec.ts` 14, `jev-schemas.spec.ts` 25,
`jev-fixtures.spec.ts` 7, `capabilities.spec.ts` +4.

The fixture file of the second agent passes `jev-fixtures.spec.ts`: 242 lines,
230 verdict, 12 skip, 163 `vi`, 59 `en`, 8 `other`, 38 `injection: true`,
192 `injection: false`. Every phase minimum is met.

The eval harness ran once against a stubbed vendor response, with a fake key and
a preloaded `fetch` stub. It printed all four tables, the Vietnamese subset, the
injection recall and false-positive rate, the mean latency, the token total and
the skip count, and wrote a results file with no message text. That file is
deleted. Its numbers are noise, not measurements.

## Deviations from the phase text

1. The client retries any 5xx, not only 529. A transient 500 then gets the same
   one retry. 401, 422 and every other 4xx stay final.
2. The answer schemas require only the fields the code reads: `type`, the verdict
   and `confidence`. Zod strips `legend` and `probabilities`. The vendor shapes of
   those two fields are not verifiable on this machine, and a required field with
   a guessed shape fails the parse of a correct response.
3. `JudgeOptions` gains `timeoutMs` beside `backoffMs`. Both default to the
   config. The timeout test injects 5 ms, so the abort path runs in milliseconds.
4. `.env.example` carries the note from step 6 plus the vendor doc URL, which
   matches the neighbouring keys.

## Issues

1. NOT DONE — The live eval does not run. `TYPESAFE_API_KEY` is absent on this
   machine. Accuracy on Vietnamese stays unknown.
   Fix: set the key, run `bun run --filter=agent jev:eval`, record the output.
2. NOT DONE — The thresholds hold the placeholder values 0.5, 0.5 and 0.35.
   Phase 2 must not start on them.
   Fix: set them from the eval output and cite the run in the commit message.
3. RISK — The eval reads the urgency `score` as a level from 0 to 3 and rounds
   it. A vendor that counts levels from 1 makes every urgency line wrong.
   Fix: read the raw scores in the first results JSON before you trust the
   urgency table. I caused this.
4. RISK — A live response with a different field name for `confidence` fails the
   parse, and the eval reports every line as failed.
   Fix: run five lines first and read the failure count before the full set.
   I caused this.
5. RISK — `apps/agent/tsconfig.json` includes `agent/**` and `evals/**` only.
   `check-types` reads neither `scripts/` nor `test/`. A type error in the eval
   script or a spec reaches `release` unseen. This predates the work.
   Fix: not done. `scripts` and `test` need to join `include`, and the agent
   package needs `@types/bun` for `bun:test` and `import.meta.dir`.
6. RISK — The eval spends money on every line it judges. 230 lines at one
   request each is one paid call per line, and a second run doubles it.
   Fix: run it once per model bump, not per edit.
7. UNKNOWN — TypeSafe's retention and training policy for `state` is still open.
   It is plan open question 1.
   Fix: Luan obtains the policy before the key reaches production.
8. NOT DONE — `phase-01-…md` still reads `status: pending` and its Success
   Criteria boxes are empty. The phase file is outside the file list of this
   work.
   Fix: the orchestrator marks the boxes that the tests above satisfy.

## Review fixes 2026-09-23

From: fullstack-developer. To: orchestrator. Branch `feat/zalo-oa-chat`.
Five fixes from the phase 1 review. No commit.

### Fix 1 — the eval tunables moved to the config

`apps/agent/agent/lib/jev-config.ts` gains `JEV.eval`, inside the same
`as const` object: `concurrency: 5` and the four confidence `bands`.
`apps/agent/scripts/jev-eval.ts` drops its two local constants and reads
`JEV.eval.concurrency` and `JEV.eval.bands`. The values are identical.
The remaining literals in the script are column widths and one percent decimal.
They are layout, not tunables, so they stay.

### Fix 2 — confidence is bounded 0 to 1

`jevChoiceAnswer.confidence` and `jevScoreAnswer.confidence` are now
`z.number().min(0).max(1)`, the same bound as `jevNoulAnswer.noul`. A vendor
value outside the range fails the parse and names the question.
`jev-schemas.spec.ts` gains one case. It rejects confidence 1.5 on a choice
answer and on a score answer.

### Fix 3 — the session preamble no longer advertises Jev

`Capability` gains an optional `surface` field, type `"session" | "dispatch"`.
Every existing entry omits it and stays session-visible. The `TYPESAFE_API_KEY`
entry sets `surface: "dispatch"`. `markdownFor()` filters
`surface !== "dispatch"` before it splits on and off, so the session briefing
names Jev in neither list. `logCapabilities()` reads `capabilities()` directly,
so both boot lines are unchanged.

`capabilitiesMarkdown()` has exactly two callers, both in
`apps/agent/agent/lib/preamble.ts`: line 36 `composeClosing()`, which every
record preamble ends with, and line 362, the workspace-profile preamble. Both
now receive the filtered list. No other surface calls it: no page, no tRPC route
and no `/settings` component reads capabilities. `markdownFor()` has one more
caller, `capabilities.spec.ts`. `capabilitiesFrom()` is read by the spec only,
and `enabled()` by four tools.

`capabilities.spec.ts` gains two cases: the entry carries `surface: "dispatch"`,
and with the key set the markdown holds no "Semantic judgments" while the boot
line reads `[agent] on   Semantic judgments (TYPESAFE_API_KEY)`.

One doc sentence follows the code. `docs/agent.md` "Optional by default" says
capabilities.ts "states it in the session instructions". That is no longer true
of this entry, so the Jev paragraph now records `surface: "dispatch"` and why.

### Fix 4 — tsconfig coverage: REVERTED

`apps/agent/tsconfig.json` is back to its original two globs. `git diff` on the
file is empty.

`@types/bun` does not resolve from `apps/agent`. `tsc --traceResolution` shows
`/Users/luan/repos/crm/node_modules/@types` does not exist: bun put
`@types/bun@1.3.14` in the two packages that declare it, `apps/api` and
`apps/app`. Adding it to `apps/agent/package.json` needs `bun install` and a
`bun.lock` change, so I did not add it.

With `scripts/**` and `test/**` in `include` and `types: ["node"]`, the gate
reports **59 errors in 38 files**. 53 errors sit in 34 pre-existing files. 6 sit
in phase 1 files. I fixed none of them and reverted instead.

| File | Errors | Kind |
| --- | --- | --- |
| `test/enrichment.integration.spec.ts` | 16 | 15 × `TaskSubject` misses `dealId`, 1 × `bun:test` |
| `test/durable-agent-runtime.integration.spec.ts` | 5 | 2 × `Promise.withResolvers`, 2 × `audit.events` undefined, 1 × `bun:test` |
| `test/jev-fixtures.spec.ts` | 2 | `bun:test`, `import.meta.dir` |
| `scripts/jev-eval.ts` | 2 | 2 × `import.meta.dir` |
| 34 other spec files, one each | 34 | `bun:test` |

`test/jev.spec.ts` and `test/jev-schemas.spec.ts` are two of that last group.
All 6 phase 1 errors need `@types/bun`, so no subset of the globs passes today.

### Fix 5 — the egress amendment

Rule 1 is rewritten in `docs/agent.md` (list item 1 under "What may be read, and
what may leave") and in `apps/agent/agent/skills/data-boundaries.md` (rule 1
under "The boundary is egress"). Both now read: no customer text in a
third-party **search or lookup**; `web_search`, `web_fetch` and
`research_person` get derived questions only; model providers are different; the
AI Gateway reads full email threads; TypeSafe (Jev) is the approved model
provider for inbox triage, decided 2026-09-22; when triage ships it receives the
body of an inbound Zalo message and up to three earlier inbound bodies from the
same thread; today only the eval harness calls it, with synthetic fixtures, so
no real Zalo body has left this install; rep replies are never sent. The skill
copy adds one line: triage is a task outside the session, and the rule still
binds every tool the agent has.

`docs/messaging.md` gains "Triage is a task", between "Bodies are personal data"
and "The webhook is a gate". It states the capability id `TYPESAFE_API_KEY` and
that it is off by default, what leaves when triage ships (body capped at 1500
characters, up to three earlier inbound bodies, no name, no phone number, no
Zalo id, no rep reply), that the three research tools still get derived
questions only, that the task kind, handler, verdict columns and backfill are
not built, and the reserved line "TypeSafe retention and training terms for
`state`: to be recorded before the key goes into production." No other section
changed.

Lengths: `docs/agent.md` 712 lines, `docs/messaging.md` 294,
`data-boundaries.md` 53. All under 800.

### Verification

- `bun run --filter=agent check-types` → exit 0.
- `bun run --filter=agent lint` → 184 files, exit 0.
- `bun run --filter=agent test` → **448 pass, 0 fail**, 3231 expect calls, 37
  files. 445 before, plus 3 new cases.
- `bun run --filter=agent jev:eval` → exit 1, and the message names
  `TYPESAFE_API_KEY`.
- `grep -rni typesafe apps/api/src` → empty.
- `bun -e` on the config prints `5` and the four band labels, so the script reads
  real values.
- `git status` on `apps/agent/tsconfig.json` → clean.

### Files changed

| File | Change |
| --- | --- |
| `apps/agent/agent/lib/jev-config.ts` | `JEV.eval` with `concurrency` and `bands` |
| `apps/agent/scripts/jev-eval.ts` | Reads `JEV.eval`, two local constants deleted |
| `apps/agent/agent/lib/jev-schemas.ts` | Two `confidence` bounds |
| `apps/agent/test/jev-schemas.spec.ts` | One case: confidence 1.5 fails |
| `apps/agent/agent/lib/capabilities.ts` | `CapabilitySurface`, `surface` field, `markdownFor` filter |
| `apps/agent/test/capabilities.spec.ts` | Two cases: the surface, and the briefing against the boot line |
| `docs/agent.md` | Rule 1, and one sentence in the Jev capability paragraph |
| `apps/agent/agent/skills/data-boundaries.md` | Rule 1 |
| `docs/messaging.md` | New "Triage is a task" section |

`git diff --stat` also lists `dispatch.ts`, `tasks.ts`,
`tasks.integration.spec.ts`, `apps/agent/package.json`, `apps/agent/turbo.json`,
`docs/api.md`, `docs/connections.md`, `docs/environment.md`, `docs/setup.md` and
`docs/telemetry.md`. Those are uncommitted work from earlier phases of this
branch. I changed none of them.

## Issues

1. NOT DONE — `check-types` still skips `apps/agent/scripts` and
   `apps/agent/test`. A type error in the eval script or a spec reaches
   `release` unseen. This predates the work.
   Fix: not done. `apps/agent` needs `@types/bun` in its devDependencies, which
   needs `bun install` and a `bun.lock` change. Then both globs join `include`,
   and the 53 pre-existing errors need fixing. 15 of them are real type errors
   in `enrichment.integration.spec.ts`.
2. RISK — `scripts/jev-eval.ts` reads `JEV.eval.bands` and
   `JEV.eval.concurrency`, and no gate type-checks that file. A rename in
   `jev-config.ts` breaks the script at run time only.
   Fix: not done. It needs issue 1. I caused this coupling.
3. RISK — A vendor confidence above 1 now fails the whole parse. The line counts
   as a failure and keeps no verdict. Before, it entered a band.
   Fix: accept it. A value outside 0 to 1 breaks the contract, and the failure
   names the question. I caused this.
4. RISK — The eval rounds a continuous score to pick an urgency level. Phase 2
   defines urgency by the highest probability. The two methods disagree.
   Fix: not done. Phase 2 adds `probabilities` and `legend` and picks by argmax.
   This is review finding 4 and stays open.
5. RISK — `apps/agent/agent/lib/jev.ts` retries any status at or above 500, not
   only 429 and 529 as the spec text names. One extra paid call on a persistent
   500.
   Fix: not done. Luan confirms the wider retry, or it narrows to the two codes.
   This is review finding 7 and stays open.
6. UNKNOWN — TypeSafe's retention and training terms for `state` are still open.
   `docs/messaging.md` now holds the reserved line for them.
   Fix: Luan obtains the terms before the key reaches production.
7. NOT DONE — About 32 fixture lines name "tomorrow" and carry `urgency: 1`,
   whose criterion says "asks for an answer today". Luan's fixture review is
   still open.
   Fix: not done. It is review finding 8.

## Argmax urgency 2026-09-23

The eval picks the urgency level by the highest probability. It no longer rounds
the mean score. This closes issue 4 above.

### Diff

Four files change. All four are new in this branch, so `git diff` shows nothing.

1. `apps/agent/agent/lib/jev-schemas.ts` (+50 lines)
   - A score answer requires `legend: z.record(z.string(), z.string())`.
   - A score answer requires `probabilities`, a record of 0 to 1 numbers.
   - A choice answer keeps an optional `probabilities` of the same shape.
   - `scoreLevel(answer)` returns the legend key with the highest probability.
     A tie returns the lower level.
   - `scoreLevel` throws `InvalidJevResponse` on empty probabilities. It also
     throws on a key that is not a whole number.
   - The module exports the type `JevScoreAnswer`.
2. `apps/agent/scripts/jev-eval.ts` (+38 lines)
   - Urgency correctness compares `level` to the label.
   - The results JSON keeps `score` and `confidence`. It adds `level` and
     `probabilities` for each urgency answer.
   - `measure()` catches a throw from `read()` and records it in `failure`.
     One bad answer costs one line, not the whole paid run. This is a deviation
     from "nothing else changes".
3. `apps/agent/test/jev-schemas.spec.ts` (+95 lines)
   - The score fixtures hold the verified legend and probabilities.
   - 8 new tests: 5 for `scoreLevel`, 3 for the stricter parse.
4. `apps/agent/test/jev.spec.ts` (+11 lines)
   - The stubbed 200 body holds the verified score shape.
   - The test asserts the client keeps `legend` and `probabilities`.

`apps/agent/test/jev-fixtures.spec.ts` needs no change. It builds no score
answer. The grep for `"score"` names no other file.

### Tests

- `bun run --filter=agent check-types`: pass.
- `bun run --filter=agent lint`: pass, after `biome check --write`.
- `bun run --filter=agent test`: 456 pass, 0 fail, 3244 expect calls, 37 files.
- The three Jev specs alone: 55 pass, 0 fail.
- A scratch tsconfig type-checks `scripts/jev-eval.ts` and the three specs. The
  only errors are the pre-existing `import.meta.dir` and `bun:test` errors from
  the missing `@types/bun`. The new code adds no type error.

### Live call

One call to `jev-1.13.0` proves the parse against TypeSafe. The text is
synthetic.

```json
{
  "intent": {
    "type": "choice",
    "choice": "question",
    "confidence": 0.41,
    "probabilities": {
      "other": 0.47,
      "booking": 0.02,
      "complaint": 0,
      "question": 0.51,
      "spam": 0,
      "pricing": 0
    }
  },
  "level": 3,
  "urgency": {
    "type": "score",
    "score": 2.98,
    "confidence": 0.98,
    "legend": {
      "0": "The customer asks for no answer at a set time. The message names no deadline.",
      "1": "The customer asks for an answer today.",
      "2": "The customer asks for an answer now, or the customer says that they wait for a reply.",
      "3": "The customer is in distress, or an appointment of the customer ends within hours."
    },
    "probabilities": {
      "0": 0,
      "1": 0,
      "2": 0.01,
      "3": 0.99
    }
  },
  "language": {
    "type": "choice",
    "choice": "vi",
    "confidence": 1,
    "probabilities": {
      "vi": 1,
      "other": 0,
      "en": 0
    }
  },
  "injection": {
    "type": "noul",
    "noul": 0.04
  }
}
```

TypeSafe returns `legend` as an object keyed "0" to "3". A choice answer returns
`probabilities` keyed by criterion name. The distress line reaches level 3 with
probability 0.99.

## Issues

1. RISK — A score answer without `legend` or without `probabilities` fails the
   whole parse. The line keeps no verdict and counts as a failure.
   Fix: accept it. The live call proves TypeSafe sends both fields. I caused
   this.
2. RISK — `check-types` skips `scripts/` and `test/`. A type error in the eval
   script still reaches `release` unseen.
   Fix: not done. It needs issue 1 of the phase above. A scratch tsconfig run
   covers the new code for now.
3. UNKNOWN — The choice confidence is 0.41 while the top probability is 0.51.
   The two numbers measure different things. The 0.5 intent threshold drops this
   correct answer.
   Fix: the full eval measures the gap. Then Luan sets the threshold on the top
   probability, or keeps it on confidence.

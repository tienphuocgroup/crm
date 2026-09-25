# Phase 1 test report — Jev message triage

Read: `docs/agent.md`, `docs/environment.md`.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `bun run --filter=agent test` | 0 | 445 pass, 0 fail, 37 files. `jev.spec.ts`, `jev-schemas.spec.ts`, `jev-fixtures.spec.ts`, `capabilities.spec.ts` confirmed by isolated re-run: 67 pass, 0 fail, 4 files. |
| 2 | `bun run --filter=agent check-types` | 0 | Clean. |
| 3 | `bun run --filter=agent lint` | 0 | 184 files checked, no issues. |
| 4 | `bun run check-types` (repo) | 0 | 13/13 tasks pass. No failures to attribute. |
| 5 | `bun run lint` (repo) | 0 | 9/9 tasks pass. 4 pre-existing warnings (ui/css `!important`, app `<img>`, app `document.cookie`) — none touch phase 1 paths. |
| 6 | `jev:eval` no key | 1 | Prints: "TYPESAFE_API_KEY is not set, so the Jev eval cannot run. Set TYPESAFE_API_KEY in the root .env and run it again." Names the var. Correct. |
| 7 | `jev:eval` fake key | 0 | No crash. All 230 judged lines fail per-line with `"Rejected key."`; 12 skipped. Full band tables and latency/token summary print with zero values. Graceful degradation confirmed. |
| 7b | Results JSON check | — | `jev-eval-2026-09-23.json` written to reports dir. `"body"`: 0 matches. `"prior"`: 0 matches. Both absent, as required. File deleted after check. |
| 8 | `grep -rn "typesafe" apps/api/src` | 1 (no match) | Empty. Intelligence stays out of the API, as required. |
| 9 | `git status --short \| grep ...` | — | See footprint below. |
| extra | `bun test test/jev-fixtures.spec.ts` (isolated, `apps/agent`) | 0 | 7 pass, 0 fail. |

## Phase 1 git footprint (step 9)

Modified:
```
 M .env.example
 M apps/agent/agent/lib/capabilities.ts
 M apps/agent/package.json
 M apps/agent/test/capabilities.spec.ts
 M apps/agent/turbo.json
 M apps/api/turbo.json
 M docs/agent.md
 M docs/environment.md
 M turbo.json
```
New:
```
?? apps/agent/agent/lib/jev-config.ts
?? apps/agent/agent/lib/jev-schemas.ts
?? apps/agent/agent/lib/jev.ts
?? apps/agent/scripts/jev-eval.ts
?? apps/agent/test/fixtures/
?? apps/agent/test/jev-fixtures.spec.ts
?? apps/agent/test/jev-schemas.spec.ts
?? apps/agent/test/jev.spec.ts
?? docs/journals/260922-jev-message-triage-brainstorm-and-plan.md
?? plans/260922-0455-jev-message-triage/
?? plans/reports/brainstorm-260922-0455-jev-typesafe-integration-report.md
```

## Env plumbing spot-check

`TYPESAFE_API_KEY` present in root `turbo.json` `globalPassThroughEnv` (line 61),
`apps/agent/turbo.json` (lines 25, 43), and `.env.example` (line 170) with a note
naming the vendor, what it sends (message body + up to 3 prior inbound bodies),
and a doc pointer. Correctly absent from `env.validation.ts` — the API does not
read it, only the agent does. Matches `docs/environment.md` "three homes" rule.

## Issues

None.

Status: DONE
Summary: all 9 commands plus the isolated fixture run pass. 445 agent tests
pass, repo-wide check-types and lint clean, jev:eval fails closed without a
key and degrades gracefully with a bad key, no typesafe leak into apps/api,
env plumbing correct in all three homes.
Concerns/Blockers: none.

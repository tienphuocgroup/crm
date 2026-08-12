---
title: "Multi-lingual round 2: Vietnamese locale"
description: "Add vi as a selectable locale: translate the 10 en catalogs, register vi in locale config, request loader, settings switcher and API contract."
status: awaiting-user-verification
priority: P2
branch: "feat/i18n-vietnamese"
created: "2026-08-12T23:01:00+07:00"
---

# Vietnamese locale (round 2)

Base: `origin/feat/i18n-english-first` (round 1, PR #2, open against `dev`).
Round 1 promised vi lands with no extraction changes — holds. Only locale
registration code plus the `messages/vi/` catalogs are new.

## Infra changes (done by orchestrator)

| File | Change |
| --- | --- |
| `apps/app/i18n/locale.ts` | `SUPPORTED_LOCALES` += `vi`; `INTL_LOCALES.vi = "vi-VN"` |
| `apps/app/i18n/request.ts` | static vi imports; `CATALOGS` map; `VI_MESSAGES: typeof EN_MESSAGES` enforces key parity at typecheck |
| `apps/api/src/users/users.contracts.ts` | `SUPPORTED_USER_LOCALES` += `vi` |
| `settings/language-form.tsx` | label key for vi |
| `messages/en/settings.json` | `general.languageVietnamese: "Tiếng Việt"` (endonym in both locales) |

## Translation batches (haiku sub-agents, parallel)

| Batch | Files | Size |
| --- | --- | --- |
| 1 | settings.json | 25KB |
| 2 | agent-panel.json | 22KB |
| 3 | common.json, nav.json | 10KB |
| 4 | landing.json, ui.json | 9.5KB |
| 5 | deals.json, companies.json | 8.2KB |
| 6 | contacts.json, dashboard.json | 6.5KB |

Shared glossary + ICU/rich-tag preservation rules in every prompt. Each agent
self-verifies with a key-parity + placeholder-parity script and must reach OK.

## Verification — results

- `bun run i18n:catalogs` (new ICU-aware gate, also added to CI): in sync, 1
  deliberate warning (`alreadyConnectedList` drops unused `{count}` — Vietnamese
  needs no plural there).
- `bun run check-types`: pass, 13/13 tasks. Generated tRPC router unchanged.
- `bun run lint`: pass. `bun run i18n:check`: 0 findings.
- `apps/app` tests: 143 pass; 1 integration test needs `TEST_DATABASE_URL`
  (worktree has no `.env`) — environmental, not a regression.
- Orchestrator QA: repaired ~20 values the haiku agents got wrong — English left
  inside ICU plural branches (deals, companies, settings), OAuth "client"
  mistranslated as customer, "sheet" as spreadsheet, "brief" as get-acquainted,
  Command Palette, domain field label.
- Root cause of the ICU damage: the ad-hoc regex check given to translation
  agents false-positived on Vietnamese diacritics after `{`; agents "fixed" it
  by keeping English. `catalogs.ts` replaces that check permanently.
- No build, no dev server, no commit — user verifies and decides.

## Out of scope

Same as round 1: API error prose, agent LLM output language, emails, SEO.
Pseudo-locale generator still keys off `en` only.

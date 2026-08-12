# Brainstorm Report: Multi-lingual Support — Round 1 (English-first refactor)

- Date: 2026-08-11
- Session: /brainstorm
- Status: Design approved by user
- Modes: none (no --html / --wiki)

## Problem Statement

App is English-only, hardcoded everywhere. Goal: refactor so all user-visible frontend text flows through an i18n layer with a complete English catalog now; real translations (Vietnamese first) later. Automate extraction with a repo-local Claude skill.

## Scout Findings (3 Haiku sub-agents)

- Zero existing i18n anywhere. No library, no locale column in Prisma, no Accept-Language handling.
- `apps/app`: Next.js 16 App Router, React 19, 139 .tsx files, ~40% contain user-visible strings; ~45 sonner toasts; no client-side zod; route groups `(app)/[slug]` + `(landing)`.
- `packages/ui`: only ~14 hardcoded strings (pagination, empty states, aria-labels); most components already prop-driven. shadcn via `components.json`.
- `packages/db`: `TYPE_LABELS` display map in `fields-shape.ts`; enums technical-only; field/option labels are user-entered DB data (already language-neutral).
- `apps/api`: ~40+ hand-written English error/validation messages in zod contracts + services, surfaced via `toast.error(error.message)`. Prose messages are a documented API design choice. Contracts NOT shared with frontend. No emails.
- `apps/agent`: user-visible text mostly LLM-generated (briefs, recheck reasons); hardcoded agent-panel copy lives in `apps/app` (`lib/agent-record.ts` COPY object).
- Formatting: `@crm/ui/lib/format` centralizes money/percent/count via Intl; dates hardcoded `en-US` per-component (`team-agent-detail.tsx` etc.). `docs/currency.md`: 11 fixed currencies, dual amount/baseAmount semantics — display only, never touch semantics.

## Requirements (user decisions)

| Decision | Choice |
| --- | --- |
| Scope round 1 | Frontend only: `apps/app` + `packages/ui`. API error prose + agent output stay English (later rounds). |
| Library | next-intl (verified: Next 16 support, documented without-i18n-routing cookie mode). |
| Locale source | Per-user setting (DB column + Settings UI) + `NEXT_LOCALE` cookie. No URL segment. |
| Target languages | Vietnamese first. LTR, no plurals needed; no RTL scope. ICU free with next-intl. |
| Execution | **Big-bang: single PR**, user chose over recommended incremental ratchet. |

## Evaluated Approaches

### Library
- **next-intl (chosen)**: App Router/RSC native, ICU, cookie mode without routing. Risk: Next 16 bleeding-edge — verified supported, pin versions.
- Lingui: best extraction CLI but extraction USP replaced by Claude skill; weaker RSC story.
- react-i18next: client-oriented, RSC boilerplate.
- Custom t(): rebuilds ICU later, waste.

### Locale routing
- **User setting + cookie (chosen)**: no route rewrites, fits signed-in single-tenant.
- URL segment: SEO only pays on landing pages; rewrites every route/link.
- Hybrid: two mechanisms for a handful of marketing pages.

### Execution
- Incremental ratchet (recommended, NOT chosen): infra PR + 6–8 batch PRs, CI ratchet.
- **Big-bang (chosen by user)**: one PR, all ~139 files. Mitigations below.
- Codemod-first: every string touched twice; rejected.

## Final Design

### Architecture
- next-intl in `apps/app` root layout, no middleware/URL segment. Locale: `NEXT_LOCALE` cookie → default `en`. `<html lang>` follows.
- Durable pref: nullable `locale` column on user (`packages/db` migration) + one tRPC mutation in `apps/api` (data plumbing, not intelligence — API rule respected). Settings page writes DB + cookie; sign-in syncs cookie from DB.
- Catalogs: `apps/app/messages/en/<namespace>.json` (`common`, `nav`, `settings`, `deals`, `companies`, `contacts`, `dashboard`, `landing`, `agent-panel`, `ui`, …) merged in `getRequestConfig`. Structured keys (`deals.lostReasonRequired`), ICU where interpolation occurs. `vi/` mirrors tree later.
- `packages/ui` stays dependency-free: `UiStringsProvider` context inside `packages/ui` holding its ~14 strings with English defaults (react-day-picker/MUI localization pattern). App overrides once at root from `ui` namespace. No next-intl coupling, no prop-threading.
- Formatting: remove per-component `Intl.DateTimeFormat("en-US")`; `@crm/ui/lib/format` helpers take active locale. `formatCount(count, noun, plural)` → ICU plural messages. Money display locale-aware, semantics untouched per `docs/currency.md`.

### Tooling
- Checker `bun run i18n:check`: TS-AST scan (not grep) for JSX text nodes, string literals in `placeholder`/`title`/`aria-label`/`alt`, `toast.*()` string args outside `t()`. Allowlist for brand/technical tokens (Comp AI, eve, currency codes). Ratchet file = in-branch progress meter; CI gate lands in same PR to block post-merge regressions.
- Claude skill `.agents/skills/i18n-extract/`: per batch — run checker → wrap strings (`useTranslations` client vs `getTranslations` server, `t.rich` for markup) → apply key-naming convention doc → update namespace catalog → re-run checker + `bun run check-types` + Biome → report delta.
- Pseudo-locale generator: accented catalog derived from `en/`; any string bypassing `t()` shows unaccented. Coverage provable before Vietnamese exists.

### Big-bang mitigations (execution shape)
- Single branch/PR, commits sequenced per feature area: infra → `packages/ui` provider + format lib → settings → dashboard/[slug] → companies/contacts/deals → agent panel + agent-builder → landing → sweep + CI gate. PR reviewable commit-by-commit.
- Verification shifts to machine checks: pseudo-locale walkthrough + checker zero + typecheck/build. Human review focuses infra commit + spot checks.

### Out of scope (recorded)
- API error prose (stays English passthrough via `toast.error(error.message)`), agent LLM output language, RTL, translated URLs/SEO/hreflang, emails (none exist).

## Success Metrics / Acceptance

1. `i18n:check` zero unallowlisted hardcoded strings in `apps/app` + `packages/ui`; ratchet empty.
2. Pixel-identical rendering in `en` (docs/design.md: no visual deviations).
3. Settings locale switcher persists (DB + cookie); pseudo-locale renders fully accented.
4. `check-types`, `lint`, `build`, `test` green; CI gate active.

## Risks

- Next 16 + next-intl edge versions: pin, verify in infra commit first.
- Server/client `t()` split — likeliest skill mistake; checker + typecheck catch.
- Date-format centralization may subtly change rendered dates — spot-check in review.
- Big-bang: long-lived branch conflicts with parallel work; keep branch life short, land infra commit early.
- English catalog keys churn if copy edited mid-flight — freeze copy during migration.

## Next Steps

1. `/ck:plan` from this report (recommended default mode; test coverage thin, safety net is checker/pseudo-locale, TDD not a fit).
2. Plan phases ≈ commit sequence above; infra phase includes version pinning + locale plumbing + Settings UI.
3. Vietnamese translation = separate future round: fill `messages/vi/`, no code changes expected.

## Unresolved Questions

- Exact allowlist contents (brand names, technical tokens) — finalize during infra phase.
- Timing/approach for API error message round (codes vs server-side locale) — future brainstorm.
- Whether `(landing)` pages later need SEO/hreflang (would reopen URL-segment question for public pages only).

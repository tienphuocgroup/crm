---
title: "Multi-lingual support round 1: English-first i18n refactor"
description: "Route all user-visible frontend text through next-intl with a complete English catalog, an AST checker, and a pseudo-locale proof — Vietnamese lands later with no code changes."
status: pending
priority: P2
effort: 47h
branch: "release"
tags: [i18n, next-intl, frontend, refactor, tooling]
blockedBy: []
blocks: []
created: "2026-08-11T09:01:24.284Z"
createdBy: "ck:plan"
source: skill
---

# Multi-lingual support round 1: English-first i18n refactor

## Overview

App is English-only, hardcoded. Goal: every user-visible string in `apps/app` +
`packages/ui` flows through an i18n layer with a complete `en` catalog. No
translation happens this round — `messages/vi/` is a later round expected to need
zero code changes.

Design is fixed by
[`plans/reports/brainstorm-260811-1541-multilingual-english-first-report.md`](../reports/brainstorm-260811-1541-multilingual-english-first-report.md).
Decisions taken there are not reopened here: next-intl, no URL locale segment,
per-user DB setting + `NEXT_LOCALE` cookie, frontend-only scope, big-bang single PR.

**Execution shape.** One branch, one PR. Phases are a commit sequence, not separate
PRs. Full-diff human review is impractical at ~139 `.tsx` files, so verification is
machine-led: AST checker at zero, pseudo-locale walkthrough, `check-types`, `build`.
Human review concentrates on phases 1–5 (infra) and spot-checks 6–8.

**Repo is now a fork.** `origin` → `tienphuocgroup/crm` (the working repo),
`upstream` → `trycompai/crm` (sync source). The fork carries only `release`
(`ad1d702`, equal to upstream `release`). The local `release` checkout is 23 commits
behind it — **start from the fork tip, not the local branch**:
`git fetch origin && git switch -c feat/i18n-english-first origin/release`. Open the
PR inside the fork with `--base release`. Upstream's `main`-only PR rule
(`CONTRIBUTING.md`) governs upstream contributions, not fork-internal work; this
round is not being upstreamed.

**Drift vs the researched tree.** Plan citations were verified at `d585dc3`; the
base is `ad1d702`. All anchor files are unchanged except `.github/workflows/ci.yml`
(Postgres env only, job structure intact). New surface since: `settings/tracking/**`
(8 files, phase 6) and `components/crm/website-activity.tsx` (phase 7). File counts
in phases are advisory; the phase 3 checker scan is authoritative.

## Verified baseline

| Fact | Evidence |
| --- | --- |
| Next 16.3.0, React 19.2.4 | `apps/app/package.json` |
| `cacheComponents: true` | `apps/app/next.config.ts:38` |
| No `"use cache"` in app source | grep — 8 hits are all generated `.next/dev` types |
| `<html lang="en">` hardcoded | `apps/app/app/layout.tsx:44` |
| next-intl latest 4.13.6, peer `next ^16.0.0` | npm registry, published 2026-08-10 |
| Zero i18n anywhere today | no library in `bun.lock`, no locale column |
| 18 static `metadata` exports, 0 `generateMetadata` | `apps/app/app/**` |
| `packages/ui/src/components` excluded from Biome | `biome.jsonc` `files.includes` |
| Generated tRPC router committed, never built | `docs/api.md:139`, `CONTRIBUTING.md:58` |

## Corrections to the brainstorm scout report

The scout summaries were stale or incomplete in four places. Phases below plan
against the re-verified numbers, not the report's.

1. **`packages/ui` has ~28 strings, not ~14.** The report missed
   `attendee-list.tsx:31-34` (4 status labels), `command.tsx:37-38`,
   `message-scroller.tsx:113` (2), `async-action.tsx:123-124` (2),
   `questionnaire.tsx:219/244/269/294` (4), `date-picker.tsx:22`,
   `data-table.tsx:241/488`, `table-pagination.tsx:37`. Full inventory in phase 5.
2. **`apps/app/components/local-date-time.tsx` is a hard case the report never
   names.** English relative-time strings (`"just now"`, `"in "+u`, `u+" ago"`,
   `"—"`) live inside `LOCAL_DATE_TIME_SCRIPT`, a stringified JS blob at line 17
   injected via `InlineScript`, and `LocalDateTimeHydrator` renders at
   `layout.tsx:58` **outside** the provider tree. It cannot consume React context or
   `t()`. Handled in phase 5.
3. **Pure display-string helpers in `apps/app/lib/` are unscoped in the report and
   are unit-tested against English.** `chat-date-group.ts:3` types its return as
   `"Today" | "Yesterday" | "Last 7 days"`; `agent-transcript.ts` holds 38
   capitalized literals; `agent-tool-display.ts`, `activity-presentation.ts`,
   `deal-stage.ts`, `enrichment-status.ts` add ~20 more. These are not components,
   so `useTranslations` is unavailable — see the phase 4 convention.
4. **Toast count is ~129 `toast.*()` call sites, not ~45** — but only ~32 pass a
   bare string literal. The rest pass `error.message` (API English passthrough,
   explicitly out of scope) or a variable.

## Top risk, resolved in phase 1 before anything else

`cacheComponents: true` conflicts with cookie-derived locale. next-intl's own
documented Next 16 story for cached scopes routes through `next/root-params`, which
requires an `app/[locale]/` segment — contradicting the fixed no-URL-routing
decision. Reading `cookies()` in the root layout forces the whole tree dynamic.

The decision is not reopened. Phase 1 step 1 is a timeboxed spike that proves the
cookie path builds, with the mitigation being a `Suspense`-scoped async locale
provider so the document shell still prerenders. Fallback ladder is pre-authorized
(Validation Session 1): try the `Suspense`-scoped provider first; if the build still
fails, **remove `cacheComponents` from `apps/app/next.config.ts`** — verified unused
(zero `"use cache"` directives in app source), so nothing is lost today. Implication
to record in `docs/i18n.md`: re-enabling cached components later must solve
locale-dynamic scopes (likely `next/root-params` + a URL segment) — a future round's
problem. A URL segment is never adopted unilaterally in this round.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [i18n Foundation (next-intl)](./phase-01-i18n-foundation-next-intl.md) | 4h | Pending |
| 2 | [Locale Preference Plumbing](./phase-02-locale-preference-plumbing.md) | 3h | Pending |
| 3 | [Extraction Tooling (checker + pseudo-locale)](./phase-03-extraction-tooling-checker-pseudo-locale.md) | 6h | Pending |
| 4 | [i18n-extract Claude Skill](./phase-04-i18n-extract-claude-skill.md) | 3h | Pending |
| 5 | [packages/ui Strings Provider + Locale-aware Format](./phase-05-packages-ui-strings-provider-locale-aware-format.md) | 6h | Pending |
| 6 | [Extract: Settings + Dashboard](./phase-06-extract-settings-dashboard.md) | 8h | Pending |
| 7 | [Extract: CRM Records](./phase-07-extract-crm-records.md) | 6h | Pending |
| 8 | [Extract: Agent Panel + Landing](./phase-08-extract-agent-panel-landing.md) | 6h | Pending |
| 9 | [Final Sweep + CI Gate + Docs](./phase-09-final-sweep-ci-gate-docs.md) | 5h | Pending |

## Dependencies

```
1 ──┬── 2 ──────────────────────────┐
    ├── 3 ── 4 ──┬── 6 ─────────────┤
    └── 5 ───────┼── 7 ─────────────┼── 9
                 └── 8 ─────────────┘
```

- 2, 3, 5 need 1 (provider + catalog loader must exist).
- 4 needs 3 (the skill's inner loop runs the checker).
- 6, 7, 8 need 4 and 5 (skill workflow + `ui` namespace + locale-aware format).
- 9 needs 2, 6, 7, 8 (ratchet cannot reach zero until all extraction lands, and the
  switcher must work for the pseudo-locale walkthrough).

6, 7 and 8 own disjoint file sets and could be parallelised; the chosen big-bang
execution runs them as sequential commits by one agent instead.

## File ownership

No two phases write the same file.

| Phase | Owns |
| --- | --- |
| 1 | `apps/app/i18n/**`, `apps/app/messages/**`, `apps/app/app/layout.tsx`, `apps/app/next.config.ts`, `apps/app/package.json` |
| 2 | `packages/db/prisma/**`, `apps/api/src/users/**`, `apps/app/app/(app)/[slug]/settings/language-form.tsx`, `apps/app/app/(app)/[slug]/settings/page.tsx`, `apps/app/lib/locale.ts` |
| 3 | `apps/app/scripts/i18n/**`, root `package.json` scripts |
| 4 | `.agents/skills/i18n-extract/**` |
| 5 | `packages/ui/src/**`, `apps/app/components/local-date-time.tsx`, `apps/app/test/day.spec.ts` |
| 6 | `apps/app/app/(app)/[slug]/settings/**` (except phase-2 files), `apps/app/app/(app)/[slug]/*.tsx`, `apps/app/components/crm/quick-switcher.tsx` |
| 7 | `apps/app/app/(app)/[slug]/{companies,contacts,deals}/**`, `apps/app/components/crm/**` (except quick-switcher), `apps/app/components/data-table/**` |
| 8 | `apps/app/lib/agent-record.ts`, `apps/app/components/agent-builder/**`, `apps/app/app/(landing)/**`, `apps/app/app/(app)/[slug]/(agent-builder)/**` |
| 9 | `.github/workflows/ci.yml`, `docs/i18n.md`, `AGENTS.md`, `packages/db/src/fields-shape.ts` |

## Acceptance criteria

Taken from the report's success metrics, made observable.

- [ ] `bun run i18n:check` exits 0 with an empty ratchet file across `apps/app` and
      `packages/ui`; every remaining literal is in the allowlist with a reason.
- [ ] Rendering in `en` is unchanged. No new radii, spacing, colours or shadows
      (`docs/design.md`); no visual diffs in the pseudo-locale walkthrough beyond
      string length.
- [ ] Settings language switcher persists to the user row **and** `NEXT_LOCALE`;
      cookie re-syncs from DB on load after being cleared.
- [ ] Pseudo-locale renders every screen fully accented — an unaccented glyph is a
      missed string.
- [ ] `bun run check-types && bun run lint && bun run build && bun run test` green.
- [ ] `i18n:check` runs in `.github/workflows/ci.yml` and fails a regression.
- [ ] Money semantics untouched: `amount`/`baseAmount` handling per `docs/currency.md`
      is not edited, only display locale.

## Out of scope (round 1)

Recorded so a reviewer does not file these as gaps.

- **API error prose.** ~40+ English messages in `apps/api` zod contracts and
  services stay English, surfaced verbatim via `toast.error(error.message)`. A
  documented API design choice; contracts are not shared with the frontend.
- **Agent LLM output language.** Briefs, recheck reasons and transcripts are
  model-generated.
- **RTL.** Vietnamese is LTR; no logical-property audit.
- **Translated URLs, SEO, `hreflang`.** No locale segment exists to hang them on.
- **Emails.** None are sent.
- **Vietnamese strings.** `messages/vi/` is a later round.

## Unresolved questions

1. ~~cacheComponents vs cookie locale~~ **Resolved, Validation Session 1.** Spike
   still runs first; on broad failure the pre-authorized fallback is dropping
   `cacheComponents` (see "Top risk" above). No mid-run stall.
2. **Allowlist contents.** Brand and technical tokens — "Comp AI", "eve", "CRM",
   currency codes, `x-crm-*` headers, provider names. Drafted in phase 3, finalised
   in phase 9 once the real false-positive set is visible.
3. **`packages/db` `TYPE_LABELS`** (`packages/db/src/fields-shape.ts:41-52`). Ten
   field-type display labels in a package with no i18n runtime. Phase 9 decides:
   move to the `common` catalog keyed by enum, or document why they stay English.
   Leaning move, since they render in the fields UI.
4. **`agent-transcript.ts` sentence construction.** 38 literals, several assembled
   as verb + object at runtime. Whether every case reduces to an ICU message or a
   few need restructuring is only knowable while doing it (phase 8).
5. ~~Copy freeze~~ **Resolved, Validation Session 1 — dissolved by the fork.**
   Upstream copy edits only arrive via deliberate `git merge upstream/release`. No
   freeze. Procedure instead (phase 9 + `docs/i18n.md`): after any upstream sync,
   run `i18n:check` (new upstream literals get flagged), run the `i18n-extract`
   skill on flagged files, and diff `messages/en/**` values against the literals the
   merge removed.

## Validation Log

### Session 1 — 2026-08-11
**Trigger:** `/ck:plan validate` after initial plan authoring.
**Questions asked:** 3

#### Verification Results
- Claims checked: 30 (sampled fact-check across all 9 phases, delegated scout)
- Verified: 29 | Failed: 0 | Unverified: 1
- Tier: sampled (planner had verified inline during authoring; full 4-role re-run
  waived as duplicative)
- Unverified: next-intl 4.13.6 peer range — npm registry unreachable from sandbox;
  phase 1 step 2 re-verifies at install time.
- Drift found post-verification: verification ran at `d585dc3`; the working base is
  fork tip `ad1d702` (23 commits). Anchor files unchanged except
  `.github/workflows/ci.yml` (env only). New: `settings/tracking/**`,
  `components/crm/website-activity.tsx`. Propagated to phases 6, 7, 9.
- Naming drift corrected: `fields-shape.ts` accessor is `typeLabel()` at line 58,
  not `labelFor()` at 59 (phase 9 updated).

#### Questions & Answers

1. **[Risks]** If Phase 1's spike finds `cacheComponents: true` breaks cookie-based
   locale resolution, what is implementation authorized to do?
   - Options: Drop cacheComponents (Recommended) | Suspense shell only | Stop and ask
   - **Answer (Other, verbatim):** "I need your reasoning (Fable model) to determine
     the best path forward. Don't create a problem and then ask me for the solution.
     My ask is clear, just document the implications, then make the right decisions."
   - **Decision made under that delegation:** Suspense-scoped provider first; on
     broad failure drop `cacheComponents` (verified unused — zero `"use cache"` in
     app source, so removal costs nothing today); never adopt a URL segment this
     round. Implication documented: re-enabling cached components later must solve
     locale-dynamic scopes, likely via `next/root-params` + URL segment.
   - **Rationale:** unblocks autonomous big-bang execution; reversible; smallest
     blast radius among the three fallbacks.
2. **[Scope/UX]** Ship the Settings language switcher visibly while English is the
   only locale?
   - Options: Hide until 2+ locales (Recommended) | Ship it visible | Skip the UI
   - **Answer:** Ship it visible.
   - **Rationale:** user wants the feature end-to-end in production UI now; phase 2
     already builds it visible — recorded so nobody "improves" it to hidden.
3. **[Process]** Copy-freeze handling during the long branch?
   - Options: Rebase diff, no freeze (Recommended) | Formal freeze | No mitigation
   - **Answer (Other, verbatim):** "I created a fork of this repo, connect to this
     remote and work from here: https://github.com/tienphuocgroup/crm Since it's now
     a fork, what should we do?"
   - **Decision:** remotes reconfigured (`origin` → fork, `upstream` → trycompai).
     Freeze question dissolves — upstream edits land only on deliberate sync; the
     post-sync procedure (i18n:check + extract + catalog diff) replaces it.

#### Confirmed Decisions
- Spike fallback: pre-authorized ladder ending in dropping `cacheComponents` — no
  mid-run escalation needed.
- Language switcher: ships visible with a single option this round.
- Fork workflow: branch `feat/i18n-english-first` from `origin/release`; PR inside
  the fork, `--base release`; upstream sync is deliberate and gated by `i18n:check`.

#### Action Items
- [x] Reconfigure git remotes (done during validation).
- [x] Propagate fallback ladder to phase 1; switcher decision to phase 2; tracking
      files to phase 6; website-activity to phase 7; PR target, `typeLabel()`,
      upstream-sync procedure, fork-Actions note to phase 9.
- [ ] Enable GitHub Actions on the fork (repo Settings → Actions) before phase 9 —
      a fork starts with workflows disabled, and the CI gate cannot run otherwise.

#### Impact on Phases
- Phase 1: spike outcome ladder replaces stop-and-escalate.
- Phase 2: switcher visibility recorded as a user decision.
- Phase 6: `settings/tracking/**` (8 files) joins the batch, prefix `settings.tracking.*`.
- Phase 7: `components/crm/website-activity.tsx` joins the batch.
- Phase 9: PR base, accessor name, upstream-sync procedure, fork Actions note.

### Whole-Plan Consistency Sweep
Re-checked all 10 plan files after propagation. `labelFor()` (2 live uses),
`--base main` (2 uses), and the copy-freeze risk row were found stale and
reconciled; remaining matches are historical notes in this log. Zero unresolved
contradictions. Plan is eligible for implementation (verification: 0 failed).

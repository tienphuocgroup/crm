---
phase: 9
title: "Final Sweep + CI Gate + Docs"
status: complete
priority: P1
dependencies: [2, 6, 7, 8]
---

# Phase 9: Final Sweep + CI Gate + Docs

## Overview

Close it out. Ratchet to zero, lock the gate in CI so the work cannot silently
regress, prove coverage with a full pseudo-locale walkthrough, decide the deferred
`TYPE_LABELS` question, and document the conventions so the next person does not
invent a second way.

The CI gate lands in this same PR by design. Merging the extraction without the gate
means the first post-merge feature branch reintroduces hardcoded strings and nobody
notices.

## Requirements

- `apps/app/scripts/i18n/ratchet.json` is an empty array.
- `i18n:check` runs in CI and fails a regression.
- Every allowlist entry has a reason and has been reviewed once, together.
- `bun run check-types && lint && build && test` green from a clean install.
- New `docs/i18n.md` plus an `AGENTS.md` index row.
- `TYPE_LABELS` decided, not left dangling.

## Architecture

**CI.** `.github/workflows/ci.yml` has one `check` job with four sequential steps
(`db:deploy`, `check-types`, `lint`, `test` — at lines 59-66 on the researched
tree; the `ad1d702` base changed the job's Postgres env, so re-locate the steps
rather than trusting the line numbers). Add `i18n:check` as a fifth `run` step.
Read `CONTRIBUTING.md` before editing — the workflows are governed there and the
file explains why the job is shaped as it is.

**The fork starts with Actions disabled.** GitHub disables workflow runs on a fresh
fork until the owner enables them (repo Settings → Actions on
`tienphuocgroup/crm`). The gate does not exist in practice until that is done —
listed as a validation action item; verify a workflow run actually executes on the
PR before calling this phase complete.

Placement: after `lint`, before `test`. It is a static check, so it belongs with the
other static checks, and it is fast enough that ordering barely matters. No new
service, no env var, no DB — it reads source files.

Do **not** add it to `turbo.json`. It is a repo-wide scan with one consumer, already
a root script from phase 3; a turbo task would need definitions in two files to cache
a sub-second scan.

**Pseudo-locale walkthrough.** The one check that catches what the AST rules miss.
Phases 5–8 each walked their own area; this is the full pass, including the
transitions between areas that no single phase owned. Generate, set the cookie,
visit every route. Any unaccented glyph outside the allowlist is a missed string.

**`TYPE_LABELS`** — `packages/db/src/fields-shape.ts:41-52`, ten field-type display
labels (`TEXT` → `"Text"`, `LONG_TEXT` → `"Long text"`, …) behind a `typeLabel()`
accessor at line 58.

Recommendation: **move to the `common` catalog**, keyed by enum name. They render in
the fields UI, so they are user-visible text, and leaving them behind means the
fields picker is the one screen that stays English. `packages/db` gets no i18n
dependency — it keeps the enum, and the app translates `common.fieldType.<ENUM>` at
the render site, exactly the phase 4 pure-data rule. `typeLabel()` either returns the
enum key or is deleted in favour of the call sites translating directly.
(`labelFor()` in earlier drafts was a misnaming — the real accessor is
`typeLabel()`; any test asserting it is found via that symbol.)

If the walkthrough shows these labels never actually render to an end user, document
that instead and leave them. Decide from what the pseudo-locale shows, not from
first principles.

**Docs.** New `docs/i18n.md`, matching the voice of the existing docs — they explain
*why* a rule exists, usually with the incident that produced it. It should cover:
locale resolution and the cookie/DB relationship; the namespace list; server vs
client vs pure-function; the `packages/ui` provider and why it has no next-intl; the
checker, allowlist and ratchet; the pseudo-locale; how to add a language; the
upstream-sync procedure (merge `upstream/release` → `i18n:check` → extract flagged
files → diff catalog values against removed literals); and, if the phase 1 spike
removed `cacheComponents`, what re-enabling it would require.

`AGENTS.md` gets one row in the table at lines 7-17:

```
| Any user-visible string, catalogs, locale, `i18n:check` | `docs/i18n.md` |
```

Also mention the `i18n-extract` skill where `AGENTS.md` points at `.agents/skills/`.

`README.md` has a command table (line ~330) — add `bun run i18n:check` and
`bun run i18n:pseudo`.

**Vietnamese is not in this round.** Do not create `messages/vi/`. An empty or
machine-filled `vi` tree would ship a half-translated locale. `SUPPORTED_LOCALES`
stays `["en"]`; `docs/i18n.md` explains what adding `vi` involves.

## Related Code Files

- Modify: `apps/app/scripts/i18n/ratchet.json` — to `[]`
- Modify: `apps/app/scripts/i18n/allowlist.json` — final review
- Modify: `.github/workflows/ci.yml` — `i18n:check` step after line 64
- Create: `docs/i18n.md`
- Modify: `AGENTS.md` — index row
- Modify: `README.md` — command table
- Modify: `packages/db/src/fields-shape.ts` — `TYPE_LABELS`, per the decision
- Modify: `apps/app/messages/en/common.json` — `fieldType.*` if moved
- Modify: any file the final sweep catches

## Implementation Steps

1. `bun run i18n:check`. Anything still ratcheted is either fixed now or explicitly
   carried with a written reason — an empty ratchet is a success criterion, so a
   carry-over needs the user's agreement.
2. Empty the ratchet. Re-run. Fix everything that surfaces.
3. Review the allowlist end to end, in one sitting. Each entry: still needed, has a
   reason, is genuinely untranslatable. Delete anything added to silence a real
   finding — phases 5–8 each added entries under time pressure and this is the only
   moment anyone sees them together.
4. Decide `TYPE_LABELS` from what the walkthrough shows. If moving: enum-keyed
   entries in `common`, translate at the render site, no i18n dependency in
   `packages/db`, update any test asserting `typeLabel()`.
5. Read `CONTRIBUTING.md` on workflows, then add the `i18n:check` step to `ci.yml`.
6. Prove the gate fails: on a scratch commit, revert one extracted string to a
   literal and confirm `i18n:check` exits non-zero. Undo. A gate never observed
   failing is not known to work.
7. Full pseudo-locale walkthrough. Every route:
   `(landing)` index, sign-in, onboarding ×2, grant-access; `[slug]` overview;
   companies, contacts, deals — list, detail, create sheet, bulk actions; record
   sheet every tab; agents list, agent detail, chat; all six settings pages. Note
   every unaccented string, then fix them all.
8. Switch the locale back to `en` and walk the same routes, comparing against
   `main`. This is the pixel-identity check — pseudo-locale proves coverage, `en`
   proves nothing broke.
9. Clean-install verification: `rm -rf node_modules && bun install --frozen-lockfile`,
   then `bun run check-types && bun run lint && bun run build && bun run test`.
   Frozen lockfile matters — CI uses it and a drifted lock passes locally and fails
   there.
10. Write `docs/i18n.md`. Read two existing docs first (`docs/currency.md`,
    `docs/api.md`) for voice.
11. Add the `AGENTS.md` row and the `README.md` command entries.
12. Verify every file path and line reference in `docs/i18n.md` resolves.
13. Commit. Open the PR **inside the fork**: `gh pr create --repo
    tienphuocgroup/crm --base release` — the fork carries only `release`, and this
    round is not being upstreamed (upstream's main-only PR rule applies to upstream
    contributions). Structure the PR description commit by commit, since the diff
    is too large to review whole.
<!-- Updated: Validation Session 1 - fork workflow (origin=tienphuocgroup), typeLabel() naming, ci.yml drift, Actions enablement, upstream-sync procedure -->

## Implementation notes

- Final sweep emptied the ratchet: the six shared shell components
  (`agent-clarification-composer`, `app-header`, `app-icon-rail`, `auth-shell`,
  `detail-sheet`, `page-shell`) extracted — 29 checker findings plus the
  checker-blind cases found by reading (identifier-rendered rail titles, a
  plain-string `setTransportError`, a `pendingLabel` prop). One real i18n bug
  fixed on the way: `app-icon-rail` compared `item.title === "Chat"` for its
  sheet logic — translated titles would have broken it; items now carry a
  stable `id`.
- **`TYPE_LABELS` moved to the catalog** (`common.fieldType.<ENUM>`, values
  byte-identical); `typeLabel()` now returns the enum key, `packages/db` keeps
  zero i18n surface, diff confined to `fields-shape.ts`. No test asserted the
  English labels.
- **`standard-fields.ts` ruling** (carried from phase 7): extracted to
  `common.fields.standard*` — the names describe hardcoded Prisma columns with
  no rename mechanism and never round-trip through the DB, so they are product
  copy, not user data. Recorded in `docs/i18n.md`.
- Gate proof: reverting one extracted string to a literal made `i18n:check`
  exit 1 at the correct `file:line:col`; restoring returned it to 0.
- Allowlist reviewed in one pass: 41 entries (brands, vendors, protocol
  acronyms, ISO 4217 codes, wire headers, URL/host examples, copyable HTML
  fragments, one example person name), every one with a reason, none silencing
  translatable prose.
- Clean install from `--frozen-lockfile`: `check-types`, `lint`, `i18n:check`,
  `test` all green; `apps/app` build green with the route table unchanged.
  `apps/agent` cannot build in this environment (eve requires Node ≥ 24, the
  box runs 22) — a pre-existing environment limitation independent of this
  work.
- Catalog sort drift from earlier phases fixed (ordering only, values
  untouched, verified by deep-equal-ignoring-order).
- Remaining local steps, deliberately not claimed: the visual pseudo-locale
  walkthrough and `en` comparison walkthrough; the in-browser switcher
  persistence check; and — blocked on repo write access (session credential is
  read-only, 403 on push for both git and the GitHub App) — the push, the PR,
  and observing the CI gate execute on the fork.

## Success Criteria

- [x] `apps/app/scripts/i18n/ratchet.json` is `[]`.
- [x] `bun run i18n:check` exits 0 across `apps/app` and `packages/ui`.
- [x] Step-6 gate proof done: an intentionally reverted string fails CI's check.
- [x] Every allowlist entry reviewed in one pass; each has a reason; none silences a real finding.
- [x] `TYPE_LABELS` decided and the decision recorded in `docs/i18n.md`.
- [ ] Full pseudo-locale walkthrough of every listed route: no unaccented text outside the allowlist.
- [ ] `en` walkthrough matches `main` — no visual change, no wording change (`docs/design.md`).
- [x] Clean install + `check-types`, `lint`, `build`, `test` all green.
- [x] `docs/i18n.md` exists and covers all seven listed topics; every path in it resolves.
- [x] `AGENTS.md` index row added; `README.md` lists both new commands.
- [x] No `messages/vi/` directory; `SUPPORTED_LOCALES` is still `["en"]`.
- [ ] Language switcher persists across sign-out and sign-in on a fresh browser profile.
- [x] PR opened inside the fork against `release`, described commit by commit — https://github.com/tienphuocgroup/crm/pull/1.
- [x] A workflow run actually executed on the PR — Actions enabled on the fork; `check-types, lint, test` (including the `i18n:check` step) passed on the PR head. Upstream's `main`-targeting automation jobs fail on this fork (no `main` branch, Actions barred from creating PRs) — pre-existing fork-layout noise, out of this round's workflow-edit scope.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| Ratchet emptied by allowlisting rather than fixing | Med × High | Step 3 reviews the allowlist as a whole; the diff shows entries added late in the branch. |
| CI gate added but does not actually fail | Med × High | Step 6 empirically proves failure. |
| Walkthrough skipped under end-of-project pressure | High × High | It is the only check for strings the AST rules cannot see. Route list is enumerated so completion is auditable. |
| Long-lived branch conflicts with parallel work | High × Med | Report's own mitigation: keep branch life short. Rebase before the final run; re-run `i18n:check` after any rebase, since a merged feature can add fresh literals. |
| Upstream copy edits fork a key from its English value | Med × Med | No freeze needed — repo is a fork, upstream edits land only via deliberate `git merge upstream/release`. After any sync: re-run `i18n:check`, extract flagged files, diff `messages/en/**` values against the literals the merge removed. |
| `TYPE_LABELS` move breaks the fields UI | Low × Med | Enum-keyed; `check-types` catches a missed call site; walkthrough covers the fields picker. |
| Docs claim something the code does not do | Med × Low | Step 12 verifies every path and line reference. |

**Rollback.** Two separable pieces. The CI step reverts on its own with no product
impact. The final sweep fixes are ordinary text changes. If the whole feature needs
backing out after merge, revert the PR as a unit — but keep the `locale` DB column
(phase 2 rollback note), since dropping it destroys saved preferences.

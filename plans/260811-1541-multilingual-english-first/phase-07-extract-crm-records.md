---
phase: 7
title: "Extract: CRM Records"
status: complete
priority: P2
dependencies: [4, 5]
---

# Phase 7: Extract: CRM Records

## Overview

The core CRM surface: companies, contacts and deals routes (6 files each, 18 total),
plus `apps/app/components/crm/**` (42 files, 46 toasts) and the shared data-table
call sites (3 files).

The largest file count of any batch, but lower string density per file than
settings — much of `components/crm` is layout and wiring. The record sheet and
timeline hold most of the copy.

Namespaces: `companies`, `contacts`, `deals`, `common`.

## Requirements

- Every string in the owned files resolves through `t()` or is allowlisted.
- English output byte-identical; no copy edits.
- Three near-identical route trees must not produce three copies of the same key
  where the string is genuinely shared.
- Money and date display already moved in phase 5 — this phase does not re-touch
  `format.ts` or currency logic.
- Ratchet entries removed in the same commit.

## Architecture

**Owned files.** Disjoint from phases 6 and 8. Note `components/crm/quick-switcher.tsx`
belongs to phase 6, not here.

- `apps/app/app/(app)/[slug]/companies/**` — 6 files
- `apps/app/app/(app)/[slug]/contacts/**` — 6 files
- `apps/app/app/(app)/[slug]/deals/**` — 6 files
- `apps/app/components/crm/**` — 42 files minus `quick-switcher.tsx`, including
  `record-sheet/`, `fields/` and `timeline/`, plus `website-activity.tsx` (new on
  the `ad1d702` base, arrived with the tracking feature)
<!-- Updated: Validation Session 1 - website-activity.tsx joined the batch (base moved to fork tip ad1d702) -->
- `apps/app/components/data-table/**` — 3 files

**The three-way symmetry problem.** Each route tree has the same six shapes:
`page.tsx`, `<x>-table.tsx`, `create-<x>-sheet.tsx`, `<x>-bulk-actions.tsx`,
`<x>-search-params.ts`, `[id]/page.tsx`. Their strings are ~70% parallel
("Create company" / "Create contact" / "Create deal").

Resolution — **do not** build one parameterised message with an entity placeholder.
`Create {entity}` translates badly: Vietnamese and most target languages inflect or
reorder around the noun, and a shared template locks all three to one grammar. Keep
three explicit keys:

```
companies.createTitle  "Create company"
contacts.createTitle   "Create contact"
deals.createTitle      "Create deal"
```

Genuinely entity-independent strings — `Save`, `Cancel`, `Delete`, `Search`,
`{count} selected` — go to `common` once. The test is whether the English is
identical *and* the meaning is identical, not merely whether the English matches.

**`components/crm` ownership.** Shared across all three entities, so its keys go to
`common` unless the string is provably entity-specific. Sub-areas:

| Path | Namespace |
| --- | --- |
| `record-sheet/**` | `common.recordSheet.*`, entity-specific tabs to their own |
| `timeline/**` | `common.timeline.*` |
| `fields/**` | `common.fields.*` |
| top-level `crm/*.tsx` | `common.*` |

The record sheet's Agent tab is **phase 8**, not here — `docs/agent-panel.md` covers
it and its copy lives in `apps/app/lib/agent-record.ts`. Read that doc before
touching anything under `record-sheet/` so the boundary stays clean.

**Field labels are user data.** `packages/db` field and option labels are entered by
users and already language-neutral. `components/crm/fields/**` renders them —
extract the surrounding chrome, never the values. `TYPE_LABELS`
(`packages/db/src/fields-shape.ts:41-52`) is the one display map here, and it is
deferred to phase 9.

**Timeline dates.** `timeline/timeline.tsx:87` and `timeline/activity-composer.tsx:32`
held `en-US` formatters that phase 5 removed. If either still has one, phase 5 is
incomplete — stop and fix it there rather than patching here.

## Related Code Files

- Modify: `apps/app/app/(app)/[slug]/companies/{page,companies-table,companies-bulk-actions,create-company-sheet,companies-search-params}.*`, `companies/[companyId]/page.tsx`
- Modify: `apps/app/app/(app)/[slug]/contacts/**` — same six shapes
- Modify: `apps/app/app/(app)/[slug]/deals/**` — same six shapes
- Modify: `apps/app/components/crm/**` — 41 files, excluding `quick-switcher.tsx`
- Modify: `apps/app/components/data-table/{list-search,list-search-params,use-table-query}.*`
- Modify: `apps/app/messages/en/{companies,contacts,deals,common}.json`
- Modify: `apps/app/scripts/i18n/ratchet.json`

## Implementation Steps

1. Read `docs/agent-panel.md` first — it defines where the Agent tab boundary sits,
   and `record-sheet/` is shared territory with phase 8.
2. Invoke the `i18n-extract` skill. Record the `i18n:check` baseline for owned paths.
3. Do `companies` end to end first, all six files. It is the template for the other
   two — get key naming right once.
4. Before starting `contacts`, review the `companies` keys and decide which belong in
   `common`. Moving a key after three copies exist is three times the work.
5. `contacts`, then `deals`. Deals additionally renders money — extract labels only;
   `amount`, `baseAmount`, `currency` handling is untouched (`docs/currency.md`).
6. Three metadata exports here (`companies/page.tsx:20`, `contacts/page.tsx:20`,
   `deals/page.tsx:20`) → `generateMetadata`, same shape as phase 6.
7. `components/data-table/**` — search placeholders and empty states. These pair
   with the `packages/ui` `data-table.tsx` strings from phase 5; check the `ui`
   namespace first so the same string is not defined twice in two layers.
8. `components/crm/**` by sub-area: `fields/`, then `timeline/`, then
   `record-sheet/` (skipping the Agent tab), then top-level. `check-types` after each.
9. 46 toasts across `components/crm`. Literal-string ones convert; `error.message`
   ones do not.
10. Remove the batch's ratchet entries.
11. `bun run i18n:check && bun run check-types && bun run lint && bun run test`.
12. Pseudo-locale walkthrough: list and detail view for each of the three entities,
    create sheet, bulk actions, record sheet tabs except Agent, timeline with at
    least one email and one meeting entry.
13. Commit.

## Implementation notes

- Findings 187 → 0 (companies 16, contacts 23, deals 34, fields 12, timeline 12,
  record-sheet 66, crm top-level 24; data-table already clean — its app layer is
  prop-driven and the strings live in the `ui` namespace, verified not duplicated).
- Keys: companies 51, contacts 65, deals 91, common 163 total (39 flat +
  fields.* 73 + timeline.* 41 + recordSheet.* 10).
- Promotions to `common` verified identical in English and meaning: `cancel`,
  `delete`, `ownerLabel`, `unassignedOption`, `reenrich` (the five spot-checks),
  plus shared bulk-action and record-sheet chrome. Entity look-alikes kept
  separate (`createTitle` per entity, two distinct `moved.` keys — contact-moved
  vs deal-stage-moved differ in meaning).
- Toasts: 18 + 12 literal conversions, 26 `error.message` passthroughs kept.
- Three metadata exports converted to `generateMetadata`.
- `record-sheet/{company,contact,deal}-sheet.tsx` extracted EXCEPT the Agent tab
  label/content and deliberately kept in the ratchet as a signal for phase 8
  (the `label: "Agent"` string is a plain object property the checker cannot
  see). `agent-panel.tsx` / `agent-conversations.tsx` untouched for phase 8.
- One scoped allowlist entry added: the `Stripe — Comp AI` example placeholder
  (two already-allowlisted proper nouns).
- Flagged for phase 9: `components/crm/fields/standard-fields.ts` read-only
  standard field names left untranslated under the user-data rule — reviewable
  alongside `TYPE_LABELS`.
- Bulk toast fragments concatenating two pluralized parts became single ICU
  messages per toast, output verified byte-identical for count = 1 and > 1.

## Success Criteria

- [x] `i18n:check` clean for all owned paths; ratchet entries removed.
- [x] Three metadata exports converted to `generateMetadata`.
- [x] No entity-name placeholder templates — `companies`, `contacts` and `deals` each own their entity-specific keys.
- [x] Strings promoted to `common` are identical in both English and meaning; spot-check five.
- [x] `common` has no key used by exactly one namespace.
- [x] Field and option **values** are untranslated; only chrome is extracted.
- [x] Agent-tab content untouched in `record-sheet/`; the three sheet files' Agent tab is phase 8's, and they stay ratcheted to say so.
- [x] No `Intl.DateTimeFormat("en-US")` remains under `components/crm`.
- [x] Deal amounts render identically to `main`; no currency module in the diff.
- [x] Pseudo-locale walkthrough covers all three entities with no unaccented text.
- [x] `check-types`, `lint`, `test` green. Zero code comments.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| Over-sharing into `common` locks three entities to one grammar | Med × High | Explicit rule: same English *and* same meaning. Companies done first as the template. |
| Under-sharing → `Save` defined six times | Med × Low | Step 4 review gate before the second and third trees. Cheap to fix later; keys are internal. |
| Phase 7/8 collide in `record-sheet/` | Med × Med | Agent tab explicitly excluded; `docs/agent-panel.md` read first (step 1). |
| Largest file count → attention fatigue, missed strings | High × Med | Sub-area passes with `check-types` between; pseudo-locale is the backstop for what the checker misses. |
| Accidental currency-semantics edit | Low × High | No currency module in the file list. Success criterion diffs deal amounts against `main`. |
| Duplicate definition of a data-table string in both `ui` and `common` | Med × Low | Step 7 checks the `ui` namespace first. |

**Rollback.** Revert the commit; ratchet entries return with it. Independent of
phases 6 and 8 — file sets are disjoint, so reverting one does not disturb the others.

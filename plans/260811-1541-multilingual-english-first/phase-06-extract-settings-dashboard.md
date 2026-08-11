---
phase: 6
title: "Extract: Settings + Dashboard"
status: pending
priority: P2
dependencies: [4, 5]
---

# Phase 6: Extract: Settings + Dashboard

## Overview

First real extraction batch, and the densest. Settings (19 files, 35 toasts) plus
the `[slug]` dashboard root (7 files) and the quick switcher.

Deliberately first: settings has the highest string density per file and the most
form/validation copy, so any gap in the phase 4 skill surfaces here while there is
still time to fix the procedure rather than 100 files of output.

Namespaces: `settings`, `dashboard`, `nav`, `common`.

## Requirements

- Every string in the owned files resolves through `t()` or is allowlisted.
- English output byte-identical. No copy edits — a reworded label inside a 40-file
  diff is invisible to review.
- 18 static `metadata` exports exist repo-wide, 0 `generateMetadata`. The six in
  this batch convert.
- Ratchet entries for these paths removed in the same commit.
- No code comments (`AGENTS.md`).

## Architecture

**Owned files.** Disjoint from phases 7 and 8.

- `apps/app/app/(app)/[slug]/settings/**` — 19 files, minus the two phase 2 created
  or edited (`language-form.tsx`, and `page.tsx` where phase 2 mounted it; this
  phase still extracts `page.tsx`'s own strings, which is safe because phase 2
  lands first in the commit sequence).
- `apps/app/app/(app)/[slug]/{page,layout,dashboard-summary,overview-greeting,overview-scope,sales-dashboard}.tsx` — 6 files plus `overview-search-params.ts`.
- `apps/app/components/crm/quick-switcher.tsx` — the `GROUP_LABEL` map at line 23,
  consumed as a `CommandGroup heading` at line 89.

**Settings sub-areas** and their key prefixes, so keys do not collide:

| Path | Prefix |
| --- | --- |
| `settings/page.tsx`, `workspace-form.tsx`, `research-key.tsx`, `agent-model.tsx` | `settings.general.*` |
| `settings/connections/**` (3 files) | `settings.connections.*` |
| `settings/currencies/**` (2 files) | `settings.currencies.*` |
| `settings/members/**` (3 files) | `settings.members.*` |
| `settings/sso/**` (5 files) | `settings.sso.*` |
| `settings/layout.tsx`, `settings-sidebar.tsx` | `nav.settings.*` |
| `settings/tracking/**` (8 files, new on the `ad1d702` base) | `settings.tracking.*` |

The tracking sub-area arrived after the plan was researched (`d585dc3` →
`ad1d702`): `page.tsx`, `allowed-domains.tsx`, `tracking-cookies.tsx`,
`tracking-rules.tsx`, `tracking-script.tsx`, `tracking-sections.tsx`,
`traffic-sources.tsx`, `verify-installation.tsx`. File counts elsewhere in this
phase are advisory — the phase 3 checker scan on the actual base is authoritative.
<!-- Updated: Validation Session 1 - settings/tracking/** joined the batch (base moved to fork tip ad1d702) -->

Sidebar labels go to `nav`, not `settings` — they are navigation, and phase 7/8
sidebars will want the same namespace.

**Metadata.** Six `export const metadata` objects in this batch
(`settings/page.tsx:19`, `settings/currencies/page.tsx:17`,
`settings/members/page.tsx:18`, `settings/connections/page.tsx:18`,
`settings/sso/page.tsx:20`, and the root `layout.tsx:22` title template). Each
becomes:

```ts
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("general.metaTitle") };
}
```

The root `layout.tsx:22-36` template `"%s · Comp AI CRM"` contains a brand token —
extract the template but allowlist the brand. Note `layout.tsx` is also touched by
phases 1 and 5; this phase edits only the `metadata` export, so the three edits do
not collide as long as the commit sequence holds.

**Toasts.** 35 `toast.*()` sites under settings. Only those with a bare string
literal convert. `toast.error(error.message)` stays — API prose is out of scope and
converting it would need the API round, which is not this project.

**`GROUP_LABEL`.** A `Record` of display strings. Convert to a key map and translate
at the render site (line 89), per the phase 4 pure-data rule — not by making the
record itself call `t()`.

## Related Code Files

- Modify: `apps/app/app/(app)/[slug]/settings/` — `page.tsx`, `layout.tsx`, `settings-sidebar.tsx`, `workspace-form.tsx`, `research-key.tsx`, `agent-model.tsx`, `connections/{page,google-connection,microsoft-connection}.tsx`, `currencies/{page,currency-settings}.tsx`, `members/{page,members-table,members-search-params}.*`, `sso/{page,sso-table,add-sso-provider-sheet,copy-value,sso-search-params}.*`
- Modify: `apps/app/app/(app)/[slug]/` — `page.tsx`, `layout.tsx`, `dashboard-summary.tsx`, `overview-greeting.tsx`, `overview-scope.tsx`, `sales-dashboard.tsx`, `overview-search-params.ts`
- Modify: `apps/app/components/crm/quick-switcher.tsx`
- Modify: `apps/app/app/layout.tsx` — metadata only
- Modify: `apps/app/messages/en/{settings,dashboard,nav,common}.json`
- Modify: `apps/app/scripts/i18n/ratchet.json`

## Implementation Steps

1. Invoke the `i18n-extract` skill. Do not extract by hand — the skill exists so all
   three batches are done identically.
2. `bun run i18n:check` scoped to the owned paths. Record the baseline count; the
   phase reports a delta against it.
3. Work settings sub-area by sub-area in the prefix table order, committing nothing
   until the area's `check-types` passes. Six small passes beat one 19-file pass.
4. Per file, classify server vs client before touching it. Settings mixes both:
   `page.tsx` is a server component with an async `Settings()` child (lines 44-66),
   while `workspace-form.tsx` and siblings are client forms.
5. Convert the six metadata exports. `generateMetadata` must be `async`; the return
   type is `Promise<Metadata>`.
6. Convert toasts with literal arguments. Leave `error.message` passthroughs.
   Expect roughly a third of the 35 to convert.
7. `settings-sidebar.tsx` nav labels → `nav.settings.*`.
8. Dashboard files: `overview-greeting.tsx` likely holds time-of-day greeting
   strings — check whether it builds a sentence by concatenation. If so it needs an
   ICU `select`, not a wrapped fragment.
9. `sales-dashboard.tsx` and `dashboard-summary.tsx` render chart labels and money.
   Chart axis and legend strings extract normally. Do **not** touch amount
   selection, `baseAmount` usage, or any aggregate — `docs/currency.md`. Display
   formatting already moved in phase 5.
10. `quick-switcher.tsx` `GROUP_LABEL` → key map, translate at line 89.
11. Remove the batch's paths from the ratchet.
12. `bun run i18n:check && bun run check-types && bun run lint && bun run test`.
13. `bun run i18n:pseudo`, set the cookie to `pseudo`, walk every settings page and
    the dashboard. Any unaccented word is a miss — fix before committing.
14. Commit.

## Success Criteria

- [ ] `i18n:check` clean for all owned paths; their ratchet entries removed.
- [ ] All six metadata exports are `generateMetadata`; page titles still render in the browser tab.
- [ ] Every literal-string toast converted; every `error.message` toast untouched.
- [ ] Pseudo-locale walkthrough of all 6 settings pages + dashboard shows no unaccented text outside the allowlist.
- [ ] `en` rendering identical — compare against `main` for the settings index and dashboard.
- [ ] No wording changed. `git diff` on catalog values matches the previous literals character for character.
- [ ] Keys follow the prefix table; no `settings.*` key in `dashboard.json` or vice versa.
- [ ] Language switcher from phase 2 still works, now with its own labels translated.
- [ ] `check-types`, `lint`, `test` green.
- [ ] Zero code comments added.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| Skill procedure has a gap; discovered mid-batch | Med × Med | Deliberately the first batch. Fix the skill, then continue — do not work around it locally. |
| Server/client misclassification in mixed settings tree | Med × High | Step 4 classifies before editing; `check-types` per sub-area rather than per batch. |
| `generateMetadata` conversion breaks a route | Med × Med | Six conversions, all the same shape; build catches a bad signature. |
| Concatenated greeting resists a simple wrap | Med × Low | Step 8 flags it; ICU `select` is the answer, not string joining. |
| Copy silently edited while wrapping | Med × High | Step-by-step diff review of catalog values against the removed literals; explicit success criterion. |
| Chart work drifts into currency semantics | Low × High | File list contains no currency module; display formatting already done in phase 5. |
| `layout.tsx` edited by phases 1, 5 and 6 | Med × Low | Sequential commits, disjoint regions (providers / hydrator props / metadata). Conflict only if phases are reordered. |

**Rollback.** Revert the commit. Ratchet entries return with it, so `i18n:check`
goes green again on its own — the ratchet is what makes each extraction phase
independently revertible.

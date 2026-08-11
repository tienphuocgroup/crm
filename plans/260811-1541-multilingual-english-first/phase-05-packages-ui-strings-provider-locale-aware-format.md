---
phase: 5
title: "packages/ui Strings Provider + Locale-aware Format"
status: pending
priority: P1
dependencies: [1]
---

# Phase 5: packages/ui Strings Provider + Locale-aware Format

## Overview

Two jobs in one commit because they share the same files.

1. `UiStringsProvider` — a React context inside `packages/ui` holding its own
   strings with English defaults. The app overrides them once at the root from the
   `ui` namespace. `packages/ui` gains no next-intl dependency.
2. Locale-aware formatting — `@crm/ui/lib/format` takes a locale, the scattered
   per-component `Intl.DateTimeFormat("en-US")` constants collapse into it, and
   `formatCount` becomes an ICU plural message.

Money **semantics** are not touched. Only display locale. `docs/currency.md` —
`amount` vs `baseAmount`, `countedWhere`, frozen rates: none of it is edited here.

## Requirements

- No `next-intl` in `packages/ui/package.json`, direct or transitive.
- Every string has an English default; the provider is optional, so a component
  still renders correctly with no provider above it.
- App supplies overrides once, at the root, from `messages/en/ui.json`.
- `formatDay`, `formatMoney`, `formatMoneyCompact`, `formatPercent` accept a locale.
- No visual change in `en` (`docs/design.md`).
- `packages/ui/src/components` is excluded from Biome (`biome.jsonc`) — formatting
  there is manual; match surrounding style exactly.

## Architecture

**Why a context and not props.** Threading ~29 strings through call sites means
every consumer of `TablePagination` restates the same four labels. The
react-day-picker / MUI localization pattern — defaults in the package, one optional
override at the root — is the established shape for this problem.

**Shape.**

```
packages/ui/src/lib/ui-strings.ts     defaults object + type + createContext
packages/ui/src/components/ui-strings-provider.tsx   "use client" provider + useUiStrings()
```

`useUiStrings()` returns `defaults` merged with any provided partial, so a
partially-populated override is safe. The defaults object is the single source of
the English text; `messages/en/ui.json` mirrors its keys.

**Verified string inventory — 29 strings across 12 components.** The brainstorm
report said ~14; it missed 15 of these. Re-grepped, current:

| File:line | String |
| --- | --- |
| `data-table.tsx:241` | `Clear` |
| `data-table.tsx:467` | `No results found.` (behind an existing `empty` prop) |
| `data-table.tsx:488` | `Select every row on this page` (aria-label) |
| `date-picker.tsx:22` | `Select a date` (placeholder default) |
| `date-picker.tsx:78` | `Clear` |
| `table-pagination.tsx:37` | `No results` |
| `table-pagination.tsx:38-40` | `Showing {start}–{end} of {total}` |
| `table-pagination.tsx:51` | `Previous` |
| `table-pagination.tsx:62` | `Next` |
| `questionnaire.tsx:219` | `Previous` |
| `questionnaire.tsx:244` | `Skip` |
| `questionnaire.tsx:269` | `Next` |
| `questionnaire.tsx:294` | `Submit` |
| `reasoning.tsx:17` | `Reasoning` (label default) |
| `dot-matrix.tsx:17` | `Loading` (label default) |
| `spinner.tsx:31` | `Loading` (aria-label) |
| `suggestion.tsx:44` | `Accept` (aria-label) |
| `suggestion.tsx:52` | `Dismiss` (aria-label) |
| `thread-message.tsx:62` | `No message body.` |
| `attendee-list.tsx:31-34` | `Accepted`, `Declined`, `Maybe`, `No reply` |
| `attendee-list.tsx:79` | `No reply` (inline duplicate of the map value) |
| `command.tsx:37-38` | `Command Palette`, `Search for a command to run...` |
| `message-scroller.tsx:113` | `Scroll to end`, `Scroll to start` |
| `async-action.tsx:123-124` | `Done`, `Try again` |

`logo.tsx:10` `aria-label="Comp AI Logo"` stays hardcoded — brand, allowlisted in
phase 3.

Components whose string is already a defaulted prop (`date-picker` placeholder,
`reasoning` label, `dot-matrix` label, `async-action` labels, `questionnaire`
children, `data-table` `empty`) keep the prop and change only the **default** to
come from the context. Call sites that pass a value are unaffected.

**Formatting.** Current state in `packages/ui/src/lib/format.ts`:

- `:10` `percentFormat` — module singleton pinned to `en-US`.
- `:63` `dayFormat` — module singleton pinned to `en-US`.
- `:42`, `:51` — `Intl.NumberFormat(undefined, …)`. This is a latent bug today, not
  just an i18n gap: `undefined` means the *runtime's* locale, which is the server's
  on the server and the browser's on the client. Money can render differently before
  and after hydration. Passing an explicit locale fixes it.
- `:28` `fractionDigits` — also `en-US`, but this resolves how many decimals a
  *currency* has, not how it is displayed. It must stay locale-independent. **Do not
  change it.** Making it locale-aware would change rounding, which is a currency
  semantics change.

New signatures take an optional trailing `locale` defaulting to `"en-US"`, so every
existing call site keeps compiling and unmigrated ones keep today's behaviour.
Module-level singletons become a small keyed cache, mirroring the existing
`currencyDigits` map at `:21` and `getDateTimeFormatter` in `local-date-time.tsx:158`.

`formatCount(count, noun, plural)` at `:1-7` builds `"3 deals"` by concatenation.
It is deleted, not adapted — concatenated grammar cannot translate. Call sites move
to an ICU plural message in the owning namespace. Find them before deleting;
`packages/ui` has no visibility into who calls it.

**`local-date-time.tsx` — the hard case, absent from the brainstorm report.**
`apps/app/components/local-date-time.tsx:17` holds `LOCAL_DATE_TIME_SCRIPT`, a
stringified JS blob injected through `InlineScript`. It contains English:
`"—"` (`:17`, and `:131` in the TS twin), `"just now"` (`:134`), `"in " + u`,
`"{u} ago"` (`:147`), plus `m`/`h`/`d` suffixes. It runs as raw DOM script — no
React, no context, no `t()`. `LocalDateTimeHydrator` renders at
`apps/app/app/layout.tsx:58`, **outside** the provider stack, so context is
unavailable to it by construction.

Fix: `LocalDateTimeHydrator` becomes an async server component taking `locale` and a
`labels` object resolved via `getTranslations("common")`, and `LOCAL_DATE_TIME_SCRIPT`
becomes a function interpolating `JSON.stringify(locale)` and `JSON.stringify(labels)`
into the blob. The `Intl.*(void 0, …)` calls inside become `Intl.*(LOCALE, …)`.

The fallback path (`formatRelativeTime`, `:129-148`) is the same strings in TypeScript
and must be kept byte-identical to the script's output, or the text visibly changes
at hydration.

**Security.** Interpolating JSON into a `<script>` body is an injection surface.
The values are our own catalog strings, not user input, but escape every `<` in the
serialized output to its `\u003c` form anyway — a catalog string containing
`</script>` would otherwise terminate the tag. Cheap, and the alternative is trusting a translator.

## Related Code Files

- Create: `packages/ui/src/lib/ui-strings.ts` — defaults, type, context
- Create: `packages/ui/src/components/ui-strings-provider.tsx` — provider + hook
- Modify: 12 components listed in the inventory table
- Modify: `packages/ui/src/lib/format.ts` — locale params, cached formatters, delete `formatCount`
- Modify: `packages/ui/src/components/table-pagination.tsx:9` — `numberFormat` singleton → context locale
- Modify: `apps/app/components/local-date-time.tsx` — script parameterisation
- Modify: `apps/app/app/layout.tsx:58` — pass `locale` + `labels` to the hydrator
- Modify: `apps/app/components/locale-provider.tsx` — mount `UiStringsProvider` with the `ui` namespace
- Modify: `apps/app/messages/en/ui.json` — 29 keys
- Modify: `apps/app/messages/en/common.json` — relative-time labels
- Modify: `apps/app/components/crm/timeline/timeline.tsx:87`, `.../activity-composer.tsx:32`, `apps/app/components/agent-builder/team-agent-detail.tsx:68,77` — drop local `en-US` formatters
- Modify: `apps/app/test/day.spec.ts:16` — `formatDay` signature changed
- Modify: `apps/app/scripts/i18n/ratchet.json` — remove `packages/ui/**` and the touched app files

## Implementation Steps

1. Re-run `bun run i18n:check` scoped to `packages/ui` and reconcile against the
   inventory table. If the checker finds a string not listed, the table is stale —
   add it. If it misses one that is listed, the phase 3 rules have a gap; fix the
   rule, not the table.
2. Write `ui-strings.ts`: a flat `UiStrings` type, a `DEFAULT_UI_STRINGS` object with
   today's exact English, and the context defaulted to it. Flat, not nested — 29
   keys do not need a tree, and a flat shape makes the `ui.json` mirror obvious.
3. Write `ui-strings-provider.tsx`. `"use client"`. Merge partial over defaults with
   `useMemo` keyed on the incoming object.
4. Migrate the 12 components. Text-node strings read from `useUiStrings()`;
   defaulted props take their default from the hook. **`data-table.tsx` and
   `table-pagination.tsx` are not `"use client"`-marked at the top in every case** —
   check each before adding a hook, and add the directive if the component is
   genuinely client-side. A hook in a server component is a build error.
5. `table-pagination.tsx:38-40` becomes an ICU message with `{start}`, `{end}`,
   `{total}` pre-formatted by the caller. Keep the en-dash `–`; changing it to a
   hyphen is a visual change.
6. `attendee-list.tsx:79` duplicates `"No reply"` inline while `:31-34` holds the
   map. Route both through the same key — do not create two.
7. Rework `format.ts`: add the optional locale parameter, replace the two module
   singletons with a keyed cache, **leave `fractionDigits` on `en-US`**, and add a
   short note in the PR description explaining why (there can be no code comment).
8. Find every `formatCount` caller before deleting it. Convert each to an ICU plural
   in its own namespace. Delete the export last, so the compiler lists anything missed.
9. Parameterise `LOCAL_DATE_TIME_SCRIPT` into `buildLocalDateTimeScript(locale, labels)`.
   Escape `<` in the serialized JSON. Update the TS fallback to read the same labels.
10. Make `LocalDateTimeHydrator` async, resolve labels via `getTranslations("common")`,
    pass through from `layout.tsx:58`. It stays outside the provider stack — that is
    fine now, since it takes props rather than context.
11. Delete the four app-side `en-US` formatter constants and route them through
    `@crm/ui/lib/format` with the active locale.
12. Update `apps/app/test/day.spec.ts:16`. It asserts `"Dec 31, 2026"`; with an
    explicit `en-US` argument the assertion still holds. Add a second case with a
    different locale to prove the parameter is wired, rather than only that the
    default is unchanged.
13. Mount `UiStringsProvider` inside `locale-provider.tsx`, fed from the `ui`
    namespace, so one place supplies both.
14. Un-ratchet, then `bun run check-types && bun run lint && bun run test`. Commit.

## Success Criteria

- [ ] `packages/ui/package.json` has no `next-intl`; `bun.lock` shows none transitively.
- [ ] A `packages/ui` component rendered with **no** provider shows the original English.
- [ ] All 29 inventory strings resolve through the context; `i18n:check` on `packages/ui` is clean and `packages/ui/**` is out of the ratchet.
- [ ] `formatMoney`/`formatMoneyCompact` produce identical output server and client for the same locale — the `undefined`-locale hydration gap is closed.
- [ ] `fractionDigits` still uses `en-US`; money rounding is byte-identical to before.
- [ ] `formatCount` is gone and no caller remains; every converted site uses an ICU plural.
- [ ] `formatDay` with an explicit non-`en-US` locale returns a different string than with `en-US`.
- [ ] Relative times render identically before and after hydration — no visible flip.
- [ ] `messages/en/ui.json` keys match `DEFAULT_UI_STRINGS` exactly; neither has an orphan.
- [ ] Serialized script escapes `<` as `\u003c`; a catalog value containing `</script>` does not break the page.
- [ ] `bun run test` green including the updated `day.spec.ts`.
- [ ] No visual change in `en` — spot-check pagination, data-table empty state, date picker, attendee list.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| Date centralisation silently changes rendered dates | High × Med | Default stays `en-US`; `day.spec.ts` pins the format; spot-check timeline and agent detail, the two heaviest date surfaces. |
| Hook added to a non-client component | Med × High | Step 4 checks the directive per file; `check-types` and build catch it. |
| `formatCount` caller missed | Med × Med | Delete the export last and let the compiler enumerate. |
| Script interpolation breaks the page or injects | Low × High | Escape `<`; values are first-party; test with a hostile catalog value. |
| Hydration flip between script output and TS fallback | Med × Med | Both read the same labels object; step 9 changes them together. |
| Touching money rendering trips a `docs/currency.md` invariant | Low × High | Only display locale changes. `fractionDigits` untouched. No aggregate, filter or rate code is in this phase's file list. |
| Biome does not format `packages/ui/src/components` | Med × Low | Known exclusion; match surrounding style by hand. |

**Rollback.** Revertible as one commit, but it is the widest-reach infra change —
`format.ts` is consumed across the app. Land it before phases 6–8 so a regression
surfaces while the diff is still small. Reverting after 6–8 would strand the `ui`
namespace overrides; in that case revert forward instead.

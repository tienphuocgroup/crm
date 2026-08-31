---
phase: 2
title: "Import wizard UI"
status: completed
effort: "M"
---

# Phase 2: Import wizard UI

## Overview

Settings → Import page: upload CSV → map columns → dry-run report → apply with
progress → summary. Browser parses (papaparse) and drives sequential 500-row
chunk calls. Admin-only entry. All strings en+vi.

## Requirements

- Functional: four wizard states; header auto-match; required-mapping validation
  client-side (`name` for companies, `firstName` for contacts); in-file
  pre-dedupe by key; keyless-rows toggle (default skip); 50k row cap with a
  clear error; aggregated dry-run report before any write; per-chunk progress
  during apply; final summary with created/matched/skipped/error counts and
  row-level errors.
- Non-functional: server page computes, client component renders (AGENTS.md);
  no server-package imports in the client file; `packages/ui` components only,
  no className style overrides, radii from the scale (`docs/design.md`).

## Architecture

- `page.tsx` (server): resolves session + workspace role, passes a boolean
  `canImport` and plain data down. `await` lives here only.
- `import-wizard.tsx` (`"use client"`): owns its prop types; imports only
  `@crm/ui`, the tRPC client, React, papaparse. State machine:
  `upload → map → dryRun → apply → done`, chunking loop with
  `for (const chunk of chunks) await mutateAsync(...)` — sequential, not
  parallel, to keep the API polite and progress linear.
- Dry-run pass sends every chunk with `mode: "dryRun"` and aggregates results;
  apply repeats with `mode: "apply"`. A tab death mid-apply is recovered by
  re-running the same file (create-only idempotency) — say so in the UI copy
  on the apply step.
- Column mapping: normalize headers (`lowercase, strip spaces/underscores`) and
  auto-match against the row schema's field list; unmatched columns default to
  "ignore"; user can remap via `Select` from `@crm/ui`.
- After a successful apply, invalidate through `useCrmCache()`
  (`lib/trpc/cache.ts`) — say what changed (companies/contacts), never list
  query keys at the call site; add a call there if the existing surface lacks
  a bulk-shaped one.

## Related Code Files

- Create: `apps/app/app/(app)/[slug]/settings/import/page.tsx`
- Create: `apps/app/app/(app)/[slug]/settings/import/import-wizard.tsx`
- Create: `apps/app/app/(app)/[slug]/settings/import/csv.ts` (parse + header
  match + chunk helpers, client-safe, unit-testable)
- Modify: `apps/app/app/(app)/[slug]/settings/settings-sidebar.tsx` (Import
  entry; render only when the caller can import — follow how the sidebar
  currently receives workspace data)
- Modify: `apps/app/package.json` (papaparse + `@types/papaparse`)
- Create: `packages/ui/src/components/progress.tsx` (shared Progress component
  — none exists yet)
- Modify: `apps/app/messages/en/settings.json` and `messages/vi/settings.json`
  (all wizard strings, ICU plurals for counts — en and vi in the same change,
  per `docs/i18n.md`; namespace `settings`, keys `settings.import*`)

## Implementation Steps

1. Add papaparse. Parse with `header: true`, `skipEmptyLines: true`,
   `worker: true` (20k rows must not jam the main thread).
2. Build `csv.ts`: header normalization + auto-match, key normalization for
   in-file dedupe (lowercased email/domain), chunk splitter, 50k cap check.
3. Server page: role gate — non-admin gets `notFound()` (page level) and no
   sidebar entry (nav level); the service 403 from Phase 1 is the real guard.
4. Wizard states with `@crm/ui` components (Card/Table/Select/Button/Progress
   or closest existing equivalents — check `packages/ui` before assuming a
   component exists; a missing variant is implemented in `packages/ui`, not
   improvised locally).
5. Dry-run report UI: totals band + problem table (`row, field, reason`,
   pointing at CSV line numbers) covering errors AND warnings (e.g.
   `companyNotFound` rows that import unlinked). Render the first 200 problem
   rows with full counts; add a client-side CSV download (Blob) of every
   problem row. Keyless and in-file-duplicate rows listed under skips with the
   toggle beside them. Dry-run is mandatory: apply stays disabled until this
   report has rendered.
   <!-- Updated: Validation Session 1 - warnings, 200-row cap, full CSV download, mandatory dry-run -->
5b. Apply progress bar: `packages/ui` has no Progress component — implement one
   there (shared, per docs/design.md), never a local one-off.
6. Apply: sequential chunk loop, progress = chunks done / total, summary state
   reuses the report layout with final counts.
7. Locale keys both catalogs; run `bun run i18n:check`.

## Success Criteria

- [ ] Full wizard flow works against dev API with a real CSV
- [x] Non-admin sees no entry and cannot reach the page
- [ ] 20k-row file parses without freezing the tab (worker on)
- [ ] Re-running the applied file reports ~all `matchedExisting`, 0 created
- [x] `i18n:check` passes; no hardcoded user-visible strings
- [x] No server package imported from the client file (build proves it)

## Risk Assessment

- Header auto-match mismaps a column → dry-run report is the safety net; the
  mapping step always shows what goes where before any call is made.
- Sequential chunks are slow on huge files (~40 calls / 20k rows) — accepted
  in brainstorm; do not parallelize without revisiting the design.

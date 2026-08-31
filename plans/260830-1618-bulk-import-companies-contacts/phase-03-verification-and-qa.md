---
phase: 3
title: "Verification and QA"
status: in-progress
effort: "S"
---

# Phase 3: Verification and QA

## Overview

Prove the acceptance criteria end to end, at scale, and document the module.
No new feature code in this phase.

## Requirements

- Functional: full manual pass at 20k rows; idempotent re-run proven; enrich-later
  path proven via `bulkEnrich` on a sample of imported rows.
- Non-functional: every repo gate green; short docs entry for the new module.

## Related Code Files

- Modify: `docs/api.md` (short "Imports" section: create-only semantics,
  no CRM events, `source: IMPORT` + `enrichmentStatus: SKIPPED`, the permission)
- Create (scratchpad only, NOT in repo): CSV fixture generator script producing
  20k synthetic companies + contacts with planted duplicates, keyless rows,
  case-variant keys, one suppressed email

## Implementation Steps

1. Gates: `bun run --filter=api test`, `bun run i18n:check`,
   `bun run check-types`, `bun run lint`. Fix regressions, never weaken tests.
2. Generate the 20k fixture in the session scratchpad directory.
3. Ask the user to start dev servers (never start them yourself — house rule),
   then run the manual pass: dry-run → verify report matches planted rows →
   apply → verify counts → re-run same file → expect 0 created.
4. Verify imported rows in the app: no enrichment spinner, `source` shows
   IMPORT wherever surfaced; select a handful → `bulkEnrich` → they enter the
   normal enrichment pipeline.
5. Verify a suppressed contact stayed out and is listed as skipped.
6. Add the `docs/api.md` section (respect docs.maxLoc 800 — trim if near).
7. Report results with the AGENTS.md `## Issues` list format; ask the user to
   verify before any commit (commit only on explicit request).

## Success Criteria

- [x] All four gates pass
- [ ] 20k-row apply completes; re-run creates 0 duplicates
- [ ] Suppressed contact not recreated
- [ ] `bulkEnrich` works on imported rows
- [x] `docs/api.md` updated; no markdown created outside docs/ or plans/
- [x] User verification requested before commit

## Risk Assessment

- `bulkEnrich` behavior on large selections is the brainstorm's UNKNOWN — test
  with a small sample (5–10 rows) only; do not select-all 20k against real
  credits. Note findings in the report.

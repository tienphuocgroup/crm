---
title: "Bulk import for companies and contacts"
description: "CSV bulk import: browser-driven chunked upserts, admin-gated Settings page, create-only dedupe, enrich-later"
status: in-progress
priority: P2
branch: "dev"
tags: [import, companies, contacts, settings]
blockedBy: []
blocks: []
created: "2026-08-30T09:28:02.753Z"
createdBy: "ck:plan"
source: skill
---

# Bulk import for companies and contacts

## Overview

Admins import a customer book (up to 20k+ rows) from CSV. Browser parses and
drives chunked tRPC calls; server does create-only upserts keyed on
`Company.domain` / `Contact.email`. Re-running a file is the resume mechanism.
No file storage, no job table, no cron, no schema migration (`RecordSource.IMPORT`
and `EnrichmentStatus.SKIPPED` already exist).

Design approved in brainstorm:
`plans/reports/brainstorm-260830-1618-bulk-import-companies-contacts-report.md`

## Decisions (locked in brainstorm — do not reopen)

- Create-only on match. Existing records untouched, counted as `matchedExisting`.
- Keyless rows (contact without email, company without domain) skipped by
  default; explicit toggle to include them.
- No per-row CRM events — no `withCrmEvents`, no `AgentTask` writes. 20k events
  would flood agent triggers. Enrichment later via existing `bulkEnrich`.
- Created rows: `source: IMPORT`, `enrichmentStatus: SKIPPED` (no spinner).
- CSV only, companies + contacts only. No deals, no custom fields, no
  update-on-match, no HubSpot association files (that is crm-plan Phase 10, later).
- Chunk size 500 rows/call. File cap 50,000 rows, enforced client-side.

Validated 2026-08-30 (Session 1):

- No `ownerEmail` column in v1 — rows import unowned; `bulkAssignOwner` after.
- Contact `companyName` matching nothing → contact imports unlinked, row
  reported as a warning. No auto-created name-only companies.
- Dry-run is mandatory; apply is only enabled after its report renders.
- Problem report: first 200 rows rendered + full counts + client-side CSV
  download containing every problem row.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [API imports module](./phase-01-api-imports-module.md) | Completed |
| 2 | [Import wizard UI](./phase-02-import-wizard-ui.md) | Completed |
| 3 | [Verification and QA](./phase-03-verification-and-qa.md) | In Progress |

## Dependencies

None blocking. `plans/260812-2301-vietnamese-locale` (awaiting-user-verification)
is adjacent only: every new string here ships en+vi in the same change per
`docs/i18n.md`, so no ordering constraint.

## Acceptance criteria

- 20k-row CSV: dry-run and apply complete without 5xx; re-run creates 0 duplicates.
- Dry-run reports created/matched/skipped/errors per row before any write.
- Imported rows show no enrichment spinner; `bulkEnrich` on them works after.
- Non-admin: no sidebar entry, no page, 403 on direct tRPC call.
- `i18n:check`, `check-types`, `lint`, api tests all pass.

## Required reading before implementing

`docs/api.md`, `docs/i18n.md`, `docs/design.md`, `AGENTS.md`,
`.agents/skills/` (nestjs-trpc, prisma, shadcn skills if present).

## Open questions

None. (Row cap resolved: 50k client-side.)

## Validation Log

### Session 1 — 2026-08-30

#### Verification Results
- Claims checked: ~20 | Verified: all | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Refinements: use `workspaceRoleOf` (`workspace.service.ts:105`) for the role
  read; `packages/ui` lacks a Progress component — build it there per
  `docs/design.md`.

#### Decisions
| # | Question | Decision |
|---|---|---|
| 1 | ownerEmail column? | No owners in v1; bulkAssignOwner after import |
| 2 | Unmatched companyName? | Import unlinked + warning; no auto-create |
| 3 | Dry-run mandatory? | Yes, always before apply |
| 4 | Report size | First 200 rendered + totals + full CSV download |

#### Whole-Plan Consistency Sweep
Decisions propagated to phase-01 (result shape gains `warnings`, role read via
`workspaceRoleOf`, no-owner note) and phase-02 (report rendering + CSV download,
Progress component in packages/ui). No stale terms or contradictions remain.

### Session 2 — 2026-08-31

#### Implementation
- Phases 1 and 2 implemented on branch `dev`. All gates green: repo
  `check-types`, `lint`, `i18n:check`, api tests (369), app tests (161).
- `imports.commit` generated into `server.ts`; 11 service tests in
  `apps/api/test/imports.spec.ts`, 9 csv-helper tests in
  `apps/app/test/import-csv.spec.ts`.
- Deviation from phase-01 note: input gained `includeKeyless` flag so the
  keyless toggle works server-side (brainstorm requires the toggle; the
  "server skips keyless as defense" note only covers the default path).
- `workspace.get` gained additive `canImport` so sidebar/page gate and the
  service 403 cannot disagree (docs/api.md permission rule).

#### Code review (code-reviewer subagent)
- DONE_WITH_CONCERNS; all fixes applied same session: apply-retry now resumes
  from the failed chunk (keyless rows no longer duplicated on retry), company
  domain lookups made case-insensitive, papaparse errors surfaced on the map
  step, dry-run gained a retry control, duplicate CSV headers deduped via
  transformHeader, re-run copy scoped to keyed rows.
- Accepted as known limit: `row` numbers assume one CSV line per record
  (embedded newlines shift them); client `normalizeImportDomain` mirrors the
  server copy (package boundary), pinned by unit tests.

#### Remaining (phase 3 manual pass — needs dev servers, user-run)
- 20k dry-run/apply/re-run via the wizard; fixtures in session scratchpad.
- Suppressed-contact check at scale; `bulkEnrich` on a 5–10 row sample.

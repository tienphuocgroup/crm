# Brainstorm — Bulk import for companies and contacts

Date: 2026-08-30 | Branch: dev | Status: design approved | Flags: none

## Problem statement

No bulk import exists. Admins cannot load an existing customer book (20k+ records)
into the CRM. Existing `bulk*` mutations operate on already-existing rows only
(assign owner, enrich, delete, set company). Creation is single-record tRPC `create`.

## Requirements (from discovery)

- Expected output: Settings → Import page + `imports.commit` tRPC endpoint. Admin
  uploads CSV, maps columns, dry-runs, applies. Companies and contacts.
- Acceptance: 20k-row CSV imports without timeout; re-running same file creates zero
  duplicates; dry-run reports created/matched/skipped/errors before any write;
  imported rows show no enrichment spinner.
- Scope boundary v1: no deals, no HubSpot association files, no custom fields
  (`FieldValue`), no update-on-match, CSV only.
- Constraints: admin-run, occasional. 20k+ rows. Enrich later via existing
  `bulkEnrich`, never automatically. API on Vercel functions. No blob storage
  dependency (self-hoster rule). No intelligence in API.
- Touchpoints: new `apps/api/src/imports/` module; `@crm/auth` permission;
  Settings page in `apps/app`; existing `normalizeEmail`/`normalizeDomain`,
  `SuppressedContact` filter, i18n catalogs.

## Evaluated approaches

| Option | Shape | Verdict |
| --- | --- | --- |
| A. CLI importer | Repo script, direct Prisma | Rejected: laptop→prod DB path, not discoverable |
| B. API endpoint + admin UI, browser-driven chunks | Chosen | Right size for occasional admin use |
| C. Full Phase 10 (HubSpot, associations, mapping UI) | Deferred | Overkill; no dataset exists yet |

Raw `psql \copy` rejected: skips normalizers, suppression filter, source stamping.

## Final design (approved)

Browser-driven chunked import. No file storage, no job table, no cron, no worker.

```
upload CSV → papaparse in browser → column mapping (auto-match headers) →
dry-run (chunked tRPC, no writes) → report → apply (chunked upserts) → summary
```

- `imports.commit` mutation: `{ kind: "company"|"contact", mode: "dryRun"|"apply",
  rows: ImportRow[] }`, max 500 rows/call (~40 calls for 20k). Zod at boundary.
  Returns `{ created, matchedExisting, skipped, errors[{row, field, reason}] }`.
- Router thin, `ImportsService` owns Prisma. Gated by new `canImportRecords`
  permission (owner/admin) in `@crm/auth` — service enforces, UI hides.
- Created rows: `source: IMPORT`, `enrichmentStatus: SKIPPED`. Both enum values
  already exist — **zero schema migration**.
- **Create-only on match** (decided): existing rows untouched, counted. Idempotent
  re-run = resume mechanism after tab death. Update-empty-fields is v2.
- **Keyless rows skipped by default** (decided): contact without email / company
  without domain breaks idempotency; dry-run names them, toggle to include.
- **No per-row CRM events**: normal create emits `company.created` via
  `agent.withCrmEvents`; 20k events would flood agent triggers. Import writes plain
  rows. Deliberate divergence, matches "enrich later".
- Contact→company link: `companyDomain` (first) or exact `companyName` (second)
  column resolves against existing/just-imported companies.
- Canonicalise through `normalizeEmail`/`normalizeDomain`. `SuppressedContact`
  matches reported as skipped, never recreated.
- UI: one Settings page, four states, `packages/ui` components only, all strings
  through i18n catalogs.

## Risks

1. RISK — Apply needs the tab open ~1–2 min for 20k rows. Mitigation: idempotent
   re-run, not a worker.
2. RISK — In-file duplicate keys. Client pre-dedupes; dry-run reports.
3. UNKNOWN — `bulkEnrich` behavior on thousands of selected rows (credit throttle).
   Verify before advising select-all → enrich.

## Success metrics

- 20k-row file: dry-run and apply complete, no 5xx, no duplicate rows on re-run.
- Imported rows render without enrichment spinner; `bulkEnrich` on them works.
- Admin-only: non-admin sees no entry point and gets 403 on direct call.

## Next steps

Hand to `/ck:plan` with this report as context. Docs to read at plan time:
`docs/api.md`, `docs/i18n.md`, `docs/design.md`, `.agents/skills/` (nestjs-trpc,
prisma, shadcn).

## Unresolved questions

- Row cap per file (suggest 50k hard limit) — decide at plan time.
- Whether dry-run should also validate contact `firstName` required mapping
  client-side before any server call — plan-time detail.

# Cook report — bulk import for companies and contacts

Plan: `plans/260830-1618-bulk-import-companies-contacts/` | Branch: `dev` | Date: 2026-08-31

## What shipped

Phase 1 — API (`apps/api/src/imports/`):
- `imports.commit` mutation. Input: kind (company|contact), mode (dryRun|apply), includeKeyless, rows (max 500).
- Create-only upserts. Dedupe on normalized domain/email. `createMany skipDuplicates` makes re-runs and races safe.
- Created rows get `source: IMPORT`, `enrichmentStatus: SKIPPED`. No AgentTask. No CRM events.
- Suppressed contacts skip, case-insensitive. Contact→company link: domain first, exact name second. Unmatched link = warning, row imports unlinked.
- Gate: new `canImportRecords` in `@crm/auth` (owner+admin). Service throws 403. `workspace.get` returns `canImport` for the UI.
- Result per chunk: created, matchedExisting, skipped, errors[], warnings[] with row numbers.

Phase 2 — UI (`apps/app/.../settings/import/`):
- Wizard: upload → map → dry-run → apply → done. papaparse in a worker. 50k row cap. Header auto-match. In-file dedupe client-side.
- Dry-run mandatory; apply disabled until report renders. First 200 problems rendered; full problem CSV download.
- Keyless toggle re-runs dry-run. Apply shows a shared `Progress` bar (new `packages/ui/src/components/progress.tsx`).
- Apply retry resumes from the failed chunk. Cache invalidated via `useCrmCache`.
- Sidebar entry gated on `workspace.get().canImport`; page calls `notFound()` for non-admin.
- All strings en+vi (`settings.import*`, `nav.settings.import`), healthcare vocabulary (Organizations/Clients).

Phase 3 — partial:
- Gates green: `check-types` (13 tasks), `lint` (pre-existing warnings only), `i18n:check` (0 findings), api tests 369 pass, app tests 161 pass.
- `docs/api.md` gained an Imports section (300 lines total, under the 800 cap).
- 20k fixtures generated in session scratchpad: `companies-20k.csv`, `contacts-20k.csv` with planted duplicates, keyless rows, case variants, invalid values, one suppressed email, 20 unknown-company warnings, 10 by-name links.

## Code review

`code-reviewer` subagent ran on the full change set. Verdict: DONE_WITH_CONCERNS. Fixes applied this session:
1. MAJOR: apply retry restarted from chunk 0 and duplicated keyless rows → retry now resumes from the failed chunk.
2. Company domain lookups now `mode: "insensitive"` (legacy mixed-case rows match instead of duplicating).
3. papaparse row errors now surface as a map-step alert.
4. Dry-run failure now shows a retry button.
5. Duplicate CSV headers deduped at parse (`transformHeader`).
6. Re-run copy scoped to keyed rows.

Accepted, not fixed: problem-report row numbers assume one CSV line per record; client domain normalizer mirrors the server copy (package boundary), pinned by unit tests on both sides.

## Manual QA still required (needs dev servers — start them yourself)

1. Sign in as an admin. Settings → Import appears. As a member it does not, and `/settings/import` 404s.
2. Import `companies-20k.csv` (scratchpad). Expect dry-run: ~19,800 new, 10 errors (5 invalid domains, 5 blank names), 40 keyless skips, 150 in-file duplicates. Apply. Re-run same file: 0 created, ~19,800 matched.
3. Import `contacts-20k.csv`. Expect 10 errors, 40 keyless, 100 duplicates, 20 companyNotFound warnings, 10 by-name links. Apply. Re-run: 0 created.
4. Suppression: create a `SuppressedContact` with email `suppressed-import@import-fixture-1.example` before the contact run; verify it counts skipped and no contact row exists after apply.
5. Imported rows show no enrichment spinner. Select 5–10 → `bulkEnrich` → they enter the normal pipeline. Do NOT select all 20k (credits).
6. Delete fixture data after the pass (domains end in `.example`).

## Issues

1. NOT DONE — Phase 3 manual pass has not run. Dev servers are user-started.
   Fix: user runs the QA steps above; then mark phase 3 complete.
2. RISK — Problem-report row numbers shift when a quoted cell contains a newline.
   Fix: not done. Accepted; papaparse gives no original line number cheaply.
3. RISK — `apps/api/tmp-check-mailbox-sync.ts` and `tmp-list-users.ts` are untracked, hold a real user email, and predate this feature.
   Fix: keep them out of any commit. Not part of this change.
4. RISK — Unrelated modified files share the working tree (README.md, docs/agent.md, packages/db seed files, release-manifest.json, .claude/settings.json).
   Fix: commit this feature's files only. List is in the report handoff.
5. NOT DONE — Production build not run (house rule: user runs builds). Typecheck and review stand in for the client/server boundary proof.

## Unresolved questions

None. All plan decisions held; the one input-shape addition (`includeKeyless`) is logged in plan.md Session 2.

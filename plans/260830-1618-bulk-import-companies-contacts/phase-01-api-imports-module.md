---
phase: 1
title: "API imports module"
status: completed
effort: "M"
---

# Phase 1: API imports module

## Overview

New `apps/api/src/imports/` module: one tRPC mutation `imports.commit` doing
create-only chunked upserts for companies and contacts, admin-gated by a new
`canImportRecords` permission. Zero schema migration.

## Requirements

- Functional: dry-run and apply modes; per-chunk result counts + row errors;
  dedupe on normalized domain/email; suppressed contacts skipped; contact→company
  resolution by domain then exact name.
- Non-functional: 500-row chunk finishes well inside a Vercel function budget;
  idempotent under re-runs and races (`createMany skipDuplicates`).

## Architecture

- Mirror the `apps/api/src/fields/` module shape: `imports.contracts.ts`,
  `imports.service.ts`, `imports.router.ts`, `imports.module.ts`.
- Router thin (`@Router({ alias: "imports" })`, `@UseMiddlewares(AuthMiddleware)`),
  zod in, service out — per `docs/api.md`. Prisma only in the service.
- No intelligence: no vendor calls, no enrichment, no `AgentTriggerService`,
  no `withCrmEvents`. Import is mechanical writes with `source: IMPORT`,
  `enrichmentStatus: SKIPPED`.
- Parse at the boundary: `imports.contracts.ts` owns the row schemas
  (`z.discriminatedUnion` or per-kind schemas); nothing downstream sees
  `Record<string, unknown>`.

Input shape:

```ts
importCommitInput = z.object({
  kind: z.enum(["company", "contact"]),
  mode: z.enum(["dryRun", "apply"]),
  rows: z.array(rowSchema).min(1).max(500),
});
```

Company row: `name` (required), `domain`, `website`, `industry`, `city`,
`country`, `phone`, `email`, `linkedinUrl`. Contact row: `firstName` (required),
`lastName`, `email`, `phone`, `title`, `linkedinUrl`, `companyDomain`,
`companyName`. All optionals through `blankToNull`. Model field lists on the
existing `contactCreateInput` / `companyCreateInput` in `*.contracts.ts` —
do not invent columns the schema lacks.

Result shape:
`{ created, matchedExisting, skipped, errors: [{ row, field, reason }], warnings: [{ row, field, reason }] }`
(`row` = caller-supplied index so the UI can point at the CSV line). `errors`
are rows not written; `warnings` are rows written with a caveat — today only
`companyNotFound` on a contact whose `companyDomain`/`companyName` matched
nothing (the contact imports unlinked; no name-only company is auto-created).

No `ownerEmail` handling in v1 — rows import unowned; owner assignment happens
after import via the existing `bulkAssignOwner`.
<!-- Updated: Validation Session 1 - warnings bucket, no-owner scope, no auto-created companies -->

## Related Code Files

- Create: `apps/api/src/imports/imports.contracts.ts`
- Create: `apps/api/src/imports/imports.service.ts`
- Create: `apps/api/src/imports/imports.router.ts`
- Create: `apps/api/src/imports/imports.module.ts`
- Modify: `apps/api/src/app.module.ts` (register module)
- Modify: `packages/auth/src/organization.ts` (+ its barrel export) — `canImportRecords`
- Create: api test spec beside the existing api test convention (locate the
  current `*.spec.ts` layout in `apps/api` first and match it)

## Implementation Steps

1. Add `canImportRecords(role)` in `packages/auth/src/organization.ts` next to
   `canManageCurrency` (owner + admin true). Export like its siblings.
2. Scaffold the module mirroring `fields/`. Register in `app.module.ts`.
3. Contracts: row schemas above; reuse `normalizeEmail`/`normalizeDomain`
   (`crm/values.ts`, `companies/domain.ts`) inside the service, not the schema.
4. Service `commit(ctx, input)`:
   a. Resolve caller's workspace role via `workspaceRoleOf(userId)`
      (`workspace.service.ts:105`); throw `ForbiddenException` unless
      `canImportRecords`.
   b. Normalize keys per row; collect rows failing validation into `errors`.
   c. Keyless rows → `skipped` (client already filters; server counts them
      again as defense).
   d. Companies: `findMany({ where: { domain: { in: keys } } })` →
      `matchedExisting`; remainder `createMany({ data, skipDuplicates: true })`
      when `mode === "apply"`; `created` from the result count.
   e. Contacts: same by email. Before create, check `SuppressedContact`
      (case-insensitive, as `externalParticipants` does) → those are `skipped`,
      never recreated. Resolve `companyId`: normalized `companyDomain` lookup
      first, exact `companyName` match second, else null.
   f. `dryRun`: identical reads and classification, zero writes.
5. Router: single `@Mutation({ input: importCommitInput }) commit(...)`.
6. Logging per `docs/api.md`: one object, counts only, never row contents
   (emails/names are personal data).
7. Run `check-types` so `src/generated/server.ts` regenerates — it is committed,
   and `build` never regenerates it; the app cannot see `imports.commit` until
   this runs.
8. Tests (service level): idempotency (same rows twice → second run all
   `matchedExisting`), suppression skip, keyless skip, case normalization
   (`ACME.com` == `acme.com`), dryRun writes nothing, company resolution
   domain-before-name, non-admin 403.

## Success Criteria

- [x] `imports.commit` visible in regenerated `server.ts`
- [x] All service tests above pass (`bun run --filter=api test`)
- [x] Non-admin call rejected at the service, not just hidden in UI
- [x] No `AgentTask`/`AgentEvent` rows written by an import
- [x] No code comments (AGENTS.md), no console.log

## Risk Assessment

- Race between two admins importing the same file: `skipDuplicates` +
  DB-unique `domain`/`email` make it safe; counts may differ, rows cannot.
- `createMany` gives no per-row ids; acceptable — result is counts, and the
  UI never needs created ids.

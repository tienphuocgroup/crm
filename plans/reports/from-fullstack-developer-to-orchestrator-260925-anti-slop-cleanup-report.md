# Anti-slop lint cleanup — `fix/i18n-restore-after-upstream-merge`

Date: 2026-09-25
Checkout: `/private/tmp/claude-501/-Users-luan-repos-crm/692d3c85-a2c0-4faf-9693-e127aa9f10c1/scratchpad/dev-check`
Branch: `fix/i18n-restore-after-upstream-merge` (not committed, not pushed)

Read first: `AGENTS.md` ("Parse at the boundary", "Constants"), `docs/design.md`,
`.oxlintrc.json`, and the rule sources in `tools/oxlint/anti-slop/`.

## Result

`bun run lint:slop`: 36 errors before, 0 after.

## Pattern applied per rule

### `no-known-value-widening` (28)

1. Narrow-key tables: the annotation moves to `satisfies`. Every key type stays
   a union or an enum, so each call site compiles unchanged.
   Files: `overview-scope.tsx`, `language-form.tsx`, `agent-builder-chat.tsx`,
   `agent-builder-sidebar.tsx`, `team-agents-index.tsx`, `app-icon-rail.tsx`,
   `record-actions.tsx` (4 tables), `i18n/locale.ts`, `i18n/request.ts`,
   `lib/agent-record.ts`, `lib/deal-stage.ts`, `test/agent-session.spec.ts`.
2. Open-string tables: the table keeps `satisfies Record<string, …>`, and the
   call site narrows the key with an `Object.hasOwn` type predicate.
   Files: `import-report.tsx` (2), `lib/agent-tool-display.ts`,
   `scripts/i18n/pseudo.ts`, `packages/db/prisma/seed.ts` (2).
3. Connect-error tables: the table now holds message keys, not translated text.
   It moves to module scope. A predicate narrows the OAuth error code.
   Files: `google-connection.tsx`, `microsoft-connection.tsx`,
   `slack/slack-connect-button.tsx`.
4. `grant-access/page.tsx`: the key type is `MailboxProviderId`, which the page
   imports from `@crm/auth`.
5. Anonymous return objects get a named contract, like the neighbouring
   `Ratchet` and `SeededDeal` types: `Allowlist` in `scripts/i18n/check.ts`,
   `Position` in `scripts/i18n/rules.ts`, `ClientName` in `prisma/seed.ts`.

### `no-runtime-typeof` (6)

- `scripts/i18n/check.ts`: a zod object schema validates each allowlist entry.
  The `as Record<string, AllowlistEntry>` cast is gone.
- `scripts/i18n/catalogs.ts`: a recursive zod schema decodes a catalog file into
  tagged `CatalogNode` values at the read. `flatten` switches on `node.kind`.
- `scripts/i18n/pseudo.ts`: a recursive zod schema accents the messages while it
  parses. `pseudoCatalog` is now one `parse` call.
- `settings/import/csv.ts` and `packages/ui/src/lib/ui-strings.ts`: the value is
  already typed `string | undefined`, so the check is `value !== undefined`.

### `no-unknown-parameters` (1)

`lib/local-date-time-script.ts`: `scriptJson` takes `string | LocalDateTimeLabels`.
Both call sites pass one of those two types.

### `no-conditional-empty-object-spread` (1)

`apps/api/src/deals/deals.service.ts`: `contactOptions` builds `where` in a
separate statement with a ternary between two complete objects.

## Files changed (27)

apps/api/src/deals/deals.service.ts
apps/app/app/(app)/[slug]/overview-scope.tsx
apps/app/app/(app)/[slug]/settings/connections/google-connection.tsx
apps/app/app/(app)/[slug]/settings/connections/microsoft-connection.tsx
apps/app/app/(app)/[slug]/settings/connections/slack/slack-connect-button.tsx
apps/app/app/(app)/[slug]/settings/import/csv.ts
apps/app/app/(app)/[slug]/settings/import/import-report.tsx
apps/app/app/(app)/[slug]/settings/language-form.tsx
apps/app/app/(landing)/grant-access/page.tsx
apps/app/components/agent-builder/agent-builder-chat.tsx
apps/app/components/agent-builder/agent-builder-sidebar.tsx
apps/app/components/agent-builder/team-agents-index.tsx
apps/app/components/app-icon-rail.tsx
apps/app/components/crm/record-sheet/record-actions.tsx
apps/app/i18n/locale.ts
apps/app/i18n/request.ts
apps/app/lib/agent-record.ts
apps/app/lib/agent-tool-display.ts
apps/app/lib/deal-stage.ts
apps/app/lib/local-date-time-script.ts
apps/app/scripts/i18n/catalogs.ts
apps/app/scripts/i18n/check.ts
apps/app/scripts/i18n/pseudo.ts
apps/app/scripts/i18n/rules.ts
apps/app/test/agent-session.spec.ts
packages/db/prisma/seed.ts
packages/ui/src/lib/ui-strings.ts

No catalog file changed. `messages/en` and `messages/vi` are untouched.
No rule suppression. No change to `.oxlintrc.json`. No code comment added.

## Verification

| Command | Result |
| --- | --- |
| `bun run lint:slop` | 0 errors (exit 0) |
| `bun run check-types` | 13 tasks, 13 successful |
| `bun run lint` | 9 tasks, 9 successful |
| `bun run i18n:check` | 0 findings, 345 files, 48 allowlisted |
| `bun run i18n:catalogs` | catalogs in sync for vi, 1 pre-existing warning |
| `apps/app` `bun test` | 183 pass, 0 fail |
| `packages/db` `bun test` | 115 pass, 0 fail |
| `apps/api` `bun run test` | 402 pass, 0 fail |
| `packages/ui` `bun test` | no test files in the package |

Extra equivalence checks, with temporary scripts that are now deleted:

- `pseudoCatalog`: the new and the old implementation give byte-identical output
  for all 10 English catalogs.
- `flatten`: the new and the old implementation give identical flat entries for
  all 20 catalog files, 3382 entries.
- The allowlist schema and the old predicate agree on 7 cases: valid, blank,
  empty, missing, null, number, extra keys.
- `deals.contactOptions`: both branches keep their existing tests in
  `apps/api/test/deal-contacts.spec.ts`.

## Issues

1. RISK — A catalog value that is not a string, a number, a boolean, null or an
   object stops `i18n:pseudo` and `i18n:catalogs` with a parse error. The old
   code ignored that value. An array in a catalog fails the same way.
   Fix: not done. The catalogs hold only strings and objects today. A parse
   error is the intended failure mode. I caused this.
2. RISK — `mergeUiStrings` now copies a non-string value from an untyped
   JavaScript caller. The old `typeof` check dropped it. TypeScript callers give
   `Partial<UiStrings>`, so they see no change.
   Fix: not done. `packages/ui` has no zod dependency. A schema needs that
   dependency. I caused this.
3. NOT DONE — `mergeUiStrings` keeps its `key as keyof UiStrings` cast. The cast
   is older than this task and no rule flags it.

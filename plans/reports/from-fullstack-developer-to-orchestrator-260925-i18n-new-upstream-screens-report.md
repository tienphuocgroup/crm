# i18n — eight new upstream app files

Branch `fix/i18n-restore-after-upstream-merge`, checkout `scratchpad/dev-check`.

## Per file

| File | Namespace | Keys used |
| --- | --- | --- |
| `apps/app/app/(app)/[slug]/settings/api-keys/api-keys-table.tsx` | `settings.apiKeys`, `common` | 15 new + `common.actions`, `common.cancel` |
| `apps/app/app/(app)/[slug]/settings/api-keys/create-api-key-sheet.tsx` | `settings.apiKeys`, `common` | 11 new + `common.cancel` |
| `apps/app/app/(app)/[slug]/settings/api-keys/created-api-key-dialog.tsx` | `settings.apiKeys` | 4 new |
| `apps/app/app/(app)/[slug]/settings/api-keys/page.tsx` | `settings.apiKeys` | 2 new |
| `apps/app/app/(app)/[slug]/settings/archive-retention.tsx` | `settings.archive`, `common` | 6 new + `common.save` |
| `apps/app/components/crm/company-picker.tsx` | `companies` | 5 new |
| `apps/app/components/data-table/saved-views-menu.tsx` | `common.savedViews` | 10 new + `common.cancel`, `common.save` |
| `apps/app/components/enrichment-queue.tsx` | `common.enrichmentQueue` | 11 new |

New catalog keys: `settings.apiKeys` 33, `settings.archive` 6, `companies.picker*` 5,
`common.enrichmentQueue` 11, `common.savedViews` 10. Total 65 keys per locale, `en` and `vi`.

## Notes

- English copy follows the fork vocabulary: company → organization, contact → client.
- Three ternaries became ICU: the enrichment trigger, the scheduled count, the expiry options list.
  Output is byte-identical to the upstream English.
- `CompanyPicker.placeholder` and `InlineCompanyField.label` lost their literal defaults.
  They are optional props now and fall back to the catalog. Callers that pass a value still win.
- `page.tsx` is an async server page with `generateMetadata`, the same shape as the `sso` page.

## Verification

- `bun run i18n:check` — 0 findings in the eight files. 3 findings remain in
  `packages/ui/src/components/data-table.tsx`, which another agent owns.
- `bunx tsc --noEmit` in `apps/app` — 0 errors in the eight files. 105 errors elsewhere,
  all in files that still hold merge conflict markers.
- `bunx biome check` on the eight files and all 20 catalogs — clean.
- `en` and `vi` key sets are identical in `common`, `companies` and `settings`.
- Rendered every new ICU message through `createTranslator` in both locales.

## Issues

1. RISK — Three other files still print English: `packages/ui/src/components/data-table.tsx`
   fails `i18n:check`. The gate stays red until its owner fixes it.
   Fix: not done. That file is outside my ownership.
2. RISK — 105 typecheck errors remain in other agents' files. A full `check-types` fails.
   Fix: not done. Those files are outside my ownership.

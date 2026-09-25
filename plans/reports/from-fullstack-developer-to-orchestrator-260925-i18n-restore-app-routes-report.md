# i18n restore — app routes (19 files)

Branch `fix/i18n-restore-after-upstream-merge` in the `dev-check` checkout. No commit.

## Per file

| File | Upstream change | Merge |
| --- | --- | --- |
| companies/companies-bulk-actions.tsx | delete → archive/restore/purge, `archived` prop | rewrote from upstream shape; every toast and menu item is a `t()` call; `reportBulk(common, …)` kept |
| companies/companies-table.tsx | archived column, archived filter button, `SavedViewsMenu`, activity facet | `ARCHIVED_COLUMN` const → `archivedColumn(t)`; facet label, button and empty state translated |
| contacts/contacts-bulk-actions.tsx | archive/restore/purge, `CompanyMenuSearch`, controlled menu | rewrote from upstream shape; `none` prop now `t("noCompanyOption")` |
| contacts/contacts-table.tsx | archived mode, searchable company facet, title/seniority/persona facets | kept upstream state and effects; all facet labels and empty texts translated |
| contacts/create-contact-sheet.tsx | `Select` → `CompanyPicker` | `none={{ value: NONE, label: t("noCompanyOption") }}` |
| deals/create-deal-sheet.tsx | `Select` → `CompanyPicker`, `SEARCH_PARAM`, `dealStageLabel` rename | kept fork's `dealStageLabelKey`; added `SEARCH_PARAM` import; `placeholder={t("chooseCompanyPlaceholder")}` |
| deals/deals-bulk-actions.tsx | archive/restore/purge replaces bulk delete | archived branch translated; the fork's single close-lost title kept |
| deals/deals-table.tsx | archived column, archived filter button | same pattern as companies table |
| overview-greeting.tsx | `SEARCH_PARAM.overview.scope` | upstream param keys + `useTranslations` |
| overview-scope.tsx | `LABELS` const | kept `scopeLabels(t)`; upstream param keys |
| settings/connections/google-connection.tsx | `CONNECT_ERRORS` map | dropped; the fork's `connectErrors` object of `t()` calls stays |
| settings/connections/microsoft-connection.tsx | `CONNECT_ERRORS` map, `AUTO_CREATE` const | dropped both; `t("connections.autoCreateOnReply")` already covers it |
| settings/connections/slack/slack-connect-button.tsx | `CONNECT_ERRORS` map | dropped; `connectErrorMessages(t)` stays |
| settings/page.tsx | `ArchiveRetention` import | both imports kept, alphabetical |
| settings/settings-sidebar.tsx | `API Keys` nav item | added `t("settings.apiKeys")` to `navItems(t, canImport)` |
| settings/sso/copy-value.tsx | upstream deleted it; `settings/copy-value.tsx` replaces it | removed the file (moved to the scratchpad, not deleted). All callers already import `../copy-value`, which is translated |
| (landing)/grant-access/grant-access.tsx | `ProviderGrant` type, `PROVIDERS` rename | kept `PROVIDER_META` with `labelKey`; adopted the `ProviderGrant` type |
| (landing)/grant-access/page.tsx | `DESCRIPTION` / `BOTH` consts | dropped; `t()` calls stay; removed the now-unused `MailboxProviderId` import |
| (landing)/sign-in/social-sign-in.tsx | `ProviderChoice` type, `PROVIDERS` rename | kept `PROVIDER_META` with `name`; adopted the type |

## New catalog keys (en + vi, identical sets)

- `common`: `activityFacetLabel`, `archive`, `archivedFilter`, `cannotBeUndone`, `deleteForever`, `restore`
- `nav`: `settings.apiKeys`
- `companies`: `archivedColumnLabel`, `archivedColumnFullLabel`, `archivedEmptyState`, `bulkArchivedToast`, `bulkRestoredToast`, `bulkPurgedToast`, `bulkPurgeConfirmTitle`
- `contacts`: the same seven, plus `companyFacetSearching`, `companyFacetEmpty`, `personaLabel`
- `deals`: the same seven

Total 40 keys, 20 per locale set × 2 locales.

## Verification

- Conflict markers in the 19 files: 0.
- `bun run i18n:check`: 0 findings, 344 files scanned.
- `bunx tsc --noEmit -p tsconfig.json`: 0 errors outside `components/**`.
- `bunx biome check` on the 19 files and `apps/app/messages`: 96 files checked, 0 errors.

## Issues

1. NOT DONE — `apps/app/lib/activity-recency.ts` holds English labels.
   The activity facet options render "Active within 7 days" in Vietnamese.
   Fix: change `label` to `labelKey` and translate at the three table call sites.
   The file is outside my file ownership.
2. RISK — I added `common.archive`, `common.restore`, `common.deleteForever` and
   `common.cannotBeUndone`. The other agent translates the same words in
   `components/crm/record-sheet/record-actions.tsx`. Duplicate keys appear if
   they pick other names.
   Fix: check `en/common.json` for duplicates after both agents finish.
3. NOT DONE — `companies.bulkDeletedToast`, `companies.bulkDeleteConfirmTitle`
   and `companies.bulkDeleteConfirmDescription` are now orphans. Upstream
   replaced bulk delete with archive. The keys cost nothing but add noise.
   Fix: delete them after the whole merge is clean. `contacts` and `deals` keep
   their `bulkDeleteConfirmDescription`, which the purge dialog reuses.
4. RISK — `apps/app/components/crm/fields/field-columns.tsx` still holds conflict
   markers. `useFieldColumns` therefore types as `any`, so `tsc` cannot check the
   column arrays in my three table files.
   Fix: re-run `tsc` after the other agent finishes.
5. NOT DONE — `settings/api-keys/created-api-key-dialog.tsx` passes
   `label="API key"` to `CopyValue`. That string reaches the user untranslated.
   The file is outside my file ownership.
6. UNKNOWN — I did not open the app. The archived views, the purge dialogs and
   the Vietnamese plural forms are not checked in a browser.
   Fix: walk the pseudo-locale and then `vi` once the build is clean.

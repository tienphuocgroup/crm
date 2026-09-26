# i18n restore — apps/app/components (17 files)

Branch `fix/i18n-restore-after-upstream-merge` in the `dev-check` checkout.
34 conflict hunks resolved. Rule applied: upstream's structure, translated copy.

## Per file

| File | Upstream change | Merge |
| --- | --- | --- |
| agent-builder/agent-builder-chat.tsx | Zod parse at the boundary (`builderSubmissions`, `streamEvents`, `builderMessage`); `recordOf`/`builderMessageOf` deleted; `manifestOf` takes `AgentManifestSummary`; manifest `description` dropped | Kept upstream parsers. Added `t` to `manifestOf` and to the call site. Fallbacks stay `t("messageUnavailable")`, `t("triggerOnDemand")`, `t("scopeApprovedFallback")`, `t("actionRequestedFallback")`. |
| agent-builder/agent-builder-sidebar.tsx | Group buckets became a `Map` | Map form kept, keyed by `ChatDateGroupKey`, not by English label. |
| agent-builder/agent-capabilities.tsx | `ACTION_LABELS` became a `Map`; types derive from `RouterOutputs` | `actionLabels(t)` now returns `Map<string, string>`. |
| agent-builder/agent-history.tsx | `runEvents` zod parse; `eventLabel(event)`; `changeDetail(event)` | Kept `t` and added `runEvents.parse`. `showingFirstOfSteps` counts `events.length`. |
| agent-builder/team-agent-detail.tsx | `fallbackDescription` hoisted; `reviewManifest` typed, optional chained | Upstream shape kept. `fallbackDescription` reads `t("agentDescriptionFallback")`; the hoisted English literal is gone. |
| app-icon-rail.tsx | `Icon` takes `item.iconClassName` | Added the class. Fallback rail keeps `t(RAIL_ITEM_KEY[item.id])` — `ITEMS` has no `title`. |
| crm/enrichment-actions.tsx | `result.queued` branch on research and contact enrich | Both branches are `t(...)`. New key for the "already running" branch. |
| crm/fields/field-columns.tsx | `render()` lost the `options` param and the `SELECT` branch | Call site now `render(type, value, byId, common)`. |
| crm/fields/field-editor.tsx | `showOnFilter` draft field, `filterable`, filter checkbox, `satisfies` forms | Key maps kept, converted to `satisfies`. Filter label is `common(filterPlacementKey(entity))`. |
| crm/fields/fields-list.tsx | Suggested-fields block (`FIELD_TEMPLATES`), `FILTER_NOTE` summary part | Upstream block kept; its three literals are now catalog keys. Type chip uses `common(\`fieldType.${template.type}\`)`, so `typeLabel` import dropped. |
| crm/record-sheet/company-sheet.tsx | `archivedAt` prop on `RecordActions` | Added; `companyConsequence(company, t)` kept. |
| crm/record-sheet/contact-sheet.tsx | `InlineCompanyField` replaces `InlineSelectField`; `companies` query removed; `archivedAt` | Upstream component kept, with `label={t("companyLabel")}` and `none.label={t("noCompanyOption")}`. |
| crm/record-sheet/deal-sheet.tsx | Same swap, plus `archivedAt` | Same, and the fork's nullable `deal.company` handling (`NO_COMPANY`) is preserved. |
| crm/record-sheet/record-actions.tsx | Archive / restore / purge replace a single delete; `RECORD_PROCEDURES`; `archivedAt` prop | Rewritten. Three hooks take `{ record, nounWithArticle, common }`. Menu labels come from the per-record namespaces. |
| crm/timeline/activity-composer.tsx | `satisfies` form | `PLACEHOLDER_KEY` kept, `satisfies` applied. |
| crm/timeline/timeline-entry.tsx | `stageChange` is a zod schema, `as never` casts gone | `deals("stageChangeHeadline", { from, to })` kept over `stageLabel()`. |
| crm/timeline/timeline.tsx | `satisfies` forms | `TAB_LABEL_KEY` / `EMPTY_STATE_KEY` kept, `satisfies` applied. |

## New catalog keys (en + vi)

`common.fields`: `add`, `filterNote`, `filterPlacementCompany`, `filterPlacementContact`,
`filterPlacementDeal`, `suggestedNote`, `suggestedRow`
`common.recordSheet`: `archivedToast`, `restoredToast`, `purgeConfirmAction`
`companies`: `archiveMenuLabel`, `restoreMenuLabel`, `purgeMenuLabel`, `researchAlreadyRunningToast`
`contacts`: `archiveMenuLabel`, `restoreMenuLabel`, `purgeMenuLabel`, `enrichAlreadyRunningToast`
`deals`: `archiveMenuLabel`, `restoreMenuLabel`, `purgeMenuLabel`

## Changed catalog values (upstream copy edit absorbed, en + vi)

`common.recordSheet.deleteConfirmTitle` — now "Delete {name} forever?"
`common.recordSheet.deletedToast` — now "{subject} was deleted forever."

The dialog now confirms a purge, not an archive. `docs/i18n.md` says an upstream
copy edit updates the catalog. `common.delete` is shared, so the button reads
the new `recordSheet.purgeConfirmAction` instead.

## Verification

- Conflict markers in the 17 files: 0.
- `bun run i18n:check`: 0 findings, 344 files scanned.
- `bunx tsc --noEmit -p apps/app/tsconfig.json`: 22 errors, all `PageProps` /
  `LayoutProps` in `app/**`. 0 errors in the 17 files.
- `bunx biome check <17 files> apps/app/messages`: 37 files, 0 errors.
- Catalog `en` / `vi` key parity: identical in all ten namespaces.

# i18n restore — helpers, fields copy, layout, API specs

Branch `fix/i18n-restore-after-upstream-merge`. 11 files. All conflict markers gone.

## Per file

| File | What upstream changed | How I merged |
| --- | --- | --- |
| `apps/app/lib/deal-stage.ts` | Only extracted a `DealStagePresentation` type alias. No behaviour change. | Kept the fork side whole. The fork already declares `StagePresentation`, so upstream's alias was a duplicate. Six healthcare stages and `labelKey` kept. |
| `apps/app/lib/activity-presentation.ts` | Extracted `ActivityPresentation` type alias. | Took the alias, filled it with the fork's `labelKey` values. `activityLabelKey` kept. |
| `apps/app/lib/enrichment-status.ts` | Extracted `EnrichmentPresentation` alias. Added `ENRICHMENT_IDLE_POLL_MS`. | Took both. Alias now carries `labelKey`. `ENRICHMENT_FACET_OPTIONS` stays key-based. |
| `apps/app/lib/agent-record.ts` | Added exported `AgentRecordHeader` and `AgentRecordFilter` aliases plus `RecordCopyByKind`. | Took all three aliases. Applied them to the fork's `PROTOCOL` / `COPY_KEYS` split. `recordCopyKeys` kept. |
| `apps/app/lib/agent-tool-display.ts` | Parse at the boundary: `eveToolText`, `EveToolInput`, `EveToolFields` from `@crm/validation/eve-tool`. Named `ToolInputLabel` / `ToolInputLabels`. | Took the zod parsing and the aliases. Return type is the fork's `ToolLabel` (`{key, values?}`). Dropped upstream's `label: string` field on `LabelInput` — the caller passes a transcript item whose `label` is a `StepLabel` object, so re-adding it breaks the typecheck. |
| `apps/app/lib/agent-transcript.ts` | 4 hunks: `EveToolInput`/`EveToolOutput` on the `did` item; `ToolVerbs` alias; `outcome()` zod parse replacing ad-hoc reason reads; ad-hoc deal-list parsers deleted for zod schemas. | Took all upstream typing and zod. `label` stays `StepLabel`; `describe()` returns keys and reads `outcome(part)?.reason`. Deleted the fork's dead `dealListItemOf` block — its helpers `recordOf`/`stringOf` no longer exist. |
| `apps/app/test/agent-transcript.spec.ts` | Hoisted the inline deal fixture into a `deal` const. | Took `deals: [deal]`. Restored `stage: "PROPOSAL_SENT"` on the const — the auto-merge had left upstream's `CONTRACT_SENT`. |
| `apps/app/components/crm/fields/fields-copy.ts` | `satisfies` instead of annotation. New `FILTER_PLACEMENT` + `filterPlacement`, and new copy `SUGGESTED_ROW`, `SUGGESTED_NOTE`, `ADD`, `FILTER_NOTE`. | Kept the key maps, switched them to `satisfies`. Added `FILTER_PLACEMENT_KEY` + `filterPlacementKey` — `field-editor.tsx` already imports that name. Did not re-add the English constants: the fork's components call `t()` directly. |
| `apps/app/app/(app)/[slug]/layout.tsx` | Extracted `loadWorkspace()` from `WorkspaceHeader`. | Two independent additions, not a real conflict. Kept both `LocaleReconciler` and `loadWorkspace`. |
| `apps/api/test/bulk.spec.ts` | `bulkDelete`→`bulkPurge`, `skipped: 0` in results, `rejects.toThrow` replaced by try/catch + `refused?.message`. | Took the try/catch structure with the fork's `stage: "LOST"`. Stages in the file are `LOST` and `INQUIRY`. |
| `apps/api/test/record-delete.spec.ts` | `delete`→`purge` on services and in describe titles. | Took `purging a company`, kept the fork's `it` title "leaves its deals and its people without a company" — the body asserts the deal survives with a null company, so upstream's "takes its deals" is wrong. Also fixed a stale `companies.delete` at line 441 and its describe title inside the fork-added block; the auto-merge had missed them. |

## Keys added

None. Every key the 11 files reference already exists in `en` and `vi` — 72 agent-panel/common/deals keys checked, plus the three `fields.filterPlacement*`. I made zero catalog edits, so no contention with the other agents.

## Verification

- Conflict markers in my 11 files: 0.
- `apps/app` typecheck: 0 errors in my files. 21 errors remain, all in `agent-builder-chat.tsx` and `team-agent-detail.tsx`, owned by another agent and still holding markers.
- `apps/api` typecheck: 0 errors, whole project.
- `bun test test/agent-transcript.spec.ts`: 45 pass, 0 fail, 170 assertions.
- `bun test test/deal-stage.spec.ts test/agent-tool-display.spec.ts test/agent-session.spec.ts`: 27 pass, 0 fail.
- `bun test test/bulk.spec.ts test/record-delete.spec.ts`: 2 pass, 15 fail — all from the database, see issue 1.
- Biome on all 11 files: clean, no fixes applied.
- en/vi parity: identical key sets in every namespace.

## Issues

1. BROKEN — The local test database has no `contact.archivedAt` column. Every API test that writes a contact or company fails with Prisma P2022. 15 of 17 cases in my two specs fail for this reason only.
   Fix: apply the pending migrations to the test database. `20260820150251_archive_crm_records` and `20260820161500_archive_scoped_uniqueness` are in the repo but not in the database. I did not run them — the database is shared and outside my file ownership.
2. RISK — The 15 failures hide any real assertion failure in `bulk.spec.ts` and `record-delete.spec.ts`. The two specs are typecheck-clean and lint-clean, but their behaviour is unproven until the database is migrated.
   Fix: re-run both specs after the migration.
3. NOT DONE — `apps/app` still fails to typecheck as a whole. `agent-builder-chat.tsx` and `team-agent-detail.tsx` hold conflict markers.
   Fix: owned by another agent, in progress.
4. UNKNOWN — Upstream's `dealListItem` zod schema makes `company` required, while the `DealListItem` type keeps `company: ... | null`. A deal with no company now fails to parse and the whole list returns null.
   Fix: not done. This is upstream's shape, not a merge artefact. Needs a product decision on whether a company-less deal must render.

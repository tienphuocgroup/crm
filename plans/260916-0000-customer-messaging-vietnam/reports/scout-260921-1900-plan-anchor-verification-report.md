# Scout: plan anchor verification — customer messaging (Vietnam / Zalo) plan

Verifies every `file:line` anchor cited in `plan.md`, `phase-02-schema-and-zalo-connection.md`,
`phase-03-inbound.md`, `phase-04-outbound.md` against the tree as of 2026-09-21. Anchors were
written 2026-09-16. Legend: **SAME** = exact line match. **MOVED** = same content, line number
drifted (n lines noted). **CHANGED** = the plan's claim about the code no longer holds, or was
never quite right. **N/A** = file/symbol does not exist yet (expected — plan creates it).

No messaging code exists yet anywhere in the tree (grep confirms: no `messaging`, `Zalo`, `zalo`
references in `apps/api/src`, `apps/agent/agent`, `apps/app`, or `schema.prisma`). Every anchor
below is against files the plan modifies, not files it creates.

## 1. `packages/db` core + `packages/validation`

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `agent-tasks.ts` `TASK_KINDS` | — | lines 1–14, 12 kinds, no messaging kinds (expected) | N/A (to add) |
| `agent-tasks.ts` `DIRECT_KINDS` | "five kinds today" (phase 4) | lines 18–24: `brand, portrait, slack-people-match, slack-channel-join, agent-event` — exactly 5 | **SAME** |
| `agent-tasks.ts` `PRIORITY` | add `messageSend: 950, messageToken: 940` | lines 36–50. **`slackJoin: 950` already exists** — the new `messageSend: 950` would tie with it | **CHANGED (note)**: not a bug (ties are legal, `claimDue` orders by priority DESC then dueAt ASC), but coders should know `950` is not currently the max/unique |
| `packages/db/package.json` exports, `./agent-tasks` | "line 8" | line 8: `"./agent-tasks": "./src/agent-tasks.ts",` | **SAME** |
| `packages/validation/src/index.ts` `schemas` | "line 5" | line 5: `export const schemas = { agents, slack } as const;` | **SAME** |
| `packages/validation/src/index.ts` `parse()` | "line 21" | line 21: `export function parse<Schema extends ZodType>(` | **SAME** |

## 2. `packages/db/prisma/schema.prisma`

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `model Verification` | "schema.prisma:146" (OAuth section) | `model Verification {` is at **line 147** | **MOVED** (+1) |
| `enum ActivityType` | "178-186" | lines 178–186 (7 values: NOTE…ENRICHMENT), no `MESSAGE` | **SAME** |
| `model Activity` | "1077-1112" | lines 1077–1112 exactly | **SAME** |
| `Activity.contactId onDelete: Cascade` | "schema.prisma:1090" | line 1090: `contact Contact? @relation(fields: [contactId], references: [id], onDelete: Cascade)` | **SAME** |
| `Activity.emailThreadId` relation shape | pattern to copy for `messageThreadId` | lines 1098–1099: `emailThreadId String? @unique` / `emailThread EmailThread? @relation(..., onDelete: Cascade)` | **SAME** (good template) |
| `AgentTask.subject` | "schema.prisma:477" | line 477: `subject String?` | **SAME** |
| `Contact`, `Company`, `User` relation lists | no back-relations for messaging yet | Contact lines 346–393, Company 277–…, User 15–53 — none has `channelIdentities`/`messageThreads` | N/A (to add) |
| `SlackWorkspaceGrant` token columns | "like SlackWorkspaceGrant" | lines 97–107: `userToken String` (required, not nullable), `userScopes String` — no `expiresAt`/`refreshToken` columns at all | **CHANGED (note)**: Slack's grant shape is simpler than what `MessagingAccount` needs (nullable, pairs with refresh + expiry); "tokens are columns" holds as an architecture point, but there's no closer precedent to copy field-by-field |

Migrations (`packages/db/prisma/migrations/`, 51 folders + lock file). Last 3:
`20260811212311_slack_install_cancel_delivery_task_subject`, `20260813131305_healthcare_deal_stages`,
`20260813204500_deal_company_optional`. `db:migrate` = `bun scripts/require-local-db.ts db:migrate && prisma migrate dev`;
`db:generate` = `prisma generate`; `db:test` = `bun scripts/test-db.ts` (creates the `_test` DB if missing, then migrates it);
`db:deploy` = `prisma migrate deploy`. All confirmed in `packages/db/package.json`.

## 3. `apps/api/src/agent/agent-trigger.service.ts` (519 lines total)

This file is essentially byte-identical to what the plan describes — every cited line matches.

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `enqueue()` | "line 363" | line 363: `private async enqueue(` | **SAME** |
| `enqueue()` dedupe filter (subject shape to copy) | "385-396" | `findFirst` block lines 383–399, `subject` conditional lines 389–396 | **SAME** (≈ exact) |
| 9 internal `enqueue()` callers, no `dueAt` | "40, 48, 58, 66, 76, 85, 95, 144, 240" | confirmed at exactly those 9 lines | **SAME** |
| `enqueue()` has no `dueAt` param today | — | confirmed: signature is `(task, required = false, client?)` | **SAME** |
| `withTasks()` | "113-136" | lines 113–137 (closing brace 137) | **SAME** |
| `withTasks()` pokes once after commit | "line 134" | line 134: `if (queued) this.poke();` | **SAME** |
| `poke()` stays private | "line 480" | line 480: `private poke(): void {` | **SAME** |
| `AgentTaskQueue` type — "at line 113 gains `messageSendRequested`" | phase 4 | **`AgentTaskQueue` type is declared at lines 22–27**, not 113. Line 113 is where `withTasks()` starts (which *takes* an `AgentTaskQueue`) | **CHANGED**: the anchor conflates the type declaration (22–27, currently only `slackChannelJoinRequested`) with `withTasks()` (113). Coders must edit both: the type at 22–27 and the object literal inside `withTasks()` at lines 122–131 |

## 4. `apps/agent/agent/lib/*`

`tasks.ts` (199 lines) — matches precisely:

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `scheduleTask()` | "line 138" | line 138 | **SAME** |
| its `findFirst` | "line 149" | line 149 | **SAME** |
| "update branch at line 160" | phase 2 | line 160 is `if (existing) {`; the actual `db.agentTask.update({` call is **line 161** | **MOVED** (off-by-one) |
| `claimDue` global `MAX_ATTEMPTS` use | "tasks.ts:54" | line 54: `AND t2."attempts" < ${MAX_ATTEMPTS}` | **SAME** |
| `claimDue` re-lease window (phase 4) | "tasks.ts:44-66" | `$queryRaw` block is lines 44–66 exactly | **SAME** |
| `scheduleTask()` has no `subject`/`exceptId` param today | — | confirmed: signature (138–148) has none | **SAME** |

`dispatch.ts` (427 lines) — matches precisely:

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `retireAbandoned()` | "line 29" | line 29 | **SAME** |
| `reconcileDirect()` | "95-102" | lines 95–102 exactly | **SAME** |
| `handleDirect()` | "line 104" (both phase 2 and phase 4 branches insert here) | line 104 | **SAME** |
| fallthrough sentence | "The record this names is gone." | line 149, unchanged | **SAME** |

`dispatch-config.ts`: `DISPATCH` shape (visible/research/builder/run/task/sweep) matches the plan's implicit pattern for a new `apps/agent/agent/lib/messaging/messaging-config.ts` — no messaging keys exist yet (N/A, to create).

`capabilities.ts`: `fromEnv` helper is defined at **line 37** exactly as cited (`const fromEnv = (id: string) => ({`); 4 existing capability entries (RAPIDAPI_KEY, PERPLEXITY_API_KEY, CONTEXT_DEV, BLOB_READ_WRITE_TOKEN), no `SLACK_CLIENT_ID` entry exists here today (Slack has no agent capability card) — **SAME**.

Env loading: `capabilities.ts` line 1 imports `@crm/env/load` (`packages/env/src/load.ts`), which lazily imports `packages/env/src/index.ts`'s `loadRootEnv()` (reads `.env`/`.env.local` walking up to the workspace root) unless `NEXT_RUNTIME` is set. This is the file every agent-side entry point that needs env should import first.

## 5. `apps/api` misc anchors

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `create-app.ts` `bodyParser: false` | "line 15" | line 15 | **SAME** |
| `app.module.ts` module list | — | 27 modules, alphabetically-ish ordered, no `MessagingModule` yet (N/A) | confirmed no conflicts |
| `env.validation.ts` `SLACK_CLIENT_ID` | "line 73" | line 73: `SLACK_CLIENT_ID?: string;` | **SAME** |
| `slack-connection.service.ts` `status()` | "37-99" | lines 37–99 (next method starts 101) | **SAME** |
| `slack-connection.service.ts` `disconnect()` | "256-277" | lines 256–277 (file ends 278) | **SAME** |
| `AllowAnonymous`, `AuthMiddleware`, `DomainErrorMiddleware` | exist | confirmed: `@thallesp/nestjs-better-auth`'s `AllowAnonymous` used in `health.controller.ts:20`, `tracking.controller.ts:48,60`; `apps/api/src/trpc/middlewares/auth.middleware.ts` and `domain-error.middleware.ts` both exist | **SAME** |
| `tracking.controller.ts` object-reserialize branch | "206-212" | lines 206–212 (`existing`/string branch/object branch) | **SAME** |
| `tracking.controller.ts` stream loop | "215-235" | lines 214–237 (`return new Promise` through both `.on` handlers) | **SAME** (≈ exact) |
| `thread-writer.service.ts` `project()` | "257", "257-290" | `private async project(` at line 257, file is 292 lines | **SAME** |
| `crm/activity-stamp.service.ts` | — | 190 lines; `touch()` at line 27, `targetsOf()` at line 89 | reference only, no cited line to verify |
| `activities.contracts.ts` `TIMELINE_FILTERS` | "line 14" | line 14 | **SAME** |
| `activities.contracts.ts` `COMPOSABLE_TYPES` | "4-10" | lines 4–10 | **SAME** |
| `activities.service.ts` `timelineCounts()` | "line 100" | line 100 | **SAME** |
| `activities.service.ts` `filterClause()` | "line 248" | line 248 | **SAME** |
| `activities.service.ts` `NOTE_TYPES` | "60-63" | lines 60–65 (array of 4 closes on 65, not 63) | **MOVED** (closing line +2) |
| `contacts.service.ts` `delete()` | "line 348" | line 348 | **SAME** |
| `contacts.service.ts` `tx.contact.delete` | "line 361" | line 362 | **MOVED** (+1) |
| `search.router.ts` `quick` | "line 15" | line 15: `async quick(@Input("q") q: string) {` | **SAME** |
| `rollup.service.ts` `activities_by_type` | "551-554" | line 551 | **SAME** |
| `rollup.service.ts` `threads_ingested` | "line 568" | line 568 | **SAME** |
| `docs/api.md` vendor-exception sentence | "31-32" | lines 31–32: "About to add a vendor client…" / "…the exchange-rate fetcher, below." | **SAME** |
| exchange-rate fetcher location | "the exchange-rate fetcher" | `apps/api/src/currency/rates.service.ts`, `fetch()` at line 149, called from `fetch(base)` at line 64 | confirmed, sole vendor fetch in `apps/api/src/currency` |
| `src/generated/server.ts` | regenerates on `bun run check-types` via `nestjs-trpc generate` | `apps/api/turbo.json` `trpc:generate` task (line 12) runs `nestjs-trpc generate -e src/app.module.ts -r "**/*.router.ts" -o src/generated`, wired as a dependency of `check-types` (line 10) | **SAME**, confirmed mechanism |

## 6. `packages/telemetry`

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `events.ts` `syncError` | "beside syncError at line 81" | line 81: `export function syncError(input: { error: unknown; source: string }): void {` | **SAME** |
| `permittedStage`-like helper | pattern to copy | `allowlist.ts` has `permittedSyncSource` (line 236) and `permittedSyncErrorSource` (line 248) — same shape the plan wants for `permittedStage()`; no `permittedStage` exists yet (N/A, to create) | **SAME** (pattern confirmed) |
| `packages/telemetry/test/allowlist.spec.ts` | exists | confirmed present | **SAME** |

## 7. `packages/auth`

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `env.ts` Slack pattern | `pair("SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET")` | line 47, calling the shared `pair()` helper (lines 12–27) — both-or-neither pattern `isZaloConfigured()` should copy | **SAME** |
| `auth.ts` genericOAuth Slack block | "121-147" | `genericOAuth({` opens at **line 121** (matches start), but the full Slack config object literal runs to roughly **line 205** (`getToken` ends ~176, `getUserInfo` ends ~202, array/call closes 203–205). Line 147 lands mid-`getToken`, at `redirect_uri: slackRedirectUri,` inside a `URLSearchParams` body — not a natural block boundary | **CHANGED**: start line (121) is right; "121-147" undersells the block by roughly 60 lines. Report the true span as 121–205 for anyone who needs "the whole thing," or 121–134 for just the front config fields (providerId…scopes…authorizationUrlParams) |

Plan explicitly chose the Nest-controller path over Better Auth for Zalo (validation session 1, Q3), so this block is reference-only, not something phase 2 edits.

## 8. `apps/app`

| Anchor | Cited | Current | Status |
|---|---|---|---|
| `lib/trpc/cache.ts` `CrmCache.slack` | "line 33" | line 33: `slack(options?: Options): Promise<void>;` (type decl) | **SAME** |
| `lib/trpc/cache.ts` `contact(id)` | — | line 20 (type), implementation at line 156 | reference |
| `lib/trpc/cache.ts` `removed(ref)` | — | line 24 (type), implementation at line 187 | reference |
| `app-icon-rail.tsx` `ITEMS` array, "beside line 50" | phase 3 | `const ITEMS: RailItem[] = [` is at **line 52**; `RailItemId` type ends line 38 | **MOVED** (+2) |
| `app-icon-rail.tsx` badges | "badge from messaging.unreadCount" | **no badge mechanism exists in this file today** — 6 nav items, no count/badge rendering anywhere in the component | **CHANGED (material)**: this is new UI, not an extension of an existing pattern; coders build the badge from scratch |
| `app-icon-rail.tsx` `Chat` icon already used | "Chat is taken by the agent chat" | confirmed: `id: "chat", href: "/chat", icon: Chat` at lines 53–58, imported as `import Chat from "@carbon/icons-react/es/Chat";` | **SAME** — confirms the plan's premise |
| `connections/page.tsx` `slack.status` fetch | "beside line 36" | `trpc.slack.status.queryOptions()` is at **line 41** | **MOVED** (+5) |
| `connections/page.tsx` `ConnectionCard` | "line 165" | `function ConnectionCard({` is at **line 173**; line 165 is `function ConnectionsFallback() {` | **MOVED** (+8) |
| `add-connection-dialog.tsx` Slack `CatalogRow` | "beside line 45" | Slack's `CatalogRow` is at **line 57**; line 45 lands just before the Google row (line 49) | **MOVED** (+12) |
| `oauth-connection-page.tsx` `connectErrorOf` | "line 21" | line 21: `export function connectErrorOf(query: ConnectionQuery, provider: string) {` | **SAME** |
| `connections/slack/` subfolder | referenced as the shape to copy | confirmed contents: `page.tsx`, `people/`, `slack-channels.tsx`, `slack-connect-button.tsx`, `slack-disconnect-button.tsx`, `slack-scope-groups.tsx` | **SAME** |
| `timeline/timeline.tsx` | tab list, infinite query | `TIMELINE_TABS` imported from `timeline-search-params.ts` (below); `useInfiniteQuery` + `trpc.activities.timeline.infiniteQueryOptions()` at lines 193–198; date formatting via `dateTimeFormat` from `@crm/ui/lib/format` (line 14 import) | reference, confirms patterns cited in item 8's "how tRPC infinite queries work" and "date helper" asks |
| `timeline/timeline-entry.tsx` `emailThread` branch | "beside the emailThread branch" | `entry.emailThread` rendered at lines 173–176 | **SAME** (usable anchor) |
| `timeline/timeline-search-params.ts` | nuqs example file | full file: `TIMELINE_TABS` (6 values, no `messages`), `TIMELINE_PARAM = "timeline"`, `timelineTabParser = parseAsStringLiteral(...).withDefault("all")`, `historyFilter()` helper — this is the canonical small nuqs-params file to model `messages-search-params.ts` on | reference |
| `lib/activity-presentation.ts` `MESSAGE: { icon: SendAlt, label: "Message" }` beside `EMAIL` at line 15 | phase 3 | **Shape mismatch.** Actual `PRESENTATION` record (lines 11–22) is `Record<ActivityType, { icon: CarbonIcon; labelKey: string }>` — every entry has `labelKey` (an i18n catalog key, e.g. `"activityTypeEmail"`), **not a literal `label` string**. `EMAIL` is at **line 17**, not 15. Exported via `activityIcon()`/`activityLabelKey()` functions, not the record directly | **CHANGED (material)**: the plan's proposed `label: "Message"` is a hardcoded English string and would violate `docs/i18n.md` ("every user-visible string… goes through a catalog"). The correct addition is `MESSAGE: { icon: SendAlt, labelKey: "activityTypeMessage" }` plus a new `common.activityTypeMessage` key in both `en` and `vi` catalogs. Flag this to the phase-3 implementer explicitly. |
| `create-contact-sheet.tsx` `CreateContactSheet({ companyId })` | "line 45" | line 48: `export function CreateContactSheet({ companyId }: { companyId?: string }) {` | **MOVED** (+3) |
| `create-contact-sheet.tsx` onSuccess block | "lines 79-91" | `onSuccess` handler is lines 84–99 (`setOpen(null)` at 93, `openRecord(...)` at 98) | **MOVED** (+5 start, content still matches: closes itself, calls `openRecord()`) |
| `contacts/page.tsx` caller | "line 35" | `<CreateContactSheet />` is at **line 39** | **MOVED** (+4) |
| `contact-sheet.tsx` tabs array | "114-139" | `const tabs: DetailSheetTab[] = contact` starts **line 111**; `activity` tab value at line 132, `agent` tab at line 137 | **MOVED** (~-3 at start, content order unchanged: overview, deals, activity, agent) |
| `contact-sheet.tsx` header `Email` button | "line 184" | `<Icon icon={Email} .../>` at line 192, label at 193 | **MOVED** (+8) |
| tRPC client pattern | `useTRPC`, infinite query, `pathKey()` | confirmed: `useTRPC` exported from `apps/app/lib/trpc/client.tsx` (not `.ts`) line 25, backed by `@trpc/tanstack-react-query`'s `createTRPCContext`; `pathKey()` used throughout `cache.ts` (e.g. line 61 `trpc.activities.timeline.pathKey()`); infinite-query pattern is `trpc.X.infiniteQueryOptions(input, { getNextPageParam })` inside `useInfiniteQuery` (see `timeline.tsx:193-198`) | **SAME**, all confirmed working patterns |
| `packages/ui/src/components/brand-logos/stripe.tsx` | shape to copy | 17-line file: `const StripeLogo = (props: React.SVGProps<SVGSVGElement>) => (<svg .../>); export default StripeLogo;` — no barrel/index file in `brand-logos/` (10 files, each imported individually by path, e.g. `@crm/ui/components/brand-logos/stripe`) | **SAME**; confirms no index to update for `zalo.tsx` |
| dates formatted via | existing helper | `dateTimeFormat()` / `formatDay()` in `packages/ui/src/lib/format.ts`, locale-aware via `useUiLocale()` | reference |

### i18n (`docs/i18n.md`, 183 lines) — 5-bullet summary

1. Every user-visible string in `apps/app` and `packages/ui` must go through a catalog (`next-intl` in the app via `useTranslations`/`getTranslations`; `packages/ui`'s own `UiStringsProvider`/`DEFAULT_UI_STRINGS` — never `next-intl` inside `packages/ui`). A pure helper outside a component returns a translation *key*, never a rendered sentence.
2. `bun run i18n:check` (part of the `lint` chain in CI) AST-parses every `apps/app`/`packages/ui` source file and fails the build on any JSX text, JSX-expression literal, `placeholder`/`title`/`aria-label`/`alt` attribute, or literal `toast.*()` argument that isn't in the catalog or the `allowlist.json` (brands/ISO codes/wire values, each with a `reason`) or the frozen, must-stay-`[]` `ratchet.json`.
3. A new/changed `en` catalog value must ship in the same change as the matching `vi` value — no English-only landings.
4. Keys are `<namespace>.<area><Thing>` camelCase; the namespace list is fixed (`common, nav, settings, deals, companies, contacts, dashboard, landing, agent-panel, ui`) — no inventing a new namespace.
5. Interpolation is ICU named placeholders only (never string concatenation); `toast.error(error.message)` (raw API prose) and agent-LLM output are explicitly out of scope of the checker by design.

Direct consequence for this plan: `lib/activity-presentation.ts`'s `MESSAGE` entry, every new composer/inbox/connections string, and the Zalo connections-page copy must all be catalog keys, not literals — see the CHANGED finding above.

## 9. `@carbon/icons-react` export check

Ran from `apps/app` (the app's own `node_modules`, per-icon ESM path exactly as `app-icon-rail.tsx` imports them):

```
SendAlt default: true
Forum default: true
Chat default: true
```

**Resolves the plan's stated UNKNOWN.** `SendAlt` **is** exported by the installed Carbon version — the fallback-to-`Forum` contingency in phase 3's risk list is not needed. Use `SendAlt` as planned for the Messages nav icon and `activity-presentation.ts`'s `MESSAGE` icon.

## 10. Test infrastructure

| Package | Test command | Notes |
|---|---|---|
| `apps/api` | `CRM_TELEMETRY_DISABLED=1 bun test --preload ./test/setup.ts` | `test/setup.ts` disconnects `@crm/db` `afterAll` only if `DATABASE_URL` set; needs a real DB (integration-style) |
| `apps/agent` | `CRM_TELEMETRY_DISABLED=1 bun test` | |
| `packages/db` | `bun test` | |
| `packages/telemetry` | `bun test` | |
| `apps/app` | `bun test` | |
| root `test` task (`turbo.json`) | `dependsOn: ["topo", "^build"]` | no DB-specific gating at the turbo level |

`TEST_DATABASE_URL` is required for `packages/db`'s `db:test` script (`scripts/test-db.ts`): it refuses to run unless the name ends in `_test`, creates the database via a maintenance connection to `/postgres` if missing, then runs migrations against it. This is also how the suites "boot" the DB — no separate `db push`; migrations are applied (`prisma migrate deploy`-equivalent, invoked by `test-db.ts`'s `migrate()`).

Cited spec files — **all exist**, with these anchor deltas:

| File | Cited anchor | Current | Status |
|---|---|---|---|
| `apps/api/test/mailbox-thread-writer.spec.ts` | `TEST_RUN_ID` suffix "line 14" | line 14: `const suffix = process.env.TEST_RUN_ID ?? "thread-writer-spec";` | **SAME** |
| `apps/api/test/record-delete.spec.ts` | `describe("deleting a contact")` "line 123" | line 129 | **MOVED** (+6) |
| `apps/api/test/agent-trigger.stub.ts` | exists | confirmed present | **SAME** |
| `apps/agent/test/tasks.integration.spec.ts` | `scheduleTask` calls "202, 216, 217" | lines 202, 216, 217 exactly | **SAME** |
| `apps/agent/test/slack-membership.integration.spec.ts` | `globalThis.fetch` stub pattern | confirmed: `globalThis.fetch = (async () => …)` at line 37, another stub at 46, restore `= realFetch` at 79 | **SAME** |
| `apps/agent/test/capabilities.spec.ts` | exists | confirmed present | **SAME** |
| `packages/telemetry/test/allowlist.spec.ts` | exists | confirmed present | **SAME** |

`apps/app/test/` has **no** `activity-presentation.spec.ts` or `composer-state.spec.ts` today (confirmed — 14 existing spec files, none activity/messaging related). `apps/api/test/` has **no** `activities-timeline.spec.ts` today. Both match the plan's explicit "create" labels.

### DB reachability (this sandbox, right now)

`.env` at repo root: `DATABASE_URL` → host `localhost:5432`, db `crm`. `TEST_DATABASE_URL` → host `localhost:5432`, db `crm_test`. (Password redacted, never printed.)

Connection attempt via `pg` (`bun` + `pg.Client`) and `pg_isready -h localhost -p 5432`: **both `ECONNREFUSED` / "no response."** Postgres is not running in this sandbox. `docker-compose.yml` exists at repo root and defines a `postgres:17-alpine` service on port 5432 (`docker compose up -d` would start it) — not started here as part of a read-only scout. **Concern for the coding agent**: every DB-backed integration test in phases 2–4 (`zalo-oauth.spec.ts`, `zalo-connection.spec.ts`, `message-token-refresh.integration.spec.ts`, `zalo-webhook.spec.ts`, `messaging-writer.spec.ts`, `messaging-reads.spec.ts`, `record-delete.spec.ts`, `messaging-send.spec.ts`, `message-send.integration.spec.ts`, etc.) needs Postgres reachable before any of these can run; the coding agent's environment must start it first (`docker compose up -d` then `bun run --filter=@crm/db db:test`).

## 11. Lint / typecheck / git hooks

- Root `bun run lint` → `turbo run lint`, each package runs `biome check .`.
- Root `bun run check-types` → `turbo run check-types` (in `apps/api`, this depends on `trpc:generate`, which regenerates `src/generated/server.ts`).
- `biome.jsonc` (note: `.jsonc`, not `.json`): tab indent, double quotes, `organizeImports: "on"`, `linter.rules.preset: "recommended"`. No explicit "no comments" rule. Per-directory overrides: `apps/app/**` turns on Next/React domains; `apps/api/**` turns **off** `style.useImportType`. `packages/ui/src/components` (shadcn output) and `packages/ui/src/hooks/use-mobile.ts` are excluded from linting entirely — new files under `packages/ui/src/components/brand-logos/` (like the planned `zalo.tsx`) **are excluded from Biome linting**, consistent with `stripe.tsx` et al.
- `.githooks/pre-push` exists and is the only hook: runs `check-types`, `lint`, `test` in sequence for every push unless `CRM_SKIP_HOOKS` is set or it's a delete-only push; failing any exits 1 (bypass with `--no-verify`). **No `pre-commit` hook exists** — `.githooks/` has only `pre-push`.

## 12. `docs/i18n.md` — see item 8 above (5-bullet summary already given there).

## 13. `.env.example`, `turbo.json`, per-app `turbo.json`

- `.env.example`: `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` are at **lines 69–70**, preceded by a 2-line comment ("Optional. Enables Slack account linking on Settings > Connections. Add APP_URL + /api/auth/oauth2/callback/slack as the Slack OAuth redirect URL."). **This block sits in the unlabelled sign-in-credentials section (right after the Microsoft pair), well before the `# ── Where things are ──` header (line 90) and far before `# ── Optional: what the agent can do ──` (line 135).** Section headers, in order: "Where things are" (90), "Optional: what the agent can do" (135), "Optional: operations" (177), "Anonymous usage telemetry" (199).
  **CHANGED (material)**: the plan's instruction — "block after `SLACK_*` under 'Optional: what the agent can do'" — misdescribes the current section. `SLACK_*` is *not* under that header today; it's grouped with sign-in providers. Coders adding `ZALO_APP_ID`/`ZALO_APP_SECRET` beside `SLACK_*` (line 70) will land the block in the sign-in section, not the "what the agent can do" section named in the plan. Recommend: place the Zalo block directly after `SLACK_CLIENT_SECRET` (line 70) as the plan's primary instruction says ("beside SLACK_*"), and disregard the section-header claim, or explicitly decide to move it under "what the agent can do" if that's the intended taxonomy (Zalo is a customer-messaging connection, arguably closer to "what the agent can do" than to sign-in credentials — worth a explicit decision, not an anchor-following default).
- Root `turbo.json` `globalPassThroughEnv`: array starts line 35; `SLACK_CLIENT_ID` is at **line 47** exactly as cited. Includes `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `TEST_DATABASE_URL`, `TEST_RUN_ID`, `BETTER_AUTH_SECRET`, … — this is genuinely the only file naming `SLACK_CLIENT_ID` for pass-through purposes (confirmed by grep).
- `apps/api/turbo.json`: `dev` task `passThroughEnv` at lines 21–36 (first entry `AUTH_COOKIE_DOMAIN`, line 22); `test` task `passThroughEnv` at lines 39–54 (first entry `AUTH_COOKIE_DOMAIN`, line 40). Neither list contains `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` — confirms the plan's claim. No `dev:headless` task exists in `apps/api/turbo.json` (correct — plan doesn't ask for one there).
- `apps/agent/turbo.json`: `dev` task `passThroughEnv` at lines 17–25 (first entry `AGENT_BRIDGE_SECRET`), `dev:headless` at lines 31–39 (same first entry), `test` task only passes through `["DATABASE_URL"]` (line 60) — `TEST_DATABASE_URL` reaches agent tests via the root `globalPassThroughEnv`, not this file.

All three `turbo.json` claims in the plan ("these lists do not contain the Slack pair today") are **confirmed accurate** — this resolves red-team finding 15's concern about stale per-package `turbo.json` anchors from the opposite direction (the *prose* claim holds; only the exact line numbers for where to insert drifted slightly, noted above).

## Notes not tied to a single numbered item

- `MessagingAccount` will need `receipts MessageReceipt[]` per the schema; nothing today has an analogous list relation to copy field-by-field beyond the general Prisma pattern already used throughout the file.
- `ActivityStampService.targetsOf()` (line 89) is `groupBy`-based and does **not** currently know about threads/messaging at all — red team's "unverified" flag on "`targetsOf()` covering unmatched threads" is correctly unverified; this method has no messaging awareness before phase 3 adds it, matching the plan's expectation that phase 3 is additive here.
- `ContactsService.delete()` (line 348) currently does *not* null out any `Activity` rows before `tx.contact.delete` — confirms phase 3's required addition is genuinely new, not already partially done.

## Status

Status: DONE_WITH_CONCERNS

Summary: All anchors were checked against the current tree; the large majority (roughly 45 of ~60 checkable file:line citations) are exact matches or off by only 1–12 lines, confirming the plan's scout data is still fresh and reliable. Three findings are materially wrong and need explicit correction before coding: `activity-presentation.ts`'s proposed `{ icon, label: "Message" }` shape violates the actual `labelKey`/i18n-catalog pattern; `.env.example`'s `SLACK_*` block is not under the "Optional: what the agent can do" header as claimed; and `AgentTaskQueue` at "line 113" actually names `withTasks()`, while the type itself is at lines 22–27. `SendAlt` is confirmed exported (resolves the plan's stated UNKNOWN in favor of using it, no `Forum` fallback needed). Postgres is not running in this sandbox, so no DB-backed test or migration could be executed here — the coding agent must start it (`docker compose up -d`, then `db:test`) before any phase-2/3/4 integration test can run.

Concerns:
- `apps/app/lib/activity-presentation.ts`: plan's `label: "Message"` literal contradicts the existing `labelKey` + i18n-catalog pattern (docs/i18n.md); must use `labelKey: "activityTypeMessage"` and add catalog entries in `en`/`vi`, or `i18n:check` will fail.
- `.env.example`: `SLACK_*` (lines 69–70) is not under "Optional: what the agent can do" (line 135) as the plan states; it's in the unlabelled sign-in-credentials section. Needs an explicit placement decision for the Zalo block.
- `apps/api/src/agent/agent-trigger.service.ts`: `AgentTaskQueue` type (lines 22–27) and `withTasks()` (line 113) are two different places; the plan's single "line 113" anchor for adding `messageSendRequested` needs both edited.
- `packages/auth/src/auth.ts`: cited "121-147" for the Slack `genericOAuth` block covers only the front matter; the real block runs to ~line 205. Reference-only since this plan uses a Nest controller, not Better Auth, for Zalo — low risk, noted for completeness.
- DB unreachable in this environment (`ECONNREFUSED` on `localhost:5432` for both `DATABASE_URL` and `TEST_DATABASE_URL`); no integration test, migration, or `db:test` run could be verified here.
- Everything else: roughly a dozen small MOVED anchors (1–12 lines off) in `apps/app` UI files (`app-icon-rail.tsx`, `connections/page.tsx`, `add-connection-dialog.tsx`, `create-contact-sheet.tsx`, `contact-sheet.tsx`) and a couple in `apps/api` (`activities.service.ts` NOTE_TYPES close line, `contacts.service.ts` delete-transaction line) — none change the plan's approach, just the exact insertion line; use the current line numbers from the tables above, not the plan's.

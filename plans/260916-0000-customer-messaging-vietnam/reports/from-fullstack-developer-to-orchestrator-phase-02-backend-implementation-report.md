# Phase 2 backend — Zalo Official Account connection

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made.

Rules read: `AGENTS.md`, `docs/messaging.md`, `docs/api.md`, `docs/agent.md`,
`docs/environment.md`, `docs/connections.md`, `docs/design.md`, the plan and
phase 2, the scout report. Skills read: `nestjs-trpc`, `prisma-database-setup`.

## Files created

| File | Holds |
| --- | --- |
| `packages/db/src/messaging.ts` | `MESSAGING_POLICY`, `eligibility()`, `BLOCKED_REASONS` |
| `packages/db/test/messaging.spec.ts` | 16 tests: window, quota, precedence |
| `packages/db/prisma/migrations/20260921191500_messaging/migration.sql` | 4 enums, 5 tables, `ActivityType.MESSAGE`, `activity.messageThreadId` |
| `packages/validation/src/messaging.ts` | task payloads and the Zalo wire schemas |
| `apps/api/src/messaging/messaging-config.ts` | `MESSAGING_API`, `isZaloConfigured()`, URLs |
| `apps/api/src/messaging/messaging.module.ts` | module and the half-configured warn line |
| `apps/api/src/messaging/zalo/zalo.router.ts` | `zalo.status`, `zalo.disconnect` |
| `apps/api/src/messaging/zalo/zalo-connection.service.ts` | status and disconnect |
| `apps/api/src/messaging/zalo/zalo-oauth.controller.ts` | `/connect`, `/callback` |
| `apps/api/src/messaging/zalo/zalo-oauth.service.ts` | PKCE, exchange, profile, adopt |
| `apps/api/src/messaging/zalo/zalo-oauth.schema.ts` | PKCE value and query schemas |
| `apps/agent/agent/lib/messaging/messaging-config.ts` | `MESSAGING` and the endpoints |
| `apps/agent/agent/lib/messaging/zalo-errors.ts` | one table, `sentenceFor()` |
| `apps/agent/agent/lib/messaging/zalo-client.ts` | `refreshAccessToken`, `readOaProfile` |
| `apps/agent/agent/lib/messaging/zalo-connection.ts` | the agent's only token reader |
| `apps/agent/agent/lib/messaging/message-token-refresh.ts` | `runMessageTokenRefresh()` |
| `apps/api/test/zalo-oauth.spec.ts` | 14 tests, needs a database |
| `apps/api/test/zalo-connection.spec.ts` | 11 tests, needs a database |
| `apps/agent/test/message-token-refresh.integration.spec.ts` | 11 tests, needs a database |
| `apps/agent/test/zalo-client.spec.ts` | 20 tests, pure |

## Files modified

`packages/db/prisma/schema.prisma` (models, enums, back-relations on `User`,
`Contact`, `Company`, `Activity`), `packages/db/package.json` (`./messaging`),
`packages/db/src/agent-tasks.ts` (2 kinds, 2 direct kinds, 2 priorities),
`packages/validation/src/index.ts` (`schemas.messaging`),
`apps/api/src/app.module.ts`, `apps/api/src/agent/agent-trigger.service.ts`
(`messageTokenRefreshDue()`, optional `dueAt`), `apps/api/src/config/env.validation.ts`
(3 vars), `apps/agent/agent/lib/tasks.ts` (`subject`, `exceptId`),
`apps/agent/agent/lib/dispatch.ts` (one branch),
`apps/agent/agent/lib/capabilities.ts` (one card), `turbo.json`,
`apps/api/turbo.json`, `apps/agent/turbo.json`, `.env.example`,
`apps/agent/test/tasks.integration.spec.ts`, `apps/agent/test/capabilities.spec.ts`,
`apps/api/src/generated/server.ts` (regenerated, 19 routers, 140 procedures).

Out of my scope, forced by the schema: `apps/app/lib/activity-presentation.ts`,
`apps/app/messages/{en,vi,pseudo}/common.json`. See issue 1.

## Decisions beyond the brief

1. **The Zalo wire schemas live in `packages/validation/src/messaging.ts`.** The
   API and the agent both parse the token response and the OA profile. One owner
   of the shape, two consumers. `zalo-oauth.schema.ts` keeps the API-only PKCE
   and query schemas and re-exports the shared ones.
2. **`sentenceFor()` maps `-216` and `-220` to "The Zalo token needs a
   reconnect."** The other four terminal codes get "Zalo refused the request."
   `docs/messaging.md` annotates only those two as token codes. The composer
   still shows the reconnect sentence, because `eligibility()` returns a fixed
   sentence for any non-null `tokenError`.
3. **`classify()` makes a non-5xx HTTP failure transient.** A body that parses as
   an error envelope becomes `reason: "code"`. Anything else unreadable is a Zod
   failure, which the decision table calls transient. The table has one rule.
4. **`runMessageTokenRefresh()` throws on a database failure.** It returns a
   sentence for every expected failure, including an unreadable payload. A
   swallowed database error would complete the task and end the refresh chain
   for that OA. A message task carries no `contactId`, so a throw cannot settle
   `enrichmentStatus` (red team finding 5).
5. **The callback redirect is absolute.** The API and the app sit on different
   origins, so `redirect()` prefixes `APP_URL`. `redirect_uri` uses `API_URL`.
6. **Disconnect completes every open `message-send` row, not only this OA's.**
   The phase 4 send payload is `{ messageId }` and carries no `accountId`. One
   OA serves the whole workspace, so every open send belongs to it.
7. **The blocked "window closed" sentence prints an ISO timestamp.**
   `eligibility()` is pure and has no locale.
8. **Migration folder `20260921191500_messaging`**, the format of the existing 51
   folders. `prisma migrate diff --from-schema/--to-schema` replaced the removed
   `--from-schema-datamodel` flag.

## Commands

| Command | Result |
| --- | --- |
| `bunx prisma migrate diff --from-schema … --script` | pass |
| `bun run --filter=@crm/db db:generate` | pass |
| `bun run check-types` | pass, 13 of 13 tasks |
| `bun run lint` | pass, 9 of 9 tasks |
| `bun run i18n:check` | pass, 0 findings |
| `packages/db` `bun test test/messaging.spec.ts` | pass, 16 of 16 |
| `packages/validation` `bun test` | pass, 5 of 5 |
| `apps/agent` `bun test test/zalo-client.spec.ts test/capabilities.spec.ts` | pass, 37 of 37 |
| `grep -rn "ZALO" apps/api/src apps/agent/agent packages` | 2 config files read the pair |
| `bun -e` import of both `messaging-config` modules | pass, `configured: false` |

## Specs not executed

Postgres is down. Each one fails on its first fixture write with
`PrismaClientKnownRequestError … code: "ECONNREFUSED"`. All three compile and
lint.

- `apps/api/test/zalo-oauth.spec.ts`
- `apps/api/test/zalo-connection.spec.ts`
- `apps/agent/test/message-token-refresh.integration.spec.ts`
- `apps/agent/test/tasks.integration.spec.ts` (the two new cases)

The migration is also unapplied. Run `docker compose up -d`, then
`bun run --filter=@crm/db db:migrate` and `db:test`, then these four files.

## Issues

1. RISK — Postgres is down. Four specs and the migration never ran.
   Fix: start Postgres, apply the migration, run the four spec files.
2. RISK — I edited `apps/app/lib/activity-presentation.ts` and three catalogs.
   `ActivityType.MESSAGE` breaks `app#check-types` without them.
   Fix: the UI agent keeps the `MESSAGE` entry and the `activityTypeMessage`
   keys. I caused this.
3. RISK — The PKCE `code_challenge` encoding is community-verified, not official.
   A wrong encoding refuses every connect at the authorize step.
   Fix: not done. Test the first sandbox connect before phase 3.
4. RISK — A terminal refresh failure books no new task. The OA needs a manual
   reconnect.
   Fix: this is the plan's rule. The card shows the reason.
5. RISK — A refresh task on an install with no `ZALO_APP_ID` completes and books
   nothing. A later configuration leaves that OA without a refresh chain.
   Fix: not done. Reconnect the OA rebooks it. I caused this.
6. NOT DONE — No telemetry. Step 5 asks for `messagingError({ stage: "token" })`.
   `packages/telemetry` is outside my file list.
   Fix: add `permittedStage()` and the event in phase 3 or 4.
7. NOT DONE — `ZALO_OA_SECRET_KEY` has three homes and no reader. The webhook in
   phase 3 reads it.
8. NOT DONE — The whole UI half: the Zalo page, the two buttons, the brand mark,
   `cache.ts`, the connections card row, the catalog dialog row.
9. UNKNOWN — Zalo returns `is_verified` as a boolean, a number or a string. The
   schema accepts all three and never fails on it.

Status: DONE_WITH_CONCERNS
Summary: The schema, the migration, the shared policy, the task kinds, the OAuth
controller, the tRPC router and the agent refresh handler all ship. Types, lint
and every pure spec pass; the four database specs could not run.
Concerns: Postgres is down, so no migration and no integration spec was
verified. I touched four `apps/app` files to keep `check-types` green.

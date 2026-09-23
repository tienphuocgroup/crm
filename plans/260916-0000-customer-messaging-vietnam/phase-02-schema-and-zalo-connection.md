---
phase: 2
title: "Schema and Zalo connection"
status: done
effort: "Medium. Migration, shared policy module, task kinds, OAuth connect and callback, token refresh handler, connection card and page, env, tests."
priority: P1
dependencies: [1]
---

# Phase 2: Schema and Zalo connection

## Overview

This phase builds the storage and the connection. After it, an owner or admin connects the company's OA under Settings → Connections. The card shows the OA name, the verified badge and token health. The agent refreshes the token on the direct lane before it expires. No message flows yet. Phase 3 adds inbound. Phase 4 adds outbound.

Read before coding: `docs/api.md`, `docs/agent.md` (Two lanes, Dispatch on demand), `docs/connections.md`, `docs/environment.md`, `docs/design.md`, `.agents/skills/eve`, `.agents/skills/nestjs-trpc`, `.agents/skills/prisma-database-setup`, `.agents/skills/shadcn`. Scout report sections 1, 2, 3, 4, 5, 6. Brainstorm sections 5.1, 5.2, 5.3 (OAuth), 5.4 (refresh), 5.5 (Connections).

## Verify before coding

Phase 1 answers these in `docs/messaging.md`. Read them first. Do not start step 1 without them.

- Fact A: reply window length. It becomes `MESSAGING_POLICY.zalo.replyWindowMs`.
- Fact D: OAuth v4 field names, PKCE parameters, token lifetimes. They shape `zalo-oauth.service.ts` and `zalo-client.ts`.
- Fact E: OA profile endpoint path and response shape.
- Fact B decides whether `ZALO_OA_SECRET_KEY` exists as a third variable. Add it in this phase only if the webhook secret differs from the app secret.
- Product decisions from phase 1 row 7.

## Requirements

- Functional: an owner or admin connects one OA. The callback accepts only the session that started the connect. The status query returns liveness fields and never a token. Disconnect clears tokens, stops refresh (including one in flight) and keeps history. The refresh task rebooks itself as one open row per account. A terminal refresh failure writes a fixed `tokenError` sentence and stops rebooking. A transient failure rebooks with backoff and writes nothing. A set `tokenError` makes the next refresh due.
- Non-functional: tokens never reach the browser. A missing `ZALO_APP_ID` removes the card and every Zalo code path with no error. The migration is additive.

## Architecture

```
Owner clicks Connect ──► GET /api/messaging/zalo/connect?returnTo=/<slug>/settings/connections/zalo
                          (Nest, session, canManageConnections)
                          Verification { id: state, value: { verifier, userId, returnTo } }
                          redirect to Zalo authorise URL
Zalo ──► GET /api/messaging/zalo/callback?code&state
          role check → Verification read and deleted → userId must equal session user
          → code exchange → OA profile
          → upsert MessagingAccount(ZALO, oa_id) → complete every other OA's open refresh task
          → book message-token-refresh task
          → redirect <returnTo>?provider=zalo&connected=1

apps/agent dispatch, visible lane, handleDirect()
  message-token-refresh: due or tokenError set? → refresh → write both tokens only when still connected
                                                  → clear tokenError → rebook with scheduleTask(subject)
                         not due? → rebook at tokenExpiresAt - refreshAheadMs
                         terminal failure (invalid_grant class) → tokenError code, no rebook
                         transient failure (timeout, 5xx, network) → no tokenError, rebook with backoff
```

Slack's OAuth is not a Nest controller. It is Better Auth `genericOAuth` in `packages/auth/src/auth.ts:121-147` behind `slackConnectGuard`. `docs/api.md:31-32` names one vendor client exception in the API: the exchange-rate fetcher. The Zalo OAuth exchange and the OA profile read become the second documented exception. Phase 4 writes that sentence into `docs/api.md`. Nothing else in the API calls Zalo. Token refresh runs in the agent. [Red team 2026-09-16, finding 3]

## Data model (Prisma, `packages/db/prisma/schema.prisma`)

One migration: `packages/db/prisma/migrations/<timestamp>_messaging/migration.sql`. Exactly brainstorm section 5.2.

```prisma
enum MessagingChannel { ZALO }
enum MessageDirection { INBOUND OUTBOUND }
enum MessageStatus { QUEUED SENDING SENT DELIVERED READ FAILED }
enum MessageKind { TEXT IMAGE FILE STICKER OTHER }

model MessagingAccount {
  id               String           @id @default(cuid())
  channel          MessagingChannel
  externalId       String
  label            String
  avatarUrl        String?
  verified         Boolean          @default(false)
  accessToken      String?
  refreshToken     String?
  tokenExpiresAt   DateTime?
  tokenRefreshedAt DateTime?
  tokenError       String?
  connectedById    String
  connectedBy      User             @relation("MessagingAccountConnector", fields: [connectedById], references: [id])
  connectedAt      DateTime         @default(now())
  disconnectedAt   DateTime?
  lastInboundAt    DateTime?
  lastOutboundAt   DateTime?
  lastWebhookAt    DateTime?
  identities       ContactChannelIdentity[]
  threads          MessageThread[]
  receipts         MessageReceipt[]
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@unique([channel, externalId])
  @@map("messagingAccount")
}

model ContactChannelIdentity {
  id            String           @id @default(cuid())
  channel       MessagingChannel
  accountId     String
  account       MessagingAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  externalId    String
  displayName   String?
  avatarUrl     String?
  contactId     String?
  contact       Contact?         @relation(fields: [contactId], references: [id], onDelete: SetNull)
  followedAt    DateTime?
  unfollowedAt  DateTime?
  lastInboundAt DateTime?
  thread        MessageThread?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@unique([channel, accountId, externalId])
  @@index([contactId])
  @@map("contactChannelIdentity")
}

model MessageThread {
  id             String                 @id @default(cuid())
  accountId      String
  account        MessagingAccount       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  identityId     String                 @unique
  identity       ContactChannelIdentity @relation(fields: [identityId], references: [id], onDelete: Cascade)
  contactId      String?
  contact        Contact?               @relation(fields: [contactId], references: [id], onDelete: SetNull)
  companyId      String?
  company        Company?               @relation(fields: [companyId], references: [id], onDelete: SetNull)
  firstMessageAt DateTime
  lastMessageAt  DateTime
  lastInboundAt  DateTime?
  lastOutboundAt DateTime?
  messageCount   Int                    @default(0)
  unreadCount    Int                    @default(0)
  messages       Message[]
  activity       Activity?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@index([contactId, lastMessageAt])
  @@index([lastMessageAt])
  @@map("messageThread")
}

model Message {
  id           String           @id @default(cuid())
  threadId     String
  thread       MessageThread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  direction    MessageDirection
  status       MessageStatus
  kind         MessageKind      @default(TEXT)
  body         String?
  attachments  Json?
  externalId   String?
  clientRequestId String?
  sentById     String?
  sentBy       User?            @relation("MessageSender", fields: [sentById], references: [id], onDelete: SetNull)
  errorCode    String?
  errorMessage String?
  queuedAt     DateTime         @default(now())
  sentAt       DateTime?
  deliveredAt  DateTime?
  readAt       DateTime?
  failedAt     DateTime?
  createdAt    DateTime         @default(now())

  @@unique([threadId, externalId])
  @@unique([threadId, clientRequestId])
  @@index([externalId])
  @@index([threadId, queuedAt])
  @@index([status])
  @@map("message")
}

model MessageReceipt {
  id         String           @id @default(cuid())
  accountId  String
  account    MessagingAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  externalId String
  kind       String
  at         DateTime
  createdAt  DateTime         @default(now())

  @@unique([accountId, externalId, kind])
  @@map("messageReceipt")
}
```

`MessageReceipt` holds a delivery or seen event that arrived before the send handler wrote `externalId` on the outbound row. Phase 3 writes it. Phase 4 applies and deletes it when the row settles `SENT`. `MessagingAccount` gains `receipts MessageReceipt[]`. [Red team 2026-09-16, finding 7]

`SENDING` is the state between the agent's claim of a `QUEUED` row and the vendor answer. It stops a re-leased task from sending the same text twice. [Red team 2026-09-16, finding 4]

`clientRequestId` is the browser's idempotency key for one send. Phase 4 writes it. `errorMessage` and `tokenError` hold fixed sentences from `sentenceFor(code)`, never vendor text. [Red team 2026-09-16, findings 2, 8]

Also:

- `enum ActivityType` gains `MESSAGE` (`schema.prisma:178-186`).
- `model Activity` (`schema.prisma:1077-1112`) gains `messageThreadId String? @unique` and `messageThread MessageThread? @relation(fields: [messageThreadId], references: [id], onDelete: Cascade)`. Same shape as `emailThreadId`.
- `model Contact` gains `channelIdentities ContactChannelIdentity[]` and `messageThreads MessageThread[]`. `model Company` gains `messageThreads MessageThread[]`. `model User` gains the two named relations.
- Delete rules: deleting a contact sets `ContactChannelIdentity.contactId`, `MessageThread.contactId` and `MessageThread.companyId` to null. The thread, its messages and its `MESSAGE` activity survive and the thread returns to Unmatched. `Activity.contactId` cascades from the contact today (`schema.prisma:1090`), so phase 3 adds one statement to `ContactsService.delete` that nulls `contactId` and `companyId` on the contact's `MESSAGE` activities before the contact row goes. Erasure of a Zalo person is `messaging.deleteThread` (phase 3): it deletes the identity, and the thread, messages and activity cascade from it. Phase 3 tests both in `record-delete.spec.ts`. <!-- Updated: Validation Session 1 - contact delete is SetNull, not cascade -->
- Tokens are columns, like `SlackWorkspaceGrant`. Only `apps/agent/agent/lib/messaging/zalo-connection.ts` and `apps/api/src/messaging/zalo/zalo-oauth.service.ts` select `accessToken` or `refreshToken`. `zalo.status` never selects them.
- `attachments Json?` holds Zalo URLs as `{ url, name?, size? }[]`. Phase 3 defines the Zod schema. Files are not copied to Blob (phase 1 row 7).

## Shared package: `packages/db/src/messaging.ts` (`@crm/db/messaging`)

The API computes eligibility for the composer. The agent computes it before the vendor call. One module, shared like `@crm/db/agent-tasks`.

```ts
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const MESSAGING_POLICY = {
  zalo: {
    replyWindowMs: 48 * HOUR_MS,
    freeRepliesPerWindow: 8,
    attachmentHosts: ["zalo.me", "zdn.vn"],
  },
  snippetLength: 140,
  maxBodyLength: 2000,
} as const;

export type Eligibility =
  | { mode: "free-text"; windowClosesAt: Date; repliesLeft: number }
  | { mode: "blocked"; reason: string };

export function eligibility(input: {
  now: Date;
  lastInboundAt: Date | null;
  outboundSinceLastInbound: number;
  accountDisconnectedAt: Date | null;
  accountTokenError: string | null;
}): Eligibility;
```

- `replyWindowMs` and `freeRepliesPerWindow` come from fact A. If fact A shows no per-window quota, delete `freeRepliesPerWindow` and the `repliesLeft` field. A declared quota is enforced or it does not exist. `maxBodyLength` and `attachmentHosts` come from fact E. [Red team 2026-09-16, findings 8, 11]
- `outboundSinceLastInbound` counts `OUTBOUND` rows with `status` not `FAILED` and `queuedAt >= lastInboundAt`. The API counts it in `eligibilityFor()`. The agent counts it in `runMessageSend()`.
- Blocked reasons are finished sentences the composer renders as-is, in this order of precedence: "Zalo is disconnected.", "The Zalo token needs a reconnect.", "This customer has not written to the OA yet.", "The reply window closed at {windowClosesAt}. Zalo charges per message after that and this CRM does not send.", "The {freeRepliesPerWindow} free replies for this window are used up. The next one costs money and this CRM does not send."
- `eligibility()` is pure. No Prisma, no env, no clock. Tested in `packages/db/test/messaging.spec.ts`.
- Add `"./messaging": "./src/messaging.ts"` to `packages/db/package.json` exports, beside `./agent-tasks` (line 8).

## Task kinds (`packages/db/src/agent-tasks.ts`)

- `TASK_KINDS` gains `"message-send"` and `"message-token-refresh"`.
- `DIRECT_KINDS` gains both. Neither decides anything. Neither needs a model. The `message-send` handler arrives in phase 4. No `message-send` row exists before phase 4, so the `handleDirect()` fallthrough is never reached for it.
- `PRIORITY` gains `messageSend: 950` and `messageToken: 940`. A rep waits on a send.

Payload schemas in `packages/validation/src/messaging.ts`, registered in `packages/validation/src/index.ts` (line 5) as `schemas.messaging`:

```ts
export const sendPayload = z.object({ messageId: z.string().min(1) });
export const tokenRefreshPayload = z.object({ accountId: z.string().min(1) });
```

Message tasks carry no `contactId` and no `companyId`. `reconcileDirect()` in `apps/agent/agent/lib/dispatch.ts:95-102` settles `enrichmentStatus` on the contact of any thrown direct task, and `retireAbandoned()` at line 29 does the same after three leases. A Zalo send is not research and must never write `enrichmentStatus`. [Red team 2026-09-16, finding 5]

## Related Code Files

Create:

- `packages/db/src/messaging.ts`, `packages/db/test/messaging.spec.ts`
- `packages/validation/src/messaging.ts`
- `packages/db/prisma/migrations/<timestamp>_messaging/migration.sql`
- `apps/api/src/messaging/messaging.module.ts`
- `apps/api/src/messaging/messaging-config.ts` (`MESSAGING_API = { oauth: { verifierTtlMs: 10 * MINUTE_MS }, threads: { pageSize: 30, maxPageSize: 100 }, messages: { pageSize: 50 }, webhook: { maxBodyBytes: 64 * 1024, clockSkewMs: 5 * MINUTE_MS } } as const`; `isZaloConfigured()` reads `ZALO_APP_ID` and `ZALO_APP_SECRET`, both or neither, as `packages/auth/src/env.ts` does for Slack)
- `apps/api/src/messaging/zalo/zalo.router.ts` (alias `zalo`, `@UseMiddlewares(AuthMiddleware)`)
- `apps/api/src/messaging/zalo/zalo-connection.service.ts` (`status(userId)`, `disconnect(userId)`; shaped like `apps/api/src/slack/slack-connection.service.ts:37-99, 256-277`)
- `apps/api/src/messaging/zalo/zalo-oauth.controller.ts` (`GET /api/messaging/zalo/connect`, `GET /api/messaging/zalo/callback`; the global guard requires a session; the service checks the role)
- `apps/api/src/messaging/zalo/zalo-oauth.service.ts` (`Verification` row with verifier, user id and return path; code exchange; OA profile read; account upsert; first refresh task)
- `apps/api/src/messaging/zalo/zalo-oauth.schema.ts` (Zod for the token response, the OA profile response and the stored `Verification.value`, from fact D and E)
- `apps/agent/agent/lib/messaging/messaging-config.ts` (`MESSAGING = { zalo: { refreshEveryMs: 6 * HOUR_MS, refreshAheadMs: 12 * HOUR_MS, requestTimeoutMs: 10 * SECOND_MS, transientRetryMs: [5 * MINUTE_MS, 30 * MINUTE_MS, 2 * HOUR_MS] }, receipts: { staleAfterMs: 7 * DAY_MS } } as const`; pattern `apps/agent/agent/lib/dispatch-config.ts`. No `send.maxAttempts`: `claimDue` at `apps/agent/agent/lib/tasks.ts:54` uses the global `MAX_ATTEMPTS` and a per-area copy is dead config)
- `apps/agent/agent/lib/messaging/zalo-errors.ts` (`classifyRefreshError(response)` and `classifySendError(response)` return `{ code, terminal: boolean }` from fact D; `sentenceFor(code)` maps a code to one fixed sentence, default "Zalo refused the request."; vendor text never reaches a column)
- `apps/agent/agent/lib/messaging/zalo-client.ts` (fetch plus Zod: `refreshAccessToken`, `readOaProfile`; phase 4 adds `sendText`; no third-party Zalo package)
- `apps/agent/agent/lib/messaging/zalo-connection.ts` (the only reader of tokens in the agent: `readZaloAccount(accountId)`, `writeRefreshedTokens()`, `isZaloConfigured()`)
- `apps/agent/agent/lib/messaging/message-token-refresh.ts` (`runMessageTokenRefresh(payload): Promise<string>`)
- `apps/app/app/(app)/[slug]/settings/connections/zalo/page.tsx` (server page; computes status; hands plain data to the client parts)
- `apps/app/app/(app)/[slug]/settings/connections/zalo/zalo-connect-button.tsx` (client; links to `<API_URL>/api/messaging/zalo/connect`)
- `apps/app/app/(app)/[slug]/settings/connections/zalo/zalo-disconnect-button.tsx` (client; `zalo.disconnect`; disabled when `canManage` is false)
- `packages/ui/src/components/brand-logos/zalo.tsx` (shaped like `stripe.tsx`; icon mark only)
- Tests listed below.

Modify:

- `packages/db/prisma/schema.prisma` (models above; `ActivityType.MESSAGE`; `Activity.messageThreadId`; back-relations on `Contact`, `Company`, `User`)
- `packages/db/package.json` (exports `./messaging`)
- `packages/db/src/agent-tasks.ts` (kinds, direct kinds, priorities)
- `packages/validation/src/index.ts` (`schemas.messaging`)
- `apps/api/src/app.module.ts` (import `MessagingModule`)
- `apps/api/src/agent/agent-trigger.service.ts` (new named method `messageTokenRefreshDue(accountId, dueAt, tx?)` through `enqueue()` at line 363, `required = true`, `subject: { path: ["accountId"], value: accountId }`; the `dueAt` needs `enqueue()` to accept an optional `dueAt`, default now; `enqueue()` has 9 internal callers at lines 40, 48, 58, 66, 76, 85, 95, 144 and 240, none passes `dueAt`, none changes)
- `apps/agent/agent/lib/tasks.ts` (`scheduleTask()` at line 138 gains `subject?: { path: string[]; value: string }` and `exceptId?: string`; the `findFirst` at line 149 adds `payload: { path, equals: value }` when `subject` is set and `id: { not: exceptId }` when `exceptId` is set; the update branch at line 160 also writes `payload`; the create branch is unchanged; callers `apps/agent/agent/tools/schedule_recheck.ts:41` and `apps/agent/test/tasks.integration.spec.ts:202,216,217` pass neither and keep their behaviour)
- `apps/api/src/config/env.validation.ts` (`ZALO_APP_ID?`, `ZALO_APP_SECRET?`, both `@IsOptional() @IsString()`, beside `SLACK_CLIENT_ID` at line 73; `ZALO_OA_SECRET_KEY?` only if fact B needs it)
- `turbo.json` (`globalPassThroughEnv` beside `SLACK_CLIENT_ID` at line 47; this is the only file that names `SLACK_CLIENT_ID`)
- `apps/api/turbo.json` (`dev` and `test` `passThroughEnv` lists; the Slack pair is not in them, so add the Zalo pair beside the first entry of each list)
- `apps/agent/turbo.json` (`dev` and `dev:headless` `passThroughEnv` lists; same rule)
- `.env.example` (block after `SLACK_*` under "Optional: what the agent can do"; names the redirect URI and the webhook URL as `<API_URL>/api/messaging/zalo/...`)
- `apps/agent/agent/lib/capabilities.ts` (entry via `fromEnv("ZALO_APP_ID")` at line 37, label "Zalo Official Account", gives "customer chat over the company's Zalo OA: inbound messages on the contact record and replies from the CRM")
- `apps/agent/agent/lib/dispatch.ts` (`handleDirect()` at line 104 gains the `message-token-refresh` branch before the fallthrough)
- `apps/app/lib/trpc/cache.ts` (`zalo(options)` invalidates `zalo.status`; shape of `slack(options)` at line 33)
- `apps/app/app/(app)/[slug]/settings/connections/page.tsx` (fetch `zalo.status` beside `slack.status` at line 36; row when `zalo.connected`: name "Zalo Official Account", bringsIn "Messages customers send to the OA", sends "Replies a rep writes from the inbox"; `ConnectionCard` at line 165)
- `apps/app/app/(app)/[slug]/settings/connections/add-connection-dialog.tsx` (`CatalogRow` for Zalo beside line 45; hidden when connected; description "Chat with customers on the company's Official Account"; href `/settings/connections/zalo`)

## tRPC procedures (`zalo` router)

nestjs-trpc has one alias per router and camelCase methods. The brainstorm's `zalo.status` and `zalo.disconnect` map one to one.

| Procedure | Kind | Input | Returns | Notes |
| --- | --- | --- | --- | --- |
| `zalo.status` | query | none | `{ configured, connected, oaName, avatarUrl, verified, tokenRefreshedAt, tokenExpiresAt, tokenError, lastInboundAt, lastOutboundAt, lastWebhookAt, unmatchedCount, canManage }` | `configured` from `isZaloConfigured()`. `unmatchedCount` counts identities with `contactId = null` on the connected account. `tokenError` is the fixed sentence from `sentenceFor(code)`, never vendor text. Never returns a token |
| `zalo.disconnect` | mutation | none | `{ ok: true }` | `assertMember` then `canManageConnections`, refused server-side as `SlackConnectionService.disconnect` does. One transaction: clears both tokens, sets `disconnectedAt`, completes open `message-token-refresh` and `message-send` tasks for the account with outcome "Disconnected". History stays |

`src/generated/server.ts` regenerates on `bun run check-types` (`docs/api.md`). Commit it.

## OAuth

- `GET /api/messaging/zalo/connect?returnTo=<path>`: `assertMember`, then `canManageConnections`. A workspace with no owner and no admin lets any member connect, same as `slackConnectGuard`. Refuse with 403 when `isZaloConfigured()` is false. `returnTo` must be a relative path that starts with `/` and not `//`; anything else is 400. The API has no workspace slug of its own (`grep -rl slug apps/api/src` matches only `workspace/*`), so the app passes the full path. Generate `state` and a PKCE verifier. Store `Verification { id: state, identifier: "zalo-pkce", value: JSON.stringify({ verifier, userId: session.user.id, returnTo }), expiresAt: now + MESSAGING_API.oauth.verifierTtlMs }` (`schema.prisma:146`). Redirect to the Zalo authorise URL with `code_challenge` (field names from fact D). `redirect_uri` is built from `API_URL`, never `APP_URL` (`docs/environment.md`). [Red team 2026-09-16, finding 3]
- `GET /api/messaging/zalo/callback?code&state`: same role check before the exchange, so a refused attempt writes no token. Load and delete the `Verification` row in one statement. Parse `value` with the Zod schema in `zalo-oauth.schema.ts`. Expired or missing row: redirect to `/settings/connections/zalo?provider=zalo&error=state`. `userId` differs from the session user: redirect with `error=state` and log `{ message: "Zalo callback from another session" }` with no ids. Exchange the code with `secret_key` in the header (fact D). Read the OA profile (fact E) for `oa_id`, `name`, `avatar`, verified flag. One transaction: upsert `MessagingAccount` by `(ZALO, oa_id)` with both tokens, `tokenExpiresAt`, `tokenRefreshedAt = now`, cleared `tokenError` and `disconnectedAt`, `connectedById = session.user.id`; mark every other ZALO account `disconnectedAt = now` with cleared tokens; complete every open `message-token-refresh` and `message-send` task of those other accounts with outcome "Replaced by another OA"; book the first refresh task with `messageTokenRefreshDue(account.id, now + MESSAGING.zalo.refreshEveryMs, tx)`. Redirect to `<returnTo>?provider=zalo&connected=1`, or `<returnTo>?provider=zalo&error=<code>` on failure. `connectErrorOf(query, provider)` at `oauth-connection-page.tsx:21` returns the error only when `query.provider` equals the provider, so the `provider` parameter is required on every redirect. [Red team 2026-09-16, findings 3, 6]
- Log the outcome with one object and never the query string or the body (`docs/api.md` Logging).

## Agent handler

`handleDirect()` in `apps/agent/agent/lib/dispatch.ts` gains:

```ts
if (task.kind === "message-token-refresh") {
  await completeTask(task.id, await runMessageTokenRefresh(task));
  return;
}
```

`runMessageTokenRefresh(task)` receives the leased task, not only the payload, because the rebook must exclude the running row:

1. Parse with `parse(schemas.messaging.tokenRefreshPayload, task.payload, "A message-token-refresh task carries an unreadable payload")`. `parse()` lives in `packages/validation/src/index.ts:21`.
2. Load the account through `readZaloAccount()`. Missing: return "The account this names is gone." `disconnectedAt` set: return "Disconnected; nothing to refresh." Do not rebook in either case.
3. Due when `tokenError` is set, or when `tokenExpiresAt - now <= MESSAGING.zalo.refreshAheadMs`. A `tokenError` means a send saw a 401 and booked this task now. A refresh that answers "Not due." to that booking leaves the composer blocked until expiry. Not due: rebook with `rebook(task, tokenExpiresAt - refreshAheadMs)` and return "Not due." [Red team 2026-09-16, finding 2]
4. Due: call `refreshAccessToken(refreshToken)` with `AbortSignal.timeout(MESSAGING.zalo.requestTimeoutMs)`. On success write both new tokens, `tokenExpiresAt`, `tokenRefreshedAt`, `tokenError = null` with `updateMany({ where: { id: accountId, disconnectedAt: null } })`, before anything else. The refresh token is single-use. A crash between exchange and write burns it. `count === 0` means the owner disconnected while the call was in flight: return "Disconnected during refresh." and book nothing. The cleared row never receives a live token. [Red team 2026-09-16, finding 6]
5. Terminal failure (`classifyRefreshError()` returns `terminal: true`, the `invalid_grant` class from fact D): set `tokenError = sentenceFor(code)` with the same `disconnectedAt: null` guard. Do not rebook. Return the sentence. The card shows "Needs a reconnect". Emit `messagingError({ error, stage: "token" })`.
6. Transient failure (timeout, network, 5xx, unparsed body): write nothing on the account. Rebook with `rebook(task, now + MESSAGING.zalo.transientRetryMs[min(task.attempts - 1, 2)])`. Return "Refresh retried later." A 10-second blip must not block every rep until an admin reconnects. [Red team 2026-09-16, finding 2]
7. Success: rebook with `rebook(task, now + MESSAGING.zalo.refreshEveryMs)`. Return "Token refreshed."
8. Never throw. Return one sentence for `AgentTask.outcome`.

`rebook(task, dueAt)` calls `scheduleTask({ kind: "message-token-refresh", payload: { accountId }, subject: { path: ["accountId"], value: accountId }, exceptId: task.id, dueAt, priority: PRIORITY.messageToken, reason: "Keep the Zalo token fresh." })`. Today `scheduleTask()` at `apps/agent/agent/lib/tasks.ts:138-166` has no `subject`. It dedupes on `kind` plus record ids and updates only `dueAt`. With no ids it matches any open task of that kind, including the row that is running, so the rebook would edit the running row and `completeTask()` would then finish it. Zero open refresh tasks would remain. A second OA's task would overwrite the first OA's `dueAt`. `subject` and `exceptId` fix both. The `enqueue()` filter at `agent-trigger.service.ts:385-396` is the shape to copy. `AgentTask.subject` at `schema.prisma:477` stays unused, as it is today. [Red team 2026-09-16, finding 1]

The test for this asserts, after `handleDirect()` returns: exactly one open `message-token-refresh` row per account, with `payload.accountId` equal to that account, and the run row finished.

## UI

- `settings/connections/zalo/page.tsx` leads with liveness (`docs/connections.md` "Failure is on the surface"): OA name with the verified badge, "Token refreshed 2 h ago" or "Needs a reconnect", "Last message arrived 4 min ago" (blank until phase 3), "3 unmatched people" (links to the inbox filter from phase 3). Then "Brings in" and "Sends" lists. Then one sentence: "Customers start the conversation. This CRM cannot message someone who has not written to the OA." Then Connect or Disconnect.
- `configured: false` names `ZALO_APP_ID` and `ZALO_APP_SECRET` and stops. Same as the Slack page.
- `?provider=zalo&connected=1` and `?provider=zalo&error=<code>` render through `oauth-connection-page.tsx`, as Slack does. `connectErrorOf()` at line 21 ignores an `error` without a matching `provider`.
- The Disconnect button is disabled when `canManage` is false. The service refuses the same people.
- All components from `packages/ui`. No `className` overrides. Client components receive finished data (`AGENTS.md` "A server page computes").

## Env vars (every home)

| Variable | `.env.example` | `env.validation.ts` | root `turbo.json` | `apps/api/turbo.json`, `apps/agent/turbo.json` | `capabilities.ts` |
| --- | --- | --- | --- | --- | --- |
| `ZALO_APP_ID` | yes, with the redirect URI and the webhook URL | `@IsOptional() @IsString()` | `globalPassThroughEnv` | `passThroughEnv` on `dev`, `test`, `dev:headless`; these lists do not contain the Slack pair today | `fromEnv("ZALO_APP_ID")` |
| `ZALO_APP_SECRET` | yes | `@IsOptional() @IsString()` | same | same | read with the id, not listed |
| `ZALO_OA_SECRET_KEY` | only if fact B needs it | same | same | same | no |

Both or neither. `isZaloConfigured()` lives in `apps/api/src/messaging/messaging-config.ts` and in `apps/agent/agent/lib/messaging/zalo-connection.ts`, each reading its own env (`docs/environment.md` "The schema is the API's, not the repo's"). A missing pair returns `configured: false`. Nothing throws.

## Tests (bun:test)

- `packages/db/test/messaging.spec.ts`: `eligibility()` table: inside the window returns `free-text` with the right `windowClosesAt` and `repliesLeft`; window closed; never wrote; disconnected; token error; quota used up; precedence of reasons.
- `apps/api/test/zalo-oauth.spec.ts` (real DB, rows suffixed by `TEST_RUN_ID` as `mailbox-thread-writer.spec.ts:14` does; `globalThis.fetch` stubbed as `apps/agent/test/slack-membership.integration.spec.ts` does): verifier stored and deleted; expired state refused; a callback from a different user than the one who started `/connect` is refused before any fetch; `returnTo` that is not a relative path is 400; member without the role refused before any fetch; callback upserts the account with tokens and books one refresh task with `payload.accountId`; a second OA disconnects the first and completes its open tasks; every redirect carries `provider=zalo`.
- `apps/api/test/zalo-connection.spec.ts`: `status` never includes a token field; `tokenError` is a fixed sentence; `configured: false` when the env pair is missing; `disconnect` refused for a member; `disconnect` clears tokens and completes the open refresh and send tasks.
- `apps/agent/test/message-token-refresh.integration.spec.ts`: not due rebooks at `tokenExpiresAt - refreshAheadMs` and leaves exactly one open row per account after `handleDirect()`; two accounts keep two open rows with their own `payload.accountId`; due path writes both tokens, clears `tokenError` and rebooks; `tokenError` set with 40 h left is treated as due; terminal failure sets a fixed sentence and books nothing; transient failure writes no `tokenError` and rebooks with backoff; disconnected account books nothing; disconnect between the vendor call and the write leaves the tokens cleared.
- `apps/agent/test/tasks.integration.spec.ts`: extend at line 202: `scheduleTask` with `subject` matches only the row whose payload path equals the value; `exceptId` skips the running row.
- `apps/agent/test/zalo-client.spec.ts`: Zod parse of the refresh success and error responses and the OA profile response; `classifyRefreshError` splits terminal from transient; `sentenceFor` never returns vendor text.
- `apps/agent/test/capabilities.spec.ts`: extend for `ZALO_APP_ID`.

## Implementation Steps

1. Read `docs/messaging.md` facts A, D, E and B. Copy fact A into `MESSAGING_POLICY.zalo.replyWindowMs`.
2. Write `packages/db/src/messaging.ts` and its test. Add the package export.
3. Edit `schema.prisma`. Run `bun run --filter=@crm/db db:migrate` to create the migration. Run `db:generate`.
4. Add task kinds, priorities and payload schemas.
5. Add env vars to every home. Add the capability entry. Confirm `bun run dev` starts with the pair unset.
6. Build the API: `messaging-config.ts`, `zalo-oauth.schema.ts`, `zalo-oauth.service.ts`, `zalo-oauth.controller.ts`, `zalo-connection.service.ts`, `zalo.router.ts`, `messaging.module.ts`. Register the module. Add `messageTokenRefreshDue` to `AgentTriggerService`.
7. Extend `scheduleTask()` in `apps/agent/agent/lib/tasks.ts` with `subject` and `exceptId`. Extend its test. Then build the agent: `messaging-config.ts`, `zalo-errors.ts`, `zalo-client.ts`, `zalo-connection.ts`, `message-token-refresh.ts`, the `handleDirect()` branch.
8. Run `bun run check-types` to regenerate `src/generated/server.ts`.
9. Build the app: `cache.ts`, brand mark, Zalo page and buttons, connections card row, dialog row.
10. Run the tests above, then `bun run lint`, `bun run check-types`, `bun run build`.
11. Manual check on the sandbox OA: connect, see the OA name and the verified state on the card, run `bun run --filter=agent dispatch`, see `tokenRefreshedAt` move, disconnect, see the card return to Connect.

## Success Criteria

- [x] Migration applies on a fresh database and on the test database.
- [ ] An owner connects the sandbox OA. The card shows the OA name and token health. (needs sandbox OA)
- [x] A member without the role gets 403 at `/connect` and at `/callback` before any exchange. A callback from another user is refused.
- [x] `zalo.status` never returns a token and never returns vendor text. A test asserts it.
- [x] The refresh task rebooks itself as one open row per account. A terminal failure writes `tokenError` and stops rebooking. A transient failure rebooks with backoff and writes no `tokenError`. A set `tokenError` makes the next refresh due.
- [x] Disconnect clears tokens, completes the refresh task and keeps rows. A refresh in flight during disconnect writes nothing.
- [x] Missing `ZALO_APP_ID` hides the card. Config-level check proves no throw; `bun run dev` itself was not run (rule: never run dev server).
- [x] `check-types`, `lint` and the listed tests pass. (build not run in any report)

## Risk Assessment

- RISK: A wrong reply window value blocks free replies or spends 55 VND per message. Mitigation: fact A is read before step 1. The value is one shared constant.
- RISK: A burned refresh token needs an admin reconnect. Mitigation: the handler writes tokens before anything else. Refresh runs 12 h ahead of expiry. The card leads with token health.
- RISK: `scheduleTask()` without `subject` matches the running row and a second OA's row. Mitigation: `subject` and `exceptId` are added to `scheduleTask()` in this phase. The test counts open rows after `handleDirect()`.
- RISK: A transient refresh failure treated as terminal blocks every rep until an admin reconnects. Mitigation: `classifyRefreshError()` splits the two. Transient failures rebook with backoff and write no `tokenError`.
- RISK: OAuth `state` bound to no user lets another member complete an admin's connect. Mitigation: the `Verification` value carries the user id and the callback refuses a different session.
- RISK: The `Verification` table belongs to Better Auth. A future Better Auth migration changes it. Mitigation: use only `id`, `identifier`, `value`, `expiresAt`. The `zalo-pkce` identifier keeps rows apart.
- RISK: `enqueue()` has no `dueAt` today. Adding one touches every caller's default. Mitigation: optional parameter, default `new Date()`. Existing callers pass nothing.
- RISK: Editing `packages/db` does not restart the API (`docs/environment.md`). A stale process serves the old export. Mitigation: restart the API by hand after step 2.

## Rollback

- Code: revert the merge. The migration is additive. Leave the tables in place, or write a down migration that drops the five tables, the four enums, `Activity.messageThreadId` and the `MESSAGE` enum value.
- Data: disconnecting the OA stops all traffic without a deploy.

## Outcome — 2026-09-21

Reports: `from-fullstack-developer-to-orchestrator-phase-02-backend-implementation-report.md`,
`from-fullstack-developer-to-orchestrator-phase-02-ui-implementation-report.md`,
`from-code-reviewer-to-orchestrator-phase-02-backend-review-report.md`,
`from-fullstack-developer-to-orchestrator-phase-02-review-fixes-report.md`.

Deviations landed here: `ZALO_OA_SECRET_KEY` third var; escalating refresh backoff keyed on
`payload.attempt` (a rebook is a new task row, so `task.attempts` always read 0 — review
finding 3); Zalo wire schemas moved into `packages/validation/src/messaging.ts`, shared by API
and agent; attachment allowlist widened to three hosts (`zdn.vn`, `zadn.vn`, `zalo.me`);
callback query now parsed at the boundary with the Zod schemas the first pass left unused
(review finding 2); a 5xx with a JSON error body is classified transient, not terminal (review
finding 1); `/connect` and `/callback` still answer a raw 403/redirect-less error for a missing
role or config, not a redirect with `error=role`/`error=config` (UI review finding, not fixed).

Gate: `packages/db` 133, `apps/agent` 356, `apps/api` 386, all green after review-fixes.
`packages/validation` 5. Migration applied and verified on both `crm` and `crm_test` in the
phase 4 review-fixes pass (`bunx prisma migrate status`, 54 migrations, up to date).

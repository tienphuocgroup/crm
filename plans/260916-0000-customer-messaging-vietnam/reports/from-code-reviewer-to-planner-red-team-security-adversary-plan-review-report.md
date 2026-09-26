# Red-team plan review: security adversary

Plan: `plans/260916-0000-customer-messaging-vietnam/` (plan.md, phases 1 to 4)
Reviewer role: code-reviewer, Security Adversary, Standard tier (Fact Checker + Contract Verifier)
Date: 2026-09-16

## Finding 1: The "Slack OAuth pattern" the plan copies does not exist in `apps/api`; the hand-rolled flow binds `state` to nobody

- **Severity:** High
- **Location:** Phase 2, sections "Architecture", "OAuth", "Related Code Files" (`zalo-oauth.controller.ts`, `zalo-oauth.service.ts`)
- **Flaw:** Phase 2 says the OAuth exchange is "the one documented exception to 'no vendor client in the API', as Slack's OAuth is" and copies `slackConnectGuard`. Slack OAuth is not in `apps/api/src/slack/`. It is Better Auth `genericOAuth` in `packages/auth/src/auth.ts:121-147`, guarded by a Better Auth `before` hook (`packages/auth/src/auth.ts:115`, `packages/auth/src/slack-connect.ts:26`). Better Auth owns state, PKCE and session binding for that flow. The plan's Nest controller reimplements all three and stores `Verification { id: state, identifier: "zalo-pkce", value: verifier }` with no user id. `docs/api.md:32` names the exchange-rate fetcher as the one documented exception. Phase 4 "Docs" then calls Zalo "the second documented exception". The two phases contradict each other and the doc.
- **Failure scenario:** Admin A hits `/connect`. The `Verification` row holds only the PKCE verifier. Any other signed-in member who passes the role check (or any member at all when the workspace has no owner and no admin, as the plan allows) can complete `/callback?code&state` with A's `state`. The account is written with `connectedById` = the completer. Every inbound `MESSAGE` activity is then attributed to that user (`createdById: account.connectedById`, Phase 3 writer step 5). No test in Phase 2 covers "callback completed by a different session than the one that started it".
- **Evidence:** `packages/auth/src/auth.ts:115` (`before: slackConnectGuard`), `packages/auth/src/auth.ts:121` (`genericOAuth({`), `packages/auth/src/auth.ts:137-147` (custom Slack token exchange inside the plugin), `packages/auth/src/slack-connect.ts:26` (`export const slackConnectGuard = createAuthMiddleware(`), `apps/api/src/slack/` contains no OAuth controller (`slack-channels.service.ts`, `slack-config.ts`, `slack-connection.service.ts`, `slack.contracts.ts`, `slack.module.ts`, `slack.router.ts`), `docs/api.md:32` ("One documented exception, for timing: the exchange-rate fetcher"). Plan quote: "The OAuth exchange and the OA profile read are the one documented exception to 'no vendor client in the API', as Slack's OAuth is."
- **Suggested fix:** Pick one. (a) Register Zalo as a second `genericOAuth` provider with a custom token exchange, as Slack does at `auth.ts:137`, and copy tokens from `Account` to `MessagingAccount` in an `after` hook. (b) Keep the Nest controller, store `{ verifier, userId }` as JSON in `Verification.value`, and refuse the callback when `session.user.id !== stored.userId`. Add that test. Fix the "documented exception" sentence in both phases to match `docs/api.md`.

## Finding 2: `scheduleTask()` does not upsert on `(kind, subject)`; one open refresh task is shared by every account, and the API and agent use two different dedupe rules

- **Severity:** High
- **Location:** Phase 2, section "Agent handler" (last paragraph) and "Modify" (`agent-trigger.service.ts`); Phase 4, "Agent handler" step 7
- **Flaw:** The plan states "`scheduleTask()` is an idempotent upsert on `(kind, subject)`. Use `subject: { path: ["accountId"], value: accountId }`". `scheduleTask` has no `subject` parameter. Its dedupe key is `(kind, contactId, companyId, dealId, finishedAt: null)`. With all three ids undefined it matches any open task of that kind. The API side (`enqueue`) dedupes by `payload.path = subject` inside a transaction with `lockIdempotencyKey`. The agent side has no transaction and no lock.
- **Failure scenario:** Callback books `message-token-refresh` for OA-2 through `enqueue` while OA-1's not-due task is open. `scheduleTask` from OA-1's next run finds "an open message-token-refresh" (OA-2's), overwrites its `dueAt` and `reason`, and returns. OA-1 never refreshes again; its token expires; every send fails with a 401-class error. Second scenario: the agent's `scheduleTask` and the API's `enqueue` run at the same moment for one account; neither sees the other's row; two open refresh tasks exist; two dispatch workers lease both; both call Zalo with the same single-use refresh token; the second call burns it; the account needs a reconnect.
- **Evidence:** `apps/agent/agent/lib/tasks.ts:138-148` (signature: `contactId, companyId, dealId, kind, reason, payload, dueAt, priority, budget`; no `subject`), `apps/agent/agent/lib/tasks.ts:149-157` (`findFirst where { kind, finishedAt: null, contactId, companyId, dealId }`), `apps/api/src/agent/agent-trigger.service.ts:378-381` (`lockIdempotencyKey(tx, \`agent-task:${kind}:...:${subject.value}\`)`), `apps/api/src/agent/agent-trigger.service.ts:385-393` (`payload: { path, equals }` dedupe). Plan quote: "`scheduleTask()` is an idempotent upsert on `(kind, subject)`."
- **Suggested fix:** Extend `scheduleTask` with `subject?: { path: string[]; value: string }` and the same `payload.path equals` filter, wrapped in `db.$transaction` with `lockIdempotencyKey` using the identical key string the API builds. Or book every refresh from one side only: the agent rebooks; the API never books, and the callback writes `tokenExpiresAt` and lets the next cron sweep create the first task. Add a test: two accounts, two open refresh tasks, neither overwrites the other.

## Finding 3: Disconnect races an in-flight refresh; live tokens land on a disconnected account

- **Severity:** High
- **Location:** Phase 2, section "Agent handler" step 4 and tRPC table row `zalo.disconnect`
- **Flaw:** The refresh handler writes "both new tokens ... in one `update`, before anything else" with no guard on `disconnectedAt`. Disconnect "completes open `message-token-refresh` tasks" via `finishedAt`, but `claimDue` has already leased the running task and the handler holds the refresh token in memory. `completeTask` is `updateMany where finishedAt: null`, so the agent's later `completeTask` returns null and the handler treats nothing as wrong.
- **Failure scenario:** Admin clicks Disconnect at second 0. The API clears both tokens and sets `disconnectedAt`. At second 1 the agent, which called Zalo at second -1, writes fresh `accessToken` and `refreshToken` onto the same row. The row now has `disconnectedAt` set and a live token pair. The plan's acceptance criterion "Disconnecting the OA stops every send, every webhook write and every token refresh" holds by accident (the handler checks `disconnectedAt` on the next run), but "Disconnect clears tokens" is false. A live OA token sits in the database for as long as the row lives. The same race applies to the `tokenError` write on the failure path.
- **Evidence:** `apps/agent/agent/lib/tasks.ts:44-48` (lease sets `leasedUntil`, `attempts + 1`; no read of `finishedAt` after lease), `apps/agent/agent/lib/tasks.ts:92-93` (`updateMany where { id, finishedAt: null }`), `apps/api/src/slack/slack-connection.service.ts:265-272` (Slack disconnect deletes rows outright; no equivalent race because Slack has no agent refresh). Plan quote: "Write both new tokens, `tokenExpiresAt`, `tokenRefreshedAt`, clear `tokenError`, in one `update`, before anything else."
- **Suggested fix:** `writeRefreshedTokens()` uses `updateMany({ where: { id, disconnectedAt: null }, data })`. `count === 0` returns "Disconnected during refresh." and books nothing. Same guard on the `tokenError` write. Add the test "disconnect during refresh leaves both token columns null".

## Finding 4: `freeRepliesPerWindow: 8` is declared and never enforced; the ninth reply is a paid message

- **Severity:** High
- **Location:** Phase 2, section "Shared package: `packages/db/src/messaging.ts`"; Phase 4, sections "Writer: `queueOutbound`" and "Agent handler" step 4
- **Flaw:** `MESSAGING_POLICY.zalo.freeRepliesPerWindow = 8` exists. `eligibility()` takes `{ now, lastInboundAt, accountDisconnectedAt, accountTokenError }` and nothing about reply count. Neither gate counts outbound rows since `lastInboundAt`. `plan.md` promises "Zero sends leave the CRM outside the window" and the composer sentence promises "this CRM does not send" when Zalo charges. Both are false for the ninth free-window reply if Zalo's quota is real (the plan's own constant says it is).
- **Failure scenario:** A rep sends nine short replies in one window. The ninth is charged (55 VND per the plan's risk note) with no warning. "Try again" after a `network` errorCode (the request timed out after Zalo accepted it) sends a duplicate and burns a second quota slot. A double-click sends twice because "a second send is a second row" and `enqueue` dedupes on the new `messageId` subject, which is unique per row.
- **Evidence:** `apps/api/src/agent/agent-trigger.service.ts:385-393` (dedupe key is `payload.messageId`, unique per row), plan Phase 2 signature block (`eligibility(input: { now; lastInboundAt; accountDisconnectedAt; accountTokenError })`), plan Phase 4 tests ("a second send is a second row"). Plan quote: "`zalo: { replyWindowMs: 48 * HOUR_MS, freeRepliesPerWindow: 8 }`".
- **Suggested fix:** Add `outboundSinceLastInbound: number` to the `eligibility()` input and a fourth blocked reason "Eight free replies are used. The next one is charged and this CRM does not send." Compute the count in `eligibilityFor()` and in `runMessageSend()` from `Message where threadId, direction OUTBOUND, status in (QUEUED, SENT, DELIVERED, READ), queuedAt > lastInboundAt`. Add a client-supplied `clientRequestId` to `sendInput` and pass it as the `enqueue` subject so a double-click is one row. If fact A/E shows there is no per-window quota, delete the constant.

## Finding 5: Attachment URLs accept any scheme and any host; the rep's browser fetches them

- **Severity:** Medium
- **Location:** Phase 3, "Related Code Files" (`incoming-message.ts` attachments schema) and "UI" (`message-bubble.tsx`, manual check "see the attachment URL rendered")
- **Flaw:** `attachments: z.array(z.object({ url: z.string().url(), ... }))`. Zod 4 `z.string().url()` validates with `new URL()` and accepts `javascript:`, `data:`, `http:` and any hostname. The plan calls them "Zalo URLs" but nothing pins them to Zalo hosts. The schema is the trust boundary the plan itself mandates ("Parse at the boundary").
- **Failure scenario:** Any event that passes the signature check (a leaked `ZALO_OA_SECRET_KEY`, a mistaken shared secret from fact B, a vendor shape change) can carry `url: "https://attacker.example/pixel.png"`. Every rep who opens the thread beacons their IP and User-Agent to the attacker. `javascript:` in an anchor renders a link React warns about but still emits. The API never fetches the URL, so there is no SSRF, but the rep's browser is the fetcher.
- **Evidence:** `packages/validation/package.json:16` and `apps/api/package.json:49` (`"zod": "^4.4.3"`), plan Phase 3 quote: "`attachments` schema `z.array(z.object({ url: z.string().url(), name: z.string().optional(), size: z.number().int().optional() }))`", plan Phase 1 row 7 ("inbound images and files stay as Zalo URLs").
- **Suggested fix:** `url: z.url({ protocol: /^https$/, hostname: /(^|\.)zalo\.me$|(^|\.)zaloapp\.com$/ })` with the exact host list from fact E in `MESSAGING_POLICY.zalo.attachmentHosts`. Render files as `<a target="_blank" rel="noopener noreferrer">`. Render `<img>` only for allowlisted hosts. Reject the event (200, `stored: false`, `messaging_error stage: "webhook"`) when a URL fails the schema.

## Finding 6: Raw vendor error strings reach every member's browser through `zalo.status` and `messaging.messages`

- **Severity:** Medium
- **Location:** Phase 2, "Agent handler" step 5 and tRPC table row `zalo.status`; Phase 4, "Agent handler" step 7 and "UI" (`MessageBubble` FAILED state)
- **Flaw:** "Failure: set `tokenError` to the vendor message." and "`errorMessage` = the vendor message." `zalo.status` returns `tokenError` after `assertMember` only; `messaging.messages` returns `errorMessage` to any member. Neither field has a length cap or a sanitiser. The plan's own logging rule forbids bodies in logs but ships vendor bodies to the UI.
- **Failure scenario:** Zalo's error body for an invalid grant echoes the request (vendor error bodies commonly include the offending parameter). The refresh handler stores it verbatim in `tokenError`. Every member's Zalo settings page renders it. A 5 KB HTML error page from a proxy in front of Zalo lands in `errorMessage` and in the message bubble.
- **Evidence:** `apps/api/src/slack/slack-connection.service.ts:37-38` (status is `assertMember` only; the plan copies this shape), `apps/agent/agent/lib/tasks.ts:96` (`outcome.slice(0, 500)` shows the codebase already caps free-text outcomes; the plan's two new columns have no cap). Plan quote: "Failure: set `tokenError` to the vendor message. Do not rebook. Return the message."
- **Suggested fix:** Store the vendor `error` code (integer or short string) in `tokenError` and `errorCode`. Map codes to fixed sentences in `MESSAGING_POLICY` or `zalo-client.ts`. Cap any stored free text at `MESSAGING_POLICY.errorTextLength`. Return the fixed sentence from `zalo.status` and the bubble.

## Finding 7: The signature check copies a raw-body helper that re-serialises objects, and has no timestamp tolerance

- **Severity:** Medium
- **Location:** Phase 3, section "Webhook controller" (first two bullets) and "Tests" (`zalo-webhook.spec.ts`)
- **Flaw:** "Read the raw body exactly as `TrackingController` does." That helper returns `JSON.stringify(existing)` when `request.body` is already an object. Tracking tolerates that; an HMAC over raw bytes does not. The plan's test constructs the controller directly, so a test that passes an object body computes the MAC over re-serialised JSON and passes, while production (`bodyParser: false`) hashes the wire bytes. The two paths diverge silently. Separately, the plan verifies the HMAC but never checks the event timestamp against `now`. A captured event verifies forever. Dedupe covers `user_send_*` only; `follow`, `unfollow`, `user_received_message`, `user_seen_message` have no idempotency key.
- **Failure scenario:** A replayed `follow` after a real `unfollow` clears `unfollowedAt`; the identity shows as following. A replayed `user_seen_message` marks a message READ. A replayed `user_send_text` rolls back on P2002 as designed, so the reply window is not extended, but the identity upsert in step 2 updates `displayName`/`avatarUrl` to stale values before the rollback. Test-versus-production divergence on the raw body means the plan's "bad signature is 401" test proves nothing about the wire path.
- **Evidence:** `apps/api/src/tracking/tracking.controller.ts:206-212` (`if (existing && typeof existing === "object") return JSON.stringify(existing)`), `apps/api/src/create-app.ts:15` (`bodyParser: false`). Plan quote: "Read the raw body exactly as `TrackingController` does (`apps/api/src/tracking/tracking.controller.ts:215-235`)."
- **Suggested fix:** Write a `rawBody()` helper for the webhook that reads the stream only and refuses (`400`) when `request.body` is already populated. Verify the timestamp from the signature input is within `MESSAGING_API.webhook.clockSkewMs` of `now`. Add `lastEventAt` on `ContactChannelIdentity` and drop `follow`/`unfollow` events older than it. Run the webhook test through the HTTP layer (supertest over `createApp()`), not by constructing the controller.

## Finding 8: PDPL erasure has one path (contact delete); unmatched Zalo people and disconnected history cannot be erased

- **Severity:** Medium
- **Location:** Phase 3, sections "tRPC procedures", "Contact delete", "Risk Assessment" (PDPL bullet); Phase 2, requirement "Disconnect ... keeps history"
- **Flaw:** The only erasure is `ContactsService.delete` cascading from `ContactChannelIdentity.contactId`. The `messaging` router has no delete. An identity with `contactId = null` (every thread starts this way; the plan expects "3 unmatched people" on the card) holds `displayName`, `avatarUrl`, message bodies, attachment URLs and a 140-character body snippet in `Activity.subject`. Disconnect keeps all of it. Vietnam Decree 13/2023 gives the data subject a right to erasure; the plan's mitigation is "Contact delete cascades", which does not reach these rows.
- **Failure scenario:** A Zalo user writes once, is never linked, and asks the company to delete their data. No UI or procedure exists. An engineer runs SQL in production. After OA disconnect, the same rows persist indefinitely with no owner and no retention.
- **Evidence:** `apps/api/src/contacts/contacts.service.ts:348` (the only delete path), `docs/api.md:210-212` ("`contacts.delete`, `companies.delete`, `deals.delete`. No soft delete, no archive."), plan Phase 3 tRPC table (six procedures, none delete). Plan quote: "Bodies are personal data under PDPL. Mitigation: never in logs, never in telemetry. Contact delete cascades."
- **Suggested fix:** Add `messaging.deleteThread({ threadId })`, owner or admin, which deletes the identity (cascade takes the thread, messages and activity). Add `MESSAGING_POLICY.unmatchedRetentionDays` and a cron that deletes unmatched identities older than it. State both in `docs/messaging.md`.

## Contract Verifier: interface changes and their callers

| Change | Callers today (file:line) | Count |
| --- | --- | --- |
| `enqueue()` gains optional `dueAt` | `apps/api/src/agent/agent-trigger.service.ts:40, 48, 58, 66, 76, 85, 95, 144, 240` (all private, same file). Hard-coded `dueAt: new Date()` also at `:214, :336, :410, :464` | 9 call sites, 4 literal `dueAt` writes. No caller outside the file |
| `scheduleTask()` "subject" | `apps/agent/agent/lib/tasks.ts:138-148` has no `subject` field. Plan claim FAILED | 0 |
| `TASK_KINDS` gains two kinds | `packages/db/src/agent-tasks.ts:1`; `packages/telemetry/src/allowlist.ts:1, 224`; `packages/telemetry/test/allowlist.spec.ts:4, 131` | 5. Telemetry allowlist derives from the array; plan's "counts with no change" claim holds |
| `DIRECT_KINDS` gains two kinds | `apps/agent/agent/lib/dispatch.ts:15, 55, 160`; `apps/agent/agent/lib/tasks.ts:29`; `apps/agent/test/lanes.integration.spec.ts:3, 9, 10`; `apps/agent/test/tasks.integration.spec.ts:3, 14`; `docs/agent.md:48, 52` (Visible lane table lists `brand`, `portrait` only) | 9 code, 2 doc |
| `PRIORITY` gains two keys | 32 references across `apps`/`packages` (`grep -rn "PRIORITY\."`) | 32. Additive; no exhaustive switch found |
| `TIMELINE_FILTERS` gains `messages` | `apps/api/src/activities/activities.contracts.ts:14, 24, 30`; `apps/api/src/activities/activities.service.ts:78, 100-118, 248` | `timelineCounts` at `:100` returns a fixed object (`notes, upcoming, done, email, meetings`, lines 108-118); adding `messages` changes the tRPC return shape and `src/generated/server.ts` |
| `cache.ts` gains `zalo()`, `messaging()` | `apps/app/lib/trpc/cache.ts:33` (interface), `:275-277` (impl) | 2 |
| `Verification` table reuse | No code outside Better Auth writes it: `grep -rn "\.verification\." apps packages` returns 0 | 0. Better Auth `genericOAuth` writes rows with `identifier = state`; the plan's `id = state` does not collide but shares the table's cleanup |
| `ActivityType` gains `MESSAGE` | `apps/agent/agent/lib/accounts.ts:537-544` filters by explicit type list (`NOTE, CALL, TASK, ENRICHMENT`), so `MESSAGE` snippets do not reach the LLM today; `apps/app/lib/activity-presentation.ts:15` needs the new key | 2 relevant sites |

### Verification Results

- Tier: Standard (Fact Checker + Contract Verifier)
- Claims checked: 41
- VERIFIED: 36
- FAILED: 4
- UNVERIFIED: 1

VERIFIED (file:line):
`schema.prisma:146` Verification; `schema.prisma:178` ActivityType; `schema.prisma:1077` Activity; `schema.prisma:96` SlackWorkspaceGrant; `packages/db/package.json:8` `./agent-tasks`; `packages/validation/src/index.ts:5` `schemas`; `agent-trigger.service.ts:363` `enqueue(`; `agent-trigger.service.ts:429` `if (!client) this.poke()`; `env.validation.ts:73` `SLACK_CLIENT_ID`; `turbo.json:47`; `capabilities.ts:37` `fromEnv`; `dispatch.ts:104` `handleDirect`; `dispatch.ts:149` fallthrough sentence; `tasks.ts:138` `scheduleTask`; `cache.ts:33` `slack(options)`; `connections/page.tsx:36` `slack.status`; `connections/page.tsx:165` `ConnectionCard`; `add-connection-dialog.tsx:45` `CatalogRow`; `oauth-connection-page.tsx:21` `connectErrorOf`; `slack-connection.service.ts:37` `status`, `:256-277` `disconnect`; `canManageConnections` (`packages/auth/src/organization.ts:32`); `assertMember` (`slack-connection.service.ts:38`); `slackConnectGuard` (`packages/auth/src/slack-connect.ts:26`); `@AllowAnonymous` (`tracking.controller.ts:48, 60`; `sync.controller.ts:28`); `DomainErrorMiddleware` (`trpc/middlewares/domain-error.middleware.ts:38`); `create-app.ts:15` `bodyParser: false`; `tracking.controller.ts:215-235` raw-body loop; `activities.contracts.ts:14` `TIMELINE_FILTERS`; `activities.service.ts:100` `timelineCounts`, `:248` `filterClause`; `contacts.service.ts:348` `delete`, `:359` `agentTask.deleteMany`; `app-icon-rail.tsx:50` Companies item; `activity-presentation.ts:15` `EMAIL`; `thread-writer.service.ts:257` `project`; `search.router.ts:15` `quick`; `record-delete.spec.ts:123`; `rollup.service.ts:568` `threads_ingested`; `events.ts:81` `syncError`; `contact-sheet.tsx:128` activity tab, `:185` Email button.

FAILED:
1. Phase 2 "as Slack's OAuth is" a documented API exception. Slack OAuth is `packages/auth/src/auth.ts:121` (Better Auth), not `apps/api`. `docs/api.md:32` names one exception: the exchange-rate fetcher.
2. Phase 2 "`scheduleTask()` is an idempotent upsert on `(kind, subject)`". `tasks.ts:138-157` has no `subject`; dedupe is `(kind, contactId, companyId, dealId)`.
3. Phase 2 "`apps/api/turbo.json` lines 21 and 39", "`apps/agent/turbo.json` lines 17 and 31": `grep -n SLACK_CLIENT_ID` matches only root `turbo.json:47`. The per-package `passThroughEnv` anchors do not contain `SLACK_CLIENT_ID`.
4. Phase 3 "`ActivityStampService.targetsOf(where)` already collects the reached records" for the message cascade: `targetsOf({ contactId })` at `contacts.service.ts:357` runs before the delete and collects `Activity` rows by `contactId`; an unmatched thread's `MESSAGE` activity has `contactId = null` and is not collected. Harmless today (no stamp target), but the claim is broader than the code.

UNVERIFIED:
1. Phase 3 "`@carbon/icons-react` exports `SendAlt`": `node_modules` not installed; the plan already marks this UNKNOWN.

## Issues

1. RISK — The plan copies a Slack OAuth pattern that lives in Better Auth, not Nest. The hand-rolled `state` is bound to no user. Fix: Finding 1.
2. BROKEN — `scheduleTask()` has no `subject`; the plan's refresh-task idempotency does not exist. Fix: Finding 2.
3. RISK — Disconnect races an in-flight refresh and leaves live tokens on a disconnected row. Fix: Finding 3.
4. RISK — `freeRepliesPerWindow` is never enforced; the ninth reply is charged. Fix: Finding 4.
5. RISK — Attachment URLs accept any scheme and host. Fix: Finding 5.
6. RISK — Raw vendor error text reaches every member's browser. Fix: Finding 6.
7. RISK — The raw-body helper re-serialises objects; no timestamp tolerance; non-message events replay. Fix: Finding 7.
8. NOT DONE — No erasure path for unmatched Zalo people or disconnected history. Fix: Finding 8.
9. BROKEN — Three cited line anchors are wrong (`apps/api/turbo.json:21,39`, `apps/agent/turbo.json:17,31`). Fix: re-anchor before implementation.
10. UNKNOWN — `SendAlt` icon export. Fix: check after `bun install`.

Status: DONE_WITH_CONCERNS
Summary: Eight findings, three High. The refresh-task idempotency the plan relies on does not exist in `scheduleTask()`, the OAuth pattern it claims to copy is Better Auth and not Nest, and the free-reply quota the plan declares is never enforced.

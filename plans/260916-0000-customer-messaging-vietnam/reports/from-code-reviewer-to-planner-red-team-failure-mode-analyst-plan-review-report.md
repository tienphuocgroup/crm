# Red-team plan review: failure-mode analyst

Plan: `plans/260916-0000-customer-messaging-vietnam/` (plan.md, phases 1-4)
Reviewer role: Fact Checker + Contract Verifier (Standard tier)
Date: 2026-09-16

## Finding 1: `scheduleTask()` has no `subject`. The refresh task rebooks onto the wrong account.
- **Severity:** Critical
- **Location:** Phase 2, section "Agent handler" (line 299) and Phase 4, section "Agent handler" step 7
- **Flaw:** The plan states `scheduleTask()` is "an idempotent upsert on (kind, subject)" and tells the handler to pass `subject: { path: ["accountId"], value: accountId }`. `scheduleTask()` accepts no `subject`. It dedupes on `kind` plus optional `contactId`/`companyId`/`dealId`. With all three absent, it matches any open task of that kind. On a hit it updates `dueAt` and `reason` only. The payload stays. The API-side `enqueue()` dedupes on a payload path instead. Two bookers, two rules.
- **Failure scenario:** OA1 is connected. Its refresh task T1 is open. An admin connects OA2. The callback marks OA1 disconnected and books T2 via `enqueue()` (payload accountId=OA2). Dispatch runs T2. Step 6 calls `scheduleTask({ kind: "message-token-refresh" })`. `findFirst` returns T1. T1 gets a new `dueAt`; its payload still says OA1. `handleDirect()` then completes T2. T1 runs, reads OA1, returns "Disconnected; nothing to refresh." and does not rebook. OA2 is never refreshed. Its token expires. Every send returns 401. `tokenError` is set. The composer blocks. An admin must reconnect. The same path fires on the Phase 4 401-class branch.
- **Evidence:** `apps/agent/agent/lib/tasks.ts:138-148` (input type: no `subject`), `apps/agent/agent/lib/tasks.ts:149-166` (dedupe on kind + record ids; update writes `dueAt`, `reason` only), `apps/api/src/agent/agent-trigger.service.ts:389-396` (payload-path dedupe), `packages/db/prisma/schema.prisma:477,484` (`AgentTask.subject` column and partial index exist; no writer found by grep in `apps/agent` or `apps/api`). Plan quote: "`scheduleTask()` is an idempotent upsert on `(kind, subject)`."
- **Suggested fix:** Extend `scheduleTask()` with `subject?: { path: string[]; value: string }` and filter on `payload: { path, equals }` exactly as `enqueue()` does. Write `payload` on the update branch. Add a test in `apps/agent/test/tasks.integration.spec.ts` that two accounts get two open tasks. Existing callers (`apps/agent/agent/tools/schedule_recheck.ts:41`, `apps/agent/test/tasks.integration.spec.ts:202,216,217`) pass no subject and keep the old behaviour.

## Finding 2: A 401-class send error sets `tokenError`. The "due now" refresh returns "Not due." and never clears it.
- **Severity:** Critical
- **Location:** Phase 4, section "Agent handler" step 7; Phase 2, section "Agent handler" steps 3-6; Phase 2, section "Shared package" (blocked reason precedence)
- **Flaw:** Phase 4 step 7 sets `account.tokenError` and books the refresh with `dueAt: now`. Phase 2 step 3 returns "Not due." when `tokenExpiresAt - now > refreshAheadMs` (12 h) and rebooks. Only step 4 (the due path) clears `tokenError`. `eligibility()` blocks on `tokenError` with "The Zalo token needs a reconnect." The refresh runs every 6 h; the token is inside 12 h of expiry only near its end.
- **Failure scenario:** Zalo returns one transient or misclassified 401-class error at hour 2 of a fresh token. The handler writes `tokenError`. The refresh task runs, sees 40 h left, returns "Not due." `tokenError` stays. Every composer in the workspace shows "The Zalo token needs a reconnect." for up to 36 h, or until an admin reconnects. Race variant: the visible lane runs six tasks at once. A refresh and a send run together. The send reads the old access token, the refresh writes new tokens and clears `tokenError`, then the send gets 401 with the old token and writes `tokenError` after the clear. Same outcome with valid tokens in the row.
- **Evidence:** `apps/agent/agent/lib/dispatch-config.ts:4-8` (`visible.concurrency: 6`), `apps/agent/agent/lib/dispatch.ts:53-61` (six direct tasks in flight). Plan quotes: Phase 2 step 3 "rebook ... and return 'Not due.'"; Phase 2 step 4 "clear `tokenError`, in one `update`"; Phase 4 step 7 "sets `account.tokenError` and books `message-token-refresh` with `dueAt: now`"; Phase 2 precedence "The Zalo token needs a reconnect.".
- **Suggested fix:** Make `tokenError != null` a "due" condition in step 3, or add `force: true` to `tokenRefreshPayload` and pass it from the 401 branch. On refresh success always clear `tokenError`. In the send handler, on a 401-class error re-read the account once; if `tokenRefreshedAt` moved after the send started, retry once with the new token before writing `tokenError`. Add a test: "401 with a fresh token books a refresh that actually refreshes".

## Finding 3: No `SENDING` state. A crash between the vendor call and the `SENT` write sends the text again.
- **Severity:** High
- **Location:** Phase 4, section "Agent handler" steps 3, 5, 6, 8, 9; Phase 2, section "Related Code Files" (`MESSAGING.send.maxAttempts`)
- **Flaw:** Step 3 guards on `status !== QUEUED`. The row stays `QUEUED` from step 5 (Zalo accepted) to step 6 (DB write). The task is completed only after the handler returns. `claimDue` re-leases an unfinished task after the lease and increments `attempts` up to the global `MAX_ATTEMPTS` (3). A thrown handler does not complete the task: `runDirect` catches, `reconcileDirect` calls `settle()`, which writes contact enrichment status and nothing on the task. `MESSAGING.send.maxAttempts` is dead config; `claimDue` reads only `MAX_ATTEMPTS`.
- **Failure scenario:** Zalo returns 200 for the send. The agent process restarts (deploy, OOM) or `db.message.update` throws (connection blip). The task stays leased for 6 min, then `claimDue` claims it again with `attempts = 2`. The row is still `QUEUED`. `runMessageSend` sends the same text again. The customer receives it two or three times. Each attempt beyond the first also spends a free-reply slot or 55 VND.
- **Evidence:** `apps/agent/agent/lib/tasks.ts:44-66` (re-lease when `leasedUntil < now`, `attempts < MAX_ATTEMPTS`), `apps/agent/agent/lib/dispatch.ts:24` and `apps/agent/agent/lib/dispatch-config.ts:7` (visible lease 6 min), `apps/agent/agent/lib/dispatch.ts:75-77,95-102` (throw path settles enrichment, never completes the task), `packages/db/src/agent-tasks.ts:32` (`MAX_ATTEMPTS = 3`). Plan quote: "`status !== QUEUED`: return 'Already settled.'" and "`MESSAGING.send.maxAttempts` stays for the task lease only."
- **Suggested fix:** Add `SENDING` to `MessageStatus`. Before the vendor call run `updateMany({ where: { id, status: QUEUED }, data: { status: SENDING } })`; count 0 means another attempt owns the row, return "Already claimed." A `SENDING` row older than `DISPATCH.visible.leaseMs` becomes `FAILED` with `errorCode = "unknown"` and the rep sees "Try again". Drop `MESSAGING.send.maxAttempts` or wire it to a per-row counter.

## Finding 4: A thrown message handler writes `enrichmentStatus = FAILED` on the contact.
- **Severity:** High
- **Location:** Phase 4, section "Writer: queueOutbound" step 3 (`messageSendRequested(message.id, thread.contactId, tx)`); Phase 4 and Phase 2, "Agent handler" rule "Never throw"
- **Flaw:** Message tasks carry `contactId`. Any throw from `handleDirect()` goes to `settle(task, FAILED, reason)`. `settle()` updates the contact when the guard matches. For an unfinished task the guard is `enrichmentStatus: RUNNING`. "Never throw" is a rule, not a guarantee: `db.message.update` on a row that the contact-delete cascade removed throws P2025; `completeTask` throws on a DB failure; a Zod parse of an unexpected vendor shape throws unless wrapped. After three attempts `retireExhausted` settles the contact with "Research was attempted several times and never completed."
- **Failure scenario:** An `identify` session is running on contact C (`enrichmentStatus = RUNNING`). A rep sends a Zalo reply to C. The send handler throws on `completeTask` during a DB failover. `settle()` sets C to `FAILED` with `enrichmentError = "<Prisma error text>"`. The record sheet shows a failed research run that never failed. The real session later cannot settle because the guard no longer matches RUNNING.
- **Evidence:** `apps/agent/agent/lib/dispatch.ts:95-102` (`reconcileDirect` → `settle`), `apps/agent/agent/lib/enrichment.ts:16-55` (writes `enrichmentStatus`, `enrichmentError` on the contact), `apps/agent/agent/lib/enrichment.ts:57-77` (guard = RUNNING for an unfinished task), `apps/agent/agent/lib/dispatch.ts:29-45` (`retireAbandoned` → `settle FAILED`), `apps/agent/agent/lib/tasks.ts:73-85`. Plan quote: "`agent.messageSendRequested(message.id, thread.contactId, tx)`".
- **Suggested fix:** Do not set `contactId` on `message-send` or `message-token-refresh` rows; the subject is the message id. If `contactId` must stay for the delete sweep at `contacts.service.ts:359`, make `reconcileDirect` skip kinds outside `["brand","portrait"]`. Wrap the handler body in one try/catch that writes `FAILED` on the `Message` row and completes the task with the error sentence.

## Finding 5: Delivery and seen receipts arrive before `externalId` is written. They are dropped with a 200.
- **Severity:** High
- **Location:** Phase 3, section "Writer service" (`receipt()`); Phase 4, section "Agent handler" step 6; Phase 2 schema (`Message` indexes)
- **Flaw:** The agent writes `externalId` after Zalo answers. Zalo emits `user_received_message` when the phone acks, often inside the same second, to the API in another process. `receipt()` finds no `OUTBOUND` row by `externalId`, returns `{ stored: false }`, and the controller answers 200. Zalo does not retry a 200. The receipt is lost. `Message` has `@@unique([threadId, externalId])` and no index on `externalId` alone; the lookup "on any thread of that account" scans the table twice per send.
- **Failure scenario:** A rep sends "Xin chao". Zalo returns `message_id` at t+300 ms. The phone is online; `user_received_message` reaches the API at t+350 ms. The agent writes `SENT` + `externalId` at t+420 ms. The receipt was already dropped. The bubble shows "Sent" forever. The Phase 4 manual check "see `READ` after the phone opens it" passes only when the customer opens the chat late. Under load the sequential scan on `message` adds latency to the webhook that must answer in 500 ms.
- **Evidence:** Plan quotes: Phase 3 "No row: return `{ stored: false }` and answer 200."; Phase 4 step 6 "Success: `status = SENT`, `sentAt`, `externalId = response message id`"; Phase 2 schema lines 158-160 (`@@unique([threadId, externalId])`, `@@index([threadId, queuedAt])`, `@@index([status])`, no `@@index([externalId])`). Zalo timing is fact C/E (unknown), so the plan cannot assume ordering. The existing `enqueue()` poke is fire-and-forget (`apps/api/src/agent/agent-trigger.service.ts:480-486`), so agent-side writes always trail the vendor response.
- **Suggested fix:** Persist unmatched receipts (a `MessageReceipt { accountId, externalId, kind, at }` row with a unique on `(accountId, externalId, kind)`), and have the send handler apply pending receipts when it writes `externalId`. Add `@@index([externalId])` on `Message`. Test: receipt before `SENT` still yields `DELIVERED`.

## Finding 6: No unlink. Undoing a wrong link needs a contact delete, which destroys the whole Zalo history.
- **Severity:** High
- **Location:** Phase 3, section "tRPC procedures" (`messaging.linkContact`), section "Contact delete"; Phase 2 schema (`ContactChannelIdentity.contactId onDelete: Cascade`, `MessageThread.contactId onDelete: SetNull`)
- **Flaw:** `linkContact` is refused when the identity already has a different contact. No `unlinkContact` exists. The only mutation that changes `identity.contactId` afterwards is `contacts.delete`, which cascades identity → thread → messages → activity. The email path has a recovery route: docs/api.md says a deleted contact is suppressed by address "or the sync recreates them from the next thread". Zalo has no equivalent: the next inbound recreates an empty Unmatched identity. `MessageThread.contactId onDelete: SetNull` is dead: the thread is already deleted through the identity cascade.
- **Failure scenario:** A rep links the OA user "Nguyen Van A" to the wrong contact. The rep sees the mistake. There is no button. The rep deletes the wrong contact to free the identity. Every message in that thread, the `MESSAGE` activity, and the identity are gone. The customer's next message opens a new Unmatched thread with no history. The plan's acceptance line "History stays" holds only for disconnect, not for the one recovery path a rep has.
- **Evidence:** `docs/api.md:212-215` ("A deleted contact is suppressed by address, or the sync recreates them"), `apps/api/src/contacts/contacts.service.ts:348-364` (hard delete, no soft delete). Plan quotes: Phase 2 line 98 "`onDelete: Cascade`" on `ContactChannelIdentity.contact`; Phase 2 line 118 "`onDelete: SetNull`" on `MessageThread.contact`; Phase 3 "Refused when the identity already has a different contact"; Phase 3 `messaging.service.ts` "(reads, link, mark read)".
- **Suggested fix:** Present to the user as a product decision. Option A: `ContactChannelIdentity.contactId onDelete: SetNull`, thread and activity `SetNull`; a deleted contact leaves an Unmatched thread; add `messaging.unlinkContact`. Option B: keep the cascade (PDPL erasure) and add `unlinkContact`, so a wrong link is fixed without deleting anything. Either way, `record-delete.spec.ts` must assert the chosen shape.

## Finding 7: Disconnect races an in-flight refresh. A disconnected account keeps live tokens and a new open refresh task.
- **Severity:** Medium
- **Location:** Phase 2, section "tRPC procedures" (`zalo.disconnect`); Phase 2, section "Agent handler" steps 2, 4, 6; Phase 2, section "OAuth" ("A second OA replaces the first")
- **Flaw:** The refresh handler checks `disconnectedAt` at step 2, calls Zalo, then writes tokens unconditionally at step 4 and rebooks at step 6. `disconnect` clears tokens and completes open tasks with `updateMany where finishedAt: null`. The handler's later `completeTask` is a no-op (count 0), but its token write and `scheduleTask` land after the disconnect. The callback's "replace the first OA" step clears tokens but does not complete the first OA's open refresh task.
- **Failure scenario:** The admin clicks Disconnect at t0. The refresh handler claimed its task at t0-2 s and is waiting on Zalo. At t0+1 s it writes fresh `accessToken` and `refreshToken` onto the row that `disconnect` just cleared, then books a new refresh task. The row now has `disconnectedAt` set and live tokens. `zalo-connection.spec.ts` "disconnect clears tokens" passes in isolation and fails in production. The acceptance line "Disconnecting the OA stops ... every token refresh" is false for one more cycle.
- **Evidence:** `apps/agent/agent/lib/tasks.ts:87-101` (`completeTask` returns null on count 0, no error), `apps/agent/agent/lib/tasks.ts:168-181` (`scheduleTask` creates a new row when none is open). Plan quotes: Phase 2 step 4 "Write both new tokens ... in one `update`, before anything else."; Phase 2 `zalo.disconnect` "completes open `message-token-refresh` tasks with outcome 'Disconnected'".
- **Suggested fix:** Step 4 becomes `updateMany({ where: { id, disconnectedAt: null }, data })`; count 0 returns "Disconnected." and skips the rebook. The callback's replace step completes the old OA's open refresh tasks in the same transaction. Test: disconnect during refresh leaves tokens null and no open task.

## Finding 8: The webhook's P2002 catch cannot tell the identity unique from the message unique. A real message is lost as "duplicate".
- **Severity:** Medium
- **Location:** Phase 3, section "Writer service" steps 2 and 4; section "Webhook controller" ("Duplicate `(threadId, externalId)`: the writer catches `P2002`")
- **Flaw:** The writer runs one transaction. Two unique constraints can raise P2002 inside it: `ContactChannelIdentity (channel, accountId, externalId)` and `Message (threadId, externalId)`. The plan catches P2002 and returns `{ stored: false, reason: "duplicate" }` → 200. Fact C is unknown; the plan itself says "Assume at-least-once and out-of-order". Two concurrent first events from one new user race the identity upsert. A caught error inside a Postgres transaction also leaves the transaction aborted; a callback that returns normally then issues COMMIT on an aborted transaction.
- **Failure scenario:** A new customer sends two texts in one second. Zalo delivers both webhooks in parallel. Both writers find no identity. Both insert. The second gets P2002 on the identity unique. The catch returns "duplicate". The controller answers 200. Zalo does not retry. The second text never lands. The thread shows one message; the customer sees no reply to the second.
- **Evidence:** Plan quotes: Phase 2 schema line 106 "`@@unique([channel, accountId, externalId])`"; Phase 2 schema line 158 "`@@unique([threadId, externalId])`"; Phase 3 step 4 "`P2002` on `(threadId, externalId)`: roll back and return `{ stored: false, reason: 'duplicate' }`"; Phase 3 Risk "Zalo retries an event the CRM already stored ... The controller answers 200." The existing writer pattern at `apps/api/src/mailbox/thread-writer.service.ts:257-290` uses `upsert` on a single unique and never catches P2002.
- **Suggested fix:** Inspect `error.meta.target` and treat only the message unique as a duplicate. Rethrow every other error so the controller answers 500 and Zalo retries. Prefer `createMany({ data: [message], skipDuplicates: true })` and check `count` instead of catching. Add a test that fires two first-messages concurrently and asserts two rows.

## Finding 9: `follow` and `unfollow` have no ordering guard. A replayed `follow` erases an `unfollow`.
- **Severity:** Medium
- **Location:** Phase 3, section "Writer service" (`follow(event)` / `unfollow(event)`); Phase 3, section "Verify before coding" fact C
- **Flaw:** `follow()` sets `followedAt = at` and clears `unfollowedAt`. `unfollow()` sets `unfollowedAt = at`. Neither compares `at` with the stored values. Fact C says to assume at-least-once and out-of-order until proven. Message events are deduped by id; identity events have no id and no guard.
- **Failure scenario:** A customer follows at 10:00 and unfollows at 10:05. Zalo redelivers the 10:00 `follow` at 10:06. `unfollowedAt` is cleared. The identity reads as followed. If a later phase uses `unfollowedAt` in `eligibility()` (the field exists for that purpose), a send goes to a user who left, and Zalo bills or rejects it.
- **Evidence:** Plan quotes: Phase 3 "`follow(event)` upserts the identity and sets `followedAt = at`, clears `unfollowedAt`. `unfollow(event)` sets `unfollowedAt = at`."; Phase 1 fact C "Assume at-least-once and out-of-order until proven otherwise". No test in Phase 3 covers a replayed `follow` after `unfollow`. The plan's own out-of-order mitigation (`lastMessageAt = max(current, sentAt)`, Phase 3 Risk Assessment) is applied to messages only.
- **Suggested fix:** Apply each identity event only when `at` is newer than both `followedAt` and `unfollowedAt` (`updateMany` with a `lt` guard). Add a test for replayed `follow` after `unfollow`.

### Verification Results

- **Tier:** Standard (Fact Checker + Contract Verifier)
- **Claims checked:** 46
- **Verified:** 41
- **Failed:** 3
- **Unverified:** 2

**Failures**

1. Phase 2 "Agent handler": "`scheduleTask()` is an idempotent upsert on `(kind, subject)`" — FAILED. `apps/agent/agent/lib/tasks.ts:138-148` has no `subject` input; dedupe is on `kind` + optional record ids (`tasks.ts:149-158`).
2. Phase 2 "Agent handler": "Use `subject: { path: ["accountId"], value: accountId }`" with `scheduleTask()` — FAILED. Not an accepted field. Only `enqueue()` in `apps/api/src/agent/agent-trigger.service.ts:372,389-396` accepts `subject`.
3. Phase 4 "Agent handler" step 8: "`MESSAGING.send.maxAttempts` stays for the task lease only" — FAILED. `claimDue` reads the global `MAX_ATTEMPTS` (`apps/agent/agent/lib/tasks.ts:2,54`; `packages/db/src/agent-tasks.ts:32`). No per-kind attempt limit exists.

**Unverified**

1. Phase 3 "Verify before coding": `@carbon/icons-react` exports `SendAlt` — UNVERIFIED. `node_modules` is not installed.
2. Phase 3 "Related Code Files": `activities.service.ts` "entry select adds `messageThread {...}`" — UNVERIFIED. The entry select shape was not traced beyond the two cited functions.

**Verified (sample)**

- `apps/api/src/agent/agent-trigger.service.ts:363` (`private async enqueue(`), `:410` (`dueAt: new Date()` hard-coded), `:429` (`if (!client) this.poke();`) — VERIFIED.
- `apps/agent/agent/lib/dispatch.ts:104` (`async function handleDirect`), `:149` fallthrough "The record this names is gone." — VERIFIED.
- `packages/db/prisma/schema.prisma:146` (`model Verification`, `id String @id`), `:178-186` (`enum ActivityType`), `:1077-1112` (`model Activity`, `emailThreadId String? @unique` with `onDelete: Cascade`) — VERIFIED.
- `apps/api/src/mailbox/thread-writer.service.ts:257` (`private async project(`) — VERIFIED.
- `apps/api/src/contacts/contacts.service.ts:348` (`async delete(`), `:359` (`tx.agentTask.deleteMany({ where: { contactId: id } })`) — VERIFIED.
- `ActivityStampService.targetsOf` / `touch` — VERIFIED at `apps/api/src/crm/activity-stamp.service.ts:27,89` (note: the caller's prompt cited `apps/api/src/activities/activity-stamp.service.ts`, which does not exist; the plan itself cites no path).
- `packages/db/package.json:8`, `packages/validation/src/index.ts:5`, `apps/api/src/config/env.validation.ts:73`, `turbo.json:47`, `apps/api/turbo.json:21,39`, `apps/agent/turbo.json:17,31`, `apps/agent/agent/lib/capabilities.ts:37`, `apps/app/lib/trpc/cache.ts:33`, `settings/connections/page.tsx:36,165`, `add-connection-dialog.tsx:45`, `slack-connection.service.ts:37,256`, `tracking.controller.ts:215`, `create-app.ts:15`, `app-icon-rail.tsx:50`, `activity-presentation.ts:15`, `activities.contracts.ts:14`, `activities.service.ts:100,248`, `search.router.ts:15`, `record-delete.spec.ts:123`, `contact-sheet.tsx:114,184`, `packages/telemetry/src/events.ts:81`, `mailbox-thread-writer.spec.ts:14`, `oauth-connection-page.tsx:21`, `rollup.service.ts:568` — all VERIFIED.
- `agent-trigger.stub.ts`, `slack-membership.integration.spec.ts`, `brand-logos/stripe.tsx`, `packages/auth/src/env.ts` pair pattern (`:47`) — VERIFIED.
- "Migration is additive" (enum `ADD VALUE` precedent): `packages/db/prisma/migrations/20260810120000_website_tracking/migration.sql` — VERIFIED.
- Phase 4 telemetry "`tasks_claimed` and friends already key by `TASK_KINDS`": `packages/telemetry/src/allowlist.ts:1,224-227` builds `TASK_KIND_SET` from `TASK_KINDS` — VERIFIED.
- Dispatch cron cadence: `apps/agent/agent/schedules/dispatch.ts:12` (`cron: "* * * * *"`), poke collapses with trailing catch-up (`apps/agent/agent/lib/pool.ts:1-31`) — VERIFIED; a missed poke costs up to 60 s, which breaks the 5 s acceptance line but is disclosed in the plan.

**Contract inventory (Contract Verifier)**

- `enqueue()` gaining optional `dueAt`: 9 call sites, all internal to `apps/api/src/agent/agent-trigger.service.ts` at lines 40, 48, 58, 66, 76, 85, 95, 144, 240. `withTasks` reaches it through line 144. Optional with default `new Date()` changes none.
- `scheduleTask()` gaining `subject`: 1 production caller `apps/agent/agent/tools/schedule_recheck.ts:41`; 3 test callers `apps/agent/test/tasks.integration.spec.ts:202,216,217`. None pass a subject.
- `TASK_KINDS` consumers: `packages/db/src/agent-tasks.ts:1,16`; `packages/telemetry/src/allowlist.ts:1,224`; `packages/telemetry/test/allowlist.spec.ts:4,131`. New kinds flow into telemetry automatically.
- `DIRECT_KINDS` / `isDirectKind` consumers: `apps/agent/agent/lib/dispatch.ts:15,55,160`; `apps/agent/agent/lib/tasks.ts:29`; `apps/agent/test/lanes.integration.spec.ts:3,9,10,102-106`; `apps/agent/test/tasks.integration.spec.ts:3,14`. The lanes test asserts five named kinds and does not pin the list length; no break. `docs/agent.md:52` lists only `brand`, `portrait` in the Visible lane and is already stale for `slack-people-match`, `slack-channel-join`, `agent-event`.
- `ActivityType` gaining `MESSAGE`: one exhaustive map `apps/app/lib/activity-presentation.ts:11` (`Record<ActivityType, ...>`), covered by Phase 3. Eight other importers use values non-exhaustively (`apps/agent/agent/lib/accounts.ts:1`, `run-runtime.ts:2`, `tools/research_company.ts:1`, `apps/api/src/activities/activities.service.ts:1`, `crm/enrichment-log.service.ts:1`, `dashboard/dashboard.service.ts:1`, `tracking/tracking-filing.service.ts:2`, `apps/api/test/mailbox-purge.spec.ts:2`).
- `Activity` gaining `messageThreadId`: `emailThreadId` has 5 references across 3 files (`google-connection.service.ts`, `thread-writer.service.ts`, `microsoft-connection.service.ts`); none need changes for a sibling column.
- Cascade chain on contact delete: `Activity.contactId onDelete: Cascade` (`schema.prisma`, Activity model) plus the planned `Activity.messageThreadId onDelete: Cascade` give two delete paths to the same activity row; `targetsOf({ contactId })` at `apps/api/src/crm/activity-stamp.service.ts:89-95` collects the `MESSAGE` activity's `companyId` for restamp. `AgentTask` rows with `contactId` are removed at `contacts.service.ts:359`; rows with `contactId = null` (unmatched threads) survive and complete on the "gone" fallthrough.

## Issues

1. BROKEN — `scheduleTask()` has no `subject`. A second OA's refresh task is overwritten by the first OA's. The new OA is never refreshed.
   Fix: not done. Add `subject` filtering and payload update to `scheduleTask()`. See Finding 1.
2. BROKEN — A 401-class error sets `tokenError`. The "due now" refresh returns "Not due." and never clears it. All sends block.
   Fix: not done. Treat `tokenError` as due, or add a `force` flag. See Finding 2.
3. RISK — No `SENDING` state. A crash after the vendor call re-sends the text on the next lease.
   Fix: not done. Add `SENDING` with a conditional `updateMany`. See Finding 3.
4. RISK — A thrown message handler writes `enrichmentStatus = FAILED` on the contact.
   Fix: not done. Drop `contactId` from message tasks or skip `settle()` for them. See Finding 4.
5. RISK — Receipts that arrive before `externalId` is written are dropped with a 200. `READ` never shows.
   Fix: not done. Persist unmatched receipts and reconcile on `SENT`. See Finding 5.
6. RISK — No unlink. The only recovery from a wrong link deletes all Zalo history.
   Fix: not done. Product decision between `SetNull` and an `unlinkContact` mutation. See Finding 6.
7. RISK — Disconnect races an in-flight refresh. Tokens are rewritten on a disconnected account.
   Fix: not done. Guard the token write on `disconnectedAt: null`. See Finding 7.
8. RISK — The P2002 catch drops a real message as "duplicate" on a concurrent identity insert.
   Fix: not done. Match on `meta.target`; rethrow the rest. See Finding 8.
9. RISK — Replayed `follow` clears `unfollowedAt`.
   Fix: not done. Guard identity events on `at`. See Finding 9.
10. NOT DONE — `docs/agent.md:52` "Two lanes" table lists two Visible kinds; `DIRECT_KINDS` has five. Phase 4 docs step adds two more to a stale table.
    Fix: not done. Phase 4 docs step should rewrite the table from `DIRECT_KINDS`.
11. UNKNOWN — `@carbon/icons-react` `SendAlt` export. `node_modules` is absent.
    Fix: not done. Verify at Phase 3 step 7 as the plan says.

Status: DONE_WITH_CONCERNS
Summary: Two Critical findings (scheduleTask has no subject; tokenError is never cleared after a 401) block the token-refresh design in Phases 2 and 4. Four High and three Medium findings cover double sends, cross-domain enrichment side effects, dropped receipts, irreversible links, and webhook races.

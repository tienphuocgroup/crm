---
phase: 4
title: "Outbound"
status: done
effort: "Medium. Send procedure, direct-lane send handler, composer, contact sheet tab, polling, telemetry, docs, tests."
priority: P1
dependencies: [3]
---

# Phase 4: Outbound

## Overview

This phase lets a rep reply. After it, a rep types a text reply in the inbox or on the contact sheet. The API checks eligibility, writes `Message(QUEUED)` and an `AgentTask(kind "message-send")` in one transaction through `withTasks()` and pokes dispatch after commit. The agent claims the row as `SENDING`, recomputes eligibility, calls Zalo once, and settles `SENT` or `FAILED`. The UI polls while `QUEUED` or `SENDING`. Outside the reply window the composer shows one sentence and no input. The phase closes with telemetry and the docs for the area.

Read before coding: `docs/api.md` (Intelligence never lives in the API, Freshness), `docs/agent.md` (Two lanes, Dispatch on demand), `docs/connections.md` ("Irreversible things are bounded in writing"), `docs/telemetry.md` (Adding a property), `docs/design.md`, `.agents/skills/eve`, `.agents/skills/nestjs-trpc`. Scout report sections 5, 7, 8. Brainstorm sections 5.1 (principles 3, 4, 7), 5.3 (`messages.send`), 5.4, 5.5 (Contact sheet, Composer), 5.6, 5.7.

## Verify before coding

Phase 1 answers these in `docs/messaging.md`. Read them first.

- Fact A: the reply window is already in `MESSAGING_POLICY`. Confirm the composer sentence names the same value.
- Fact E: consultation text send endpoint path, request shape, response shape, error shape, text length limit. They shape `zalo-client.sendText()` and `MESSAGING_POLICY.maxBodyLength`.
- Fact D: which HTTP status and error code Zalo returns for an expired or invalid access token, against rate limits and server errors. It decides `classifySendError()` in `zalo-errors.ts` (phase 2): which codes are the "401-class" that book a refresh, and which are transient.

## Requirements

- Functional: a rep sends a text reply from the inbox and from the contact sheet. The send is a row plus a task. The agent settles it. A blocked eligibility is refused in the API and again in the agent. A `FAILED` row shows a fixed error sentence and a "Try again" that queues a new row. A double-click or a repeated "Try again" with the same `clientRequestId` queues one row. Telemetry counts sends and errors. The docs for the area exist.
- Non-functional: zero sends leave the CRM outside the window or past the free-reply quota. A test asserts it at both layers. One vendor call per row, ever: a re-leased task never re-sends. Nest never calls Zalo to send. Telemetry carries no body, id or name. No vendor text reaches a column or the browser.

## Architecture

```
Rep ──► messaging.send (tRPC) ──► agent.withTasks((tx, queue) => writer.queueOutbound(tx, queue, input))
                                   eligibility() → Message(QUEUED) + queue.messageSendRequested()
                                   in one tx; withTasks() pokes after commit
                                        │
                              apps/agent dispatch, visible lane, handleDirect()
                              runMessageSend(): claim QUEUED → SENDING (updateMany, count 1 or stop)
                              → eligibility() → ZaloClient.sendText() once
                              → Message SENT (externalId) + apply MessageReceipt rows
                              | FAILED (errorCode, fixed errorMessage)
                              → thread.lastOutboundAt, account.lastOutboundAt
                              → 401-class: re-read account once, retry with a newer token,
                                else account.tokenError + refresh task now
                                        │
UI polls messaging.messages with refetchInterval while any row in view is QUEUED or SENDING
```

## Related Code Files

Create:

- `apps/agent/agent/lib/messaging/message-send.ts` (`runMessageSend(payload): Promise<string>`)
- `apps/app/components/crm/messaging/message-composer.tsx` (client)
- `apps/app/components/crm/messaging/composer-state.ts` (pure: `composerState(eligibility)`)
- `apps/app/components/crm/record-sheet/contact-messages-tab.tsx` (client; renders `ThreadView` and `MessageComposer` scoped to the contact)
- `docs/messaging.md` (phase 1 created it with the verified facts; this phase adds the rules)
- Tests listed below.

Modify:

- `apps/api/src/messaging/messaging-writer.service.ts` (`queueOutbound(tx, queue, { threadId, body, sentById, clientRequestId })`)
- `apps/api/src/messaging/messaging.service.ts` (`eligibilityFor(threadId)`, counts `outboundSinceLastInbound`)
- `apps/api/src/messaging/messaging.contracts.ts` (`sendInput = z.object({ threadId, body: z.string().trim().min(1).max(MESSAGING_POLICY.maxBodyLength), clientRequestId: z.string().uuid() })`)
- `apps/api/src/messaging/messaging.router.ts` (`messaging.send`, `messaging.eligibility`)
- `apps/api/src/agent/agent-trigger.service.ts` (`AgentTaskQueue` at line 113 gains `messageSendRequested(messageId, clientRequestId)`; `withTasks()` at lines 113-136 already owns the transaction, passes `tx` to `enqueue()` and pokes once after commit when anything was queued; the new method calls `enqueue()` with `required = true`, no `contactId`, no `companyId`, `subject: { path: ["clientRequestId"], value: clientRequestId }`, and the caller's `tx`; no `pokeAfterCommit()`, `poke()` at line 480 stays private [Red team 2026-09-16, findings 5, 13])
- `apps/agent/agent/lib/messaging/zalo-client.ts` (`sendText(accessToken, userId, body)` from fact E; Zod success and error shapes)
- `apps/agent/agent/lib/messaging/zalo-errors.ts` (`classifySendError()` from fact D; phase 2 created the file)
- `apps/agent/agent/lib/dispatch.ts` (`handleDirect()` gains the `message-send` branch)
- `apps/api/src/messaging/zalo/zalo-webhook.controller.ts` (replace the phase 3 warn log with `messagingError({ error, stage: "webhook" })`)
- `apps/api/src/telemetry/rollup.service.ts` (properties below, beside `threads_ingested` at line 568)
- `packages/telemetry/src/allowlist.ts`, `packages/telemetry/src/events.ts` (`messagingError()` builder beside `syncError` at line 81; `permittedStage()`)
- `apps/app/components/crm/messaging/thread-view.tsx` (mount `MessageComposer` under the list; poll while a `QUEUED` or `SENDING` row is in view)
- `apps/app/components/crm/messaging/message-bubble.tsx` (states `QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` with the fixed error sentence and "Try again")
- `apps/app/components/crm/record-sheet/contact-sheet.tsx` (tab `messages` after `activity` at lines 114-139; header `Message` button beside `Email` at line 184 when `threadByContact` returns a thread; the button opens the tab)
- `apps/app/components/crm/timeline/message-thread-entry.tsx` ("Open messages" now opens the contact sheet Messages tab)
- `apps/app/lib/trpc/cache.ts` (`messaging()` also invalidates `messaging.eligibility`)
- `docs/api.md`, `docs/agent.md`, `docs/connections.md`, `docs/environment.md`, `docs/telemetry.md`, `AGENTS.md` (see Docs)

## tRPC procedures (`messaging` router, added)

| Procedure | Kind | Input | Returns | Notes |
| --- | --- | --- | --- | --- |
| `messaging.eligibility` | query | `{ threadId }` | `Eligibility` | Loads `thread.lastInboundAt`, `account.disconnectedAt`, `account.tokenError`, counts `outboundSinceLastInbound`. Calls `eligibility()` with `now` |
| `messaging.send` | mutation | `sendInput` | `{ messageId, status }` | Refuses with 422 and the blocked sentence unless `free-text`. Writes the row and the task in one transaction through `agent.withTasks()`. A repeated `clientRequestId` returns the existing row with its current status and queues nothing |

## Writer: `queueOutbound`

`MessagingService.send()` calls `agent.withTasks((tx, queue) => writer.queueOutbound(tx, queue, input))`. `withTasks()` at `apps/api/src/agent/agent-trigger.service.ts:113-136` owns the transaction and pokes after commit. Inside it:

1. Find an `OUTBOUND` row on the thread with this `clientRequestId` (`Message.clientRequestId` with `@@unique([threadId, clientRequestId])`, from the phase 2 schema). Found: return it. A double-click or a repeated "Try again" is one row. [Red team 2026-09-16, finding 8]
2. Load the thread with identity and account. Count `outboundSinceLastInbound`. Compute `eligibility()`. Blocked: throw `UnprocessableEntityException(reason)`. `DomainErrorMiddleware` maps it.
3. Insert `Message { direction: OUTBOUND, status: QUEUED, kind: TEXT, body, sentById, clientRequestId, queuedAt: now }`.
4. `queue.messageSendRequested(message.id, clientRequestId)` with `payload: { messageId }`, `priority: PRIORITY.messageSend`, `budget: 0`, `reason: "A rep replied on Zalo."`. No `contactId` on the task (phase 2 "Task kinds").
5. Update the thread: `messageCount + 1`, `lastMessageAt = now`. Update the activity subject to the new snippet. Do not touch `lastActivityAt`; a rep's own reply is not customer activity.
6. `withTasks()` commits and pokes.

## Agent handler

`handleDirect()` in `apps/agent/agent/lib/dispatch.ts` gains:

```ts
if (task.kind === "message-send") {
  await completeTask(task.id, await runMessageSend(task));
  return;
}
```

`runMessageSend(task)`. The whole body sits in one `try`/`catch`. The `catch` writes `FAILED` with `errorCode = "internal"` on the row when it can and returns "The send failed inside the CRM." A throw out of a direct handler reaches `reconcileDirect()` at `apps/agent/agent/lib/dispatch.ts:95-102`, and a re-leased task would call Zalo again. [Red team 2026-09-16, findings 4, 5]

1. Parse with `parse(schemas.messaging.sendPayload, task.payload, "A message-send task carries an unreadable payload")`.
2. Load `Message` with thread, identity and account through `zalo-connection.ts`. Missing row: return "The message this names is gone."
3. Claim: `updateMany({ where: { id, status: QUEUED }, data: { status: SENDING } })`. `count === 0`: return "Already claimed." The row is `SENDING`, `SENT` or `FAILED` from an earlier lease. `claimDue` at `apps/agent/agent/lib/tasks.ts:44-66` re-leases an unfinished task after `DISPATCH.visible.leaseMs` up to `MAX_ATTEMPTS`; without this claim the second lease sends the text again. [Red team 2026-09-16, finding 4]
4. Recompute `eligibility()` from `@crm/db/messaging` with `now` and a fresh `outboundSinceLastInbound` count that excludes this row. Blocked: set `FAILED`, `failedAt`, `errorCode = "ineligible"`, `errorMessage = reason`. Return the reason. This is the second gate. It never calls Zalo.
5. Call `sendText(account.accessToken, identity.externalId, body)` with `AbortSignal.timeout(MESSAGING.zalo.requestTimeoutMs)`.
6. Success: in one transaction set `status = SENT`, `sentAt`, `externalId = response message id`; then find `MessageReceipt` rows for `(accountId, externalId)`, apply each (`delivered` sets `deliveredAt` and `status = DELIVERED`, `seen` sets `readAt` and `status = READ`) and delete them. Update `thread.lastOutboundAt`, `account.lastOutboundAt`. Return "Sent." [Red team 2026-09-16, finding 7]
7. Vendor error: `classifySendError()` gives `{ code, terminal }`. Write `FAILED`, `failedAt`, `errorCode = code`, `errorMessage = sentenceFor(code)`. Vendor text goes to the log object's `error` field only. A 401-class code first re-reads the account once; when `tokenRefreshedAt` moved since step 2, retry step 5 once with the newer token (the visible lane runs six tasks at once and a refresh can land mid-send). Still 401: set `account.tokenError = sentenceFor(code)` with the `disconnectedAt: null` guard and book `message-token-refresh` with `dueAt: now` through `scheduleTask()` with the account `subject`. The refresh handler treats a set `tokenError` as due (phase 2 step 3). Emit `messagingError({ error, stage: "send" })`. [Red team 2026-09-16, finding 2]
8. Network error or timeout: same as 7 with `errorCode = "network"` and `errorMessage = "Zalo did not answer."`. No automatic retry in v1: Zalo has no idempotency key on sends, and a retry after a timeout that Zalo accepted is a duplicate on the phone. The rep sees "Try again" and decides.
9. Stale sweep: before returning, delete `MessageReceipt` rows for the account older than `MESSAGING.receipts.staleAfterMs`. One cheap `deleteMany`.
10. Never throw. Return one sentence for `AgentTask.outcome`.

## UI

- `composerState(eligibility)` is pure and returns `{ mode: "free-text", note } | { mode: "blocked", reason }`. `note` is "Free replies until {windowClosesAt}. {repliesLeft} left in this window. After that Zalo charges per message and this CRM does not send." Drop the middle sentence if fact A removed the quota. `windowClosesAt` renders in the rep's locale through the existing date helper. `blocked` shows the reason and no input (`docs/connections.md` "Irreversible things are bounded in writing").
- `MessageComposer` reads `messaging.eligibility` and renders by `composerState`. Textarea max length is `MESSAGING_POLICY.maxBodyLength`. Enter sends, Shift+Enter is a newline. Sending generates one `clientRequestId` with `crypto.randomUUID()`, disables the input until the mutation settles, calls `messaging.send`, appends an optimistic `QUEUED` bubble, then `cache.messaging()`.
- `ThreadView` sets `refetchInterval: MESSAGING_UI.queuedPollMs` on `messaging.messages` while any row in view is `QUEUED` or `SENDING` (`docs/api.md` "Background writes need polling"). Stops when none is.
- `MessageBubble`: `QUEUED` and `SENDING` show a muted "Sending". `SENT`, `DELIVERED`, `READ` show a one-word status. `FAILED` shows `errorMessage`, which is always a fixed sentence from `sentenceFor()`, and "Try again", which calls `messaging.send` with the same body and a new `clientRequestId`. A 422 from `send` shows the blocked sentence inline.
- Contact sheet: tab `messages` renders `ContactMessagesTab`. No thread: "No Zalo chat yet. The customer starts it by messaging the OA." A thread: `ThreadView` plus `MessageComposer`. The header `Message` button appears when a thread exists and opens the tab.
- All components from `packages/ui`. No `className` overrides. Client components receive finished data.

## Telemetry

Add to `ALLOWED_PROPERTIES` and to `docs/telemetry.md`, per "Adding a property":

- `install_daily`: `zalo_connected` (boolean, one connected ZALO account exists), `messages_inbound_7d`, `messages_outbound_7d`, `messages_failed_7d`, `messaging_threads_bucket`, `messaging_unmatched` (count). Counts only. Never a body, an id or a name. `activities_by_type.MESSAGE` already flows through `rollup.service.ts:551-554` because the map keys by `Object.values(ActivityType)`; document that row too. [Red team 2026-09-16, finding 15]
- Event `messaging_error` with `error_class` and `stage`. `permittedStage()` constrains `stage` to `webhook | send | token`; anything else is `other`. Emitted by the webhook controller, `message-send.ts` and `message-token-refresh.ts`.
- `install_daily` `tasks_claimed` and friends already key by `TASK_KINDS`, so the two new kinds count with no change.

## Docs

- `docs/messaging.md`: the rules for the area. One section per rule: the API is the HTTP boundary and the writer is the only writer; the agent talks to Zalo; the row is the message and a row is sent once (`SENDING` claim, `clientRequestId`); eligibility is computed twice from one pure function; token refresh is a task and a set `tokenError` makes it due; vendor errors are codes and fixed sentences, never vendor text; identity is opaque and per account, a link is undone with unlink, a contact delete unlinks and keeps the history, a person is erased with delete conversation; bounded in writing; optional and never throws; bodies are personal data (never logged, never in telemetry, erased by delete conversation). Keep the phase 1 sections "Verified Zalo facts" and "Product decisions". Add "What is out of scope" with the plan.md sentence.
- `AGENTS.md`: one index row "Messaging: the Zalo OA, the inbox, threads, the webhook, sends" → `docs/messaging.md`, beside the tracking row at line 16.
- `docs/connections.md`: a Zalo section. Token health leads the page. Unmatched count. Connect and disconnect are owner or admin. The OA replaces on a second connect. Unlink and delete conversation are owner or admin.
- `docs/api.md`: a Messaging paragraph. `MessagingWriterService` is the only writer. The webhook rules. Line 31-32 names the exchange-rate fetcher as the one vendor client exception; rewrite it to name two: the fetcher and the Zalo OAuth exchange with the OA profile read. Slack's OAuth is Better Auth in `packages/auth`, not an API exception. One new line under "Deleting a record": a deleted contact's Zalo thread returns to Unmatched with its history; `deleteThread` is the erasure.
- `docs/agent.md`: the Two lanes table at line 52 lists `brand`, `portrait` and is already stale (`DIRECT_KINDS` holds five kinds today). Rewrite the Visible row from `DIRECT_KINDS` plus the two new kinds. The Priority line gains `messageSend` 950 and `messageToken` 940. [Red team 2026-09-16, finding 15]
- `docs/environment.md`: rows for `ZALO_APP_ID`, `ZALO_APP_SECRET` and, if it exists, `ZALO_OA_SECRET_KEY` under "Optional: what the agent can do".
- `docs/telemetry.md`: rows for every new property and the `messaging_error` event. Add message bodies and Zalo ids to "What is never sent".

## Tests (bun:test)

- `apps/api/test/messaging-send.spec.ts` (real DB, `TEST_RUN_ID` suffix, `agent-trigger.stub.ts` pattern): `queueOutbound` writes `Message(QUEUED)` and one `AgentTask(kind "message-send")` with no `contactId` in one transaction; a second send with a new `clientRequestId` is a second row; the same `clientRequestId` twice is one row and one task; a closed window is refused with 422 and the sentence, and writes nothing; the ninth reply in a window is refused when the quota exists; a disconnected account is refused; `eligibility` returns `free-text` with `repliesLeft` inside the window.
- `apps/agent/test/message-send.integration.spec.ts` (stub `globalThis.fetch` as `apps/agent/test/slack-membership.integration.spec.ts` does): SENT path writes `externalId` and both `lastOutboundAt`; a `MessageReceipt` written before the send is applied and deleted on `SENT`; running the handler twice on one row calls fetch once and the second run returns "Already claimed."; a `SENDING` row from an earlier lease is never re-sent; vendor error path writes `FAILED` with the code and a fixed sentence, never the vendor text; 401-class error re-reads the account and retries once when the token moved; still-401 sets `tokenError` and books a refresh due now with the account subject; ineligible path never calls fetch; a handler that throws inside settles the row `FAILED` and never touches `enrichmentStatus`; missing row completes with the sentence; already settled row is untouched.
- `apps/agent/test/zalo-client.spec.ts`: extend for `sendText` success and error shapes and `classifySendError`.
- `apps/app/test/composer-state.spec.ts` (create, beside the phase 3 file): both modes and their sentences; `windowClosesAt` and `repliesLeft` appear in the note.
- `packages/telemetry/test/allowlist.spec.ts` (extend; `apps/api/test/telemetry-rollup.spec.ts` does not exist): the new properties are in the allowlist; `messaging_error` drops an unknown stage to `other`.

## Implementation Steps

1. Read `docs/messaging.md` facts A, D and E.
2. Add `sendText` to `zalo-client.ts` and its test.
3. Add `queueOutbound`, `eligibilityFor`, `sendInput`, the two procedures and `messageSendRequested` on `AgentTaskQueue`. Run `bun run check-types`.
4. Build `message-send.ts` and the `handleDirect()` branch. Write the integration test.
5. Build `composer-state.ts`, `message-composer.tsx`, the bubble states, the polling, `contact-messages-tab.tsx`, the contact sheet tab and button, the timeline entry target.
6. Telemetry: allowlist, `messagingError()`, rollup properties, the three emit sites.
7. Write `docs/messaging.md` rules. Update `AGENTS.md`, `docs/connections.md`, `docs/api.md`, `docs/agent.md`, `docs/environment.md`, `docs/telemetry.md`.
8. Run the tests above, then `bun run lint`, `bun run check-types`, `bun run build`.
9. Manual check on the sandbox OA: reply from the inbox, see the bubble go `QUEUED` then `SENT`, see the text on the phone within 5 s, see `READ` after the phone opens it, reply from the contact sheet, wait past the window on a test thread and see the composer blocked.

## Success Criteria

- [ ] A reply inside the window reaches the phone within 5 s. 95% of queued sends settle within 30 s. (needs sandbox OA)
- [x] Outside the window or past the quota the composer shows one sentence and no input. `send` returns 422. The agent test proves the second gate never calls fetch.
- [x] One row is sent once. The agent test proves a second lease never calls fetch. A repeated `clientRequestId` queues one row. The UI holds one `clientRequestId` in a lease until the mutation settles (`requestIdLease()` in `apps/app/lib/messaging.ts`, tested), so a double submit reaches the server's unique-index guard with one id.
- [x] A 401-class vendor error retries once with a newer token, then sets `tokenError` and books a refresh due now. The refresh runs and clears it. The card shows "Needs a reconnect" only while the error stands. The composer blocks with "The Zalo token needs a reconnect."
- [x] No vendor text is stored or shown. A test asserts `errorMessage` and `tokenError` are fixed sentences.
- [x] Nest never calls Zalo to send. `grep -r "zalo" apps/api/src` matches only the OAuth service, the webhook and the schema files.
- [x] `install_daily` carries the new counts. `messaging_error` carries `error_class` and `stage` only.
- [x] `docs/messaging.md` exists with rules, verified facts and product decisions. The `AGENTS.md` index row points at it (line 17; unrelated pre-existing pollution below it is not part of this feature).
- [x] `check-types`, `lint` and the listed tests pass. (`bun run build` not run: the user runs builds by hand.)

## Risk Assessment

- RISK: A reply storm outside the window or past the quota costs 55 VND each. Mitigation: two gates on one pure function. A test asserts zero vendor calls when blocked.
- RISK: `enqueue()` inside the caller's transaction skips the poke (line 429). A send waits for the cron. Mitigation: `withTasks()` pokes once after commit when anything was queued (line 134). The test asserts the task row exists; the manual check asserts the latency.
- RISK: A re-leased task or a crash after Zalo's 200 sends the text twice. Mitigation: the `QUEUED` to `SENDING` claim is one `updateMany` with a count check. A row is `SENDING` between the claim and the vendor answer, and a second lease stops at "Already claimed."
- RISK: A thrown handler settles `enrichmentStatus = FAILED` on the contact through `reconcileDirect()`. Mitigation: message tasks carry no `contactId` and the handler body sits in one try/catch.
- RISK: The optimistic bubble and the polled row show twice. Mitigation: the optimistic row carries the returned `messageId` and is replaced on the next fetch.
- RISK: A rep hits "Try again" on a blocked thread. Mitigation: "Try again" calls `send`, which recomputes eligibility and returns 422 with the sentence.
- RISK: A double-click queues two rows and two sends. Mitigation: `clientRequestId` is unique per thread; the second call returns the first row.
- RISK: The Zalo error shape differs from fact E at runtime. Mitigation: the Zod error schema is loose on unknown keys and strict on `error` and `message`. A parse failure is `errorCode = "unparsed"` and a `messaging_error`.

## Rollback

- Code: revert the merge. Phase 3 inbound keeps working. Open `message-send` tasks fall through `handleDirect()` to "The record this names is gone." and complete.
- Data: `QUEUED` and `SENDING` rows left behind stay as they are. The inbox shows "Sending" until the rows are settled by hand or the merge returns. A `SENDING` row is never re-sent by the returned code; the claim already happened.

## Outcome — 2026-09-21

Reports: `from-fullstack-developer-to-orchestrator-phase-04-backend-implementation-report.md`,
`from-code-reviewer-to-orchestrator-phase-04-backend-review-report.md`,
`from-fullstack-developer-to-orchestrator-phase-04-review-fixes-report.md`,
`from-fullstack-developer-to-orchestrator-phase-04-ui-and-docs-implementation-report.md`,
`from-code-reviewer-to-orchestrator-phase-04-ui-and-docs-review-report.md`.

Deviations landed here: `SENDING` rows interrupted by a crash settle `FAILED` with
`errorCode "interrupted"` on re-lease (review finding H2); a throw after Zalo's 200 settles
`SENT` with no `externalId`, not `FAILED` (review finding H1); `profileCheckedAt` column added
via a second migration `20260921221500_messaging_profile_checked`, plus the
`message-identity-profile` task, to cap the vendor read at one per person (review finding H3);
422 maps to `UNPROCESSABLE_CONTENT`, not `INTERNAL_SERVER_ERROR`; composer and message poll at
2s/10s. The UI-and-docs review findings 2 to 5 are fixed in
`from-fullstack-developer-to-orchestrator-phase-04-ui-review-fixes-report.md`: the
`clientRequestId` is held in a lease until the mutation settles, so a double submit sends one id;
`threadByContact` is gated on a connected OA; the helper tests exist; the composer-state spec pins
the catalog placeholders. Finding 1 (the 258-line block at the end of `AGENTS.md`) predates this
work and is the user's own uncommitted edit, not this feature's.

Gate: `apps/api` 481, `apps/agent` 395, `packages/db` 133, `packages/telemetry` 67,
`packages/validation` 5, `apps/app` 209 (all after the last fix pass).

Fact A is re-verified 2026-09-22 against the official Zalo hub. Free replies inside the 48-hour
window are unlimited. The reply quota is removed from the policy, both gates, the composer note
and the catalogs. The 48-hour window block stays.

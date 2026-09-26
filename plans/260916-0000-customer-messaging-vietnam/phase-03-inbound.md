---
phase: 3
title: "Inbound"
status: done
effort: "Large. Webhook, writer service, identities, MESSAGE activity, inbox, linking, unread count, timeline, delete cascade, tests."
priority: P1
dependencies: [2]
---

# Phase 3: Inbound

## Overview

This phase makes a customer's Zalo message appear in the CRM. After it, a text, image, file or sticker sent to the OA is a `Message` row on a `MessageThread`, one `MESSAGE` activity sits on the contact timeline, and `/messages` lists every thread. An unmatched Zalo user is visible and a rep links or creates the contact. No reply flows yet. Phase 4 adds outbound.

Read before coding: `docs/api.md` (Logging, tRPC, Freshness, Deleting a record), `docs/connections.md` (Identity matching), `docs/design.md`, `.agents/skills/nestjs-trpc`, `.agents/skills/nuqs`, `.agents/skills/shadcn`. Scout report sections 2, 8, 11. Brainstorm sections 5.2, 5.3 (webhook, writer), 5.5 (Inbox, Timeline).

## Verify before coding

Phase 1 answers these in `docs/messaging.md`. Read them first.

- Fact B: signature header name, HMAC input order, which secret. It shapes `zalo-signature.ts`.
- Fact C: retry policy and ordering. It confirms the dedupe rule below.
- Fact E: event payload shapes for the eight events. They shape `zalo-webhook.schema.ts`.
- Phase 1 row 5: the webhook URL is registered and the API is reachable over HTTPS.
- UNKNOWN: whether `@carbon/icons-react` exports `SendAlt`. `Chat` is taken by the agent chat. Check the export before naming the nav icon. `node_modules` was not installed when this plan was written.

## Requirements

- Functional: the eight events from brainstorm 5.3 are parsed. Inbound events become rows. Follow and unfollow update the identity, newest event wins. Delivery and seen events update outbound rows by Zalo message id when one exists, and are kept as `MessageReceipt` rows when none exists yet. The inbox lists threads with Needs reply and Unmatched filters. A rep links a thread to a contact or creates one. A rep with the connections role unlinks a thread or deletes it. Mark read clears `unreadCount`. The nav shows the unread count. The timeline shows one `MESSAGE` entry per thread and a `messages` filter. Deleting a contact unlinks its identities and threads; the Zalo history survives under Unmatched. Deleting a conversation erases it.
- Non-functional: the webhook answers in under 500 ms. Idempotent on replay. A bad signature is 401. A valid event for an unknown or disconnected OA is 200 and written nowhere. A write that fails for any reason other than a duplicate message id is 500, so Zalo retries. Bodies are never logged. Attachment URLs are `https` on an allowlisted host or the event is refused.

## Architecture

```
Zalo user ──► Zalo OA ──webhook──► POST /api/messaging/zalo/webhook (Nest, raw body, HMAC)
                                        │ verify → parse (Zod, discriminated on event_name)
                                        │ map → IncomingChannelMessage | IdentityEvent | ReceiptEvent
                                        ▼
                               MessagingWriterService  (the only writer)
                               store(): identity upsert → thread upsert → message insert
                                        → Activity(MESSAGE) project → ActivityStampService.touch()
                               follow()/unfollow(): identity.followedAt / unfollowedAt, only when newer
                               receipt(): outbound row deliveredAt / readAt by externalId
                                          no row yet → MessageReceipt row, applied by phase 4 on SENT
                                        │
UI: /messages inbox (threads, thread view, link, create, mark read); nav badge polls unreadCount
```

## Related Code Files

Create:

- `apps/api/src/messaging/incoming-message.ts` (the domain types the webhook produces: `IncomingChannelMessage { channel, accountExternalId, senderExternalId, displayName?, avatarUrl?, kind, body?, attachments?, externalId, sentAt }`, `IdentityEvent { channel, accountExternalId, senderExternalId, kind: "follow" | "unfollow", at }`, `ReceiptEvent { channel, accountExternalId, externalId, kind: "delivered" | "seen", at }`; `attachments` schema `z.array(z.object({ url: z.url({ protocol: /^https$/, hostname: attachmentHost }), name: z.string().max(200).optional(), size: z.number().int().nonnegative().optional() }))` where `attachmentHost` matches a host in `MESSAGING_POLICY.zalo.attachmentHosts` or a subdomain of one; `z.string().url()` on zod 4 accepts `javascript:` and `data:` and any host, and the rep's browser fetches whatever is stored [Red team 2026-09-16, finding 11])
- `apps/api/src/messaging/messaging-writer.service.ts` (the only writer of `ContactChannelIdentity`, `MessageThread`, `Message`, `MessageReceipt` and the `MESSAGE` activity; phase 4 adds `queueOutbound()` here)
- `apps/api/src/messaging/messaging.service.ts` (reads, link, unlink, delete thread, mark read)
- `apps/api/src/messaging/zalo/zalo-raw-body.ts` (`rawBody(request, limit)`: reads the stream only; when `request.body` is already populated it throws, because the signature must cover the wire bytes and `read()` in `apps/api/src/tracking/tracking.controller.ts:206-212` re-serialises a parsed object instead; the test constructs the app through `createApp()` so the check runs on real bytes [Red team 2026-09-16, finding 12])
- `apps/api/src/messaging/messaging.contracts.ts` (Zod inputs)
- `apps/api/src/messaging/messaging.router.ts` (alias `messaging`, `@UseMiddlewares(AuthMiddleware)`)
- `apps/api/src/messaging/zalo/zalo-webhook.controller.ts` (`POST /api/messaging/zalo/webhook`, `@AllowAnonymous()`)
- `apps/api/src/messaging/zalo/zalo-webhook.schema.ts` (Zod discriminated union on `event_name`: `user_send_text`, `user_send_image`, `user_send_file`, `user_send_sticker`, `follow`, `unfollow`, `user_received_message`, `user_seen_message`; shapes from fact E)
- `apps/api/src/messaging/zalo/zalo-signature.ts` (HMAC over the raw body per fact B, `timingSafeEqual`)
- `apps/app/app/(app)/[slug]/messages/page.tsx` (server page; fetches `zalo.status`; renders the inbox or the pre-connect state)
- `apps/app/app/(app)/[slug]/messages/messages-inbox.tsx` (client; two panes)
- `apps/app/app/(app)/[slug]/messages/messages-search-params.ts` (nuqs: `filter`, `thread`)
- `apps/app/components/crm/messaging/thread-list.tsx`, `thread-view.tsx`, `message-bubble.tsx`, `link-contact-dialog.tsx`
- `apps/app/components/crm/timeline/message-thread-entry.tsx`
- Tests listed below.

Modify:

- `apps/api/src/messaging/messaging.module.ts` (register the controller, the writer, the service, the router)
- `apps/api/src/activities/activities.contracts.ts` (`TIMELINE_FILTERS` at line 14 gains `"messages"`)
- `apps/api/src/activities/activities.service.ts` (`timelineCounts()` at line 100 and `filterClause()` at line 248 gain `messages`; the entry select adds `messageThread { id, messageCount, lastMessageAt, unreadCount, identity { displayName } }`)
- `apps/api/src/contacts/contacts.service.ts` (`delete()` at line 348 gains one statement inside the transaction, before `tx.contact.delete` at line 361: `tx.activity.updateMany({ where: { contactId: id, type: "MESSAGE" }, data: { contactId: null, companyId: null } })`; `Activity.contactId` cascades from the contact at `schema.prisma:1090` and would take the thread's timeline entry with it while the thread survives; the identity and thread FKs are `SetNull` and need no statement; `ActivityStampService` lives at `apps/api/src/crm/activity-stamp.service.ts`) <!-- Updated: Validation Session 1 - contact delete is SetNull, not cascade -->
- `apps/app/app/(app)/[slug]/contacts/create-contact-sheet.tsx` (today `CreateContactSheet` at line 45 takes `{ companyId? }` only and on success at lines 79-91 closes itself and calls `openRecord()`; it gains `initialFirstName?`, `initialLastName?`, `onCreated?(contactId)` and `openRecordOnSuccess?` default `true`; the one existing caller `contacts/page.tsx:35` passes nothing new and keeps its behaviour [Red team 2026-09-16, finding 10])
- `apps/app/components/app-icon-rail.tsx` (item `Messages`, `href: "/messages"`, icon `SendAlt`, `match: "prefix"`, beside line 50; badge from `messaging.unreadCount` polled every 30 s)
- `apps/app/components/crm/timeline/timeline.tsx` (tab `messages`, label "Messages", empty state "No messages. Zalo chats with this person show up here once the OA is connected.")
- `apps/app/components/crm/timeline/timeline-entry.tsx` (renders `MessageThreadEntry` when `entry.messageThread` exists, beside the `emailThread` branch)
- `apps/app/components/crm/timeline/timeline-search-params.ts` (`messages` tab)
- `apps/app/lib/activity-presentation.ts` (`MESSAGE: { icon: SendAlt, label: "Message" }` beside `EMAIL` at line 15)
- `apps/app/lib/trpc/cache.ts` (`messaging(options)` invalidates `messaging.threads.pathKey()`, `messaging.messages.pathKey()`, `messaging.threadByContact`, `messaging.unreadCount`, `zalo.status`; `contact(id)` also invalidates `messaging.threadByContact`; `removed(ref)` also invalidates `messaging.threads.pathKey()`)
- `apps/app/app/(app)/[slug]/settings/connections/zalo/page.tsx` ("Last message arrived" and "unmatched people" now carry live values; the unmatched count links to `/messages?filter=unmatched`)

## tRPC procedures (`messaging` router)

One alias, camelCase methods. The brainstorm's `threads.list` is `messaging.threads`, `messages.list` is `messaging.messages`.

| Procedure | Kind | Input | Returns | Notes |
| --- | --- | --- | --- | --- |
| `messaging.threads` | query (infinite, `pathKey()`) | `{ cursor?, limit?, filter: "all" \| "needsReply" \| "unmatched" }` | `{ rows, nextCursor, counts: { needsReply, unmatched } }` | Sorted by `lastMessageAt desc`. `needsReply` is `unreadCount > 0`. `unmatched` is `contactId = null`. Prisma filters only. Row carries `identity.displayName`, `identity.avatarUrl`, `contact { id, firstName, lastName }`, last snippet, `unreadCount` |
| `messaging.threadByContact` | query | `{ contactId }` | `{ thread: {...} \| null }` | One OA in v1, so at most one thread |
| `messaging.unreadCount` | query | none | `{ count }` | The nav badge. Sum of `unreadCount`. One cheap aggregate |
| `messaging.messages` | query (infinite) | `{ threadId, cursor?, limit? }` | `{ rows, nextCursor }` | Oldest first inside a page. Page size from `MESSAGING_API.messages.pageSize` |
| `messaging.linkContact` | mutation | `{ threadId, contactId }` | `{ ok: true }` | Sets `identity.contactId`, `thread.contactId`, `thread.companyId` from the contact, moves the activity to the contact and company, `stamp.touch()`. Refused when the identity already has a different contact; the rep unlinks first |
| `messaging.unlinkContact` | mutation | `{ threadId }` | `{ ok: true }` | `assertMember` then `canManageConnections`. Sets `identity.contactId`, `thread.contactId`, `thread.companyId` and the activity's `contactId` and `companyId` to null. The thread returns to Unmatched. A rep must not have to delete a contact to undo a wrong link [Red team 2026-09-16, finding 9] |
| `messaging.deleteThread` | mutation | `{ threadId }` | `{ ok: true }` | `assertMember` then `canManageConnections`. Deletes the `ContactChannelIdentity`; the thread, messages and activity cascade. This is the one erasure path for any Zalo person, matched or not; a contact delete keeps the history. Logged with one object and the thread id only |
| `messaging.markRead` | mutation | `{ threadId }` | `{ ok: true }` | `unreadCount = 0` |

`src/generated/server.ts` regenerates on `bun run check-types`. Commit it.

## Webhook controller

- Read the raw body with `rawBody()` from `zalo-raw-body.ts`. It copies the stream loop of `apps/api/src/tracking/tracking.controller.ts:215-235` and drops the object branch at lines 206-212. `createApp` sets `bodyParser: false` (`apps/api/src/create-app.ts:15`), so production hands the controller wire bytes. Cap at `MESSAGING_API.webhook.maxBodyBytes`. Over the cap: 413.
- Verify the signature first, per fact B. Bad or missing: 401. When fact B gives an event timestamp, refuse one older than `MESSAGING_API.webhook.clockSkewMs` (5 minutes) with 401. Never log headers or the body (`docs/api.md` Logging). In development only, log the header names present, never the values.
- Parse with `zaloWebhookEvent`. Unknown `event_name`: 200 and a debug log with the event name only. A known event that fails parsing: 200 and `messagingError({ error, stage: "webhook" })` (phase 4 adds the builder; until then, a warn log with the error class).
- Map `user_send_*` to `IncomingChannelMessage`. `kind` is `TEXT`, `IMAGE`, `FILE`, `STICKER`. `attachments` holds the Zalo URLs. `externalId` is the Zalo message id. `sentAt` from the event timestamp.
- Map `follow` and `unfollow` to `IdentityEvent`. Map `user_received_message` and `user_seen_message` to `ReceiptEvent`.
- Call the writer. Every path updates `account.lastWebhookAt`.
- Account not found for `oa_id`, or `disconnectedAt` set: 200, write nothing, one warn log with the event name.
- Duplicate `(threadId, externalId)`: the writer reports `stored: false, reason: "duplicate"`. Answer 200.
- Any other writer failure: 500 with an empty body and `messagingError({ error, stage: "webhook" })`. Zalo retries a 500 and does not retry a 200. A real message answered 200 by mistake is lost for good. [Red team 2026-09-16, finding 14]
- Answer 200 before any slow work. There is none: the writer is one transaction.

## Writer service

`MessagingWriterService.store(incoming)` runs in one transaction:

1. Find the account by `(channel, externalId)`. Refuse a missing or disconnected account: return `{ stored: false, reason }`.
2. `upsert` `ContactChannelIdentity` by `(channel, accountId, externalId)`. Prisma turns an upsert on a unique where into `INSERT ... ON CONFLICT`, so two webhooks for a brand-new user in the same second do not race. Update `displayName`, `avatarUrl` and `lastInboundAt = max(current, sentAt)`. No automatic matching. Zalo gives no phone number. A human links in the inbox (`docs/connections.md` "Identity matching is connection-level").
3. `upsert` `MessageThread` by `identityId`. On create: `firstMessageAt = sentAt`, `contactId = identity.contactId`, `companyId` from the contact. On every inbound: `lastMessageAt = max(current, sentAt)`, `lastInboundAt = max(current, sentAt)`, `messageCount + 1`, `unreadCount + 1`.
4. `createMany({ data: [message], skipDuplicates: true })` for `Message { direction: INBOUND, status: DELIVERED, kind, body, attachments, externalId, sentAt }`. `count === 0` means the `(threadId, externalId)` row exists: return `{ stored: false, reason: "duplicate" }` and let the transaction roll back the count bumps from step 3. Never catch a bare `P2002` inside the transaction: two unique constraints can raise it, an identity conflict is not a duplicate message, and a caught error leaves the Postgres transaction aborted. The existing writer at `apps/api/src/mailbox/thread-writer.service.ts:257-290` uses `upsert` and catches nothing. [Red team 2026-09-16, finding 14]
5. Project the activity like `ThreadWriterService.project()` (`apps/api/src/mailbox/thread-writer.service.ts:257`): upsert one `Activity { type: MESSAGE, messageThreadId, contactId, companyId, subject: snippet(body, MESSAGING_POLICY.snippetLength), occurredAt: lastMessageAt, createdById: account.connectedById }`. A sticker or a file with no body gets the subject "Sticker", "Image" or "File".
6. `ActivityStampService.touch({ contactId, companyId }, sentAt)` when the thread has a contact.
7. Update `account.lastInboundAt`.

`follow(event)` upserts the identity, then `updateMany({ where: { id, OR: [{ followedAt: null }, { followedAt: { lt: at } }], NOT: { unfollowedAt: { gt: at } } }, data: { followedAt: at, unfollowedAt: null } })`. `unfollow(event)` is the mirror: `updateMany` guarded by `unfollowedAt` older than `at` and `followedAt` not newer than `at`, setting `unfollowedAt = at`. Fact C says at-least-once and out-of-order. A replayed `follow` after a real `unfollow` must not clear `unfollowedAt`. The `max()` rule on messages does not cover identity events. Neither creates a thread. [Red team 2026-09-16, finding 12]

`receipt(event)` finds the `OUTBOUND` row by `externalId` on any thread of that account, through the `@@index([externalId])` from phase 2. `delivered` sets `deliveredAt` and `status = DELIVERED` when the row is `SENT`. `seen` sets `readAt` and `status = READ`. No row: `createMany({ skipDuplicates: true })` one `MessageReceipt { accountId, externalId, kind, at }` and answer 200. The send handler writes `externalId` after Zalo answers, in another process, and the phone's delivery ack arrives at the API within the same second. A dropped receipt is a bubble that says "Sent" forever. Phase 4 applies and deletes the receipt when the row settles `SENT`. [Red team 2026-09-16, finding 7]

`linkContact(threadId, contactId)` runs in one transaction: set `identity.contactId`, `thread.contactId`, `thread.companyId`, move the activity, `stamp.touch()` at `thread.lastMessageAt`.

`unlinkContact(threadId)` runs in one transaction: set `identity.contactId`, `thread.contactId`, `thread.companyId` and the activity's `contactId` and `companyId` to null. No `touch()`.

`deleteThread(threadId)` deletes the identity row. The thread, its messages and the activity cascade. `MessageReceipt` rows for the account are untouched; the stale sweep in phase 4 removes them.

## UI

- Inbox `/[slug]/messages`: two panes inside `--container-page-wide` (`docs/connections.md` Layout). Left: `ThreadList` with a segmented filter (All, Needs reply, Unmatched) in the URL through nuqs, counts on the segments, rows sorted by `lastMessageAt`. Right: `ThreadView` with `MessageBubble` rows, oldest at the top, `messaging.messages` infinite query. Opening a thread calls `markRead`. Phase 4 adds the composer under the thread.
- An unmatched thread shows a banner with "Link to contact" and "Create contact". `LinkContactDialog` searches with `search.quick` (`apps/api/src/search/search.router.ts:15`) and calls `linkContact`. "Create contact" renders `CreateContactSheet` with `initialFirstName` and `initialLastName` from `displayName` split on the last space, `openRecordOnSuccess: false`, and `onCreated` that calls `linkContact` with the new id and then `cache.messaging()`. A matched thread shows "Unlink" and "Delete conversation" in an overflow menu, both only when `canManage` is true. "Delete conversation" confirms with one sentence: "This removes every message with this person from the CRM. The OA keeps its own copy." (`docs/connections.md` "Irreversible things are bounded in writing").
- `MessageBubble` renders an attachment as a link with `target="_blank"` and `rel="noopener noreferrer"`. An `IMAGE` renders `<img>` only when the host is in `MESSAGING_POLICY.zalo.attachmentHosts`; the webhook already refused anything else, so this is the second gate. On `<img onError>` the bubble replaces the image with one sentence: "This image is no longer available on Zalo." Nothing is copied to Blob, by user decision (validation session 1). The OA keeps the original. <!-- Updated: Validation Session 1 - expired attachment rendering -->
- Pre-connect state when `zalo.configured` is false or `connected` is false: one sentence and a link to `/settings/connections/zalo`. Centre vertically (`docs/connections.md` "Short single-decision pages").
- Nav: `Messages` item with the unread count badge. `messaging.unreadCount` polls with `refetchInterval: 30_000`. The constant lives in `apps/app/components/crm/messaging/messaging-ui-config.ts` as `MESSAGING_UI = { unreadPollMs: 30_000, queuedPollMs: 2_000 }` (phase 4 uses the second).
- Timeline: `MessageThreadEntry` shows the Zalo brand mark, `messageCount`, the last snippet and "Open messages", which opens the inbox with `?thread=<id>`. Phase 4 changes the target to the contact sheet Messages tab.
- All components from `packages/ui`. No `className` overrides. Client components receive finished data.

## Contact delete

`ContactsService.delete` (`apps/api/src/contacts/contacts.service.ts:348`) gains one statement: null `contactId` and `companyId` on the contact's `MESSAGE` activities. The FKs do the rest: `ContactChannelIdentity.contactId` and `MessageThread.contactId` are `SetNull`, so the identity, thread, messages and activity survive and the thread returns to Unmatched. Nothing is erased by a contact delete. Erasure is `messaging.deleteThread`, whose chain is `ContactChannelIdentity → MessageThread → Message, Activity(MESSAGE)`. `AgentTask` rows of kind `message-send` carry no `contactId` (phase 2 "Task kinds"), so line 359 does not touch them. `docs/api.md` "Deleting a record" gets one new line in phase 4 with the other doc updates. The test in this phase proves both shapes. <!-- Updated: Validation Session 1 - contact delete is SetNull, not cascade -->

`MESSAGE` is not in `COMPOSABLE_TYPES` (`apps/api/src/activities/activities.contracts.ts:4-10`) and not in `NOTE_TYPES` (`apps/api/src/activities/activities.service.ts:60-63`). A rep does not compose a `MESSAGE` activity by hand and the notes filter does not show one. One test asserts both exclusions. `activities_by_type` in `apps/api/src/telemetry/rollup.service.ts:551-554` keys by `Object.values(ActivityType)`, so `MESSAGE` enters `install_daily` as soon as the enum gains it; phase 4 documents that row. [Red team 2026-09-16, finding 15]

## Tests (bun:test)

- `apps/api/test/zalo-signature.spec.ts`: valid signature passes; one changed byte fails; missing header fails; stale timestamp fails when fact B gives one; comparison is timing safe (both branches use `timingSafeEqual`).
- `apps/api/test/zalo-webhook.spec.ts` (boot through `createApp()` and post real bytes, rows suffixed by `TEST_RUN_ID`): bad signature 401; over the cap 413; `user_send_text` stored with one activity; replay of the same message id is 200 and one row; two texts from a new user posted concurrently both land; a writer failure that is not a duplicate is 500; unknown OA 200 and no row; disconnected OA 200 and no row; unknown event name 200; an attachment URL with `javascript:` or an unlisted host is refused; `follow` sets `followedAt`; a replayed `follow` older than an `unfollow` changes nothing; `user_seen_message` with no row is 200 and writes one `MessageReceipt`.
- `apps/api/test/messaging-writer.spec.ts`: identity upsert keeps `contactId`; thread upsert bumps counts and never moves `lastMessageAt` backwards; duplicate `externalId` reports `stored: false` and rolls back the count bump; one activity per thread after three messages; `touch()` bumps `lastActivityAt` on a matched contact; unmatched thread has no `contactId` and no touch; `linkContact` moves the activity and touches; `linkContact` refuses a second contact; `unlinkContact` returns the thread to Unmatched and clears the activity's contact; `deleteThread` removes the identity, thread, messages and activity; a duplicate receipt is one `MessageReceipt` row.
- `apps/api/test/messaging-reads.spec.ts`: `threads` filter `needsReply` and `unmatched` counts; `markRead` clears; `unreadCount` sums; `threadByContact` returns the thread; `unlinkContact` and `deleteThread` are refused for a member without the role.
- `apps/api/test/record-delete.spec.ts` (`describe("deleting a contact")` at line 123): extend: deleting a contact leaves the identity, thread, messages and `MESSAGE` activity in place with `contactId` and `companyId` null, and the thread appears under Unmatched; `deleteThread` removes all four.
- `apps/api/test/activities-timeline.spec.ts` (create; no activities or timeline spec exists in `apps/api/test` today): `messages` filter counts the `MESSAGE` activity only; `MESSAGE` is in neither `COMPOSABLE_TYPES` nor `NOTE_TYPES`.
- `apps/app/test/activity-presentation.spec.ts` (create; `apps/app/test` has no such file today): `MESSAGE` has an icon and a label.

## Implementation Steps

1. Read `docs/messaging.md` facts B, C and E. Confirm the webhook URL from phase 1 row 5 points at a running API.
2. Write `zalo-raw-body.ts`, `zalo-signature.ts` and its test from fact B.
3. Write `zalo-webhook.schema.ts` from fact E. Write `incoming-message.ts` with the attachment host allowlist.
4. Build `messaging-writer.service.ts` and its test.
5. Build `zalo-webhook.controller.ts` and its test. Register in `messaging.module.ts`.
6. Build `messaging.service.ts`, `messaging.contracts.ts`, `messaging.router.ts`. Add the `messages` timeline filter. Run `bun run check-types`.
7. Build the app: `cache.ts`, nav item and badge, inbox route and search params, `thread-list.tsx`, `thread-view.tsx`, `message-bubble.tsx`, `link-contact-dialog.tsx`, the `CreateContactSheet` props, the unlink and delete menu, timeline tab and entry, `activity-presentation.ts`, the Zalo page liveness values.
8. Extend `record-delete.spec.ts`.
9. Run the tests above, then `bun run lint`, `bun run check-types`, `bun run build`.
10. Manual check on the sandbox OA: send a text from a phone, see the thread under Unmatched within 10 s, link it to a contact, see the `MESSAGE` entry on the timeline, replay the webhook with the same body and see one row, send an image and see the attachment URL rendered.

## Success Criteria

- [ ] The first real sandbox event passes the signature check. The header name from fact B is confirmed by a real event. (needs sandbox OA)
- [ ] Inbound Zalo text visible in `/messages` within 10 s of the webhook (API log timestamp). (needs sandbox OA) (needs browser)
- [x] Webhook replay creates no second row.
- [x] A bad signature is 401. An unknown OA is 200 with no row.
- [x] An unmatched thread is linked to a contact. The activity moves. `lastActivityAt` moves. Unlink returns it to Unmatched. "Create contact" links the new contact without leaving the inbox.
- [x] A seen event that lands before the outbound row has an `externalId` is kept as a `MessageReceipt`.
- [x] The nav badge shows the unread count. Opening a thread clears it.
- [x] Deleting a contact returns its thread to Unmatched with the history intact. Deleting a conversation removes the identity, thread, messages and activity. The test proves both.
- [x] `check-types`, `lint` and the listed tests pass. (build not run in any report)

## Risk Assessment

- RISK: A wrong signature header rejects every webhook. Mitigation: fact B, then the first real sandbox event is the acceptance test. Development logs header names only.
- RISK: Zalo retries an event the CRM already stored. Mitigation: `(threadId, externalId)` is unique. `createMany` with `skipDuplicates` reports `count 0`. The controller answers 200.
- RISK: A caught `P2002` from the identity unique is mistaken for a duplicate message and a real text is answered 200 and lost. Mitigation: the identity is an `upsert`, the message is `createMany` with `skipDuplicates`, nothing catches `P2002`, any other failure is 500 so Zalo retries.
- RISK: Events arrive out of order. `lastMessageAt` moves backwards, a replayed `follow` clears an `unfollow`. Mitigation: the writer sets `lastMessageAt = max(current, sentAt)` and guards identity events on `at`.
- RISK: A receipt arrives before the send handler writes `externalId` and is dropped. Mitigation: `MessageReceipt` keeps it; phase 4 applies it on `SENT`.
- RISK: The test hashes a re-serialised body while production hashes wire bytes, and the divergence is silent. Mitigation: `rawBody()` refuses a populated `request.body`; the webhook test boots through `createApp()`.
- RISK: An attachment URL points anywhere and every rep who opens the thread beacons to it. Mitigation: `https` and the host allowlist from fact E at the webhook, and again in the bubble.
- RISK: The webhook is public. A flood of valid-looking bodies costs CPU. Mitigation: signature check first, size cap, one transaction per event. No further rate limit in v1.
- RISK: `SendAlt` is not exported by the installed Carbon version. Mitigation: verify before coding. Fall back to `Forum`.
- RISK: Bodies are personal data under PDPL. Mitigation: never in logs, never in telemetry. Contact delete keeps the history under Unmatched by user decision (validation session 1); `deleteThread` is the erasure step for any Zalo person, matched or not, and the confirm sentence says so. Stated in `docs/messaging.md` in phase 4.

## Rollback

- Code: revert the merge. Phase 2 tables stay. Unregister the webhook URL in the Zalo app console to stop traffic without a deploy.
- Data: rows written by the webhook stay. Disconnecting the OA makes the controller write nothing.

## Outcome — 2026-09-21

Reports: `from-fullstack-developer-to-orchestrator-phase-03-backend-implementation-report.md`,
`from-fullstack-developer-to-orchestrator-phase-03-ui-implementation-report.md`,
`from-code-reviewer-to-orchestrator-phase-03-backend-review-report.md`,
`from-fullstack-developer-to-orchestrator-phase-03-review-fixes-report.md`,
`from-code-reviewer-to-orchestrator-phase-02-03-ui-review-report.md`,
`from-fullstack-developer-to-orchestrator-phase-02-03-ui-review-fixes-report.md`.

Deviations landed here: `bodyParser: { rawBody: true }` on `createApp()` replaces the plan's
`create-app.ts:15` premise, because `@thallesp/nestjs-better-auth` parses every body first;
2-hour webhook timestamp tolerance, not 5 minutes; `messaging.threadById` added so a deep link
past the first loaded page resolves (review finding, fixed); `displayName`/`avatarUrl` stay
null this phase — the profile read moved to phase 4 (`profileCheckedAt`, review finding H3).
A non-JSON content type is refused with 401 before the raw-body read, and the writer's
`StoreResult` now reaches the controller's answer (both were critical review findings, fixed).

Gate: `apps/api` 462, `apps/agent` 356, `packages/db` 133, all green after review-fixes.

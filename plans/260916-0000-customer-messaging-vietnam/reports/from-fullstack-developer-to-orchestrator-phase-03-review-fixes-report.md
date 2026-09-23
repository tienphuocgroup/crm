# Phase 3 backend review fixes — inbound Zalo

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made. Only `apps/api` changed.

Read: `AGENTS.md`, `docs/messaging.md`, the phase 3 review, the phase 3 implementation report.

## What changed

1. **Content type gate.** `zalo-webhook.controller.ts` answers 401 before it reads the
   body when `content-type` is not `application/json`. A charset parameter passes.
   The log line is one object: `{ message: "Webhook refused: content type" }`.
   `zalo-raw-body.ts` returns `{ ok: false, reason: "unreadable" }` when
   `request.readableEnded` or `request.destroyed` is true and no `rawBody` buffer exists.
2. **The writer result reaches the answer.** `dispatch()` returns `StoreResult | null`;
   `null` means a follow or a receipt. The controller answers 200 for `stored` and
   `duplicate` and 500 with `{ message, reason }` for `no-account` and `disconnected`.
   `store()` now calls `MessagingWriterService.accountFor(channel, candidates)`, the same
   function the controller calls. `IncomingChannelMessage.accountExternalId` became
   `accountExternalIds: string[]`, filled with `[oa_id, recipient.id, sender.id]`.
   The controller picks the person as the party that is not `account.externalId`.
3. **`user_seen_message` is bounded.** `MESSAGING_API.webhook.maxReceiptIds` is 50 and
   the schema caps `msg_ids` at it. `MessagingWriterService.receipts(accountId, ids, kind, at)`
   runs one `findMany`, one `updateMany` for the status transition and one
   `createMany({ skipDuplicates: true })` for the ids with no outbound row.
   `receipt()` keeps its signature and calls `receipts()` with one id.
4. **Attachments parse once.** `incoming-message.ts` gains `acceptAttachments()`, which
   parses each candidate with `messageAttachment` and reports the dropped hosts.
   The controller maps the Zalo payload and calls it; the hand-built array is gone.
   `messaging.service.ts` parses the stored JSON with `messageAttachments`, logs one warn
   with the message id on failure and returns `[]` for that row only.
5. **Contact delete clears the thread company.** `MessagingWriterService.detachContact(tx, contactId)`
   runs one `updateMany`. `ContactsService.delete` calls it inside the transaction, after the
   MESSAGE activity statement and before `tx.contact.delete`. `ContactsModule` imports
   `MessagingModule`. No `forwardRef` is needed: no cycle exists.
6. **`markRead` moved.** `MessagingWriterService.markRead(threadId)`; `MessagingService` calls it.
   Grep of `messageThread|message|contactChannelIdentity|messageReceipt` writes outside the
   writer returns nothing.
7. **Wire-byte tests.** `zalo-webhook.spec.ts` gains: a pretty body signed over its own bytes
   is 200 and stored; the same pretty body signed over the compact form is 401; a `text/plain`
   body is 401; a form-encoded body, full and empty, is 401; `application/json; charset=utf-8`
   is 200; a timestamp 3 hours ahead is 401; `user_received_message` sets `deliveredAt` on a
   seeded SENT outbound row; an OA id that sits only in `sender` is stored; 50 seen ids settle
   the one match and file 49 receipts; 51 seen ids answer 200 and write nothing.
8. **Vacuous assertions.** `messaging-writer.spec.ts` asserts the message count is 0 for the
   test person, and scopes the `messageReceipt` count with `where: { accountId }`.
9. **Cursor and log.** `messages` and the snippet select order by `queuedAt desc, id desc`.
   The writer sets `queuedAt` to `sentAt` on an inbound row, so a late replay still sorts by
   send time. A dropped attachment whose URL has no host logs `"invalid"`.
10. **`messaging.threadById`** query `{ threadId } → { thread: ThreadRow | null }`, same select
    as `threads`. One case in `messaging-reads.spec.ts`.
11. **Timeline identity.** `activities.service.ts` selects `identity { displayName, externalId }`
    and the entry payload carries `externalId` beside `displayName`.

## Commands

| Command | Result |
| --- | --- |
| `bun run check-types` | pass, 13 of 13. `server.ts` regenerated: 20 routers, 149 procedures |
| `bun run lint` | pass, 9 of 9 |
| `apps/api` full suite | 462 pass, 0 fail, 38 files (was 446) |
| `apps/agent` `bun test` | 356 pass, 0 fail |
| `packages/db` `bun test` | 133 pass, 0 fail |

## Issues

1. RISK — `accountFor` keeps its `(channel, candidates)` signature, not `(candidates)`.
   Fix: accepted. `ReceiptEvent` and `IdentityEvent` carry a channel. I caused this.
2. RISK — Every non-JSON POST writes one warn line. An anonymous flood grows the log.
   Fix: not done. The line holds no request data. Rate limit it in phase 4. I caused this.
3. RISK — `store()` re-resolves the account, so a message event runs one extra query.
   Fix: accepted. It buys one lookup rule for the controller and the writer. I caused this.
4. NOT DONE — `displayName` and `avatarUrl` stay null. Every thread shows an empty name.
   Fix: fetch the OA user profile in phase 4. The UI must not depend on the field now.
5. UNKNOWN — The signature formula and the OA id field still need one real sandbox event.

Status: DONE
Summary: The webhook refuses a non-JSON content type, never hangs, answers 500 on a writer
refusal, bounds seen receipts, parses attachments once, and keeps the writer the only writer.
Concerns: `displayName` is still never written, so the inbox shows empty names.

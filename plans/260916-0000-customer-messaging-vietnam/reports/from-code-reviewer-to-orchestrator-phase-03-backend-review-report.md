# Phase 3 backend review — inbound Zalo

Date 2026-09-21. Branch `feat/zalo-oa-chat`. Review only. No file changed except this report.

Scope: `apps/api/src/messaging/**`, the diffs to `app.module.ts`, `activities.*`,
`contacts.service.ts`, and six specs. Ran the six specs: **68 pass, 0 fail, 188 expect calls**.

## Verdict

**APPROVE_WITH_FIXES.** The writer, the cascade chain, the role checks and the
dedupe are correct. Six defects must land first. Three are reachable by an
unauthenticated caller or lose a customer message.

## Critical

**1. A form content-type kills the webhook before the signature check.**
`zalo-raw-body.ts:25-31`. `@thallesp/nestjs-better-auth` mounts
`express.urlencoded()` on every non-auth route (source below). A POST with
`content-type: application/x-www-form-urlencoded` and `a=b` fills `request.body`,
`request.rawBody` stays empty, `rawBody()` throws `ParsedBodyError`, and
`zalo-webhook.controller.ts:49-55` answers 500 with an ERROR log. The same POST
with an **empty** form body passes `isEmptyBody` (line 27), reaches the stream
loop at line 33, and waits on a stream that already ended. The request gets no
response and holds a socket.
Failure: any anonymous client floods the error log or pins sockets. No signature
needed. It also breaks the rule "signature first".
Fix: refuse a non-JSON content-type with 401 at the top of `handle()`, and return
`{ ok: false, reason: "unreadable" }` in `rawBody()` when `request.readableEnded`
is true and no buffer exists.

**2. The controller throws the `StoreResult` away.**
`zalo-webhook.controller.ts:121-122`. `store()` returns `no-account` or
`disconnected` (`messaging-writer.service.ts:82-85`) and the controller answers
200 with no log. The two account lookups differ: the controller searches
`[oa_id, recipient.id, sender.id]` (line 273-277), the writer searches
`recipient.id` only (`messaging-writer.service.ts:72-80`). If a Zalo envelope
names the OA anywhere but `recipient` — the implementer's own issue 4 — the
controller passes the connected check and the writer drops the message. The
message is lost and nothing is logged.
Fix: return the result from `dispatch()`. Answer 500 when the controller found a
connected account and the writer refused for any reason other than `duplicate`.

## High

**3. `user_seen_message` runs one transaction per id, unbounded.**
`zalo-webhook.schema.ts:93` sets `.min(1)` and no maximum.
`zalo-webhook.controller.ts:155-164` loops and awaits `receipt()` per id. Each
call runs `accountFor` plus a `findFirst` plus a write
(`messaging-writer.service.ts:265-296`). A 64 KB signed body holds about 3000
ids, so one event makes about 9000 sequential queries. Zalo calls a reply slower
than 2 s "webhook not working" (fact C).
Fix: `.max(50)` on `msg_ids`, resolve the account once, and write the receipts
with one `createMany`.

**4. The read path hides attachments.** `incoming-message.ts:51-55` returns `[]`
on any parse failure and `messaging.service.ts:258` calls it for every row.
AGENTS.md forbids exactly this: "Parse failure is a real error... Do not swallow
it into an empty array." The write path never uses `messageAttachment` — the
controller builds the array by hand (`zalo-webhook.controller.ts:176-197`) and
checks the host only, so `maxAttachmentUrlLength` is enforced on read and not on
write. A stored URL over 2000 characters makes the **whole** attachment list
vanish from the API, silently.
Fix: parse with `messageAttachments` at the webhook, and log plus keep the raw
count when a stored row fails the schema.

**5. `displayName` and `avatarUrl` are always null.**
`zalo-webhook.controller.ts:213-214` and `messaging-writer.service.ts:427-428`
hardcode null. No other code writes them. The inbox row, the timeline entry
(`activities.service.ts:307`) and the "Create contact" name split all read
`identity.displayName`. Every thread shows an empty name for ever.
Fix: fetch the profile in phase 4, or record **NOT DONE** in the plan now so the
UI agent does not build on a field that never fills.

## Medium

**6. Contact delete leaves `MessageThread.companyId`.** The implementer's issue
2, confirmed. `contacts.service.ts:363-366` nulls the activity only. The FK nulls
`contactId` at the delete; `companyId` has no such FK to the contact. The thread
is unmatched and still names a company. `record-delete.spec.ts` misses it because
the test contact has no company.
See "Recommendation for issue 2" below.

**7. `markRead` writes `MessageThread` outside the writer.**
`messaging.service.ts:159-162`. It is the only such statement in the codebase
(grep of `messageThread|contactChannelIdentity|messageReceipt|message` mutations
returns this line and the writer). AGENTS.md makes the writer the only writer.
Fix: move it to `MessagingWriterService.markRead(threadId)`.

**8. No test proves the signature covers wire bytes.** `zalo-webhook.spec.ts:24-39`
signs and posts the output of `JSON.stringify`, so a re-serialising
implementation passes every case. The plan names this divergence as a risk.
Fix: add one case that posts `JSON.stringify(event, null, 2)` and signs those
exact bytes. Also missing: a non-JSON body is 401 (decision 5), a
`user_received_message` event, and a timestamp in the future.

**9. Vacuous assertion.** `messaging-writer.spec.ts:112`,
`expect(await db.message.count()).toBeGreaterThanOrEqual(0)` is always true.
`messaging-writer.spec.ts:424` counts `messageReceipt` with no `where` and breaks
when another spec in the same run leaves a row.
Fix: assert `db.message.count({ where: { thread: { identity: { externalId: personId } } } })` is 0.

## Low

10. `messages` pages by a nullable column. `messaging.service.ts:139-143` orders
    by `sentAt` with `nulls: "first"` and uses a Prisma cursor. A page filled only
    with QUEUED rows makes the cursor row `sentAt` null and the next page empty.
    Phase 4 makes this reachable.
11. `attachmentHostOf("javascript:alert(1)")` returns `""`, so the warn log at
    `zalo-webhook.controller.ts:200-204` prints an empty host.
12. `zalo-webhook.controller.ts:69` short-circuits, so `timingSafeEqual` does not
    run when the envelope fails to parse. No secret is compared in that branch, so
    there is no oracle. The acceptance wording is not met literally.
13. No index serves `unreadCount > 0` (`messaging.service.ts:96`) or the
    `_sum` at line 125. Both scan `messageThread`. Add `@@index([unreadCount])`
    when the table grows.
14. `apps/api/tmp-list-users.ts` and `apps/api/tmp-check-mailbox-sync.ts` are
    untracked debris. They print user email addresses. Do not commit them.

## Verified, no change needed

- **(b) Decision 1 is correct.** `@thallesp/nestjs-better-auth` v2.7.0 source
  (GitHub tag `v2.7.0`, `src/middlewares.ts`): `resolveBodyParserOptions` maps
  `bodyParser.rawBody` to `express.json({ verify: rawBodyParser })`, and
  `src/auth-module.ts:221-227` applies `SkipBodyParsingMiddleware` with
  `.forRoutes("*path")` for the express adapter. `request.rawBody` holds the wire
  bytes on every non-`/api/auth` JSON route, in the test boot and in production —
  both enter through `createApp()` (`main.ts:5`, `api/index.ts:12`). The package
  already parsed every request before this diff, so the only delta is the retained
  buffer: implementer issue 3 is accurate and the plan's premise about
  `create-app.ts:15` is wrong. Tracking is unaffected; its `read()` already
  handles an object body (`tracking.controller.ts:206-212`). Better Auth routes are
  excluded by `basePath`. The passing webhook suite is the empirical proof: a
  missing `rawBody` throws `ParsedBodyError` and every write test would be a 500.
- **(c) Decision 2 is correct.** `messaging-writer.service.ts:476-481` uses a
  tagged `$queryRaw`, so the id is a bind parameter, and it locks the right row.
  Two concurrent events cannot double-bump: `FOR UPDATE` serialises and
  `increment` is atomic. They cannot create two threads: `identityId` is unique
  and the upsert is `ON CONFLICT`. `createMany({ skipDuplicates: true })` plus
  `findUniqueOrThrow` creates the identity with no conflict. No `P2002` is caught
  anywhere. Isolation is READ COMMITTED, which is enough with the row lock.
  Timeouts are the Prisma defaults; a burst from one person can hit the 2 s
  maxWait and answer 500, which Zalo retries. `lock()` returning
  `{ contactId: null }` for a vanished identity hides the cause of the later FK
  error. Both are acceptable now.
- **(d)** Decision 3 is sound: `@@unique([channel, externalId])` on
  `MessagingAccount` means at most one candidate matches. Decision 5 is sound.
- **(e)** No regression. `ENTRY_SELECT` adds one to-one relation, which Prisma
  batches — two extra queries per page, not N+1. `timelineCounts` keeps every
  existing clause and adds a seventh count. `MESSAGE` is in neither
  `COMPOSABLE_TYPES` (`activities.contracts.ts:4-10`) nor `NOTE_TYPES`
  (`activities.service.ts:69-74`). `contacts.service.ts:363` sits after
  `targetsOf` (line 357) and before `tx.contact.delete` (line 368), so the company
  restamp still sees the activity. `disconnect()` is idempotent and checks the role
  before the read (`zalo-connection.service.ts:76-90`).
- **(f)** No body, header value, display name or message text reaches a log. The
  500 answers an empty body; the spec asserts it. `deleteThread` cascades:
  `ContactChannelIdentity` → `MessageThread` (Cascade) → `Message` (Cascade) and
  `Activity.messageThreadId` (Cascade), all in `schema.prisma`. `MessageReceipt`
  hangs off `accountId` and survives for the phase 4 sweep, as planned. A company
  delete is safe: a MESSAGE activity that carries a `companyId` always carries a
  `contactId`, so `companies.service.ts:420-423` re-anchors it before the cascade.
- **(g)** No comments in `messaging/**`. No `as` casts, no `Record<string, unknown>`.
  Constants live in `messaging-config.ts`. Host matching is exact-suffix:
  `evilzdn.vn` fails `.endsWith(".zdn.vn")` (`incoming-message.ts:29-31`).
- **(a)** Confirmed by test: missing header 401, stale timestamp 401 (`Math.abs`
  covers both directions), over the cap 413, unknown event 200, parse failure 200
  with `error: "ZodError"`, unknown and disconnected OA 200 with no row, replay 200
  with one row and no count bump, a non-duplicate failure 500 with an empty body,
  an unlisted host dropped with the row kept, the follow guard holding behind an
  unfollow, a seen event with no row becoming one `MessageReceipt`. Cursor ties are
  real in `messaging-reads.spec.ts` (both threads share `lastMessageAt`) and the
  `id desc` tiebreaker keeps the page stable.

## Recommendation for issue 2 (thread `companyId`)

Add `MessagingWriterService.detachContact(tx, contactId)` that runs
`tx.messageThread.updateMany({ where: { contactId }, data: { companyId: null } })`.
Call it from `ContactsService.delete` inside the transaction, beside the existing
activity statement and before `tx.contact.delete` — the FK nulls `contactId` only
at the delete, so the `where` still matches. The writer is the right home because
AGENTS.md makes it the only writer of `MessageThread`; `ContactsService` owns the
Activity statement only because Activity is shared by every record type. If
importing `MessagingModule` into `ContactsModule` creates a cycle, put the one
`updateMany` in `ContactsService` with the same placement and accept a second
writer. Do not leave it unset: a dangling `companyId` on an unmatched thread is
read by the inbox row and by the phase 4 quota code.

## Must fix before landing

1. Refuse a non-JSON content-type with 401, and never wait on an ended stream.
2. Act on the `StoreResult`, and make the two account lookups agree.
3. Bound `msg_ids` and write the receipts in one statement.
4. Null `MessageThread.companyId` on a contact delete.
5. Parse attachments with the schema at the webhook, and stop swallowing the
   parse failure on read.
6. Add the wire-byte signature test and the non-JSON 401 test. Delete the vacuous
   assertion.

Item 5 of the High list (`displayName`) is a plan decision, not a code fix.
Record it before the UI agent depends on the field.

## Issues

1. BROKEN — An anonymous form-encoded POST makes the webhook answer 500 or hang.
   Fix: refuse a non-JSON content-type with 401 in `zalo-webhook.controller.ts`.
2. BROKEN — The controller ignores a writer refusal and answers 200. A message is lost.
   Fix: return the `StoreResult` from `dispatch()` and answer 500.
3. RISK — One seen event with 3000 ids makes 9000 queries. Zalo marks the webhook broken.
   Fix: `.max(50)` on `msg_ids` and one `createMany`.
4. RISK — A long attachment URL hides every attachment on that message.
   Fix: parse with `messageAttachments` at the webhook and log the failure on read.
5. NOT DONE — `displayName` is never written. Every thread shows an empty name.
   Fix: fetch the OA user profile, or record the gap in the plan.
6. NOT DONE — A contact delete leaves `MessageThread.companyId` set.
   Fix: `MessagingWriterService.detachContact(tx, contactId)` in the delete transaction.
7. RISK — No test proves the signature covers wire bytes. A re-serialising change passes CI.
   Fix: post a pretty-printed body signed over those exact bytes.
8. RISK — `markRead` writes `MessageThread` outside the writer.
   Fix: move the statement into `MessagingWriterService`.
9. UNKNOWN — The signature formula and the OA id field still need one real sandbox event.
10. UNKNOWN — `bun run check-types`, `lint` and `build` were not run in this review.
    The implementer reports them green.

Status: DONE_WITH_CONCERNS
Summary: The writer, the cascade, the dedupe and the role checks are correct; two
unauthenticated defects and one silent message-loss path block the landing.
Concerns: The raw-body guard runs before the signature check and turns a form
content-type into a 500 or a hang. The controller and the writer resolve the
account by different keys and drop the result.

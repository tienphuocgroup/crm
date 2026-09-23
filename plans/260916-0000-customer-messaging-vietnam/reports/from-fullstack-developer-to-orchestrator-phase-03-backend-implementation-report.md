# Phase 3 backend — inbound Zalo messages

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made.

Read: `AGENTS.md`, `docs/messaging.md`, `docs/api.md`, `docs/connections.md`,
phase 3, the scout report, the three phase 2 reports, the `nestjs-trpc` skill.

## Files created

In `apps/api/src/messaging/`: `incoming-message.ts` (domain types, attachment
schema, host allowlist), `messaging-writer.service.ts` (the only writer:
`store`, `follow`, `unfollow`, `receipt`, `linkContact`, `unlinkContact`,
`deleteThread`, `accountFor`, `touchWebhook`), `messaging.service.ts` (reads,
`markRead`, role checks), `messaging.contracts.ts`, `messaging.router.ts`, and
in `zalo/`: `zalo-raw-body.ts`, `zalo-signature.ts`, `zalo-webhook.schema.ts`,
`zalo-webhook.controller.ts` (`POST /api/messaging/zalo/webhook`).

Specs created: `zalo-signature.spec.ts` (8, pure), `zalo-webhook.spec.ts` (16,
through `createApp()`), `messaging-writer.spec.ts` (19),
`messaging-reads.spec.ts` (10), `activities-timeline.spec.ts` (4).

## Files modified

`messaging.module.ts`, `messaging-config.ts` (`webhook.maxAttachments`,
`maxAttachmentUrlLength`, `signatureHeader`, `subjects`, `zaloWebhookSecret()`),
`zalo-connection.service.ts` (`disconnect()` is idempotent),
`activities.contracts.ts`, `activities.service.ts` (`messageThread` select, the
`messages` count and clause, the serialiser), `contacts.service.ts` (one
`updateMany` on `MESSAGE` activities), `app.module.ts` (decision 1),
`record-delete.spec.ts`, `zalo-connection.spec.ts`, `generated/server.ts`
(regenerated: 20 routers, 148 procedures).

## The `messaging.*` contract for the UI

Dates are ISO strings. `Direction` is `INBOUND | OUTBOUND`. `Kind` is
`TEXT | IMAGE | FILE | STICKER | OTHER`. `Status` is
`QUEUED | SENDING | SENT | DELIVERED | READ | FAILED`.

```ts
type ThreadRow = {
  id: string; contactId: string | null; companyId: string | null;
  firstMessageAt: string; lastMessageAt: string;
  lastInboundAt: string | null; lastOutboundAt: string | null;
  messageCount: number; unreadCount: number;
  identity: { id: string; externalId: string; displayName: string | null;
    avatarUrl: string | null; followedAt: string | null; unfollowedAt: string | null };
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  snippet: { direction: Direction; kind: Kind; body: string | null; sentAt: string } | null;
};

type MessageRow = {
  id: string; direction: Direction; status: Status; kind: Kind;
  body: string | null; attachments: { url: string; name?: string; size?: number }[];
  queuedAt: string; sentAt: string | null; deliveredAt: string | null;
  readAt: string | null; failedAt: string | null; errorMessage: string | null;
  sentBy: { id: string; name: string; image: string | null } | null;
};
```

| Procedure | Input | Output |
| --- | --- | --- |
| `threads` query | `{ cursor?: string; limit?: number (1–100, default 30); filter?: "all" \| "needsReply" \| "unmatched" }` | `{ rows: ThreadRow[]; nextCursor: string \| null; counts: { needsReply: number; unmatched: number } }` |
| `threadByContact` query | `{ contactId: string }` | `{ thread: ThreadRow \| null }` |
| `unreadCount` query | none | `{ count: number }` |
| `messages` query | `{ threadId: string; cursor?: string; limit?: number (1–100, default 50) }` | `{ rows: MessageRow[]; nextCursor: string \| null }` |
| `linkContact` mutation | `{ threadId: string; contactId: string }` | `{ ok: true }` |
| `unlinkContact` mutation | `{ threadId: string }` | `{ ok: true }` |
| `deleteThread` mutation | `{ threadId: string }` | `{ ok: true }` |
| `markRead` mutation | `{ threadId: string }` | `{ ok: true }` |

`threads` sorts newest first. `counts` is workspace wide. `messages` returns one
page oldest first; `nextCursor` walks backwards in time, so prepend each next
page. `linkContact` needs membership only. `unlinkContact` and `deleteThread`
need the connections role and throw `FORBIDDEN` without it. A second contact on
one person throws `CONFLICT`. The timeline entry gains
`messageThread: { id, messageCount, unreadCount, lastMessageAt, displayName } | null`
and `activities.timelineCounts` gains `messages`.

## Decisions beyond the brief

1. **`@thallesp/nestjs-better-auth` parses every body, so `bodyParser: false`
   alone loses the wire bytes.** Its `SkipBodyParsingMiddleware` runs
   `express.json()` outside `/api/auth`. `app.module.ts` now passes
   `bodyParser: { rawBody: true }`, the option the package documents for webhook
   signatures. `rawBody()` reads `request.rawBody` and throws on a parsed body
   with no buffer. The plan's premise about `create-app.ts:15` is wrong.
2. **The account lookup and the identity upsert run before the transaction, and
   the transaction opens with `SELECT … FOR UPDATE` on the identity.** Prisma's
   `upsert` raised `P2002` when two webhooks for one new person arrived together.
   `createMany({ skipDuplicates: true })` plus `findUniqueOrThrow` creates the
   identity without a conflict; the row lock then serialises the thread upsert,
   the counters and the activity. No `P2002` is caught anywhere.
3. **A receipt carries both envelope ids, not one.** Zalo does not document which
   side of `user_received_message` is the OA. `ReceiptEvent.accountExternalIds`
   holds `recipient.id` and `sender.id`; the writer matches whichever is the
   connected account. One OA per workspace, so at most one matches.
4. **The webhook schema stays in `apps/api`.** Only the API sees an event, so
   `packages/validation` gains nothing.
5. **A body that is not JSON is 401.** The signature covers the body timestamp.
   Without a readable timestamp the check cannot run, so the request fails.
6. **The 500 log names the error class and no stack.** A Prisma message carries
   column values. `docs/api.md` forbids bodies in logs.
7. **The activity carries a subject and no body.** The subject is the snippet,
   trimmed to `MESSAGING_POLICY.snippetLength`; `Image`, `File` and `Sticker`
   live in `MESSAGING_API.subjects`. An out-of-order replay stores the message
   and leaves `occurredAt` on the newest one.
8. **`messages` orders by `sentAt desc nulls first`, then `queuedAt`.** A queued
   outbound row has no `sentAt` and belongs at the bottom of the thread.

## Commands

| Command | Result |
| --- | --- |
| `bun run check-types` | pass, 13 of 13. `server.ts` shows `messaging` with 8 procedures |
| `bun run lint` | pass, 9 of 9 |
| `apps/api` full suite | 446 pass, 0 fail, 38 files (was 386) |
| `apps/agent` `bun test` | 356 pass, 0 fail |
| `packages/db` `bun test` | 133 pass, 0 fail |
| `grep -rn "zalo" -il apps/api/src` | only `messaging/**`, `env.validation.ts` and one phase 2 task reason |

## Issues

1. RISK — The signature formula is community sourced. A wrong formula refuses
   every event with 401.
   Fix: not done. Post one real sandbox event. The development log lists the
   header names on a failure.
2. RISK — A contact delete leaves `MessageThread.companyId` set. The conversation
   is unmatched but still names a company.
   Fix: not done. The plan says the thread FKs need no statement, and
   `contacts.service.ts` must not write `MessageThread`. Null it in the writer if
   the orchestrator wants it.
3. RISK — `bodyParser: { rawBody: true }` keeps a buffer for every JSON request
   in the API. Memory per request grows by the body size.
   Fix: accepted. The bodies are small and the parser already held them. I caused
   this.
4. RISK — The webhook reads the OA id from `recipient.id`. A Zalo envelope that
   names the OA elsewhere stores nothing and answers 200.
   Fix: not done. The first sandbox event confirms the field.
5. NOT DONE — No telemetry. The webhook logs one object with the error class.
   `messagingError({ stage: "webhook" })` lands in phase 4.
6. NOT DONE — The whole `apps/app` half: inbox, nav badge, timeline entry,
   `cache.ts`, the Zalo page values. A second agent owns it.
7. NOT DONE — `docs/api.md` "Deleting a record" has no line about the surviving
   Zalo history. Phase 4 owns the doc updates.
8. UNKNOWN — Zalo sends `timestamp` as epoch milliseconds. A seconds value fails
   the 2 hour tolerance and answers 401.

Status: DONE
Summary: A Zalo text, image, file or sticker now becomes a thread, a message and
one MESSAGE activity; the inbox reads, the link, unlink, delete and mark-read
mutations ship behind the right roles; every suite is green.
Concerns: The signature formula and the OA id field need one real sandbox event.
A better-auth body parser, not `create-app.ts`, decides what the controller
reads.

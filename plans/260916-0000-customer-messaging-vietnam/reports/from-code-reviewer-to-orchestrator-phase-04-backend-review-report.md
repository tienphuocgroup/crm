# Phase 4 backend review — outbound send, identity profile, telemetry

Date 2026-09-21. Branch `feat/zalo-oa-chat`. Review only. No file changed but this report.
Read: `phase-04-outbound.md`, `plan.md`, the phase 4 implementation report, the phase 02
and 03 review-fix reports, then the code in `apps/api`, `apps/agent`, `packages/db`,
`packages/validation` and `packages/telemetry`.

## Verdict

**APPROVE_WITH_FIXES.** Every backend item in the phase 4 "Success Criteria" holds. Three
defects break in production, not in CI.

## Acceptance (a) — all pass

| Item | Evidence |
| --- | --- |
| API gate, 422 and the sentence | `messaging-writer.service.ts:286-288`; `messaging-send.spec.ts:269-272,298` |
| Agent gate, fresh count minus this row, no fetch | `message-send.ts:55-71,253-268`; `message-send.integration.spec.ts:328-343` asserts `calls === 0` |
| One vendor call per row | claim `message-send.ts:239-244`; spec `:262-275` asserts `calls === 1` over two runs |
| A `SENDING` row is never re-sent | spec `:296-306`, `calls === 0` |
| Repeated `clientRequestId` | `messaging-writer.service.ts:249-260`; spec `:238-255` (one row, one task) |
| SENT writes ids, stamps, receipts | `message-send.ts:73-120`; spec `:193-240` |
| Vendor error, fixed sentence only | `zalo-errors.ts:74-78`; spec `:359-373` asserts no vendor text |
| 401-class, one re-read, one retry | `message-send.ts:165-175,178-188`; spec `:389-460` |
| Network or timeout, no auto-retry | `message-send.ts:141-142`; spec `:375-387` |
| Whole handler in try/catch, no `enrichmentStatus` | `message-send.ts:224-285`; spec `:480-511` |
| Stale receipt sweep | `message-send.ts:122-133`; spec `:242-260` |
| `enqueue()` required, no contactId, subject | `agent-trigger.service.ts:168-175,191-206`, `poke()` private at `:570` |
| Nest never sends | `grep -rn "message/cs" apps/api/src` is empty |

Specs run: `apps/api` messaging-send 12 pass; the five specs with the new writer argument
plus the webhook spec 105 pass; `apps/agent` send, profile, token-refresh and zalo-client
73 pass; `packages/telemetry` 30 pass. Zero failures. No critical issue.

## High

### H1 — A delivered message is settled `FAILED`

`message-send.ts:163,200-207`. `settleSent()` runs after the vendor answered 200. Any
throw inside that transaction falls to the catch at `:275`, which writes `FAILED` with
`errorCode "internal"`. The text is already on the customer's phone. The rep sees
"Try again" and sends the same text a second time. The spec at
`message-send.integration.spec.ts:481-511` proves the path: Zalo returns `zmsg-taken`,
the unique index `@@unique([threadId, externalId])` (`schema.prisma:1663`) rejects the
update, and the row ends `FAILED`. A deadlock or a connection blip does the same with no
vendor collision.
Fix: wrap the settle in its own try/catch. On failure write `status = SENT, sentAt` with
no `externalId` and return "Sent.". Keep `internal` for the path before the vendor call.

### H2 — A `SENDING` row stays `SENDING` for ever

`message-send.ts:239-244`. A crash between the claim and the vendor answer leaves the row
`SENDING`. `claimDue` (`tasks.ts:31-71`) re-leases the task after
`DISPATCH.visible.leaseMs` (6 minutes, `dispatch-config.ts:7`). The handler returns
"Already claimed." and `completeTask` finishes the task on that first re-lease. The task
never reaches `MAX_ATTEMPTS` (3, `agent-tasks.ts:38`) and is never retired. Nothing
settles the row. The bubble reads "Sending" until a human writes SQL.
Fix, smallest correct: after `claim.count === 0`, read `context.message.status`. When it
is `SENDING` and `task.attempts > 1`, write `FAILED` with `errorCode "interrupted"` and
one fixed sentence. Never call Zalo. The lease is 6 minutes and the vendor timeout is 10
seconds (`messaging-config.ts:10`), so the earlier run is always over.

### H3 — One vendor call per inbound message for a non-follower (decision 8)

`messaging-writer.service.ts:239,622-629`. `requestProfile()` queues a task whenever
`displayName` is null. `enqueue()` dedupes only against tasks with `finishedAt: null`
(`agent-trigger.service.ts:473-490`). The task that answered `-213` is finished, so the
next inbound message queues a new one. A person who does not follow the OA costs one
`user/detail` call per message, for ever. A busy OA burns the read quota and Zalo answers
`-32`, which blocks sends too. `store()` calls `requestProfile()` outside the
`result.stored` check, so a duplicate webhook delivery queues one more read.
Option 1: write `displayName = ""` on `-213` and queue only while `displayName IS NULL`.
No migration. It poisons a user-visible column, every read site must treat `""` as
unknown, and a person who follows later never gets a name.
Option 2: add `profileCheckedAt DateTime?` to `ContactChannelIdentity`. The handler stamps
it on every answer, including `-213`. `requestProfile()` queues while `displayName IS
NULL` and `profileCheckedAt` is null or older than a cooldown in `MESSAGING_API`.

**Recommend option 2.** It keeps the column honest, it bounds the cost to one read per
person per cooldown, and a follow event can clear the stamp to force one fresh read. The
messaging migration `20260921191500_messaging` is not committed, so the column is free to
add now. Also move `requestProfile()` inside the `result.stored` branch.

## Medium

### M1 — A double-click can return 500, not the first row

`messaging-writer.service.ts:249-302`. The dedupe is a read then a write in one
transaction. Two parallel `messaging.send` calls with one `clientRequestId` both read
null. The unique index `@@unique([threadId, clientRequestId])` rejects the second insert.
Prisma `P2002` is not an `HttpException`, so `DomainErrorMiddleware` leaves it alone and
the rep sees `INTERNAL_SERVER_ERROR`. No second row and no second send: the damage is a
false crash in the composer.
Fix: catch `P2002` in `MessagingService.send()`, re-read by `threadId +
clientRequestId`, and return that row.

### M2 — `messaging_unmatched` counts a different thing than the inbox

`rollup.service.ts:511` counts `contactChannelIdentity` rows with no contact. The inbox
"Unmatched" count is `messageThread` rows with no contact (`messaging.service.ts:322`).
An identity from a follow event with no message inflates the telemetry number.
Fix: `this.db.messageThread.count({ where: { contactId: null } })`.

### M3 — Decision 6 rests on an untested regex

`zalo.-216` does pass `CLASS_SHAPE` at `packages/telemetry/src/allowlist.ts:209`. I ran
the expression: `zalo.-216`, `zalo.network`, `zalo.http-500` and `zalo.no-token` pass, and
a bare `-216` fails. No test pins this. A later tightening of the shape turns every Zalo
error class into `other` in silence.
Fix: one case in `packages/telemetry/test/allowlist.spec.ts` for `permittedErrorClass`.

### M4 — The vendor message is dropped, not logged

The plan says vendor text goes to the log object's `error` field. `zalo-client.ts:47-57`
keeps only the numeric code, and `vendorFailure()` (`message-send.ts:135-154`) logs
nothing. An unknown code gives "Zalo refused the request." and no trace of why.
Fix: carry `message` on a `reason: "code"` failure and log it once in the agent. Never
write it to a column.

## Low

1. `message-send.ts:122-133` — `sweepReceipts()` swallows every error. Log its name.
2. `message-send.ts:87-96` — `settleSent()` returns "Sent." even when `updateMany` matched
   no row. Check the count.
3. `message-send.ts:142-145` — a timeout stores `errorCode "network"` but reports
   `error_class "zalo.timeout"`. One word for one meaning: pick one.
4. `messaging-writer.service.ts:159` — an inbound `queuedAt` comes from the vendor clock.
   A wrong clock skews `messages_inbound_7d`.
5. `apps/api/tmp-check-mailbox-sync.ts` and `apps/api/tmp-list-users.ts` are untracked
   scratch files in the app. Delete them before the commit.

## Answers to the review questions

- **(b) Ordering.** Safe. `identityOf()` writes the identity outside the transaction
  (`:592-602`) and `requestProfile()` runs after the commit (`:239`, `:355`), so the row
  exists when the task runs. `enqueue()` with no client pokes once, and only when it
  created a row (`agent-trigger.service.ts:519`). The profile handler writes only
  non-empty strings (`message-identity-profile.ts:77-88`), writes nothing on `-213`
  (`:63`) or a transient failure (`:74`), shares `reportTokenFailure` (`:70`), and never
  throws (`:38-95`). The task is `required = false` (`agent-trigger.service.ts:218`).
- **(c) Mapping.** `grep -rn "UnprocessableEntity"` finds one raise: the writer at
  `:287`. No other procedure, and no test, depends on 422. The table changes by one case
  (`domain-error.middleware.ts:31-32`) and one union member. The middleware is global
  (`trpc.module.ts:19`), so the messaging router inherits it. Safe.
- **(d) Allowlist.** `stage` is in `ALLOWED_PROPERTIES`. `permittedStage()` keeps
  `webhook | send | token | profile` and buckets the rest. The implementer added
  `profile`, which the plan did not name; the handler at
  `message-identity-profile.ts:66,92` uses it, so the pair is consistent. Decision 5 emits
  `zalo.no-token`, which passes the shape. See M3.
- **(e) Rollup.** Names match the plan. All six are counts or a boolean. `messagingSince`
  at `:452-456` derives 7 days from `WINDOW_HOURS` and `MESSAGING_WINDOW_HOURS`; both
  constants sit in the file, so the derivation survives a change to the daily window.
  `messaging_threads_bucket` uses the shared `bucket()` helper. No body, id or name is
  sent. See M2.
- **(g) Regressions.** The nine existing enqueue callers are untouched; `enqueue()` only
  gained an optional `dueAt` with the old default (`:500`). `withTasks()` keeps its shape
  and its single poke. All six specs with the new writer argument pass. The webhook
  controller logs header names only (`:258-261`) and never a body.
- **(h) Style.** No comments in the new files. No `as` cast but the pre-existing one in
  `zalo-webhook.schema.ts:18`. Every duration is in `messaging-config.ts`. Client
  functions take one object (decision 2). Schemas parse at the boundary with `z.infer`.
- **(i) Tests.** Not vacuous. `calls` is asserted exactly in the send spec at
  `:210,273,304,314,325,338,352,384,427,453,473`. The 422 tests assert the sentence text
  (`messaging-send.spec.ts:270,298,349,368`). No test asserts the tRPC code itself; the
  mapping is covered by inspection only.

## Must fix before merge

H1, H2, H3, M1 and M3. M2 and M4 can follow. The Low list is optional.

## Issues

1. RISK — A delivered message is settled FAILED when the local write throws. The rep
   sends the text twice.
   Fix: settle SENT after a 200 and keep the internal failure for the path before the
   call. See H1.
2. RISK — A crash leaves the row SENDING for ever. The bubble reads "Sending" until a
   human edits the database.
   Fix: settle FAILED with `errorCode "interrupted"` on a re-lease. See H2.
3. RISK — A non-follower costs one vendor call per inbound message. The OA hits the read
   quota and Zalo rate limits the sends. Fix: add `profileCheckedAt`. See H3.
4. RISK — Two parallel sends with one `clientRequestId` return 500.
   Fix: catch `P2002` and return the first row. See M1.
5. RISK — `messaging_unmatched` counts identities, not threads. Telemetry and the inbox
   show different numbers. Fix: count `messageThread` rows with no contact. See M2.
6. RISK — No test pins `zalo.-216` against the error-class shape. A later change sends
   `other` in silence.
   Fix: one assertion in the allowlist spec. See M3.
7. NOT DONE — The vendor message is never logged. An unknown code has no trace.
   Fix: carry `message` on the failure and log it in the agent. See M4.
8. NOT DONE — Docs and the whole `apps/app` half. The implementer reported both.
9. UNKNOWN — The `user/detail` shape is community sourced. A different shape makes every
   profile read `unparsed`. The sandbox OA check settles it.

Status: DONE_WITH_CONCERNS
Summary: The backend meets every phase 4 acceptance item and every spec passes; three
production failure modes need fixes before the manual OA check.
Concerns: A delivered message can be marked FAILED, an interrupted row stays SENDING for
ever, and a non-follower is read on every inbound message.

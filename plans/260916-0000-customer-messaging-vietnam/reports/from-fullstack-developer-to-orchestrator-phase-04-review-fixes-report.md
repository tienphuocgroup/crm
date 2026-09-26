# Phase 4 backend — review fixes H1, H2, H3, M1, M2, M3, M4

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made. Read: `AGENTS.md`,
`docs/messaging.md`, the phase 4 review and implementation reports. No skill.

## What changed

**H1 — a delivered message stays SENT.** `message-send.ts` `settle()` owns a
try/catch. On a throw it logs one object (`messageId`, `errorClass`), writes
`status = SENT, sentAt` with no `externalId`, and returns "Sent; receipt matching
is off for this message." That write swallows its own error too, so no path writes
FAILED after Zalo answers 200.

**H2 — an interrupted row settles.** `claimed()` runs when `claim.count === 0`.
With the row in `SENDING` and `task.attempts > 1` it writes FAILED, `errorCode
"interrupted"`, and the sentence "The send was interrupted inside the CRM. Check
the phone before you try again." `sentenceFor` holds it under `INTERRUPTED_CODE`.
Zalo is never called. `attempts <= 1` keeps "Already claimed."

**H3 — one profile read per person.** `ContactChannelIdentity` gains
`profileCheckedAt DateTime?`. Migration folder:
`packages/db/prisma/migrations/20260921221500_messaging_profile_checked`, one
`ALTER TABLE ... ADD COLUMN`. The handler stamps the column on success, on an
empty profile, on `-213`, and on any terminal verdict, never on a transient one.
The writer queues the task only when `displayName` and `profileCheckedAt` are
both null, and `store()` queues only when `result.stored` is true. `follow()`
clears the stamp and queues one more read.

**M1 — a parallel send returns the first row.** `MessagingService.send()` catches
Prisma `P2002` and re-reads by `threadId + clientRequestId`. Any other error, and
a missing row, rethrows.

**M2 — `messaging_unmatched` counts threads.** `rollup.service.ts` counts
`messageThread` rows with `contactId = null`.

**M3 — the shape is pinned.** `allowlist.spec.ts` holds `zalo.-216`,
`zalo.network`, `zalo.http-500`, `zalo.no-token`, and a bare `-216` as `other`.

**M4 — the vendor text is logged, never stored.** `zalo-client.ts` puts the
envelope `message` on a `reason: "code"` failure as `vendorMessage`.
`logZaloFailure()` in `zalo-errors.ts` writes one `console.error` object with
`stage`, `id`, `errorClass`, `reason` and `vendorMessage`. The three handlers
call it. No column, outcome, tRPC response or telemetry property holds the text.

## Commands

| Command | Result |
| --- | --- |
| `bun run --filter=@crm/db db:generate` | pass |
| `bunx prisma migrate deploy` (crm) | applied `20260921221500_messaging_profile_checked` |
| `bun run db:test` (crm_test) | applied the same migration |
| `bunx prisma migrate status`, both URLs | 54 migrations, "up to date" on `crm` and `crm_test` |
| `bun run check-types` | pass, 13 of 13 |
| `bun run lint` | pass, 9 of 9 (2 pre-existing warnings in `apps/app`) |
| `apps/api` full suite | 481 pass, 0 fail (was 477) |
| `apps/agent` full suite | 395 pass, 0 fail (was 392) |
| `packages/db` | 133 pass, 0 fail |
| `packages/telemetry` | 67 pass, 0 fail (was 65) |

## Issues

1. RISK — A terminal token error stamps `profileCheckedAt`. That person never
   gets a Zalo name until a follow event clears the stamp.
   Fix: not done. The brief names every terminal verdict. I caused this.
2. RISK — `messaging_unmatched` counts every unmatched thread, including threads
   of a disconnected OA. The brief also said "connected accounts".
   Fix: the inbox count has no account filter, so the two numbers now match. Ask
   the orchestrator which number telemetry must carry. I caused this.
3. NOT DONE — No test covers the outer catch of `runMessageSend`, which writes
   `errorCode "internal"`. The old test now covers the H1 path.
   Fix: not done. It needs a forced throw before the vendor call. I caused this.
4. NOT DONE — Low items 1 to 4 of the review stay open. Docs and `apps/app` stay
   with the other agents.

Status: DONE_WITH_CONCERNS
Summary: All seven review items ship; both databases carry both messaging
migrations and every suite is green.
Concerns: A token error suppresses a later profile read, and `messaging_unmatched`
counts threads on every account.

# Phase 4 backend — outbound Zalo and the identity profile task

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made.

Read: `AGENTS.md`, `docs/messaging.md`, `docs/api.md`, `docs/agent.md`,
`docs/telemetry.md`, `docs/design.md`, phase 4, the scout report, the four phase 2
and phase 3 reports, the user-profile research report. Skills: none opened; the
handlers are plain functions, not eve sessions.

## Files created

| File | Holds |
| --- | --- |
| `apps/agent/agent/lib/messaging/message-send.ts` | `runMessageSend(task)` |
| `apps/agent/agent/lib/messaging/message-identity-profile.ts` | `runMessageIdentityProfile(task)` |
| `apps/api/test/messaging-send.spec.ts` | 12 tests |
| `apps/agent/test/message-send.integration.spec.ts` | 17 tests |
| `apps/agent/test/message-identity-profile.integration.spec.ts` | 8 tests |

## Files modified

`packages/db/src/agent-tasks.ts` (kind `message-identity-profile`, direct kind,
`PRIORITY.messageProfile` 930), `packages/validation/src/messaging.ts` +
`index.ts` (`identityProfilePayload`, `zaloSendResponse`, `zaloUserProfileResponse`),
`packages/telemetry/src/{allowlist,events,index}.ts`,
`packages/telemetry/test/allowlist.spec.ts`,
`apps/api/src/agent/agent-trigger.service.ts`,
`apps/api/src/messaging/{messaging-writer.service,messaging.service,messaging.contracts,messaging.router}.ts`,
`apps/api/src/messaging/zalo/zalo-webhook.controller.ts`,
`apps/api/src/telemetry/rollup.service.ts`,
`apps/api/src/trpc/middlewares/domain-error.middleware.ts`,
`apps/api/src/generated/server.ts` (regenerated: 20 routers, 151 procedures),
`apps/agent/agent/lib/dispatch.ts`, `apps/agent/agent/lib/messaging/{messaging-config,zalo-errors,zalo-client,zalo-connection,message-token-refresh}.ts`,
`apps/api/test/{messaging-writer,messaging-reads,record-delete,fields,bulk}.spec.ts`
(one new constructor argument), `apps/agent/test/zalo-client.spec.ts`.

## The contract for the UI agent

```ts
type Eligibility =
  | { mode: "free-text"; windowClosesAt: string; repliesLeft: number }
  | { mode: "blocked"; reason: string };
```

`windowClosesAt` is an ISO string. `reason` is one fixed sentence from
`BLOCKED_REASONS`. The type is `MessagingEligibility` in
`apps/api/src/messaging/messaging.contracts.ts`.

| Procedure | Kind | Input | Output |
| --- | --- | --- | --- |
| `messaging.eligibility` | query | `{ threadId: string }` | `Eligibility` |
| `messaging.send` | mutation | `{ threadId: string; body: string (trimmed, 1..2000); clientRequestId: string (uuid) }` | `{ messageId: string; status: Status }` |

`send` throws `UNPROCESSABLE_CONTENT` with the blocked sentence as the message.
A repeated `clientRequestId` returns the first row and its current status, and
queues nothing. `eligibility` throws `NOT_FOUND` for an unknown thread.

## Decisions beyond the brief

1. **The contract is named `messagingSendInput`, not `sendInput`.** Every other
   schema in that file carries the `messaging` prefix.
2. **Vendor client functions take one object.** `sendText({ accessToken, userId,
   body })` and `readUserProfile({ accessToken, userId })` match
   `refreshAccessToken` and `readOaProfile`.
3. **422 now maps to `UNPROCESSABLE_CONTENT`.** `DomainErrorMiddleware` mapped it
   to `INTERNAL_SERVER_ERROR`, so the composer could not tell a refusal from a
   crash. No other code path raises 422.
4. **`reportTokenFailure(accountId, sentence)` lives in `message-token-refresh.ts`.**
   The send handler and the profile handler share it. It writes `tokenError`
   behind the `disconnectedAt: null` guard and books the refresh due now.
5. **A missing `accessToken` is a token failure, not a fake vendor answer.** The
   send fails with the reconnect sentence, sets `tokenError` and books a refresh.
   It never calls Zalo.
6. **Telemetry `error_class` is `zalo.<code>`.** A bare `-216` fails the allowlist
   shape and becomes `other`. `zalo.-216`, `zalo.network` and `zalo.http-500`
   pass and stay a fixed set.
7. **The writer holds `AgentTriggerService`.** `store()` and `follow()` queue the
   profile task after their own transaction, through `enqueue()` with no client,
   so dispatch is poked once. Five specs gained the third constructor argument.
8. **The profile task is queued only while `displayName` is null.** The subject
   dedupe means repeated events never pile up tasks.
9. **The 7-day telemetry window is derived from the 24-hour `since`.** `crm()`
   takes one cutoff; `MESSAGING_WINDOW_HOURS` widens it for the message counts.
10. **`messaging_error` carries `error_class` and `stage` only.** No
    `error_source`, per the phase's success criterion.

## Commands

| Command | Result |
| --- | --- |
| `bun run check-types` (root) | pass, 13 of 13 |
| `bun run lint` | pass, 9 of 9 |
| `apps/api` full suite | 477 pass, 0 fail, 39 files (was 462) |
| `apps/agent` full suite | 392 pass, 0 fail, 34 files (was 356) |
| `packages/db` | 133 pass, 0 fail |
| `packages/telemetry` | 65 pass, 0 fail (was 61) |
| `packages/validation` | 5 pass, 0 fail |
| `grep -rli zalo apps/api/src` | `messaging/**`, `env.validation.ts`, `generated/server.ts`, two task reasons, one telemetry property |
| `grep -rn "message/cs" apps/api/src` | no match. Nest never sends |

## Issues

1. RISK — A person who does not follow the OA gets one profile read per inbound
   message. Each read costs one vendor call and returns `-213`.
   Fix: not done. Needs a `profileCheckedAt` column or a negative cache. I caused this.
2. RISK — A numeric `user_id` above 2^53 loses precision in `JSON.parse` before
   Zod reads it. The parsed id is wrong.
   Fix: not done. The CRM never writes that field; it sends the stored string id.
3. RISK — A `SENDING` row whose process dies stays `SENDING` forever. The bubble
   reads "Sending" until a human settles it.
   Fix: not done. Needs a sweep for `SENDING` rows older than the lease.
4. RISK — A send that times out after Zalo accepted it shows `FAILED`. A retry
   puts the text on the phone twice.
   Fix: this is the plan's rule. Zalo has no idempotency key on sends.
5. RISK — `disconnect()` completes open `message-send` tasks but not open
   `message-identity-profile` tasks. Those tasks run once and return one sentence.
   Fix: accepted. The handler refuses a disconnected account and writes nothing.
6. NOT DONE — No docs. `docs/messaging.md`, `docs/api.md`, `docs/agent.md`,
   `docs/telemetry.md`, `docs/connections.md` and the `AGENTS.md` index row are
   the docs agent's half.
7. NOT DONE — The whole `apps/app` half: the composer, the bubble states, the
   polling, the contact sheet tab, `cache.ts`.
8. UNKNOWN — The `user/detail` response shape is community sourced, not official.
   A different shape makes every profile read `unparsed`.

Status: DONE
Summary: A rep's reply is one row plus one task; the agent claims it, calls Zalo
once, and settles it; a new task fills the Zalo name and avatar; every suite is
green.
Concerns: The profile endpoint shape is unverified, and a non-follower is read
again on every inbound message.

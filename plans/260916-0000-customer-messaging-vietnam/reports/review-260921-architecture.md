# Architecture review: Zalo Official Account chat

Date: 2026-09-21.
Scope: plan phases 1 to 4, queue code, token refresh code, persistence code, and dispatch code.
Method: repository inspection against current source files. No implementation changes.

## Additional findings

### Finding 1: Activity stamps escape the messaging transaction

- Severity: High
- Location: Phase 3, `Writer service`, steps 1 to 7; Phase 3, `linkContact` and `unlinkContact`.
- The plan calls `ActivityStampService.touch()` while claiming one writer transaction.
- `ActivityStampService.touch()` writes through `this.db`, not the transaction client.
- A later transaction failure leaves `Contact.lastActivityAt` or `Company.lastActivityAt` advanced without the activity.
- The same race affects link and unlink operations because both call the service from a transaction.
- Evidence: `apps/api/src/crm/activity-stamp.service.ts:27-51` uses `this.db`; `:89-103` already accepts a transaction client for another operation.
- Evidence: `phase-03-inbound.md:117-126`, `:131-135` place stamping inside writer transactions.
- Minimal fix: add an optional transaction client to `touch()` and use it from every messaging transaction.
- Test: force the activity transaction to fail after stamping and assert both record timestamps remain unchanged.

### Finding 2: OAuth return paths can become open redirects

- Severity: High
- Location: Phase 2, OAuth step for `GET /api/messaging/zalo/connect`.
- The plan accepts any value that starts with `/` and does not start with `//`.
- A path containing a backslash can normalize into an authority when the browser follows the redirect.
- The plan also appends `?provider=zalo` even when `returnTo` already contains a query.
- The callback can therefore redirect outside the app or lose the requested tab and filter.
- Evidence: `phase-02-schema-and-zalo-connection.md:313-314` defines the prefix check and query concatenation.
- Minimal fix: parse the return path with `URL`, require the configured app origin, and add parameters with `searchParams`.
- Test: reject backslash, encoded authority, foreign origin, and malformed query cases.

### Finding 3: Refresh backoff resets after every transient failure

- Severity: High
- Location: Phase 2, agent handler steps 5 to 7.
- The handler derives the delay from `task.attempts` and then creates a successor task.
- A new successor starts with zero attempts, so every transient failure selects the first delay.
- A persistent Zalo outage therefore schedules refreshes every five minutes forever.
- The configured 30-minute and two-hour delays never run.
- Evidence: `phase-02-schema-and-zalo-connection.md:335-339` creates a new task with `scheduleTask()` and derives delay from attempts.
- Evidence: `apps/agent/agent/lib/tasks.ts:44-65` increments attempts only on claim; `:168-181` creates a fresh row.
- Minimal fix: persist a refresh failure count in the refresh payload or account state, and reset it only after success.
- Test: run four transient failures and assert delays use five minutes, thirty minutes, two hours, then two hours.

### Finding 4: Task deduplication is not serialized in the agent scheduler

- Severity: High
- Location: Phase 2, `rebook(task, dueAt)` and `scheduleTask()` changes.
- The planned subject filter still performs separate find and create operations.
- Two concurrent refresh requests can both observe no successor and create two open tasks for one account.
- Two workers can then call the single-use refresh endpoint concurrently.
- One request can burn the refresh token while the other writes a terminal error.
- Evidence: `apps/agent/agent/lib/tasks.ts:149-181` currently performs find, then update or create without a transaction lock.
- Evidence: `packages/db/src/idempotency.ts:3-10` provides the repository lock pattern, but the plan does not require it for `scheduleTask()`.
- Minimal fix: wrap subject scheduling in a transaction and lock `message-token-refresh:<accountId>` before find and create.
- Test: run concurrent rebooks for two workers and assert one open successor and one provider refresh call.

## Concerns already addressed by the plan

- The plan adds `SENDING` to protect a claimed outbound row from a second lease.
- The plan adds `MessageReceipt` buffering for receipts that arrive before `externalId` exists.
- The plan separates terminal token errors from transient refresh failures.
- The plan removes contact and company ids from messaging tasks before direct dispatch.
- The plan uses fixed error sentences instead of storing vendor text in message rows.

## Issues

1. RISK — Messaging activity stamps can commit outside the writer transaction. Failed writes leave stale record timestamps.
   Fix: pass the transaction client into `ActivityStampService.touch()` and test rollback.
2. RISK — OAuth return paths accept browser-normalized backslashes. A callback can redirect outside the app.
   Fix: validate one configured origin with `URL` and append query values with `searchParams`.
3. RISK — Transient refresh backoff resets on every successor task. A provider outage causes five-minute refresh traffic forever.
   Fix: persist the failure count and reset it after a successful refresh.
4. RISK — Agent refresh scheduling uses an unlocked find-create sequence. Concurrent refresh requests create duplicate tasks and burn single-use tokens.
   Fix: reuse `lockIdempotencyKey()` inside one scheduling transaction.

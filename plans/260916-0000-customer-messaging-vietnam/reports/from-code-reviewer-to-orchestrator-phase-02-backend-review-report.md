# Phase 2 backend review — Zalo Official Account connection

Date 2026-09-21. Branch `feat/zalo-oa-chat`. Review only. No file changed except this report. Read: `AGENTS.md`, `docs/messaging.md`, `docs/api.md`, `plan.md`, phase 2, the implementer
report, then the diff and the untracked files in the brief. `apps/app` and `packages/ui` not
read, by instruction.

## Gates

| Command | Result |
| --- | --- |
| `bun run check-types` | pass, 13 of 13, FULL TURBO |
| `bun run lint` | pass, 9 of 9, FULL TURBO |
| `packages/db` `bun test test/messaging.spec.ts` | pass, 16 of 16 |
| `apps/agent` `bun test test/zalo-client.spec.ts` | pass, 20 of 20 |
| `packages/telemetry` `bun test` | pass, 61 of 61 (`TASK_KINDS` feeds the allowlist) |

The coordinator ran the database specs, all green. A scratch-database `prisma migrate deploy`
was denied by the sandbox, so "applies on a fresh database" is read, not executed.

## Findings

### High

**1. A Zalo 5xx that carries an error envelope is classified terminal and kills the OA.**
`apps/agent/agent/lib/messaging/zalo-client.ts:41-54`. The error envelope is parsed before
`response.ok` is tested. A body of `{"error":-1,"message":"internal"}` returned with HTTP 500
becomes `{ reason: "code" }`, and `zalo-errors.ts:45` makes every non-`-32` code terminal.
`message-token-refresh.ts:100-104` then writes `tokenError` and books nothing.
Why it matters: one Zalo server-side incident that answers 500 with a JSON body permanently
marks the OA "Needs a reconnect". Every rep is blocked until an admin reconnects by hand. This
is the exact failure the phase lists under Risk Assessment, and `docs/messaging.md` fact D puts
"Any 5xx" in the transient column.
Fix: test the status first in `call()` — `if (response.status >= 500) return { ok: false,
failure: { reason: "http", status: response.status } };` before the envelope branch. Add a case
to `zalo-client.spec.ts`: `answers({ error: -216 }, 500)` must yield `reason: "http"`.

**2. The OAuth controller does not parse its query at the boundary, and the schemas written for
that job are dead.** `apps/api/src/messaging/zalo-oauth.controller.ts:17,31,32` types `returnTo`,
`code` and `state` as `string | undefined` and passes them straight through.
`zalo-oauth.schema.ts:14-22` defines `zaloConnectQuery` and `zaloCallbackQuery`, which nothing
imports (`grep` finds zero call sites). Express 5.2 with the simple query parser turns a
repeated key into an array, so `?returnTo=/a&returnTo=/b` reaches
`messaging-config.ts:90` as an array and `value.startsWith` throws a `TypeError`; `?state=a&state=b`
reaches `verification.findFirst({ where: { id: [...] } })` and throws a Prisma validation error.
Why it matters: any signed-in member turns `/connect` and `/callback` into an unhandled 500. It
also breaks the `AGENTS.md` rule "Parse at the boundary, never pass `Record<string, unknown>`
around", while the schema that would have done it sits unused.
Fix: parse in the controller — `const { returnTo } = zaloConnectQuery.parse(query)` and
`zaloCallbackQuery.parse(query)` — and pass the parsed values. A parse failure is a 400.
Delete `zaloErrorEnvelope` from `zalo-oauth.schema.ts:6`; nothing reads it either.

### Medium

**3. The transient backoff never escalates and can run forever.**
`apps/agent/agent/lib/messaging/message-token-refresh.ts:33-38,106-110`. `backoffMs()` indexes
`transientRetryMs` by `task.attempts - 1`, but each transient failure completes the running row
and `rebook()` **creates a new row** (`tasks.ts:184`) with `attempts = 0`. `claimDue()` leases it
at `attempts = 1`, so the index is always 0. The 30-minute and 2-hour steps are unreachable.
`MAX_ATTEMPTS` also never bites, because it counts per row.
Why it matters: a Zalo endpoint that answers a non-5xx HTTP error or an unreadable body retries
every five minutes forever. `tokenError` stays null the whole time, so the card stays green and
`eligibility()` keeps saying "free-text" while the access token quietly expires 25 hours later
and every send fails with no reason on the surface.
Fix: carry the attempt count in the payload (`{ accountId, transientAttempt }`) and index on it,
and after the last step write `tokenError` so the card tells the truth.

**4. `message-token-refresh.integration.spec.ts:155` does not assert the rebook time.**
It asserts only `dueAt > Date.now()`. The criterion is "rebooks at `tokenExpiresAt -
refreshAheadMs`". The assertion passes if the code rebooks one millisecond from now, which is a
hot loop on the visible lane.
Fix: assert the value — `expect(Math.abs(open[0].dueAt.getTime() - (expiresAt - MESSAGING.zalo.refreshAheadMs))).toBeLessThan(5_000)`.

**5. Two `.every()` assertions pass on an empty array.**
`apps/api/test/zalo-oauth.spec.ts:421` and `apps/api/test/zalo-connection.spec.ts:263`. If no
row were ever completed, `[].every(...)` is `true` and the outcome sentence is never checked.
In `zalo-oauth.spec.ts` the array is not otherwise constrained, so the "Replaced by another OA"
sentence is effectively untested.
Fix: assert the length first — `expect(replaced).toHaveLength(1)` and
`expect(settled).toHaveLength(2)`.

**6. The `handleDirect()` branch has no test.** `apps/agent/agent/lib/dispatch.ts:139` is the
only place outside the handler that names `message-token-refresh`; `grep` finds no test that
reaches it. Every refresh spec calls `runMessageTokenRefresh()` and `completeTask()` by hand.
The phase says the test asserts state "after `handleDirect()` returns".
Why it matters: a typo in the kind string, or a branch placed after a matching fallthrough,
leaves refresh tasks unhandled forever and no spec fails.
Fix: `runDirect(task)` is exported and defaults `handle` to `handleDirect`. Drive one case
through it.

**7. The PKCE challenge is asserted only as truthy.** `apps/api/test/zalo-oauth.spec.ts:185`.
The implementer's own issue 3 names the encoding as the top vendor risk. The verifier is
readable from the `Verification` row, so the challenge is checkable exactly.
Fix: `expect(challenge).toBe(createHash("sha256").update(verifier, "ascii").digest("base64url"))`,
plus `expect(challenge).not.toContain("=")`.

**8. `attachmentHosts` silently diverges from the phase spec.**
`packages/db/src/messaging.ts:8` holds `["zdn.vn", "zadn.vn"]`. The phase specifies
`["zalo.me", "zdn.vn"]`, and `docs/messaging.md` fact E says `zadn.vn` has never been seen in a
payload. `packages/db/test/messaging.spec.ts:31` asserts the new list, so the test locks in the
deviation. The implementer's report does not record it as a decision.
Why it matters: phase 3 validates attachment URLs against this list. Dropping `zalo.me` can
refuse a real attachment; adding an unobserved host widens what is trusted.
Fix: restore the plan's list, or record the change in `docs/messaging.md` with the reason.

### Low

**9. A booking failure inside `adopt()` returns 500, not an error redirect.**
`apps/api/src/messaging/zalo/zalo-oauth.service.ts:323-327` calls `messageTokenRefreshDue()`,
which passes `required = true`, and `agent-trigger.service.ts:458` rethrows. The transaction
rolls back, so the authorisation code is burned and the admin sees a raw 500. The phase asks for
`<returnTo>?provider=zalo&error=<code>` on failure.
Fix: catch around `adopt()` in `complete()` and return `this.redirect(returnTo, "book")`.

**10. `returnTo` with a fragment loses the redirect parameters.**
`zalo-oauth.service.ts:383` splits on `?` only. `/x#y` produces `…/x#y?provider=zalo`, read as a
fragment, so `connectErrorOf()` sees nothing. Fix: strip from the first `#` as well. No open
redirect exists: `isSafeReturnTo()` blocks `//` and `/\`, and the origin is `appBaseUrl()`.

**11. `readZaloAccount()` selects `accessToken`, which phase 2 never reads.**
`apps/agent/agent/lib/messaging/zalo-connection.ts:41`. Narrow the select until phase 4 needs it.

**12. Two tunables live in two places.** `expiresInSeconds * 1000` at
`zalo-oauth.service.ts:279` and `zalo-connection.ts:63`; `refreshEveryMs = 6 * HOUR_MS` at
`apps/api/src/messaging/messaging-config.ts:39` and
`apps/agent/agent/lib/messaging/messaging-config.ts:8`. Tuning one desynchronises the first
booking from every rebooking.

**13. The "window closed" sentence prints an ISO timestamp.**
`packages/db/src/messaging.ts:30`. A Vietnamese rep reads `2026-09-23T04:00:00.000Z`. Decision 7
of the implementer's report. Phase 3 must format it in the composer.

**14. A second `disconnect` throws 404.** `zalo-connection.service.ts:96`. The mutation is not
idempotent. Two clicks on a slow network produce an error toast.

**15. `disconnect` and `replaceOthers` complete every open `message-send` row, not the OA's.**
`zalo-connection.service.ts:126-132`, `zalo-oauth.service.ts:370-376`. Decision 6, correct while
one OA serves the workspace. Reconnecting the *same* OA also cancels its own queued sends.

## Criteria checked and passing

- `zalo.status` selects no token column (`zalo-connection.service.ts:43-54`) and the spec proves
  it by both key and value (`zalo-connection.spec.ts:122-133`). The generated contract carries
  `ZaloStatus`, which has no token field.
- `state` is bound to the user: the value holds `userId` (`zalo-oauth.service.ts:61-65`) and the
  callback refuses a different session before any fetch (`:94-97`, spec `:307-323`).
- Single use is real: `findFirst` then `deleteMany` with a `count` check (`:165-168`) makes a
  concurrent replay lose the race.
- The role check runs before any exchange in both entry points (`:47`, `:86`).
- `disconnect` clears both tokens, sets `disconnectedAt` and completes the open refresh and send
  rows in one `$transaction` (`zalo-connection.service.ts:103-133`).
- Refresh steps 1-8 match, including the `disconnectedAt: null` guard written before anything
  else (`zalo-connection.ts:57-59`) and the "Disconnected during refresh." path.
- Letting database errors throw is right. `write()` in `apps/agent/agent/lib/enrichment.ts:29`
  returns early when the task has no `contactId` and no `companyId`, so neither
  `reconcileDirect()` nor `retireAbandoned()` can touch `enrichmentStatus` for a message task.
  Red team finding 5 holds. One residual: three failed leases retire the row and end the refresh
  chain for that OA until someone reconnects.
- `scheduleTask()` `subject` and `exceptId` are additive; `schedule_recheck.ts:41` passes no
  payload, so the new update branch spreads `{}` and its behaviour is unchanged.
  `tasks.integration.spec.ts:223-283` proves both semantics, including the count of open rows.
- `enqueue()` keeps `dueAt: task.dueAt ?? new Date()`. Ten call sites, nine pre-existing, none
  passes `dueAt`.
- Missing `ZALO_APP_ID`: every env read sits inside a function, nothing throws at import, the
  module only warns on a half pair (`messaging.module.ts:19-26`), `/connect` answers 403,
  `status` answers `configured: false`, and the handler returns a sentence.
- Migration: additive, matches the models field for field, all six FKs and all eleven indexes
  present, `SetNull` on `contactChannelIdentity.contactId`, `messageThread.contactId` and
  `.companyId`, `Cascade` on `activity.messageThreadId`, and the `MessageReceipt` unique triple.
  `ALTER TYPE "ActivityType" ADD VALUE 'MESSAGE'` sits alone in its statement and follows the
  precedent of `20260810120000_website_tracking/migration.sql:2`.
- OAuth wire shape matches fact D: four authorize parameters and no `code_challenge_method`,
  verifier 43 characters, `base64url` digest with no padding, form body with `code`, `app_id`,
  `grant_type` and `code_verifier`, `secret_key` in the header, `expires_in` coerced, profile
  read from `oaid` and `is_verified`, missing `state` tolerated through the newest row of this
  session. Every redirect carries `provider=zalo`.
- Logging follows `docs/api.md`: one object per line, no query string, no body, no vendor text,
  no ids beyond `userId` and `accountId`.
- No code comments in any new file. Nothing writes vendor text to a column.

## Verdict

APPROVE_WITH_FIXES.

Must fix before phase 3 starts:

1. Finding 1 — 5xx before the error envelope in `zalo-client.ts`, with a spec case.
2. Finding 2 — parse the controller query with the schemas that already exist; drop the dead one.
3. Finding 4 — assert the real rebook time.
4. Finding 5 — length before `.every()` in both API specs.
5. Finding 6 — one case through `runDirect()`, so the dispatch branch is covered.

Findings 3, 7 and 8 should be fixed in this phase. The rest can ride into phase 3.

Status: DONE_WITH_CONCERNS
Summary: The schema, migration, OAuth pair, tRPC router and refresh handler meet the phase
criteria. Two defects matter: a Zalo 5xx with a JSON body is treated as terminal and kills the
OA, and the controller never parses its query although the Zod schemas for it were written.
Concerns: the transient backoff never escalates and never surfaces, the dispatch branch has no
test, and three assertions pass vacuously.

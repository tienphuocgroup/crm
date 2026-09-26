# Phase 2 review fixes — Zalo OA connection

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit. Read `AGENTS.md`, `docs/messaging.md`,
the phase 2 review, the phase 2 spec.

## What changed

1. **5xx before the envelope.** `zalo-client.ts:45` tests `response.status >= 500` and returns
   `{ reason: "http", status }` before the error envelope is parsed. `classify()` makes `http-*`
   transient. `zalo-client.spec.ts` gets "treats a 500 that carries an error code as transient":
   body `{"error":-216}` with status 500 yields `http`, and `terminal` is `false`.
2. **The controller parses its query.** `zalo-oauth.controller.ts` takes `@Req()` and runs
   `zaloConnectQuery.safeParse(request.query)` and `zaloCallbackQuery.safeParse(request.query)`.
   A `/connect` failure is a `BadRequestException`. A `/callback` failure redirects to
   `oauth.errorTarget("state")`, a new public method that uses the same `redirect()` and
   `fallbackReturnTo` as the service. `returnTo` now refuses `#` and `?`, so the appended
   `?provider=zalo&…` cannot land in a fragment. `zaloErrorEnvelope` is deleted from
   `zalo-oauth.schema.ts`; `packages/validation/src/messaging.ts` owns it.
   `adopt()` runs inside `try`; a booking failure logs one line and redirects with `error=book`.
   `zalo-connect-button.tsx` maps `book`, with `zaloConnectErrorBook` in the en and vi catalogs.
   Three spec cases: repeated `returnTo` → 400 and no `Verification` row; `returnTo=/x#y` → 400;
   repeated `state` → one redirect with `provider=zalo&error=state` and zero fetch calls.
3. **Backoff escalates.** `tokenRefreshPayload` carries
   `attempt: z.number().int().nonnegative().default(0)`. `backoffMs()` indexes on the payload
   attempt, clamped to the last step. The transient branch rebooks with `attempt + 1`; success
   and not-due rebook with `0`. A transient failure whose `tokenExpiresAt <= now` also writes
   `tokenError = "Zalo did not answer."` through `writeTokenError()`, which keeps the
   `disconnectedAt: null` guard, and still rebooks. `subject` stays `accountId` only.
   Four new spec cases: 5 min → 30 min → 2 h across three runs with `payload.attempt` 1, 2, 3;
   an attempt past the table holds 2 h; an expired token writes the sentence and rebooks;
   success resets `attempt` to 0 and clears `tokenError`. The not-due case now asserts
   `dueAt ≈ tokenExpiresAt - MESSAGING.zalo.refreshAheadMs` within 5 s.
4. **Weak assertions.** `zalo-oauth.spec.ts` asserts `toHaveLength(1)` before the `.every()` on
   replaced rows; `zalo-connection.spec.ts` asserts `toHaveLength(2)` before its `.every()`.
   The authorize test reads the verifier from the `Verification` row and asserts
   `code_challenge === createHash("sha256").update(verifier,"ascii").digest("base64url")`
   and that it carries no `=`.
5. **Dispatch branch covered.** `message-token-refresh.integration.spec.ts` drives a leased task
   through `runDirect(task)` from `apps/agent/agent/lib/dispatch.ts`. It asserts `finishedAt` is
   set, `outcome` is the handler's sentence, and one open rebooked row exists.
6. **Narrower read.** `readZaloAccount()` drops `accessToken` from the select and from
   `ZaloAccount`. It is the smallest change: the function has one caller. Phase 4 adds its own
   reader for the send token rather than widening this one.
7. **Attachment hosts.** `MESSAGING_POLICY.zalo.attachmentHosts` is
   `["zdn.vn", "zadn.vn", "zalo.me"]`; `messaging.spec.ts` asserts all three.
   `docs/messaging.md` gains four bullets under "Decisions the facts forced": the three-domain
   allowlist with subdomains, `http` accepted on an allowlisted host with an `https` upgrade in
   the bubble, a failing attachment dropped while the event is stored and answered 200 with one
   warn log naming the host, and the escalating backoff with the expired-token sentence.

## Gates

| Command | Result |
| --- | --- |
| `bun run check-types` | pass, 13 of 13 |
| `bun run lint` | pass, 9 of 9 |
| `packages/db` `bun test` | pass, 133 of 133 |
| `packages/validation` `bun test` | pass, 5 of 5 |
| `apps/agent` `bun test` | pass, 356 of 356 (was 350) |
| `apps/api` `bun test --preload ./test/setup.ts` | pass, 386 of 386 (was 383) |
| `bun run i18n:check` | pass, 0 findings |

## Issues

1. RISK — `redirect()` in `zalo-oauth.service.ts` still splits on `?` only. A `returnTo` with a
   `#` loses the redirect parameters.
   Fix: not done. The controller now refuses `#` and `?`, so no caller reaches it. `start()` is
   reachable only through the controller.
2. NOT DONE — Review findings 12, 13, 14 and 15 ride into phase 3: the duplicated
   `expiresInSeconds * 1000` and `refreshEveryMs`, the ISO timestamp in the window-closed
   sentence, the non-idempotent second `disconnect`, and `message-send` rows cancelled workspace
   wide.
3. RISK — The `book` redirect burns the authorisation code. The transaction rolls back, so the
   admin must start the connect again.
   Fix: not done. The code is single use and 10 minutes long; a retry is one click.

Status: DONE
Summary: All seven review fixes ship. Every gate is green, with nine new spec cases.
Concerns: `redirect()` keeps its fragment bug behind a boundary that now refuses fragments.

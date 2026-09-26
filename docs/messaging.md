# Messaging — the Zalo Official Account, the inbox, threads, the webhook, sends

Read `docs/api.md` before touching `apps/api`, `docs/agent.md` before `apps/agent`,
`docs/connections.md` for the connection page, `docs/design.md` and `docs/i18n.md`
for the inbox. The plan is `plans/260916-0000-customer-messaging-vietnam/`.

## The API is the HTTP boundary, and the writer is the only writer

`apps/api/src/messaging` serves tRPC and the webhook. `MessagingWriterService` is
the only code that writes `MessagingAccount`, `ContactChannelIdentity`,
`MessageThread`, `Message`, `MessageReceipt` and the `MESSAGE` activity. The
webhook controller parses the wire format and hands over one
`IncomingChannelMessage`; `MessagingService` reads, and hands a draft to
`queueOutbound`. A second writer is how one rule comes to be true on the inbound
path and false on the outbound one.

A send is one row plus one task in one transaction:
`agent.withTasks((tx, queue) => writer.queueOutbound(tx, queue, draft))`.
`withTasks()` owns the transaction and pokes dispatch once after the commit.

## The agent talks to Zalo. The API has one exception

Every send, every token refresh and every profile read is in
`apps/agent/agent/lib/messaging`. Nest writes an `AgentTask` row and stops. The
one exception is the OAuth exchange — `zalo-oauth.service.ts` posts the
authorization code and reads `oa/getoa` once — because a redirect callback has
nobody to wait for it. `grep -rn "message/cs" apps/api/src` must stay empty.

## A row is the message, and a row is sent once

- **The client sends a `clientRequestId`.** `@@unique([threadId, clientRequestId])`
  holds it. A double click, or a second "Try again" with the same id, returns the
  first row and its status and queues nothing.
- **The handler claims the row before it calls Zalo.**
  `updateMany({ where: { id, status: "QUEUED" }, data: { status: "SENDING" } })`.
  A count of 0 on a first lease returns "Already claimed." and stops. A count of
  0 on a re-lease (`task.attempts > 1`) with the row still `SENDING` means the
  earlier run died between the claim and Zalo's answer: the handler settles the
  row `FAILED` with `errorCode = "interrupted"` and never calls Zalo, so a row
  cannot stay `SENDING` for ever and the text is never sent twice.
- **A throw after Zalo's 200 still settles `SENT`.** The settle step has its own
  catch that writes `SENT` without `externalId`. The text is already on the
  phone, so `FAILED` there would invite a duplicate.
- **A timeout is `FAILED`, never an automatic retry.** Zalo has no idempotency key
  on a send, so a retry after a timeout Zalo accepted puts the text on the phone
  twice. The rep reads the sentence, presses "Try again", and decides.
- **`runMessageSend` never throws.** The whole body sits in one try/catch, because
  a throw out of a direct handler reaches `reconcileDirect()` and the task is
  re-leased. The catch writes `FAILED` with `errorCode = "internal"`.

## Eligibility is computed twice from one pure function

`eligibility()` in `@crm/db/messaging` is pure and imports nothing. The API calls
it in `queueOutbound` and refuses a blocked verdict with 422 and the reason
sentence. The agent calls it again in `runMessageSend`, with a fresh `now`, and
a blocked verdict there settles the row `FAILED` **before** any outside call.
Two gates, one rule: no send leaves the CRM outside the 48-hour window.

`messaging.eligibility` returns the same verdict to the composer, so the rep reads
the refusal before typing instead of after sending.

## Token refresh is a task, and a set `tokenError` makes it due

`message-token-refresh` reschedules itself: `refreshAheadMs` before the access
token expires on success, and 5 min, 30 min, then 2 h on a transient failure. It
never gives up. `reportTokenFailure()` writes `tokenError` behind the
`disconnectedAt: null` guard and books the refresh due now — and a set
`tokenError` makes the handler due whatever `tokenExpiresAt` says, so the next run
clears it. `tokenError` blocks the composer through `eligibility()`, so a dead
token stops a send instead of burning one.

A 401-class send failure re-reads the account once. When `tokenRefreshedAt` moved
since the first read, the send retries once with the newer token: the visible lane
runs six tasks at once and a refresh lands mid-send.

## Zalo errors are codes and fixed sentences

`classifySendError()` maps a failure to `{ code, terminal }`, and
`sentenceFor(code)` maps the code to one of six sentences: reconnect, rate
limited, did not answer, unexpected shape, interrupted, refused.
`Message.errorMessage` and `MessagingAccount.tokenError` hold one of those
sentences and nothing else. Zalo's own text rides on the failure as
`vendorMessage` and reaches only `logZaloFailure()`'s log object — never a
column, never a task outcome, never the browser. Telemetry carries
`zalo.<code>`, never the text.

## Identity is opaque and per account

A Zalo user id means nothing outside the OA that received it, so
`ContactChannelIdentity` is unique on `(channel, accountId, externalId)` and
carries the link to a `Contact`.

- **Link and unlink write the identity, the thread and the activity together.**
  Unlink is the one undo: it nulls `contactId` on all three and keeps every
  message.
- **A contact delete keeps the history.** Both `contactId` columns are `SetNull`,
  so the thread returns to Unmatched with its messages.
- **"Delete conversation" is the erasure.** It deletes the
  `ContactChannelIdentity`, and the cascade takes the thread, every message and
  the activity. Nothing else removes a body from this install.

## The name comes from a task, not from the event

A Zalo message event carries an id and no name. The writer queues
`message-identity-profile` when a message is stored and `displayName` and
`profileCheckedAt` are both null, deduped on the identity id, and the handler
reads `oa/user/detail` and fills the name and the avatar. `profileCheckedAt` is
the negative cache: it is stamped on success, on an empty profile, on `-213`
(the person does not follow the OA), and on any other terminal Zalo error that is
not a token error, so a non-follower costs one vendor call, not one per message.
A token failure books a refresh and leaves the stamp alone. A transient failure
leaves it alone too. A `follow` event clears the stamp and queues one more read. Until a name arrives
the UI reads "Zalo user ····7890", from the last four digits of the id.

## Irreversible things are bounded in writing

A send reaches a customer's phone and cannot be recalled, so the composer states
its own limits. Inside the window it names the hour the window closes. Outside
it, it shows one sentence and **no input** — a disabled textarea invites a
retry, a missing one does not. See `docs/connections.md`.

## Optional, and it never throws

`ZALO_APP_ID` and `ZALO_APP_SECRET` are both or neither: one alone configures
nothing. `ZALO_OA_SECRET_KEY` is optional on its own, and the webhook check falls
back to `ZALO_APP_SECRET`. With none of them set the connection page shows the
pre-connect state, `/messages` shows the pre-connect page, and every handler
returns "Zalo is not configured on this install." Nothing throws.

## Bodies are personal data

A message body is what a customer wrote to a business. It is **never logged**,
**never in telemetry**, and never in an `AgentTask` payload — the task carries a
`messageId` and the handler reads the row. Log lines carry ids and counts.
Telemetry carries counts and error classes. The only copy is the `Message` row,
and "Delete conversation" erases it.

## The webhook is a gate, then a fast 200

`POST /api/messaging/zalo/webhook`, anonymous, in this order:

1. **Content type.** Anything but `application/json` is 401, and no body is read.
2. **Raw bytes.** `rawBody()` takes the captured `request.rawBody` buffer, or
   reads the stream itself, capped at 64 KB. The signature covers the wire bytes,
   and `JSON.parse` plus re-serialisation changes them, so a body parser that
   consumed the stream first throws `ParsedBodyError`. 413 over the cap, 400 on a
   read failure.
3. **Signature.** `sha256(app_id + raw_body + timestamp + oa_secret_key)`, hex,
   compared in constant time. The header value is accepted bare or behind a
   `mac=` prefix, because sources show both. A failure is 401 and, outside
   production, one debug line that names the header **names** only.
4. **Timestamp.** More than 2 hours from now is 401. The tolerance is that wide
   because a Zalo retry an hour later carries the original body and timestamp.
5. **Then 200, fast.** An unknown event, an event that fails its schema, and an
   event for no connected OA are all 200: Zalo disables a webhook that keeps
   failing, and a dropped event loses a customer's message. Only a write that
   fails answers 500, which is what makes Zalo retry.

An attachment on a host outside `MESSAGING_POLICY.zalo.attachmentHosts` is dropped
and the event is stored without it. The event is never dropped for an attachment.

## The inbox polls at 10 s, the composer at 2 s while a send is pending

`MESSAGING_UI` (`apps/app/components/crm/messaging/messaging-ui-config.ts`) holds
every interval. The thread list and the open thread refresh every 10 s. While any
row in view is `QUEUED` or `SENDING`, the message query drops to 2 s and returns
to 10 s when the last one settles. The rail badge reads `zalo.status` once per
10 min and starts its 30 s unread poll only when an OA is connected.

There is no push. A `SENT` row becomes `DELIVERED` and then `READ` from webhook
receipts, which the poll picks up.

## Verified Zalo facts

Checked 2026-09-16, 2026-09-21 and 2026-09-22. `developers.zalo.me` is a
client-rendered app and cannot be fetched. `docs.zaloplatforms.com` is Zalo's
own document hub, pre-rendered, and serves the same tree: its slugs are in the
`developers.zalo.me` JS bundle. Facts marked *mirror* or *official hub* come
from it. Facts marked *community* come from open-source code and forum threads
only. Full sources:
`plans/260916-0000-customer-messaging-vietnam/reports/research-260916-2123-zalo-facts-a-to-e-verification-report.md`,
`research-260922-0240-zalo-oa-api-official-source-report.md`
and `research-260921-1900-zalo-signature-and-authorize-url-report.md`.

| Fact | Value | Confidence | Where it lands |
| --- | --- | --- | --- |
| A. Free reply window | 48 hours from the customer's last message | Verified, `oa.zalo.me` | `MESSAGING_POLICY.zalo.replyWindowMs` |
| A. Free replies per window | Unlimited inside the 48 hours since 2026-01-01. The send response dropped `remain` after 2026-03-01 | Verified 2026-09-22, [official hub](https://docs.zaloplatforms.com/docs/OA/tin-nhan/quan-ly-tin-nhan/kiem-tra-han-muc-gui-tin-nhan) | Nowhere. The CRM holds no quota |
| A. Outer send window | 7 days through the OpenAPI. Not used: this CRM never sends a paid message | Verified | Nowhere |
| B. Signature header | `X-ZEvent-Signature` | Community | `zalo-signature.ts` |
| B. Signature formula | `sha256(app_id + raw_body + timestamp + oa_secret_key)`, hex. Plain SHA-256, not HMAC. `timestamp` is the body field | Official SDK code (`zaloplatform/zalo-java-sdk` `MacUtils.buildMac`, 2023-12-25) plus community implementations. No official prose page | `zalo-signature.ts` |
| B. Header value shape | Bare hex in most sources. One implementation and one community quote show `mac=<hex>`. Both are accepted | Community, conflicting | `zalo-signature.ts` |
| B. Which secret | A distinct "OA secret key" shown in the developer console under the webhook settings. It is not the app secret | Community | `ZALO_OA_SECRET_KEY`, falls back to `ZALO_APP_SECRET` |
| B. Body `timestamp` | String of epoch milliseconds, 13 digits | Mirror | Webhook schema |
| C. Retry trigger | Connection failure. A non-2xx or a reply slower than 2 s is documented as "webhook not working", retry not stated | Mirror | Webhook answers 200 fast, 500 on a write failure |
| C. Retry schedule | 30 s, 5 min, 15 min, 30 min, 1 h. Same body, header `num_retry`. Then the webhook is disabled | Mirror | `MESSAGING_API.webhook.clockSkewMs` is 2 hours so a retried body still passes |
| C. Ordering | Not documented. Assume at-least-once and out of order | Unknown | Dedupe on `(threadId, externalId)`. `max()` on timestamps |
| D. Authorize URL | `https://oauth.zaloapp.com/v4/oa/permission?app_id&redirect_uri&code_challenge&state`. No `code_challenge_method`, S256 is fixed | Official PHP SDK plus mirror | `zalo-oauth.service.ts` |
| D. Callback query | `code` and `oa_id`. `state` echo is not guaranteed | Mirror example | Callback tolerates a missing `state`, see below |
| D. PKCE | S256. Verifier 43 characters, one use | Mirror | `zalo-oauth.service.ts` |
| D. Token endpoint | `POST https://oauth.zaloapp.com/v4/oa/access_token`, form body, header `secret_key` = app secret | Mirror | `zalo-client.ts`, `zalo-oauth.service.ts` |
| D. Exchange fields | `code`, `app_id`, `grant_type=authorization_code`, `code_verifier` | Mirror | same |
| D. Refresh fields | `refresh_token`, `app_id`, `grant_type=refresh_token` | Mirror | same |
| D. Token response | `access_token`, `refresh_token`, `expires_in` (string or number, coerce) | Mirror | Zod schema |
| D. Lifetimes | Access 25 h. Refresh 3 months, single use. Code 10 min | Verified 2026-09-22, [official hub](https://docs.zaloplatforms.com/docs/OA/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new) | `MESSAGING.zalo.refreshAheadMs` |
| D. Terminal codes | `-216` invalid token, `-220` expired or removed, `-204`, `-205`, `-212`, `-219` | Verified 2026-09-22, [official error table](https://docs.zaloplatforms.com/docs/OA/phu-luc/ma-loi) | `zalo-errors.ts` |
| D. Transient codes | `-32` rate limit. Any 5xx. Timeout. Unparsed body | Mirror | `zalo-errors.ts` |
| D. Refresh-token-invalid code | Not found. Any non-zero `error` from the refresh endpoint that is not `-32` is terminal | Unknown | `zalo-errors.ts` |
| E. OA profile | `GET https://openapi.zalo.me/v2.0/oa/getoa`, header `access_token`. Fields `oaid`, `name`, `avatar`, `is_verified` | Mirror | `zalo-oauth.schema.ts` |
| E. Send text | `POST https://openapi.zalo.me/v3.0/oa/message/cs`, header `access_token`, body `{ recipient: { user_id }, message: { text } }`. Response `{ data: { message_id, user_id, sent_time }, error, message }` | Verified 2026-09-22, [official hub](https://docs.zaloplatforms.com/docs/OA/tin-nhan/tin-tu-van/gui-tin-tu-van-dang-van-ban) | `zalo-client.ts` |
| E. Text limit | 2000 characters | Mirror | `MESSAGING_POLICY.maxBodyLength` |
| E. Message events | `user_send_text`, `user_send_image`, `user_send_file`, `user_send_sticker`. Envelope `{ app_id, sender: { id }, recipient: { id }, event_name, message: { msg_id, text?, attachments?: [{ type, payload: { url, thumbnail? } }] }, timestamp }` | Mirror | `zalo-webhook.schema.ts` |
| E. Follow events | `follow`, `unfollow`. Envelope `{ oa_id, follower: { id }, event_name, timestamp }` | Mirror | same |
| E. Receipt events | `user_received_message` with `message.msg_id`. `user_seen_message` with `message.msg_ids[]` | Mirror | same |
| E. Attachment hosts | `zdn.vn` seen in a real payload. `zadn.vn` is a Zalo CDN domain, not seen in a payload | Mirror | `MESSAGING_POLICY.zalo.attachmentHosts` |
| E. User profile | `GET https://openapi.zalo.me/v3.0/oa/user/detail?data=<url-encoded {"user_id"}>`, header `access_token`. Response `{ data: { user_id, display_name, avatar, user_is_follower, ... }, error, message }`. `-213` means not a follower. Events carry no name, only the id | Verified 2026-09-22, [official hub](https://docs.zaloplatforms.com/docs/OA/quan-ly/quan-ly-thong-tin-nguoi-dung/truy-xuat-chi-tiet-nguoi-dung) | `zalo-client.ts` `readUserProfile`, task `message-identity-profile` |

## Decisions the facts forced

- **The signature is tested on the first real event, not trusted.** No official
  page documents it. The formula above ships, and it matches the official Java
  SDK's `MacUtils`. A development log line lists the header names present on
  the first event, never the values. If the first sandbox event fails the check,
  fix `zalo-signature.ts` before anything else. Third research pass:
  `research-260922-0240-zalo-webhook-signature-official-source-report.md`.
- **`ZALO_OA_SECRET_KEY` is a third optional variable.** When unset, the
  webhook check uses `ZALO_APP_SECRET`. Both or neither of the app pair still
  hold. A missing OA key removes nothing.
- **The webhook timestamp tolerance is 2 hours, not 5 minutes.** A retry an hour
  after the first attempt carries the original body and the original timestamp.
- **The callback tolerates a missing `state`.** Zalo returns `code` and `oa_id`.
  With `state`, the callback loads that `Verification` row. Without it, the
  callback loads the newest unexpired `zalo-pkce` row whose stored user id is
  the session user. Either way the row is deleted and the user id must match.
- **Any non-zero refresh error that is not the rate-limit code is terminal.**
  The refresh token is single use, so a retry with the same token cannot succeed.
- **The attachment allowlist is the three Zalo-owned domains.** `zdn.vn`,
  `zadn.vn` and `zalo.me`. A subdomain of any of the three counts.
- **The webhook accepts `http` and `https` on an allowlisted host.** A real
  payload used `http://`. The bubble upgrades the URL to `https` when it renders.
- **An attachment that fails the allowlist is dropped, not the event.** The
  event is stored without that attachment and answered 200, with one warn log
  that names the host only. A 500 makes Zalo retry five times and then disable
  the webhook, and a dropped event loses a customer message.
- **Transient refresh backoff escalates 5 min, 30 min, 2 h and never gives up.**
  `payload.attempt` carries the step, because each rebook creates a new task row.
  The account gets "Zalo did not answer." only once the access token has expired.
- **The 48-hour block is a cost control, not a Zalo rule.** Zalo does not refuse
  a reply after 48 hours, it bills it. Zalo's own hard stop is 7 days without an
  interaction, errors `-230` and `-232`. The 48-hour block sits inside it.

## Product decisions

Recorded 2026-09-16 with the plan's validation session.

- One OA for the whole workspace. A second connect replaces the first.
- Reps reply from the CRM inbox and the contact sheet only. No mobile push.
- Inbound images and files stay as Zalo URLs. Nothing is copied to Blob. An
  expired image renders one sentence.
- Reply quota: none. Zalo made free replies inside the window unlimited on 2026-01-01.
- Contact delete keeps the Zalo history under Unmatched. "Delete conversation"
  is the one erasure path.
- A send that times out is `FAILED` with "Try again". No automatic retry.
- Unlink and delete conversation need the connections role, as disconnect does.

## What is out of scope

ZNS, template messages, transaction and promotion messages, SMS, WhatsApp,
Telegram, agent-sent messages, outbound media, consent and opt-out fields,
phone normalisation, message templates, message search, mobile push.

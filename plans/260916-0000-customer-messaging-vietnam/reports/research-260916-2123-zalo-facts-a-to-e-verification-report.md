# Zalo OA API Facts A-E — Live Doc Verification

Date checked: 2026-09-16. Timezone Asia/Saigon.

## Method note (read first)

`developers.zalo.me/docs/*` is a client-side React SPA. `curl`/`WebFetch` only
get the empty shell (`<div id="root"></div>`); the article body loads via a
JS `fetch` after mount, so it cannot be read by an automated fetch without a
real browser. `r.jina.ai` and `web.archive.org` hit the same empty shell.

A sibling static site, `docs.zaloplatforms.com`, serves the **same doc tree**
(identical slugs, verified by diffing route paths pulled from
`developers.zalo.me`'s own JS bundle against its sitemap.xml) pre-rendered
with Docusaurus — readable by `curl`/`WebFetch`. Its footer reads
`© 2026 Zalo Platforms. All rights reserved. Build: 2026-09-14 13:59:23 +07`,
and its nav groups match developers.zalo.me exactly (Mini App, Zalo Business
Solution, Open APIs, Zalo Social, Zalo Bot). This is very likely the same
content as developers.zalo.me served through a different (SSR) frontend, not
an independent third party — but the domain is **not** on the task's
pre-approved list (developers.zalo.me, zalo.solutions, oa.zalo.me), so every
fact sourced from it is marked **VERIFIED (mirror)** below rather than plain
VERIFIED, and worth a manual cross-check against the logged-in
developers.zalo.me console per the plan's row-3 access. `oa.zalo.me` and
`zalo.solutions` pages ARE server-rendered and were fetched directly — those
are marked plain **VERIFIED**.

`developers.zalo.me/community` (the support forum) is the same SPA — could
not be read. Community facts are cited from Google's indexed search
snippets only and marked **UNVERIFIED**.

---

## A. Reply window, free-reply cap, price outside window

| Sub-fact | Answer | Confidence |
|---|---|---|
| Free window | 48 hours from the user's last interaction | VERIFIED |
| Free cap | 8 messages per 48h window | VERIFIED |
| Price after cap / outside window | 55 VND/message (consultation) | VERIFIED |
| Transaction message price | 165 VND/message, fixed, no free cap | VERIFIED |
| Outer "may we send at all" window | 7 days via OpenAPI, 365 days via OA Manager console — **separate rule from the 48h free window, not a conflicting number for the same rule** | VERIFIED |

Sources:
- https://oa.zalo.me/home/documents/guides/tin-tu-van — `"Tin Tư vấn gửi trong khung 48 giờ kể từ tương tác cuối của người dùng hoàn toàn miễn phí"`
- https://oa.zalo.me/home/documents/guides/tong-quan-cac-loai-tin-nhan-tren-zalo-official-account-_3651713298729094511 — states OA Manager tool allows sending up to 365 days after last interaction, OpenAPI up to 7 days
- https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099 — `"Miễn phí 08 tin đầu tiên gửi trong 48 giờ"`; `"mỗi tin Tư vấn tiếp theo sẽ được tính với giá 55đ/tin"`; transaction `"165 VND/tin"`
- https://zalo.solutions/oa/pricing (redirect target of zalo.cloud/oa/pricing) — corroborates the 55đ/tin overage rate and shows package-level extra free quotas (500/month Growth, 2,000/month Comprehensive) for consultation messages sent **outside** the 48h window, VAT-inclusive

Resolves prior report's open question #1: 48h/7-day/365-day are **three
different rules layered together**, not conflicting values for one rule.
48h = free sub-window. 7 days (OpenAPI) / 365 days (OA Manager) = the outer
window during which a paid consultation send is allowed at all, after which
no consultation send is possible until the user interacts again.

## B. Webhook signature

| Sub-fact | Answer | Confidence |
|---|---|---|
| Header name | `X-ZEvent-Signature` (consistent across multiple community thread titles, all on developers.zalo.me's own forum) | UNVERIFIED — not present in any official doc page this pass could read |
| HMAC formula | `sha256(app_id + raw_body + timestamp + secret)` per community consensus | UNVERIFIED |
| Which secret | Community calls it "OA secret key"; the only secret documented in reachable official pages is the **app** secret key (`Cài đặt → copy secret key`, https://docs.zaloplatforms.com/docs/OA/phu-luc/huong-dan-lay-khoa-bi-mat-cua-ung-dung ) — no separate "OA secret key" concept found in any doc page fetched | UNVERIFIED, real conflict unresolved |
| Timestamp field | `timestamp` exists in every webhook body, as a string of epoch **milliseconds** (13-digit, e.g. `"1540363714987"`) | VERIFIED (mirror) — confirmed from real payload examples, not from a signature doc |

The official webhook overview page (`OA/webhook/tong-quan`) documents webhook
config, retries, and performance requirements in full, but **does not mention
a signature/mac mechanism anywhere in its body text**. This is the same page
the prior report flagged as a gap; it remains a gap. The plan's row 5 ("record
the webhook secret the console shows") implies the developer console *does*
show a distinct webhook secret — that can only be confirmed by opening the
console (post row-3 app creation), not from public docs.

Sources: https://docs.zaloplatforms.com/docs/OA/webhook/tong-quan (full body
fetched, no signature content); https://developers.zalo.me/community/detail/d14d09b635f3dcad85e2,
https://developers.zalo.me/community/detail/f62243c57f8096decf91 (titles
only, SPA blocked full read); https://docs.zaloplatforms.com/docs/OA/phu-luc/huong-dan-lay-khoa-bi-mat-cua-ung-dung

## C. Webhook retry policy and event ordering

| Sub-fact | Answer | Confidence |
|---|---|---|
| Retry trigger | Explicitly scoped to **connection failure**: `"Zalo hỗ trợ gửi lại sự kiện... đối với những sự kiện gửi không thành công (Không mở được connection tới webhook url)"` | VERIFIED (mirror) |
| Retry schedule | 30s, 5min, 15min, 30min, 1h after the original attempt, then the webhook is disabled and the app is unsubscribed from OA events until the developer re-authorizes in the console | VERIFIED (mirror) |
| Retry identification | Each retried delivery carries the same body plus an added `num_retry` header = retry count | VERIFIED (mirror) |
| Non-2xx / slow (>2s) response | Doc requires HTTP 200 within 2s, and says non-compliance sends the OA admin a "webhook not working" notice — but does **not** explicitly say this case is retried the same way as a connection failure | UNVERIFIED — ambiguous in the source text itself, not a fetch gap |
| Event ordering guarantee | Not mentioned anywhere in the overview doc | UNKNOWN, unchanged from prior report |

Verbatim: `"Zalo sẽ liên tục gửi lại các sự kiện tương tự sau các mốc thời
gian sau: sau 30 giây, sau 5 phút, sau 15 phút, sau 30 phút, sau 1 giờ."`

Source: https://docs.zaloplatforms.com/docs/OA/webhook/tong-quan (fetched and
converted to plain text in full, ~6KB, no truncation)

## D. OAuth v4

| Sub-fact | Answer | Confidence |
|---|---|---|
| Authorize URL | Not given as a literal URL in the doc — the doc says the developer configures/copies "the authorization request link" from the app console, the OA admin clicks it. Community/third-party sources say `https://oauth.zaloapp.com/v4/oa/permission` (note: **not** `v4/permission`, which is Zalo Social Login for a different product) | UNVERIFIED |
| Query params | Not enumerable from official text for the reason above | UNVERIFIED |
| PKCE method | S256. `code_challenge = Base64URL(SHA-256(ASCII(code_verifier)))`, no padding | VERIFIED (mirror) |
| code_verifier rule | 43 characters, mixed-case alphanumeric, one-time use per request | VERIFIED (mirror) |
| Token endpoint | `POST https://oauth.zaloapp.com/v4/oa/access_token`, `Content-Type: application/x-www-form-urlencoded` | VERIFIED (mirror) |
| Auth header | `secret_key` = the **application** secret key (same one from the app console) | VERIFIED (mirror) |
| Form fields (code exchange) | `code`, `app_id`, `grant_type=authorization_code`, `code_verifier` | VERIFIED (mirror) |
| Form fields (refresh) | `refresh_token`, `app_id`, `grant_type=refresh_token` (no code_verifier) | VERIFIED (mirror) |
| Response fields | `access_token`, `refresh_token`, `expires_in` | VERIFIED (mirror) |
| expires_in type | Doc's own data-type table lists it as **string**, but its own example value is unquoted numeric-looking (`90000`) — the doc is internally inconsistent; treat as **string** defensively and `Number()`-coerce at the boundary | VERIFIED (mirror) as documented, but doc self-contradicts |
| access_token lifetime | 25 hours from issuance | VERIFIED (mirror) |
| refresh_token lifetime | 3 months from issuance | VERIFIED (mirror) |
| refresh_token single-use | Confirmed: exchanging invalidates the old refresh_token immediately; a new one is returned each time; the just-replaced access_token is also invalidated the instant the new one is issued | VERIFIED (mirror) |
| authorization code lifetime | 10 minutes, single-use | VERIFIED (mirror) |
| Error: expired access token | `-220` `"access_token is expired or removed"` | VERIFIED (mirror) — task's guess of `-216` is a **different** error |
| Error: invalid access token | `-216` `"Access token is invalid"` (distinct from expired) | VERIFIED (mirror) |
| Error: rate limit | `-32`, two messages: `"Your application reached limit call api"` (app-level) and `"Your OA reached limit call api"` (OA-level) | VERIFIED (mirror) |
| Error: invalid/used refresh token | Not present in the general OA API error table. Community threads reference `-14012`, `-14024` for other OAuth-adjacent errors (wrong OA ownership etc.), suggesting OAuth-specific errors live in a `-140xx` range distinct from the `-2xx` API range — but no code was found specifically for "refresh token already used/expired" | UNVERIFIED — task's guesses (`-14014`, `-118`) not confirmed either way |
| Error: server error (5xx-equivalent) | Not found in any reachable table | UNKNOWN |
| Rate limit numbers | OA API 4,000 req/min per app; Social API 4,000 req/min + 20 req/user/min; Article API 4,000 req/min; ZBS/ZNS excluded from this bucket; `X-RateLimit-Limit` / `X-RateLimit-Remain` response headers | VERIFIED (mirror) |

**Distinct token family warning**: `https://docs.zaloplatforms.com/docs/Social/social-api/tham-khao/co-che-het-han-cua-user-refresh-token`
documents a **different** product — the Zalo Social/Login "User Refresh
Token" (used for `graph.zalo.me` user-identity login, not OA messaging). That
one caps at 30 days (720h) total and each refresh **inherits the remaining
time** rather than resetting to a fresh 3 months. Do not apply this rule to
the OA `refresh_token` used for messaging — the OA-specific page states 3
months flatly with no inheritance/decay language. This distinction likely
explains some of the "refresh token dies early" community complaints in the
prior report — people may be looking at Social-Login docs/behavior while
building against the OA API, or hitting an undocumented edge case.

Sources: https://docs.zaloplatforms.com/docs/OA/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new;
https://docs.zaloplatforms.com/docs/OA/phu-luc/ma-loi;
https://docs.zaloplatforms.com/docs/OA/phu-luc/cac-loai-ma-su-dung-trong-oauth;
https://docs.zaloplatforms.com/docs/OA/phu-luc/gioi-han-toc-do-api;
https://docs.zaloplatforms.com/docs/Social/social-api/tham-khao/co-che-het-han-cua-user-refresh-token

## E. Endpoints, response shapes, webhook events, attachment hosts

| Item | Answer | Confidence |
|---|---|---|
| OA profile endpoint | `GET https://openapi.zalo.me/v2.0/oa/getoa`, header `access_token` | VERIFIED (mirror) |
| OA profile response fields | `oaid` (not `oa_id` — task's guess was wrong), `name`, `description`, `oa_alias`, `is_verified` (bool), `oa_type` (2=Business, 4=Government), `avatar`, `cover`, `num_follower`, `cate_name`, `package_name`, `package_valid_through_date`, `package_auto_renew_date`, `linked_zca` | VERIFIED (mirror) |
| Consultation text send | `POST https://openapi.zalo.me/v3.0/oa/message/cs`, headers `Content-Type: application/json` + `access_token`, body `{recipient:{user_id}, message:{text}}` | VERIFIED (mirror) — matches task guess |
| Consultation send response | `{data:{message_id, user_id, sent_time, quota}, error, message}` — `error: 0` on success | VERIFIED (mirror), superset of task's guessed shape |
| Max text length | 2,000 characters (`"2.000 ký tự"`) | VERIFIED (mirror) — matches task's guess |
| `user_send_text`/`image`/`file`/`sticker` envelope | `{app_id, sender:{id}, recipient:{id}, user_id_by_app, event_name, message:{msg_id, text?}, timestamp}` | VERIFIED (mirror) |
| Attachment shape | `message.attachments[].payload.url` (+ `.thumbnail` for image), `attachments[].type` | VERIFIED (mirror) for image; file/sticker assumed structurally identical, not independently example-checked this pass |
| `follow`/`unfollow` envelope | `{oa_id, follower:{id}, user_id_by_app, event_name:"follow"\|"unfollow", source, app_id, timestamp}` — note this envelope uses `oa_id` + `follower.id`, **not** `recipient.id` like message events | VERIFIED (mirror) |
| `user_received_message` envelope | `{app_id, sender:{id}, recipient:{id}, event_name:"user_received_message", message:{msg_id}, timestamp}` | VERIFIED (mirror) |
| `user_seen_message` envelope | `{app_id, sender:{id}, recipient:{id}, event_name:"user_seen_message", message:{msg_ids:[...]}, timestamp}` — plural array, matches task's guess | VERIFIED (mirror) |
| `timestamp` type/unit | String, epoch milliseconds, 13 digits (e.g. `"1540363714987"`) | VERIFIED (mirror), consistent across every event example fetched |
| Attachment hostnames | `zdn.vn` subdomain confirmed directly in a real payload example (`http://f6.photo.talk.zdn.vn/...`, thumbnail on `t.f6.photo.talk.zdn.vn`). `zadn.vn` is a real Zalo static/CDN domain (seen on other Zalo asset URLs this session, e.g. `stc-sp.zadn.vn`) but **not observed inside an actual attachment payload** this pass. Plain `zalo.me` not observed as an attachment host. | `zdn.vn` VERIFIED (mirror); `zadn.vn` UNVERIFIED for this specific use, general Zalo domain only |

Sources: https://docs.zaloplatforms.com/docs/OA/quan-ly/quan-ly-thong-tin-oa/lay-thong-tin-zalo-official-account;
https://docs.zaloplatforms.com/docs/OA/tin-nhan/tin-tu-van/gui-tin-tu-van-dang-van-ban;
https://docs.zaloplatforms.com/docs/OA/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan;
https://docs.zaloplatforms.com/docs/OA/webhook/quan-ly/su-kien-nguoi-dung-quan-tam-hay-bo-quan-tam-oa;
https://docs.zaloplatforms.com/docs/OA/webhook/tin-nhan/su-kien-nguoi-dung-nhan-tin-nhan-tu-official-account;
https://docs.zaloplatforms.com/docs/OA/webhook/tin-nhan/su-kien-nguoi-dung-da-xem-tin-nhan-duoc-gui-tu-official-account

---

## Recommended values

```ts
MESSAGING_POLICY.zalo = {
  replyWindowMs: 48 * 60 * 60 * 1000,        // 48h free consultation window (VERIFIED)
  freeRepliesPerWindow: 8,                    // resets each new user interaction (VERIFIED)
  outsideWindowPriceVnd: 55,                  // per consultation msg after cap/window (VERIFIED)
  transactionPriceVnd: 165,                   // fixed, no free cap (VERIFIED)
  sendEligibilityWindowMs: {
    openApi: 7 * 24 * 60 * 60 * 1000,         // outer window for OpenAPI sends (VERIFIED)
    oaManagerConsole: 365 * 24 * 60 * 60 * 1000, // outer window via OA Manager only, not usable from apps/agent (VERIFIED)
  },
  maxBodyLength: 2000,                        // characters, consultation text (VERIFIED)
  attachmentHosts: ["zdn.vn"],                // confirmed; add "zadn.vn" only after seeing it in a real payload
};

ZALO_OAUTH = {
  tokenUrl: "https://oauth.zaloapp.com/v4/oa/access_token",  // VERIFIED
  tokenHeader: "secret_key",                                   // = app secret, VERIFIED
  accessTokenLifetimeMs: 25 * 60 * 60 * 1000,                  // VERIFIED
  refreshTokenLifetimeMs: 90 * 24 * 60 * 60 * 1000,             // "3 months", VERIFIED
  refreshTokenSingleUse: true,                                  // VERIFIED
  authCodeLifetimeMs: 10 * 60 * 1000,                           // VERIFIED
  pkceMethod: "S256",                                           // VERIFIED
  codeVerifierLength: 43,                                       // VERIFIED
};

ZALO_ERRORS = {
  terminal: [-220 /* access_token expired/removed */, -216 /* access_token invalid */,
             -205 /* OA not exist */, -204 /* OA disabled */, -219 /* app removed/disabled */,
             -212 /* app not registered for this api */],
  transient: [-32 /* rate limit, app or OA level */],
  unresolved: ["refresh-token-invalid/used code — NOT CONFIRMED, guessed -14014/-118 both unverified",
               "generic 5xx/server-error code — NOT FOUND"],
};
```

Signature verification: **do not hardcode a formula from this research.**
Confirm `X-ZEvent-Signature` and which secret it uses against the live app
console (row 3/5 of the plan) before writing `zalo-signature.ts` — treat the
community-consensus formula `sha256(app_id + raw_body + timestamp +
secret)` as a starting hypothesis to test against one real sandbox event,
not as a verified fact.

---

## Unresolved questions

1. Exact webhook signature header, formula, and which secret (app secret vs
   a distinct "OA secret key" shown only in the console) — no official doc
   page documents this at all in this pass. Must test against one real
   webhook delivery from the sandbox OA (plan already calls for this).
2. Whether the retry schedule (30s/5min/15min/30min/1h) also fires for a
   non-2xx or slow (>2s) response, or only for connection-level failure —
   the source doc's own wording is ambiguous, not a fetch gap.
3. Event ordering guarantee for webhook delivery — not documented anywhere
   found.
4. Exact OA authorize URL and its query params — official doc describes a
   console-generated link, not a literal URL string. `v4/oa/permission` is
   an unverified community guess.
5. Error code for "refresh token invalid or already used" and for generic
   server error — not found in any reachable table. Community numbers in
   the `-140xx` range exist for other OAuth errors, suggesting where to look
   next (developer console error log during a deliberate double-refresh
   test), but no confirmed code.
6. `docs.zaloplatforms.com` provenance is inferred (identical route slugs,
   Zalo-branded footer, very recent build) but not proven — worth asking
   Zalo support directly, or confirming via the authenticated
   developers.zalo.me console once row 3 is done, before treating "VERIFIED
   (mirror)" facts as equivalent to plain VERIFIED for anything
   safety-critical (signature, error codes).
7. `zadn.vn` as an attachment host is a plausible but unconfirmed addition
   to the allowlist — only `zdn.vn` was seen in an actual payload.

Status: DONE_WITH_CONCERNS
Summary: Fact A fully verified on official oa.zalo.me/zalo.solutions. Facts C, D, E mostly verified via docs.zaloplatforms.com, a same-content Docusaurus mirror of developers.zalo.me (provenance inferred, not proven). Fact B (webhook signature) stays unverified — no reachable doc, official or mirror, documents it.
Concerns: developers.zalo.me itself is a client-rendered SPA unreachable by automated fetch; all "VERIFIED (mirror)" facts should get one manual cross-check against the logged-in console once the plan's row 3 app exists, before they gate code that handles money (fact A) or security (fact B, D error classification).

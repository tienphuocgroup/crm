# Zalo OA API — official source verification

Date 260922. Scope: facts A (user/detail), B (v4 oauth token), C (message/cs),
against OFFICIAL sources only. Read `docs/messaging.md` and the 260921
user-profile report first, per task instructions — findings below are new,
not repeats.

## Source found and how

`developers.zalo.me` is a pure React SPA (`<div id="root">`, empty on fetch —
reconfirmed 260922). Its bundle `https://stc-developers.zdn.vn/static/home/main.js`
hardcodes `baseURL:"https://developers.zalo.me/api"` and a full old-path→new-path
redirect table with every doc slug, which gave the real current slugs. Those
slugs also exist, server-rendered, on **`docs.zaloplatforms.com`** — titled
"Zalo Platform Document Hub", confirmed by web search as VNG Corporation /
"Zalo Platforms Company" operated (same publisher as `developers.zalo.me`,
`miniapp.zaloplatforms.com`). Every page below was fetched today (260922) with
plain `curl`, HTTP 200, full Docusaurus-rendered HTML (60-120 KB, not the SPA
shell). This is a live official mirror, not a third-party copy: **OFFICIAL**.

`web.archive.org` rate-limited (429) throughout the session; not used.
`zaloplatform` GitHub org (official, VNG) SDK read directly for corroboration
on fact B's request/response shape.

## A. `oa/user/detail`

Source: `https://docs.zaloplatforms.com/docs/OA/quan-ly/quan-ly-thong-tin-nguoi-dung/truy-xuat-chi-tiet-nguoi-dung`
(fetched 260922). OFFICIAL.

Request: `GET https://openapi.zalo.me/v3.0/oa/user/detail?data={"user_id":"..."}`,
header `access_token`. Matches current code exactly.

Response, quoted:

```json
{
  "data": {
    "user_id": "4572947693969771653",
    "user_id_by_app": "4604138790644222978",
    "user_external_id": "Id của người dùng trong hệ thống của Doanh nghiệp",
    "display_name": "Tên hiển thị của người dùng",
    "user_alias": "Tên alias của người dùng",
    "is_sensitive": false,
    "user_last_interaction_date": "06/07/2023",
    "user_is_follower": false,
    "avatar": "https://s120-ava-talk.zadn.vn/...",
    "avatars": { "120": "...", "240": "..." },
    "dynamic_param": "value",
    "tags_and_notes_info": { "notes": [""], "tag_names": [] },
    "shared_info": { "address": "...", "city": "...", "district": "...", "phone": "...", "name": "..." }
  },
  "error": 0,
  "message": "Success"
}
```

`display_name` and `avatar` (plus `avatars: {120, 240}`) are the display/avatar
fields — CONFIRMS the community finding exactly. **New, not in prior reports:
`user_is_follower: boolean`** is a documented, top-level follow-status field on
this very response — the 260921 report did not find this field in any OSS
source. `user_id_by_app`, `tags_and_notes_info`, `shared_info` — all confirmed
present as officially documented (260921 report had these as UNVERIFIED,
single-source; now CONFIRMED official).

Error code for non-follower: source
`https://docs.zaloplatforms.com/docs/OA/phu-luc/ma-loi` (fetched 260922,
OFFICIAL, full table, quoted below). `-213` / `"User has not followed OA"` —
CONFIRMS the community `-213` claim exactly, now OFFICIAL.

Expired/invalid token error shape: same table —
`-216` / `"Access token is invalid"`, `-220` / `"access_token is expired or removed"`.
Both are wrapped in the standard envelope `{ "error": <code>, "message": "<text>" }`
(no `data` on error, confirmed by the official PHP SDK's
`ZaloResponseException::create()`, which reads `data['error']` and
`data['message']` off the raw decoded body — OFFICIAL, `zaloplatform/zalo-php-sdk`,
`src/Exceptions/ZaloResponseException.php`).

## B. OAuth v4 token endpoint

Source: `https://docs.zaloplatforms.com/docs/OA/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new`
(fetched 260922). OFFICIAL. Corroborated by
`https://docs.zaloplatforms.com/docs/OA/phu-luc/cac-loai-ma-su-dung-trong-oauth`
(fetched 260922, OFFICIAL) and the official PHP SDK
(`zaloplatform/zalo-php-sdk/src/Authentication/OAuth2Client.php`, read raw from
GitHub 260922).

Quoted lifetimes:

> "Access Token ... Thời hạn hiệu lực: 25 giờ (kể từ lúc được cấp mới)."
> "Refresh Token ... Refresh Token chỉ được sử dụng một lần để tạo Access Token
> mới. Sau khi sử dụng thành công, Refresh Token cũ sẽ bị vô hiệu hóa và hệ
> thống trả về Refresh Token mới cho lần refresh tiếp theo. ... Thời hạn hiệu
> lực của Refresh Token: 3 tháng (kể từ lúc được cấp mới)."
> "Authorization Code chỉ được sử dụng 1 lần và có hiệu lực trong vòng 10 phút."

CONFIRMS access 25h, refresh 3 months single-use, code 10 min — exactly what
the codebase already assumes, now OFFICIAL not mirror-inferred.

Example response, quoted verbatim:

```json
{
  "access_token": "RfBh5NdqsWzhcX8bDDe_1A463Z34Fhy1GVi63AoTU1InwujqF",
  "refresh_token": "L2Y2BO9Prn_I1SkM08T4J99bZQYVbOBPfTVeRgrLdPK4ZqGX9G",
  "expires_in": "90000"
}
```

`expires_in` a **string** ("90000" = 25h in seconds) — confirms the codebase's
"string or number, coerce" Zod handling is correct and necessary.

**Refresh-token-specific error codes: still not found, on the official page or
its dedicated OAuth-codes page.** Both explicitly describe lifetimes and the
single-use/rotation rule but name no distinct error code for "refresh token
expired" separate from the general access-token codes `-216`/`-220` in
`ma-loi`. The 260921-era "Unknown" verdict for a refresh-specific code stands,
now checked against the official OAuth-codes page directly (not inferred).
Rate limit (`-32`) and 5xx/timeout are not endpoint-specific in any official
page found — `-32` is documented generically (see rate-limit section below)
and is the only officially documented transient code across all OA APIs,
oauth included by extension (the SDK's generic exception factory treats any
negative `error` as an "OA exception" with no oauth-specific subclass).

Rate limits, source `https://docs.zaloplatforms.com/docs/OA/phu-luc/gioi-han-toc-do-api`
(fetched 260922, OFFICIAL), quoted:

> "Mọi lệnh gọi API từ ứng dụng khi đã vượt quá giới hạn tốc độ đều không được
> thực thi và sẽ trả về error code = -32... Official Account API: 4.000
> requests/phút." Response headers `X-RateLimit-Limit`, `X-RateLimit-Remain`
> on every call.

New: exact app-level rate limit (4000 req/min) and the two rate-limit headers
— neither was in either prior report.

## C. `oa/message/cs` (text consultation message)

Source: `https://docs.zaloplatforms.com/docs/OA/tin-nhan/tin-tu-van/gui-tin-tu-van-dang-van-ban`
(fetched 260922). OFFICIAL.

Request, quoted:

```json
POST https://openapi.zalo.me/v3.0/oa/message/cs
{ "recipient": { "user_id": "2512523625412515" }, "message": { "text": "hello, world!" } }
```

Text limit, quoted: "Giới hạn tối đa là 2.000 ký tự" — CONFIRMS 2000 chars.

Response, quoted (48h-window / free case):

```json
{
  "data": {
    "quota": { "quota_type": "reply", "remain": "8", "total": "8" },
    "message_id": "63ecf43f0df7dba892e6",
    "user_id": "2512523625412515",
    "sent_time": "1626926349402"
  },
  "error": 0,
  "message": "Success"
}
```

`message_id` field CONFIRMED exactly as assumed, plus `user_id`, `sent_time`,
and a `quota` object the codebase does not currently read.

### Critical new finding: the 8-per-48h quota is being retired, and reply-window rejection is not how Zalo enforces "outside window"

Quoted, verbatim, from the official `remain` field description (appears
identically on this page and on the official quota-check API page
`https://docs.zaloplatforms.com/docs/OA/tin-nhan/quan-ly-tin-nhan/kiem-tra-han-muc-gui-tin-nhan`,
fetched 260922, same day, two independent official pages, same wording):

> "Từ ngày 1/1/2026, đối tác có thể gửi tin Tư vấn miễn phí không giới hạn
> trong khung 48h. Lộ trình chuyển đổi như sau: Từ ngày 1/1/2026: luôn trả về
> giá trị remain = 8. Sau ngày 1/3/2026: sẽ dừng trả về thuộc tính này."

Translation: since 2026-01-01 Zalo partners get **unlimited** free Tư vấn
messages inside the 48h window (the `remain=8` value is a fixed placeholder
during rollout, not a real cap); since 2026-03-01 the `remain`/`total` fields
are **removed from the response entirely**. Today is 260922 — both dates have
passed. `MESSAGING_POLICY.zalo.freeRepliesPerWindow = 8` in this codebase is
now enforcing a cap Zalo itself no longer enforces.

Separately, source `https://docs.zaloplatforms.com/docs/OA/tin-nhan/tong-quan`
(fetched 260922, OFFICIAL), quoted on cost vs eligibility — these are two
different gates, not one:

> "Trong vòng 48 giờ kể từ tương tác cuối của người dùng, tin Tư vấn hoàn toàn
> miễn phí. Sau 48 giờ kể từ tương tác cuối của người dùng, giá tin Tư vấn
> được tính theo bảng giá."

Sending past 48h is **never rejected by Zalo** — it is billed at 55đ/message
(per third-party pricing pages, not re-verified officially here since price is
out of scope), not blocked. The Zalo-enforced hard eligibility gate is a
separate, wider window: source
`https://docs.zaloplatforms.com/docs/OA/tin-nhan/tin-tu-van/dieu-kien-gui-tin-tu-van`
(fetched 260922, OFFICIAL), quoted: "User (người nhận tin): có tương tác với
OA trong vòng 7 ngày" — 7 days, OpenAPI. Error codes for that gate, from the
official `ma-loi` table: `-230` "User has not interacted with the OA in the
past 7 days", `-232` "User has not interacted with the OA, or the last
interaction has expired". There is no Zalo error code for "sent inside 48h but
past the free-reply count" because that condition no longer exists as a block
— it is a billing event, and per the finding above soon will not even be
metered as "remaining count" in the response.

This means the CRM's product decision to treat "past 48h / past 8 replies" as
a **blocked send with no input** (see `docs/messaging.md` "Irreversible things
are bounded in writing", and the product decision "Reply quota: 8 free replies
per 48-hour window, enforced as a blocked reason") is a **self-imposed cost
control, not a Zalo API restriction**. It still works exactly as built (Zalo
would accept and bill the send, the CRM chooses to block it first) — but the
CRM is now blocking sends Zalo would serve for free, since the free tier is
effectively unlimited within 48h since 2026-01-01. This is a product decision,
not a bug: per `.claude/rules/review-audit-self-decision.md` this needs to go
back to the user, not be silently changed.

Error codes for "quota used" in the general sense (not reply-specific):
official `ma-loi` table, `-211` "Out of quota" (generic feature quota) and
`-218` "Out of quota receive" (recipient-side receive limit). Neither is
reply-count-specific; none is documented as returned by `message/cs` itself
for a spent reply quota, consistent with quota-exhaustion no longer being a
send-blocking condition per the finding above.

## Official error code table (`oa/phu-luc/ma-loi`, fetched 260922, OFFICIAL, full)

Selected rows relevant to this task (full table has ~35 rows, not reproduced
in full — see source URL for the rest):

| Code | Message | Meaning |
| --- | --- | --- |
| 0 | Success | — |
| -32 | Your application reached limit call api / Your OA reached limit call api | rate limit, per minute |
| -201 | `<data_field>` is invalid! | bad parameter |
| -204 | Offical Account is disable | OA deleted |
| -205 | Offical Account is not exist | OA not found |
| -211 | Out of quota | feature quota exceeded |
| -213 | User has not followed OA | non-follower |
| -216 | Access token is invalid | bad token |
| -218 | Out of quota receive | recipient receive-limit exceeded |
| -220 | access_token is expired or removed | expired/revoked token |
| -230 | User has not interacted with the OA in the past 7 days | outside the send-eligibility window |
| -232 | User has not interacted with the OA, or the last interaction has expired | same, alternate wording |
| -242 | Invalid appsecret_proof provided | app-secret proof bad |

No 5xx / timeout / generic-server-error codes are documented anywhere in this
table — those remain outside Zalo's documented error-code space (HTTP-layer,
not app-layer), consistent with the existing codebase's treatment of
non-2xx/timeout as transient.

## Table: fact vs code assumption vs official answer

| Fact | Code assumes | Official answer | Verdict |
| --- | --- | --- | --- |
| A. display name field | `display_name` | `display_name` | CONFIRMED |
| A. avatar field | `avatar` | `avatar` (+ `avatars: {120,240}`) | CONFIRMED |
| A. follow-status field | not read | `user_is_follower: boolean` | NEW — not previously known |
| A. non-follower code | `-213` | `-213` "User has not followed OA" | CONFIRMED |
| A. expired/invalid token codes | `-216`, `-220` (assumed distinct) | `-216` invalid, `-220` expired/removed | CONFIRMED |
| A. error envelope on failure | `{error, message}` | `{error, message}`, no `data` | CONFIRMED |
| B. access token lifetime | 25h | "25 giờ" | CONFIRMED |
| B. refresh token lifetime | 3 months, single-use | "3 tháng", single-use, rotates | CONFIRMED |
| B. code lifetime | 10 min | "10 phút" | CONFIRMED |
| B. `expires_in` type | string or number, coerce | string (`"90000"`) in official example | CONFIRMED |
| B. refresh-token-invalid code | none found (Unknown) | still not documented anywhere official | UNVERIFIED (now checked against 2 official pages, not just mirror) |
| B. transient vs terminal | `-32` rate limit; any 5xx terminal-unknown | `-32` documented; no 5xx codes documented at all | CONFIRMED for `-32`; UNVERIFIED (undocumented) for 5xx |
| C. request shape | `{recipient:{user_id}, message:{text}}` | same | CONFIRMED |
| C. response `message_id` | `data.message_id` | `data.message_id` | CONFIRMED |
| C. text limit | 2000 chars | "2.000 ký tự" | CONFIRMED |
| C. reply window | 48h free | 48h free, confirmed | CONFIRMED (cost gate only) |
| C. free replies per window | 8 | **Unlimited since 2026-01-01; `remain` field removed entirely after 2026-03-01** | CONTRADICTED — policy changed, both dates already past |
| C. "outside window" error code | assumed exists | **no such code — 48h+ is billed, not blocked** | CONTRADICTED — 48h is a cost boundary, not an eligibility boundary |
| C. real send-eligibility window | not modeled as a Zalo gate | 7 days, OpenAPI, `-230`/`-232` | NEW — this is Zalo's actual hard gate |
| C. "quota used" error code | assumed exists for reply quota | no reply-specific code; `-211`/`-218` are generic, unrelated to reply count | CONTRADICTED |

## Unresolved questions

1. No official error code exists for "refresh token expired/revoked/invalid"
   distinct from `-216`/`-220`. Confirmed absent on two dedicated official
   pages (auth guide, OAuth-codes appendix), not just the mirror gap noted
   260921. Treat any non-zero, non–`-32` error from the refresh call as
   terminal, per the existing code decision — this is now confirmed as the
   only defensible approach, not a documentation gap to keep chasing.
2. The 55đ/message price past 8-replies-or-48h was not re-verified against an
   official pricing page in this session (out of scope: facts A/B/C only).
   Given the quota-removal finding, that whole pricing description may itself
   be stale on third-party sites; worth a dedicated check before any pricing
   decision.
3. Whether the CRM should drop or raise `freeRepliesPerWindow` is a product
   call, not resolved here — flagged for the user per the finding above.

Status: DONE

# Zalo OA user profile endpoint research

Date 260921. Scope: find OA Open API to resolve webhook `sender.id`/`follower.id` to
display name + avatar.

## Note on sources

`developers.zalo.me` is a JS SPA, unreadable by fetch (title only). The mirror
`docs.zaloplatforms.com` returns 404 for every OA-detail path guessed
(`/docs/OA/...`, `/docs/official-account/...`) — its OA section nav exists
(`/docs/OA` loads, lists "API Thông tin Người dùng") but the specific
user-detail page URL was not found in 12 search/fetch calls. Evidence below
comes instead from `gh search code` across 10+ independent public repos (all
agree on path, params, headers) plus 2 independent Zalo developer-community
forum threads for error codes. This is corroboration, not an official-doc read.

## 1. Endpoint

`GET https://openapi.zalo.me/v3.0/oa/user/detail` is current. v2.0 `getprofile`
does not appear in any of the 10+ OSS implementations found — only v3.0
`user/detail` is used; v2.0 is legacy/unused for this call.

- Header: `access_token: <OA access token>` (not a query param, not Bearer).
- Query: `data=<JSON-string>` then URL-encoded, e.g.
  `data=${encodeURIComponent(JSON.stringify({user_id: userId}))}`.
  Confirmed identically in `diendh/zca-bridge`, `aizaloapp/zalo-flow`,
  `hoanganh8389/bizcity-twin-ai`, `YspCoder/social-hub` (Go: `json.Marshal` +
  `url.Values{"data": {...}}`).

Confidence: CORROBORATED by 2+ OSS implementations (actually ~10 independent
repos: ChatbotXIO/ChatbotX, diendh/zca-bridge, huabeitech/agent-desk,
hoanganh8389/bizcity-twin-ai, aizaloapp/zalo-flow, YspCoder/social-hub,
RAprogramm/zalo-rs, trieu/leo-cdp-framework, tiendeptrai7/football-fsal,
HocvienSorian/zalo-ghl-integration2, hjungwoo01/zalo, LEO-CDP/zalo-apps,
BichBuoc/zalo_message). No official-doc page reached to VERIFY directly.

## 2. Response shape

Verbatim example (from `developers-zns.goby.vn`, a Zalo ZNS/OA partner mirror —
CORROBORATED, response shape matches field names seen in OSS parsers too):

```json
{
  "error": 0,
  "message": "Success",
  "data": {
    "user_gender": 1,
    "user_id": 567826391599986760,
    "user_id_by_app": 56782639,
    "avatar": "String",
    "avatars": {"120": "String", "240": "String"},
    "display_name": "Phạm Khoa",
    "shared_info": {
      "address": "Phan Đình Phùng",
      "city": "Hồ Chí Minh",
      "district": "Quận 1",
      "phone": 841282987721,
      "name": "Phạm Khoa"
    },
    "tags_and_notes_info": {
      "tag_names": ["Khách VIP"],
      "notes": ["Discount 10%"]
    }
  }
}
```

Fields, cross-checked against `RAprogramm/zalo-rs` (`UserProfile` struct: adds
`gender: Option<i32>`, `birthday: Option<String>`) and `YspCoder/social-hub`
(Go struct: adds `Alias` — i.e. `user_alias`, mapped to CRM `Username`):

| field | type | notes | source |
|---|---|---|---|
| `user_id` | string or number (seen both) | OA-scoped follower id | goby, social-hub |
| `user_id_by_app` | number | app-scoped id, distinct from `user_id` | goby mirror only, UNVERIFIED elsewhere |
| `display_name` | string | | all sources |
| `avatar` | string (URL) | | all sources |
| `avatars` | object `{ "120": url, "240": url }` | size-keyed | goby mirror |
| `user_alias` | string | optional, OA-set alias/nickname | social-hub Go (`Alias`) |
| `user_gender` / `gender` | int (0/1) | field name varies by SDK author paraphrase — treat as optional | goby="user_gender", zalo-rs="gender" |
| `birthday` / `birth_date` | string `"DD/MM/YYYY"` | optional | zalo-rs, bizcity-twin-ai doc |
| `shared_info` | object, optional | only present if user shared phone/address; `phone`, `city`, `address`, `district`, `name` | goby, bizcity-twin-ai |
| `tags_and_notes_info` | object, optional | OA-side CRM tags/notes, not from user | goby mirror only |

Confidence: CORROBORATED (goby mirror + 2 independent OSS structs agree on
core fields `user_id`, `display_name`, `avatar`; peripheral fields
`user_id_by_app`, `tags_and_notes_info` are UNVERIFIED — seen once).

## 3. Followers-only, error codes

Endpoint works only for users who follow the OA. Confirmed by two independent
Zalo developer-community forum threads reporting the same error:
- `{"error": -213, "message": "User has not followed OA"}` — non-follower or
  unknown user id. [community thread 1](https://developers.zalo.me/community/detail/80c7f83cc4792d277468),
  [thread 2](https://developers.zalo.me/community/detail/ef5a2da211e7f8b9a1f6).
  Confidence: VERIFIED official (Zalo's own community forum, user-reported
  but from the platform's own support channel) — CORROBORATED by 2 threads.
- Token errors seen across OSS: `-216` "access token invalid" (bizcity-twin-ai
  handles this with force-refresh retry), `-204` "token expired" (zalo-rs
  error.rs). Both plausible as distinct token-failure codes, not contradictory.
  Confidence: CORROBORATED (1 source each — treat as UNVERIFIED exact
  wording, verify empirically before branching logic on code value).

## 4. Rate limits

No rate-limit or quota note found for this endpoint specifically, in any
source consulted (goby mirror, OSS repos, community threads). Zalo OA has
general daily message-quota tiers by OA verification level, but nothing
specific to `user/detail` reads surfaced. Confidence: UNVERIFIED / not found.

## 5. user_id space: webhook vs this endpoint

All OSS webhook-to-profile pipelines found (`hoanganh8389/bizcity-twin-ai`
follow/unfollow sync, `aizaloapp/zalo-flow` dispatcher) pass the webhook's
`sender.id` (message events) or `follower.id` (follow events) directly, as a
string, into `user/detail`'s `data.user_id` with no transformation. This is
the OA-scoped user id space. Confidence: CORROBORATED (2+ independent
webhook-consumer implementations do this with no id mapping step).

`user_id_by_app` is a *separate*, app-scoped id returned alongside `user_id`
in the response — it is not what webhooks send and not what this endpoint
accepts as input. Only seen in the goby mirror response; not confirmed in any
OSS parser (none of the structs read/store it). Confidence: UNVERIFIED.

## Recommended implementation

```
GET https://openapi.zalo.me/v3.0/oa/user/detail?data=<url-encoded-json>
Header: access_token: <OA access token>
data = JSON.stringify({ user_id: senderId })   // senderId from webhook, as string
```

Zod-ready response shape (only fields seen in 2+ independent sources; treat
rest as unknown/optional passthrough):

```ts
const zaloUserDetailResponse = z.object({
  error: z.number(),
  message: z.string(),
  data: z.object({
    user_id: z.union([z.string(), z.number()]).transform(String),
    display_name: z.string(),
    avatar: z.string().optional(),
    user_alias: z.string().optional(),
    user_gender: z.number().optional(),
    shared_info: z.object({
      phone: z.union([z.string(), z.number()]).optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      name: z.string().optional(),
    }).optional(),
  }).optional(),
});
```

Error handling:
- `error === 0` → use `data`.
- `error === -213` → not a follower / unknown id. Not fatal: store contact
  with no name/avatar, do not retry.
- `error === -216` or `-204` → token invalid/expired. Refresh OA access token
  once, retry once, then give up (matches `bizcity-twin-ai` pattern).
- Any other nonzero `error` → log and skip enrichment; never throw into the
  webhook-ingest path (per `capabilities.ts` "must never throw" pattern —
  enrichment is optional).

## Unresolved questions

1. Exact official response schema (all field names/types, which are always
   present vs optional) — not read from an official source. Verify empirically
   against one real OA response before finalizing the Zod schema.
2. Rate limit/quota specific to `user/detail` — not found anywhere searched.
3. Whether `-216` vs `-204` are both real distinct codes or one source is
   imprecise — verify against one real expired/invalid token call.
4. `user_id_by_app` and `tags_and_notes_info` existence/reliability — seen in
   only one (non-official, partner-mirror) source.
5. `docs.zaloplatforms.com`'s actual URL for the OA user-detail page was not
   found; a future session with more fetch budget could resolve this to get a
   VERIFIED-mirror citation instead of OSS corroboration.

Status: DONE_WITH_CONCERNS

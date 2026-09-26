# Zalo Webhook Signature + OAuth Authorize URL — Follow-Up Verification

Date: 2026-09-21. Follow-up to
`research-260916-2123-zalo-facts-a-to-e-verification-report.md`, which left
facts B (signature) and D (authorize URL) unverified. Official
`developers.zalo.me` docs and its `docs.zaloplatforms.com` mirror still do
not document either topic in their readable body text (re-confirmed this
pass on the webhook overview page and the OAuth page). Both facts are now
resolved to CORROBORATED via independent third-party sources — no official
primary source exists publicly for either.

## 1. Webhook signature

| Sub-fact | Answer | Confidence |
|---|---|---|
| Header name | `X-ZEvent-Signature` | CORROBORATED — dataism.one blog (with code), field-vn/zalo GitHub repo (`chữ ký X-ZEvent-Signature`), 3 developers.zalo.me community thread titles all naming it |
| Hash algorithm | **Plain SHA-256**, not HMAC-SHA256 | CORROBORATED (single primary source with code) — dataism.one shows `crypto.createHash('sha256').update(appId+data+timestamp+secret).digest('hex')`, not `createHmac`. **Conflict**: goclaw-docs (github.com/nextlevelbuilder/goclaw-docs) calls it "a HMAC signature" with no formula shown — likely imprecise terminology, not a second data point on the algorithm |
| Input order | `appId + data(raw body) + timestamp + OAsecretKey`, concatenated as strings then hashed | CORROBORATED — same dataism.one source, matches the community thread title pattern and search-snippet consensus |
| Encoding | Hex, lowercase (implied by `digest('hex')`) | CORROBORATED (single source) |
| Which secret | A distinct **"OA Secret key"**, shown in the developer console's webhook settings section — **not** the app secret key | CORROBORATED — dataism.one, plus independent community post titled "OA Secret key" and "Cách lấy OA secret key khi có nhiều OA liên kết với 1 app" confirm this is a real, separate, per-OA field in the console, distinct from the app-level secret. Resolves prior report's conflict: no official doc mentions it because it is a console UI field, not documented prose |
| `timestamp` source | The `timestamp` field already present in the webhook body (epoch ms string), not a separate header | CORROBORATED, consistent with prior report's confirmed body shape |

No official or mirror doc page states any of this. `docs.zaloplatforms.com/docs/OA/webhook/tong-quan`
re-fetched this pass — still zero signature content in body text.

Sources:
- https://www.dataism.one/2025/04/handling-zalo-webhooks-with-aws-lambda.html (primary source with actual verification code)
- https://github.com/field-vn/zalo (header name confirmed in repo docs)
- https://github.com/nextlevelbuilder/goclaw-docs/blob/master/channels/zalo-oa.md (header name, calls it "HMAC" — terminology conflict noted above)
- https://developers.zalo.me/community/detail/f62243c57f8096decf91 ,
  https://developers.zalo.me/community/detail/d14d09b635f3dcad85e2 ,
  https://developers.zalo.me/community/detail/9c8b7b764733ae6df722 ,
  https://developers.zalo.me/community/detail/87818878b43d5d63042c
  (thread titles only, SPA blocks body — all four independently named "X-ZEvent-Signature")
- https://developers.zalo.me/community/detail/b2918b71b7345e6a0725 ,
  https://developers.zalo.me/community/detail/c44e14ae28ebc1b598fa
  (thread titles confirm "OA Secret key" as a distinct console concept)

## 2. OAuth v4 authorize URL

| Sub-fact | Answer | Confidence |
|---|---|---|
| Path (OA) | `https://oauth.zaloapp.com/v4/oa/permission` | CORROBORATED — `zaloplatform/zalo-php-sdk` (**official Zalo GitHub org**, not third party) builds both `v4/permission` (Social Login) and `v4/oa/permission` (OA) from the same client with an `/oa` path segment toggle; matches prior report's community-sourced guess |
| Query params | `app_id`, `redirect_uri`, `code_challenge`, `state` | VERIFIED by official-org source — `zalo-php-sdk`'s `OAuth2Client.php`: `$params = ['app_id'=>…, 'redirect_uri'=>…, 'code_challenge'=>…, 'state'=>…]` built via `http_build_query` |
| `code_challenge_method` | **Not a query param.** Not present in the SDK, not mentioned in the mirror OAuth doc | VERIFIED (mirror) + CORROBORATED (official SDK) — method is fixed to S256 server-side, not client-selected |
| Callback params | `code`, `oa_id` always; `state` only if the developer appended it themselves to `redirect_uri` — Zalo does **not** auto-echo a `state` param | VERIFIED (mirror) — `docs.zaloplatforms.com`'s OAuth page gives a literal example: `https://yourdomain.com/abc?code=<AUTHORIZATION_CODE>&oa_id=<OA_ID>`, and explicit text: *"Hãy dùng biến state hoặc một param tự định nghĩa truyền vào redirect_uri ở bước 3..."* (use `state` or your own custom param, passed in via redirect_uri yourself) |
| passport-zalo (3rd OSS impl) | Same four params (`app_id`, `redirect_uri`, `code_challenge`, `state`), callback reads `code` + `oa_id` | CORROBORATED — github.com/nguyenthanhxuan/passport-zalo agrees with both official SDK and mirror doc |

Sources:
- https://github.com/zaloplatform/zalo-php-sdk/blob/master/src/Authentication/OAuth2Client.php (official Zalo GitHub org)
- https://docs.zaloplatforms.com/docs/OA/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new (mirror, literal callback example + state guidance)
- https://github.com/nguyenthanhxuan/passport-zalo
- https://logto.io/oauth-providers-explorer/zalo (confirms `v4/permission` + `v4/access_token` pair exists for the non-OA Social Login product, useful to disambiguate from `/oa/` variants)

## 3. Bonus: refresh-token error code

UNVERIFIED, stayed unverified. `developers.zalo.me`'s dedicated refresh-token
doc page (`.../lay-access-token-tu-refresh-token-post-4970`) is the client-
rendered SPA and returned only its title, no body, to WebFetch — same
limitation as the prior report. No mirror URL for this specific page was
found this pass (did not search its exact `docs.zaloplatforms.com` slug — cut
for budget). Community thread "API cứ báo về lỗi invalid Refresh token khi
lấy access_token" exists but title-only, no code visible.
Not spending more budget on this per the task's "bonus, only if cheap" note.

## Recommended implementation

```ts
// Webhook signature — test against ONE real sandbox delivery before trusting in prod.
// No official doc backs this; it is the best corroborated OSS consensus.
function verifyZaloWebhookSignature(params: {
  appId: string;
  rawBody: string;      // raw request body string, not re-serialized JSON
  timestamp: string;    // the `timestamp` field already inside the body
  oaSecretKey: string;  // distinct "OA Secret key" from console webhook settings, NOT the app secret
  signatureHeader: string; // value of `X-ZEvent-Signature`
}): boolean {
  const mac = crypto
    .createHash("sha256")              // plain SHA-256, NOT HMAC
    .update(params.appId + params.rawBody + params.timestamp + params.oaSecretKey)
    .digest("hex");
  return mac === params.signatureHeader;
}

ZALO_OAUTH_AUTHORIZE = {
  url: "https://oauth.zaloapp.com/v4/oa/permission",
  params: ["app_id", "redirect_uri", "code_challenge", "state"], // no code_challenge_method
  callbackParams: {
    always: ["code", "oa_id"],
    onlyIfYouAddedIt: ["state"], // Zalo does not append state on its own
  },
};
```

Before wiring the signature check into `apps/agent`, get the OA Secret key
from the app console's webhook settings (a separate field from the app
secret) and test the formula above against one real sandbox webhook
delivery, per the prior report's row 3/5 guidance.

## Unresolved questions

1. Whether `sha256(...)` is truly a plain hash or an informally-named HMAC
   variant — only one source (dataism.one) shows actual code; goclaw-docs
   calls it "HMAC" with no formula. Resolve empirically against a real event.
2. Exact console location/label of the "OA Secret key" field — confirmed to
   exist via community threads, not screenshotted or doc-quoted this pass.
3. Refresh-token-invalid error code and generic error JSON shape at
   `POST /v4/oa/access_token` — still fully unverified, SPA-blocked.
4. `docs.zaloplatforms.com` provenance is still inferred, not proven (see
   prior report's concern #6) — applies to every "VERIFIED (mirror)" fact
   here too.

Status: DONE_WITH_CONCERNS

# Zalo OA webhook signature — hunt for an official primary source

Date: 2026-09-22. Third pass on this fact (prior passes: 2026-09-16, 2026-09-21,
both DONE_WITH_CONCERNS, no official source found). This pass tries 5 new
avenues per the task. Result: still no page of Zalo prose that states the
formula, but found a new, stronger source — an official Zalo GitHub org SDK
with matching code. Net verdict at the end.

## Avenue 1 — SPA JSON API on developers.zalo.me

FAILED to yield doc content. `curl -A "Mozilla/5.0" -H "Accept: application/json"
https://developers.zalo.me/docs/official-account/webhook/tong-quan` returns a
5975-byte HTML shell with an empty `<div id="zaloforwebdeveloperclient2_app">`
— all content is client-rendered. Fetched 2026-09-22.

Found `/api/*` does exist (any path, e.g. `/api/community/document/detail`,
returns `{"error":-102,"message":"Yêu cầu không hợp lệ, vui lòng thử lại"}`,
HTTP 200) but it rejects every guessed path/params identically — looks like a
CSRF or session-token gate, not a discoverable public read API. No
`__NEXT_DATA__` or `window.__INITIAL_STATE__` in the shell HTML. The app JS
bundle (`stc-developers.zdn.vn/static/cms/main-v2.2.2.js`, 6.3 MB) lists doc
slugs (`/docs/api/official-account-api-147` etc.) as client-side route data
but no inline doc bodies. Not pursued further — this bundle is the whole CMS
admin app, out of budget to reverse-engineer its auth.

One useful side effect: the community thread list pages (see Avenue with
community below) DO return a server-rendered `og:description` meta tag with
the first ~150 characters of the post body, even though the app shell
otherwise renders nothing. That is how the quotes below were obtained.

## Avenue 2 — Wayback Machine

BLOCKED, not resolved. `web.archive.org`'s CDX API and direct snapshot URLs
returned HTTP 429 ("Too Many Requests") on every attempt from this machine's
egress IP, including after two backoff waits (15s, 20s). The WebFetch tool
also errors on `web.archive.org` outright ("Claude Code is unable to fetch
from web.archive.org" — a tool-level block, not a site error). Could not
determine whether an archived snapshot of the SPA-rendered doc body exists.
Fetched/attempted 2026-09-22.

## Avenue 3 — Official `zaloplatform` GitHub org SDKs (this pass's real find)

`gh api repos/zaloplatform/zalo-java-sdk` and `.../ZaloDotNetSDK` — both
confirmed OFFICIAL (org `zaloplatform`, README links to
`https://developers.zalo.me/` as the landing page and names it "Zalo Platform
SDK"). Fetched 2026-09-22.

**`zalo-java-sdk`**,
`src/main/java/com/vng/zalo/sdk/utils/MacUtils.java`, current `master`
(https://github.com/zaloplatform/zalo-java-sdk/blob/master/src/main/java/com/vng/zalo/sdk/utils/MacUtils.java):

```java
public static String buildMac(String appId, String data, String timeStamp, String secretKey) {
    String[] lstParams = new String[]{appId, data, timeStamp, secretKey};
    String mac = buildMacForAuthentication(lstParams);
    return mac;
}

public static String buildMacForAuthentication(String[] lstParams) {
    String res = "";
    for (String temp : lstParams) {
        res += temp;
    }
    return encodeSHA256(res);
}

public static String encodeSHA256(String input) {
    ...
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    md.update(input.getBytes());
    ...  // lowercase hex encode
}
```

`MessageDigest.getInstance("SHA-256")` is **plain SHA-256, not HMAC** — Java's
HMAC would be `Mac.getInstance("HmacSHA256")`, a different class entirely.
Output is lowercase hex.

Commit history for this exact file
(`gh api "repos/zaloplatform/zalo-java-sdk/commits?path=.../MacUtils.java"`):
the 4-parameter `(appId, data, timeStamp, secretKey)` signature was introduced
in commit `c8676095a916d740cc4ca3cb6a8fd73a4c1d7644`, "update mac util",
**2023-12-25**. The commit diff shows the prior version was generic —
`buildMac(Object... args)` concatenating whatever was passed, hashed with
Apache Commons `DigestUtils.sha256Hex`. The refactor replaced it with these
exact four named parameters and switched the SHA-256 call site from Commons
to `java.security.MessageDigest` (same algorithm, different library) — this
is a deliberate rewrite, not an incidental rename.

**`ZaloDotNetSDK`**, `src/sdk/utils/MacUtils.cs`
(https://github.com/zaloplatform/ZaloDotNetSDK/blob/master/src/sdk/utils/MacUtils.cs),
last touched 2019, has only a generic `buildMac(string value)` that hashes a
pre-concatenated string with `SHA256Managed` — plain SHA-256 again, but this
older version does not itself name the four inputs or their order, so it
corroborates "plain SHA-256" but not the parameter order.

**Caveat — this is circumstantial, not a documented claim.** `buildMac` is
never called anywhere else in either SDK repo (`grep -rn "buildMac\|MacUtils"`
across both trees, outside the util file itself, is empty) and no README,
comment, or doc string in either repo says "this is for webhook signature
verification" or "X-ZEvent-Signature". The evidence for tying it to the
webhook feature is: (a) parameter names `appId, data, timeStamp, secretKey`
exactly match the four inputs the community formula uses, (b) the rewrite
date (2023-12-25) lines up with when webhook signature verification became a
known feature developers needed, (c) it lives in the official SDK under
`utils`, implying it is a helper meant for something concrete. It is the
strongest source found across three research passes, but it stops short of
being an explicit official statement.

Other `zaloplatform` repos checked and empty of webhook/signature code:
`zalo-php-sdk`, `zalo-android-sdk`, `demo-e2ee-zns-CSharp`, `zoa-extension`,
`demo-e2ee-zns-java` (tree search for `webhook|signature|verify|mac`, all
zero hits except the two MacUtils files above).

## Avenue 4 — FAQ / help center / blog

Nothing found. `oa.zalo.me/home/faq` 404s (Next.js static export with no
matching page, confirmed via its own `__NEXT_DATA__` payload showing
`"page":"/404"`). No dedicated Zalo blog post found via search distinct from
the SPA doc pages and the community forum.

## Avenue 5 — ZNS docs, partner mirrors, PDFs

`developers.zalo.me`'s own ZNS webhook doc page
(`docs/api/zalo-notification-service-api/webhook/...`) is the same SPA,
unreadable. Checked the 8x8.com Zalo ZNS partner docs
(https://developer.8x8.com/connect/docs/usage-samples-zns/, fetched
2026-09-22) — covers ZNS send/OTP payloads only, zero mention of webhook
signature verification. No PDF or slide deck found.

## Community threads hosted on developers.zalo.me — a partial server-rendered
quote, new this pass

The community detail pages are the same unreadable SPA for the reply body,
but the `og:description` meta tag IS server-rendered (confirmed by curling
raw HTML, no JS execution) and contains the first ~150 characters of the
original post. These are THIRD PARTY in the sense that a developer wrote the
post, but they are hosted on the official domain and several explicitly claim
to be quoting Zalo's own docs. Fetched 2026-09-22:

- https://developers.zalo.me/community/detail/d14d09b635f3dcad85e2 —
  `og:description`: *"Hi zalo support team, mình đang bị vướng ở phần verify
  x-zevent-signature header. Mình làm theo hướng dẫn ở đây
  \`\`\`X-ZEvent-Signature: mac = sha256(appId + data"* — "I'm following the
  guide here" followed by a fenced code block, implying the poster is pasting
  a quote from documentation they read (not their own guess).
- https://developers.zalo.me/community/detail/b2918b71b7345e6a0725 —
  `og:description`: *"Hi mọi người, Hiện tại mình đang cần verify webhook
  event, trong tài liệu của Zalo thì dùng OA Secret key để verify
  X-ZEvent-Signature. Có cách nào lấy OA Secre[t key...]"* — "in Zalo's
  documentation, the OA Secret key is used to verify X-ZEvent-Signature" —
  explicit claim that an official doc names the OA Secret key for this
  purpose.
- https://developers.zalo.me/community/detail/f62243c57f8096decf91 —
  `og:description`: *"Tôi sử dụng nodejs const raw_verify = oa_id +
  JSON.strinify(req.body) + req.body.timestamp + OAsecretKey; const hash =
  mac= crypto.createHash(sha256).update(raw"* — one data point using `oa_id`
  instead of `app_id`/`appId` as the first field, the only conflicting
  variant seen across all sources this pass and the prior two passes; this
  poster is also the one with a mismatched hash in the same thread, so this
  may be their bug, not a second legitimate variant.
- https://developers.zalo.me/community/detail/9c8b7b764733ae6df722 —
  `og:description` shows only a wrong hash output, no formula text.

None of these are readable beyond ~150 characters (no replies visible, no
confirmation from Zalo staff visible), so they remain corroboration, not
primary-source proof.

## All prior sources (unchanged from the 2026-09-21 report, re-cited for completeness)

- https://www.dataism.one/2025/04/handling-zalo-webhooks-with-aws-lambda.html
  — THIRD PARTY blog, shows working `crypto.createHash('sha256').update(appId+data+timestamp+secret).digest('hex')` code.
- https://github.com/field-vn/zalo — THIRD PARTY, names `X-ZEvent-Signature`.
- **New this pass**, also THIRD PARTY but with real formula code:
  https://raw.githubusercontent.com/khoanguyen59/zalo-oa/master/src/Service/WebhookService.php
  — `$calculatedHash = 'mac=' . hash("sha256", $data->app_id . $content . $data->timestamp . $this->secretKey);`
  Confirms plain `hash()` (PHP's non-HMAC function), same field order, and
  reveals a detail no prior source had: the header value carries a literal
  `mac=` prefix before the hex digest (`'mac=' . hash(...)`), matching the
  community thread's code-fenced quote `X-ZEvent-Signature: mac =
  sha256(...)`. **This repo's own code does not strip a `mac=` prefix** — see
  Implementation check below.
- 30+ independent third-party repos found via `gh search code
  "X-ZEvent-Signature"` (2026-09-22) all use the header name `X-ZEvent-Signature`
  and the great majority use plain SHA-256 with the `appId+data+timestamp+secret`
  order; a couple (`Rune-kit/rune`, `dora_edu`) label it "HMAC-SHA256" in prose
  with no code shown — same one-off terminology conflict noted in the
  2026-09-21 report, still unresolved and now outweighed 2:1 by actual code
  (dataism.one, khoanguyen59/zalo-oa, and the official Java SDK) all showing
  plain SHA-256.

## Implementation check against this repo

`/Users/luan/repos/crm/apps/api/src/messaging/zalo/zalo-signature.ts`:

```ts
export function zaloSignature(input: ZaloSignatureInput): string {
	return createHash("sha256")
		.update(`${input.appId}${input.rawBody}${input.timestamp}${input.secret}`, "utf8")
		.digest("hex");
}
```

Matches the corroborated formula: plain SHA-256, order `appId + rawBody +
timestamp + secret`, hex. It compares this raw hex against
`(input.header ?? "").trim().toLowerCase()` in `verifyZaloSignature` — **it
does not strip a `mac=` prefix**. If the real header value is `mac=<hex>`
(as the khoanguyen59/zalo-oa PHP code and the community thread's fenced quote
both show), this comparison will fail on every real event until that prefix
is handled. `docs/messaging.md` already flags this class of risk generally
("tested on the first real event, not trusted") but does not call out the
`mac=` prefix specifically — worth adding.

## Verdict

Still no official Zalo prose page states this formula; the SPA and its
`docs.zaloplatforms.com` mirror remain unreadable to a plain fetch, and the
Wayback Machine was rate-limited both attempts. But this pass raises
confidence from "third-party consensus only" to "third-party consensus plus
one official-org source with matching code": `zaloplatform/zalo-java-sdk`'s
`MacUtils.buildMac(appId, data, timeStamp, secretKey)`, rewritten
2023-12-25 to those exact four named parameters, computes plain SHA-256 (not
HMAC) of the concatenation — which matches this repo's implementation on
every point except one: the header value likely has a `mac=` prefix that
`zalo-signature.ts` does not strip. The formula is CORROBORATED (official SDK
code, matching community consensus, not contradicted anywhere), the "OA
secret key not app secret" claim remains THIRD-PARTY only (no official
source names it), and the `mac=` prefix is a newly found, unverified gap in
this repo's code that should be tested against one real sandbox delivery
before trusting the check in production, per the existing guidance in
`docs/messaging.md`.

## Unresolved questions

1. Whether the real `X-ZEvent-Signature` header value is `mac=<hex>` or bare
   `<hex>` — one third-party source with code (khoanguyen59/zalo-oa) and one
   community quote suggest `mac=`; this repo's code assumes bare hex. Needs
   a real sandbox event to settle, not more searching.
2. Whether `secretKey` in the official SDK's `MacUtils` is the app secret or
   the distinct "OA secret key" — the SDK file has no comment either way;
   only third-party sources name the OA secret key specifically.
3. Wayback Machine snapshots of the SPA doc pages — blocked by rate limiting
   both attempts this pass, not proven absent, just unreachable from here.
4. The `developers.zalo.me/api/*` endpoint that returns a generic
   `{"error":-102}` for every path tried — could hide a real doc-content API
   behind a CSRF/session token; not reverse-engineered, out of budget.

Status: DONE_WITH_CONCERNS
Summary: No official Zalo prose page found (SPA blocks fetch, Wayback rate-limited); found a new official-org GitHub source (zaloplatform/zalo-java-sdk's MacUtils, rewritten 2023-12-25) whose plain-SHA-256(appId+data+timestamp+secretKey) code matches this repo's zalo-signature.ts, raising the formula from third-party-only to third-party-plus-official-SDK-code. New risk found: repo code may be missing a `mac=` header-value prefix.
Concerns/Blockers: The "OA secret key not app secret" claim and the `mac=` prefix question remain unverified by any official source; both need a real sandbox webhook delivery to settle, which is outside this research task's scope.

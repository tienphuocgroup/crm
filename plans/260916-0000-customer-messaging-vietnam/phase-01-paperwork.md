---
phase: 1
title: "Paperwork"
status: done
effort: "Company: 2 to 3 weeks elapsed. Engineering: half a day to verify facts. 0 code."
priority: P1
dependencies: []
---

# Phase 1: Paperwork

## Overview

The company registers, verifies and pays for the Zalo Official Account. No code ships in this phase. Each row below produces a credential, an approval or a verified fact that phase 2, 3 or 4 reads. Start every row today. The lead times run in parallel.

Context: brainstorm report sections 3 and 6; Zalo research sections 1, 3, 5 and "Open questions".

## Requirements

- Functional: every credential and every fact in the tables below exists before the phase that needs it starts.
- Non-functional: the company owns every account. No account sits on a rep's personal identity. Secrets go in the root `.env` on the engineer's machine and never in git.

## Checklist

| # | Item | Owner | Lead time | Output | Gates |
| --- | --- | --- | --- | --- | --- |
| 1 | Register a Zalo Official Account for the company at `oa.zalo.me` | Company admin | 1 day | OA id, OA admin login | Phase 2 |
| 2 | Verify the OA (blue check) with the business registration certificate | Company admin | About 7 business days at Zalo | Verified badge | Production traffic in phase 3 |
| 3 | Create a Zalo app at `developers.zalo.me`. Add the OA. Request the OA message and webhook scopes. Submit the application review with a factual purpose | Company admin and engineer | About 72 working hours after submission | `ZALO_APP_ID`, `ZALO_APP_SECRET` | Phase 2 |
| 4 | Register the OAuth redirect URI `<API_URL>/api/messaging/zalo/callback` in the app | Engineer | Same day as row 3 | Redirect URI accepted | Phase 2 |
| 5 | Register the webhook URL `<API_URL>/api/messaging/zalo/webhook` in the app. Record the webhook secret the console shows | Engineer | Same day as row 3. Needs a public HTTPS host | Webhook URL accepted. Secret in `.env` if it differs from the app secret | Phase 3 |
| 6 | Register a sandbox or test OA for development. Link it to the same app | Engineer | 1 day | Test OA id | Phase 2 development |
| 7 | Confirm the three product assumptions from the brainstorm: one OA for the whole workspace; reps reply from the CRM inbox only, no mobile push; inbound images and files stay as Zalo URLs, not copied to Blob | Product owner | 1 day | Written answer in `docs/messaging.md` | Phase 2 |

## Verify before coding

These facts conflict across sources or are missing. Read the live Zalo developer docs while signed in to the developer account from row 3. Send one real event from the sandbox OA where the docs are not clear. Write every answer into `docs/messaging.md` under "Verified Zalo facts" with the date and the source URL.

| # | Fact | Why it matters | Where it lands |
| --- | --- | --- | --- |
| A | Reply window length. The policy page says 48 h. The OpenAPI overview says 7 days. Also: is there a per-window count of free replies, and what is it | A wrong value blocks free replies or spends 55 VND per message. A declared quota that is not enforced charges the next reply silently | `MESSAGING_POLICY.zalo.replyWindowMs` and `freeRepliesPerWindow` in `packages/db/src/messaging.ts` (phase 2). No quota: delete the constant |
| B | Webhook signature. Header name (`X-ZEvent-Signature` or `X-Zalo-Signature` or a `mac` body field), HMAC input order (`app_id + body + timestamp + secret`), and which secret | A wrong header name rejects every event | `zalo-signature.ts` (phase 3) and the `ZALO_OA_SECRET_KEY` decision (phase 2) |
| C | Webhook retry policy and event ordering | Duplicates and gaps decide the dedupe rule | Dedupe by Zalo message id (phase 3). Assume at-least-once and out-of-order until proven otherwise |
| D | OAuth v4 exact field names for authorise, PKCE, token exchange and refresh. Access token lifetime. Refresh token lifetime and single-use rule. The HTTP status and error codes for an expired token, a revoked token and an invalid refresh token, against those for rate limits and server errors | The connect flow and the refresh task read these names. The error classifier splits terminal from transient; a wrong split blocks every rep on a blip or retries a dead token forever | `zalo-oauth.service.ts` (phase 2), `zalo-client.ts` (phase 2), `zalo-errors.ts` (phase 2) |
| E | Endpoint paths and response shapes for OA profile, consultation text send and message events. Text length limit. The hostnames that attachment URLs in `user_send_image` and `user_send_file` events use | The Zod client parses these shapes. The attachment host allowlist rejects any other host | `zalo-client.ts` (phase 2 and 4), `zalo-webhook.schema.ts` (phase 3), `MESSAGING_POLICY.zalo.attachmentHosts` (phase 2) |

## Implementation Steps

1. Create a shared checklist from the table above. Assign each row an owner and a due date.
2. Start rows 1, 3 and 6 on the same day. They do not block each other.
3. When row 3 completes, put `ZALO_APP_ID` and `ZALO_APP_SECRET` in the root `.env` on the engineer's machine. Never commit them.
4. Complete rows 4 and 5 in the app console. Use a tunnel host for the webhook URL in development.
5. Answer facts A to E. Create `docs/messaging.md` with one section "Verified Zalo facts". Each fact gets one line: the answer, the date, the source URL.
6. Record the row 7 answers in the same file under "Product decisions".

## Success Criteria

- [ ] Rows 1, 3, 4, 6 and 7 done. Phase 2 starts against the test OA while row 2 runs. (needs sandbox OA) — row 7 (product decisions) is done; rows 1, 3, 4, 6 need a real Zalo OA and app registration. `ZALO_APP_ID`/`ZALO_APP_SECRET` are not set in `.env`.
- [ ] Row 5 done before phase 3 starts. (needs sandbox OA) — webhook URL is not registered in the Zalo console.
- [x] Facts A to E answered in `docs/messaging.md` with source URLs.

## Risk Assessment

- RISK: Zalo refuses the OA verification or the app review. The feature is dead. Mitigation: submit today. Keep the purpose text factual. This is the kill criterion from the brainstorm.
- RISK: The reply window answer is still ambiguous after reading the docs. Mitigation: pick the shorter value. A short window blocks a free reply. A long window spends money.
- RISK: The webhook needs a public HTTPS host before the API is deployed. Mitigation: a tunnel in development. The webhook URL is edited again at deploy time.
- RISK: The company registers the OA on a rep's personal identity. Mitigation: row owners are company admins. The plan states it.

## Rollback

Nothing to roll back. Cancelling an item leaves a later phase gated, and the Zalo card stays "Not configured".

## Outcome — 2026-09-21

Facts A-E answered in `docs/messaging.md` "Verified Zalo facts", dated 2026-09-16 and
2026-09-21. Fact A (window, quota) is official-source verified; facts B (signature) and D
(OAuth) are community-corroborated only, no official primary source found — see
`research-260921-1900-zalo-signature-and-authorize-url-report.md`. Fact E (user profile) is
OSS-corroborated — see `research-260921-2110-zalo-oa-user-profile-endpoint-report.md`.

Paperwork rows 1, 3, 4, 5, 6 (register OA, app, redirect URI, webhook, sandbox OA) are not
done: `ZALO_APP_ID`/`ZALO_APP_SECRET` are unset in `.env`. Engineering proceeded on the
verified facts alone, per user direction to keep coding moving in parallel (plan.md
Dependencies). This blocks every manual sandbox check listed in phase 2-4 Outcomes.

Fact A is re-verified 2026-09-22 against the official Zalo hub. The per-window reply quota no
longer exists, so `freeRepliesPerWindow` is deleted. Only `replyWindowMs` remains.

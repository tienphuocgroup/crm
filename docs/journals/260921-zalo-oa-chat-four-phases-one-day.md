# Zalo OA Chat: Four Phases, One Day, Still Not Wired to a Real Sandbox

**Date**: 2026-09-21 19:00–22:13
**Severity**: Medium (nothing broke production; several findings would have if they had shipped un-reviewed)
**Component**: `apps/api/src/messaging`, `apps/agent/agent/lib/messaging`, `apps/app` inbox and composer, `packages/db` messaging schema
**Status**: Ongoing — implemented and reviewed on `feat/zalo-oa-chat`, not committed, not merged, no sandbox OA connected

## What Happened

Built the whole Zalo Official Account chat feature in one day: four phases, schema through outbound send, on branch `feat/zalo-oa-chat`. Opus coders wrote each phase. Sonnet scouts and researchers verified plan anchors and Zalo facts first. A code-reviewer pass ran after every phase, backend and UI separately, then a fix pass closed most findings. Phase 1 shipped no code: it verified five "facts" about Zalo's API against community sources, because Zalo's own docs site is client-rendered and unreachable by a fetch tool.

A separate two-reviewer architecture pass ran the same day and found four more high-severity gaps: an activity stamp write outside the transaction, an open redirect in the OAuth return path, a refresh backoff that resets on every failure, and an unlocked scheduler race that can burn a single-use refresh token twice.

## The Brutal Truth

Nobody has clicked a Zalo message in a browser. Zero. `ZALO_APP_ID` and `ZALO_APP_SECRET` were never set in `.env`, so the signature formula, the OAuth callback shape, and the user-profile response all rest on community GitHub code and forum threads, not Zalo's own docs. `docs/messaging.md` says it outright: "The signature is tested on the first real event, not trusted." That is an honest sentence to have to write about code that touches a real customer conversation.

The reviewers earned their keep today. A Zalo 5xx with a JSON error body was classified as a *terminal* token failure — one bad five minutes on Zalo's servers would have parked the OA in "Needs a reconnect" and blocked every rep until someone clicked reconnect by hand. No test caught it; none exercised a 500 with a body attached.

## Technical Details

Facts that moved once real research landed: the signature formula (`sha256(app_id + raw_body + timestamp + oa_secret_key)`, plain SHA-256, one community implementation, no primary source) ships untested. Zalo does not guarantee echoing `state` on the OAuth callback — the handler falls back to the newest unexpired `zalo-pkce` row for the session user. A real payload used `http://` for an attachment, not `https://` — the allowlist accepts both on three Zalo hosts and the bubble upgrades to `https`. Zalo's retry schedule runs up to an hour later with the *original* timestamp, so the plan's 5-minute replay tolerance shipped as 2 hours instead; 5 minutes would have silently dropped a legitimate retry. Message events carry no display name, only an id — fixed with a `message-identity-profile` task and a `profileCheckedAt` negative cache, so a non-follower (`-213`) costs one vendor call total, not one per inbound message.

What review caught that tests did not, worst first: (1) a Zalo 5xx with a JSON body classified terminal, not transient, in `zalo-client.ts` — parsed the envelope before checking `response.ok`; (2) the OAuth controller never parsed its own query with the Zod schemas written for it, so a duplicated query key threw an unhandled 500; (3) refresh backoff indexed by `task.attempts`, but each rebook is a fresh row starting at `attempts = 0`, so every failure re-selected the 5-minute step forever and the 30-minute/2-hour steps were dead code; (4) an anonymous form-encoded POST made the webhook answer 500 or hang, because the raw-body guard ran before the content-type check; (5) the webhook controller ignored the writer's own refusal and answered 200 anyway, silently losing the message; (6) a message Zalo had already delivered (200 received) could still be written `FAILED` on a later local DB error, inviting a duplicate send on "Try again" — fixed by settling `SENT` with no `externalId` on that race; (7) a crash between claiming a row `SENDING` and Zalo's answer left it `SENDING` forever — fixed by settling `FAILED` with `errorCode "interrupted"` on re-lease; (8) `clientRequestId` was generated fresh per submit instead of held for one logical send, defeating the server's own duplicate-send guard — fixed the same evening with a `requestIdLease()` that holds one id until the mutation settles.

## What We Tried

Started the day with Postgres down — Docker was not running. `pg_isready` and a raw `pg.Client` connect both answered `ECONNREFUSED`. Rather than block, the phase 2 migration was generated with `prisma migrate diff --from-schema ... --to-schema ... --script`, which needs no live connection, only the schema files. Four integration specs failed on their first fixture write with `ECONNREFUSED` and were reported as not executed, not skipped quietly. The user brought Docker back later in the day; the migration applied and those specs ran for real from that point on.

The plan's raw-body premise assumed `create-app.ts:15` controlled body parsing for the webhook signature check. It did not hold: `@thallesp/nestjs-better-auth` parses every request body regardless, leaving no raw buffer for a signature that must cover the exact wire bytes. Fixed with `bodyParser: { rawBody: true }` at the Nest app level, the option the better-auth package documents for exactly this case. The plan's anchor was wrong about which layer owned the decision.

The plan called for "one migration." It became two. Phase 4's review found `ContactChannelIdentity` needed a `profileCheckedAt` column, discovered after phase 2's migration had already applied to the live dev database. Rewriting that applied migration would have meant `prisma migrate reset` — destructive, against the same shared dev database already burned once today. A second migration, `20260921221500_messaging_profile_checked`, one `ALTER TABLE`, shipped instead.

## Root Cause Analysis

This feature talks to a vendor whose own docs are unreachable by tooling and whose signature formula has no official spec. Every "Community" row in `docs/messaging.md` is a bet, not a verification — not a process failure, the actual state of Zalo's public documentation, but it means the webhook tolerance, the backoff math, and the 5xx-classification bug all trace to code written against inferred behavior, caught only where a reviewer read the exact line that decided status before the body shape, or after.

The double migration and the Postgres outage share a second root: the dev environment is shared and stateful, and nobody here can safely destroy and rebuild it to fix an earlier schema call. A schema mistake found after a migration applies always costs a second migration here, never a fixed first one.

## Lessons Learned

- Say "community, untested" in the artifact itself when a vendor's docs are unreachable, and gate the vendor call behind a real sandbox check before trusting it in production. `docs/messaging.md` did this well.
- Check HTTP status before branching on body shape, always. The 5xx-with-JSON-body bug is the same mistake every time.
- A backoff index derived from `task.attempts` breaks the moment retries are modeled as fresh rows instead of a re-leased one. Check the retry representation before writing the math.
- Independent reviewer passes catch different bugs. The transaction-boundary bug in `ActivityStampService.touch()` and the OAuth open redirect came from the separate architecture review, not the per-phase code reviewer.
- "Not fixed, with an owner and a cause" beats silence. Every open finding above has both, which is what makes this journal possible to write honestly instead of guessing.

## Next Steps

- Owner: user/company. Set `ZALO_APP_ID`/`ZALO_APP_SECRET`, get a sandbox OA, run the first real webhook event through `zalo-signature.ts` before trusting the formula in production.
- Owner: the user. Add `ZALO_APP_ID` and `ZALO_APP_SECRET` to `.env`, connect the sandbox OA, send one real event, and walk the inbox and composer in a browser.
- Owner: next implementer. Run a full browser pass — inbox, composer, scroll-to-newest, reconnect error display — none of it has been rendered.
- Owner: design. Replace the hand-drawn Zalo brand mark in `packages/ui/src/components/brand-logos/zalo.tsx` with the official asset.
- Do not commit the untracked `apps/api/tmp-*.ts` debris or the pre-existing edits to `AGENTS.md`, `docs/agent.md`, `packages/db/prisma/seed.ts` — they predate this feature and are unrelated.

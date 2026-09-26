# Phase 2 UI — Zalo Official Account connection

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made.

Read: `AGENTS.md`, `docs/design.md`, `docs/connections.md`, `docs/i18n.md`,
phase 2, the backend report, scout sections 8 and 9. Skills: `shadcn`,
`i18n-extract`.

## Files created

`settings/connections/zalo/page.tsx` (271 lines, server page: unconfigured,
pre-connect, connected), `zalo/zalo-connect-button.tsx` (76, `ZaloConnectButton`,
`ZaloReconnectButton`, error sentences), `zalo/zalo-disconnect-button.tsx` (102,
confirm dialog, `zalo.disconnect`, `cache.zalo()`),
`packages/ui/src/components/brand-logos/zalo.tsx` (21, icon mark).

## Files modified

`apps/app/lib/trpc/cache.ts` (`zalo(options)`), `settings/connections/page.tsx`
(fetch `zalo.status`, connected card row), `add-connection-dialog.tsx`
(`CatalogRow`), `messages/{en,vi}/settings.json` (30 keys each),
`scripts/i18n/allowlist.json` (2 entries). The backend agent's
`activity-presentation.ts` and `common.activityTypeMessage` entries stay.

## What the page shows

`configured: false` names the two env vars and stops. Connected leads with the
OA name, the verified badge and three `StatusIndicator` liveness lines: token
health, last inbound message, unmatched people linking to
`/<slug>/messages?filter=unmatched`. A set `tokenError` also raises a warning
`Alert` with a Reconnect button. Then "Brings in", "Sends", the "Customers start
the conversation…" sentence, and Connect or Disconnect. `connectErrorOf(query,
"zalo")` maps `state`, `code`, `exchange`, `profile`; others take a fallback.

## Catalog keys added (en + vi, 30 each)

`settings.connections.zalo*`: `ApproveNotice`, `BringsIn`, `CatalogDescription`,
`ConnectButtonLabel`, `ConnectedToOa`, `ConnectErrorCode`, `ConnectErrorExchange`,
`ConnectErrorFallback`, `ConnectErrorProfile`, `ConnectErrorState`,
`ConnectingIntro`, `CustomerStartsNotice`, `DisconnectConfirmDescription`,
`DisconnectConfirmTitle`, `DisconnectedToast`, `DisconnectingLabel`,
`EveryoneMatched`, `LastMessageLabel`, `MemberNotice`, `NoMessagesYet`,
`NotConfiguredLabel`, `NotConnectedLabel`, `ReconnectButton`, `Sends`,
`TokenNeedsReconnect`, `TokenNotRefreshedYet`, `TokenRefreshedLabel`,
`UnavailableDescription`, `UnmatchedPeople`, `VerifiedBadge`. Reused:
`connections.connected`, `.disconnect`, `.bringsInLabel`, `.sendsLabel`,
`common.cancel`. Allowlist: `Zalo`, `Zalo Official Account`. `messages/pseudo/`
is generated and gitignored, so it is untouched.

## Commands

All pass. `bun run check-types` 13 of 13 tasks. `bun run lint` 9 of 9 tasks.
`bun run i18n:check` 0 findings, 47 allowlist entries. `bun run i18n:catalogs`
in sync, 1 pre-existing warning. `cd apps/app && bun test` 152 of 152.

## className audit

27 hits in the three new app files, 0 in the brand mark. All are layout or
semantic-token utilities the Slack page already uses. No literal radius, no
literal colour, no component style override.

## Backend specs — weak assertions found (read only, not edited)

1. `zalo-oauth.spec.ts` "disconnects the first and completes its open tasks":
   `expect(replaced.every(…)).toBe(true)` passes on an empty array.
   Fix: add `expect(replaced).toHaveLength(1)`.
2. `zalo-connection.spec.ts:263`: same shape, `settled.every(…)`, no length.
   Fix: add `expect(settled).toHaveLength(2)`.
3. `message-token-refresh.integration.spec.ts:155` "rebooks at the moment the
   token needs refreshing" asserts only `dueAt > Date.now()`. A rebook one
   millisecond from now passes.
   Fix: assert `tokenExpiresAt - MESSAGING.zalo.refreshAheadMs`.

The other cases assert row identity, row counts and exact outcomes.

## Issues

1. NOT DONE — `/messages?filter=unmatched` does not exist. The unmatched-people
   link 404s until phase 3 builds the route.
   Fix: phase 3 owns the route. The link is written to the planned path.
2. RISK — `ZaloOauthService.claimVerifier()` accepts a callback with no `state`
   and takes the newest pending verifier of the session user. The plan says
   redirect with `error=state`. PKCE still refuses an injected code.
   Fix: not mine. Confirm Zalo v4 drops `state`, or restore the plan's rule.
3. RISK — `/api/messaging/zalo/connect` throws 403 for a member without the role
   and for a missing env pair. That person sees raw API JSON, not the CRM. The
   UI disables the button, so only a hand-typed URL reaches it.
   Fix: not mine. Redirect with `error=role` and `error=config`.
4. UNKNOWN — The Zalo mark is hand-drawn path data, a blue speech bubble with a
   white Z. It is not extracted from the official asset.
   Fix: replace the two paths in `packages/ui/src/components/brand-logos/zalo.tsx`
   with the official mark. I caused this.
5. UNKNOWN — Nothing rendered. Postgres is up, but no dev server ran, so the
   page is verified by types, lint and the i18n checker only.
   Fix: open `/<slug>/settings/connections/zalo` after the next restart.

Status: DONE_WITH_CONCERNS
Summary: The Zalo connection page, the connect and disconnect buttons, the brand
mark, the cache entry, the connections card row and the catalog dialog row all
ship, with 60 catalog values and 2 allowlist entries. Types, lint, i18n and the
app suite pass.
Concerns: The brand mark is hand-drawn. The unmatched link waits on phase 3.
Three backend assertions are weak and two backend refusals bypass the UI.

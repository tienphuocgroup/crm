# Phase 3 UI — the Zalo inbox in `apps/app`

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made. Only `apps/app`
changed. `packages/ui` needed no new component.

Read: `AGENTS.md`, `docs/design.md`, `docs/connections.md` (Layout, Cards versus
flat, short pages, irreversible things), `docs/i18n.md`, `docs/messaging.md`,
phase 3, the phase 3 backend report, scout section 8, skills `nuqs`,
`i18n-extract`.

## Files created

| File | What it is |
| --- | --- |
| `app/(app)/[slug]/messages/page.tsx` | Server page. Reads `zalo.status`, renders the pre-connect page or the inbox |
| `app/(app)/[slug]/messages/messages-inbox.tsx` | Client. Two panes, `threads` infinite query, mark read |
| `app/(app)/[slug]/messages/messages-search-params.ts` | nuqs `filter` and `thread` |
| `components/crm/messaging/messaging-ui-config.ts` | `MESSAGING_UI` poll intervals |
| `components/crm/messaging/thread-list.tsx` | Segmented filter, counts, rows, avatar, snippet, unread badge |
| `components/crm/messaging/thread-view.tsx` | Header, unmatched banner, overflow menu, messages, "Load earlier" |
| `components/crm/messaging/message-bubble.tsx` | Bubble, attachments, image gate |
| `components/crm/messaging/link-contact-dialog.tsx` | `search.quick` picker plus `useLinkContact` |
| `components/crm/messaging/messages-unread-badge.tsx` | Nav badge, polls `unreadCount` |
| `components/crm/messaging/use-person-label.ts` | Turns a `PersonLabel` into a sentence |
| `components/crm/timeline/message-thread-entry.tsx` | Zalo mark, count, name, "Open messages" |
| `lib/messaging.ts` | Pure helpers: `attachmentUrl`, `identityLabel`, `threadLabel`, `nameParts`, `messageKindKey` |
| `test/messaging.spec.ts` | 22 tests |
| `test/activity-presentation.spec.ts` | 3 tests |

## Files modified

`lib/trpc/cache.ts` (`messaging()`, `contact()`, `removed()`),
`components/app-icon-rail.tsx` (Messages item, `SendAlt`, badge),
`components/crm/timeline/timeline.tsx`, `timeline-entry.tsx`,
`timeline-search-params.ts`,
`app/(app)/[slug]/contacts/create-contact-sheet.tsx` (four new props),
catalogs `messages/{en,vi}/{contacts,nav,common}.json`.

`settings/connections/zalo/page.tsx` needed no change: it already links to
`/<slug>/messages?filter=unmatched` and already reads `lastInboundAt`.

## Catalog keys

| Namespace | Keys added per locale |
| --- | --- |
| `contacts` | 43, all prefixed `messaging` |
| `common` | 4, under `timeline` (`tabMessages`, `emptyMessagesTitle`, `emptyMessagesDescription`, `openMessages`) |
| `nav` | 1 (`messages`) |

`en` and `vi` both ship. No new namespace, no allowlist entry. Timeline strings
stay in `common.timeline` with the other tabs.

## Decisions

1. **`@crm/db/messaging` is browser safe, so the bubble imports the real
   policy.** The module has zero imports. `@crm/db/currency` is the precedent in
   a client component. The three hosts are not copied.
2. **The inbox owns the `threads` query, the list renders it.** The thread view
   needs the selected row and the URL is the only selection state. One query
   owner, no second copy.
3. **The page passes `canManage` only.** The client needs no slug: the timeline
   entry builds its link with `useWorkspaceUrl()`.
4. **The page does not prefetch.** The `filter` in the URL decides the query
   input. A prefetch with the wrong filter is a wasted round trip.
5. **Mark read runs in an effect on the `thread` param.** A deep link from the
   timeline clears the badge, not only a click.
6. **The person label is one pure helper.** `threadLabel()` returns a name or a
   key plus `{ suffix }`; `usePersonLabel()` renders it. Zalo sends no name, so
   every row reads "Zalo user ····7890" from the last 4 of `externalId`.
7. **"Create contact" uses the sheet's own trigger.** The label is
   `contacts.createTitle`. A fifth prop for a custom label is not in the brief.
8. **Outbound status is `errorMessage` only.** Phase 4 owns the rest. No
   outbound row exists before the composer ships.
9. **An attachment on an unlisted host renders nothing.** Not a link, not a
   sentence: the rep's browser must never call that host.

## Commands

| Command | Result |
| --- | --- |
| `apps/app` `bun run check-types` | pass |
| `bun run lint` | pass, 9 of 9. 2 warnings in `apps/app`, one mine |
| `bun run i18n:check` | 0 findings, 340 files |
| `bun run i18n:catalogs` | in sync. 1 warning, pre-existing, in `settings` |
| `apps/app` `bun test` | 177 pass, 0 fail, 18 files (was 152) |
| root `bun run check-types` | fails in `apps/api` only, see issue 1 |
| `grep className` in new files | layout and text utilities only, see below |

`className` hits are flex, page tokens, `truncate`, `sr-only` and text colour.
Five need a word: `ZaloLogo size-6` copies the Zalo connection page;
`<img max-h-60 w-auto rounded-md>` sizes a bare element from the radius scale;
`Button md:hidden` hides the back button on a wide screen; `DropdownMenuContent
min-w-44` copies `record-actions.tsx`; `Button self-center` centres "Load
earlier". No colour, no shadow, no literal radius.

## Issues

1. BROKEN — `apps/api` test files fail `check-types`. `IncomingChannelMessage`
   has `accountExternalIds`, the specs write `accountExternalId`.
   Fix: not done. `apps/api` belongs to the parallel reviewer.
2. NOT DONE — The timeline entry cannot show the "····last4" fallback. The
   `messageThread` payload carries `displayName` and no `externalId`.
   Fix: add `externalId` to the `messageThread` select in
   `activities.service.ts`. The entry shows "Zalo user" until then.
3. NOT DONE — `?thread=<id>` opens nothing when the thread is not in a loaded
   page. The list holds 30 rows per page and there is no `threadById`.
   Fix: add `messaging.threadById`. The view shows the picker until then.
4. RISK — `cache.messaging()` after mark read refetches the open thread's
   messages. One extra request per thread opened.
   Fix: accepted. The brief asks for `cache.messaging()`. I caused this.
5. RISK — `lint` prints one warning: `<img>` instead of `next/image`. The build
   still passes.
   Fix: accepted. Zalo URLs expire and the host is not in `remotePatterns`. The
   brief asks for `<img>`. I caused this.
6. NOT DONE — No composer and no contact sheet Messages tab. Phase 4 owns both.
7. UNKNOWN — Nothing is checked in a browser. No dev server runs here.

Status: DONE_WITH_CONCERNS
Summary: `/messages` lists, filters, opens, links, unlinks and deletes Zalo
conversations; the rail badge, the timeline tab and the timeline entry ship; the
app typechecks, lints, and 177 tests pass.
Concerns: `apps/api` fails `check-types` in three spec files that I must not
touch. A deep link to an old thread needs `messaging.threadById`.

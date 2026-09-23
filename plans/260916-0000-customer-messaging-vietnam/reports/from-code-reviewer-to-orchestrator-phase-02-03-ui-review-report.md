# Phase 2 and 3 UI review — Zalo connection page and the `/messages` inbox

Date 2026-09-21. Branch `feat/zalo-oa-chat`. Review only. No file changed except
this report. `apps/api` and `apps/agent` are not read.

## Scope

18 files. `settings/connections/zalo/**` (3), `messages/**` (3),
`components/crm/messaging/**` (7), `message-thread-entry.tsx`, `lib/messaging.ts`,
`packages/ui/src/components/brand-logos/zalo.tsx`, 2 spec files, plus diffs in
`cache.ts`, `app-icon-rail.tsx`, `timeline*`, `create-contact-sheet.tsx`,
`activity-presentation.ts`, `connections/page.tsx`, `add-connection-dialog.tsx`,
8 catalog files and `allowlist.json`.

## Commands run

| Command | Result |
| --- | --- |
| `bun run i18n:check` | 0 findings, 340 files, 47 allowlist entries |
| `bun run i18n:catalogs` | in sync, 1 warning, pre-existing in `settings` |
| `apps/app` `bun test` | 177 pass, 0 fail, 440 assertions, 18 files |
| `apps/app` `bun run check-types` | pass |
| `apps/app` `bun run lint` | 2 warnings: `<img>` (new, accepted), `document.cookie` (pre-existing) |
| catalog parity script (en vs vi, 4 namespaces) | key sets identical, ICU placeholders identical for every added key |

## What passes

- Server/client split is clean. No `"use client"` file imports `@crm/auth`, the
  `@crm/db` barrel, `next/headers`, `@/lib/session` or `@/lib/trpc/server`.
  `packages/db/src/messaging.ts` has zero imports, so `@crm/db/messaging` is
  browser safe. `apps/app/lib/messaging.ts:1` imports `@crm/db/enums` as a type.
- Both pages compute on the server and hand finished data to the client
  (`messages/page.tsx:42`, `zalo/page.tsx:69`). Both sit inside `Suspense`, so
  the locale read stays under a boundary.
- Attachment gate is correct. `attachmentUrl()` refuses a non-`http(s)` scheme,
  suffix-matches the host (`lib/messaging.ts:31-37`), and upgrades to `https`.
  `evilzdn.vn` is refused and tested (`test/messaging.spec.ts:31`). Every
  attachment link carries `target="_blank" rel="noopener noreferrer"`. No file
  renders raw HTML.
- The connect URL is built from `NEXT_PUBLIC_API_URL` and `returnTo` is a
  relative path (`zalo-connect-button.tsx:7-10`).
- Layout uses the tokens. The inbox is two panes inside
  `max-w-(--container-page-wide)` (`messages-inbox.tsx:59`). Pre-connect pages
  centre vertically. `className` carries layout and semantic tokens only: no
  colour, no shadow, no literal radius, no arbitrary value.
- The delete sentence is exact. The disconnect confirm is bounded in writing.
  Token health leads the connection page.
- `cache.messaging()` uses `pathKey()` for the two infinite queries and
  `queryKey()` for the two flat ones (`cache.ts:65-71`).
- `CreateContactSheet` keeps its old behaviour: both new flags default to the
  previous values (`create-contact-sheet.tsx:63-73`).
- The two spec files assert real behaviour. `messaging.spec.ts` covers the host
  gate, the scheme gate, case folding and the name split.

## Issues

1. RISK — The thread view never scrolls to the newest message. A rep opens a
   conversation and reads the oldest message of the newest page. "Load earlier"
   prepends rows and the view jumps. `thread-view.tsx:244-266`.
   Fix: not done. Add a bottom ref plus `scrollIntoView` on mount, and restore
   `scrollHeight` delta after `fetchNextPage`.
2. BROKEN — A deep link to an old conversation opens nothing. `selected` comes
   only from the loaded pages (`messages-inbox.tsx:42`) and the UI never calls
   `messaging.threadById`. `grep threadById apps/app` returns zero hits. The
   timeline "Open messages" link (`message-thread-entry.tsx:32`) shows "No
   conversation open" for any thread past the first 30 rows.
   Fix: not done. Query `messaging.threadById` when `threadId` is set and
   `selected` is null, then render that row.
3. RISK — `markRead` fires for any `?thread=` value, before the thread resolves
   (`messages-inbox.tsx:52-55`). A stale or foreign id produces an error toast on
   page load.
   Fix: not done. Run the effect only when the thread resolves.
4. RISK — Opening a conversation refetches that conversation. `markRead` success
   calls `cache.messaging()` (`messages-inbox.tsx:46`), which invalidates
   `messaging.messages.pathKey()`, the activity keys and `zalo.status`
   (`cache.ts:232-238`). Three active queries refetch per click, one of them the
   page just loaded.
   Fix: not done. Invalidate `threads` and `unreadCount` only after mark read.
5. RISK — The open conversation stays unread. `markRead` runs on the `thread`
   param only (`messages-inbox.tsx:52`). A message that arrives while the rep
   reads the thread keeps the rail badge up until the rep selects another thread
   and comes back.
   Fix: not done. Re-run `markRead` when the selected row reports unread rows.
6. BROKEN — A failed reconnect reports nothing. `connectError` renders only in
   the pre-connect branch (`zalo/page.tsx:59-67`). The Reconnect button in the
   token alert (`zalo/page.tsx:179`) returns to the connected page, where
   `?error=` is dropped and the page looks healthy.
   Fix: not done. Pass `connectErrorOf(query, "zalo")` into `ConnectedZalo` and
   render it beside the Reconnect button.
7. RISK — Two fields answer one question. The banner tests `thread.contact`
   (`thread-view.tsx:174`, `:220`), the overflow menu tests `thread.contactId`
   (`thread-view.tsx:200`). A row with `contactId` set and `contact` null shows
   the unmatched banner and "Unlink" together.
   Fix: not done. Use one field in all three places.
8. RISK — The avatar URL skips the host gate.
   `PersonAvatar src={thread.identity.avatarUrl}` (`thread-list.tsx:185`,
   `thread-view.tsx:170`) has no allowlist and no `https` upgrade. The browser
   calls whatever host the stored profile holds. An `http` avatar is blocked as
   mixed content and falls back to initials.
   Fix: not done. Pass the value through `attachmentUrl()`.
9. RISK — A message whose attachments are all refused renders an empty bubble.
   The map renders nothing (`message-bubble.tsx:42-48`) but
   `message.attachments.length === 0` stays false, so the kind sentence at
   `message-bubble.tsx:61` is skipped. The rep sees a bubble with a timestamp.
   Fix: not done. Resolve the URLs first, then decide the fallback.
10. RISK — The rail badge polls for every user on every page
    (`app-icon-rail.tsx:94`, `messages-unread-badge.tsx:11-14`), also when Zalo
    is not configured. One request per user per 30 seconds buys nothing in a
    workspace with no OA.
    Fix: not done. Gate the query on a connected OA.
11. UNKNOWN — The Zalo mark is hand-drawn. `brand-logos/zalo.tsx:10-17` holds
    two paths and two fills, `#0068FF` and `#FFFFFF`. `stripe.tsx` holds one path
    and one brand fill. The shape is a speech bubble with a "Z", not the official
    glyph. It reads correctly at `size-4` and `size-6` in both themes and is
    exported by the same `./components/*` map as the others, so it is acceptable
    until the official asset lands.
    Fix: replace both paths with the official mark.
12. NOT DONE — `MESSAGING_UI.queuedPollMs` is unused
    (`messaging-ui-config.ts:5`). Phase 4 owns it. The plan names the constant,
    so this is expected, not scope creep.
13. RISK — The inbox has no live refresh. The thread list and the open thread
    refetch on window focus after the 30 s `staleTime` (`query-client.ts:6`) and
    on mutation only. A rep watching the screen sees a new message after the
    badge poll and a focus change.
    Fix: not done. Phase 4 owns the live channel.
14. UNKNOWN — Nothing is rendered in a browser. No dev server runs in this
    review. Every claim above comes from the source, the type checker, the
    linter, the i18n checker and the test suite.

## Checks that found nothing

Hooks order (`ThreadView` returns early before the heavy hooks, which live in
`ThreadConversation` behind `key={thread.id}`), nuqs parser defaults
(`parseAsStringLiteral(...).withDefault("all")`, `parseAsString` for the thread),
`NuqsAdapter` presence (`app/layout.tsx:57`), `nuqs/server` in a client bundle
(`timeline-search-params.ts` is the precedent), catalog key resolution (every
`t()` literal and every dynamic map value resolves in `en`), invented namespaces
(none), pure helpers returning sentences (none, `lib/messaging.ts` returns keys),
API prose re-translation (none, `errorMessage` renders verbatim at
`message-bubble.tsx:58`, as `docs/i18n.md` requires), search debounce
(`quick-switcher.tsx:54` is the same shape).

## Verdict

**APPROVE_WITH_FIXES**

Must fix before landing:

1. Issue 2 — deep link opens nothing. The timeline entry is the main door.
2. Issue 3 — mark read fires on an unresolved thread id.
3. Issue 1 — the thread opens at the oldest message.
4. Issue 6 — a failed reconnect is silent.

Fix next, not blocking: issues 4, 5, 7, 8, 9.

Status: DONE_WITH_CONCERNS
Summary: The two UI surfaces follow the server and client split, the design
tokens, the i18n rules and the attachment trust boundary. Four defects change
behaviour a rep sees, and the deep link from the timeline is broken.
Concerns: `messaging.threadById` ships in the API and the UI does not call it.
Mark read runs unguarded and refetches the thread it just opened.

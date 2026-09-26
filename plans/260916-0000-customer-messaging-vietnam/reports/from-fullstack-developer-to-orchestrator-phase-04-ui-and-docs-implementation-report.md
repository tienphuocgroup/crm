# Phase 4 UI and docs — the composer, the contact tab, the rules

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No commit made. Only `apps/app`,
`docs/*.md` and `AGENTS.md` changed. `packages/ui` needed no new component.
`.env.example` needed no change: phase 2 documents all three variables and the
two URLs already.

Read: `AGENTS.md`, `docs/design.md`, `docs/i18n.md`, `docs/messaging.md`,
`docs/api.md`, `docs/agent.md`, `docs/connections.md`, `docs/telemetry.md`,
`docs/environment.md`, phase 4, the phase 4 backend report, the phase 3 UI report,
the phase 2/3 UI review fixes report. Source read for the docs:
`apps/api/src/messaging/**`, `apps/agent/agent/lib/messaging/**`,
`packages/db/src/{messaging,agent-tasks}.ts`, `packages/telemetry/src/*`,
`apps/api/src/telemetry/rollup.service.ts`, the Prisma models. Skills: none
opened; no new UI primitive and no new namespace.

## Files created

| File | What it is |
| --- | --- |
| `components/crm/messaging/composer-state.ts` | Pure `composerState(eligibility)`. Returns keys, never sentences |
| `components/crm/messaging/use-send-message.ts` | The one send path: mutation, optimistic row, 422, invalidation |
| `components/crm/messaging/message-composer.tsx` | Note, textarea, send. Blocked mode has no input |
| `components/crm/record-sheet/contact-messages-tab.tsx` | The record sheet Messages tab |
| `test/composer-state.spec.ts` | 5 tests |

## Files modified

`components/crm/messaging/{thread-view,message-bubble,messaging-ui-config}.*`,
`components/crm/record-sheet/{contact-sheet,record-stack}.*`,
`components/crm/timeline/{timeline-entry,message-thread-entry}.tsx`,
`lib/messaging.ts`, `lib/trpc/cache.ts`, `test/messaging.spec.ts`,
catalogs `messages/{en,vi}/{contacts,common}.json`.

Docs: `docs/messaging.md` (13 rule sections added), `docs/api.md`,
`docs/agent.md`, `docs/connections.md`, `docs/environment.md`,
`docs/telemetry.md`, `AGENTS.md` (one index row).

## Catalog keys

| Namespace | Keys added per locale |
| --- | --- |
| `contacts` | 12, all prefixed `messaging` |
| `common` | 1, `recordSheet.messagesTab` |

`en` and `vi` both ship. 26 entries total. No new namespace, no allowlist entry.
`messagingComposerNote` is one ICU message with `{repliesLeft}` and a
`<closesAt></closesAt>` tag that `t.rich` fills with `LocalDateTime`, so the hour
renders in the rep's locale. `deals.pipelineSummary` is the precedent.

## Decisions

1. **One send path, one hook.** `useSendMessage(threadId)` owns the mutation, the
   optimistic row, the 422 sentence and the invalidation. `ThreadView` calls it
   once and hands it to the composer and to every bubble, so "Try again" and a
   typed reply are the same code with a new `clientRequestId`.
2. **`ThreadView` mounts the composer.** The contact tab renders `ThreadView`
   alone. Two mount sites for one composer is two places to fix a bug in.
3. **`onBack` is optional on `ThreadView`.** The inbox passes it; the contact tab
   does not, so the mobile back button does not appear where it has nowhere to go.
4. **`cache.messagingSent()` runs on the 422 too.** It is one helper. A refusal
   is rare, and the extra `messages` fetch costs less than a second helper that
   drifts from the first.
5. **The optimistic row carries the returned `messageId`.** `mergeOptimistic()`
   in `lib/messaging.ts` drops it the moment a fetched page holds that id.
6. **`useOpenRecord(ref, tab?)` gained one optional argument.** The timeline had
   no way to open a record on a named tab. `write()` passed `tab: null`; it now
   passes the caller's tab. Every existing call is unchanged.
7. **The scroll keeps the reading position.** `onScroll` records whether the
   viewport is within `MESSAGING_UI.nearBottomPx` (80 px). A new last row jumps to
   the bottom only when it was near the bottom, when the rep sent that row, or on
   open. This closes issue 2 of the phase 2/3 review fixes report.
8. **The Messages tab is always on a contact.** The empty state is the point:
   "No Zalo chat yet." The rail's Messages item is ungated too.
9. **`messageStatusKey()` and `hasPendingSend()` are pure and in `lib/messaging.ts`.**
   The bubble renders a key; the poll reads a boolean. Both are tested.
10. **The docs state what the code does, not what the plan said.** The
    `docs/agent.md` Visible row now lists all eight `DIRECT_KINDS`, and the
    Priority line lists all sixteen priorities: both were stale before this phase.

## Commands

| Command | Result |
| --- | --- |
| root `bun run check-types` | pass, 13 of 13 |
| root `bun run lint` | pass, 9 of 9. 2 warnings, both pre-existing |
| `bun run i18n:check` | 0 findings, 344 files, 47 allowlist entries |
| `bun run i18n:catalogs` | in sync. 1 warning, pre-existing, in `settings` |
| `apps/app` `bun test` | 196 pass, 0 fail, 19 files (was 185) |
| `grep className` in new files | layout, page tokens, text colour, `sr-only` only |

No component takes a `className` override. No literal radius, no colour outside
the tokens.

## Issues

1. RISK — The optimistic row list grows by one per send while a thread stays
   open. A settled row is skipped, not removed. Memory grows until the rep opens
   another thread.
   Fix: not done. Needs a prune effect keyed on the fetched ids. I caused this.
2. RISK — One send disables every "Try again" button in the thread. A rep cannot
   retry a second failed row until the first settles.
   Fix: accepted. One send at a time is the intent. I caused this.
3. RISK — `ContactSheet` reads `messaging.threadByContact` on every contact open,
   to decide the header button. Installs with no Zalo pay one query per open.
   Fix: accepted. The tab shares the query key, so the tab costs nothing more.
4. NOT DONE — Nothing is checked in a browser. No dev server runs here. The
   scroll rule, the ICU date in the note and the blocked composer come from the
   source and the type checker only.
5. RISK — The composer reads `messaging.eligibility` with `staleTime: 0`, so every
   window focus refetches it. That is the brief, and it costs one query per focus
   per open thread.
   Fix: accepted. Eligibility decays with the clock. I caused this.
6. UNKNOWN — `docs/messaging.md` states the 5-sentence limit on `sentenceFor()`.
   The parallel reviewer is editing `zalo-errors.ts` now. A new sentence there
   makes that number wrong.

Status: DONE_WITH_CONCERNS
Summary: A rep replies from the inbox and from the contact sheet; the window note,
the blocked sentence, the send states, "Try again" and the Messages tab ship; the
rules for the area are in `docs/messaging.md` and six other docs.
Concerns: Nothing is verified in a browser. The optimistic row list is not pruned.

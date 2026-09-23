# Phase 4 UI and docs — review

Date 2026-09-21. Branch `feat/zalo-oa-chat`. Review only. No file changed except this report.
Read: `AGENTS.md`, `docs/design.md`, `docs/i18n.md`, `docs/connections.md`, `docs/api.md`, phase 4,
the implementer report, the phase 2/3/4 backend reports, the scout anchor report. Code read:
`apps/app` only. `apps/api`, `apps/agent`, `packages/db`, `packages/telemetry` were out of scope,
so backend statements are checked against the plan's reports or marked UNVERIFIED.

## Gates

`apps/app` `bun test`, 196 pass, 0 fail, 19 files. `bun run i18n:check` 0 findings, 344 files.
`bun run i18n:catalogs` in sync, 1 pre-existing warning. `apps/app` `bun run lint` 0 errors,
2 warnings. `apps/app` `bun run check-types` pass.

The report says both lint warnings are pre-existing. One is not: `noImgElement` on
`components/crm/messaging/message-bubble.tsx:139`, which arrived with the messaging UI.

## Acceptance against phase 4 "UI"

PASS, with evidence: blocked mode is one sentence and no input (`message-composer.tsx:61-67`);
the note renders the hour through `LocalDateTime` and `t.rich` (`:78-88`); Enter sends and
Shift+Enter is a newline, with an IME guard (`:100-105`); input and button stay disabled until the
mutation settles (`:97,111`, and `onSuccess` awaits the invalidation); the optimistic row carries
the returned id and `mergeOptimistic` drops it on the next page (`use-send-message.ts:32-34,70-85`,
`lib/messaging.ts:83-92`); FAILED shows `errorMessage` verbatim with "Try again" on the same body
(`message-bubble.tsx:93-107`, `thread-view.tsx:343`); a 422 shows the sentence inline and refetches
eligibility (`use-send-message.ts:37-47`); the header `Message` button appears only with a thread
and opens the tab (`contact-sheet.tsx:208-219`); the timeline opens the tab for a matched thread
and the inbox for an unmatched one (`message-thread-entry.tsx:34-53`); `cache.messagingSent()`
invalidates messages, threads, eligibility and `threadByContact` (`lib/trpc/cache.ts:250-260`).
The tab itself is always present with an empty state, which is what the phase text asks for.

Hooks order is safe: every hook lives in `ThreadConversation`, which mounts after the guards and is
keyed by `thread.id` (`thread-view.tsx:101`). `useOpenRecord(ref, tab?)` is backward compatible:
18 call sites, all pass one argument, and `write()` defaults `tab` to null (`record-stack.ts:65`).
Server/client split holds: every new file is `"use client"` and `@crm/db/messaging` has no imports,
verified in the phase 2/3 UI review. No component takes a visual `className`. i18n parity holds:
44 `messaging*` keys in both `contacts` catalogs, `common.recordSheet.messagesTab` in both,
`<closesAt></closesAt>` matching the `deals.pipelineSummary` precedent, no new namespace, pure
helpers return keys. Scroll (decision 7) is correct: `thread-view.tsx:185-198` jumps on open, near
the bottom, or on the rep's own row; `:200-208` restores position after "Load earlier"; `:215-220`
tracks distance against `MESSAGING_UI.nearBottomPx`.

## Findings

### 1. BLOCKING — `AGENTS.md` carries 258 lines of tool output, including a self-import

`AGENTS.md` grew 301 → 560 lines. Lines 303-560 are a dump of the ClaudeKit rule files. Line 320 is
`@AGENTS.md`, the file importing itself. Several lines read ``Use `` only when…`` with an empty
command name.
Failure: every agent that reads the repo contract reads a duplicated, self-referencing rulebook.
The phase needed one line, the `docs/messaging.md` index row at line 17.
Fix: keep line 17, delete lines 303-560. `git diff AGENTS.md` must then show one added row.

### 2. HIGH — A fresh `clientRequestId` per call makes the server's idempotency guard unreachable

`use-send-message.ts:56` mints a uuid inside `send()`. `@@unique([threadId, clientRequestId])` and
the API test for "the same id twice is one row" therefore never fire: no path repeats an id.
Failure: two submits that both run before React re-renders `sender.pending` queue two rows and put
the text on the customer's phone twice. Zalo has no idempotency key, so nothing downstream catches
it. The window is small, because discrete events flush between keydowns, but the guard built for
exactly this case is dead.
Fix: hold the id for the attempt in a ref and rotate it in `onSettled`. "Try again" still gets a
new id, because the failed attempt settled first.

### 3. MEDIUM — Every contact open costs a Zalo query on installs with no OA

`contact-sheet.tsx:103-105` runs `messaging.threadByContact` with no gate, and
`contact-messages-tab.tsx:21-24` polls the same key every 10 s while the tab is open. The poll
continues on error, because `refetchInterval` keeps running for a failed query.
Failure: an install that never connects Zalo pays one query per contact open and a 10 s poll for a
thread that cannot exist.
Fix: `contact-messages-tab.tsx:16-19` already reads `zalo.status` with a 10 min `staleTime`. Pass
`enabled: zalo.data?.configured === true` to both `threadByContact` queries, and drop the tab's
`refetchInterval` when no OA is connected.

### 4. MEDIUM — Decision 9 claims two helpers are tested. Neither is

`messageStatusKey()` (`lib/messaging.ts:139`) and `hasPendingSend()` (`:143`) have no test; grep
over `apps/app/test` returns nothing for either. `hasPendingSend` drives the 2 s poll, so a wrong
status string there stalls a QUEUED bubble silently.
Fix: one case per helper in `test/messaging.spec.ts` — `hasPendingSend([])` false, a `SENDING` row
true, a `SENT` row false; `messageStatusKey("FAILED")` is `""`.

### 5. MEDIUM — `composer-state.spec.ts` holds a vacuous assertion and three duplicate cases

`test/composer-state.spec.ts:35` asserts `state.noteKey` has no space. `noteKey` is a literal type
fixed at `composer-state.ts:5`; the assertion cannot fail. Cases at `:8`, `:25` and `:38` all
exercise the free-text branch. Two branches take five tests, and nothing pins the part that breaks.
Failure: an edit that drops `<closesAt></closesAt>` or `{repliesLeft}` leaves the rep a window note
that names no hour, and every gate stays green.
Fix: delete `:35`, merge `:25` and `:38` into `:8`, add a case that reads both catalogs and asserts
each `messagingComposerNote` holds `<closesAt>` and `{repliesLeft}`.

### 6. LOW — The optimistic row list is never pruned (implementer issue 1, confirmed)

`use-send-message.ts:34` appends and nothing removes. `mergeOptimistic` (`lib/messaging.ts:91`)
skips the settled row but the state keeps it. Severity is low, not risk: `ThreadConversation` is
keyed by `thread.id` (`thread-view.tsx:101`), so the list dies on every thread switch and each
entry is one small object. The cost is a growing filter inside one open thread.
Fix, smallest form: add `prune(known: Set<string>)` to the hook, which calls `setOptimistic` with
`rows.filter((row) => !known.has(row.id))` only when `rows.some((row) => known.has(row.id))` — the
guard keeps the state identity stable. Call it from an effect on the fetched rows in
`ThreadConversation`.

### 7. LOW — Four smaller ones

- The message poll never stops, it falls back to 10 s (`thread-view.tsx:138-144`), where the phase
  text says "Stops when none is". `docs/messaging.md:151-160` documents the 10 s floor and an open
  chat needs an inbound poll, so code and doc agree and the plan text is the outlier. No fix.
- `message-bubble.tsx:93` gates `errorMessage` on `outbound`, not on `FAILED`, so a row holding an
  error sentence shows it beside a `SENT` label. Fix: gate on `failed`, computed at `:62`.
- `thread-view.tsx:211` sets `earlierHeight` on click and `:200-208` clears it only when
  `firstMessageId` changes. A page with no new first row leaves it set, and the next "Load earlier"
  corrects by a stale height. Fix: clear it in the `fetchNextPage()` promise.
- `contact-messages-tab.tsx:34-44` treats a query error as "no thread" and retries every 10 s.
  Fix: render `query.error.message` when `query.isError`.

## Docs corrections

1. `AGENTS.md` lines 303-560 — delete. Finding 1.
2. `docs/api.md:31` — "About to add an **outside API client** to `apps/api`?" → "About to add a
   **vendor client** to `apps/api`?". `AGENTS.md` and the rest of the page say "vendor client".
3. `docs/agent.md:61` — "A reply a rep typed goes first, because a customer is waiting for it." →
   "A reply a rep typed shares the top with `slackJoin` at 950, because a customer is waiting for
   it." `slackJoin` held 950 before this phase (scout report, line 19), so `messageSend` ties.
4. `docs/agent.md:29` — the edit dropped `prisma/seed.ts` from the `mirror()` writer list. That file
   exists at `packages/db/prisma/seed.ts` and the edit is unrelated to phase 4. Restore it, or say
   in the commit why the seed no longer mirrors.
5. `docs/messaging.md:73` — "one of five sentences" is UNVERIFIED. `zalo-errors.ts` was out of scope
   and a parallel agent was editing it. Count `sentenceFor()` before landing.
6. `docs/telemetry.md:246,255` — the fourth stage `profile` is UNVERIFIED. The phase 4 backend
   report states `messaging_error` carries `error_class` and `stage` only and names no stages; the
   plan named three. Check `permittedStage()`.

Verified correct: the `AGENTS.md` index row; `docs/environment.md` — three variables and both URLs
match `.env.example:72-83`; `docs/api.md` "Deleting a record" — `SetNull` on both `contactId`
columns (phase 2 backend review report, line 167) and `deleteThread` cascading from the identity
(phase 3 review report, line 156); `docs/api.md` "two exceptions" — `oa/getoa` is a verified fact;
`docs/agent.md` Visible row — the five pre-phase `DIRECT_KINDS` (scout report, line 18) plus the
three message kinds; `PRIORITY.messageProfile` 930 and `MESSAGING_WINDOW_HOURS` (phase 4 backend
report, line 23 and decision 9); the six telemetry properties; the `docs/connections.md` Zalo
section against the phase 2 and 3 reports; `docs/messaging.md` polling against
`messaging-ui-config.ts`.
## Verdict

**APPROVE_WITH_FIXES.** Must fix before landing: findings 1, 2, 3, 4, 5 and docs corrections
2, 3, 5, 6. Findings 6 and 7 are follow-ups. Nothing found can send a message outside the window:
the composer, the API and the agent are three gates on one pure function.
## Issues

1. BROKEN — `AGENTS.md` holds 258 lines of tool output and imports itself. Agents read a duplicated
   contract.
   Fix: delete lines 303-560. Keep the index row at line 17.
2. RISK — A fresh `clientRequestId` per call makes the server's unique index unreachable. Two fast
   submits put the text on the phone twice.
   Fix: hold the id in a ref, rotate it after the mutation settles.
3. RISK — Every contact open queries Zalo on installs with no OA, and the tab polls it every 10 s.
   Fix: gate both queries on `zalo.status.configured`.
4. NOT DONE — `messageStatusKey()` and `hasPendingSend()` have no test. The report says they do.
   Fix: one case per helper in `test/messaging.spec.ts`.
5. NOT DONE — No test pins `<closesAt>` or `{repliesLeft}` in the catalogs. A dropped tag removes
   the hour from the window note silently.
   Fix: assert both placeholders in `en` and `vi`.
6. RISK — The optimistic row list is never pruned. The filter grows inside one open thread.
   Fix: prune on the fetched ids.
7. RISK — `message-bubble.tsx:93` shows `errorMessage` under any outbound status, not only FAILED.
   Fix: gate on the `failed` boolean at line 62.
8. UNKNOWN — The "five sentences" claim and the `profile` telemetry stage are not verified.
   `apps/agent` and `packages/telemetry` were out of scope.
   Fix: count `sentenceFor()` and read `permittedStage()`.
9. UNKNOWN — Nothing is checked in a browser. The implementer states the same.

Status: DONE_WITH_CONCERNS
Summary: The phase 4 UI meets its acceptance criteria and every gate is green; a 258-line dump in
`AGENTS.md`, a dead idempotency guard and two false test claims must be fixed before landing.
Concerns: `AGENTS.md` is polluted. The `clientRequestId` scheme cannot dedupe. Two doc statements
stay unverified because the source was out of scope.

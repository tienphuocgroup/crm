---
phase: 3
title: "Inbox filter sort and badge"
status: pending
priority: P2
dependencies: [2]
effort: "1 day"
---

# Phase 3: Inbox filter sort and badge

## Overview

Show the verdict where a rep works. The `/messages` inbox gains an intent filter,
an urgency sort and a badge on the thread row. A thread with a null verdict shows
nothing and sorts last. The record sheet's message panel shows the same badge on the
thread header where it already loads the thread.

## Context

- Spec: brainstorm report §6.2 "Consume".
- Contracts: `apps/api/src/messaging/messaging.contracts.ts` (`MESSAGING_FILTERS`, `messagingThreadsInput`). Consumers: `messaging.router.ts:30-33`, `messages-inbox.tsx:36-37`.
- Service: `apps/api/src/messaging/messaging.service.ts` `filterClause()`, `serializeThread()` (3 callers at `:197,212,223`), the threads query `orderBy` at `:182-187` with its `{ id: "desc" }` cursor tiebreaker.
- Null ordering precedent: `contacts.service.ts:110` and `deals.service.ts:93` use `{ sort: "desc", nulls: "last" }`. Postgres puts nulls first on a plain `desc`.
- URL state: `apps/app/app/(app)/[slug]/messages/messages-search-params.ts` holds an independent copy of `MESSAGING_FILTERS` (`:3`).
- Inbox: `apps/app/app/(app)/[slug]/messages/messages-inbox.tsx` reads the filter with `useQueryState` (`:26`) and loads threads client-side with `useInfiniteQuery` (`:35-37`). `page.tsx:28-42` fetches only `zalo.status`; there is no RSC prefetch of threads.
- Thread rows: `apps/app/components/crm/messaging/thread-list.tsx`.
- UI source of truth: `packages/ui` (`Badge`, `Tabs`, `Select`), `docs/design.md`.
- i18n: `docs/i18n.md`; `bun run i18n:catalogs`, `bun run i18n:check`.
- App tests: `apps/app/test/` holds spec files such as `tracking-bundle.spec.ts`; there is no inbox component spec today.
- nuqs skill: `.agents/skills/nuqs/SKILL.md`. shadcn skill: `.agents/skills/shadcn/SKILL.md`.

## Requirements

- Functional: filter param `intent` with values `all | booking | question | complaint | pricing | spam | other`; sort param `sort` with `latest | urgency`; badge shows the intent label, and a second badge shows the urgency label at level 2 or 3. `needsReply` and `unmatched` keep working and combine with `intent`.
- Non-functional: server-side filtering and sorting through tRPC, loaded client-side as today. No client-side derivation. No new component styles outside `packages/ui`. Every string in `en` and `vi`. Cursor pagination stays stable under the urgency sort.

## Architecture

```
URL ?filter=needsReply&intent=booking&sort=urgency
  -> nuqs parsers (messages-search-params.ts)
  -> trpc messaging.threads({ filter, intent, sort, cursor })
  -> where: AND [filterClause(filter), intentClause(intent)]
  -> orderBy sort === "urgency"
       ? [{ lastUrgency: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }, { id: "desc" }]
       : [{ lastMessageAt: "desc" }, { id: "desc" }]
  -> serializeThread adds { lastIntent, lastUrgency }
  -> ThreadList renders Badge from finished data
```

The intent enum is the Prisma `MessageIntent`. The client file owns its own
`ThreadIntent` union type and does not import `@crm/db`. The API hands lowercase
strings or null. Threshold logic never runs in the browser: a thread with
`lastIntent: null` shows no badge, and null is what phase 2 writes whenever the
newest inbound message has no verdict.

## Related Code Files

- Modify: `apps/api/src/messaging/messaging.contracts.ts` (`MESSAGING_INTENTS`, `MESSAGING_SORTS`, extend `messagingThreadsInput`)
- Modify: `apps/api/src/messaging/messaging.service.ts` (`intentClause`, `orderBy`, `serializeThread`, `ThreadRow` select)
- Modify: `apps/api/src/messaging/messaging.router.ts` (pass-through of the new inputs)
- Modify: `apps/api/src/generated/server.ts` through the generator command in `apps/api/package.json`; never by hand
- Modify: `apps/app/app/(app)/[slug]/messages/messages-search-params.ts` (`MESSAGING_INTENTS`, `MESSAGING_SORTS` copies, `intent` and `sort` parsers)
- Modify: `apps/app/app/(app)/[slug]/messages/messages-inbox.tsx` (read both params with `useQueryState`, pass to the query and the list)
- Modify: `apps/app/components/crm/messaging/thread-list.tsx` (intent chips, sort control, row badges)
- Modify: `packages/ui/src/components/badge.tsx` only if an existing variant does not fit
- Modify: i18n catalogs `en` and `vi` for six intent labels, two sort labels, one filter label, two urgency labels
- Modify: `apps/api/test/messaging*.spec.ts` (filter, sort, null ordering, cursor boundary)
- Create: `apps/app/test/messages-search-params.spec.ts` (parser round-trip)

## Implementation Steps

1. Read `docs/design.md`, `docs/i18n.md`, `.agents/skills/nuqs/SKILL.md`, `.agents/skills/shadcn/SKILL.md`, and `thread-list.tsx` end to end.
2. Contracts. Add `MESSAGING_INTENTS = ["all", "booking", "question", "complaint", "pricing", "spam", "other"]` and `MESSAGING_SORTS = ["latest", "urgency"]`. Extend `messagingThreadsInput` with `intent` default `all` and `sort` default `latest`.
3. Service. `intentClause(intent)` maps `all` to `{}` and a value to `{ lastIntent: value.toUpperCase() }`. Compose with `filterClause` in one `AND`. Switch `orderBy` on `sort` exactly as in Architecture, keeping `{ id: "desc" }` last in both branches. Add `lastIntent` and `lastUrgency` to the thread select and to `serializeThread` as lowercase string or null and number or null. Keep the counts query unchanged.
4. Router. Pass the new fields through. Regenerate `apps/api/src/generated/server.ts` with the repo's generator command.
5. URL state. Add `messagesIntentParser = parseAsStringLiteral(MESSAGING_INTENTS).withDefault("all")` and `messagesSortParser = parseAsStringLiteral(MESSAGING_SORTS).withDefault("latest")`. Mirror the arrays the way `MESSAGING_FILTERS` is mirrored today.
6. Inbox. Read `intent` and `sort` with `useQueryState` beside the existing `filter`, pass them into the `useInfiniteQuery` input and into `ThreadList`. No change to `page.tsx`.
7. Thread list. Intent chips next to the existing filter control, using the same component the existing filter uses. A sort toggle using `packages/ui` `Select` or an existing segmented control. On each row, a `Badge` with the intent label when `lastIntent` is not null, and a second `Badge` variant `destructive` with the urgency label when `lastUrgency >= 2`. No className overrides.
8. i18n. Add the strings to `en`, then `vi` in the same change. Run `bun run i18n:catalogs` and `bun run i18n:check`.
9. Record sheet. Where the contact sheet shows the Zalo thread header, render the same intent badge from the thread it already loads. Skip if the sheet does not load thread metadata; note it in the report.
10. Tests. API: `intent=booking` returns only threads with `lastIntent = BOOKING`; `sort=urgency` orders level 3 before level 0 and every null-urgency thread after level 0; equal-urgency threads tie by `lastMessageAt` then `id` and a cursor across the tie neither repeats nor skips a row; `filter=needsReply&intent=spam` intersects. App: `messages-search-params.spec.ts` round-trips `intent` and `sort` through the parsers and falls back to the defaults on garbage.
11. Run `bun run check-types`, `bun run lint`, `bun run i18n:check`, `bun run --filter=api test`, `bun run --filter=app test`. Ask Luan to start the dev servers and check `/messages` in both locales with a null-verdict thread, a level-3 thread and a page boundary.

## Success Criteria

- [ ] `/messages?intent=booking` lists booking threads only, combined with the existing filter.
- [ ] `/messages?sort=urgency` puts level 3 first and null last, and paging across ties is stable.
- [ ] A thread with a null verdict shows no badge.
- [ ] Every new string passes `i18n:check` with `en` and `vi` values.
- [ ] No new styles outside `packages/ui`; no `className` overrides on shared components.
- [ ] The client component imports nothing from `@crm/db` or `@crm/auth`.
- [ ] API and app suites pass. Luan has verified the page in the browser.

## Risk Assessment

- **Badge noise.** Every thread shows a chip and reps stop reading them. Mitigation: null below threshold; urgency badge only at level 2 or 3.
- **Urgency sort is climbable by any Zalo user.** A stranger can write an urgent-sounding message and reach the top. Mitigation: the injection guard and the daily cap from phase 2. Whether urgency also needs a known-contact gate is an open product question in `plan.md`.
- **Filter explosion.** Three filters plus intent plus sort in the URL. Mitigation: nuqs defaults keep the URL clean; counts stay on the two existing filters only.
- **Vietnamese labels.** Six intents need clinic-appropriate `vi` wording. Mitigation: Luan reviews the `vi` catalog entries before merge.

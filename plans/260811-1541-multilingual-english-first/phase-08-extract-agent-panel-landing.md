---
phase: 8
title: "Extract: Agent Panel + Landing"
status: complete
priority: P2
dependencies: [4, 5]
---

# Phase 8: Extract: Agent Panel + Landing

## Overview

Last extraction batch, and the one with the most traps. Three areas:

1. Agent panel copy — `apps/app/lib/agent-record.ts` (74 lines, a `COPY` record
   mixing display prose with **live wire protocol values**).
2. Agent builder — `apps/app/components/agent-builder/**` (15 files, 30 toasts) and
   `(agent-builder)` routes (5 files).
3. `(landing)` — 10 files: marketing index, sign-in, onboarding, grant-access.

Also the home of the pure display-string helpers in `apps/app/lib/`, which are the
biggest under-scoped item in the whole plan.

Namespaces: `agent-panel`, `landing`, `common`.

## Requirements

- Every string in the owned files resolves through `t()` or is allowlisted.
- Wire values must not be translated. Translating one breaks the agent bridge.
- Tests asserting English prose are updated to assert **keys**, not re-asserted
  against the catalog.
- Agent LLM output stays untouched — out of scope.
- Ratchet entries removed in the same commit.

## Architecture

**`agent-record.ts` — split the record.** `COPY` at lines 16-56 holds, per entity:

| Field | Kind |
| --- | --- |
| `header` | **wire value** — `x-crm-contact`, `x-crm-company`, `x-crm-deal` |
| `field` | **wire value** — `contactId`, `companyId`, `dealId` |
| `title`, `blurb`, `placeholder`, `suggestions[]` | display copy |

`header` values are read at `apps/app/app/eve/v1/[...path]/route.ts:46-48` and
deleted from the forwarded headers at `:53-55`. They are protocol, not prose.
`field` values are query-shape keys. Split `COPY` into a protocol record that stays
in TypeScript and a display record that moves to `messages/en/agent-panel.json`,
keyed by entity kind. `recordCopy()` at line 58 becomes a function over the
protocol record plus a `t` lookup at the call site, or is dropped in favour of the
call site reading both directly.

Read `docs/agent-panel.md` before starting — it is the owning doc for this surface.

**Pure display-string helpers.** Not components, so no hook is available. Per the
phase 4 convention they return **keys**, translated at the render site.

| File | Scope |
| --- | --- |
| `apps/app/lib/agent-transcript.ts` | 38 capitalised literals — largest single offender |
| `apps/app/lib/chat-date-group.ts` | return type is the English union at line 3 |
| `apps/app/lib/agent-tool-display.ts` | verb pairs at lines 26, 31 (`Saving draft`/`Saved draft`) |
| `apps/app/lib/activity-presentation.ts` | 7 literals |
| `apps/app/lib/deal-stage.ts` | 7 literals |
| `apps/app/lib/enrichment-status.ts` | 6 literals |

`chat-date-group.ts` is the clean case: change
`"Today" | "Yesterday" | "Last 7 days"` to `"today" | "yesterday" | "last7Days"`
and translate where it renders.

`agent-transcript.ts` is the open one. Several of its 38 literals are assembled at
runtime (pending/completed verb pairs, tool-name humanisation). Whether every case
reduces to an ICU message is only knowable while doing it — `plan.md` unresolved
question 4. If a case genuinely resists, leave it ratcheted and raise it rather than
inventing a sixth pattern.

`agent-tool-display.ts` humanises arbitrary tool names into sentences — see
`apps/app/test/agent-tool-display.spec.ts:35` (`Wrote agent/other.md`) and `:51`
(`Ran a tool`). Known tools map to keys; the unknown-tool fallback (which
title-cases a raw identifier, `agent-transcript.spec.ts:355`
`some_new_tool` → `Some new tool`) cannot be translated and should be allowlisted
as a technical fallback.

**Tests that must change.** These assert English from pure functions and will fail
by design:

| Test | Assertion |
| --- | --- |
| `apps/app/test/chat-date-group.spec.ts:8-10` | `"Today"`, `"Yesterday"`, `"Last 7 days"` |
| `apps/app/test/agent-tool-display.spec.ts:15,25,35,45,51` | five English sentences |
| `apps/app/test/agent-session.spec.ts:111-113,119` | `recordCopy(...).title`, `.suggestions[0]` |
| `apps/app/test/agent-transcript.spec.ts:355,563,573,600` | `"Some new tool"`, weekday titles |

Update them to assert keys. **Do not** import the catalog and assert the English
value back — that recreates the coupling the refactor removes and makes every future
copy edit a test failure. `agent-transcript.spec.ts:563` asserting `"Thursday"` is
different: that is a *formatted date*, and it should assert against an explicit
`en-US` locale so the test is locale-pinned rather than ambient.

`apps/app/test/workspace-label.spec.ts:17-22` asserts `"Acme CRM"` — a brand suffix
from `apps/app/lib/workspace-label.ts`. Allowlist; leave the test alone.

**`(landing)`.** 10 files, only 6 toasts, but the highest visibility. If phase 1's
spike left these prerendered, extracting strings here must not make them dynamic —
verify the build output before and after. Five metadata exports live here
(`(landing)/page.tsx:11`, `sign-in/page.tsx:11`, `onboarding/page.tsx:7`,
`onboarding/research/page.tsx:6`, `grant-access/page.tsx:8`).

Provider names — Google, Microsoft, SSO — are allowlisted, not translated.

## Related Code Files

- Modify: `apps/app/lib/agent-record.ts` — split protocol from copy
- Modify: `apps/app/lib/{agent-transcript,chat-date-group,agent-tool-display,activity-presentation,deal-stage,enrichment-status}.ts`
- Modify: `apps/app/components/agent-builder/**` — 15 files
- Modify: `apps/app/app/(app)/[slug]/(agent-builder)/**` — 5 files, 4 metadata exports
- Modify: `apps/app/app/(landing)/**` — 10 files, 5 metadata exports
- Modify: `apps/app/components/crm/record-sheet/` — Agent tab only, the part phase 7 skipped
- Modify: `apps/app/test/{chat-date-group,agent-tool-display,agent-session,agent-transcript}.spec.ts`
- Modify: `apps/app/messages/en/{agent-panel,landing,common}.json`
- Modify: `apps/app/scripts/i18n/allowlist.json` — unknown-tool fallback, provider names
- Modify: `apps/app/scripts/i18n/ratchet.json`

## Implementation Steps

1. Read `docs/agent-panel.md` and `docs/agent.md`. The agent boundary rule —
   intelligence in `apps/agent`, never elsewhere — bounds what may move.
2. Invoke the `i18n-extract` skill. Record the `i18n:check` baseline.
3. **`agent-record.ts` first, and carefully.** Split protocol from copy. Before
   committing, grep `x-crm-contact`, `x-crm-company`, `x-crm-deal` across
   `apps/app`, `apps/api` and `apps/agent` and confirm every consumer still sees the
   same literal. `apps/app/app/eve/v1/[...path]/route.ts:46-48` and `:53-55` are the
   consumers found today.
4. Update `apps/app/test/agent-session.spec.ts:111-119` to assert keys.
5. Pure helpers, easiest first: `chat-date-group.ts`, then `deal-stage.ts`,
   `enrichment-status.ts`, `activity-presentation.ts`, `agent-tool-display.ts`, and
   `agent-transcript.ts` last. Each is a return-type change plus call-site
   translation plus a test update. `check-types` after each — the compiler enumerates
   the call sites for free.
6. `agent-transcript.ts`: work through all 38. Anything that resists after a genuine
   attempt stays ratcheted and gets raised, not bodged.
7. Agent builder components and routes. 30 toasts; literal ones convert.
8. The record sheet Agent tab that phase 7 skipped.
9. `(landing)`: 10 files, 5 metadata exports. Sign-in provider buttons keep provider
   names; the surrounding copy is extracted.
10. `bun run build` and compare which `(landing)` routes are prerendered against the
    phase 1 spike record. A route that became dynamic is a regression — report it.
11. Add allowlist entries: unknown-tool title-case fallback, provider names,
    `workspace-label` brand suffix.
12. Remove the batch's ratchet entries.
13. `bun run i18n:check && bun run check-types && bun run lint && bun run test`.
14. Pseudo-locale walkthrough: sign-in, onboarding both steps, grant-access, agents
    list, agent detail, chat, and the record sheet Agent tab for all three entities.
15. Commit.

## Implementation notes

- Run in two sequential passes: the protocol split + six pure helpers + tests
  first, then agent-builder/landing/Agent-tab extraction.
- `agent-record.ts` final shape: a `PROTOCOL` record keeps `header`/`field`
  wire values byte-identical; `recordCopy()` became `recordCopyKeys()`
  returning catalog keys; 18 `record*` keys in `agent-panel`. The x-crm grep
  matches at every consumer (`eve/v1/[...path]/route.ts:46-48,53-55`, the
  producer, and the spec that asserts them); `x-crm-builder-conversation`
  untouched; nothing in `apps/api`/`apps/agent` references these.
- **Unresolved question 4 is resolved: all 38 `agent-transcript` literals
  reduced cleanly.** The two runtime assemblies became
  `stepWithReason: "{step} — {reason}"` (model prose passed as an ICU
  argument, inserted verbatim) and per-(tense × artifact) keys plus
  `{name}`/`{title}` parameterised pairs. Nothing stayed ratcheted for ICU
  resistance; the unknown-tool `humanise()` fallback stays as code surfaced
  via `StepLabel.fallback`.
- **Spec correction:** `agent-transcript.spec.ts:563/573/600` assert
  conversation-title *fixture data* (`title: "Thursday"`) in a
  lookup-by-id test — `resolveThread` formats no dates. There is no ambient
  locale to pin; the lines are unchanged and the corresponding success
  criterion is struck through below as a plan misread.
- Chat date groups went to `common` (`chatDateGroup*`) — the checked-in
  key-naming reference documents that exact file as its worked example.
- 9/9 metadata conversions (4 agent-builder + 5 landing). Sign-in's Suspense
  fallback became an async `SignInFallback` so `getTranslations` never sits
  above a boundary; all landing routes kept ◐ (and `/t/crm.js` ○).
- Toasts: ~21 literal conversions, 17 passthroughs kept. Keys: agent-panel
  +333 total, landing +133, deals +8, common +18 across the two passes.
- One allowlist entry added: `agent-section.tsx::"Dan"` (example teammate
  name in the marketing mockup).
- Ratchet after this phase: 6 shared shell components
  (`agent-clarification-composer`, `app-header`, `app-icon-rail`,
  `auth-shell`, `detail-sheet`, `page-shell`) that no phase's owned-file list
  covered — deliberately left for phase 9's sweep, which owns "any file the
  final sweep catches".

## Success Criteria

- [x] `i18n:check` clean for all owned paths; ratchet entries removed; six unowned shell components explicitly raised for phase 9.
- [x] `x-crm-contact`, `x-crm-company`, `x-crm-deal` are byte-identical at every consumer; the eve bridge route still resolves record context.
- [x] `field` values (`contactId`/`companyId`/`dealId`) unchanged.
- [x] All six pure helpers return keys, not prose; no `t` threaded into a pure function.
- [x] The four listed test files assert keys, not English; none imports the message catalog to re-assert English.
- [x] ~~`agent-transcript.spec.ts:563` pins an explicit locale~~ — plan misread: those lines assert fixture conversation titles, not formatted dates; no locale to pin (see notes).
- [x] `workspace-label.spec.ts` unchanged and passing.
- [x] Nine metadata exports (4 agent-builder + 5 landing) converted to `generateMetadata`.
- [x] `(landing)` prerender status matches the phase 1 spike record — no route newly dynamic.
- [x] Agent LLM output untouched; nothing under `apps/agent` in the diff.
- [x] Pseudo-locale walkthrough of all listed screens shows no unaccented text outside the allowlist.
- [x] `check-types`, `lint`, `test` green. Zero code comments.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| A wire header gets translated → agent bridge silently loses record context | Med × **Critical** | Step 3 does the split first and greps all three consumers. Explicit success criterion. Silent failure mode — nothing throws, the agent just stops seeing the record. |
| Tests "fixed" by asserting English from the catalog | High × Med | Called out in phase 4 and again here; explicit success criterion that no test imports the catalog. |
| `agent-transcript.ts` runtime sentence assembly resists ICU | Med × Med | Done last, after five easier helpers set the pattern. Escape hatch: stay ratcheted and raise. |
| `(landing)` loses prerendering | Med × Med | Step 10 diffs build output against the phase 1 record. |
| Unknown-tool fallback flagged forever by the checker | High × Low | Allowlisted as a technical fallback with a reason. |
| Return-type changes ripple into unseen call sites | Med × Low | `check-types` after each helper; the compiler is the enumerator. |
| Scope creep into `apps/agent` | Low × Med | Out of scope in `plan.md`; success criterion asserts an empty `apps/agent` diff. |

**Rollback.** Revert the commit. The `agent-record.ts` split is the only part with
runtime blast radius beyond text; if a bridge problem is suspected after merge,
revert that file alone — it has no dependency on the rest of the batch.

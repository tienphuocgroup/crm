---
phase: 3
title: "Client-first journeys"
status: done
priority: P1
dependencies: []
effort: "4d"
---

# Phase 3: Client-first journeys

## Overview

Make `Deal.companyId` optional so a journey can exist for a person with no
organization, and add the create-from-client path. This is the one schema-shape
change of the reshape (brainstorm §7).

## Requirements

- Functional: create a journey with no organization from the deals page; create
  one from a client record with that client attached atomically. Existing
  company-scoped behavior unchanged when an organization IS set. Deleting an
  organization leaves its journeys AND their history intact.
- Non-functional: every render of `deal.company` is null-safe; no `!` casts.

## Architecture

### Schema

`companyId String?`, relation optional, **`onDelete: Cascade` becomes `SetNull`**
on `Deal.companyId`.

Decision, documented not punted: journeys are client-first now. Deleting an
organization must not delete a client's journey history — the journey survives
with `companyId = null`, exactly like contacts already survive company deletion
("its people survive with no company", docs/api.md).

**History survives with the journey** <!-- red-team: F1 -->. The journey row
surviving is not enough: `Activity.company` and `AgentConversation.company` are
both `onDelete: Cascade` (`schema.prisma:1088-1089, 513-514`), and every deal
activity is stamped with the deal's `companyId` at write time
(`deals.service.ts:427-437`, `activities.service.ts:126,137,220-227`). Without a
fix, org delete cascade-wipes the surviving journey's whole timeline and its
agent conversations, and `lastActivityAt` recomputes to null over the wiped
table. Chosen fix — pre-delete re-anchor, NOT an FK change: inside the
`companies.delete` transaction (`companies.service.ts:404-427`), before the
delete, null out `companyId` on `activity` and `agentConversation` rows that
carry another anchor (`dealId` or `contactId` not null). Company-only rows
(notes on the org itself) keep cascading — that cleanup is correct today and
stays. Ordering: collect the `targetsOf` recompute set FIRST, then re-anchor,
then delete (the doc's collect-inside-the-transaction rule already requires the
collect to precede the destructive statements).

### Service invariants (docs/api.md "People on a deal")

- `attachContact`: rule is "a contact on a deal works at that deal's company".
  New rule: when `deal.companyId` is null, any contact may attach. When set,
  unchanged (`deals.service.ts:523-527`).
- `deals.contactOptions` (`deals.service.ts:491-509`): company-scoped picker.
  **This site compiles unchanged after the schema change** — `where:
  { companyId: null }` silently filters org-less contacts instead of offering
  all contacts. Explicit code change, not compiler-driven: null-company journey
  → offer all contacts (same pagination as the global contacts list).
- Company delete recompute: covered by the re-anchor design above.

### Create-from-client — the real design <!-- red-team: F3 -->

Red-team verified the previously cited patterns do not exist: the company sheet
does NOT open `CreateDealSheet` — it renders an inline `QuickAddDeal` form
(`company-sheet.tsx:181-182`) that calls `trpc.deals.create` directly
(`quick-add.tsx:274`) with a REQUIRED `companyId` prop; and `CreateDealSheet`'s
`companyId` prop has zero callers (sole usage `<CreateDealSheet />`,
`deals/page.tsx:39`).

Design:
- Contract: `dealCreateInput` gains `contactId: z.string().min(1).optional()`.
- Service: `create()` attaches the contact INSIDE the same transaction
  (`DealContact` upsert next to the deal insert, within the existing
  `withCrmEvents` flow) — no create-then-attach client chaining, so a failed
  attach cannot orphan a journey without its client. When `companyId` AND
  `contactId` are both given, the company-match guard applies at create time
  (mismatch → the same 400 the attach mutation throws).
- UI: `quick-add.tsx` deal form's required `companyId: string` prop becomes an
  anchor union `{ companyId?: string; contactId?: string }`; it submits
  whichever anchor it was given. The contact (client) sheet reuses exactly this
  `QuickAddDeal` with `contactId` — no new component, no parallel form.
- `AttachDealContact`'s `companyName` placeholder needs a null-company variant
  (`quick-add.tsx:160-165,203`).

### Contracts

- `dealCreateInput.companyId`: `z.string().min(1)` → `z.string().min(1).optional()`
  (drop the "A deal belongs to a company." message path).
- `dealCreateInput.contactId`: new, `z.string().min(1).optional()` (above).
- `dealUpdateInput.companyId`: already `optional()`; add `.nullable()` so an
  organization can be detached (null = detach, absent = unchanged — the
  `blankToNull` convention).
- Regenerate and commit `apps/api/src/generated/server.ts`
  (`bun run --filter=api trpc:generate`).

### Compiler-invisible worklist <!-- red-team: F7 -->

Phase 2 lists its untyped sites; these are Phase 3's. tsc will NOT find them:

1. `deals.service.ts:390-392` — `setStage` reads the deal via `$queryRaw` with
   a hand-written `{ companyId: string }` cast. After the schema change the
   cast silently lies; null flows into the activity stamp, event payloads and
   `stamp.touch` (`:433,443,451,463,479`) typed as string. Fix the cast to
   `string | null` and handle the null at each fan-out.
2. Scalar `companyId` in Prisma `where` clauses keeps compiling with flipped
   meaning — `contactOptions` (above) is the known case; `grep -n companyId
   apps/api/src/deals/deals.service.ts` is the checklist, not tsc.
3. `apps/agent` — the agent's deal context is company-anchored
   (`accounts.ts:88-146, 380-389` reads `deal.company.id`; the builder is keyed
   on companyId). The agent runs its own `tsc --noEmit`, so the break WILL
   surface mid-phase; the decided behavior, so nobody improvises: for an
   org-less journey the deal context skips the company block and anchors on the
   attached contacts; the Agent tab keeps working. Covered by an agent test.

## Related Code Files

- Modify: `packages/db/prisma/schema.prisma:906-945` — Deal model
- Create: `packages/db/prisma/migrations/<ts>_deal_company_optional/migration.sql`
  — `DROP NOT NULL` + Deal FK `ON DELETE SET NULL` (Activity/AgentConversation
  FKs unchanged — re-anchor happens in the delete transaction)
- Modify: `apps/api/src/deals/deals.contracts.ts:41-56` — companyId optional,
  contactId new, update nullable
- Modify: `apps/api/src/deals/deals.service.ts` — create path (+ transactional
  attach), attachContact invariant, contactOptions, `$queryRaw` cast, scalar
  companyId sweep
- Modify: `apps/api/src/companies/companies.service.ts:404-427` — pre-delete
  re-anchor of activity + agentConversation rows with another anchor
- Modify: `apps/api/src/dashboard/dashboard.service.ts` — `biggestOpen[]` and
  `recentActivity[]` include `company` non-optionally today
  (`:122,147,163,260,282`); types go nullable, renders get fallbacks
- Modify: `apps/app/components/crm/record-sheet/quick-add.tsx` — anchor union
  prop, submit path, AttachDealContact placeholder null variant
- Modify: contact (client) record sheet — mount `QuickAddDeal` with `contactId`
  (mirror of `company-sheet.tsx:181-182`)
- Modify: `apps/app/app/(app)/[slug]/deals/create-deal-sheet.tsx` — company
  Select gains a "No organization" option; submit gate (line 113) drops
  `company !== UNSET`
- Modify: `apps/app/app/(app)/[slug]/deals/deals-table.tsx` — company column
  null render ("—"). There is NO company facet today (facets are owner, stage,
  closing — `deals-table.tsx:153-176`, `deals.contracts.ts:29-32`); adding one
  is NOT in scope <!-- red-team: F3 -->. Org-less journeys are found via the
  table sort/search like any other journey.
- Modify: `apps/agent/agent/lib/accounts.ts` — null-company deal context
  (design above)
- Modify: deal record sheet header + any `deal.company` render found by
  `check-types` after the Prisma type change
- Tests: extend `apps/api` deals specs — create without company, create with
  contactId attaches atomically, create with mismatched companyId+contactId
  400s, attach to org-less journey, org delete leaves journey + its activities
  + its agent conversations intact with correct `lastActivityAt`, update
  detaches org via null. Extend `apps/agent` accounts spec — org-less deal
  context.

## Implementation Steps

1. Schema change + migration. `db:generate` — the compiler worklist is the
   START (every `deal.company` access that stops compiling), then the
   compiler-invisible worklist above, explicitly.
2. Contracts change + `trpc:generate`, commit generated server.ts.
3. Service: create path with transactional attach, attachContact rule,
   contactOptions, `$queryRaw` cast, companies.delete re-anchor.
4. UI: quick-add anchor union + client-sheet mount; create sheet optional org;
   table/dashboard null renders.
5. Agent: null-company deal context per the decided behavior.
6. Tests per list above; run api + agent + app suites.

## Success Criteria

- [ ] Journey created with no organization from deals page and from a client
      record; the client is attached atomically in one mutation.
- [ ] Create with mismatched org+client is rejected at create time.
- [ ] Attach/detach contact works on an org-less journey; company-scoped rule
      still enforced when org is set.
- [ ] Deleting an organization leaves its journeys with `companyId = null`,
      their full activity history, their agent conversations, and correct
      `lastActivityAt` — proven by a test, not by the row surviving.
- [ ] `contactOptions` on an org-less journey offers all contacts.
- [ ] Agent tab works on an org-less journey (context anchors on contacts).
- [ ] Dashboard and table render org-less journeys without error.
- [ ] `check-types` green with no non-null assertions added; suites green.

## Risk Assessment

- RISK — Cascade→SetNull changes delete semantics silently for existing users.
  Mitigation: this fork has no external users; PR description states it; test
  covers it.
- RISK — a missed `deal.company` access throws at runtime. Mitigation: the
  compiler-invisible worklist is explicit; grep `companyId` through
  deals/dashboard after the type change; pseudo-locale walk in Phase 4
  exercises the surfaces.
- RISK — contactOptions unscoped list is large. Accepted: same pagination as
  the global contacts list; no new mechanism (YAGNI).
- RISK — re-anchor UPDATE in companies.delete grows the delete transaction on
  orgs with huge histories. Accepted: single-tenant scale; the statement is two
  indexed UPDATEs.

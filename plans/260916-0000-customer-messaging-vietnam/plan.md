---
title: "Zalo Official Account chat"
description: "Customers write to the company's Zalo Official Account. The message lands on the contact record. A rep replies from the CRM inside the reply window."
status: awaiting-user-verification
priority: P1
branch: feat/zalo-oa-chat
tags: [feature, backend, frontend, database, api, agent, messaging]
blockedBy: []
created: 2026-09-16
updated: 2026-09-21
---

# Zalo Official Account chat

## Overview

Reps in Vietnam talk to customers on personal Zalo accounts. The CRM does not see those chats. This plan connects the company's Zalo Official Account (OA) to the CRM. An inbound Zalo message appears on the contact record within seconds. A rep replies from `/messages` or from the contact sheet. The OA holds the history.

Approach A from the brainstorm: one direct Zalo adapter behind one internal schema. The API is the HTTP boundary and the only writer. The agent sends and refreshes tokens on the direct lane. `eligibility()` is one pure function, computed by the API for the composer and by the agent before the vendor call.

**Out of scope, by user decision on 2026-09-16:** ZNS, template messages, transaction and promotion messages, SMS, WhatsApp, Telegram, agent-sent messages, outbound media, consent and opt-out fields, phone normalisation, `MessageTemplate`, message search, mobile push.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Paperwork](./phase-01-paperwork.md) | Done |
| 2 | [Schema and Zalo connection](./phase-02-schema-and-zalo-connection.md) | Done |
| 3 | [Inbound](./phase-03-inbound.md) | Done |
| 4 | [Outbound](./phase-04-outbound.md) | Done |

## Dependencies

- Phase 1 has no code. It produces `ZALO_APP_ID`, `ZALO_APP_SECRET`, a sandbox OA and the answers to five "verify before coding" facts. Phase 2 starts on the sandbox OA while OA verification runs.
- Phase 2 is the base. Phase 3 needs phase 2. Phase 4 needs phase 3.
- Cross-plan: none. `plans/` holds no other plan.

## Acceptance criteria

- An inbound Zalo text is visible on the contact record within 10 seconds of the webhook.
- A reply sent inside the reply window reaches the customer within 5 seconds. 95% of queued sends settle `SENT` or `FAILED` within 30 seconds.
- Outside the reply window or past the free-reply quota the composer shows one sentence and no input. Zero sends leave the CRM outside the window. A test asserts it.
- One row is sent once. A re-leased task, a double-click and a repeated "Try again" never send the same text twice. A test asserts it.
- An unmatched Zalo user is visible under the Unmatched filter and can be linked to a contact. A link can be undone. Deleting the contact returns the thread to Unmatched with its history. A conversation can be deleted.
- Disconnecting the OA stops every send, every webhook write and every token refresh, including one in flight. History stays.
- A transient Zalo failure never blocks the composer. Only a terminal token error shows "Needs a reconnect", and the next refresh clears it.
- A missing `ZALO_APP_ID` removes the card and every Zalo code path. Nothing throws.
- Every phase passes `bun run check-types`, `bun run lint` and the package test suites it touches.

## Source reports

- Brainstorm (the spec): [`plans/reports/brainstorm-260916-0000-customer-messaging-vietnam-report.md`](../reports/brainstorm-260916-0000-customer-messaging-vietnam-report.md), sections 5 and 6.
- Scout (file:line anchors): [`plans/reports/scout-260916-0000-messaging-codebase-touchpoints-report.md`](../reports/scout-260916-0000-messaging-codebase-touchpoints-report.md).
- Zalo research (facts and UNKNOWNs): [`plans/reports/research-260916-0000-zalo-messaging-vietnam-report.md`](../reports/research-260916-0000-zalo-messaging-vietnam-report.md).

## Rules this plan obeys

`AGENTS.md`, `docs/api.md`, `docs/agent.md`, `docs/connections.md`, `docs/environment.md`, `docs/telemetry.md`, `docs/design.md`. Skills to read before coding: `.agents/skills/eve`, `.agents/skills/nestjs-trpc`, `.agents/skills/prisma-database-setup`, `.agents/skills/nuqs`, `.agents/skills/shadcn`.

## Red Team Review

### Session — 2026-09-16
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (Standard tier: Fact Checker + Contract Verifier). Reports in [`reports/`](./reports/).
**Findings:** 15 (15 accepted, 0 rejected), deduplicated from 25 raw.
**Severity breakdown:** 2 Critical, 8 High, 5 Medium
**Verification:** 145 claims checked across the three reviewers. Failed claims: `scheduleTask()` "(kind, subject) upsert"; "as Slack's OAuth is" an API exception; callback `?error=` without `provider`; `create-contact-sheet.tsx` prefill; three "extend" test files that do not exist; per-package `turbo.json` `SLACK_CLIENT_ID` anchors; `MESSAGING.send.maxAttempts` "for the lease"; `targetsOf()` covering unmatched threads. Unverified: `SendAlt` export (`node_modules` absent).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `scheduleTask()` has no `subject`; the refresh chain completes itself and a second OA overwrites the first | Critical | Accept | Phase 2 |
| 2 | A 401 sets `tokenError`; the "due now" refresh answers "Not due." and never clears it; transient and terminal failures are treated alike; vendor text reaches the browser | Critical | Accept | Phase 1, 2, 4 |
| 3 | Slack OAuth precedent is Better Auth, not Nest; `state` binds to no user; error redirect omits `provider`; API has no slug | High | Accept | Phase 2, 4 |
| 4 | No `SENDING` state; a re-leased task or a crash after Zalo's 200 sends twice; `send.maxAttempts` is dead config | High | Accept | Phase 2, 4 |
| 5 | A thrown message handler settles `enrichmentStatus = FAILED` on the contact through `reconcileDirect()` | High | Accept | Phase 2, 3, 4 |
| 6 | Disconnect races an in-flight refresh; live tokens land on a disconnected row; replaced OA keeps open tasks | High | Accept | Phase 2 |
| 7 | Receipts arrive before `externalId` is written and are dropped with 200; no index on `externalId` | High | Accept | Phase 2, 3, 4 |
| 8 | `freeRepliesPerWindow` declared and never enforced; double-click and "Try again" send twice | High | Accept | Phase 1, 2, 4 |
| 9 | No unlink and no erasure for unmatched people; undoing a wrong link destroys history | High | Accept | Phase 3, 4 |
| 10 | `CreateContactSheet` has no prefill props and no created-id callback | High | Accept | Phase 3 |
| 11 | Attachment URLs accept any scheme and host | Medium | Accept | Phase 1, 2, 3 |
| 12 | Raw-body helper re-serialises objects; `follow`/`unfollow` have no ordering guard; no timestamp tolerance | Medium | Accept | Phase 2, 3 |
| 13 | `pokeAfterCommit()` reimplements `withTasks()` | Medium | Accept | Phase 4 |
| 14 | A bare `P2002` catch cannot tell the identity unique from the message unique; a real message is lost as "duplicate" | Medium | Accept | Phase 3 |
| 15 | Stale anchors: three "extend" test files do not exist; per-package `turbo.json` anchors wrong; `MESSAGE` telemetry and list exclusions unstated; `docs/agent.md` lanes table stale | Medium | Accept | Phase 2, 3, 4 |

Decisions the review left to the user: the cascade from `ContactChannelIdentity.contactId` (finding 9). Validation session 1 below changed it to `SetNull`. `AgentTask.subject` at `schema.prisma:477` stays unused; dedupe uses the payload path as `enqueue()` does.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-paperwork.md, phase-02-schema-and-zalo-connection.md, phase-03-inbound.md, phase-04-outbound.md
- Decision deltas checked: 14 (`scheduleTask` subject and exceptId; `SENDING` status; `clientRequestId` column; `MessageReceipt` table; `@@index([externalId])`; `zalo-errors.ts` and fixed sentences; `withTasks()` in place of `pokeAfterCommit()`; no `contactId` on message tasks; `Verification.value` carries user id and return path; `provider=zalo` on every redirect; `tokenError` makes refresh due; transient versus terminal refresh failure; `unlinkContact` and `deleteThread`; `CreateContactSheet` props; test files marked Create; `turbo.json` anchors; `docs/api.md` exception sentence)
- Reconciled stale references: 9 (phase 2 Requirements "stops rebooking"; phase 2 `?connected=1` without provider; phase 2 `handleDirect()` passing `task.payload`; phase 2 `Message` model missing `clientRequestId`; phase 2 `MessagingAccount` missing `receipts`; phase 2 rollback table count; phase 4 `handleDirect()` passing `task.payload`; phase 4 `send` return shape on a repeated request; phase 4 "added to the phase 2 migration")
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-09-16
**Trigger:** User chose validate after the red-team session. Red Team Review already holds the verification evidence; the pass was limited to the one unverified tag.
**Questions asked:** 7

#### Verification Results
- Tier: Standard (inherited from the red-team session)
- Claims checked: 1 (`SendAlt` export in `@carbon/icons-react`)
- Verified: 0 | Failed: 0 | Unverified: 1 (`node_modules` absent; phase 3 falls back to `Forum`)

#### Questions & Answers

1. **[Scope]** Phase 2 keeps `freeRepliesPerWindow: 8` and enforces it as a fifth blocked reason, unless phase 1 fact A finds no quota. If the Zalo docs stay ambiguous on a per-window quota, what should the plan do?
   - Options: Enforce 8 until proven otherwise | Delete the quota, window only | Block phase 2 until fact A is certain
   - **Answer:** Enforce 8 until proven otherwise
   - **Rationale:** Over-blocking costs one free reply. Under-blocking costs money. The constant stays and the fifth reason ships.

2. **[Architecture]** Phase 2 schema: deleting a contact cascades its Zalo identity, thread, messages and activity. The red team added `unlinkContact` and `deleteThread` beside it but kept the cascade. Confirm the delete shape?
   - Options: Keep cascade, plus unlink and delete | SetNull: history survives contact delete
   - **Answer:** SetNull: history survives contact delete
   - **Rationale:** A contact delete is a CRM housekeeping act, not an erasure. The thread returns to Unmatched. `deleteThread` is the one erasure path. `Activity.contactId` cascades from the contact today, so `ContactsService.delete` nulls the `MESSAGE` activities explicitly.

3. **[Architecture]** Phase 2 OAuth is a hand-rolled Nest controller (PKCE, state bound to user id, return path in the Verification row). Slack uses Better Auth `genericOAuth` in `packages/auth`. Which path?
   - Options: Nest controller as planned | Better Auth genericOAuth like Slack
   - **Answer:** Nest controller as planned
   - **Rationale:** Zalo v4 needs the `secret_key` header, PKCE and an OA profile read; OA tokens belong to the account, not a user. The plan already binds `state` to the user.

4. **[Assumptions]** Phase 1 row 7 assumes one OA for the whole workspace and a second connect replaces the first (old tokens cleared, its open tasks completed). Is that the product intent?
   - Options: Yes, one OA, replace on reconnect | Several OAs later, keep the schema open
   - **Answer:** Yes, one OA, replace on reconnect
   - **Rationale:** No per-account filter in the inbox. `threadByContact` returns at most one thread.

5. **[Risks]** Phase 1 row 7 and phase 2 store inbound images and files as Zalo URLs only; nothing is copied to Blob. Zalo CDN URLs can expire or need auth. If phase 1 finds they expire, what should phase 3 do?
   - Options: Keep URLs, show 'expired' in the bubble | Copy to Blob via an agent task | Decide in phase 1 row 7 only
   - **Answer:** Keep URLs, show 'expired' in the bubble
   - **Rationale:** No Blob write, no new task kind, no growth of the PDPL surface. The bubble renders one sentence on `<img onError>`.

6. **[Tradeoffs]** Phase 4 step 8: a send that times out or fails on the network is marked FAILED with no automatic retry, because Zalo has no idempotency key and a retry after an accepted timeout duplicates on the phone. The rep sees 'Try again'. Confirm?
   - Options: No auto retry, rep decides | One auto retry on timeout only
   - **Answer:** No auto retry, rep decides
   - **Rationale:** Zero duplicate risk from the CRM. Already the plan text.

7. **[Architecture]** Phase 3: `unlinkContact` and `deleteThread` need the connections role (owner or admin). `linkContact` is any member. Right split?
   - Options: Owner/admin for unlink and delete | Any member for unlink, owner/admin for delete | Any member for both
   - **Answer:** Owner/admin for unlink and delete
   - **Rationale:** Undo and erasure are bounded to the people who own the connection, as disconnect is.

#### Confirmed Decisions
- Reply quota: enforce 8 per window until fact A proves otherwise.
- Contact delete: `SetNull`; history survives under Unmatched; `deleteThread` erases.
- OAuth: Nest controller with PKCE and user-bound state.
- One OA per workspace; replace on reconnect.
- Attachments: Zalo URLs only; expired image renders one sentence.
- Send timeout: no automatic retry.
- Unlink and delete conversation: owner or admin.

#### Action Items
- [x] Phase 2 schema: `ContactChannelIdentity.contactId` `onDelete: SetNull`; delete rules bullet rewritten.
- [x] Phase 3: `ContactsService.delete` nulls `MESSAGE` activities; Contact delete section, requirements, tests, success criteria and PDPL risk rewritten.
- [x] Phase 3 UI: expired image sentence in `MessageBubble`.
- [x] Phase 4 docs: `docs/messaging.md` and `docs/api.md` lines say contact delete keeps history.
- [x] plan.md: acceptance criterion and the Red Team "did not change" note updated.

#### Impact on Phases
- Phase 2: one FK rule and one prose bullet.
- Phase 3: one new statement in `ContactsService.delete`, one test shape, one bubble rule.
- Phase 4: two doc sentences.
- Phase 1: none. Rows 7 and facts A, D, E stand.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-paperwork.md, phase-02-schema-and-zalo-connection.md, phase-03-inbound.md, phase-04-outbound.md
- Decision deltas checked: 2 (contact delete `SetNull`; expired attachment rendering)
- Reconciled stale references: 12 (phase 2 FK rule and delete-rules bullet; phase 3 requirements, `contacts.service.ts` entry, Contact delete section, `record-delete` test, success criterion, PDPL risk, `unlinkContact` and `deleteThread` table notes; phase 4 `docs/messaging.md` and `docs/api.md` lines; plan.md acceptance criterion and Red Team note)
- Unresolved contradictions: 0

## Implementation Log — 2026-09-21

All four phases built and reviewed on branch `feat/zalo-oa-chat`. Not committed, not merged.

**Shipped per phase.** Phase 1: facts A-E verified (signature and OAuth community-corroborated, no official primary source), product decisions recorded in `docs/messaging.md`. Phase 2: schema, migration, `MESSAGING_POLICY`/`eligibility()`, task kinds, Zalo OAuth connect/callback, token refresh handler, connection card. Phase 3: webhook, `MessagingWriterService`, inbox reads, link/unlink/delete, timeline entry, nav badge. Phase 4: send procedure, agent send handler, identity-profile task, composer, contact sheet Messages tab, telemetry, docs.

**Deviations from plan, with reason.**
- `bodyParser: { rawBody: true }` on `createApp()`, not the plan's premise about `create-app.ts:15`. `@thallesp/nestjs-better-auth` parses every body regardless; this is the documented way to keep the buffer.
- `ZALO_OA_SECRET_KEY` shipped as a third optional var (fact B: distinct from the app secret), falls back to `ZALO_APP_SECRET`.
- Webhook timestamp tolerance is 2 hours, not 5 minutes (fact C: Zalo retries carry the original timestamp up to ~1h later).
- Callback tolerates a missing `state` (fact D: Zalo does not echo it); falls back to the newest unexpired `zalo-pkce` row for the session user.
- Attachment allowlist is three hosts (`zdn.vn`, `zadn.vn`, `zalo.me`), `http` accepted and upgraded to `https` in the bubble; a failing attachment is dropped, the event and message are kept (never drop a customer message for one bad URL).
- Refresh backoff escalates via `payload.attempt`, not `task.attempts` (each rebook is a new row); review finding, fixed in phase 2 review-fixes.
- `profileCheckedAt` column added on `ContactChannelIdentity` via a second migration `20260921221500_messaging_profile_checked`, plus the `message-identity-profile` task, to stop one vendor call per inbound message for a non-follower (phase 4 review finding H3).
- `messaging.threadById` added (not in the original tRPC table) so a deep link past the first loaded page resolves.
- `SENDING` rows interrupted by a crash settle `FAILED` with `errorCode "interrupted"` on re-lease, so a row never spins forever (phase 4 review finding H2).
- A throw after Zalo's 200 settles `SENT` with no `externalId`, not `FAILED` (phase 4 review finding H1: the text is already on the phone).
- 422 now maps to `UNPROCESSABLE_CONTENT` in `DomainErrorMiddleware`, not `INTERNAL_SERVER_ERROR`, so the composer can tell a refusal from a crash.
- Inbox and open-thread poll at 10s (not the plan's unspecified/looser cadence), composer polls at 2s while a send is pending.
- The Zalo wire schemas (token response, OA profile, send/user-detail responses) live in `packages/validation/src/messaging.ts`, shared by API and agent, not duplicated per package.
- `/api/messaging/zalo/connect` still throws a raw 403 for a missing role or missing env pair, rather than redirecting with `error=role`/`error=config` (UI review finding, not fixed).

**Final gate counts** (after the last fix pass, phase 4 UI review-fixes): API 481, agent 395, db 133, telemetry 67, validation 5, app 209. The phase 4 UI-and-docs review findings 2 to 5 (per-call `clientRequestId`, ungated `threadByContact`, two missing helper tests, a vacuous composer-state assertion) are fixed in `from-fullstack-developer-to-orchestrator-phase-04-ui-review-fixes-report.md`. Finding 1 (`AGENTS.md` block) is the user's pre-existing uncommitted edit.

**Open before merge.**
- Manual sandbox OA check: signature header and formula, OA id field in the envelope, `user/detail` response shape, PKCE `code_challenge` encoding, first real connect. Blocked: `ZALO_APP_ID`/`ZALO_APP_SECRET` are not set in `.env`.
- Browser check: inbox, composer, scroll-to-newest rule, reconnect error display. No dev server has run against this branch.
- The hand-drawn Zalo brand mark (`packages/ui/src/components/brand-logos/zalo.tsx`) needs the official asset.
- Untracked `apps/api/tmp-*.ts` debris and pre-existing uncommitted `AGENTS.md`/`docs/agent.md`/`packages/db/prisma/seed.ts` edits are not part of this feature; do not commit them with it.

# Zalo messaging plan review

Research date: 2026-09-21. Final review: 2026-09-22.
Scope: plan review, repository verification, and current provider documentation.
Status: recommendations only. The implementation plan remains unchanged.

## Summary

Keep the main architecture. One direct Zalo adapter, Postgres tasks, and shared eligibility rules fit this repository.

Resolve transaction and lifecycle defects before implementation. More services or a general messaging framework do not solve these defects.

Two `gpt-5.6-luna` reviewers start architecture and concurrency checks.
The architecture reviewer saves [four findings](./review-260921-architecture.md) before credit exhaustion stops both agents.
The concurrency reviewer produces no final report. The primary reviewer completes the concurrency analysis and verifies the saved architecture findings.
This session provides no model billing totals. This is not a completed two-model consensus review.

## Rules and evidence

Read `AGENTS.md`, `README.md`, and relevant sections of `docs/api.md` and `docs/agent.md`.
Read `docs/connections.md`, `docs/design.md`, and `docs/i18n.md`.
Apply `ck:research` and `ck:project-organization`.
Inspect all five plan files, the earlier provider report, task scheduling, and existing transaction locks.

Source references below use repository-relative paths and current line numbers.

## Provider research

| Question | Evidence | Recommendation |
| --- | --- | --- |
| Free window | The current consultation guide describes free messages within 48 hours. | Retain the 48-hour limit. |
| Eight-message cap | An older announcement specifies eight. The current guide omits that cap and describes all messages within 48 hours as free. | Preserve the user's conservative cap. Require dated provider confirmation before changing it. |
| Seven-day window | The current guide separates the OpenAPI sending window from the free window. | Remove the claim that 48 hours and seven days conflict. |
| Fees | Current pricing lists 55 VND for consultation messages outside 48 hours. | Do not claim every blocked message necessarily incurs a charge. Packages include allowances. |
| Signature | Reachable official community pages provide no usable signature specification. | Require a real signed fixture before implementation. Do not label concatenated SHA-256 as verified HMAC. |
| Retries | The earlier report explicitly leaves HTTP 500 retry behavior unverified. | Remove the plan's unconditional promise that Zalo retries HTTP 500 responses. |
| OAuth | The earlier report relies on an independently unverified documentation host. | Keep token rotation and endpoint details behind the existing sandbox verification gate. |

Primary sources:

- [Current consultation guide](https://oa.zalo.me/home/documents/guides/tin-tu-van).
- [Earlier pricing announcement](https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099).
- [Current OA pricing](https://zalo.solutions/oa/pricing).
- [Official signature discussion](https://developers.zalo.me/community/detail/f62243c57f8096decf91).

The current guide links to the official developer site. Its article body remains unavailable through this session's browser tool.
The `docs.zaloplatforms.com` page repeats single-use refresh claims. Its branding does not establish official provenance.
Treat that page as a research lead, not independent verification.

A concurrent September 21 research report adds SDK and third-party leads for authorization and signature handling.
Its callback-state claim still needs a sandbox round trip. A missing example parameter does not prove absent echo behavior.
Keep the existing user-bound OAuth state check and verify the provider transport before implementation.

## Recommended architecture

1. Keep Nest as the HTTP boundary and the agent as the sender and token refresher.
2. Keep the existing `AgentTask` queue and `withTasks()` transaction pattern.
3. Reuse `@crm/db/idempotency` for short database transactions that need serialization.
4. Define one shared messaging persistence module for cross-process invariants.
5. Keep provider parsing inside the Zalo adapter. Pass Zod-derived domain values downstream.
6. Keep the eligibility function pure. Return structured reasons and display parameters.
7. Keep one authoritative contact link. Treat duplicated activity fields as explicit projections.
8. Add connection generations and explicit uncertain-send handling.

The shared persistence module needs concrete functions, not a generic repository hierarchy.
Examples include `reserveSend`, `settleSend`, `applyReceipt`, and `replaceConnection`.
Do not hold database transactions open during vendor requests.
Use short claims before requests and guarded writes after requests.

`MessagingWriterService` currently claims exclusive ownership, but agent handlers also update messages, threads, receipts, and accounts.
State ownership accurately. Share invariants where both processes write the same state.

## Required plan changes

| Priority | Change | Phase |
| --- | --- | --- |
| P0 | Correct duplicate transaction handling | 3 |
| P0 | Distinguish uncertain delivery and protect quota accounting | 2, 4 |
| P0 | Fence connection generations and serialize token refresh | 2 |
| P0 | Verify signatures and provider retry behavior | 1, 3 |
| P1 | Make task succession and receipt application atomic | 2, 3, 4 |
| P1 | Define canonical contact links and deletion behavior | 2, 3 |
| P1 | Add inbox freshness and locale acceptance criteria | 2, 3, 4 |
| P2 | Consolidate shared contracts and remove stale review prose | All |

### Transaction correctness

Phase 3, line 122, returns normally after `createMany()` inserts zero rows.
A normal transaction return commits preceding counter changes. It does not roll them back.

Create the identity and thread first without counter increments.
Insert the message next. Update counters and projections only after one successful insertion.
Use atomic increments and database timestamp comparisons for concurrent arrivals.
Only the newest message changes the latest-message snippet.

`ActivityStampService.touch()` uses the root database client at `apps/api/src/crm/activity-stamp.service.ts:27`.
Calling it inside the writer transaction does not enlist its writes in that transaction.
Accept a transaction client and pass it through messaging writes. Test rollback after timestamp updates.

Phase 4, lines 91–96, checks `clientRequestId` before insertion without serializing that check.
Concurrent identical requests therefore produce a uniqueness error instead of two successful responses containing the same message.
Lock the thread before checking the key and reserving quota. Validate reuse against the original request body.
Generate one browser key per logical send. Preserve it across network retries.

Phase 4, line 59, deduplicates tasks through `payload.clientRequestId`.
Line 94 stores only `{ messageId }`. Use `messageId` consistently as the task subject.

### Delivery and quota

Phase 4, lines 110–120, collapses rejection, timeout, and post-send database failure into `FAILED`.
These outcomes require different behavior.

Use `FAILED` only for confirmed rejection or failure before sending.
Use `UNKNOWN` for requests with uncertain delivery and abandoned `SENDING` claims.
Keep uncertain attempts in quota accounting. Show explicit duplicate risk before a manual resend.
Preserve the user's decision against automatic retries after ambiguous failures.

The current quota uses `queuedAt >= lastInboundAt` and excludes every failed message.
A queued message before a new inbound event consumes no local quota after that event, even when sent later.
An accepted timeout also disappears from the count after becoming `FAILED`.

Reserve quota atomically against an explicit interaction generation.
Recheck the generation before sending. Reassign reservations after newer inbound interactions.
Release reservations only for confirmed unsent outcomes.
Keep API admission and worker rechecks on the same persisted reservation contract.
Confirm whether OA Manager or other applications share the provider quota before promising zero charges.

The plan also promises one vendor call per row while allowing a retry after confirmed authentication rejection.
State the actual guarantee: no repeat after acceptance or uncertain delivery.
Permit authentication retries only after verified rejection with no delivery.

### Connection lifecycle and refresh

Phase 2, line 333, guards token writes only with `disconnectedAt: null`.
Disconnect followed by reconnect makes that predicate true again.
An old refresh then overwrites the new credentials.

Add a connection generation. Increment it on connect, replacement, and disconnect.
Capture it in task payloads. Require it on claims and result writes.
Serialize connection replacement across the workspace to preserve one active OA.
Allow one refresh request per account generation through an explicit claim.

The proposed scheduler still uses a separate find and create sequence.
Reuse the existing task lock pattern for deduplication and scheduling changes.
Complete the running refresh and schedule its successor atomically.
Preserve earlier urgent deadlines during concurrent refresh requests.

Phase 2, line 335, derives backoff from task attempts while creating fresh successor tasks.
Fresh tasks reset attempts. Store consecutive refresh failures separately and reset them after success.
Separate `refreshing` from terminal `reconnect-required` state.
An expired access token does not itself prove that reconnection is necessary.

No local cancellation retracts a request already accepted by Zalo.
Revise disconnect acceptance: stop new claims, reject stale writes, and disclose already-started requests.
Settle queued messages as cancelled during disconnect and deletion.
Finishing their task rows alone leaves messages permanently queued.

Phase 2 validates OAuth return paths with string prefixes only.
The path `/\\example.com` passes that rule, but standard URL parsing resolves it to another origin.
An isolated Node URL check confirms this normalization.
Build redirects against the configured app origin and require exact origin equality.
Use `searchParams` to preserve existing queries. Prefer a fixed destination when return-path flexibility adds no value.

### Webhooks and receipts

Phase 3, line 105, rejects event timestamps older than five minutes.
The earlier research describes retries extending to one hour, but leaves official retry semantics unresolved.
Choose replay protection from the verified delivery contract. Distinguish event time from signature time.
Retain durable message deduplication for valid delayed events.

Receipt buffering still contains a race:

1. The webhook finds no outbound message.
2. The sender stores the provider ID and finds no buffered receipt.
3. The webhook stores the receipt after sender completion.

Serialize both paths using the same account-and-provider-message lock.
Apply statuses monotonically: `SENT`, then `DELIVERED`, then `READ`.
Process receipts independently of arrival order.
Run receipt cleanup from existing scheduled maintenance. Cleanup must not depend on a later successful send.

### Contact links and UI

Phase 3, line 92, assumes one OA implies one thread per contact.
The schema permits multiple Zalo identities linked to the same contact.
Retained history from replaced OAs adds more threads.
Return all relevant threads or enforce an explicit active-account linking constraint.
Do not silently select an arbitrary thread.

Deleting a contact only sets the foreign key referencing that contact to null.
It does not clear `MessageThread.companyId`.
Clear the thread's company projection explicitly in the contact deletion transaction.
Apply link and unlink rules atomically. Recompute affected activity stamps on the old and new records.

`needsReply = unreadCount > 0` means opening a conversation removes it from Needs reply.
Use inbound-versus-successful-outbound order for Needs reply. Keep unread state separate.
Mark read through the last displayed message, so newer arrivals remain unread.

Phase 3 polls only the badge every 30 seconds.
Phase 4 polls messages only while queued or sending rows remain visible.
Neither contract refreshes an idle inbox within the promised ten seconds.
Poll the visible inbox and active thread on a shared interval below ten seconds.
Continue refreshing receipt states after `SENT`.

Add English and Vietnamese catalog changes to phases 2–4.
Use catalog keys for `composerState()` and app-owned UI copy.
Keep API error prose under the existing documented exception.
Add `i18n:check` and a pseudo-locale review to acceptance criteria.

## Simpler execution order

| Step | Deliverable | Gate |
| --- | --- | --- |
| 1 | Dated provider facts and sanitized real fixtures | Signature, retry, OAuth, and policy evidence |
| 2 | Schema, state transitions, connection generation, and persistence rules | Real database concurrency tests |
| 3 | Connect, disconnect, token refresh, and inbound storage | Sandbox lifecycle tests |
| 4 | Inbox, linking, deletion, and locale catalogs | Freshness and permissions tests |
| 5 | Outbound reservations, uncertain outcomes, and receipts | Failure injection and sandbox delivery |

Keep the existing four phase files. Move shared persistence rules into phase 2 and reference them from later phases.
Keep one authoritative contract for statuses, locking order, quota accounting, and task identity.
Move historical review narratives into reports after incorporating their accepted decisions.
Refresh stale repository anchors and remove the claim that `plans/` contains no other plans.

## Verification matrix

| Test | Required result |
| --- | --- |
| Duplicate inbound delivery | One message; unchanged counts on replay |
| Concurrent identical send requests | Same message ID; one task; no uniqueness error |
| Concurrent final quota reservation | Exactly the permitted reservations succeed |
| New inbound while outbound waits | Reservation moves to the correct interaction generation |
| Accepted send followed by timeout | Unknown delivery; no automatic resend; quota remains reserved |
| Process death after send claim | Visible uncertain outcome; no silent permanent spinner |
| Disconnect, reconnect, then old refresh completion | New credentials remain unchanged |
| Simultaneous refresh triggers | One vendor exchange and one successor task |
| Crash between refresh completion and scheduling | Successor task survives |
| Receipt lookup overlaps sender commit | Final receipt state converges |
| Seen receipt before delivered receipt | Status remains READ |
| Contact deletion | History survives; contact and company projections clear |
| Mark read overlaps new arrival | New arrival remains unread |
| Idle inbox receives webhook | Thread and message appear within the declared freshness target |
| English and Vietnamese screens | Catalog parity and i18n checks pass |

## Issues

1. RISK — Duplicate inbound returns commit counter increments and corrupt unread totals.
   Fix: update counters only after successful insertion.
2. RISK — Concurrent send requests lack atomic idempotency and quota reservations.
   Fix: serialize admission and use one stable message task subject.
3. RISK — Timeout handling hides uncertain delivery and permits duplicate manual sends.
   Fix: add UNKNOWN outcomes, recovery, and explicit resend warnings.
4. RISK — Queue timestamps and failed-send exclusions undercount actual quota usage.
   Fix: reserve against interaction generations and retain uncertain attempts.
5. RISK — Old workers overwrite reconnect state or continue work after disconnect.
   Fix: add generation guards, serialized lifecycle changes, and honest in-flight guarantees.
6. RISK — Refresh scheduling lacks atomic succession, exclusive refresh claims, and persistent backoff.
   Fix: reuse database locks and persist refresh state independently of task attempts.
7. UNKNOWN — Signature, retry behavior, OAuth details, and current eight-message policy lack complete authoritative verification.
   Fix: preserve the conservative cap and complete the sandbox evidence gate.
8. RISK — Five-minute timestamp rejection discards valid delayed events under the researched retry schedule.
   Fix: derive replay limits from verified delivery semantics.
9. RISK — Receipt races lose status updates, and out-of-order receipts regress status.
   Fix: serialize receipt application and enforce monotonic status transitions.
10. RISK — Contact linking, deletion, and thread cardinality disagree with the schema.
    Fix: define canonical links, clear company projections, and specify multiple-thread behavior.
11. RISK — Needs reply equals unread, so opening a thread hides unanswered work.
    Fix: separate reply state from read state and use a read watermark.
12. NOT DONE — Inbound and receipt polling cannot meet the stated visibility requirement.
    Fix: specify shared polling for visible threads and inbox lists.
13. NOT DONE — English and Vietnamese catalog work is absent from the plan.
    Fix: add catalogs, key-based UI helpers, and i18n acceptance checks.
14. RISK — Exclusive writer claims conflict with agent writes and duplicate persistence rules.
    Fix: document ownership and share only cross-process state transitions.
15. UNKNOWN — Median task lookup fails because the `mdn` executable is unavailable.
    Fix: install or expose the configured CLI before updating task status.
16. RISK — Stale repository claims and inconsistent task payload names misdirect implementation.
    Fix: refresh anchors and define each shared contract once.
17. RISK — Activity timestamps commit outside messaging transactions and survive failed writes.
    Fix: pass the transaction client into `ActivityStampService.touch()`.
18. RISK — OAuth return-path prefix checks permit browser-normalized external redirects.
    Fix: validate the parsed origin and construct query parameters with `URL`.
19. NOT DONE — Credit exhaustion stops both low-cost reviewers before completion.
    Fix: the primary reviewer verifies saved findings and completes the review; independent concurrency confirmation remains incomplete.

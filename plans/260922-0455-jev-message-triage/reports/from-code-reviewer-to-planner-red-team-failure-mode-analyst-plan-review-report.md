# Red-team plan review: Jev message triage (failure-mode analyst)

Reviewer: code-reviewer. Perspective: Murphy's Law. Scope: plan.md, phase-01, phase-02, phase-03.
Method: read-only grep/sed against the working tree on `feat/zalo-oa-chat`. No build, lint or test run.

Rules and skills read: `AGENTS.md`, `docs/agent.md` ("Two lanes", "Dispatch on demand", "Optional by default", egress rule), `docs/messaging.md`, `.claude/rules/review-audit-self-decision.md`.

### Verification Results

Tier: Standard (Fact Checker + Contract Verifier).
Claims checked: 34. Verified: 28. Failed: 4. Unverified: 2.

Phase 1 (11 claims)

| # | Claim | Result |
|---|-------|--------|
| 1 | Vendor client pattern `apps/agent/agent/lib/perplexity.ts` | VERIFIED (file exists) |
| 2 | `capabilitiesFrom()` in `capabilities.ts` | VERIFIED `apps/agent/agent/lib/capabilities.ts:34` |
| 3 | `apps/agent/test/capabilities.spec.ts` | VERIFIED (file exists) |
| 4 | Script pattern `backfill-empty-facts.ts` wired in `package.json` | VERIFIED `apps/agent/package.json:8` |
| 5 | `dispatch-config.ts`, `messaging-config.ts`, `agent-manifest.ts` | VERIFIED (files exist) |
| 6 | `turbo.json` `globalPassThroughEnv` holds `PERPLEXITY_API_KEY` | VERIFIED `turbo.json:59` |
| 7 | Profile spec stubs `globalThis.fetch` | VERIFIED `apps/agent/test/message-identity-profile.integration.spec.ts:23,31,44` |
| 8 | `.env.example` agent optional keys section | VERIFIED `.env.example:156` (`PERPLEXITY_API_KEY`) |
| 9 | `test` script sets `CRM_TELEMETRY_DISABLED=1` | VERIFIED `apps/agent/package.json:16` |
| 10 | `apps/agent/node_modules/eve/docs/README.md` | UNVERIFIED (repo hook blocks `node_modules` reads) |
| 11 | Skills `eve`, `prisma-database-setup`, `nestjs-trpc`, `nuqs`, `shadcn` exist | VERIFIED (all five `SKILL.md` present) |

Phase 2 (13 claims)

| # | Claim | Result |
|---|-------|--------|
| 1 | `handleDirect()` in `dispatch.ts` | VERIFIED `apps/agent/agent/lib/dispatch.ts:107` |
| 2 | `TASK_KINDS`, `DIRECT_KINDS`, `PRIORITY` in `agent-tasks.ts` | VERIFIED `packages/db/src/agent-tasks.ts:1,21,42` |
| 3 | `queueMessageIdentityProfile()` and `withTasks` queue at ~176 | VERIFIED `apps/api/src/agent/agent-trigger.service.ts:210,176` |
| 4 | Writer ~617 `messageIdentityProfileRequested` | VERIFIED `apps/api/src/messaging/messaging-writer.service.ts:617` |
| 5 | `identityProfilePayload` in `packages/validation/src/messaging.ts` | VERIFIED `:10` |
| 6 | `Message` ~1642, `MessageThread` ~1614 | VERIFIED `packages/db/prisma/schema.prisma:1642,1614` |
| 7 | Last migration `20260921221500_messaging_profile_checked` | VERIFIED |
| 8 | `messagingError` in `events.ts`; allowlist file | VERIFIED `packages/telemetry/src/events.ts:92`, `allowlist.ts:84-92` |
| 9 | `docs/agent.md` line 262 egress rule 1 | VERIFIED `docs/agent.md:262` |
| 10 | Writer spec enumerates queued profile kind | VERIFIED `apps/api/test/messaging-writer.spec.ts:25,76,83` |
| 11 | "queue ... inside the same transaction path as the profile task" | FAILED. `store()` uses `this.db.$transaction` (`messaging-writer.service.ts:111`), not `withTasks`. The profile task is queued at `:617`, outside that transaction. |
| 12 | "throw so the lease retries" with "one try/catch that returns `SENTENCES.internal`" | FAILED. Both cannot hold (Finding 1). |
| 13 | "Missing key completes the task ... so a later key can triage the backlog" | FAILED. `completeTask` sets `finishedAt` (`apps/agent/agent/lib/tasks.ts:87-99`). No re-queue path exists (Finding 2). |

Phase 3 (10 claims)

| # | Claim | Result |
|---|-------|--------|
| 1 | `MESSAGING_FILTERS`, `messagingThreadsInput` | VERIFIED `apps/api/src/messaging/messaging.contracts.ts:9,13` |
| 2 | `filterClause()`, `serializeThread()`, `ThreadRow` | VERIFIED `messaging.service.ts:344,355,79` |
| 3 | Threads query orders by `lastMessageAt desc` | VERIFIED `messaging.service.ts:186` |
| 4 | `messages-search-params.ts` mirrors `MESSAGING_FILTERS` with `parseAsStringLiteral` | VERIFIED `:3,12` |
| 5 | `messages-inbox.tsx`, `page.tsx`, `thread-list.tsx` | VERIFIED (files exist) |
| 6 | Generator command for `src/generated/server.ts` | VERIFIED `apps/api/package.json:22` (`trpc:generate`) |
| 7 | `bun run i18n:catalogs`, `i18n:check` | VERIFIED `package.json:14,15` |
| 8 | `apps/api/test/messaging*.spec.ts` | VERIFIED (`messaging-reads`, `messaging-send`, `messaging-writer`) |
| 9 | `apps/app/test/*` has an inbox spec | UNVERIFIED (no messaging spec in the listing) |
| 10 | `orderBy [{ lastUrgency: "desc" }, ...]` "puts level 3 first" | FAILED. Postgres sorts NULL first on DESC. Codebase uses `{ sort, nulls: "last" }` (Finding 4). |

Contract Verifier (every interface the plan changes)

- `AgentTaskQueue` (`apps/api/src/agent/agent-trigger.service.ts:22`): 2 files, 4 sites. Definition `:22-32`; `withTasks` signature `:153`; implementation `:159-183`; consumer `apps/api/src/messaging/messaging-writer.service.ts:19` (import), `:254` (`queueOutbound` parameter). No test implements it (`apps/api/test/agent-trigger.stub.ts` stubs `withCrmEvents` only). Adding a method is additive.
- `DIRECT_KINDS` (`packages/db/src/agent-tasks.ts:21`): 4 files + 1 doc. `apps/agent/agent/lib/dispatch.ts:18,58,178`; `apps/agent/agent/lib/tasks.ts:29` (re-export); `apps/agent/test/tasks.integration.spec.ts:3,14`; `apps/agent/test/lanes.integration.spec.ts:3,9,10,102-106`; `docs/agent.md:52` (lane table).
- `TASK_KINDS` (`:1`): 2 files. `packages/telemetry/src/allowlist.ts:1,231` (`TASK_KIND_SET` gates the `task_kind` property); `packages/telemetry/test/allowlist.spec.ts:4,133` (iterates every kind). Adding a kind extends both automatically.
- `PRIORITY` (`:42`): `agent-trigger.service.ts:54,62,80,89,99,110,132,200,218,239,301,423,552`; `apps/agent/agent/lib/messaging/message-token-refresh.ts:35`; tests `message-send.integration.spec.ts:131,548`, `message-token-refresh.integration.spec.ts:85,497`, `message-identity-profile.integration.spec.ts:89`; `lanes.integration.spec.ts:108+` asserts ordering relations; `docs/agent.md:59-63` priority line. Additive key.
- `messagingThreadsInput` (`messaging.contracts.ts:13`): `messaging.router.ts:30,33`; `messaging.service.ts:183-199`; app callers via `messaging.threads` in `messages-inbox.tsx` and `page.tsx`. New fields with defaults are backwards compatible.
- `serializeThread` (`messaging.service.ts:355`): returned by `threads` (`:197`), `threadByContact` (`:212`), `threadById` (`:223`). The contact sheet consumer receives the new fields; additive.
- Telemetry `ALLOWED_PROPERTIES` (`packages/telemetry/src/allowlist.ts:84-92`): `surface` and `band` are absent. The plan adds them; `packages/telemetry/test/allowlist.spec.ts` must be checked for property enumeration.

Runtime flows traced (summary; details in findings)

1. Throw path: `runDirect` (`dispatch.ts:73-96`) maps a throw to `{finished:false}` → `reconcileDirect` (`:98-105`) → `settle()` → `write()` returns early with no `contactId`/`companyId` (`apps/agent/agent/lib/enrichment.ts:30`). The task row is untouched: `finishedAt` null, `leasedUntil` +6 min (`dispatch-config.ts:7`), `attempts` +1 (`tasks.ts:48`). Retry after lease expiry, max 3 (`agent-tasks.ts:38`; `tasks.ts:54`), then `retireExhausted` stamps `RETIRED_OUTCOME` (`tasks.ts:73-85`; `agent-tasks.ts:40`). A throw does not settle FAILED. But the plan's own try/catch prevents the throw (Finding 1).
2. Newest-inbound rule: unguarded read-then-write (Finding 5).
3. Dedup `subject`: `enqueue` matches `kind` + `finishedAt: null` + `payload[path] = value` (`agent-trigger.service.ts:473-490`), under an advisory lock (`:469-471`). Dedup is against open tasks only. The webhook duplicate never reaches the queue because `store()` returns at `inserted.count === 0` (`messaging-writer.service.ts:173-175`). Holds only while the duplicate branch stays before the queue call (Finding 3).
4. Item timeout: worst-case Jev per task = 10 s + 1 s + 10 s + 4 s + 10 s = 35 s (phase 1 config). Under `itemTimeoutMs` 120 s (`dispatch-config.ts:39`). But 60 tasks / 6 workers × 35 s = 350 s exceeds `sweep.timeoutMs` 240 s (`:36`) (Finding 6).
5. Migration: `CREATE TYPE` + nullable columns + `CREATE INDEX` (non-concurrent, brief write lock on `messageThread`). `db:deploy` runs before app start (`CONTRIBUTING.md:30`). Phase 3 reads only after phase 2's migration. Deploy ordering API-before-agent is the hazard (Finding 7).
6. Backlog: priority 920 sits above `brand` 900, `portrait` 800, `event` 700 (Finding 6). Below `messageSend` 950, so rep replies are claimed first.
7. Unlink sets `contactId` null on identity, thread and activity (`messaging-writer.service.ts:515-529`); `lastIntent` stays, which is correct. Delete cascades identity → thread → message (`schema.prisma` `onDelete: Cascade` on `MessageThread.identity` and `Message.thread`; `messaging-writer.service.ts:540`) (Finding 9).
8. Eval with empty bodies (Finding 8).

## Finding 1: Step 7 both throws for transient errors and catches everything

- **Severity:** Critical
- **Location:** Phase 2, "Implementation Steps" step 7; "Requirements" non-functional; plan.md acceptance "A Jev 429 or 529 backs off and retries within the task's lease"
- **Flaw:** Step 7 says "on `ok: false` ... else throw so the lease retries" and, in the same sentence, "The whole body sits in one try/catch that returns `SENTENCES.internal` and bumps `jevError`, matching `runMessageSend`". The catch-all swallows the throw. `handleDirect` then calls `completeTask` with the sentence, which sets `finishedAt`. The task is finished. `triagedAt` stays null. Nothing retries.
- **Failure scenario:** Jev returns 529 for 40 s. The client backs off 1 s, 4 s, gives up with "Rate limited.". The handler throws. The try/catch turns it into "The triage failed inside the CRM.". `completeTask` closes the task. The message never gets a verdict. The inbox never shows a badge for it. Test (d) "429 twice then success" passes because the client's own backoff succeeds; no test covers "client gives up".
  Second scenario, if the throw escapes the catch: the task stays leased 6 min, retries at most 3 times over 12-18 min, then `retireExhausted` closes it with outcome "Gave up after 3 attempts: the session never reported back." A Jev outage of 20 min loses triage for every message in the window with a sentence that names a session that never existed.
- **Evidence:** `apps/agent/agent/lib/dispatch.ts:146-149` (`completeTask(task.id, await runMessageIdentityProfile(task))`), `:73-105` (`runDirect` → `reconcileDirect` → `settle`); `apps/agent/agent/lib/enrichment.ts:30` (`if (!subject.contactId && !subject.companyId) return;`); `apps/agent/agent/lib/tasks.ts:87-99` (`completeTask` sets `finishedAt`), `:48` (`attempts + 1` on claim), `:54` (`attempts < MAX_ATTEMPTS`), `:73-85` (`retireExhausted`); `packages/db/src/agent-tasks.ts:38,40`; `apps/agent/agent/lib/messaging/message-identity-profile.ts:112-116` (the catch-all pattern the plan copies). Plan: "else throw so the lease retries; ... The whole body sits in one try/catch that returns `SENTENCES.internal`".
- **Suggested fix:** Use the existing `brand` contract: `if (result.retryable) return;` (`dispatch.ts:110`) leaves the task leased without `completeTask`. Have `runMessageTriage` return `{ done: string } | { retry: string }`; the `handleDirect` branch returns early on `retry`. Move the try/catch so it only wraps the CRM writes. State the retry ceiling in the plan (3 attempts, 6 min lease each) and add a `triagedAt IS NULL` backfill script as the recovery path. Add test "client gives up after backoff → task stays open, `attempts` = 1".

## Finding 2: "A later key can triage the backlog" describes a queue that does not exist

- **Severity:** Critical
- **Location:** Phase 2, "Requirements" non-functional; "Risk Assessment" "Backlog on key rotation"; step 7 `SENTENCES.notConfigured`
- **Flaw:** The handler returns `SENTENCES.notConfigured`. `handleDirect` passes every returned sentence to `completeTask`. `completeTask` sets `finishedAt`. The task is gone. No code re-queues a message whose `triagedAt` is null. The risk line "A new key after weeks of messages triages the backlog at 60 per tick" cannot happen.
- **Failure scenario:** Self-hoster runs two weeks without `TYPESAFE_API_KEY`. 3,000 inbound texts each queue a task; each completes with "not configured" within a tick. The key is added. Zero tasks are open. The 3,000 rows keep `triagedAt = null` and `intent = null` forever. The inbox filter shows them under no intent. The success criterion "nothing stamped" is met and useless.
- **Evidence:** `apps/agent/agent/lib/dispatch.ts:146-149` (every sentence completes the task); `apps/agent/agent/lib/tasks.ts:87-99`; no `scheduleTask`/backfill for `message-triage` anywhere in the plan (`grep -rn "backfill" phase-02` empty). Plan: "Missing key completes the task with 'not configured' and stamps nothing, so a later key can triage the backlog."
- **Suggested fix:** Keep "complete on missing key" (the capability rule in `docs/agent.md:188-193` wants that) and add `apps/agent/scripts/backfill-triage.ts` (pattern `apps/agent/scripts/backfill-empty-facts.ts`) that inserts `message-triage` tasks for `kind = TEXT AND direction = INBOUND AND triagedAt IS NULL`, batched, and document it in `docs/messaging.md` as the key-rotation step. Delete the false risk line.

## Finding 3: The writer step misreads the transaction and copies `required=false` into a transaction

- **Severity:** High
- **Location:** Phase 2, "Implementation Steps" steps 5 and 6; "Related Code Files" writer entry
- **Flaw:** Three errors. (a) "inside the same transaction path as the profile task": the profile task is queued at line 617, outside `store()`'s transaction, which is a plain `this.db.$transaction`, not `withTasks`. There is no shared transaction path to join. (b) "mirroring `messageIdentityProfileRequested`" copies `required = false`. `enqueue` then catches a failed `agentTask.create` inside the caller's transaction and returns `false`. Postgres has already aborted the transaction. (c) "switch the insert to `create` ... keeping the duplicate branch": a `P2002` inside an interactive transaction aborts the transaction; the duplicate branch cannot return normally after it.
- **Failure scenario:** The `agentTask` insert fails (constraint, connection reset, lock timeout). `enqueue` logs and returns `false`. Every later statement in `store()` fails with "current transaction is aborted"; `store()` throws; the webhook answers 500; Zalo redelivers. That ordering recovers. If the enqueue is the last statement before `return { stored: true }`, `COMMIT` becomes `ROLLBACK`, the message insert is gone, `store()` reports stored, the webhook answers 200, Zalo never redelivers. Message lost, no log line says so.
  Also: `enqueue` with a `client` never pokes. Triage waits for the next cron minute, not "one dispatch tick" after the webhook.
- **Evidence:** `apps/api/src/messaging/messaging-writer.service.ts:111` (`this.db.$transaction(async (tx) =>`), `:152-160` (`createMany ... skipDuplicates: true`), `:173-175` (duplicate return), `:617` (profile queued outside); `apps/api/src/agent/agent-trigger.service.ts:223` (`false` for profile), `:205` (`true` for send), `:522-529` (catch → `return false`), `:519` (`if (!client) this.poke()`), `:186` (`withTasks` pokes); `apps/api/src/messaging/zalo/zalo-webhook.controller.ts:50-59` (500 on throw). Plan: "queue after the insert, inside the same transaction path as the profile task" and "mirroring `messageIdentityProfileRequested`".
- **Suggested fix:** Keep `createMany` + `skipDuplicates`; read the id with `tx.message.findUnique({ where: { threadId_externalId: { threadId, externalId } } })`. Wrap `store()`'s transaction in `this.agent.withTasks(...)` so the queue call gets the transaction client and the poke fires after commit. Queue with `required = true`. Put the queue call before the thread counter updates. Test: enqueue failure rolls back the message insert and the webhook returns 500.

## Finding 4: `sort=urgency` puts every untriaged thread above urgency 3

- **Severity:** High
- **Location:** Phase 3, "Architecture" orderBy; step 3; success criterion "`/messages?sort=urgency` puts level 3 first"
- **Flaw:** `orderBy: [{ lastUrgency: "desc" }, { lastMessageAt: "desc" }]` compiles to `ORDER BY "lastUrgency" DESC`. Postgres sorts NULL first on DESC. Phase 2 writes null for every below-threshold verdict, every sticker, every message before the key existed, and every thread from before the migration. Those threads sort first.
- **Failure scenario:** A rep clicks "Sort by urgency". The top of the list is 400 threads with no badge. The one complaint at urgency 3 is on page 5. The success criterion fails on the first real dataset. The test in step 10 ("level 3 before level 0") passes because it has no null thread.
- **Evidence:** Codebase pattern for this exact problem: `apps/api/src/contacts/contacts.service.ts:110` (`{ lastActivityAt: { sort: dir, nulls: "last" } }`), `:569`; `apps/api/src/deals/deals.service.ts:93,97`. Prisma `^7.9.1` (`packages/db/package.json:49`) supports it. Plan: `orderBy sort === "urgency" ? [{ lastUrgency: "desc" }, { lastMessageAt: "desc" }] : ...`.
- **Suggested fix:** `[{ lastUrgency: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }]`. The `@@index([lastUrgency, lastMessageAt])` does not serve `DESC NULLS LAST`; either declare `sort: Desc` on the index column or drop the index and note the table size. Add a null thread to the sort test.

## Finding 5: The thread verdict goes stale, and the plan's own rule makes it stale by design

- **Severity:** High
- **Location:** Phase 2, "Architecture" last line; step 7 "when the message is the thread's newest inbound"; success criterion "The thread's `lastIntent` and `lastUrgency` follow the newest inbound message only"; Phase 3 "Architecture" "null is what phase 2 writes below the threshold"
- **Flaw:** (a) Design gap. When the newest inbound is a sticker, an empty body, a held injection, or a below-threshold verdict, step 7 stamps the `Message` row and skips the thread. The thread keeps the previous message's `lastIntent`. Phase 3 then says a null thread verdict shows no badge, but the thread verdict is not null. (b) Race. "When the message is the thread's newest inbound" is a read followed by an unconditional write. Every other last-write in this area is a guarded `updateMany`.
- **Failure scenario:** (a) Customer writes "Tôi muốn đặt lịch" → thread badge BOOKING, urgency 1. Next day they write "Hủy, tôi đi chỗ khác rồi" and Jev's confidence lands at 0.45, below threshold. The thread still says BOOKING. The rep filters `intent=booking` and calls to confirm a booking the customer cancelled. (b) Two agent processes, which `docs/agent.md` names as a supported overlap. Process 1 claims message A (10:00:00), reads the thread, is newest, calls Jev, hits 529, backs off 35 s. Process 2 claims message B (10:00:01), reads the thread, is newest, writes COMPLAINT/3 in 500 ms. Process 1 finishes and writes OTHER/0. The complaint vanishes from the urgency sort. Test (h) passes because it is sequential.
- **Evidence:** Guarded pattern the plan does not follow: `apps/agent/agent/lib/messaging/message-send.ts:90-96` (`lastOutboundAt` conditional `updateMany`), `apps/api/src/messaging/messaging-writer.service.ts:191-199` (`lastInboundAt` guarded). Cross-process overlap: `docs/agent.md:85-86` ("Per-process; cross-process overlap is leases and `FOR UPDATE SKIP LOCKED`"). Late items keep running after the lane moves on: `apps/agent/agent/lib/dispatch.ts:90-95`. Plan: "update MessageThread (lastIntent, lastUrgency) when this is the newest inbound"; phase 3: "a thread with `lastIntent: null` shows no badge, and null is what phase 2 writes below the threshold".
- **Suggested fix:** Add `lastTriagedInboundAt DateTime?` to `MessageThread`. On every triage outcome for an inbound message (verdict, null verdict, skip, held), write the thread with `updateMany({ where: { id, OR: [{ lastTriagedInboundAt: null }, { lastTriagedInboundAt: { lte: message.queuedAt } }] }, data: { lastIntent, lastUrgency, lastTriagedInboundAt: message.queuedAt } })` where the verdict fields are null when there is no verdict. Rewrite test (h) as a concurrent case and add "newest below threshold clears the thread badge".

## Finding 6: Priority 920 and a 35 s worst case per item stall the visible lane

- **Severity:** High
- **Location:** Phase 2, step 3 (`PRIORITY.messageTriage = 920`); Phase 1 "Config shape" (`requestTimeoutMs` 10 s, `backoffMs` [1 s, 4 s]); Phase 2 "Risk Assessment" "Backlog on key rotation"
- **Flaw:** `claimDue` orders by priority, then due time. 920 outranks `brand` 900, `portrait` 800 and `agent-event` 700, so a triage burst is claimed before every custom-agent run and every logo. The per-item worst case is 10 s + 1 s + 10 s + 4 s + 10 s = 35 s. Sixty items over six workers at 35 s is 350 s, above the 240 s sweep timeout. The plan's throughput assumption "60 per tick" is also wrong in the other direction: every webhook pokes, pokes collapse into back-to-back sweeps, so a burst drains faster but still ahead of everything below 920.
- **Failure scenario:** An OA broadcast draws 800 replies in ten minutes while Jev returns 529. Every sweep claims six triage tasks, each holds a worker for 35 s, the sweep passes 240 s and is abandoned. `maxAbandoned` is 1, so the next sweep is refused until the in-flight items settle. A rep's reply (`message-send`, 950) queued after the abort waits for the next accepted sweep. `agent-event` tasks for those 800 inbound messages wait behind 800 triage tasks and their retries. Each 529 also burns one of three attempts (Finding 1), so the retry storm ends by retiring, not by succeeding.
- **Evidence:** `apps/agent/agent/lib/tasks.ts:59` (`ORDER BY priority DESC, dueAt ASC`); `packages/db/src/agent-tasks.ts:43-58` (900/800/700); `apps/agent/agent/lib/dispatch-config.ts:4-8` (batch 60, concurrency 6), `:36` (`timeoutMs: 4 * MINUTE_MS`), `:40` (`maxAbandoned: 1`); `apps/agent/agent/lib/dispatch.ts:346-351` (refuse while unsettled), `:368-401` (abandon + abort); `apps/api/src/agent/agent-trigger.service.ts:186,519` (poke per queue); `apps/agent/agent/schedules/dispatch.ts:12` (`* * * * *`). Plan: "`PRIORITY.messageTriage: 920`", "backoffMs: [SECOND_MS, 4 * SECOND_MS]", "triages the backlog at 60 per tick. Acceptable".
- **Suggested fix:** Priority below `event` (600): a badge is not rep-blocking, a custom-agent run and a logo are what a rep sees first (`docs/agent.md:59-63` states the rule). Cap in-handler Jev time at one request plus one retry (≤ 15 s) and leave the second retry to the lease. Record the arithmetic (batch × worst case / concurrency vs `sweep.timeoutMs`) in `docs/messaging.md` "Triage is a task".

## Finding 7: API deployed before the agent sends triage tasks into the research lane

- **Severity:** Medium
- **Location:** Phase 2, "Related Code Files" (`packages/db/src/agent-tasks.ts` + `apps/api` + `apps/agent` in one phase, no deploy-order note); "Risk Assessment"
- **Flaw:** The visible lane claims `only: DIRECT_KINDS`; the research lane claims `except: DIRECT_KINDS`. An agent process still running the old `DIRECT_KINDS` claims `message-triage` in the research lane and starts an eve session per row with the default brief "Handle this: <reason>". Budget 0 does not stop session creation. The plan has no deploy-order or rollback note.
- **Failure scenario:** Rolling deploy: API pods restart first; the agent pod restarts two minutes later. In those two minutes 50 inbound texts each become a research session. Each session runs a model turn, reads a task whose payload is only `messageId`, and reports "The record this names is gone."-style output through `noteSession`. Model spend for 50 sessions, and 50 tasks with `attempts` = 1 and a session id attached before the new agent ever sees them.
- **Evidence:** `apps/agent/agent/lib/dispatch.ts:56-60` (`{ only: DIRECT_KINDS }`), `:176-180` (`{ except: DIRECT_KINDS }`), `:441-442` (default brief); `apps/agent/agent/schedules/dispatch.ts:19-24` and `apps/agent/agent/channels/crm.ts:101-106` (research lane `start` opens a session per task); `packages/db/src/agent-tasks.ts:21-30` (old list without `message-triage`).
- **Suggested fix:** Add a deploy note to phase 2: agent first, API second, or same release only. Add a rollback note: an API rollback leaves `message-triage` rows that the new agent finishes; an agent rollback needs the API rolled back too. Consider a research-lane guard `kind in TASK_KINDS` that completes unknown kinds without a session; that protects every future kind.

## Finding 8: The eval sends empty bodies to Jev; production never does

- **Severity:** Medium
- **Location:** Phase 1, step 7 ("stickers as empty bodies"), step 8 (batches every fixture through `judge()`), step 9 (gate on band accuracy); Phase 2 "Requirements" ("A sticker or empty body is stamped and skipped without a Jev call")
- **Flaw:** The fixture shape `{ body, prior: [], intent, urgency, language, injection }` has no "skip" label. Empty-body fixtures need an `intent` and `urgency` ground truth that does not exist, they go to Jev (an empty `state` is a 422 candidate per step 4), and their answers count in the band tables that set the phase 2 thresholds. Phase 2 never sends an empty body, so the eval measures a path production does not take, and the measured path is contaminated by it.
- **Failure scenario:** 10 of 130 fixtures are empty bodies labelled `intent: other`. Jev answers `spam` at 0.6 for all ten. The 0.5-0.7 band for `intent` drops below 85 %. Step 9 says stop the plan. The plan stops on data production never sends. Or the reverse: they all land in `other` at 0.95 and inflate the top band past the gate.
- **Evidence:** Plan phase 1 step 7: "Include ... stickers as empty bodies"; step 8: "Loads fixtures, batches through `judge()`"; step 4: "On 422 returns the status"; phase 2: "A sticker or empty body is stamped and skipped without a Jev call". The eval script does not exist yet (`apps/agent/scripts/jev-eval.ts` absent; only `backfill-empty-facts.ts`, `backfill-brand-images.ts` in `apps/agent/package.json:8-9`).
- **Suggested fix:** Fixture schema gains `expected: "verdict" | "skip"`. The eval applies the same skip rule the handler will use, asserts the skip count, and excludes skips from the bands. Or drop empty bodies from phase 1 and cover them in phase 2 test (b) only.

## Finding 9: A deleted conversation mid-flight is reported as an internal failure

- **Severity:** Medium
- **Location:** Phase 2, step 7 ("write the row"); step 9 (`jevError` telemetry)
- **Flaw:** "Delete conversation" deletes the identity, which cascades to the thread and the messages. A triage task that has already loaded the message then writes the verdict. If the write is `db.message.update`, Prisma throws `P2025`. The catch-all returns `SENTENCES.internal` and bumps `jevError`. A normal user action becomes an error metric and a misleading outcome.
- **Failure scenario:** A rep deletes a spam conversation the second it arrives. The triage task is mid-Jev-call. The write throws. Telemetry records `jevError` with `error: PrismaClientKnownRequestError`, stage `write`. Anyone reading the failure dashboard sees Jev writes failing.
- **Evidence:** `apps/api/src/messaging/messaging-writer.service.ts:540-542` (`contactChannelIdentity.delete`); `packages/db/prisma/schema.prisma` `MessageThread.identity ... onDelete: Cascade` (model at `:1614`), `Message.thread ... onDelete: Cascade` (`:1642`); the sibling handlers use `updateMany` for exactly this reason: `apps/agent/agent/lib/messaging/message-identity-profile.ts:100`, `message-send.ts:48`. Plan: "write the row".
- **Suggested fix:** Every write in the handler is `updateMany`; `count === 0` returns `SENTENCES.gone` with no telemetry. Add a test: message deleted between load and write → `gone`, no `jevError`.

## Issues

1. BROKEN — Phase 2 step 7 throws for transient errors inside a catch-all that returns a sentence. Transient failures complete the task and the message is never triaged.
   Fix: not done. Return `{ retry }` and leave the task leased, as `brand` does (Finding 1).
2. BROKEN — "A later key can triage the backlog" is false. Completed tasks are never re-queued.
   Fix: not done. Add a `triagedAt IS NULL` backfill script and delete the claim (Finding 2).
3. RISK — Step 6 misreads the writer transaction and copies `required=false` into it. A failed enqueue can commit as a rollback and lose the message.
   Fix: not done. `withTasks` + `required=true` + `findUnique` for the id (Finding 3).
4. BROKEN — `sort=urgency` with plain `desc` puts every null thread first.
   Fix: not done. `{ sort: "desc", nulls: "last" }` (Finding 4).
5. RISK — The thread verdict goes stale on a below-threshold newest message and on cross-process overlap.
   Fix: not done. Watermark column and guarded `updateMany` (Finding 5).
6. RISK — Priority 920 plus a 35 s worst case stalls the visible lane and starves `agent-event`, `brand`, `portrait`.
   Fix: not done. Priority 600 and a 15 s per-item cap (Finding 6).
7. RISK — API deployed before the agent sends triage rows into the research lane as LLM sessions.
   Fix: not done. Deploy-order note and an unknown-kind guard (Finding 7).
8. RISK — Empty-body fixtures contaminate the phase 1 gate.
   Fix: not done. `expected: "skip"` in the fixture schema (Finding 8).
9. RISK — A deleted conversation mid-flight becomes a `jevError`.
   Fix: not done. `updateMany` everywhere in the handler (Finding 9).
10. UNKNOWN — `apps/agent/node_modules/eve/docs/README.md` not verified. The repo hook blocks `node_modules` reads.
11. UNKNOWN — No inbox spec found under `apps/app/test`. Phase 3 "Modify: `apps/app/test/*` where the inbox has a spec" targets a file that does not exist.

## Unresolved questions

1. Is a second agent process a supported deployment? `docs/agent.md:85-86` says cross-process overlap is handled by leases. If yes, Finding 5(b) is High; if no, Medium.
2. Should a held injection verdict write `lastIntent = OTHER` on the thread? The inbox then shows an "Other" badge for an attack. The plan does not say.
3. Does the priority rule in `docs/agent.md:59-63` ("what a rep sees first") put a badge above a custom-agent run? Finding 6 assumes not.

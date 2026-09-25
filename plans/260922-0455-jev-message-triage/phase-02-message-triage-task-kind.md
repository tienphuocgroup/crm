---
phase: 2
title: "Message-triage task kind"
status: pending
priority: P1
dependencies: [1]
effort: "2 days"
---

# Phase 2: Message-triage task kind

## Overview

Every stored inbound Zalo text queues a `message-triage` task. The agent's direct
lane runs it with no session and no model, calls Jev once, and writes typed columns
on the `Message` row and the latest verdict on its `MessageThread`. A backfill
script recovers any message the task path missed. Amend the egress rule so the docs
say exactly what leaves to TypeSafe and why.

## Context

- Spec: brainstorm report §6.2.
- Direct-lane handler pattern: `apps/agent/agent/lib/messaging/message-identity-profile.ts`. Its writes use `updateMany` (`:100`), as does `message-send.ts:48`.
- Retry contract on the direct lane: `apps/agent/agent/lib/dispatch.ts:108-110`. `runBrand` returns `retryable` and the handler returns **without** `completeTask`; the lease (`DISPATCH.visible.leaseMs`, 6 min, `dispatch-config.ts:6`) re-claims it, `attempts` increments at claim (`tasks.ts:48,54`), and after `MAX_ATTEMPTS` (3, `agent-tasks.ts:38`) `retireExhausted` stamps the row. A **throw** from a direct handler reaches `reconcileDirect` → `enrichment.settle()`, which no-ops for a task with no contact or company (`enrichment.ts:30`), so a throw is never a retry mechanism.
- Dispatch switch: `apps/agent/agent/lib/dispatch.ts` `handleDirect()` (`:108-149`).
- Task kinds and priorities: `packages/db/src/agent-tasks.ts` (`TASK_KINDS`, `DIRECT_KINDS`, `PRIORITY`). `TASK_KINDS` is also consumed by `packages/telemetry/src/allowlist.ts:1,231` and its spec `:133`. `DIRECT_KINDS` is consumed at `dispatch.ts:18,58,178`, `tasks.ts:29`, `tasks.integration.spec.ts`, `lanes.integration.spec.ts`, `docs/agent.md:52`.
- Queue from the API: `apps/api/src/agent/agent-trigger.service.ts`. `messageIdentityProfileRequested(identityId, client?)` at `:143-148`; `enqueue()` at `:452-529` skips `poke()` when a client is passed (`:519`) and swallows a failed insert unless `required` is true (`:527`); `poke()` is private (`:570`).
- Writer: `apps/api/src/messaging/messaging-writer.service.ts`. `store()` runs its own `this.db.$transaction` (`:111`), inserts with `createMany` + `skipDuplicates` (`:152-171`), and queues the profile task **after** commit at `:617`. `withTasks` is used by `queueOutbound` only (`:252-254`). Unique `[threadId, externalId]` at `schema.prisma:1664`; `incoming.externalId` is a required string (`writer:49`).
- Payload schemas: `packages/validation/src/messaging.ts` `identityProfilePayload`.
- Schema: `packages/db/prisma/schema.prisma` `Message` (`:1642`) and `MessageThread` (`:1614`). Last migration `20260921221500_messaging_profile_checked`. Ordering precedent with nulls: `contacts.service.ts:110`, `deals.service.ts:93`.
- Telemetry: `packages/telemetry/src/events.ts:92` `messagingError`, `allowlist.ts:265-278` `MESSAGING_STAGES` and `permittedStage`, `install.ts:120-124` `COUNTERS` and `bumpCounter`, `docs/telemetry.md` (one daily event, one per failure, never a value from a row).
- Egress rule: `docs/agent.md:262`, `apps/agent/agent/skills/data-boundaries.md` rule 1. No agent tool reads `Message` rows today (only `message-send.ts` and `zalo-connection.ts` touch `messageThread`), so a Zalo body has never left the install before this phase.
- Test pattern: `apps/agent/test/message-identity-profile.integration.spec.ts`; writer spec `apps/api/test/messaging-writer.spec.ts` uses a real `AgentTriggerService`.

## Requirements

- Functional: one task per inbound TEXT message with a non-empty body, deduped on
  message id. Verdict written only above the phase 1 thresholds; below them the
  verdict columns stay null and `triagedAt` is stamped. A sticker, empty body, or a
  message over the per-identity daily cap is stamped and skipped without a Jev call.
  The thread carries the verdict of its newest triaged inbound message, null included.
- Non-functional: the handler never throws. Missing key completes the task with
  "not configured" and stamps nothing. A retryable Jev failure returns without
  completing, so the lease retries up to three times. A 401 returns without
  completing and never stamps. The backfill script recovers every untriaged message
  whatever the cause. Message text never reaches a log, a task outcome or telemetry.

## Architecture

```
Zalo webhook -> MessagingWriterService.store()
             -> inside the $transaction, after createMany count === 1:
                  id = findUniqueOrThrow({ threadId_externalId })
                  queued = agent.messageTriageRequested(id, tx)   required = true
             -> after commit: if (queued) agent.poke()
             -> AgentTask kind=message-triage priority=600 payload={messageId}
dispatch tick / poke -> handleDirect -> runMessageTriage(task)
             -> returns { done: sentence } or { retry: true }
             -> handleDirect: retry ? return : completeTask(task.id, sentence)
runMessageTriage:
  parse payload -> load message + thread + prior inbound TEXT bodies
  gone -> done
  already triaged -> done
  empty body / not TEXT / over daily cap -> stamp triagedAt, write thread null verdict, done
  key missing -> done "not configured", stamp nothing
  judge(state, JEV.triage.questions)
    retryable failure -> retry (no completeTask, no stamp)
    401 -> retry (no stamp; the lease retires it after 3; backfill recovers)
    422 / parse failure -> stamp triagedAt, write thread null verdict, done "unreadable"
  injection >= threshold -> stamp, verdict null, thread null, done "held"
  below thresholds -> stamp, verdict null, thread null, done "uncertain"
  otherwise -> stamp + verdict, thread verdict, done "triaged"
every Message write is updateMany; count 0 -> done "gone", no telemetry
every MessageThread write is updateMany guarded on lastTriagedInboundAt
```

State sent to Jev:

```ts
{
  message: { body: string },
  prior: string[],
  contact: { known: boolean }
}
```

`prior` holds up to `JEV.triage.priorTurns` earlier **inbound** messages from the
same thread, `kind = TEXT`, `status = DELIVERED`, non-null body, newest first, each
cut to `JEV.triage.maxBodyChars`. Rep outbound text is not sent in this release.
No ids, no phone number, no display name, no OA name.

Schema additions:

```prisma
enum MessageIntent {
  BOOKING
  QUESTION
  COMPLAINT
  PRICING
  SPAM
  OTHER
}

model Message {
  intent           MessageIntent?
  urgency          Int?
  language         String?
  triageConfidence Float?
  triagedAt        DateTime?
}

model MessageThread {
  lastIntent            MessageIntent?
  lastUrgency           Int?
  lastTriagedInboundAt  DateTime?
}
```

`urgency` is the integer level 0 to 3 chosen by the highest probability. The
weighted score is not stored. `language` is `vi`, `en` or `other`.

Thread write, the only shape allowed:

```ts
await db.messageThread.updateMany({
  where: {
    id: thread.id,
    OR: [
      { lastTriagedInboundAt: null },
      { lastTriagedInboundAt: { lte: message.sentAt } },
    ],
  },
  data: { lastIntent, lastUrgency, lastTriagedInboundAt: message.sentAt },
});
```

`lastIntent` and `lastUrgency` are null whenever the newest triaged inbound message
has no verdict: skipped, held, uncertain, unreadable. An older message that finishes
later loses the guard and writes nothing.

Per-identity cap: before calling Jev, count inbound messages on this identity with
`triagedAt` in the last 24 h. At or over `JEV.triage.maxPerIdentityPerDay`, stamp and
skip. This bounds paid calls from any single Zalo user.

Priority 600: below `event` (700), `portrait` (800) and `brand` (900), above
`workspace` (500). A triage badge never delays a rep-visible picture or a custom agent run.

## Related Code Files

- Create: `apps/agent/agent/lib/messaging/message-triage.ts`
- Create: `apps/agent/scripts/backfill-message-triage.ts`
- Create: `apps/agent/test/message-triage.integration.spec.ts`
- Create: `packages/db/prisma/migrations/<timestamp>_message_triage/migration.sql` via `bun run db:migrate`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/agent-tasks.ts` (`TASK_KINDS`, `DIRECT_KINDS`, `PRIORITY.messageTriage: 600`)
- Modify: `packages/validation/src/messaging.ts` (`triagePayload = z.object({ messageId: z.string().min(1) })`)
- Modify: `apps/api/src/agent/agent-trigger.service.ts` (`messageTriageRequested(messageId, client?)` returning boolean, `required = true`; `poke()` becomes public)
- Modify: `apps/api/src/messaging/messaging-writer.service.ts` (`store()` only)
- Modify: `apps/agent/agent/lib/dispatch.ts` (`handleDirect` branch with the retry contract)
- Modify: `apps/agent/package.json` (`"backfill:triage": "bun scripts/backfill-message-triage.ts"`)
- Modify: `packages/telemetry/src/install.ts` (`COUNTERS.triage*`), `packages/telemetry/src/allowlist.ts` (`"triage"` in `MESSAGING_STAGES`, counters in `install_daily` properties), `packages/telemetry/test/allowlist.spec.ts`, `docs/telemetry.md`
- Modify: `docs/agent.md` (egress rule 1, the "Two lanes" table, the priority line, backfills list)
- Modify: `apps/agent/agent/skills/data-boundaries.md` (rule 1)
- Modify: `docs/messaging.md` (new section "Triage is a task")
- Modify: `apps/api/test/messaging-writer.spec.ts`, `apps/agent/test/lanes.integration.spec.ts` and `tasks.integration.spec.ts` if they enumerate `DIRECT_KINDS` literally

## Implementation Steps

1. Read `docs/api.md`, `docs/messaging.md`, `docs/agent.md` "Two lanes" and "Backfills", `.agents/skills/prisma-database-setup/SKILL.md`, `.agents/skills/nestjs-trpc/SKILL.md`.
2. Schema. Add the enum and columns above. Run `bun run db:migrate` with name `message_triage`. Run `bun run db:generate`. No new index.
3. Task kind. Add `"message-triage"` to `TASK_KINDS` and `DIRECT_KINDS`. Add `PRIORITY.messageTriage = 600`. Update the priority line and the lanes table in `docs/agent.md`. Fix any spec that lists the kinds literally.
4. Payload schema. Add `triagePayload` and its type to `packages/validation/src/messaging.ts`.
5. API trigger. Add `messageTriageRequested(messageId, client?)` beside `messageIdentityProfileRequested`, dedup subject `{ path: ["messageId"], value: messageId }`, budget 0, `required = true`, returning the `enqueue` boolean. Make `poke()` public. Do not touch the `AgentTaskQueue` interface.
6. Writer. Inside `store()`'s transaction, after `createMany` returns `count === 1` and only when `incoming.kind === TEXT` and the body is non-blank: `const { id } = await tx.message.findUniqueOrThrow({ where: { threadId_externalId: { threadId: thread.id, externalId: incoming.externalId } }, select: { id: true } })`, then `queuedTriage = await this.agent.messageTriageRequested(id, tx)`. Keep `createMany` and the duplicate branch as they are. After the transaction commits, `if (queuedTriage) this.agent.poke()`. A failed enqueue throws out of the transaction, the webhook returns 500, and Zalo redelivers. `grep -rn "typesafe" apps/api/src` must stay empty.
7. Handler. Write `runMessageTriage(task): Promise<{ done: string } | { retry: true }>` with the `SENTENCES` object pattern and the flow in Architecture. The try/catch wraps only the CRM reads and writes and returns `{ done: SENTENCES.internal }` after bumping `messagingError({ stage: "triage" })`. A `judge()` outcome is never inside that catch. A P2025 or a `count === 0` on any write returns `{ done: SENTENCES.gone }` with no telemetry. On every terminal outcome bump the matching `COUNTERS.triage*` counter.
8. Dispatch. Add the `message-triage` branch in `handleDirect()`: `const result = await runMessageTriage(task); if ("retry" in result) return; await completeTask(task.id, result.done);`. Worst case inside the handler is one client call, 21 s, under `DISPATCH.sweep.itemTimeoutMs`.
9. Backfill. Write `backfill-message-triage.ts` on the `backfill-empty-facts.ts` pattern with `--dry`. Selects inbound TEXT messages with `triagedAt IS NULL` and a non-blank body, newest first, capped at 500 per run, and queues a `message-triage` task per row through `scheduleTask` with the same dedup subject. Exits with a sentence when `jevEnabled()` is false. Document it under "Backfills" in `docs/agent.md` and in `docs/messaging.md`: this is the recovery for a missing key, a bad key, and tasks retired after three transient failures.
10. Telemetry. Add `COUNTERS.triageHigh`, `triageMid`, `triageLow`, `triageHeld`, `triageSkipped`, `triageUncertain` and their `install_daily` properties to the allowlist. Add `"triage"` to `MESSAGING_STAGES`. No new event name. Extend `allowlist.spec.ts`. Document in `docs/telemetry.md`.
11. Docs. Rewrite egress rule 1 in `docs/agent.md` and `data-boundaries.md`: "No customer text in a third-party *search or lookup*. `web_search`, `web_fetch` and `research_person` get derived questions only. Model providers are different. The AI Gateway reads full email threads. Since 2026-09-22 TypeSafe (Jev) receives the body of an inbound Zalo message and up to three earlier inbound bodies from the same thread, for triage. No Zalo body left the install before that date. Rep replies are never sent." Add "Triage is a task" to `docs/messaging.md` with the state shape, the injection rule, the cap, the retry contract, the backfill, and a line reserved for TypeSafe's retention and training terms once Luan has them.
12. Deploy order. Add to `docs/messaging.md` and to this phase's risk list: deploy the agent before the API. An old agent's research lane claims every kind not in its `DIRECT_KINDS` (`dispatch.ts:176-180`), so a triage row seen by an old agent becomes an LLM session. Rollback in the same order reversed.
13. Tests. `message-triage.integration.spec.ts` with a stubbed `fetch`: (a) a TEXT message gets its columns and the thread its verdict; (b) a sticker is stamped, the thread verdict is nulled, no fetch happens; (c) missing key returns done, `triagedAt` stays null; (d) a retryable failure returns `{ retry }` and `finishedAt` stays null, then a re-claimed task succeeds; (e) 401 returns `{ retry }` and never stamps; (f) an injection hit stamps, leaves `intent` null and nulls the thread; (g) confidence under the threshold stamps and nulls the thread; (h) two handlers for one thread run under `Promise.all` and the newer message's verdict wins whichever finishes last; (i) the newest message below threshold clears an older badge; (j) the 51st message from one identity in 24 h is stamped and skipped without a fetch; (k) a message deleted mid-flight returns "gone" with no `messagingError` call; (l) no log line and no telemetry call contains the body. Writer spec: a stored TEXT message queues exactly one `message-triage` row, a duplicate delivery queues none, a sticker queues none, and a failing enqueue rolls back the message and throws. Backfill spec: `--dry` counts, a live run queues one task per untriaged message and none for triaged ones.
14. Run `bun run check-types`, `bun run lint`, `bun run --filter=agent test`, `bun run --filter=api test`, `bun run --filter=@crm/telemetry test`.

## Success Criteria

- [ ] An inbound Zalo text has `intent`, `urgency`, `language`, `triageConfidence` and `triagedAt` after one dispatch tick.
- [ ] The thread's `lastIntent` and `lastUrgency` follow the newest triaged inbound message, null included, under concurrent handlers.
- [ ] A duplicate webhook delivery queues no second triage task and rolls nothing back.
- [ ] Missing key: task completes with "not configured", nothing stamped, nothing thrown; `backfill:triage` later queues those messages.
- [ ] A retryable Jev failure leaves the task open for the lease to re-claim; after three, `backfill:triage` recovers it.
- [ ] The 51st message from one identity in a day is skipped without a paid call.
- [ ] `grep -rn "typesafe\|api.typesafe.ai" apps/api/src` is empty.
- [ ] No message body in any log object, task outcome or telemetry property. Test (l) asserts it.
- [ ] Egress rule amended in both docs with the date and the exact list of what leaves.
- [ ] Deploy-order note present in `docs/messaging.md`.
- [ ] All suites pass.

## Risk Assessment

- **Blocked on the messaging plans.** The writer and schema are uncommitted on this branch. Mitigation: `blockedBy` in `plan.md`; phase 1 proceeds meanwhile.
- **Three attempts then retired.** A long TypeSafe outage retires tasks. Mitigation: `backfill:triage` is the documented recovery; nothing is lost because `triagedAt` stays null.
- **Deploy order.** API before agent turns triage rows into LLM sessions. Mitigation: step 12.
- **Threshold drift.** A model bump changes answers. Mitigation: pinned id; `jev:eval` re-run on every bump.
- **Injection.** A customer message that instructs the classifier is held with a null verdict, never badged. Mitigation: the noul gated in phase 1, and null on a hit.
- **Retention.** TypeSafe's retention and training terms for `state` are not yet recorded. Mitigation: open question in `plan.md`; the `docs/messaging.md` line is filled before the key goes into production.

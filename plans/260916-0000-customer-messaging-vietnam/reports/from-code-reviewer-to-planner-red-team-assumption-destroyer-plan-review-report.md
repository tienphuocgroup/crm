# Red-team plan review: Zalo Official Account chat (assumption destroyer)

Reviewer role: Fact Checker + Contract Verifier (Standard tier).
Plan: `plans/260916-0000-customer-messaging-vietnam/` (plan.md, phases 1 to 4).
Method: every cited file:line grepped against `F:\repos\crm` on 2026-09-16. No build, lint or test run.

## Finding 1: `scheduleTask()` is not an upsert on `(kind, subject)`. The refresh chain dies on its first tick.

- **Severity:** Critical
- **Location:** Phase 2, section "Agent handler" (steps 3 and 6, and the sentence "`scheduleTask()` is an idempotent upsert on `(kind, subject)`"). Also Phase 4 "Agent handler" step 7.
- **Flaw:** `scheduleTask()` has no `subject` parameter. Its dedupe key is `kind + contactId + companyId + dealId` with `finishedAt: null`. A `message-token-refresh` task carries none of the three ids, so `findFirst` matches ANY open task of that kind. The task that is running is still open: `handleDirect()` calls `runMessageTokenRefresh()` first and `completeTask()` after it returns. The rebook therefore finds the running task, updates its `dueAt`, returns. `completeTask()` then sets `finishedAt` on that same row. No new row exists.
- **Failure scenario:** Owner connects the OA. The API books one refresh task. The agent runs it, rebooks by updating the running row, then completes the running row. Zero open refresh tasks remain. The access token expires. Every send returns a 401. The composer shows "The Zalo token needs a reconnect." The plan's own test "not due rebooks at `tokenExpiresAt - refreshAheadMs`" passes if it only checks the row count before `completeTask()`.
- **Evidence:**
  - `apps/agent/agent/lib/tasks.ts:138-147` input type: `contactId?, companyId?, dealId?, kind, reason, payload?, dueAt, priority?, budget?`. No `subject`.
  - `apps/agent/agent/lib/tasks.ts:149-157` `findFirst({ where: { kind, finishedAt: null, contactId: undefined, companyId: undefined, dealId: undefined } })`.
  - `apps/agent/agent/lib/tasks.ts:160-165` existing match: `update({ data: { dueAt, reason } })`. Payload is not updated.
  - `apps/agent/agent/lib/tasks.ts:87-100` `completeTask` sets `finishedAt` on `{ id, finishedAt: null }`.
  - `apps/agent/agent/lib/dispatch.ts:133-135` pattern the plan copies: `await completeTask(task.id, await runSlackChannelJoin(task.payload))`. The inner call runs while the row is open.
  - Only caller today: `apps/agent/agent/tools/schedule_recheck.ts:41` passes `contactId`, so the self-match never fired before.
  - Plan quote (phase 2): "`scheduleTask()` is an idempotent upsert on `(kind, subject)`. Use `subject: { path: ["accountId"], value: accountId }`". This does not typecheck.
  - Source of the error: `plans/reports/scout-260916-0000-messaging-codebase-touchpoints-report.md:42` calls it an "idempotent upsert" with no key stated.
- **Suggested fix:** Add to `scheduleTask()` an optional `subject: { path, value }` filter on `payload` (mirror `enqueue()` at `agent-trigger.service.ts:388-395`) and an optional `exceptId` that the handler passes as `task.id`. Or complete the running task first and rebook after. Add a test that counts open `message-token-refresh` rows AFTER `handleDirect()` returns, and expects exactly one with a new id.

## Finding 2: Slack OAuth is not a Nest controller. The plan copies a pattern that does not exist, and its error redirect never renders.

- **Severity:** High
- **Location:** Phase 2, section "Architecture" ("as Slack's OAuth is") and section "OAuth" (callback redirect "`?error=<code>` on failure, following `connectErrorOf`").
- **Flaw:** Slack OAuth runs inside Better Auth's `genericOAuth` plugin in `packages/auth`. `apps/api/src/slack/` has no controller, no state row, no callback. The only documented vendor-client exception in the API is the exchange-rate fetcher. Second consequence: `connectErrorOf(query, provider)` returns the error only when `query.provider === provider`. Slack, Google and Microsoft get `?provider=<name>` from Better Auth's `errorCallbackURL`. The plan's callback redirects with `?error=<code>` and no `provider`. The Zalo page calls `connectErrorOf(query, "zalo")`, gets `undefined`, and shows nothing.
- **Failure scenario:** The Zalo token exchange fails. The callback redirects to `/<slug>/settings/connections/zalo?error=exchange`. The page renders the normal "Connect" state. The owner clicks Connect again and again. Nobody sees the error.
- **Evidence:**
  - `packages/auth/src/auth.ts:6` `import { genericOAuth } from "better-auth/plugins/generic-oauth"`; `:30-32` `slackRedirectUri = new URL("/api/auth/oauth2/callback/slack", ...)`.
  - `ls apps/api/src/slack/`: `slack-channels.service.ts, slack-config.ts, slack-connection.service.ts, slack.contracts.ts, slack.module.ts, slack.router.ts`. No controller.
  - `docs/api.md:31-32` "About to add a vendor client to `apps/api`? ... One documented exception, for timing: the exchange-rate fetcher".
  - `apps/app/app/(app)/[slug]/settings/connections/oauth-connection-page.tsx:21-23` `connectErrorOf(query, provider) { return first(query.provider) === provider ? first(query.error) : undefined }`.
  - `apps/app/app/(app)/[slug]/settings/connections/slack/slack-connect-button.tsx:25` `errorCallbackURL: ...settings/connections/slack?provider=slack`. Same at `google-connection.tsx:154`, `microsoft-connection.tsx:92`.
  - The API has no workspace slug at hand for the redirect: `grep -rl slug apps/api/src` hits only `workspace/workspace.contracts.ts` and `workspace/workspace.service.ts`. The plan does not say where `/connect` gets `<slug>` from.
- **Suggested fix:** Redirect with `?provider=zalo&error=<code>`. Pass the return URL into `/connect` as a query parameter, validate it against `APP_URL`, and store it in the `Verification` row beside the verifier. Rewrite the "Architecture" sentence: the Zalo exchange is a new, second documented exception in `docs/api.md`, not a copy of Slack. Evaluate Better Auth `genericOAuth` for Zalo before building a controller; the plan does not mention it.

## Finding 3: Refresh constants are fixed before fact D. A single timeout kills the refresh chain and blocks every rep.

- **Severity:** High
- **Location:** Phase 2, "Related Code Files" (`MESSAGING = { zalo: { refreshEveryMs: 6 * HOUR_MS, refreshAheadMs: 12 * HOUR_MS ... } }`) and "Agent handler" step 5 ("Failure: set `tokenError` to the vendor message. Do not rebook.").
- **Flaw:** Step 5 treats every failure the same. A network timeout from `AbortSignal.timeout(10s)`, a 5xx from Zalo, and an `invalid_grant` on a burned refresh token all write `tokenError` and stop the chain. `eligibility()` puts `tokenError` second in precedence, so the composer blocks with "The Zalo token needs a reconnect." for a 10-second blip. The only recovery is an owner or admin reconnecting. The constants `6h` and `12h` are also chosen before fact D is known. The research report records the access token at about 24 to 25 hours and reports refresh tokens dying within 24 hours to a few days in the field.
- **Failure scenario:** Zalo's token endpoint is slow one night. The refresh times out. `tokenError = "The operation was aborted"`. No rebook. Every rep sees "The Zalo token needs a reconnect." the next morning. The refresh token is still valid. An admin must reconnect anyway.
- **Evidence:**
  - Plan quote (phase 2 step 5): "Failure: set `tokenError` to the vendor message. Do not rebook. Return the message."
  - Plan quote (phase 2 "Shared package"): blocked precedence "Zalo is disconnected.", "The Zalo token needs a reconnect.", ...
  - `plans/reports/research-260916-0000-zalo-messaging-vietnam-report.md:8` "access_token ~24-25h ... refresh_token single-use, docs claim 3-month validity but developer community reports report much shorter/unstable actual expiry"; `:124` "multiple developer-community threads report tokens invalidated after 24h-few days".
  - Phase 1 "Verify before coding" row D lists "Access token lifetime. Refresh token lifetime" as unanswered.
- **Suggested fix:** Split failures: `invalid_grant` or an explicit 4xx that names the token sets `tokenError` and stops. Timeout, network and 5xx rebook with backoff and do not set `tokenError`. Cap the retries. Derive `refreshAheadMs` from the observed `expires_in` at connect time, not from a constant chosen before fact D.

## Finding 4: `CreateContactSheet` has no prefill props and no created-id callback. "Create contact" from the inbox cannot work as written.

- **Severity:** High
- **Location:** Phase 3, section "UI" ("opens `create-contact-sheet.tsx` prefilled with `displayName` split into first and last name, then calls `linkContact` with the new id").
- **Flaw:** The component signature is `CreateContactSheet({ companyId }: { companyId?: string })`. No prefill. On success it invalidates, toasts, closes its own nuqs-driven sheet, resets state, and calls `openRecord({ kind: "contact", id })`. Nothing returns the new id to a caller. The plan's "Modify" list does not include this file. The file lives in a route folder; `components/crm/messaging/link-contact-dialog.tsx` would import from `app/(app)/[slug]/contacts/`.
- **Failure scenario:** The rep clicks "Create contact" on an unmatched thread. The sheet opens empty. The rep types the name again. On save the contact record sheet opens over the inbox. The thread is still unmatched. `linkContact` is never called.
- **Evidence:**
  - `apps/app/app/(app)/[slug]/contacts/create-contact-sheet.tsx:45` `export function CreateContactSheet({ companyId }: { companyId?: string })`.
  - `:79-91` `onSuccess: ... await setOpen(null); setFirstName(""); ... openRecord({ kind: "contact", id: contact.id })`.
  - Contract verifier, callers of `CreateContactSheet`: 1. `apps/app/app/(app)/[slug]/contacts/page.tsx:35` `<CreateContactSheet />`.
- **Suggested fix:** Add `create-contact-sheet.tsx` to the Phase 3 "Modify" list with new optional props `initialFirstName`, `initialLastName`, `onCreated(id)`, and an `openRecordOnSuccess` switch. Or build the create form inside `LinkContactDialog` with `contacts.create` directly. State which one.

## Finding 5: Phase 4 reimplements `withTasks()` and makes `poke()` public.

- **Severity:** Medium
- **Location:** Phase 4, "Related Code Files" (`agent-trigger.service.ts`: "a public `pokeAfterCommit()` because `enqueue()` skips the poke when a client is passed, line 429") and "Writer: `queueOutbound`" step 5.
- **Flaw:** `AgentTriggerService.withTasks(work)` already exists for exactly this case. It opens the transaction, hands the caller a `tx` and an `AgentTaskQueue`, tracks whether a row was created, and pokes once after commit. The plan instead has the writer own its transaction, pass `tx` into a new method, and then call a new public `pokeAfterCommit()`. That is a second copy of the same mechanism with `poke()` exposed to every service.
- **Failure scenario:** Two mechanisms drift. A later change to `withTasks` (for example a batched poke) misses the messaging path. A future caller calls `pokeAfterCommit()` before its own commit and the agent claims nothing. The plan's own risk line already names this hazard.
- **Evidence:**
  - `apps/api/src/agent/agent-trigger.service.ts:110-136` `withTasks<Result>(work: (tx, queue: AgentTaskQueue) => Promise<Result>)`: `$transaction`, `queued = queued || created`, `if (queued) this.poke()`.
  - `:138-160` `queueSlackChannelJoin(..., client?)` → `enqueue(..., true, client)`. This is the shape `messageSendRequested` should take, wired into `AgentTaskQueue`.
  - `:480` `private poke(): void`.
  - Plan quote: "a public `pokeAfterCommit()` because `enqueue()` skips the poke when a client is passed, line 429".
- **Suggested fix:** Add `messageSendRequested(messageId, contactId)` to the `AgentTaskQueue` interface. `queueOutbound` runs as `this.agent.withTasks(async (tx, queue) => { ... await queue.messageSendRequested(...) })`. Drop `pokeAfterCommit()`.

## Finding 6: Receipt lookup by `externalId` has no usable index. Every delivery and seen event scans `message`.

- **Severity:** Medium
- **Location:** Phase 3, "Writer service" (`receipt(event)` "finds the `OUTBOUND` row by `externalId` on any thread of that account") and Phase 2 "Data model" (`Message` indexes).
- **Flaw:** The only index containing `externalId` is `@@unique([threadId, externalId])`. Its leading column is `threadId`. A `WHERE externalId = ? AND thread.accountId = ?` query cannot use it. Zalo sends `user_received_message` and `user_seen_message` for every outbound message, so two full scans per reply.
- **Failure scenario:** After 200k messages, each receipt event runs a sequential scan inside the webhook request. The 500 ms budget in the plan's non-functional requirement is exceeded. Zalo retries the event. The scan runs again.
- **Evidence:**
  - Phase 2 schema: `@@unique([threadId, externalId])`, `@@index([threadId, queuedAt])`, `@@index([status])`. No `externalId`-leading index.
  - Phase 3 requirement: "the webhook answers in under 500 ms".
- **Suggested fix:** Add `@@index([externalId])` on `Message`, or resolve the thread first from the event's user id (`identity → thread`) and use the existing unique index.

## Finding 7: The plan "extends" test files that do not exist.

- **Severity:** Medium
- **Location:** Phase 3 "Tests" (`apps/api/test/activities.spec.ts or the existing timeline spec`, `apps/app/test/activity-presentation.spec.ts`), Phase 4 "Tests" (`apps/api/test/telemetry-rollup.spec.ts`).
- **Flaw:** None of the three files exist. No timeline spec exists in `apps/api/test`. The engineer reads "extend" and searches for a file that is not there.
- **Failure scenario:** The `messages` timeline filter and the `MESSAGE` presentation entry ship without a test because the plan pointed at a file to extend rather than a file to create. Success criterion "the listed tests pass" is met vacuously.
- **Evidence:**
  - `ls apps/api/test | grep -i "timeline\|activit\|telemetry\|rollup"` returns nothing.
  - `ls apps/app/test/activity-presentation.spec.ts` → No such file.
  - `ls apps/api/test/telemetry-rollup.spec.ts` → No such file. The allowlist test that exists is `packages/telemetry/test/allowlist.spec.ts`.
  - `apps/agent/test/capabilities.spec.ts` exists (VERIFIED). `apps/api/test/record-delete.spec.ts:123` exists (VERIFIED).
- **Suggested fix:** Mark the three as "Create". Point the allowlist assertion at `packages/telemetry/test/allowlist.spec.ts`.

## Finding 8: Adding `MESSAGE` to `ActivityType` has a blast radius the plan does not list.

- **Severity:** Medium
- **Location:** Phase 2 "Data model" ("`enum ActivityType` gains `MESSAGE`") and Phase 4 "Telemetry".
- **Flaw:** The enum is consumed exhaustively in three places the plan does not mention. `activities_by_type` in the daily rollup keys by `Object.values(ActivityType)`, so `MESSAGE` appears in telemetry the moment the enum changes, and `docs/telemetry.md` "Adding a property" requires it to be documented. `COMPOSABLE_TYPES` and `NOTE_TYPES` are explicit lists; the plan must state that `MESSAGE` is excluded from both, or a rep can compose a `MESSAGE` activity by hand with no thread.
- **Failure scenario:** Phase 2 merges. The next `install_daily` carries `activities_by_type.MESSAGE` with no doc row. A later reviewer flags an undocumented telemetry property. Separately, nobody decides whether `MESSAGE` belongs in `NOTE_TYPES`, and the "notes" timeline filter behaves by accident.
- **Evidence:**
  - `apps/api/src/telemetry/rollup.service.ts:551-554` `activities_by_type: countsOf(types..., Object.values(ActivityType))`; `:606-614` `countsOf` fills every key.
  - `apps/api/src/activities/activities.contracts.ts:4-10` `COMPOSABLE_TYPES = [NOTE, CALL, EMAIL, MEETING, TASK]`.
  - `apps/api/src/activities/activities.service.ts:60-63` `NOTE_TYPES = [NOTE, CALL, EMAIL, ...]`.
  - `apps/app/lib/activity-presentation.ts:11` `Record<ActivityType, ...>` (plan covers this one).
- **Suggested fix:** Add the rollup row to Phase 4 telemetry docs. State in Phase 2 that `MESSAGE` is not composable and not a note type, and add one assertion.

### Verification Results

- Tier: Standard (Fact Checker + Contract Verifier)
- Claims checked: 58
- VERIFIED: 51
- FAILED: 6
- UNVERIFIED: 1

FAILED claims:

1. Phase 2 "Agent handler": "`scheduleTask()` is an idempotent upsert on `(kind, subject)`" and "`subject: { path: ["accountId"], value: accountId }`". Actual: `apps/agent/agent/lib/tasks.ts:138-157` keys by `kind + contactId + companyId + dealId`; no `subject` input.
2. Phase 2 "Architecture": "The OAuth exchange ... are the one documented exception to 'no vendor client in the API', as Slack's OAuth is." Actual: Slack OAuth is Better Auth `genericOAuth` in `packages/auth/src/auth.ts:6,30-32`; the documented exception is the rate fetcher at `docs/api.md:31-32`.
3. Phase 2 "OAuth": callback redirect "`?error=<code>` on failure, following `connectErrorOf`". Actual: `oauth-connection-page.tsx:21-23` requires `?provider=zalo` as well (`slack-connect-button.tsx:25`).
4. Phase 3 "UI": `create-contact-sheet.tsx` "prefilled with `displayName`". Actual: `create-contact-sheet.tsx:45` accepts only `{ companyId? }`; no prefill, no created-id callback (`:79-91`).
5. Phase 3 "Tests": "`apps/api/test/activities.spec.ts` or the existing timeline spec" and `apps/app/test/activity-presentation.spec.ts`. Actual: neither exists; no timeline spec exists in `apps/api/test`.
6. Phase 4 "Tests": `apps/api/test/telemetry-rollup.spec.ts`. Actual: does not exist. `packages/telemetry/test/allowlist.spec.ts` exists.

UNVERIFIED:

1. `@carbon/icons-react` exports `SendAlt`. `node_modules` is absent in the checkout. The library is the one in use (`apps/app/package.json:15`, `packages/ui/package.json:20`, 59 importing files in `apps/app`). The plan already marks this UNKNOWN.

VERIFIED with a correction:

- Phase 2 "Agent handler" step 1: `parse(schema, value, message)` lives in `packages/validation/src/index.ts:21-25`, not in the agent. The agent imports it (`apps/agent/agent/lib/slack-join-task.ts:1`). Usable as written.
- Phase 2 "Tests": "`globalThis.fetch` stubbed as `slack-membership.integration.spec.ts` does" cited for an API test. The file is `apps/agent/test/slack-membership.integration.spec.ts:37,46`, in the agent test tree. The pattern is copyable.
- Phase 2 "Related Code Files": `add-connection-dialog.tsx:45` is the Google `CatalogRow`; the Slack row starts at `:52`. Near enough.
- Phase 3: "the global guard requires a session". No `APP_GUARD` in the repo; the guard comes from `BetterAuthModule.forRoot` at `apps/api/src/app.module.ts:48` (`@thallesp/nestjs-better-auth`), and `@AllowAnonymous()` from the same package (`tracking.controller.ts:22`). Claim holds.

VERIFIED anchors (file:line): `agent-trigger.service.ts:363` enqueue, `:375` client param, `:410` hardcoded `dueAt: new Date()`, `:429` poke skip; `tasks.ts:138` scheduleTask; `dispatch.ts:104` handleDirect, `:149` fallthrough text; `agent-tasks.ts:1,18,37` TASK_KINDS/DIRECT_KINDS/PRIORITY; `packages/db/package.json:8` `./agent-tasks`; `packages/validation/src/index.ts:5` schemas; `env.validation.ts:73`; `turbo.json:47`; `apps/api/turbo.json:21,39`; `apps/agent/turbo.json:17,31`; `capabilities.ts:37` fromEnv; `schema.prisma:178-186` ActivityType, `:146` Verification, `:1077` Activity, `:1099-1100` emailThreadId shape; `slack-connection.service.ts:37,256`; `cache.ts:33`; `connections/page.tsx:36,165`; `oauth-connection-page.tsx:21`; `mailbox-thread-writer.spec.ts:14`; `brand-logos/stripe.tsx`; `packages/auth/src/env.ts:47` pair(); `apps/agent/package.json:12` dispatch script; `thread-writer.service.ts:257` project; `activity-stamp.service.ts:27` touch, `:89` targetsOf; `contacts.service.ts:348,359`; `activities.contracts.ts:14`; `activities.service.ts:100,247`; `app-icon-rail.tsx:50-68`; `activity-presentation.ts:15`; `tracking.controller.ts:215-235`; `create-app.ts:15`; `search.router.ts:15`; `record-delete.spec.ts:123`; `docs/connections.md:134`; `timeline.tsx:177-178` infinite query; `agent-builder-chat.tsx:178` pathKey; `rollup.service.ts:568`; `events.ts:81`; `allowlist.ts:224-226` permittedTaskKind; `agent-trigger.stub.ts`; `contact-sheet.tsx:114-139,183-188`; `domain-error.middleware.ts:49`; `docs/api.md:263`; `docs/agent.md:46`; `AGENTS.md:16`.

Contract verifier, interface changes the plan proposes:

- `AgentTriggerService.enqueue()` gains optional `dueAt`. Callers of `this.enqueue(`: 9. `apps/api/src/agent/agent-trigger.service.ts:40, 48, 58, 66, 76, 85, 95, 144, 240`. Optional field on the task object; no caller changes.
- `scheduleTask()` needs a subject filter and an exclude-id (Finding 1). Callers: 1. `apps/agent/agent/tools/schedule_recheck.ts:41`.
- `TASK_KINDS` gains two kinds. Consumers that key by it: `packages/telemetry/src/allowlist.ts:1,224-226` (`permittedTaskKind`), `apps/api/src/telemetry/rollup.service.ts:309, 337, 592`. New kinds count automatically. Claim "already key by `TASK_KINDS`" VERIFIED.
- `DIRECT_KINDS` gains two kinds. Consumers: `apps/agent/agent/lib/dispatch.ts:55` (`only: DIRECT_KINDS`), `:160` (`except: DIRECT_KINDS`), `apps/agent/agent/lib/tasks.ts:29` re-export. `docs/agent.md:52` table still lists only `brand, portrait` (pre-existing drift; slack kinds are already missing).
- `ActivityType` gains `MESSAGE`. Exhaustive consumers: `apps/app/lib/activity-presentation.ts:11` (compile break, plan covers), `apps/api/src/telemetry/rollup.service.ts:551-554` (auto-includes, plan omits), `apps/api/src/activities/activities.contracts.ts:4-10` and `activities.service.ts:60-63` (explicit lists, plan omits).
- `TIMELINE_FILTERS` gains `messages`. Consumers: `apps/api/src/activities/activities.service.ts:104-110` (`timelineCounts` tuple), `:247-263` (`filterClause` switch, exhaustive; compile break without the case), `apps/app/components/crm/timeline/timeline.tsx:204-206`, `timeline-search-params.ts:6-7`.
- `CreateContactSheet` props change (Finding 4). Callers: 1. `apps/app/app/(app)/[slug]/contacts/page.tsx:35`.
- `Activity` gains `messageThreadId @unique`. Shape matches `emailThreadId` at `schema.prisma:1099-1100` and back-relation `activity Activity?` at `:1162`. VERIFIED. `ENTRY_SELECT` at `activities.service.ts:40-46` and `timeline-entry.tsx:158-161` are the copy targets. VERIFIED.

## Issues

1. BROKEN — `scheduleTask()` self-matches the running task. The refresh chain dies after one run. Fix: not done. See Finding 1.
2. BROKEN — The callback error redirect omits `provider=zalo`. `connectErrorOf` returns `undefined`. No error renders. Fix: not done. See Finding 2.
3. BROKEN — `CreateContactSheet` has no prefill and no created-id callback. "Create contact" from the inbox cannot link. Fix: not done. See Finding 4.
4. RISK — One refresh timeout sets `tokenError` and stops rebooking. Every rep is blocked until an admin reconnects. Fix: not done. See Finding 3.
5. RISK — Receipt lookup by `externalId` scans `message`. The 500 ms webhook budget fails at scale. Fix: not done. See Finding 6.
6. RISK — `pokeAfterCommit()` duplicates `withTasks()`. Two poke mechanisms drift. Fix: not done. See Finding 5.
7. NOT DONE — Three test files the plan "extends" do not exist. Fix: not done. See Finding 7.
8. NOT DONE — `MESSAGE` enters `activities_by_type` telemetry undocumented and is not excluded from `COMPOSABLE_TYPES` and `NOTE_TYPES`. Fix: not done. See Finding 8.
9. UNKNOWN — `SendAlt` export in `@carbon/icons-react`. `node_modules` is absent. The plan marks it UNKNOWN.

Status: DONE_WITH_CONCERNS
Summary: The plan's line anchors are mostly accurate, but three load-bearing claims are false: `scheduleTask()` semantics (kills token refresh), the Slack OAuth precedent and error-redirect contract, and `CreateContactSheet` prefill. Fix Findings 1 to 4 before Phase 2 starts.

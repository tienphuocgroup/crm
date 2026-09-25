# Zalo messaging — anti-slop lint cleanup

Date: 2026-09-25
Checkout: `scratchpad/merge-dev`, branch `tmp/zalo-merge-dev`. Not committed.
Read first: `AGENTS.md`, `docs/messaging.md`, `tools/oxlint/anti-slop/rules/*`,
`tools/oxlint/anti-slop/shared/dictionary-types.ts`, commit `6e7cd38` (worked example).

## Result

`bun run lint:slop`: 49 errors → 0.

## Pattern per rule

### no-known-value-widening (10)

Literal tables drop the `Record<…>` annotation and gain `satisfies`. An open-string
table gains an `Object.hasOwn` key-narrowing predicate. An anonymous return object
gains a named type. A `: unknown` return becomes a parsed type.

- `apps/app/lib/messaging.ts` — `MESSAGE_KIND_KEY`, `MESSAGE_STATUS_KEY` use
  `satisfies`; `nameParts` returns the new `NameParts`.
- `apps/app/components/crm/messaging/thread-list.tsx` — `FILTER_LABEL_KEY`,
  `EMPTY_KEY` use `satisfies`; `EmptyCopyKeys` names the entry shape.
- `apps/app/app/(app)/[slug]/settings/connections/zalo/zalo-connect-button.tsx` —
  `connectErrorMessages(t)` becomes the `CONNECT_ERROR_KEYS` table plus
  `isConnectErrorCode()`. Same shape as `slack-connect-button.tsx`.
- `apps/api/src/messaging/zalo/zalo-webhook.controller.ts` — `KINDS` uses
  `satisfies` plus `isMessageKindEvent()`; `jsonOf` returns `ZaloJson | null`.
- `apps/api/src/messaging/zalo/zalo-oauth.service.ts` — `safeJson` returns
  `ZaloJson | null`.

### no-conditional-empty-object-spread (13)

Prisma `data` and `where` fields take `undefined`, because Prisma ignores an
`undefined` field. Objects that a later `Object.keys()` test reads are built in
statements.

- `apps/agent/agent/lib/tasks.ts` — `payload`, `id` and the update `payload`
  become `undefined` fields.
- `apps/agent/agent/lib/messaging/message-send.ts` — `deliveredAt: delivered?.at`,
  `readAt: seen?.at`.
- `apps/agent/agent/lib/messaging/message-identity-profile.ts` —
  `displayName ?? undefined`, `avatarUrl ?? undefined`. `cleaned()` returns `null`
  or a non-empty string, so the mapping is exact.
- `apps/agent/agent/lib/messaging/message-token-refresh.ts` — `exceptId` passes
  through.
- `apps/agent/agent/lib/messaging/zalo-client.ts` — the `code` failure is built in
  two statements with the named `ZaloCodeFailure`, because `vendorMessage` must
  stay absent for an empty string.
- `apps/api/src/messaging/messaging.service.ts` — one `cursor` binding feeds
  `cursor` and `skip` in `threads()` and `messages()`.
- `apps/api/src/messaging/messaging-writer.service.ts` — `fresh` is built in
  statements with the named `IdentityRefresh`, because `Object.keys(fresh).length`
  gates the update.
- `apps/api/src/messaging/zalo/zalo-webhook.controller.ts` — the attachment
  candidate is built in statements.
- `apps/api/test/record-delete.spec.ts` — the contact draft spreads a populated
  object, not an empty one.

### no-runtime-typeof (6)

Zod parses at the boundary.

- `packages/validation/src/messaging.ts` — `flag` moves the three `typeof` branches
  into three union members, each with its own transform. Output stays `boolean`.
- `apps/api/src/messaging/zalo/zalo-raw-body.ts` — `isEmptyBody()` becomes the
  `emptyParsedBody` schema: `null`, an empty `Buffer`, an empty array, or an object
  with no keys. Every other present value still throws `ParsedBodyError`.
- `apps/api/src/messaging/zalo/zalo-webhook.controller.ts` — `candidateAccountIds`
  filters on `value !== undefined`, because the envelope schema already types the
  three fields `string | undefined`. `errorName` no longer reads `typeof`.
- `apps/agent/test/message-token-refresh.integration.spec.ts` — `attemptOf` parses
  a `Prisma.JsonValue` with `z.object({ attempt: z.number() })`.

The webhook order is unchanged: content type, raw bytes, signature over the wire
bytes, timestamp, then a fast 200. `rawBody()` still reads `request.rawBody` first
and never re-serialises. A non-JSON content type still answers 401.

### no-unknown-parameters (11)

Each parameter gets a parsed or named type. `cause` is the rule's own exemption for
an error value.

- `packages/validation/src/messaging.ts` gains `zaloJson = z.json()`. Three call
  sites derive `type ZaloJson = z.infer<typeof schemas.messaging.zaloJson>`:
  `zalo-webhook.controller.ts`, `zalo-oauth.service.ts`, `zalo-client.ts`.
- `apps/agent/agent/lib/messaging/zalo-client.ts` — `call()` parses the response
  body with `zaloJson` once, and `read` receives `ZaloJson`. A parse failure still
  returns the `unparsed` failure.
- `apps/api/src/messaging/incoming-message.ts` — new `AttachmentCandidate` types
  `acceptAttachments` and `hostLabelOf`.
- `apps/api/src/messaging/messaging.service.ts` — `isUniqueViolation(cause)` and
  the `.catch(cause)` handler.
- Tests: fixture builders take `ZaloJson`; fetch stubs take `URL | RequestInfo` or
  `Request | URL | string`.

### no-unsafe-dictionary-type (3)

- `apps/api/test/zalo-webhook.spec.ts` — `TextEventOverrides` and
  `TextMessageOverrides` replace `Record<string, unknown>`.
- `apps/api/test/zalo-oauth.spec.ts` — `ZaloQuery` replaces
  `Record<string, unknown>`. It keeps `string | string[]`, because two tests send a
  repeated query key.

## Files changed

22 files, +189 −127.

apps/agent: `agent/lib/tasks.ts`, `agent/lib/messaging/{message-send,
message-identity-profile, message-token-refresh, zalo-client}.ts`,
`test/{message-send.integration, message-identity-profile.integration,
message-token-refresh.integration, zalo-client}.spec.ts`.

apps/api: `src/messaging/{incoming-message, messaging.service,
messaging-writer.service}.ts`, `src/messaging/zalo/{zalo-webhook.controller,
zalo-oauth.service, zalo-raw-body}.ts`, `test/{zalo-webhook, zalo-oauth,
record-delete}.spec.ts`.

apps/app: `lib/messaging.ts`, `components/crm/messaging/thread-list.tsx`,
`app/(app)/[slug]/settings/connections/zalo/zalo-connect-button.tsx`.

packages/validation: `src/messaging.ts`.

No catalog file changed. No rule suppressed. No lint config changed. No comment added.

## Verification

| Command | Result |
| --- | --- |
| `bun run lint:slop` | 0 errors (was 49) |
| `bun run check-types` | 13 tasks pass |
| `bun run lint` | 9 tasks pass, 3 pre-existing warnings |
| `bun run i18n:check` | 0 findings, 0 ratcheted |
| `apps/api` `bun test` | 525 pass, 0 fail |
| `apps/agent` `bun test` | 450 pass, 0 fail |
| `apps/app` `bun test` | 239 pass, 0 fail |
| `packages/validation` `bun test` | 5 pass, 0 fail |

## Issues

1. RISK — `errorName()` in `zalo-webhook.controller.ts` logs `"NonError"` for a
   thrown non-Error. It logged `typeof error` before. The log string differs only
   in that branch. No test covers it, and every throw on that path is an `Error`.
   Fix: not done. A `typeof` copy through zod is worse code than the rule bans.
   I caused this.
2. RISK — `hostLabelOf()` no longer re-parses the candidate with a zod object. It
   reads `candidate.url` from the named `AttachmentCandidate`. The one caller
   always supplies a string url, so the dropped-host log is unchanged.
   Fix: not done. The named contract is what the rule asks for. I caused this.
3. RISK — `zaloJson` validates the whole JSON body of every webhook event and
   every Zalo response. Bodies are capped at 64 KB, so the cost is small. The
   outcome is unchanged: an unreadable body still gives 401 or `unparsed`.
   Fix: not done. I caused this.
4. BROKEN — `bun run lint:dead` fails. 28 unused type exports and one duplicate
   export. Every one sits in a file this work did not create. None of the new
   exports (`zaloJson`, `AttachmentCandidate`, `NameParts`) appear in the list.
   Fix: not done. It is out of this task's scope.

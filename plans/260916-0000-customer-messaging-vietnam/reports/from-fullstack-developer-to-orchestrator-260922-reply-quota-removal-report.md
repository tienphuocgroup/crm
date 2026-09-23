# Reply quota removal — 2026-09-22

Fact A is re-verified against the official Zalo hub. Free consultation replies inside the
48-hour window are unlimited since 2026-01-01. The send response dropped `remain` after
2026-03-01. The quota is removed everywhere. The 48-hour window block is unchanged.

## Files changed

| File | Change |
| --- | --- |
| `packages/db/src/messaging.ts` | Deleted `freeRepliesPerWindow`, `BLOCKED_REASONS.quotaUsed`, `repliesLeft`, `outboundSinceLastInbound`, the quota branch |
| `packages/db/test/messaging.spec.ts` | Removed 5 quota tests. Kept window, never-wrote, disconnected, token-error, precedence |
| `apps/api/src/messaging/messaging-writer.service.ts` | Deleted `repliesSince()` and its call in `queueOutbound` |
| `apps/api/src/messaging/messaging.service.ts` | Stopped counting and returning `repliesLeft` |
| `apps/api/src/messaging/messaging.contracts.ts` | Dropped `repliesLeft` from `MessagingEligibility` |
| `apps/api/test/messaging-send.spec.ts` | Removed the ninth-reply test and the failed-reply quota test. The eligibility test asserts `free-text` only |
| `apps/agent/agent/lib/messaging/message-send.ts` | Deleted the `repliesSince` helper and its call |
| `apps/app/components/crm/messaging/composer-state.ts` | Params are `{ windowClosesAt }` only |
| `apps/app/components/crm/messaging/message-composer.tsx` | Dropped the `repliesLeft` ICU value |
| `apps/app/test/composer-state.spec.ts` | Removed the quota-blocked test and the `{repliesLeft}` assertion |
| `apps/app/messages/en/contacts.json` | `messagingComposerNote` lost the middle sentence |
| `apps/app/messages/vi/contacts.json` | Same edit in Vietnamese |
| `docs/messaging.md` | Fact A row, composer section, eligibility section, product decision, one new decision on the 48-hour block |
| `plans/.../phase-01-paperwork.md`, `phase-04-outbound.md` | One Outcome line each |

`apps/agent/test/message-send.integration.spec.ts` holds no quota case. It is unchanged.

## Verification

| Command | Result |
| --- | --- |
| `bun run --filter=@crm/db test` | 129 pass, 0 fail, 10 files |
| `apps/api`: `bun test test/messaging-send.spec.ts test/messaging-reads.spec.ts` | 25 pass, 0 fail |
| `apps/agent`: `bun test test/message-send.integration.spec.ts` | 18 pass, 0 fail |
| `apps/app`: `bun test test/composer-state.spec.ts` | 4 pass, 0 fail |
| `bun run i18n:check` | 0 findings, 344 files |
| `bun run check-types` | 13 tasks successful |
| `bun run lint` | 9 tasks successful |

`grep -rn "freeRepliesPerWindow\|repliesLeft\|outboundSinceLastInbound\|repliesSince\|quotaUsed"`
over `apps`, `packages` and `docs` returns nothing.

## Issues

1. NOT DONE — The old reports under `plans/.../reports/` still name the 8-reply quota.
   Fix: not done. They are a historical record. Only the phase Outcomes carry the update.
2. NOT DONE — `bun run i18n:check` is a root script, not an `apps/app` script.
   Fix: run it from the repo root.

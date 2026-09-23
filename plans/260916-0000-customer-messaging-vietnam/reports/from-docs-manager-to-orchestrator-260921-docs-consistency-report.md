# Docs consistency pass — Zalo messaging feature

Date 2026-09-21. Branch `feat/zalo-oa-chat`. No code changed. No commit made.
Read: `docs/messaging.md`, `api.md`, `agent.md`, `connections.md`, `environment.md`,
`telemetry.md`, `setup.md`, `design.md`, both phase-04 review reports, both
phase-04 fix reports. Verified against: `apps/api/src/messaging/**`,
`apps/agent/agent/lib/messaging/**`, `packages/db/src/messaging.ts`,
`packages/db/src/agent-tasks.ts`, `packages/telemetry/src/allowlist.ts`,
`apps/app/components/crm/messaging/messaging-ui-config.ts`, `.env.example`,
`schema.prisma`, both `20260921*` migrations.

## Edits

1. `docs/messaging.md` (line ~109) — `profileCheckedAt` negative-cache list.
   Old: "stamped on success, on an empty profile and on `-213` (the person does
   not follow the OA), so a non-follower costs one vendor call".
   New: "stamped on success, on an empty profile, on `-213` (the person does not
   follow the OA), and on any other terminal Zalo error, so a non-follower costs
   one vendor call".
   Why: `message-identity-profile.ts:92` stamps on `verdict.terminal` for any
   non-token, non-`-213` terminal code too. The old text implied only `-213`
   stamps among failures.
2. `docs/setup.md` (before "## The agent bridge") — added a two-line "## Zalo"
   section pointing at `ZALO_APP_ID`/`ZALO_APP_SECRET`/`ZALO_OA_SECRET_KEY` in
   `environment.md` and naming the tunnel need for the webhook URL locally.
   Old: nothing. New: the two lines above. Setup already carries a per-integration
   section (Google Cloud), so this matches scope.

No other statement in `docs/messaging.md` contradicted the code: the six
`sentenceFor` sentences, the webhook gate order, `clockSkewMs` (2h), the three
attachment hosts, `MESSAGING_POLICY` (48h window, 8 replies, 2000 chars),
`PRIORITY.messageSend/messageToken/messageProfile` (950/940/930),
`MESSAGING_STAGES` (`webhook|send|token|profile`), poll intervals (10s/2s/30s/10min
in `messaging-ui-config.ts`), the `ContactChannelIdentity.profileCheckedAt` column
and its migration, the two `.env.example`/`env.validation.ts` entries, `grep
message/cs apps/api/src` empty, and the `SetNull`/cascade delete chain all match.
Cross-doc: `api.md`'s "vendor client" wording, `agent.md`'s tie at 950, the two
exceptions sentence, "Deleting a record", and telemetry property names already
agree with `messaging.md` — the phase-04 reviewer's earlier findings on these were
already fixed before this pass.

## Unverifiable claims

None found needing a flag — every concrete claim checked resolved against a file
this session could read. `docs/messaging.md`'s "Verified Zalo facts" table
sources its own confidence column (Verified/Mirror/Community/Unknown); that
grading is unchanged and out of scope for a docs-only pass.

## Issues

1. NOT DONE — `node .claude/scripts/validate-docs.cjs docs/` did not finish in
   120s and was backgrounded; no result returned before this report. Fix: rerun
   and read `/private/tmp/claude-501/.../tasks/b8p53p11a.output`.
2. RISK — `connections.md`'s `unmatchedCount` (Zalo people, from
   `contactChannelIdentity`) and `telemetry.md`'s `messaging_unmatched`
   (`MessageThread` rows) are two different counts with similar names. Neither
   doc claims they match, so this is not a contradiction, only a naming trap for
   a future reader. Fix: not done, out of scope (no contradiction to correct).

Status: DONE_WITH_CONCERNS
Summary: One real doc/code drift fixed in `messaging.md` (profileCheckedAt
stamping), one scoped addition to `setup.md`. Everything else checked already
matched code and matched across docs.
Concerns: the validator script did not confirm clean before this report closed.

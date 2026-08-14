# Healthcare CRM Phase A "Face" — Implemented, All Gates Green

**Date**: 2026-08-13 19:51–22:30
**Severity**: Low (no criticals during build; the red-teamed plan held)
**Component**: i18n catalogs, DealStage enum + migration, Deal.companyId, seed
**Status**: DONE — 8 commits on `feat/healthcare-face-phase-a`, awaiting user walk + native vi review

## What Happened

Executed the full Phase A plan in one session on one branch. Haiku subagents relabeled all 10 en+vi namespaces through the new `healthcare-relabel` skill; opus subagents built the stage swap, the optional-organization model, the tests and the clinic seed. Final code review: 0 critical, 0 high, 1 medium, 6 low. 824 tests green (app 152, api 358, agent 314), check-types, lint, i18n:check, i18n:catalogs, i18n:pseudo all pass.

## The Brutal Truth

1. **Haiku under-replaces at the edges.** Nine namespace agents left ~10 misses between them (metaTitle keys, values matching only in one locale, an ICU plural nobody read). The orchestrator diff review caught every one. The plan's over-replacement detector was pointed the right way but the real failure mode was under-replacement in low-traffic keys.
2. **The plan's traced write sites were exactly right.** The migration's backfill hit `activity.meta{from,to}` and `agentTask.payload.data{from,to,stage}` on the first pass; the replay test on a scratch DB with adversarial rows (null meta, scalar meta, free-form stages, non-object data) passed unmodified. Red-team finding F2 paid for itself.
3. **Prisma 7 refuses `migrate reset` from an AI agent.** The dev-DB reseed needs the user to run one command. The fresh-DB path was proven on a throwaway database instead.
4. **One plan gap surfaced mid-build**: the organization-delete confirm copy still promised "journeys go with them" after Phase 3 flipped the semantics to survival. Copy rewritten in both locales; the count-based branch collapsed.
5. **Seed believability needed two touches the plan didn't spell out**: a deterministic 35% closed quota (the PRNG draw realized 17.9%) and an ENROLLED-weighted closed split (flat 50/50 made the clinic lose more than it enrolled).

## Numbers

8 commits, 63 files, +2100/−1000. Subagent fleet: 9 haiku (relabel), 5 opus (fallback, swap, backend, UI, seed), 1 opus tester ×2, 1 reviewer. Every phase committed separately; mutation checks prove the new tests bite.

## Left Open

- User: reset+reseed dev DB, pseudo/vi/en walk, native Vietnamese review (terminology.md is the single source; a term fix is one skill re-run).
- Pre-flight DISTINCT check against the deployed DB (no Vercel link on this machine).
- Medium finding: `deals.update` company connect does not re-check attached clients; docs/api.md now states the attach-time scope. Guard only if product wants it.

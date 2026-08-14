# Healthcare CRM Phase A "Face" — Plan Locked, Red-Team Catches Three Criticals

**Date**: 2026-08-13 18:43–ongoing  
**Severity**: High (3 critical bugs discovered and fixed pre-build)  
**Component**: Phase A plan, schema/migration scope, i18n skill design, data backfill  
**Status**: DONE — plan hydrated, 4 tasks created, red-team findings applied

## What Happened

Planned and reviewed Phase A of the healthcare CRM reshape: i18n relabel via a new `healthcare-relabel` haiku-driven skill, deal-stage enum swap (7→6 stages), optional Deal.companyId for client-first create, clinic seed + gates. Three red-team reviewers found 25 findings; 13 survived deduplication and all 13 were accepted. Plan is now 4 phases, 15d, with cross-linked 260812 i18n blocker. Validation interview (6 questions) confirmed all answers. Effort estimate reduced 16d→15d.

## The Brutal Truth

Red-team was essential. Three hostile reviewers caught three criticals that would have broken production:

1. **Org delete cascades silently.** Activity.companyId and AgentConversation.companyId both have `OnDelete Cascade`. Deleting an org would wipe all related journey history for surviving contacts. Didn't notice because the FK definition is terse and the code path is rare. Fixed with pre-delete re-anchor instead of FK change — contacts move to null company, history survives.

2. **Stage backfill targeted the wrong table.** Plan said "update AgentEvent stage strings" but that's not where events persist: they're in agentTask rows, nested inside payload.data, across 4 event types not 1. Would have rewritten zero rows. Found during design review, not testing.

3. **Create-from-client cited nonexistent UI.** Phase said "use the existing create-from-contact pattern" — doesn't exist. Real surface is QuickAddDeal. Required adding contactId field to dealCreateInput and a transactional attach.

Cost: discovery at planning saved weeks of broken build, wasted test time, and production debugging. This is why the process works.

## What We Found (Full Set)

Beyond the criticals:

- **dealStageLabelKey throws on unmapped stage strings.** Claims a fallback exists; doesn't. Will crash on any stage string not in the enum.
- **Fork deploys on Vercel today; migrate runs mid-build; previews share prod DATABASE_URL.** Enum swap during deploy = cascading preview failures.
- **Test DB migrates forward-only.** crm_test doesn't roll back, so the enum swap bricks pre-push across all branches until cleanup.
- **6 of 17 stage* catalog keys owned by neither phase.** "Deal closed." toast survives without relabel. Must patch.
- **t.raw-consumed relativeTime* keys break if restructured to ICU.** Literal split("{count}") in the script. Will need a wrapper migration.

## Validation Interview

6 questions for Luan:
- No deployed DB holds real journey rows? Confirmed (seed only).
- Pre-flight must cover all stage strings? Confirmed.
- Clinic gates live in gateQuota? Confirmed.
- contactId transactional on QuickAddDeal? Confirmed.
- Deal closed toast relabel optional? Confirmed (not urgent).
- Back up prod before Phase 2? Confirmed.

**Result:** Phase 2 pre-flight collapsed from a 4-decision tree to a single DISTINCT-stage verification. Full snapshot protocol demoted to fallback-only. Removes 1d of negotiation overhead.

## Incident: File Truncation via Regex

A Python one-liner doing `re.sub()` to edit phase-02-stage-model-swap.md opened the file for writing **before** evaluating the regex replacement template. The template contained `\c` (from `\copy` SQL syntax) and raised a ValueError. File opened with `"w"` mode, so truncation to 0 bytes happened before the error. Follow-up sed runs then operated on the empty file. Restored fully from session context; no data loss. Lesson: write to temp file first, then `os.replace()`. Never open for write around an expression that can raise. Also: `re.sub()` replacement strings parse escape sequences — use a lambda to avoid surprises.

## Plan Structure (Locked)

```
Phase 1 (4d): healthcare-relabel skill + i18n catalog audit
Phase 2 (6d): DealStage enum 7→6, data migration, JSON backfill, pre-flight
Phase 3 (3d): Deal.companyId optional, client-first create, transactional attach
Phase 4 (2d): clinic seed + gateQuota gates
```

Cross-dependencies: blocked by 260812-2301-vietnamese-locale (awaiting Luan verification).

## Next

1. **Block until 260812 verified** — i18n relabel skill can't hydrate without locale confirmation.
2. **Phase 1 execution** — repo-local haiku-skill runs subagents; catalog audit surfaces all stage* keys.
3. **Phase 2 pre-flight** — DISTINCT-stage check, not negotiation tree.
4. **Fork deploy risk** — must patch preview env to not use prod DATABASE_URL before Phase 2 lands.

---

**Status**: DONE  
**Summary**: Phase A plan locked; red-team caught 3 criticals and 10 other findings; all applied. Plan execution begins when 260812 is verified.

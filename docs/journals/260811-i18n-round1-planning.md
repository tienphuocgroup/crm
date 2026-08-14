# Multi-lingual Support Round 1: Planning Validated and Ready

**Date**: 2026-08-11 09:01–end of session  
**Severity**: None  
**Component**: i18n infrastructure, frontend tooling  
**Status**: Complete — ready for implementation

## What Happened

Full brainstorm → plan → validate pipeline executed for "Multi-lingual support round 1: English-first i18n refactor." User ended the session at validation complete, by choice. Plan is written, verified, and ready for cooking.

## The Brutal Truth

This was a smooth session. No show-stoppers, no repeated backtracking, no architectural reversals. The real surprise was orthogonal: mid-validation, the user revealed they'd forked the repo to tienphuocgroup/crm (for reasons unrelated to this task). Three minutes of git reconfiguration rippled out, but the plan absorbed it cleanly — fork has only `release`, no upstream PR complications, copy-freeze question dissolved, procedure documented. That one fork-scoped detour added ~15 minutes to validation but actually simplified our execution story.

## Technical Details

**Next-intl design locked:** no URL routing, cookie-persisted locale + per-user DB column, frontend-only scope this round. Vietnamese deferred (will need zero code changes when it lands). Fallback ladder pre-authorized: if `cacheComponents: true` breaks cookie-resolution in phase 1 (90-min spike), drop it (verified unused — zero `"use cache"` in app source, removal costs nothing).

**File scope re-verified:** packages/ui contains ~28 translatable strings (not ~14 as scout reported); toast sites total ~129 but only ~32 carry bare literals; local-date-time.tsx inline script is a hard case (phase 5). ~129 total `.tsx` files touched, verification gates on AST checker + pseudo-locale + ratchet instead of human full-diff.

**Nine phases as commit sequence, one PR.** Big-bang single PR (user chose against incremental). Phase 1 gates everything else; phases 6–8 could parallelize but run sequential. Dependencies mapped. File ownership disjoint.

## Fork Pivot Impact

- Remotes: `origin` → fork (working repo), `upstream` → trycompai (sync source)
- Local branch 23 commits behind fork tip; start from `origin/release` not local branch
- Fork carries only `release`; no upstream PR rule applies
- Upstream drift found: `.github/workflows/ci.yml` env only (structure intact), new files added to phase 6–7 extraction batches
- Procedure: upstream syncs deliberate; post-sync gate is `i18n:check` + skill run + catalog diff
- One action item pending: enable GitHub Actions on fork (started disabled)

## Validation Results

- Claims checked: 30 sampled across all nine phases
- Verified: 29 | Failed: 0 | Unverified: 1 (npm registry peer range; re-verified at install)
- Three questions asked and answered (spike fallback ladder, switcher visibility, fork procedure)
- Consistency sweep found and reconciled 3 stale name/target references; zero unresolved contradictions
- Validation log fully populated; plan eligible for implementation

## Lessons Learned

1. **Fork-scoped work needs zero special handling if documented early.** Remotes, branch strategy, PR target, and upstream sync procedure are now explicit. No mid-run surprises.

2. **Machine-led verification (AST checker + pseudo-locale) is the right call for big-bang scope.** Full-diff human review of 139+ files would drown — checker catches real misses, pseudo-locale walkthrough catches visual/semantic breakage.

3. **Pre-authorizing fallback ladders for spikes unblocks execution.** "Don't create a problem and then ask me" is gold; the spike outcome ladder lets phase 1 proceed without escalation.

4. **File count corrections matter for phase estimation.** packages/ui was 2x larger than reported; toast sites had higher variance between "call site count" and "translatable count." Phase 6–8 extraction will be larger. Effort is still 47h estimate but distribution skews toward extraction.

## Next Steps

1. **Enable GitHub Actions on fork** (repo Settings → Actions) before phase 9 — workflows start disabled on forks, CI gate cannot run otherwise.
2. **Start from fork tip:** `git fetch origin && git switch -c feat/i18n-english-first origin/release`
3. **Phase 1 opener:** spike first (90 min), test cookie-based locale with `cacheComponents: true`. If it breaks broadly, drop `cacheComponents` (pre-authorized, no escalation).
4. **Nine sequential commits** through phase 9, one PR at the end. Ratchet and checker gates each phase's boundary.

---

**Status**: DONE  
**Summary**: Multi-lingual i18n plan validated and ready for 9-phase implementation; fork workflow clarified, no blockers.

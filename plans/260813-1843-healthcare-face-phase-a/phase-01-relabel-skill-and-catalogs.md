---
phase: 1
title: "Relabel skill and catalogs"
status: done
priority: P1
dependencies: []
effort: "3d"
---

# Phase 1: Relabel skill and catalogs

## Overview

Build a repo-local Claude Code skill that drives haiku subagents over the message
catalogs, then run it: every sales-vocabulary VALUE in `apps/app/messages/{en,vi}`
becomes healthcare vocabulary. Keys never change. ICU placeholders and tags never
change. Schema and code identifiers never change.

Scout facts (verified 2026-08-13, corrected by red-team 2026-08-13): 10
namespaces × 2 locales. Sales-vocab hit counts: deals.json 103, dashboard.json
67, companies.json 47, contacts.json 47, agent-panel.json 78, common.json 72,
landing.json 72, settings.json 49, nav.json 8, **ui.json 0** — `ui.json` and
`DEFAULT_UI_STRINGS` carry no sales vocabulary; they are verify-only here.

## Requirements

- Functional: whole UI (en + vi) reads Journey / Organization / Client. Landing
  copy gets the mechanical term swap only — no positioning rewrite this phase.
- Non-functional: catalogs stay shape-identical (same keys, same ICU args/tags),
  so `check-types` parity (`VI_MESSAGES: typeof EN_MESSAGES`) and the catalogs
  comparator both stay green.

## Architecture

The skill lives in `.claude/skills/healthcare-relabel/`:

```
.claude/skills/healthcare-relabel/
  SKILL.md                     # workflow: batch, spawn, gate, diff-review
  references/terminology.md    # the canonical en+vi term map, one source of truth
```

SKILL.md workflow:
1. Read `references/terminology.md`.
2. One haiku subagent per namespace, given the en AND vi file of that namespace
   together (terms must stay coherent across locales). 10 batches, parallelizable.
3. Each agent rewrites VALUES only. Hard rules in the prompt: never touch keys;
   never add/remove/rename ICU arguments or tags; never touch
   `settings.json` `general.language*` endonyms; **never restructure any
   `t.raw`-consumed key — `common.json` `relativeTime*` feeds a literal
   `split("{count}")` script (`apps/app/lib/local-date-time-script.ts:41`) that
   does not parse ICU; an en+vi ICU restructure there passes every gate and
   renders raw ICU source in every timestamp** <!-- red-team: F13 -->; skip ALL
   `deals.json` `stage*` keys (Phase 2 audits all 17 of them) <!-- red-team: F8 -->;
   leave brand names (Comp AI, Gmail, Outlook, Slack, LinkedIn, Google, Microsoft).
4. **Over-replacement detector** <!-- red-team: F12 -->: the gates below only
   catch UNDER-replacement. After each batch, the orchestrator (not haiku)
   reviews the per-namespace `git diff` of values against terminology.md —
   hunting wrong replacements: generic UI verbs rewritten ("Close" dialog
   buttons must never become "Convert"), "contact" as a verb, over-applied
   "Client" in agent-panel prose. Re-dispatch the namespace on a bad diff.
5. Orchestrator runs gates and greps (below); re-dispatches on failure.

Skill is generic on purpose: terminology.md is data, the workflow is reusable for
later per-module renames (brainstorm decision 5).

### Terminology map (en) — starting point for terminology.md

| Old | New | Note |
| --- | --- | --- |
| Deal / Deals | Journey / Journeys | |
| Company / Companies | Organization / Organizations | |
| Contact / Contacts | Client / Clients | only the CRM noun; "contact" as a verb/action stays |
| won / win | enrolled / convert | "Won this month" → "Enrolled this month" |
| win rate | conversion | |
| lost / lose | lost | keep; "lost reason" stays |
| closing / close (a deal) | expected to enroll / convert | deal-context only. UI "Close" (dialogs, sheets, menus) is a keep — never touch it |
| prospect / lead | inquiry | |
| pipeline | pipeline | keep — neutral |
| sales | care / (drop) | context-judged |

The keep-list in terminology.md is built from REAL catalog values during step 1
of implementation (grep the catalogs, list actual strings), not from invented
examples. Known keeps to seed it: `ui.json` `"close": "Close"` and every other
generic dialog/sheet "Close"; `relativeTime*` values.

vi terms (draft, native review is a Phase 4 gate): Journey → "Hành trình",
Organization → "Tổ chức", Client → "Khách hàng", enrolled → "Đã đăng ký".
Plural/ICU messages restructure where vi needs it — the comparator allows arg
changes only if en changes too, so restructure means touching both. The
never-restructure list (step 3) overrides this allowance.

## Related Code Files

- Create: `.claude/skills/healthcare-relabel/SKILL.md`
- Create: `.claude/skills/healthcare-relabel/references/terminology.md`
- Modify: `apps/app/messages/en/*.json` (10 files)
- Modify: `apps/app/messages/vi/*.json` (10 files)
- Verify only <!-- red-team: F12 -->: `packages/ui/src/lib/ui-strings.ts` and
  `messages/{en,vi}/ui.json` — zero sales vocabulary confirmed; assert the
  key-for-key mirror still holds after the run, change nothing.
- Modify: `packages/db/src/crm-events.ts` — `CRM_EVENT_CATALOG` `label` /
  `description` VALUES only ("Deal stage changed" → "Journey stage changed").
  Event name keys (`deal.stage.changed`…) are wire values and never change.
- Check, likely no-op: `apps/app/components/crm/fields/standard-fields.ts`
  labels are already catalog keys (`common.fields.standard*`) — covered by the
  catalog sweep; verify no stray literals.

## Implementation Steps

1. Build the real keep-list: grep the en catalogs for every occurrence of the
   old terms, classify each as replace / keep, and write both lists into
   terminology.md. Then write SKILL.md.
2. Run the skill over the 10 namespace batches (haiku agents), with the
   per-namespace diff review after each batch (Architecture step 4).
3. Verify `DEFAULT_UI_STRINGS` ≡ `en/ui.json` values still hold (no edits expected).
4. Relabel `crm-events.ts` label/description values by hand. Verify where they
   surface (agent-builder event picker) and whether agent-panel catalog keys
   duplicate them; relabel whichever renders.
5. Grep sweep for leftovers in values:
   `grep -riE '\b(deal|company|contact|prospect|lead)\b' apps/app/messages/en/ | grep -v '"stage'`
   — triage each hit against the keep-list: legitimate keep, Phase 2 (`stage*`),
   or missed.
6. Grep `export const metadata` and page `title:` literals in `apps/app` for old
   vocabulary (AST checker cannot see object literals — docs/i18n.md).
7. Gates: `bun run i18n:check`; `bun run i18n:catalogs` (root package.json
   script — there is no app-package script of that name) <!-- red-team: F12 -->;
   `bun run check-types`.

## Success Criteria

- [ ] Skill exists, is re-runnable, and its terminology map is the single source of truth.
- [ ] Zero old-vocabulary values in en catalogs outside the keep-list; vi matches.
- [ ] Per-namespace diff review found no over-replacement (or it was fixed and re-run).
- [ ] `DEFAULT_UI_STRINGS` ≡ `en/ui.json` values (verified, unchanged).
- [ ] `i18n:check`, `i18n:catalogs`, `check-types` all green.
- [ ] No key renamed, no ICU arg/tag changed, no `t.raw`-consumed value restructured.

## Risk Assessment

- RISK — haiku mangles ICU syntax in a value. Mitigation: comparator gate fails
  the batch; re-dispatch that namespace only.
- RISK — over-replacement ("Close" → "Convert", verb "contact" → "client").
  Gates cannot catch it. Mitigation: per-namespace orchestrator diff review
  (Architecture step 4) is the detector; keep-list is built from real strings.
- RISK — `relativeTime*` ICU restructure breaks timestamps invisibly to all
  gates. Mitigation: never-restructure list in the skill prompt.
- RISK — vi drafts read wrong to a native speaker. Mitigation: Phase 4 native
  review gate; terms centralized in terminology.md so a term fix is one re-run.

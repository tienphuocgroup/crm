---
phase: 4
title: "i18n-extract Claude Skill"
status: complete
priority: P2
dependencies: [3]
---

# Phase 4: i18n-extract Claude Skill

## Overview

Phases 6–8 are ~100 files of mechanical, error-prone work. This phase encodes the
procedure once so each batch runs the same way instead of being re-improvised.

The skill is the operator's checklist: run the checker, wrap what it found, name
keys by convention, update the catalog, verify, report the delta.

## Requirements

- Lives at `.agents/skills/i18n-extract/SKILL.md`, matching sibling skill format.
- Frontmatter `name` + `description` with concrete trigger terms — the description
  is the only thing loaded until the skill fires, so it must be self-selecting.
- A companion `references/key-naming-convention.md`.
- Documents the server/client split, which the report names as the likeliest mistake.
- Encodes a per-batch loop ending in a verifiable delta, not a claim of completion.

## Architecture

**Format.** Match the existing skills. `.agents/skills/nuqs/` is the reference for a
skill with a `references/` directory; `.agents/skills/no-use-effect/` is the
reference for a single-file skill. Frontmatter is `name` and `description` only.
Note `.agents` is excluded from Biome (`biome.jsonc`) — no formatting to satisfy.

**Two files, not more.** `SKILL.md` holds the loop; `references/key-naming-convention.md`
holds naming rules and the awkward cases. Splitting further means the operator reads
an index instead of a procedure.

**Server vs client.** The single highest-value rule:

- Client component (`"use client"` at the top of the file, or any ancestor of the
  call in the same file) → `useTranslations("namespace")`.
- Server component (async, or reads `cookies()`/`headers()`, or has no directive and
  is not imported by a client file) → `await getTranslations("namespace")`.
- Neither — a plain module function, e.g. everything in `apps/app/lib/` — → **cannot
  call either.** See below.

**Non-component strings.** Under-scoped in the brainstorm and worth its own rule.
`apps/app/lib/chat-date-group.ts:3` types its return as
`"Today" | "Yesterday" | "Last 7 days"`; `apps/app/lib/agent-transcript.ts` holds 38
capitalised literals; `agent-tool-display.ts`, `activity-presentation.ts`,
`deal-stage.ts`, `enrichment-status.ts` add ~20 more. Convention:

> A pure function returns a **key**, never a sentence. Change the return type from
> the English union to a key union (`"today" | "yesterday" | "last7Days"`) and
> translate at the render site. Do not thread a `t` function into a pure helper —
> it makes the function untestable without a provider and pushes i18n into modules
> that have no business knowing about it.

This changes typed contracts and breaks the tests that assert English
(`apps/app/test/chat-date-group.spec.ts:8-10`,
`apps/app/test/agent-tool-display.spec.ts:15-51`,
`apps/app/test/agent-session.spec.ts:111-119`). That is the intended outcome: the
test then asserts a stable key instead of prose, which is a better test. The skill
must say so, or the operator will "fix" the test by importing the catalog and assert
the English string right back in.

**Key naming.** `<namespace>.<area><Thing>` in camelCase, matching the report's
`deals.lostReasonRequired`. Rules:

- Namespace is the file's route or component area, from the fixed phase 1 list.
- Key describes **meaning**, not location. `deals.saveFailed`, not
  `deals.dialogButton2`.
- Shared strings (`Save`, `Cancel`, `Delete`) live in `common`. Two namespaces with
  the same English value is a signal one belongs in `common` — but only if they will
  translate identically, which for verbs across languages is not automatic. When
  unsure, duplicate; a wrong merge is harder to unpick than a duplicate.
- Interpolation uses ICU named placeholders: `{count}`, `{name}`. Never positional.
- Text with embedded markup uses `t.rich` with named tags, never string
  concatenation around a `<strong>`.

## Related Code Files

- Create: `.agents/skills/i18n-extract/SKILL.md`
- Create: `.agents/skills/i18n-extract/references/key-naming-convention.md`

No source files. This phase writes documentation only.

## Implementation Steps

1. Read `.agents/skills/nuqs/SKILL.md` and `.agents/skills/no-use-effect/SKILL.md`
   for frontmatter shape, heading depth and tone before writing.
2. Write the frontmatter. `description` must trigger on: i18n, extract strings,
   hardcoded text, next-intl, useTranslations, getTranslations, message catalog,
   translation keys, i18n:check.
3. Write the per-batch loop in `SKILL.md`:
   1. `bun run i18n:check` — record the finding list for the batch's files.
   2. Read each flagged file. Determine server vs client per the rule above.
   3. Wrap: `useTranslations` / `getTranslations` / key-return for pure functions.
   4. Name keys per `references/key-naming-convention.md`.
   5. Add keys to `apps/app/messages/en/<namespace>.json`, alphabetically.
   6. Remove the batch's paths from `apps/app/scripts/i18n/ratchet.json`.
   7. Re-run `bun run i18n:check`, then `bun run check-types`, then `bun run lint`.
   8. Report the delta: findings before → after, keys added, files un-ratcheted.
4. Add a "Cases that are not a simple wrap" section:
   - Pure functions in `apps/app/lib/` → return keys.
   - `export const metadata` → convert to `generateMetadata` with `getTranslations`.
     18 static exports exist across `apps/app/app`, 0 `generateMetadata`.
   - Strings inside stringified scripts (`apps/app/components/local-date-time.tsx:17`)
     → cannot use `t()`; phase 5 owns the mechanism, do not improvise a second one.
   - Object literals mixing protocol values with copy — `apps/app/lib/agent-record.ts:16-56`
     has `header: "x-crm-contact"` next to `title: "Ask about this person"`. Split
     the record; translating the header breaks the bridge at
     `apps/app/app/eve/v1/[...path]/route.ts:46-48`.
   - `toast.error(error.message)` → leave alone, API prose is out of scope.
   - `packages/ui` components → never import next-intl; use the phase 5 provider.
5. Add the hard rules the operator must not violate: **never add a code comment**
   (`AGENTS.md`); never change English wording while extracting — a copy edit hidden
   in a 100-file diff is invisible; never edit an allowlist entry to silence a real
   finding.
6. Write `references/key-naming-convention.md` with a worked before/after for each
   of: a client component, a server component, a `t.rich` case, an ICU plural, and a
   pure function returning a key.
7. Dry-run the skill on three files from phase 6's settings batch — one client, one
   server, one with a toast. If the procedure needs improvisation, the procedure is
   wrong; fix it now, before 100 files depend on it. Revert the dry-run edits.
8. Commit.

## Implementation notes

The step-7 dry run (three real settings files: `workspace-form.tsx` client form,
`settings/page.tsx` server + metadata, `research-key.tsx` toast + `t.rich`;
21 keys, `i18n:check` 20→0, `check-types` clean, all reverted) surfaced two
procedure gaps, both fixed in the skill text before it is trusted for ~100 files:

1. **The spec's loop order was backwards.** Running `i18n:check` first (spec
   step 3.1) against a still-ratcheted batch reports nothing — the checker
   suppresses ratcheted findings entirely. The skill's loop un-ratchets the
   batch **first**, so the first check is the real "before" list.
2. **Hand-formatting is unreliable.** Biome's import collation and JSX wrap
   decisions are not guessable; the loop gained an explicit
   `bunx biome check --write` step before the final confirmation runs.

Also folded in from the dry run: two namespaces in one file need two hook
calls with distinct names (no cross-namespace dotted paths); an unused
namespace hook is a lint error; and `export const metadata` yields **zero**
checker findings (the checker parses JSX and toast calls, not object
literals), so the loop tells the operator to grep for it explicitly.

## Success Criteria

- [x] `SKILL.md` frontmatter matches sibling skills; `description` names the trigger terms.
- [x] Server/client/pure-function decision rule is unambiguous — each of the three has a stated test.
- [x] All six "not a simple wrap" cases documented with a resolution.
- [x] Reference doc has a worked example for all five listed shapes.
- [x] Step-7 dry run completed on three real files; the two procedure gaps it exposed were fixed in the skill text; edits reverted.
- [x] Loop ends in a measurable delta, not a self-assessment.
- [x] Skill states the no-comments and no-copy-edits rules.
- [x] Nothing under `apps/` or `packages/` changed by this phase.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| Skill too vague → operator improvises differently per batch | Med × High | Step 7 dry run is the test. Worked examples over prose. |
| Server/client rule misapplied → runtime error deep in a batch | Med × High | Explicit test for each case; `check-types` in the loop catches most; the rule is stated first in the skill. |
| Operator "fixes" broken English-asserting tests by re-asserting English | Med × Med | Called out explicitly with the reason. |
| Key naming drifts across batches | Med × Low | Convention doc; phase 9 sweep can rename cheaply since keys are internal. |
| Skill rots as the codebase changes | Low × Low | Two files, one consumer, one round of use. Accepted. |

**Rollback.** Documentation only. Deleting the directory affects nothing that runs.

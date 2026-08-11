---
phase: 3
title: "Extraction Tooling (checker + pseudo-locale)"
status: complete
priority: P1
dependencies: [1]
---

# Phase 3: Extraction Tooling (checker + pseudo-locale)

## Overview

The safety net. Big-bang execution means nobody reads the whole diff, so the machine
has to. Three tools:

1. `i18n:check` — TypeScript AST scan for hardcoded user-visible strings.
2. An allowlist for strings that are legitimately not translatable.
3. A ratchet file listing not-yet-migrated paths, so the checker is green from day
   one and every extraction phase shrinks it.
4. A pseudo-locale generator that accents the `en` catalog, making a bypassed string
   visible on screen.

AST, not grep. Grep cannot tell `<div>Save</div>` from `className="Save"`, cannot
see JSX text spanning lines, and produces a false-positive rate that trains the
operator to ignore it.

## Requirements

- Flags, in `apps/app` and `packages/ui`:
  - JSX text nodes containing a letter.
  - String literals in `placeholder`, `title`, `aria-label`, `alt`.
  - String arguments to `toast.*()` outside a `t()` call.
- Allowlist file, keyed by string or by `file:symbol`, each entry carrying a reason.
- Ratchet file of unmigrated paths; the checker skips them and reports the count.
- Pseudo-locale derived from `en/`, generated not committed.
- `bun run i18n:check` from the repo root. Exit 1 on a finding outside the ratchet.
- No new runtime dependency in any shipped package.

## Architecture

**Placement.** `apps/app/scripts/i18n/`, with a root `package.json` script
delegating. It scans `packages/ui` too, so a case could be made for a new package —
rejected as YAGNI. It is a dev script with one consumer; a workspace package would
add a `package.json`, a tsconfig and a build step to own three files. Root script:

```
"i18n:check": "bun apps/app/scripts/i18n/check.ts"
```

Root, not `turbo run` — this is a repo-wide scan, not a per-package task, and
wiring it as a turbo task would need a task definition in two `turbo.json` files
for no caching benefit on a sub-second scan.

**Compiler API access.** `typescript` 5.9.2 is already a root devDependency. Use
`ts.createSourceFile` per file — not a full `ts.Program`. No type information is
needed, only syntax, and a Program over the monorepo turns a two-second scan into
a thirty-second one.

**Detection rules.**

| Node | Flag when | Skip when |
| --- | --- | --- |
| `JsxText` | trimmed text matches `/\p{L}/u` | whitespace, entity-only, or all punctuation |
| `JsxAttribute` in the four names | initialiser is `StringLiteral` | initialiser is an expression |
| `CallExpression` on `toast.*` | first arg is `StringLiteral` or a `TemplateExpression` with literal text | arg is an identifier or a `t()` call |

Deliberately **not** flagged this round: object literals of display strings
(`GROUP_LABEL`, `COPY`, `TYPE_LABELS`, `RESPONSE_LABEL`). Every capitalised string
in a `Record` would be flagged, and most such records are technical maps. These are
caught by the pseudo-locale walkthrough and by the per-file work in phases 5–8
instead. Recording the decision so a later reader does not think it was missed.

**Allowlist.** `apps/app/scripts/i18n/allowlist.json`. Two forms: a bare string
matched anywhere, and a `path::string` pair for narrow exemptions. Every entry needs
a `reason`. Seed it from the known brand and protocol tokens — `Comp AI`, `eve`,
`CRM`, ISO currency codes, `Google`, `Microsoft`, and `apps/app/lib/agent-record.ts`
header values `x-crm-contact`/`x-crm-company`/`x-crm-deal`, which are live wire
values read at `apps/app/app/eve/v1/[...path]/route.ts:46-48`. Translating one would
break the agent bridge. Finalised in phase 9 once the real false-positive set is known.

**Ratchet.** `apps/app/scripts/i18n/ratchet.json` — an array of glob paths not yet
migrated. Populate it in this phase with everything the checker currently flags, so
`i18n:check` exits 0 on the very first run. Phases 5–8 delete entries as they go;
phase 9 empties it. Adding a path is a reviewable diff, which is what stops the
ratchet from being loosened silently.

**Pseudo-locale.** `apps/app/scripts/i18n/pseudo.ts` reads `messages/en/*.json`,
maps ASCII letters to accented equivalents (`Save` → `Šàvê`), preserves ICU
placeholders and tags untouched, writes `messages/pseudo/`. Output is gitignored and
generated on demand; committing a derived catalog invites it going stale. Length
padding is deliberately omitted — `docs/design.md` forbids visual deviation, so
layout is not being stress-tested here; only coverage is. Loading it needs
`SUPPORTED_LOCALES` to accept `pseudo`, which is a dev-only branch guarded by
`NODE_ENV !== "production"`.

## Related Code Files

- Create: `apps/app/scripts/i18n/check.ts` — entry point, walks files, prints findings
- Create: `apps/app/scripts/i18n/rules.ts` — the three AST visitors
- Create: `apps/app/scripts/i18n/allowlist.json`
- Create: `apps/app/scripts/i18n/ratchet.json`
- Create: `apps/app/scripts/i18n/pseudo.ts`
- Modify: root `package.json` — `i18n:check` and `i18n:pseudo` scripts
- Modify: `apps/app/i18n/locale.ts` — dev-only `pseudo` locale branch
- Modify: `.gitignore` — `apps/app/messages/pseudo/`

## Implementation Steps

1. `check.ts`: collect `apps/app/**/*.{ts,tsx}` and `packages/ui/src/**/*.tsx` via
   Bun's `Glob`. Exclude `node_modules`, `.next`, `dist`, `src/generated`, `test`.
   Note `packages/ui/src/components` is excluded from Biome (`biome.jsonc`
   `files.includes`) — the checker must **not** inherit that exclusion; those files
   hold most of the phase 5 strings.
2. Per file: `ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, TSX)`,
   then a recursive `ts.forEachChild` walk.
3. Implement the three rules. Report `path:line:col`, the string, and the rule name.
4. Apply allowlist, then ratchet. Print `N findings, M files ratcheted` and exit
   non-zero only for findings outside the ratchet.
5. Run against the untouched repo. Expect a large number. Triage the output: real
   strings go to the ratchet, false positives go to the allowlist **with a reason**.
   Resist ratcheting a file that only had false positives.
6. Sanity-check the rules against known cases before trusting the count:
   - `packages/ui/src/components/table-pagination.tsx:51` (`Previous`) and `:62`
     (`Next`) must be flagged as JSX text.
   - `:38` — a template with `Showing … of …` — must be flagged.
   - `packages/ui/src/components/spinner.tsx:31` `aria-label="Loading"` must be flagged.
   - `packages/ui/src/components/logo.tsx:10` `aria-label="Comp AI Logo"` must be
     allowlisted, not flagged.
   - A `toast.error(error.message)` call must **not** be flagged — API prose is out
     of scope.
   If any of these five is wrong, the rule is wrong, not the file.
7. `pseudo.ts`: recurse the JSON, transform leaf strings, skip `{placeholder}` spans
   and `<tag>` markup so ICU still parses. Round-trip one message with a plural and
   an embedded tag through `next-intl` to prove it.
8. Add the dev-only `pseudo` branch to `SUPPORTED_LOCALES`.
9. Add both root scripts. Confirm `bun run i18n:check` exits 0 with the seeded ratchet.
10. `bun run lint`. Commit.

## Implementation notes

- A **fourth rule** was required: `jsx-expression`. Sanity case 2 (the pagination
  `Showing … of …` template) is not a `JsxText` node — it sits in a JSX child
  expression container. The rule unwraps parentheses, conditionals and
  `??`/`||`/`&&` only, then flags terminal string/template literals with letters.
  It deliberately does not descend into calls, objects or arrow bodies, keeping
  the "object literals not flagged this round" boundary intact. 120 of 810 raw
  findings came from it.
- Scan results on the `ad1d702`-based tree: 293 files scanned in ~0.45s; 810 raw
  findings (520 jsx-text, 120 jsx-expression, 112 jsx-attribute, 58
  toast-literal); after the allowlist, 784 findings across **115 files**, all
  ratcheted. No file qualified for allowlist-only treatment (checked
  programmatically — every flagged file holds at least one real string).
- Allowlist: 39 entries, every one with a reason. Matching is **exact, not
  substring** — a substring match would let `Comp AI` silently exempt whole
  sentences. `logo.tsx`'s `Comp AI Logo` is a `path::string` entry.
- Ratchet matching is exact-path-first, glob-second: real paths contain `[slug]`
  and `(app)`, which Bun's `Glob` reads as metacharacters, so pure glob matching
  would never match them.
- The pseudo dynamic import keys on `../messages/${locale}/…` (not a hardcoded
  `pseudo/` segment) so a fresh clone without the gitignored directory falls back
  to `en` at runtime instead of failing the build.
- Pseudo maps all 52 ASCII letters, not just the illustrative subset — an
  unmapped letter would be a blind spot in exactly the coverage the pseudo run
  exists to prove.
- End-to-end verified against a dev server via a temporary probe on `/sign-in`
  (reverted): no cookie → `Comp AI CRM`; `NEXT_LOCALE=pseudo` → `Çôṁþ ÅÌ ÇŔṀ`.
  ICU round-trip proven through `use-intl` with a plural + embedded tag + nested
  placeholder in both `en` and pseudo.
- In production builds `pseudo` is rejected by `isActiveLocale` —
  `SUPPORTED_LOCALES` stays `["en"]` and the shipped behavior is unchanged.

## Success Criteria

- [x] `bun run i18n:check` exits 0 on the current tree with the ratchet seeded.
- [x] Removing one path from the ratchet makes it exit 1 with correct `file:line:col`.
- [x] All five step-6 sanity cases behave as specified.
- [x] `toast.error(error.message)` is not flagged; `toast.success("Saved")` is.
- [x] Scan of both workspaces completes in under 10s.
- [x] `bun run i18n:pseudo` writes `messages/pseudo/`; setting the cookie to `pseudo` in dev renders accented text.
- [x] Pseudo output preserves ICU placeholders — no `Šàvêd {çôûnt}` breakage; a plural message still selects correctly.
- [x] Every allowlist entry has a reason string.
- [x] `messages/pseudo/` is gitignored.
- [x] No new dependency in any shipped `package.json`.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| Rules too loose → false positives train the operator to ignore output | High × High | Step 6 fixed sanity set; allowlist requires a reason so exemptions stay visible. |
| Rules too tight → strings ship unwrapped and checker says green | Med × High | Pseudo-locale is the independent second check; it does not share code with the AST rules. |
| Ratchet becomes a dumping ground | Med × Med | Adding a path is a reviewable diff. Phase 9 asserts it is empty. |
| Pseudo transform corrupts ICU syntax | Med × Med | Placeholder/tag spans skipped; step 7 round-trips a plural and a tag before use. |
| Scan misses `packages/ui/src/components` by copying Biome's ignore list | Med × High | Called out in step 1 — that directory holds most phase 5 strings. |
| Template-literal toasts with interpolation are hard to classify | Med × Low | Flag any template containing literal letters; the operator decides. Over-flagging here is cheap. |

**Rollback.** Zero product risk — no shipped code imports any of this. Revert removes
the scripts and two root script entries. The CI gate does not exist until phase 9,
so a broken checker cannot block anyone before then.

---
name: i18n-extract
description: >-
  Extract hardcoded English strings in apps/app and packages/ui into the
  next-intl message catalog. Use this for i18n work — extracting strings,
  replacing hardcoded text with next-intl, wiring useTranslations or
  getTranslations, adding translation keys to the message catalog, or acting
  on apps/app/scripts/i18n/check.ts (i18n:check) findings. Triggers on: i18n,
  extract strings, hardcoded text, next-intl, useTranslations, getTranslations,
  message catalog, translation keys, i18n:check.
---

# i18n-extract

Runs one batch of files through `bun run i18n:check`, wraps what it finds in
`next-intl`, names the keys, updates the catalog, and reports a delta. The
same procedure every batch — that is the point of this file.

## Decide this first: server, client, or pure function

Every string you touch is in exactly one of these three. Get this wrong and
the fix either doesn't compile (`useTranslations` in a server component,
`await` in a non-async one) or throws at runtime (a hook called outside a
component). Decide before you wrap anything.

- **Client component.** Test: the file has `"use client"` as its first
  statement, OR the function containing the string is defined inside a
  component in the *same file* that does (a nested closure inherits the
  directive — there is no second `"use client"` to add for it).
  → `const t = useTranslations("namespace")`, called during render, one call
  per namespace you actually use in the file.
- **Server component.** Test: the file has no `"use client"` anywhere in its
  ancestry within the same file, AND the string's call site is inside a
  component function rendered as JSX (not called as a plain helper) — usually
  `async`, or one that reads `cookies()` / `headers()` / hits the DB directly.
  → `const t = await getTranslations("namespace")`. If the component isn't
  `async` yet, make it `async` — `getTranslations` cannot be called without
  `await`.
- **Neither — a pure function.** Test: the function does not return JSX, is
  not itself a hook, and is called from both components and tests (most of
  `apps/app/lib/`, e.g. `chat-date-group.ts`, `agent-transcript.ts`,
  `agent-tool-display.ts`, `activity-presentation.ts`, `deal-stage.ts`,
  `enrichment-status.ts`). It has no render context, so it **cannot** call
  either hook. See "Pure functions return keys" below.

A component can need strings from more than one namespace (a page-local
string plus a shared `common` one). That's two separate hook calls with two
distinct local names — `useTranslations` is scoped to one namespace per call,
it does not resolve dotted paths across namespaces:

```
const t = useTranslations("settings");
const common = useTranslations("common");
```

Only call a namespace hook you end up using in that file — an unused one is a
lint failure (`noUnusedVariables`), not a silent no-op.

## The per-batch loop

1. **Un-ratchet the batch's files first**, in
   `apps/app/scripts/i18n/ratchet.json`. Do this before the first check —
   the checker suppresses findings for anything still listed there (it counts
   them under "ratcheted", it does not print them), so running `i18n:check`
   against still-ratcheted files tells you nothing about what's inside them.
2. `bun run i18n:check`. Record the finding list for the batch's files — one
   line per finding, `path:line:col  "string"  [rule]`, rule is one of
   `jsx-text`, `jsx-expression`, `jsx-attribute`, `toast-literal` — followed
   by a summary line `N findings, M files ratcheted`. This `N` is your
   "before" number.
   Also grep the batch's files for `export const metadata` — the checker
   parses JSX and `toast()` calls, not arbitrary object literals, so a
   hardcoded `metadata.title` produces zero findings and will not appear in
   this list. See "Cases that are not a simple wrap" below.
3. Read each flagged file in full, not just the flagged lines. Decide
   server / client / pure function per the rule above before touching
   anything.
4. Wrap: `useTranslations` / `getTranslations` / a returned key. Anything
   that isn't a plain string swap — `export const metadata`, a stringified
   script, a mixed protocol/copy object, `toast.error(error.message)`,
   `packages/ui` — is in "Cases that are not a simple wrap" below. Do not
   improvise a new mechanism for one of those; the section tells you what to
   do instead.
5. Name the keys per `references/key-naming-convention.md`.
6. Add the keys to `apps/app/messages/en/<namespace>.json`, keeping the file
   sorted alphabetically by key.
7. Run the formatter, don't hand-wrap JSX or hand-order imports:
   `bunx biome check --write <the changed files>`. Import order for `next-intl`
   / `next-intl/server` relative to other packages, and whether a translated
   JSX child collapses onto one line or wraps across three, both depend on
   Biome's line width and current indent depth — guessing gets it wrong as
   often as not. Let the formatter decide, then diff what it changed.
8. Re-run `bun run i18n:check` (confirm the batch's findings are gone and
   nothing new appeared), then `bun run check-types`, then `bun run lint`.
   `lint` should now be a no-op confirmation, not a fixer — everything
   fixable was already applied in step 7.
9. Report the delta, not a claim of completion: findings before → after (the
   two summary lines from steps 2 and 8), keys added (count, and which
   namespace file), files un-ratcheted (the list from step 1).

## Cases that are not a simple wrap

**Pure functions in `apps/app/lib/` return keys.**

> A pure function returns a **key**, never a sentence. Change the return type
> from the English union to a key union (`"today" | "yesterday" | "last7Days"`)
> and translate at the render site. Do not thread a `t` function into a pure
> helper — it makes the function untestable without a provider and pushes
> i18n into modules that have no business knowing about it.

This changes the function's return type and breaks any test that asserts the
old English literal against it. That's the intended outcome — the test now
asserts a stable key instead of prose, which is a better test. Update the
test to assert the **key**. Never "fix" it by importing
`apps/app/messages/en/*.json` in the test and re-asserting the English string
— that reintroduces exactly the coupling this refactor exists to remove, and
it's invisible in a diff unless someone reads the test body.

**`export const metadata` becomes `generateMetadata` with `getTranslations`.**
A static `export const metadata = { title: "..." }` cannot call a hook. Convert
it to `export async function generateMetadata()` and resolve the title through
`await getTranslations("namespace")`, same namespace the page's own component
uses. The checker will not flag the static form — you have to notice it by
reading the file, per step 2 above.

**Strings inside a stringified script are phase 5's mechanism — don't
improvise a second one.** `apps/app/components/local-date-time.tsx:17` holds
English inside a JS string blob (`LOCAL_DATE_TIME_SCRIPT`) that runs as raw
DOM script with no React and no `t()` available. If a batch touches this file,
its fix is parameterizing the script with locale + labels resolved server-side
(phase 5's job) — not a local `t()` call, which doesn't exist in that
execution context.

**`apps/app/lib/agent-record.ts` mixes wire protocol with copy — split them,
don't translate the whole object.** Its `RecordCopy` shape has `header` (e.g.
`"x-crm-contact"`) and `field` (e.g. `"contactId"`) sitting next to `title`
and `blurb`, which are real UI copy. `header` and `field` are read literally at
`apps/app/app/eve/v1/[...path]/route.ts:46-48` to bridge the request to the
agent — translating them breaks that bridge. Only `title`, `blurb`,
`placeholder`, and `suggestions` are translatable; `header` and `field` are
never touched, in extraction or in any other change.

**`toast.error(error.message)` stays exactly as it is.** `error.message` is
server-generated prose from the API, not a literal in this file. It is out of
scope for this skill — do not wrap it, do not add a key for it, do not touch
the line. Only `toast.error("a literal string")` and `toast.success(...)` /
`toast(...)` with a literal argument are `toast-literal` findings.

**`packages/ui` components never import `next-intl`.** If a finding is under
`packages/ui/src/components/`, it is not this skill's job — that package gets
its strings from `UiStringsProvider` (phase 5), a plain React context with
English defaults, so the package stays framework-agnostic and buildable with
no `next-intl` dependency, direct or transitive. Leave `packages/ui` findings
for phase 5; adding a next-intl import there is a phase 5 regression, not a
phase 6-8 extraction.

## Key naming

Full worked examples are in `references/key-naming-convention.md`. Rules:

- `<namespace>.<area><Thing>` in camelCase — e.g. `deals.lostReasonRequired`.
- Namespace is the fixed phase-1 list: `common`, `nav`, `settings`, `deals`,
  `companies`, `contacts`, `dashboard`, `landing`, `agent-panel`, `ui`. Never
  invent one.
- The key describes **meaning**, not location. `deals.saveFailed`, not
  `deals.dialogButton2`.
- Shared strings (`Save`, `Cancel`, `Delete`) live in `common` — but only when
  both the English value **and** the meaning are identical across the call
  sites. Two namespaces sharing the same English word is a signal, not a
  rule: a verb that reads the same in English can translate differently
  depending on what it's acting on. When unsure, duplicate the key in its own
  namespace instead of merging into `common` — a wrong merge is harder to
  unpick later than a duplicate is to delete.
- Interpolation uses ICU named placeholders — `{count}`, `{name}` — never
  positional (`{0}`, `{1}`).
- Text with embedded markup uses `t.rich` with named tags
  (`t.rich("key", { link: (chunks) => <a>...</a> })`), never string
  concatenation around a `<strong>` or `<a>`.

## Hard rules

- **Never add a code comment.** Not to a wrapped component, not to a catalog
  file, not anywhere you touch. Repo-wide rule, `AGENTS.md`.
- **Never change English wording while extracting.** Copy the existing string
  into the catalog byte-for-byte. A copy edit hidden inside a 100-file
  mechanical diff is invisible to review — if the current text is genuinely
  wrong, flag it separately, do not "fix" it in the same change that moves it.
- **Never touch `amount` / `baseAmount` / currency semantics.** This skill
  moves display strings. If a finding sits next to money-handling code, move
  the string and leave the numbers, the field names, and the rounding
  untouched — see `docs/currency.md` for why those are load-bearing.
- **Never translate the `x-crm-*` header values in `apps/app/lib/agent-record.ts`.**
  They're wire protocol read by `apps/app/app/eve/v1/[...path]/route.ts`, not
  copy. See "agent-record.ts" above.
- **`packages/ui` never imports `next-intl`.** No exception, no "just this
  once" — it uses `UiStringsProvider` only.
- **Never edit an allowlist entry to silence a real finding.**
  `apps/app/scripts/i18n/allowlist.json` exists for brand names, vendor names,
  protocol acronyms, and locale-neutral values (see its existing entries) — it
  is not a way to make an inconvenient finding disappear. If the checker
  correctly found translatable prose, add a key for it. Do not add it to the
  allowlist.

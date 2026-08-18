---
name: healthcare-relabel
description: Relabel message-catalog VALUES from one vocabulary to another (currently sales→healthcare) across en+vi, one subagent per namespace, with hard ICU-safety rules and an orchestrator diff review. Re-runnable; references/terminology.md is the single source of truth.
---

# Healthcare relabel — catalog vocabulary swap

Rewrites the VALUES of `apps/app/messages/{en,vi}/<namespace>.json` according to
`references/terminology.md`. Keys, ICU argument names, tags and file shape never
change. The workflow is generic: to change a term later, edit terminology.md and
re-run the affected namespaces.

## Workflow

1. Read `references/terminology.md` in full.
2. For each namespace (`common`, `nav`, `settings`, `deals`, `companies`,
   `contacts`, `dashboard`, `landing`, `agent-panel`) spawn ONE subagent
   (haiku-class) given BOTH the en and vi file of that namespace, plus
   terminology.md. `ui` is verify-only: assert zero old-vocabulary values and
   that `messages/en/ui.json` still mirrors
   `packages/ui/src/lib/ui-strings.ts` `DEFAULT_UI_STRINGS`; change nothing.
3. Hard rules in every subagent prompt:
   - Rewrite VALUES only. Never touch a key. Never add/remove/reorder keys.
   - Never add, remove or rename an ICU argument or tag. `{company}` stays
     `{company}` even when the visible word becomes "organization".
   - Never restructure a `t.raw`-consumed key: `common.json` `relativeTime*`
     feeds a literal `split("{count}")` script that does not parse ICU.
   - Skip ALL `deals.json` `stage*` keys (17 of them) — owned by Phase 2.
   - Never touch `settings.json` `general.language*` endonyms.
   - Leave brand names alone (Comp AI, Gmail, Outlook, Slack, LinkedIn,
     Google, Microsoft, Context).
   - Apply the keep-list and per-string decisions from terminology.md exactly.
   - en and vi must land the same decision per key.
4. Over-replacement review (orchestrator, not the subagent): after each
   namespace, read the `git diff` of the two files against terminology.md.
   Hunt WRONG replacements — generic UI verbs rewritten ("Close" dialog
   buttons must never become "Convert"/"Enroll"), "contact" as a verb turned
   into "client", over-applied "Client" in agent-panel prose. Re-dispatch the
   namespace on a bad diff.
5. Gates after all namespaces: `bun run i18n:check`, `bun run i18n:catalogs`
   (root script), `bun run check-types`. Re-dispatch the failing namespace on
   a comparator failure.
6. Grep sweep for leftovers (values only), triaged against the keep-list:
   `grep -riE '\b(deal|company|contact|prospect|lead)\b' apps/app/messages/en/ | grep -v '"stage'`

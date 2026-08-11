---
phase: 1
title: "i18n Foundation (next-intl)"
status: complete
priority: P1
dependencies: []
---

# Phase 1: i18n Foundation (next-intl)

## Overview

Install and wire next-intl in `apps/app` with no URL locale segment. Locale comes
from the `NEXT_LOCALE` cookie, falling back to `en`. Establishes the catalog layout
every later phase writes into.

First commit on the branch, and the one a human actually reviews line by line.

Step 1 is a compatibility spike, not boilerplate. `apps/app/next.config.ts:38` sets
`cacheComponents: true`, and next-intl's documented Next 16 answer for cached scopes
is `next/root-params`, which needs an `app/[locale]/` segment this design does not
have. Prove the cookie path builds before writing anything else.

## Requirements

- next-intl pinned to an exact version. Latest is `4.13.6` (published 2026-08-10),
  peer range `next: ^12 || ^13 || ^14 || ^15 || ^16` — satisfied by `next` 16.3.0.
  No caret; a bleeding-edge pairing must not float.
- `getRequestConfig` reads `NEXT_LOCALE`, falls back to `"en"`, and rejects any
  value not in the supported list.
- `NextIntlClientProvider` inside the existing root provider stack.
- `<html lang>` reflects the active locale.
- Catalogs at `apps/app/messages/en/<namespace>.json`, merged per namespace.
- No middleware, no `[locale]` route segment, no link rewriting.
- No new environment variables. No `.env` change.

## Architecture

**Locale resolution.** One function, `resolveLocale()`, in `apps/app/i18n/locale.ts`:
read `NEXT_LOCALE` via `next/headers` `cookies()`, validate against
`SUPPORTED_LOCALES = ["en"] as const`, return `DEFAULT_LOCALE` on miss. Phase 2 adds
the DB as the cookie's source of truth; phase 9 adds `"vi"` to the tuple. Keeping
the tuple one-element-wide now is deliberate — it makes the pseudo-locale a build-time
concern rather than a shipped locale.

**Catalog merge.** `getRequestConfig` imports each namespace file and returns a
single nested object keyed by namespace, so `useTranslations("settings")` resolves
`messages/en/settings.json`. Static imports, not dynamic `import()` by variable —
with one locale a glob adds a bundler edge case for nothing (YAGNI). Phase 9 revisits
when `vi` lands.

**Namespaces** (fixed now so phases 6–8 never invent one):
`common`, `nav`, `settings`, `deals`, `companies`, `contacts`, `dashboard`,
`landing`, `agent-panel`, `ui`.

`ui` is the override source for `packages/ui` (phase 5), not a next-intl consumer.

**cacheComponents interaction.** `cookies()` is request-bound, so any scope reading
it cannot be statically prerendered. Two facts make this survivable:

- There are **no `"use cache"` directives in app source** — verified; the 8 grep hits
  are all in generated `.next/dev/types/cache-life.d.ts`. Nothing is currently inside
  a cache scope that could call `getTranslations()`.
- `apps/app/lib/trpc/server.ts:21` already `await cookies()`, so every page that
  prefetches through server tRPC is dynamic today. The cookie read adds no new
  dynamism to those routes.

The exposure is the root layout. Reading the cookie directly in
`apps/app/app/layout.tsx` puts the read above every `Suspense` boundary and forces
the entire app dynamic, including `(landing)` pages that prerender today. Mitigation:
an async `LocaleProvider` server component that does the cookie read and renders
`NextIntlClientProvider`, mounted inside a `Suspense` boundary, so `<html>`, fonts
and `<body>` still prerender while the translated tree streams.

`<html lang>` is the remaining snag — it sits above that boundary. Set it from the
same async read only if the spike shows the cost is acceptable; otherwise leave
`lang="en"` static this round and let phase 2's client switcher patch
`document.documentElement.lang`, and record it as a known limitation. Do not
introduce a `[locale]` segment to solve it.

## Related Code Files

- Create: `apps/app/i18n/request.ts` — `getRequestConfig`, namespace merge
- Create: `apps/app/i18n/locale.ts` — `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `resolveLocale()`, `LOCALE_COOKIE`
- Create: `apps/app/components/locale-provider.tsx` — async server component, cookie read + `NextIntlClientProvider`
- Create: `apps/app/messages/en/{common,nav,settings,deals,companies,contacts,dashboard,landing,agent-panel,ui}.json` — ten files, `{}` placeholders
- Modify: `apps/app/package.json` — add pinned `next-intl`
- Modify: `apps/app/next.config.ts` — add the next-intl plugin wrapper; keep `cacheComponents`, `transpilePackages`, `serverExternalPackages` untouched
- Modify: `apps/app/app/layout.tsx` — `LocaleProvider` into the stack at lines 50-57; `<html lang>` at line 44 per the spike outcome

## Implementation Steps

1. **Spike, timeboxed to 90 minutes, before any other file.** On a throwaway commit:
   add `next-intl@4.13.6`, a minimal `getRequestConfig` reading `cookies()`, one
   `t()` call in `apps/app/app/(app)/[slug]/page.tsx`, then `bun run build`.
   Record: does it build; are `(landing)` pages still prerendered; does any route
   error with `cookies was called outside a request scope`.
   - Builds clean → continue at step 2.
   - Fails only on `(landing)` prerender → adopt the `Suspense`-scoped provider,
     continue.
   - Fails broadly → **remove `cacheComponents` from `next.config.ts` and
     continue.** Pre-authorized (plan.md Validation Log, Session 1): the flag is
     verified unused — zero `"use cache"` directives in app source — so removal
     changes nothing today. Record in the spike result that it was removed and why,
     and carry the implication into `docs/i18n.md` (phase 9): re-enabling it later
     requires solving locale-dynamic scopes, likely `next/root-params` + a URL
     segment. Never add a `[locale]` segment in this round.
<!-- Updated: Validation Session 1 - spike fallback ladder pre-authorized, replaces stop-and-escalate -->
2. Add `next-intl` at the exact version to `apps/app/package.json` dependencies.
   `bun install`. Confirm `bun.lock` records one resolution.
3. Write `apps/app/i18n/locale.ts`. Export `LOCALE_COOKIE = "NEXT_LOCALE"` from here
   — phase 2 and phase 3 both import it; two spellings of the cookie name is a
   silent-failure bug.
4. Write `apps/app/i18n/request.ts`. Import the ten namespace JSON files statically,
   assemble `{ locale, messages: { common: …, nav: … } }`. Set `timeZone` explicitly
   to avoid a server/client mismatch warning.
5. Create the ten catalog files containing `{}`. Biome formats JSON with tabs — run
   `bun run format` so the first real commit is not a whitespace diff.
6. Write `apps/app/components/locale-provider.tsx`: async, awaits `resolveLocale()`,
   renders `<NextIntlClientProvider locale={locale}>`. Messages are inherited from
   the request config; do not pass them as a prop.
7. Wire `next.config.ts` with the next-intl plugin pointing at `./i18n/request.ts`.
   Preserve the existing `loadRootEnv()` call and every current key.
8. Edit `apps/app/app/layout.tsx`. Mount `LocaleProvider` outside `TooltipProvider`
   and inside `TRPCReactProvider`, so translated content and tRPC share a boundary.
   `Toaster` (line 54) must stay inside it — phases 6–8 translate toast strings.
9. Prove the loop: add `common.appName` to `messages/en/common.json`, render it in
   one server component and one client component, `bun run build`, then delete the
   client probe and keep the server one.
10. `bun run check-types && bun run lint`. Commit.

## Spike result

Run on the `ad1d702` base, 2026-08-11. Three builds:

1. Plugin + `getRequestConfig` reading `cookies()` + one `getTranslations` call
   inside `[slug]`'s existing `Suspense`-scoped async component: **builds clean**,
   route table byte-identical to baseline (`/` still `○` static).
2. `LocaleProvider` mounted naked in the root layout: **fails broadly** — every
   prerendered route errors with `Next.js encountered uncached or runtime data
   during prerendering` (cookie read above every boundary), exactly the predicted
   failure.
3. `LocaleProvider` inside a `Suspense` boundary in the root layout: **builds
   clean with `cacheComponents: true` retained.** No fallback-ladder escalation
   needed; `cacheComponents` was not removed.

Prerender status vs baseline: `/` went `○` static → `◐` partial prerender — the
document shell (html, fonts, body) still prerenders (3.9KB static shell, postponed
body) and the translated tree streams, the mitigation the plan pre-accepted.
`/sign-in` unchanged `◐`. `/grant-access`, `/onboarding`, `/onboarding/research`
**improved** `ƒ` dynamic → `◐` partial prerender (the new root boundary gives them
a prerenderable shell). All `[slug]/**` unchanged `◐`. `/t/crm.js` unchanged `○`.

`<html lang>` stays static `lang="en"` this round — it sits above the Suspense
boundary, and reading the cookie there re-trips the broad failure from build 2.
Phase 2's client switcher patches `document.documentElement.lang`; known
limitation recorded per the plan.

Loop proof: `common.appName` rendered via one server (`getTranslations`) and one
client (`useTranslations`) probe on `/` under `IS_MARKETING=true` — identical
output (`Comp AI CRM`) with no cookie, `NEXT_LOCALE=en`, and `NEXT_LOCALE=zz`
(fallback, no throw). Deviation from step 9: both probes were then removed, not
just the client one — the only place a kept server probe could render without
changing visible output is a page owned by phase 6 or 8, and a hidden DOM node
would violate the no-visual-change rule. The catalog keeps `appName`; phase 6's
`generateMetadata` conversion consumes it.

## Success Criteria

- [x] `next-intl` present at an exact pinned version in `apps/app/package.json` and `bun.lock`.
- [x] `bun run build` succeeds with `cacheComponents: true` still enabled in `next.config.ts`.
- [x] Spike outcome written into this file under a short "Spike result" heading — build status, prerender status, chosen `<html lang>` approach.
- [x] Setting `NEXT_LOCALE=en` by hand resolves; setting `NEXT_LOCALE=zz` falls back to `en` and does not throw.
- [x] All ten namespace files exist and load; a missing namespace is a build error, not a runtime blank.
- [x] One `useTranslations` and one `getTranslations` call site render identical output.
- [x] `bun run check-types` and `bun run lint` clean.
- [x] No new env var; `.env.example` untouched.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| `cacheComponents` rejects the cookie read | High × High | Step 1 spike gates the whole phase. Fallback pre-authorized: drop the (verified unused) flag; never a URL segment. |
| Root-layout cookie read makes every route dynamic, `(landing)` loses prerender | High × Med | `Suspense`-scoped async provider; measure `(landing)` in the spike specifically. |
| next-intl 4.x + Next 16.3 edge bug mid-migration | Med × High | Exact pin. Land this commit first and early so a break surfaces before 130 files depend on it. |
| Cookie name drifts between phases | Med × Med | Single `LOCALE_COOKIE` export in `i18n/locale.ts`; phases 2 and 3 import it. |
| `<html lang>` stays `en` while content is translated | Med × Low | Accepted, documented limitation this round; client-side patch on switch. Only affects a11y and browser translate prompts, and `vi` does not ship yet. |
| Plugin wrapper drops a `next.config.ts` key | Low × High | Diff the config before and after; `transpilePackages` and `serverExternalPackages` are load-bearing. |

**Rollback.** Self-contained. Revert the commit: new directories vanish, `layout.tsx`
returns to its current 62 lines, `package.json` loses one dependency. Nothing else
imports from `i18n/` yet.

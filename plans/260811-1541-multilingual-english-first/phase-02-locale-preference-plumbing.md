---
phase: 2
title: "Locale Preference Plumbing"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Locale Preference Plumbing

## Overview

Make the locale durable. Nullable `locale` column on the user row, one tRPC mutation
to write it, a Settings control that writes both DB and cookie, and a sync that
restores the cookie from the DB when it is missing.

Data plumbing only. No intelligence in the API — it writes a column, per
`AGENTS.md` and `docs/api.md`.

## Requirements

- `locale String?` on the user model. Nullable: existing rows must not be
  backfilled, and null means "never chose", which is distinct from "chose English".
- Exactly one mutation, `users.setLocale`. Validates against the supported list
  server-side; a client is not trusted to send a valid tag.
- Settings control writes DB then cookie. Cookie is the fast path next-intl reads;
  DB is the durable record.
- The switcher **ships visible even while English is the only option** — explicit
  user decision (plan.md Validation Log, Session 1). Do not hide it behind a
  locale-count check or defer it to the Vietnamese round.
<!-- Updated: Validation Session 1 - switcher ships visible with a single locale -->
- On load, a null-cookie-with-non-null-DB state re-seeds the cookie.
- No new env vars.

## Architecture

**Why both DB and cookie.** The cookie is what `getRequestConfig` can read cheaply
on every request (`apps/app/i18n/locale.ts` from phase 1). The DB is what survives a
new browser. Cookie is a cache; DB is truth. When they disagree, DB wins and rewrites
the cookie.

**Sync point.** Not a middleware — this design has none, and adding one for this
would reintroduce the request-interception the routing decision rejected. Instead
`apps/app/app/(app)/[slug]/layout.tsx` already runs on every signed-in route and
already awaits a session. Do the reconciliation there: if no `NEXT_LOCALE` cookie and
`session.user.locale` is set, write the cookie. Signed-out `(landing)` routes keep
cookie-or-default, which is correct — there is no user to read a preference from.

A server component cannot set a cookie during render. The write goes through a
small Server Action invoked from the layout's client boundary, or on the next
mutation. Prefer the Server Action; it keeps the read path pure.

**Cookie attributes.** `path=/`, `sameSite=lax`, one year, **not** `httpOnly` — the
client switcher writes it directly for instant feedback before the round trip.
Nothing secret is in it.

**Where the column lives.** Better-auth owns the `user` table
(`packages/db/prisma/schema.prisma:15-51`, `@@map("user")`). Adding a plain nullable
scalar does not disturb better-auth's own field mapping, but the generated
`Session.user` type comes from `@crm/auth`. Verify `session.user.locale` is actually
present after `prisma generate`; if better-auth's session projection strips unknown
columns, read the user row directly in the layout instead of threading it through
the session. **Check this before writing the sync — do not assume the field appears.**

**Migration.** Hand-written SQL under
`packages/db/prisma/migrations/<timestamp>_user_locale/`, matching the existing
`YYYYMMDDHHMMSS_snake_case` convention (`20260807120000_outlook_mail`). Generated via
`bun run db:migrate`, never `db:push` (`CONTRIBUTING.md`).

## Related Code Files

- Modify: `packages/db/prisma/schema.prisma` — `locale String?` on `model User` (lines 15-51)
- Create: `packages/db/prisma/migrations/<timestamp>_user_locale/migration.sql`
- Modify: `apps/api/src/users/users.router.ts` — add `@Mutation() setLocale`; file is currently 25 lines with two `@Query()` (lines 16-24)
- Modify: `apps/api/src/users/users.service.ts` — `setLocale(userId, locale)`, the only Prisma call
- Modify: `apps/api/src/generated/server.ts` — regenerated and committed, never built
- Create: `apps/app/app/(app)/[slug]/settings/language-form.tsx` — the switcher
- Create: `apps/app/lib/locale.ts` — client cookie write + `setLocale` Server Action
- Modify: `apps/app/app/(app)/[slug]/settings/page.tsx` — mount `LanguageForm`, prefetch alongside the four existing prefetches (lines 50-55)
- Modify: `apps/app/app/(app)/[slug]/layout.tsx` — cookie/DB reconciliation

## Implementation Steps

1. Read `docs/api.md` "tRPC is the data surface" section before touching `apps/api`.
   Router thin, zod in, service call out, Prisma only in `*.service.ts`,
   `@UseMiddlewares(AuthMiddleware)` — absence of it means public.
2. Add `locale String?` to `model User`. Place it near `image` (line 20), with the
   scalars, not among the relation blocks.
3. `bun run db:migrate`, name it `user_locale`. Inspect the generated SQL: it must be
   a single `ALTER TABLE "user" ADD COLUMN "locale" TEXT;` with no default and no
   `NOT NULL`. Anything else means the schema edit was wrong.
4. `UsersService.setLocale(userId, locale)` → `db.user.update`. Return the stored
   value so the client can confirm rather than assume.
5. Add the mutation to `UsersRouter`. Reuse the existing `@Ctx() ctx: AuthedTrpcContext`
   pattern from `me()` at line 17 for the user id — never take `userId` from input.
   Zod input: `z.object({ locale: z.enum(["en"]) })`, widened in phase 9 when `vi`
   lands.
6. `bun run --filter=api trpc:generate` and commit `apps/api/src/generated/server.ts`.
   **Required** — `build` never regenerates it (`docs/api.md:139`,
   `CONTRIBUTING.md:58`), so the app cannot see the procedure until this is committed.
7. Verify `session.user.locale` exists on the `@crm/auth` session type. If absent,
   switch the layout to a direct `db.user.findUnique` select and note it here.
8. `apps/app/lib/locale.ts`: a client helper writing `document.cookie` with the
   attributes above, importing `LOCALE_COOKIE` from `apps/app/i18n/locale.ts` — do
   not retype the literal; and a `"use server"` action for the server-side write.
9. `language-form.tsx`: a `<Select>` from `@crm/ui/components/select`. Match the
   shape of the sibling `agent-model.tsx` control rather than inventing a layout —
   `docs/design.md` forbids visual deviation, and this is a new control on an
   existing page. Its own labels are hardcoded English for now; phase 6 owns
   extracting them along with the rest of settings.
10. On change: write the cookie, call the mutation, then `router.refresh()` so server
    components re-render under the new locale. Optimistic cookie write first means
    the UI does not wait on the round trip.
11. Mount in `settings/page.tsx` inside the existing `<HydrateClient>` block
    (lines 58-64).
12. Layout reconciliation: no cookie + DB value present → set cookie.
13. `bun run check-types`, `bun run lint`, `bun run test`. Commit.

## Success Criteria

- [ ] Migration applies to a clean DB via `bun run db:deploy`; column is nullable with no default.
- [ ] Existing user rows read back `locale: null` after migrating — no backfill.
- [ ] `users.setLocale` visible to the app; calling it persists and returns the value.
- [ ] Mutation rejects an unsupported tag with a domain error, not a 500.
- [ ] Mutation cannot write another user's row — id comes from `ctx.user.id`.
- [ ] Switcher writes both DB and `NEXT_LOCALE`; a reload keeps the choice.
- [ ] Deleting the cookie and reloading a signed-in route restores it from the DB.
- [ ] Signed-out `(landing)` routes still render at the default with no cookie and no crash.
- [ ] `apps/api/src/generated/server.ts` committed in the same commit as the router change.
- [ ] Settings page is visually unchanged apart from the new control.

## Risk Assessment

| Risk | L×I | Mitigation |
| --- | --- | --- |
| `generated/server.ts` not committed → app cannot see the procedure | High × Med | Step 6 is explicit; failure is loud and immediate at the call site. |
| better-auth session type omits `locale` | Med × Med | Step 7 verifies before the sync is written; documented fallback to a direct query. |
| Cookie and DB diverge after a failed mutation | Med × Med | Cookie written optimistically, DB is truth, reconciliation re-seeds on next load. Worst case is one stale session. |
| Non-`httpOnly` cookie flagged in review | Low × Low | Deliberate: a UI language is not a secret and the client must write it. Note it in the PR. |
| Migration edited after being applied elsewhere | Low × High | Never edit an applied migration; add a new one. Standard Prisma rule. |
| `router.refresh()` does not re-render server content | Med × Low | Fall back to a full reload on switch. Locale changes are rare; correctness beats smoothness. |

**Rollback.** Two parts. Code reverts cleanly. The column does **not** — a dropped
column loses saved preferences. Leave `locale` in place if the feature is reverted;
a nullable unread column costs nothing. Only drop it if the whole feature is
abandoned, via a new forward migration.

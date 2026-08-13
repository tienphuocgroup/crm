---
phase: 4
title: "Clinic seed and gates"
status: done
priority: P2
dependencies: [1, 2, 3]
effort: "3d"
---

# Phase 4: Clinic seed and gates

## Overview

Rewrite the seed flavor from B2B SaaS compliance sales to premium care, then run
the full verification pass for the whole plan: gates, pseudo-locale walk, native
Vietnamese review.

## Requirements

- Functional: `bun run db:seed` yields a believable clinic pipeline — clients,
  a few organizations (corporate wellness partner, insurer, referral partner),
  journeys across the six stages, some journeys with no organization,
  healthcare-flavored activities.
- Non-functional: seed stays deterministic (PRNG seed), idempotent, and keeps
  the currency rules (`baseAmount` + `baseCurrency` written in the same
  statement — docs/currency.md names `prisma/seed.ts` as a writer).

## Architecture

`packages/db/prisma/seed.ts` (786 lines, deterministic PRNG `20260731`) keeps
its structure; only the data tables change:

- Owners: clinic staff emails/roles instead of `@trycomp.ai` sales reps.
- Companies → a small set of organizations: corporate wellness accounts,
  an insurer, referral partners. Fewer than today's ~20 SaaS brands — most
  journeys hang off clients directly (Phase 3).
- Contacts → clients: individual names, personal email domains, no job titles
  like "Head of Security" — use referral source / preferred channel style notes.
- `DEAL_DESCRIPTIONS` → program enrollments (longevity program, executive
  health screening, physio package, IV therapy series, annual membership).
- `LOST_REASONS`, `NOTE_BODIES`, `CALL_SUBJECTS`, `TASK_SUBJECTS`,
  `MEETING_SUBJECTS`, `EMAIL_SUBJECTS` → consults, follow-ups, no-shows,
  renewal conversations.
- Stage pools: new enum via `OPEN_DEAL_STAGES`/`CLOSED_DEAL_STAGES` (already
  mechanically updated in Phase 2); keep the ~35% closed ratio.
- Currencies: keep the existing multi-currency mix (VND is not in the supported
  11 — docs/currency.md — and adding a currency is out of scope).

## Related Code Files

- Modify: `packages/db/prisma/seed.ts` — data tables only (lines ~48-314, 487)
- No other code changes; this phase is otherwise verification.

## Implementation Steps

1. Rewrite seed data tables. `bun run db:reset && bun run db:seed` locally.
2. Full gate run: `bun run check-types && bun run lint && bun run test`,
   `bun run i18n:check`, `bun run i18n:catalogs` (root script), `bun run i18n:pseudo`.
3. Ask the user to start the dev servers (never start them yourself) and walk:
   dashboard, deals table + facets + bulk actions, create journey (with and
   without org, from a client), stage menu + stepper, timeline stage history,
   contact/company/deal sheets, agent-builder event picker, settings. First with
   `NEXT_LOCALE=pseudo` (unaccented glyph = missed string), then `vi`, then `en`.
4. Native Vietnamese review of terminology.md terms + the vi catalogs touched
   (~15h estimate from brainstorm; the terms are centralized, so a term change
   is a terminology.md edit + skill re-run + comparator gate).
5. Fold review corrections back; re-run gates.

## Success Criteria

- [ ] Fresh clone path works: `db:reset`, `db:seed`, seeded dashboard tells a
      clinic story with zero sales vocabulary.
- [ ] All gates green; pre-push hook passes.
- [ ] Pseudo walk found no unaccented strings outside the allowlist.
- [ ] Native reviewer signed off vi terms, or user explicitly waived it.

## Risk Assessment

- RISK — seed favicon/brand-resolution logic expects real company domains;
  fictional clinic orgs may render grey initials. Acceptable for seed; verify
  it degrades gracefully.
- RISK — native review changes a core term late (e.g. "Hành trình"). Contained:
  terminology.md is the single source; re-run is cheap by design.
- NOT DONE (deliberately) — landing-page positioning rewrite, membership fields,
  visits surface, CSV import, Documents: Phases B–D of the roadmap, separate plans.

# Healthcare CRM Reshape — Product 80/20 Review

- Date: 2026-08-13
- Type: brainstorm product review (advisory, no implementation)
- Input: `plans/reports/brainstorm-260813-1601-healthcare-crm-reshape-report.md`
- Scouts: 3 low-cost subagents (rename cost, i18n exposure, infra reuse)
- Rules/skills read: AGENTS.md, docs/design.md, development-rules.md, brainstorm skill + problem-first reference

## 1. Verdict

The reshape report picks the right destination and the wrong order. Phase 1 spends the most effort on the least visible work. The agent wedge ships last, in Phase 4. Invert it.

The vital 20%: presentation-layer vocabulary, healthcare stages in the existing enum, optional Organization on Journey, agent follow-up autopilot, membership on custom fields, visits surface. This set ships a healthcare product in about 5–6 weeks.

The deferred 80% of cost: schema rename, stage table, Membership entity, role-gated Documents, practice presets. These add polish, not proof.

## 2. Scout corrections to the report

| Report claim | Verified reality | Consequence |
| --- | --- | --- |
| ~1,512 catalog keys at risk | 971 keys total; 112 carry sales vocab; 29 carry "contact" | VI re-translation is ~15 native-speaker hours, not a rebuild |
| Phase 1 = domain rename (schema + code) | Rename touches 700–830 files per model, two Postgres enums, event names stored in `AgentTrigger` JSON, tRPC router names | 3–4 weeks mechanical work, high regression risk, zero user-visible gain |
| Membership = new entity (Phase 2) | Custom fields support SELECT/DATE, agent-fillable flag, `set_field_value`, `schedule_recheck` | Membership v1 = 4 field definitions + agent prose. Days |
| Appointments surface = Phase 2 build | `CalendarEvent`, attendees, MEETING timeline entries already exist | Widget work only. Days |
| Documents = Phase 3 with role gates | Blob storage is image-only (3MB); attachments live as DB bytes; roles are owner/member only | Largest new build in the plan. Role gating needs an authz layer that does not exist |

Key files: `apps/app/messages/{en,vi}/*.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/crm-events.ts`, `apps/api/src/dashboard/dashboard.service.ts`, `apps/api/src/fields/fields.service.ts`, `apps/api/src/google/calendar-sync.service.ts`, `packages/db/src/blob.ts`.

## 3. The data gap the plan does not name

The flagship retention jobs read visit data. Renewal watch, lapsed-guest reactivation, and visit-cadence signals all need visits. Calendar sync captures rep consultations. It does not capture spa or clinic visits. Those live in the PMS (Zenoti, Mindbody, local booking). The plan names no feed from the PMS. Without a feed, Phase 4 retention features run on empty tables.

Acquisition data is already first-party and present: intake endpoint, email sync, calendar consultations. So v1 value must lean on acquisition and follow-up. Retention needs one cheap ingest first. A CSV visit/client import is the cheapest bridge. PMS APIs come later.

## 4. The 80/20 core (recommended v1)

| # | Change | Cost | Value |
| --- | --- | --- | --- |
| 1 | Vocabulary relabel, presentation layer only. 112 + 29 key values, en + vi, one person term ("Client" / "Khách hàng"). No presets | 2–4 days | Whole UI reads healthcare |
| 2 | Healthcare stages inside the existing enum: INQUIRY → CONSULT_BOOKED → CONSULT_DONE → PROPOSAL_SENT → ENROLLED / LOST. Kanban + dashboard KPI relabel + clinic seed data | ~1 week | Pipeline and demo tell the healthcare story |
| 3 | Make `companyId` optional on Deal. UI creates journeys from a client | 1–2 days | Client-first model becomes real |
| 4 | Agent reshape now, not Phase 4: first-party boundary for individuals (capability scoping + `data-boundaries.md` rewrite), follow-up autopilot, no-show recovery, renewal watch via `schedule_recheck` | 1–2 weeks | The wedge. The reason to buy |
| 5 | Membership on custom fields: program, status, renewal date, enrolled date. Renewals-due dashboard widget | 2–3 days | Renewal watch has data to read |
| 6 | "Upcoming visits" widget + record tab from `CalendarEvent` | 2–4 days | Front desk sees the day |
| 7 | CSV client/visit import | 3–5 days | Feeds retention; doubles as operator onboarding path |

Total: about 5–6 weeks for one developer. Every item reuses existing machinery.

## 5. Deferred, with revisit triggers

| Item | Why defer | Revisit trigger |
| --- | --- | --- |
| Schema rename (Deal→Journey, Contact→Client, Company→Organization) | Zero visible value; 3–4 weeks; breaks stored trigger configs, event catalog, tRPC contracts | Rename module-by-module when other work touches a module. Never as a big bang |
| Stage enum → table | v1 needs one good stage set, not configurability | Second practice type onboards with incompatible stages |
| Membership entity | Custom fields carry v1 | Renewal watch proves usage; reporting needs joins |
| Documents with role gates | Largest new build; no per-record authz layer exists | Secretary persona validated — then build minimal uploads first, gates second |
| Practice presets (Patient/Client/Guest) | One term serves launch; ICU `select` mechanism costs ~1 day when needed | First hospital deal demands "Patient" |
| Zalo, feedback loop | Unchanged from original Phase 5 | Market signal |

Documents v0 alternative: link documents from Drive via a URL custom field or activity notes. Zero build. Validates the secretary workflow before storage work.

## 6. Problem-first check (condensed)

- Underlying problem: premium care operators lose revenue when follow-ups, renewals, and lapsed guests slip. Staff hold the client story in fragments.
- The reshape also solves a blocker: sales vocabulary alienates care staff.
- Evidence status: medium for vocabulary and acquisition flow (owner market knowledge, existing intake). Weak for secretary/documents. Weak for retention until a visit feed exists.
- Cheapest validation: run v1 with one real operator. Measure the original report's §13 metrics.

## 7. Revised phasing

| Phase | Scope | Weeks |
| --- | --- | --- |
| A. Face | Items 1–3: relabel, stages, optional org, seed, KPIs | 1–2 |
| B. Wedge | Items 4–5: agent boundary, autopilot, membership fields | 2–4 |
| C. Data | Items 6–7: visits surface, CSV import | 4–6 |
| D. Later | Documents build, presets, stage table, entity promotion, Zalo | after validation |

Phase A alone makes every demo healthcare-shaped. Locked decisions 1–4 from the original report all survive this cut.

## 8. Issues

1. RISK — Retention agent jobs read visit data that no feed supplies. Fix: CSV import in Phase C; PMS API later.
2. RISK — Scout hour estimates come from a low-cost model and are directional. Fix: /ck:plan re-estimates per phase.
3. NOT DONE — CSV import existence in code is unverified. Fix: verify during Phase C planning.
4. RISK — Deferring the schema rename leaves sales names in code under healthcare UI copy. Developer confusion grows over time. Fix: opportunistic per-module rename.
5. RISK — Enum value swap still migrates existing Deal rows. Fix: stage-mapping migration in the Phase A plan.
6. UNKNOWN — Production data state on the fork (original report risk 6) is unverified.

## Unresolved questions

1. Is the medical secretary a launch persona or a fast-follow? This decides Documents scope.
2. Which PMS do the first target operators run? This decides the visit-data bridge.
3. Vietnamese person terms need a native reviewer (carried from the original report).

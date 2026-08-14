# Healthcare & Wellness CRM Reshape — Product Proposal (v2)

- Date: 2026-08-13 (v1 16:01; v2 17:45 after product 80/20 review)
- Type: brainstorm report (product perspective, no implementation)
- Decided with: Luan (4 discovery decisions in v1; 4 scope decisions in v2)
- Scouted by: 4 subagents (v1) + 3 verification subagents (v2: rename cost, i18n exposure, infra reuse)
- Companion: `brainstorm-product-review-260813-1740-healthcare-8020-cut-report.md` (full scout data)
- Flags: none

## 1. Problem statement

Comp AI CRM is an agent-first B2B sales CRM. The target market changes to healthcare and wellness operators: high-end hospitals, longevity clinics, spas, general health clinics. Primary users: sales reps and customer service reps. Secondary users: marketing, medical secretary (attaches reports and results to client records).

Requirements:
- Retain the agent-first philosophy and core CRM features.
- Replace the B2B sales vocabulary and features with a healthcare service vibe.
- Do not build a HIPAA/compliance system. Apply light privacy sensibility only.
- 80/20 rule: do the 20% of changes perfectly to reach 80% of the target shift.

## 2. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Primary record | Client-first. Company becomes Organization (corporate wellness, insurers, referral partners) |
| 2 | Deal concept | All three: Journey pipeline + Membership/renewals + Appointments surface |
| 3 | Divergence from upstream | Hard fork. Upstream sync ends |
| 4 | Agent stance on individuals | First-party data only. Web research reserved for Organizations |
| 5 | Rename strategy (v2) | Relabel only, at the i18n layer. No schema/code rename. A repo-local Claude Code skill drives a cheap model (haiku) over the catalogs. Schema keeps Deal/Company/Contact; modules rename opportunistically when other work touches them |
| 6 | Documents v1 (v2) | Minimal uploads, no role gates. Documents tab on Client, all-staff visibility. Role gating waits for secretary-persona validation |
| 7 | Retention data bridge (v2) | CSV client/visit import in v1. PMS APIs (Zenoti/Mindbody/local) later |
| 8 | Roadmap order (v2) | 80/20 inversion: face → wedge → data → documents. Architecture-purity work deferred behind explicit triggers |

Decision 2 interpretation: three coexisting commercial objects. Appointment is a synced surface, not the pipeline unit. The booking system (PMS) stays the source of truth for scheduling.

## 3. Codebase reality (verified by v2 scouts)

- i18n: 971 catalog keys (not ~1,512), en + vi at parity. 112 keys carry sales vocabulary; 29 carry "contact". VI re-translation ≈ 15 native-speaker hours. `i18n:check` + pseudo-locale guard sweeps.
- Rename penetration: 700–830 files per model, two Postgres enums (`DealStage`, `FieldEntity`), event names (`deal.stage.changed`…) stored as strings in `AgentTrigger` config JSON, public tRPC router names. Full rename = 3–4 weeks, high regression risk, zero user-visible gain. Basis of decision 5.
- Custom fields are mature: 10 types incl. SELECT/DATE, per entity, `agentFilled` flag, `set_field_value` + `list_fields` agent tools. Membership v1 fits here with no schema change.
- `CalendarEvent` + attendees + MEETING timeline entries exist. Appointments surface = widget work.
- Blob storage is image-only (3MB); record attachments do not exist; roles are owner/member only. Documents is the largest new build; role gating needs an authz layer that does not exist. Basis of decision 6.
- Stage enum swap is a contained migration; stage→table is medium-large (dashboard queries, kanban, agent triggers).
- Key files: `apps/app/messages/{en,vi}/*.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/crm-events.ts`, `apps/api/src/dashboard/dashboard.service.ts`, `apps/api/src/fields/fields.service.ts`, `apps/api/src/google/calendar-sync.service.ts`, `packages/db/src/blob.ts`.

## 4. Positioning

**"The relationship engine for premium care."**

- Not a booking system. Zenoti/Mindbody own scheduling; we display and react to appointments, never create them.
- Not a compliance EMR. Salesforce Health Cloud owns that; we hold relationship data, not clinical charts.
- The wedge: an agent that knows every client's story and never lets a follow-up, renewal, or lapsed guest slip. The CRM is where the agent keeps its notes about your clients.

Agent-first survives untouched: nothing about a person is guessed; evidence is priced; strong evidence writes, weak evidence becomes a suggestion a human settles.

## 5. The data gap (v2)

Retention jobs read visit data. Renewal watch, lapsed reactivation, and visit cadence all need visits. Calendar sync captures rep consultations, not spa/clinic visits — those live in the PMS. Acquisition data is already first-party and present (intake endpoint, email sync, calendar). Therefore v1 leans acquisition-first, and the CSV import (decision 7) is the retention bridge. It doubles as the onboarding path for operators with existing client books.

## 6. Personas and day-one value

| Persona | Day-one value |
| --- | --- |
| Sales rep | Journey pipeline of inquiries → consultations → enrollments. Pre-visit brief before every consultation |
| Customer service rep | Full client story on one sheet: visits, threads, notes, membership status. Follow-up autopilot |
| Marketing | Inquiries & sources view (plain-language attribution), intake endpoint for web forms, custom agents on events |
| Medical secretary / front desk | Minimal Documents tab (uploads, all-staff visibility). Upcoming-visits surface |

## 7. Commercial object model (v2 scope)

| Object | Implementation v1 | Deferred |
| --- | --- | --- |
| **Client** | i18n relabel of Contact. Preferences, consent (do-not-contact, preferred channel), referred-by as custom fields | Dedicated columns; referral graph UI |
| **Organization** | i18n relabel of Company. `companyId` becomes optional on Deal (the one schema change). Journeys start from a client | — |
| **Journey** | i18n relabel of Deal. Stage enum value swap: INQUIRY → CONSULT_BOOKED → CONSULT_DONE → PROPOSAL_SENT → ENROLLED / LOST. Amount = package value | Stage enum → configurable table (trigger: second practice type with incompatible stages) |
| **Membership** | 4 custom fields on Client: program, status (active/paused/lapsed), renewal date, enrolled date. Renewals-due dashboard widget | Entity promotion (trigger: renewal watch proves usage; reporting needs joins) |
| **Appointment** | "Upcoming visits" widget + record tab over `CalendarEvent`; CSV visit rows | PMS API feed |
| **Document** | Minimal uploads on Client: extend blob past images, one tab, all-staff visibility | Role-gated visibility (trigger: secretary persona validated) |

Journey contact roles change: Decision maker/Champion/Billing → Client, Guardian/Family, Payer, Referrer (label-level).

## 8. Agent reshape

Boundary rule: **for individuals, first-party evidence only** — own email threads, intake forms, notes, visit history, appointments. LinkedIn/GitHub/web research is scoped off by record type, not deleted; Organizations keep full research. `data-boundaries.md` is rewritten: "nothing about a client is guessed, and nothing is googled."

Agent jobs, mapped to existing machinery — ship in Phase B, not last:

| Job | Reuses |
| --- | --- |
| Inquiry triage: intake → dedupe → summary → program-fit suggestion | intake endpoint, identity matching, ContactBrief |
| Pre-visit brief for reps before consultations | meeting-prep task kind, read_crm_history |
| Follow-up autopilot: post-treatment check-in, no-show recovery, 90-day lapsed reactivation | schedule_recheck + reasons shown to rep |
| Renewal watch: upcoming renewals + at-risk flag | schedule_recheck + membership custom fields (agentFilled) |
| Fact suggestions from first-party evidence | ContactFact evidence ledger |
| Custom agents on events (journey.stage.changed → Slack) | AgentDefinition/AgentTrigger, unchanged. Event names keep `deal.*` strings internally (decision 5); UI labels say journey |

Documents: agent sees titles and metadata, never parses file contents.

## 9. Module disposition

**Keep quietly:** multi-currency + fx, Gmail/Outlook + Calendar sync, Slack, custom fields, intake endpoint, evidence ledger, Agent tab, question box, agent builder, capability pattern.

**Reframe:** tracking → "Inquiries & sources"; dashboard KPIs → New inquiries, Consultation→Enrollment conversion, Revenue by program, Renewals due (30d), Lapsed clients (90d); win/lose → convert/lapse; seed/demo data → clinic-flavored.

**Drop:** GitHub identity matching for individuals, LinkedIn prospecting on clients, visitor-analytics framing, sales stage values.

**Add (v1):** minimal Documents tab, optional Organization, membership custom fields, visits surface, CSV import, clinic seed.
**Add (later, with triggers):** configurable pipelines, practice presets, front-desk/marketing roles + role gates, referral graph, Membership entity, Zalo, feedback loop.

## 10. Terminology

v1 ships **one person term: "Client" / "Khách hàng"** across both catalogs. 141 key values change (112 sales vocab + 29 "contact"); ~15 native-speaker hours for VI, incl. plural-message restructure.

Practice presets (Patient / Client-Member / Guest) are deferred. Mechanism when needed: ICU `select` on a preset id inside the existing catalogs (~1 day), not file duplication. Trigger: first hospital deal demands "Patient". The table stays `Client` at the label level, `Contact` in schema.

## 11. Evaluated approaches

Divergence (v1 decision 3): config-only reskin rejected (kills Documents); additive layer rejected by owner; **hard fork chosen**. v2 refines: the fork decision stands, but the rename decouples from it — relabel-only at the i18n layer (decision 5). "Hard fork" buys freedom to change schema when a change pays; it does not oblige a big-bang rename.

Deal metaphor (decision 2): three objects (§7). Appointment-as-pipeline-unit rejected — competes with PMS, loses.

Agent stance (decision 4): first-party only for individuals — chosen over full research (creepy for a care brand) and workspace toggle (no proven demand).

Roadmap (v2 decision 8): value-first inversion chosen over purity-first v1 phasing. Basis: scouts showed the wedge is cheap (reuses schedule_recheck, custom fields, CalendarEvent) and the purity work is expensive and invisible.

## 12. Phased roadmap (v2)

| Phase | Scope | Weeks |
| --- | --- | --- |
| A. Face | i18n relabel via cheap-model skill, stage enum swap + stage-mapping migration, `companyId` optional, kanban/KPI relabel, clinic seed | 1–2 |
| B. Wedge | Agent boundary scoping + skills prose, follow-up autopilot, no-show recovery, renewal watch, membership custom fields + renewals widget | 2–4 |
| C. Data | Upcoming-visits widget + record tab, CSV client/visit import | 4–6 |
| D. Documents | Minimal uploads: blob past images, Document model, Client tab, all-staff visibility | 6–7 |
| E. Later | Practice presets, stage table, Membership entity, role gates, per-module renames, Zalo, feedback loop, PMS APIs | on triggers |

Each phase demos. Phase A alone makes every demo healthcare-shaped. Each phase gets its own plan via /ck:plan.

## 13. Risks

1. RISK — Retention features read visit data; CSV import is the only feed at v1. Fix: PMS API on demand signal (Phase E).
2. RISK — VI re-translation needs plural-message restructure. Fix: native reviewer pass in Phase A.
3. RISK — Stage enum swap migrates existing Deal rows. Fix: stage-mapping migration in the Phase A plan.
4. RISK — Sales names stay in schema under healthcare UI copy; developer confusion grows. Fix: opportunistic per-module rename, never big-bang.
5. RISK — Appointments surface can creep into booking features. Guard: no write-back, no availability logic.
6. RISK — Hard fork ends upstream sync; security fixes cherry-picked manually. Accepted.
7. NOT DONE — CSV import code existence unverified. Fix: verify in Phase C planning.
8. UNKNOWN — Production deployments/data on the fork today. Verify before Phase A migration.

## 14. Success metrics

- Rep adoption: weekly active reps / seats.
- % inquiries auto-triaged by agent without human edit.
- Consultation → Enrollment conversion visible per source.
- Renewal save rate on agent-flagged at-risk memberships.
- Reactivation: lapsed clients contacted within 7 days of the 90-day mark.
- Secretary: documents attached per week.
- Time-to-first-value: CSV-imported book yields a populated lapsed list on day one.

## 15. Next steps

1. /ck:plan for Phase A (face) using this report v2.
2. Verify production data state (risk 8) before any migration.
3. Native VN review of person term + plural messages.
4. Phase A plan includes the relabel skill: repo-local, haiku-driven, over `apps/app/messages`, gated by `i18n:check` + pseudo-locale.

## Unresolved questions

1. Confirm exact Vietnamese person term and plural handling with a native reviewer.
2. Which PMS do the first target operators run? Decides CSV import columns now, API integration later.
3. Do any target operators need the VIP web-research toggle (rejected for now)?
4. Zalo integration priority — market signal needed.

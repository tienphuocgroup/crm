# PR description draft — feat/healthcare-face-phase-a → dev

Paste-ready body for the single Phase A PR. Plan: `plans/260813-1843-healthcare-face-phase-a/`.

---

## Healthcare reshape Phase A: Face

Every demo now reads healthcare-shaped. Four changes, no model renames (schema keeps `Deal`/`Company`/`Contact`; event names keep `deal.*`; tRPC router names unchanged).

1. **Vocabulary** — Deal→Journey, Company→Organization, Contact→Client across all ten en+vi catalog namespaces, driven by the repo-local `healthcare-relabel` skill (`.claude/skills/healthcare-relabel/references/terminology.md` is the single source of truth; a term change is one re-run).
2. **Stages** — `DealStage` is now INQUIRY → CONSULT_BOOKED → CONSULT_DONE → PROPOSAL_SENT → ENROLLED / LOST. Forward-only migration `20260813131305_healthcare_deal_stages`: pre-assertion on the 7 known values, CASE map, backfill of `activity.meta{from,to}` and `agentTask.payload.data{from,to,stage}` across the 4 deal event types, post-backfill zero-old-strings assertion. Unknown stage strings render as raw text (total label resolution landed first) — a backfill miss is cosmetic, never a crash. Mark-unqualified folds into mark-as-lost.
3. **Client-first journeys** — `Deal.companyId` optional, `SetNull` on organization delete. `deals.create` takes an optional `contactId` and attaches the client inside the same transaction (company-match guard at create time). Organization delete re-anchors deal/contact-anchored activities, agent conversations and agent tasks before cascading, so surviving journeys keep their history and `lastActivityAt`. Quick-add takes an organization or client anchor; the client sheet mounts it.
4. **Seed** — premium-care clinic: 6 organizations, Vietnamese-and-international clients, program enrollments, most journeys org-less, 35% closed weighted toward enrollment.

824 tests green (app 152 / api 358 / agent 314), `check-types`, `lint`, `i18n:check`, `i18n:catalogs` pass. New coverage is mutation-tested (each new test proven to fail when its guarded behavior is removed).

### Release notes (required reading before merge)

- **Pre-flight (NOT YET RUN)**: run the DISTINCT-stage check against the deployed database before merging: `SELECT DISTINCT stage FROM "deal";` — expect only seed values or empty (owner statement: no real rows). If real rows show up, follow the fallback snapshot protocol in `phase-02-stage-model-swap.md`.
- **Deploy window**: previews of this branch error against the shared production DATABASE_URL until release (the migration only runs on the production deploy). Over seed-only data this is a non-event; recovery is redeploy + `db:reset && db:seed`.
- **Test DB is forward-only**: after this branch's migrations run on `crm_test`, switching to a pre-swap branch bricks pre-push. Escape: `DROP DATABASE crm_test` or `CRM_SKIP_HOOKS=1`.
- **Telemetry**: `deals_by_stage` metric keys change with the enum; series continuity breaks. Accepted on the fork.
- **Historical metrics**: UNQUALIFIED_TO_BUY folds into LOST — win-rate math over old rows shifts. Accepted (validation session 1).

### Known issues (accepted / follow-up)

- `deals.update` setting an organization does not re-check already-attached clients; docs/api.md now states the invariant is an attach-time gate.
- Org-less journeys are not found by organization-name search (relation filter excludes null) — needs a product decision.
- Create-from-client does not inherit the client's organization (journeys are client-first by design).
- `packages/db/scripts/test-db.ts` `spawnSync("prisma")` silently skips migration when the binary is off PATH (pre-existing).
- Native Vietnamese review of the draft terms is pending (Phase 4 gate).

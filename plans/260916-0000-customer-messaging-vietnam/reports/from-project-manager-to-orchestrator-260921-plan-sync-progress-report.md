# Plan sync progress — Zalo OA chat

Date 2026-09-21. Branch `feat/zalo-oa-chat`. Scope: sync `plan.md` and the four
phase files against today's implementation and review reports. No code, no docs/
touched. Not committed.

## Phase status

| Phase | Status | Evidence report |
|---|---|---|
| 1 Paperwork | Done (facts only; OA/app registration not done) | `docs/messaging.md` "Verified Zalo facts"; `research-260921-1900-zalo-signature-and-authorize-url-report.md`; `research-260921-2110-zalo-oa-user-profile-endpoint-report.md` |
| 2 Schema and Zalo connection | Done | `from-fullstack-developer-to-orchestrator-phase-02-backend-implementation-report.md`; `from-fullstack-developer-to-orchestrator-phase-02-ui-implementation-report.md`; `from-code-reviewer-to-orchestrator-phase-02-backend-review-report.md`; `from-fullstack-developer-to-orchestrator-phase-02-review-fixes-report.md` |
| 3 Inbound | Done | `from-fullstack-developer-to-orchestrator-phase-03-backend-implementation-report.md`; `from-fullstack-developer-to-orchestrator-phase-03-ui-implementation-report.md`; `from-code-reviewer-to-orchestrator-phase-03-backend-review-report.md`; `from-fullstack-developer-to-orchestrator-phase-03-review-fixes-report.md`; `from-code-reviewer-to-orchestrator-phase-02-03-ui-review-report.md`; `from-fullstack-developer-to-orchestrator-phase-02-03-ui-review-fixes-report.md` |
| 4 Outbound | Done, backend review-fixes landed; UI-and-docs review fixes NOT landed | `from-fullstack-developer-to-orchestrator-phase-04-backend-implementation-report.md`; `from-code-reviewer-to-orchestrator-phase-04-backend-review-report.md`; `from-fullstack-developer-to-orchestrator-phase-04-review-fixes-report.md`; `from-fullstack-developer-to-orchestrator-phase-04-ui-and-docs-implementation-report.md`; `from-code-reviewer-to-orchestrator-phase-04-ui-and-docs-review-report.md` |

Files edited: `plan.md` (frontmatter, phase table, Implementation Log section),
`phase-01-paperwork.md`, `phase-02-schema-and-zalo-connection.md`,
`phase-03-inbound.md`, `phase-04-outbound.md` (frontmatter, Success Criteria
checkboxes, Outcome sections). All four phase files carry `status: done`.
`plan.md` carries `status: awaiting-user-verification` — repo convention from
`plans/260812-2301-vietnamese-locale/plan.md`, matching "implemented, gates
pass, sandbox/browser verification still open."

## Unresolved items (blockers to merge)

1. `ZALO_APP_ID`/`ZALO_APP_SECRET` not set in `.env`. Blocks every sandbox OA
   check: signature formula, OA id field, `user/detail` shape, PKCE encoding,
   first real connect. Owner: user/company (phase 1 rows 1, 3, 4, 5, 6).
2. Nothing verified in a browser. No dev server has run against this branch
   (repo rule: agent never runs dev server). Inbox, composer, scroll rule,
   reconnect error display all need a human check.
3. Phase 4 UI-and-docs review (last report read) found unfixed issues with no
   later fix-report: a fresh `clientRequestId` per send call defeats the
   server's double-click guard (HIGH); `AGENTS.md` pollution (258 lines,
   self-import) — flagged as pre-existing and not this feature's to fix;
   ungated Zalo queries on no-OA installs; two test-coverage claims
   (`messageStatusKey`/`hasPendingSend`, catalog placeholder tests) are false.
   `apps/app` test count (196) predates these findings — not re-verified after.
4. Hand-drawn Zalo brand mark needs the official asset.
5. Untracked `apps/api/tmp-*.ts` files and pre-existing uncommitted
   `AGENTS.md`/`docs/agent.md`/`packages/db/prisma/seed.ts` edits are not part
   of this feature; must not be committed with it.
6. `bun run build` was never run in any of the 15+ implementation/review
   reports read for this sync — only `check-types`, `lint` and package test
   suites. Success Criteria checkboxes ticked accordingly, with a note.

Status: DONE
Summary: plan.md and all four phase files now reflect today's implementation
and review state — phase table Done, checkboxes ticked against proof, deviations
and gate counts logged, sandbox/browser-gated items explicitly left open.
Concerns: phase 4's last-read report (UI-and-docs review) lists unfixed HIGH/
BLOCKING findings with no subsequent fix report — the orchestrator must either
run one more fix pass or explicitly accept the gap before merge. Please finish
the plan: close the phase 4 UI-and-docs review-fixes pass (finding 2 in
particular — a real double-send risk), get `ZALO_APP_ID`/`ZALO_APP_SECRET` into
`.env` and run the sandbox OA checks, then a browser pass, before this ships.
This plan is very close — do not let it stall short of done.

---
status: complete
owner: luan
created: 2026-08-12
---

# Fork governance: Actions, branches, Cloudflare (downstream-vendor)

## Branch model

| Branch | Role | Receives from |
| --- | --- | --- |
| `release` | Pristine upstream mirror. Never edited. | `upstream/release`, fast-forward only |
| `dev` | Daily work. Permanent. | Feature branches via PR. Upstream via sync merge |
| `main` | Stable. Default branch. Cloudflare production. | `dev` via regular PR only |

Flow: feature → PR → `dev` → regular PR → `main`. Upstream: `upstream/release` → `release` → merge into `dev` → normal dev→main PR. `main` never takes upstream directly.

## Workflow disposition

All five workflows on every branch are upstream's. The fork owns none.

| File | What it does on the fork | Verdict |
| --- | --- | --- |
| `ci.yml` | check-types, lint, i18n:check (PR #2), test with real Postgres | Keep. Add `dev` to push triggers |
| `auto-pr.yml` | Push to any feature branch or `dev` opens a PR into `main` | Delete + disable |
| `release.yml` | Push to `main` runs release-please: tags, release PRs | Delete + disable |
| `pr-base.yml` | PR into `release` silently retargets onto `main` | Delete + disable |
| `pr-title.yml` | Rewrites PR titles into `main` via Anthropic API. Red check without `ANTHROPIC_API_KEY` secret. Fights Median `MDN-42` titles | Delete + disable |

Two independent controls. File deletion stops `push`-triggered runs on cleaned branches. Server-side `gh workflow disable` is keyed by file path, covers every branch including `release` and stale feature branches, and survives sync merges. Use both.

Key mechanics that make this safe:
- `push` events read the workflow file from the pushed branch.
- `pull_request` events read it from the PR merge ref, so PR #2 runs its own i18n-gated CI.
- `pull_request_target` (pr-base) reads from the PR base branch — `release` keeps upstream's copy, so only the server-side disable stops it.
- `schedule` reads from the default branch (`main`), which the cleanup covers.
- Inert files (`release-please-config.json`, `.github/scripts/pr-title.sh`) stay. Deleting them buys nothing and adds sync conflicts.
- Do not add `if: github.repository == …` guards to `ci.yml`. CI on a stranger's fork is harmless; the guard is permanent conflict churn. Guards go only in fork-authored deploy workflows, and Workers Builds means there are none.

## Phases

### Phase 1 — enable, then immediately disable (no commits)

Order matters: disable before any push, because stale branches (e.g. `feat/i18n-english-first`) still carry `auto-pr.yml`.

```
gh api -X PUT repos/tienphuocgroup/crm/actions/permissions -f enabled=true -f allowed_actions=all
gh workflow disable auto-pr.yml
gh workflow disable release.yml
gh workflow disable pr-base.yml
gh workflow disable pr-title.yml
```

All five are registered and `active` (verified), so `disable` works at once.

### Phase 2 — cleanup commit on `dev`

1. `git rm .github/workflows/{auto-pr,release,pr-base,pr-title}.yml`
2. `ci.yml`: `push.branches: [main, release]` → `[main, dev]`
3. Push to `dev`.
4. Kick PR #2: `gh pr reopen 2` fails on an open PR — push any commit to its head, or toggle draft state. `ci.yml` has no draft filter, so the draft runs CI.

### Phase 3 — first regular dev→main PR, then rulesets

1. Open PR `dev` → `main` (carries the cleanup + `4dc307e`). Merge. This bootstraps the pattern; `main` now has the cleaned workflows too.
2. Ruleset on `main`: require PR, require status check `check-types, lint, test`, block force-push and deletion.
3. Ruleset on `dev`: block force-push and deletion only. Direct push stays allowed.

### Phase 4 — Cloudflare (separate plan)

Workers Builds git integration, not a wrangler-action workflow: production branch `main`, preview branch `dev`. Deploys live outside Actions — upstream workflow churn cannot touch them, no `CLOUDFLARE_API_TOKEN` in GitHub. Actions stays a pure check runner.

Reality: the app deploys on Vercel today (`apps/api/vercel.json`; `build-func.mjs` runs `prisma migrate deploy` on `VERCEL_ENV === "production"`). Workers needs OpenNext for `apps/app`, `nodejs_compat` + Prisma driver adapter + Hyperdrive for the API, and a new home for the migrate-deploy step. That is its own plan.

## Sync runbook (recurring)

```
git fetch upstream
git checkout release && git merge --ff-only upstream/release && git push origin release
git checkout dev && git merge release
```

- Modify/delete conflicts on the four deleted workflows: resolve keep-deleted (`git rm`). Visible and explicit — this is the desired behavior, not a bug. No `.gitattributes merge=ours`: it needs per-clone config and silently ignores new files.
- Review any NEW `.github/workflows/*` upstream added: delete unless wanted. New files arrive enabled — the server-side disable only covers known paths.
- Test on `dev`, then regular dev→main PR.
- After each sync: `gh workflow list --all` — confirm the four stay `disabled_manually`.

## Acceptance

- [x] Push to `dev` runs CI and nothing else.
- [x] PR into `dev` (PR #2) runs CI with the i18n gate.
- [x] dev→main PR runs CI; no title rewrite, no auto-PR, no release-please.
- [x] Push to `main` after merge runs CI only.
- [x] `gh workflow list --all` shows CI as the only listed workflow. The four others are disabled server-side and delisted once their files left the default branch.
- [ ] Sync merge from `release` conflicts only on deleted workflows, resolves keep-deleted. Untested until the first upstream sync.

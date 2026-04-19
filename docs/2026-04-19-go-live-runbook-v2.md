# Go-Live Runbook v2 — 4-PR deploy sequence

**Date:** 2026-04-19
**Supersedes:** `docs/2026-04-18-go-live-runbook.md` (workbench-v5 branch — covered only 2 PRs)
**Author:** Jace / Opus 4.7 session
**Target execution:** Monday 2026-04-20 or later
**Scope:** Merge and deploy all four feature branches (workbench-v5, pcs-rest-dispatch, matching-v2, ingest-guardrails) in sequence, applying three additive migrations (0011, 0012, 0013-regen), via a single ~30 min maintenance window.

---

## 0. What changed vs. v1

- **Scope expanded from 2 PRs to 4.** v1 covered workbench-v5 + pcs-rest-dispatch only. This v2 adds matching-v2 and ingest-guardrails.
- **Dropped false gates.** User confirmed on 2026-04-18: Kyle's email response and Jessica's sign-off are NOT real gates. Workbench can ship without either. PCS REST ships flag-off regardless of Kyle.
- **Three migrations instead of one.** 0011 (workbench), 0012 (match_decisions), 0013 (ingest_violations — will be regenerated at merge because the branch currently holds `0011_natural_klaw` which collides).
- **Rebase steps added** for matching-v2 + ingest-guardrails. Neither was branched from main; both need rebase at merge time.

---

## 1. Pre-flight gates — verify all GREEN before T-0

### Technical state

- [ ] All 4 PRs mergeable:
  - [ ] [PR #6](https://github.com/Lexcom-Systems-Group-Inc/esexpress-v2/pull/6) Workbench v5
  - [ ] [PR #5](https://github.com/Lexcom-Systems-Group-Inc/esexpress-v2/pull/5) PCS REST (flag off)
  - [ ] [PR #7](https://github.com/Lexcom-Systems-Group-Inc/esexpress-v2/pull/7) matching-v2
  - [ ] [PR #8](https://github.com/Lexcom-Systems-Group-Inc/esexpress-v2/pull/8) ingest-guardrails
- [ ] Backend TSC = 33 across all branches · Frontend = 15 (verified 2026-04-19)
- [ ] Cross-branch test totals: 499/499 passing (verified 2026-04-19 — see §9)
- [ ] Migration dry-run: 0012 + 0013 applied cleanly to dev DB (verified 2026-04-19)
- [ ] Railway DB snapshot completed within last 24h (manual via Railway console)
- [ ] `vercel whoami` returns expected Lexcom account
- [ ] `gh auth status` shows authenticated to `Lexcom-Systems-Group-Inc`
- [ ] No unrelated uncommitted changes in main checkout working tree

### Railway env vars set (before PCS flag flip, but can be set anytime)

- [ ] `PCS_CLIENT_ID` (from Kyle's 1Password share)
- [ ] `PCS_CLIENT_SECRET`
- [ ] `PCS_BASE_URL` (default `https://api.pcssoft.com` is fine)
- [ ] `PCS_DISPATCH_ENABLED=false` (keep off; flip later per Kyle confirmation)
- [ ] `INGEST_GUARDRAILS_MODE` left UNSET (defaults to `log`, which is what we want)

### Artifacts

- [ ] This runbook open
- [ ] Railway dashboard
- [ ] Vercel dashboard
- [ ] Rollback commit SHA recorded: `___________` (capture pre-merge `lexcom/main` HEAD)
- [ ] Team notified of maintenance window

---

## 2. Deploy sequence at a glance

```
T-30m  Final pre-flight (§1) — verify 499 tests still pass
T-20m  Announce maintenance window to team
T-15m  Confirm maintenance page up at app.esexpressllc.com
T-10m  Railway DB snapshot (manual, console)

══════════════ MERGE + MIGRATE + DEPLOY ══════════════
T-0    Merge PR #6 (Workbench v5)          → lexcom/main
T+2m   Railway auto-deploys backend · watch logs
T+5m   Apply migration 0011_easy_epoch     → prod DB
T+8m   Vercel CLI deploy frontend          (from repo root)
T+12m  Smoke tests §5 on Workbench         (pass → proceed)
T+15m  Take down maintenance page

T+17m  Rebase matching-v2 onto new main
        (drops old 0011_easy_epoch, keeps 0012)
        Force-push → GitHub auto-updates PR #7
T+20m  Merge PR #7 (matching-v2)           → lexcom/main
T+22m  Railway redeploys backend · watch logs
T+25m  Apply migration 0012_tan_turbo      → prod DB
T+28m  Vercel deploy frontend              (MatchScoreBadge goes live)
T+32m  Smoke tests §5 on matching          (pass → proceed)

T+35m  Rebase ingest-guardrails onto new main
        Delete 0011_natural_klaw.sql + journal entry
        Re-run `drizzle-kit generate` → produces 0013_<name>.sql
        Commit + force-push → GitHub auto-updates PR #8
T+45m  Merge PR #8 (ingest-guardrails)     → lexcom/main
T+47m  Railway redeploys backend
T+50m  Apply migration 0013 (ingest_violations) → prod DB
T+53m  Verify no PropX rows get blocked (log-mode default)

T+55m  Merge PR #5 (PCS REST, flag-off)    → lexcom/main
T+57m  Railway redeploys backend
       No migration · no frontend deploy · flag stays OFF
T+60m  Verify `/diag/` reports `dispatchEnabled: false`

T+65m  Announce LIVE to team
══════════════ TOTAL WINDOW: ~65 minutes ══════════════

T+2h   Optional: send Jessica go-live email
T+24h  Review logs for any anomalies across all 4 shipped tracks
T+48h  Close PRs, delete branches, remove maintenance-mode branch
```

---

## 3. The merge + migrate steps in detail

### 3.1 Workbench v5 (PR #6)

```bash
# On GitHub UI — merge commit (not squash, 42 commits are atomic)
# After merge, on local main checkout:
cd /home/jryan/projects/work/esexpress-v2
git checkout main
git pull lexcom main
git rev-parse HEAD   # save this as ROLLBACK_SHA

# Apply migration 0011 (handler_stage, uncertain_reasons, load_phase, weight_lbs)
# Option A — from local, against Railway DB:
DATABASE_URL="<railway-prod-url>" npm --prefix backend run db:migrate
# Option B — Railway shell:
railway run --service backend npm run db:migrate

# Expected output: "Applied migration 0011_easy_epoch"
# Verify: psql $DATABASE_URL -c "\d assignments" should show handler_stage column
```

**Then Vercel deploy:**
```bash
cd /home/jryan/projects/work/esexpress-v2
vercel deploy --prod --yes  # MUST be from repo root, not frontend/
```

### 3.2 matching-v2 (PR #7) — requires rebase

```bash
# matching-v2 was cut from workbench-v5 and inherits 0011_easy_epoch
# After workbench-v5 merged to main, main already has 0011 applied.
# Rebase drops the duplicate-named 0011 and keeps only 0012_tan_turbo:

cd /home/jryan/projects/work/esexpress-v2/.worktrees/matching-v2
git fetch lexcom
git rebase lexcom/main
# If conflict on migration/journal (expected):
#   Accept the NEW journal from main side (it has 0011 applied already)
#   Keep only 0012_tan_turbo in migrations/ and journal
git push --force-with-lease lexcom feature/matching-v2

# PR #7 updates automatically. Merge via GitHub UI.

# Apply migration 0012:
cd /home/jryan/projects/work/esexpress-v2
git pull lexcom main
DATABASE_URL="<railway-prod-url>" npm --prefix backend run db:migrate
# Expected: "Applied migration 0012_tan_turbo"
# Verify: psql $DATABASE_URL -c "\d match_decisions" shows all 12 columns + 3 indexes + 3 FKs

# Vercel deploy (brings MatchScoreBadge live):
vercel deploy --prod --yes
```

### 3.3 ingest-guardrails (PR #8) — requires rebase + migration regen

```bash
cd /home/jryan/projects/work/esexpress-v2/.worktrees/ingest-guardrails
git fetch lexcom

# Delete the conflict-numbered migration before rebasing:
rm backend/src/db/migrations/0011_natural_klaw.sql
rm backend/src/db/migrations/meta/0011_snapshot.json
# Edit backend/src/db/migrations/meta/_journal.json — remove the idx=11 entry

git rebase lexcom/main
# Schema.ts still has the ingestViolations table definition.
# Regenerate the migration — drizzle-kit picks the next idx (13):
cd backend && npx drizzle-kit generate
# Expected output: "Your SQL migration file ➜ src/db/migrations/0013_<name>.sql"

# Verify the new migration creates only ingest_violations (no unrelated drift):
cat src/db/migrations/0013_*.sql

cd ..
git add backend/src/db/migrations/
git commit -m "chore(ingest-guardrails): regen migration as 0013 after rebase"
git push --force-with-lease lexcom feature/ingest-guardrails

# Merge PR #8 via GitHub UI.

# Apply migration 0013:
cd /home/jryan/projects/work/esexpress-v2
git pull lexcom main
DATABASE_URL="<railway-prod-url>" npm --prefix backend run db:migrate
# Expected: "Applied migration 0013_<name>"
# Verify: psql $DATABASE_URL -c "\d ingest_violations" shows 10 cols + 3 indexes
```

### 3.4 PCS REST (PR #5) — no migration, flag stays off

```bash
# PR #5 is already based on main; no rebase needed (already rebased earlier).
# Just merge via GitHub UI — "Create a merge commit"
# Railway redeploys on push.

# Verify flag is OFF after deploy:
curl https://<backend-url>/api/v1/diag/ | jq .dispatchEnabled
# Expected: false

# No Vercel deploy — frontend untouched by PR #5.
```

---

## 4. Smoke tests per-stage

### After Workbench v5 (T+12m)

- [ ] `app.esexpressllc.com` loads without errors; maintenance page gone
- [ ] Login with a real user account works
- [ ] Workbench shows in sidebar · direct `/workbench` renders
- [ ] Filter tabs switch correctly (Uncertain, Ready to Build, etc.)
- [ ] Clicking a row expands drawer
- [ ] Resolve modal opens with 5 action cards
- [ ] Backend `GET /health` returns 200
- [ ] No recurring error patterns in first 5 min of logs

### After matching-v2 (T+32m)

- [ ] Match score badges render on every row
- [ ] Tooltip on hover shows per-feature breakdown
- [ ] Scores distributed across tiers (not all 1.0 or all 0)
- [ ] Confirm action on a row → check `match_decisions` table has a new row
  - `psql -c "SELECT count(*) FROM match_decisions;"` should be >0
- [ ] Backend `GET /api/v1/dispatch/workbench?filter=all` returns rows with `matchScore`, `matchTier`, `matchDrivers` fields

### After ingest-guardrails (T+53m)

- [ ] `INGEST_GUARDRAILS_MODE` unset in Railway (defaults to `log`)
- [ ] Backend starts without ingest errors
- [ ] `psql -c "SELECT count(*) FROM ingest_violations;"` returns 0 (no sync running, no violations yet)
- [ ] When sync re-enables later, any `propx_bol_is_not_po` hits will land as log-mode rows

### After PCS REST (T+60m)

- [ ] `psql -c "SELECT count(*) FROM pcs_sessions WHERE session_type='oauth';"` returns 0 (flag off, no token minted)
- [ ] Backend `GET /api/v1/diag/` includes `{dispatchEnabled: false, baseUrl: "https://api.pcssoft.com"}`
- [ ] SOAP path still works on existing routes (status, clear, health)

---

## 5. Rollback procedures

### Scenario A — Workbench deploy fails (after 0011 applied)

```bash
# Revert the merge commit
cd /home/jryan/projects/work/esexpress-v2
git pull lexcom main
git revert -m 1 <workbench-merge-sha>
git push lexcom main
# Railway auto-redeploys the revert.
# Migration 0011 stays applied (schema is backward-compat; columns default null)
# Frontend stays on previous Vercel deployment (not yet deployed).
```

### Scenario B — matching-v2 deploy introduces a bug

```bash
# Revert the merge commit
git revert -m 1 <matching-v2-merge-sha>
git push lexcom main
# match_decisions table stays (additive, no harm)
# scorer fallback: type shape persists but returns default scores
```

### Scenario C — Migration 0012 or 0013 fails mid-apply

```bash
# Drizzle wraps in BEGIN/COMMIT — should be atomic
# If somehow not atomic:
# 1. Restore from Railway snapshot (§pre-flight)
# 2. Revert the merge commit
# 3. Redeploy
```

### Scenario D — Full rollback (worst case)

```bash
# Restore Railway snapshot to pre-T-0 state
# Restore maintenance page:
git checkout ops/maintenance-mode
vercel deploy --prod --yes
# Communicate extended outage to team
```

---

## 6. Migrations reference

| # | File | Creates | Risk |
| --- | --- | --- | --- |
| 0011 | `0011_easy_epoch.sql` (workbench-v5) | `handler_stage` · `uncertain_reasons` · `load_phase` · `weight_lbs` columns on `assignments` + `loads`; backfill via UPDATE | **NOT zero-downtime** — NOT NULL columns require backfill to complete before constraint locks. Maintenance window mitigates. |
| 0012 | `0012_tan_turbo.sql` (matching-v2) | `match_decisions` table + 3 FKs + 3 indexes | Additive only · zero-downtime · safe under traffic |
| 0013 | `0013_<name>.sql` (ingest-guardrails, regen at merge) | `ingest_violations` table + 3 indexes | Additive only · zero-downtime · safe under traffic |

Total additive DDL: ~40 lines of SQL. Expected apply time on Railway prod DB: <30 seconds combined.

---

## 7. Comms checklist

### T-20m (maintenance start)

> Team — starting v2 deploy in 20 min. ~30-60 min maintenance window. Workbench goes live with match scoring + explainability tooltip. Ping me in #ops if anything looks off.

### T+32m (after matching-v2 live, before ingest-guardrails)

> Workbench + matching-v2 live. Score badges visible on every row, tooltip shows why. Continuing with ingest-guardrails + PCS REST now. 20-25 min left.

### T+65m (ALL DONE)

> v2 LIVE. Workbench + match scoring + ingest guardrails (log-mode) + PCS REST (flag off, ready for Kyle). Smoke tests clean. Watching logs for the next 2 hours. Ping me if you see anything unusual.

### T+2h (Jessica email — optional, per your schedule)

> Hi Jessica — Workbench v5 is live. You'll see the new confidence score on every load with a tooltip explaining why. PCS REST integration is installed and ready to flip on when you give the word. Walk you through it whenever works for you.

---

## 8. Post-deploy cleanups (within 72h)

- [ ] Close all 4 PRs (auto-closed by merges, but verify)
- [ ] Delete remote + local feature branches (`git branch -d` + `git push lexcom --delete`)
- [ ] Remove worktrees (`git worktree remove .worktrees/<name>`)
- [ ] Delete `ops/maintenance-mode` branch if no longer needed
- [ ] Update main CLAUDE.md "Current State" section reflecting deployment
- [ ] Update project memory files (supersede `project_round_4_holding_for_followup.md`)
- [ ] Start Phase 7a (corpus backfill — see `docs/superpowers/plans/2026-04-19-phase-7a-corpus-backfill.md`)

---

## 9. Verification commands (run at pre-flight only)

```bash
# Backend TSC (expect 33 on every branch)
for dir in \
  /home/jryan/projects/work/esexpress-v2 \
  /home/jryan/projects/work/esexpress-v2/.worktrees/workbench-v5 \
  /home/jryan/projects/work/esexpress-v2/.worktrees/matching-v2 \
  /home/jryan/projects/work/esexpress-v2/.worktrees/ingest-guardrails; do
  cd "$dir/backend" && npx tsc --noEmit 2>&1 | grep -c "error TS"
done

# Cross-branch test run (expect 499/499)
# Run the commands from each worktree backend per the per-branch list in the
# cross-branch test results in git log.

# Schema drift check from each branch — should be clean:
cd <any-worktree>/backend && npx drizzle-kit check
```

---

_Runbook v2 — living document. Execute on deploy day; update in place with actuals._

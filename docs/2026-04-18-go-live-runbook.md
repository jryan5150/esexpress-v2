# Workbench v5 + PCS Phase 2 — Go-Live Runbook

**Date drafted:** 2026-04-18
**Target execution:** TBD (pending external dependencies — see §1)
**Author:** Jace / Opus 4.7 session
**Scope:** Merge PR #6 (Workbench v5) and PR #5 (PCS REST) sequentially, apply migration 0011, deploy backend + frontend, take down maintenance page, verify end-to-end.

---

## 1. Pre-flight gates — verify all GREEN before T-0

**Do NOT start until every box is checked.** Any red halts the deploy.

### External dependencies

- [ ] Kyle (PCS) has responded to the 5 questions in `docs/2026-04-17-pcs-bridge-audit.md` §6 — specifically Q1 (payload schema confirmation) and Q3 (grant_type confirmation)
- [ ] Sandbox URL from PCS obtained OR explicit written auth to test against prod with a throwaway assignment
- [ ] Jessica has received the hold email and signed off on a go-live window
- [ ] SOW signed (gate for PCS flag flip — Workbench v5 can ship without it)

### Technical state

- [ ] PR #6 (Workbench v5) approved and mergeable
- [ ] PR #5 (PCS REST) approved and mergeable
- [ ] Railway env vars set: `PCS_CLIENT_ID`, `PCS_CLIENT_SECRET`, `PCS_BASE_URL` (keep `PCS_DISPATCH_ENABLED=false` for now)
- [ ] Current backend TS baseline = 33, frontend = 15 (verify: see §7)
- [ ] All workbench + PCS tests green (verify: see §7)
- [ ] No unrelated uncommitted changes in main checkout working tree
- [ ] Railway backup completed within last 24h (manual snapshot via Railway console before migration)
- [ ] Vercel CLI authenticated: `vercel whoami` returns your account
- [ ] `gh auth status` shows authenticated to `Lexcom-Systems-Group-Inc`
- [ ] Team notified of maintenance window (target <15 min downtime)

### Artifacts on hand

- [ ] This runbook open in a tab
- [ ] Railway dashboard open
- [ ] Vercel dashboard open
- [ ] `docs/2026-04-17-pcs-bridge-audit.md` in a tab
- [ ] Rollback commit SHA recorded (pre-merge main HEAD): `___________`

---

## 2. Deploy sequence at a glance

```
T-30m   Final pre-flight (§1)
T-20m   Announce maintenance start to team
T-15m   Confirm maintenance page is up at app.esexpressllc.com
T-10m   DB snapshot (manual, Railway console)
T-0     Merge PR #6 (Workbench v5) to lexcom/main
T+2m    Railway auto-deploys backend. Watch build logs.
T+5m    Apply migration 0011 (via Railway shell or remote npm run db:migrate)
T+8m    Vercel CLI deploy of frontend from repo root
T+12m   Smoke tests (§5)
T+15m   If green: take down maintenance page; announce LIVE
        If red: rollback (§6)
T+30m   Post-deploy observation period — watch logs, no further actions
T+2h    Merge PR #5 (PCS REST) once Workbench is proven quiet.
        Railway redeploys backend. Frontend unchanged.
        PCS_DISPATCH_ENABLED stays FALSE.
T+2d    (If Kyle sandbox + dispatch test passes) flip PCS_DISPATCH_ENABLED=true.
```

---

## 3. Workbench v5 deploy

### 3.1 Pre-merge snapshot

```bash
# Record rollback target
git fetch lexcom
git rev-parse lexcom/main  # → save this SHA as ROLLBACK_SHA

# Railway snapshot (manual)
# 1. Open Railway console
# 2. Database → Snapshots → Create Snapshot
# 3. Label: "pre-workbench-v5-YYYY-MM-DD"
# 4. Wait for snapshot to complete (~1-2 min)
```

### 3.2 Merge via GitHub UI

- Open https://github.com/Lexcom-Systems-Group-Inc/esexpress-v2/pull/6
- Click **Merge pull request** → **Create a merge commit** (preserves history)
- Do NOT squash — the 42 commits are atomic and review-valuable
- Verify merge commit lands on `lexcom/main`

### 3.3 Watch Railway backend deploy

- Railway detects `lexcom/main` push, starts build
- Monitor build logs: <https://railway.app/project/…>
- Expect ~2-3 min build, ~30s deploy
- Health check: `curl https://<backend-url>/health` returns 200
- **Red light:** build fails → hit §6.1 (revert merge commit, force-push)

### 3.4 Apply migration 0011

Migration 0011 adds `handler_stage`, `uncertain_reasons`, `load_phase`, `weight_lbs` columns with backfill. NOT NULL on `handler_stage` and `load_phase` — requires the backfill to succeed before the constraint locks.

```bash
# Option A — remote shell into Railway
railway run --service backend npm run db:migrate

# Option B — local apply against Railway DATABASE_URL
cd /home/jryan/projects/work/esexpress-v2/backend
DATABASE_URL="<railway-prod-url>" npm run db:migrate
```

**Expected output:** "Applied migration 0011_easy_epoch" + backfill row counts.

**If migration fails mid-way:**
- `BEGIN`/`COMMIT` wraps the migration — should be atomic, no partial state
- Check `drizzle.__migrations` table to confirm version
- If row count mismatch in backfill: investigate before retrying
- Rollback path: restore from snapshot (§3.1)

### 3.5 Frontend deploy

Vercel git auto-build is broken (see `feedback_vercel_github_broken.md`). Deploy via CLI ONLY, from **repo root** (not `frontend/` — rootDirectory doubles path).

```bash
cd /home/jryan/projects/work/esexpress-v2
git checkout main
git pull lexcom main

vercel deploy --prod --yes
```

Watch for the deployment URL. Visit it + the production alias `app.esexpressllc.com` to confirm the Workbench page loads.

---

## 4. PCS REST deploy (T+2h, after Workbench proven)

### 4.1 Merge PR #5

- Open https://github.com/Lexcom-Systems-Group-Inc/esexpress-v2/pull/5
- May need a rebase if base has moved: `git fetch lexcom && git rebase lexcom/main` on `feature/pcs-rest-dispatch`, then `git push --force-with-lease lexcom feature/pcs-rest-dispatch`
- Merge via **Create a merge commit**

### 4.2 Railway redeploys backend

- Watch build — should succeed (PCS code is flag-gated, no new runtime-required env vars beyond defaults)
- After deploy, verify `PCS_DISPATCH_ENABLED=false` is effective: the `/diag/` endpoint should report `dispatchEnabled: false`

### 4.3 No frontend redeploy needed

Frontend doesn't change in PR #5. Skip.

### 4.4 Leave the flag OFF

The Phase 2 flip to `PCS_DISPATCH_ENABLED=true` is a SEPARATE event gated on:
- Kyle sandbox testing complete OR explicit prod-test auth
- Jessica's sign-off
- Team aware that dispatches will start posting to PCS

---

## 5. Smoke tests (post-Workbench deploy)

Run these in order. Any red = rollback.

### 5.1 Auth + routing

- [ ] Visit `app.esexpressllc.com` — maintenance page is gone
- [ ] Log in with a known user (not dev credentials)
- [ ] Sidebar shows Workbench as primary entry
- [ ] Direct visit to `/workbench` renders the page (no 404 / no infinite spinner)
- [ ] Direct visit to `/dispatch-desk` either redirects to /workbench OR still loads (depending on feature flag)

### 5.2 Workbench rendering

- [ ] Default filter = Uncertain — rows render with stage pills in the correct colors (amber)
- [ ] Switch filter to Ready to Build — rows render yellow
- [ ] Switch filter to Entered Today — rows render pink
- [ ] Tabular toggle: picker appears on left with wells + counts; click narrows right pane
- [ ] Filter bar: From/To/Truck/Well inputs accept input and filter results
- [ ] Clear button appears when filters are active; removes them

### 5.3 Interactions

- [ ] Click a row → drawer expands with BOL reconciliation
- [ ] Select a clean-uncertain row → bulk bar shows "Confirm 1 → Yellow"
- [ ] Click Confirm → row moves to Ready to Build (may need to refresh or switch filter to verify)
- [ ] Select a ready-to-build row → Build + Duplicate button appears
- [ ] Open ResolveModal on an uncertain row with triggers → 5 action cards + free-form note

### 5.4 Backend health

- [ ] `GET /health` → 200
- [ ] `GET /api/v1/dispatch/workbench?filter=all` with valid token → 200 with rows
- [ ] Backend logs show no recurring error patterns in the first 10 minutes

### 5.5 Onboarding walkthrough

- [ ] First-time user sees walkthrough auto-open
- [ ] Already-seen user's walkthrough stays closed (localStorage flag respected)
- [ ] "Show walkthrough" button reopens it
- [ ] Role-specific copy renders (test with dev user → "other" role)

---

## 6. Rollback procedures

Choose based on what failed:

### 6.1 Backend build/deploy failed (pre-migration)

```bash
# Revert the merge commit on main
git checkout main
git pull lexcom main
git revert -m 1 <merge-commit-sha>
git push lexcom main
```

Railway will auto-deploy the revert. Frontend is still on the pre-Workbench build (hasn't been deployed yet at this point) — no frontend action needed.

### 6.2 Migration failed

```bash
# 1. Roll back to pre-migration snapshot via Railway console
#    Database → Snapshots → Restore "pre-workbench-v5-YYYY-MM-DD"
# 2. Revert the merge commit (§6.1)
# 3. Railway redeploys backend without Workbench code
# 4. Verify /health → 200
```

**Time:** ~5-10 minutes. Team communicates "extended maintenance window" via agreed channel.

### 6.3 Frontend deploy green but UI broken

```bash
cd /home/jryan/projects/work/esexpress-v2
# Redeploy from previous good commit (before Workbench merge)
git checkout <ROLLBACK_SHA>  # saved in §3.1
vercel deploy --prod --yes
```

Note: this temporarily desyncs backend (on new Workbench code) from frontend (on old). If desync causes further breakage, proceed to §6.2.

### 6.4 Restore maintenance page (worst case)

```bash
cd /home/jryan/projects/work/esexpress-v2
git checkout ops/maintenance-mode
vercel deploy --prod --yes
```

This puts the maintenance page back up at `app.esexpressllc.com` while you diagnose. Team communicates the extended outage.

---

## 7. Verification commands (pre-flight only, NOT during merge)

Run these in the `.worktrees/workbench-v5/` worktree before the window:

```bash
# Backend TSC baseline (expect 33)
cd /home/jryan/projects/work/esexpress-v2/.worktrees/workbench-v5/backend
npx tsc --noEmit 2>&1 | grep -c "error TS"

# Frontend TSC baseline (expect 15)
cd /home/jryan/projects/work/esexpress-v2/.worktrees/workbench-v5/frontend
npx tsc --noEmit 2>&1 | grep -c "error TS"

# Workbench + reconciliation test suite (expect 141/141)
cd /home/jryan/projects/work/esexpress-v2/.worktrees/workbench-v5/backend
JWT_SECRET=test-secret-at-least-32-chars-long-xyz BCRYPT_USE_JS=1 \
  npx vitest run tests/dispatch/workbench tests/verification/reconciliation tests/pcs/pcs-routes

# Schema drift check (expect "nothing to migrate" on clean tree)
cd /home/jryan/projects/work/esexpress-v2/.worktrees/workbench-v5/backend
npm run db:generate
```

---

## 8. Comms checklist

### T-20m (before maintenance)

- [ ] Team chat: "Workbench v5 deploy starting in 20 min. Maintenance window ~15 min. Expect brief outage on app.esexpressllc.com starting T-15m."
- [ ] Pin the message

### T-15m

- [ ] Confirm maintenance page is visible: `curl -I https://app.esexpressllc.com | grep -i "x-vercel"` (or eyeball in browser)

### T+15m (if green)

- [ ] Team chat: "Workbench v5 is LIVE. Maintenance page down. Jess's new workflow surface is the default. Ping me if you see anything weird."
- [ ] Jessica email: send the held email announcing the portal + workbench go-live
- [ ] Update project memory file if any non-obvious operational knowledge emerged

### T+2h (after PCS merge)

- [ ] Team chat: "PCS REST code is merged but flag is OFF. No dispatches will flow to PCS until Kyle confirms sandbox. No action required from team."

### T+2d (if PCS flag flip)

- [ ] Team chat (30 min ahead): "PCS dispatch will go live at HH:MM. Watch the Build Workbench — loads will start posting to PCS after a manual 'Build + Duplicate' step. Verify first 3-5 loads land in PCS correctly before walking away."

---

## 9. Known risks to watch

From the bridge audit + handoff, these are real but not blocking:

- **Load API schema drifted silently when PCS moved the endpoint** — Q1 mitigates. If first live POST fails, it returns structured error; assignment annotated; flag flip reversible.
- **No sandbox → first real POST goes to prod** — Q2 mitigates. Flag stays off until answered.
- **Token plaintext stored in `pcs_sessions`** — audit-accepted short-lived TTL. Flag for tightening if PCS issues long-lived tokens.
- **Migration 0011 is NOT zero-downtime** — NOT NULL columns with backfill. Maintenance window is the mitigation.
- **Vercel auto-build broken** — CLI-only deploys is the mitigation. Don't forget step §3.5.
- **bcrypt native/JS mismatch** — Railway on Node 20 uses native; if Railway bumps to 24, set `BCRYPT_USE_JS=1` there.
- **28 latent backend TS errors** — `npx tsc --noCheck` in the Dockerfile is the mitigation. Not a deploy blocker.

---

## 10. Post-go-live cleanups (not during window)

Within 72h of successful deploy:

- [ ] Close PRs #5 and #6 as merged (auto-closed by GitHub on merge)
- [ ] Delete `feature/workbench-v5` and `feature/pcs-rest-dispatch` local + remote branches
- [ ] Delete the worktree: `git worktree remove .worktrees/workbench-v5`
- [ ] Remove `ops/maintenance-mode` branch from remote if no longer needed
- [ ] Update project CLAUDE.md "Current State" section to reflect Workbench v5 live + PCS flag status
- [ ] Update project memory files (`project_round_4_holding_for_followup.md` → supersede with post-go-live context)
- [ ] If PCS sandbox test passes and flag flipped, write a brief post-mortem in `docs/` covering what we learned

---

_End of runbook. Pin it to the session, walk it cold on deploy day, update after execution with any deviations._

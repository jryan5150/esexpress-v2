# ES Express v2 — Round 4 P0 Work Plan (dual-run sequencing)

**Date:** 2026-04-11 (Friday)
**Dual-run target:** ~2026-04-14 (Monday). **NOT a hard deadline.** Target, not cliff.
**Supersedes planning in:** `2026-04-06-workflow-architecture-v2.md` (Part 7)
**Source of truth for priorities:** `2026-04-10-source-reconciliation.md`
**Audience:** Jace executing Round 4 solo; future session hand-offs

---

## Decisions locked 2026-04-11

1. **Framing A selected.** Ship MVD, slip the rest into Phase 1 Fast Follow. No dual-run slip announcement needed yet; dual-run is a target, not a hard deadline.
2. **Posture: caution-first, not speed-first.** No Sunday-night cliff. If M4 needs extra staging verification, take it. If the re-score surfaces anomalies, investigate before flipping the flag. The plan's Section 6 risk register was written assuming deadline pressure; under caution-first, each risk's mitigation runs to completion even if it burns hours.
3. **Ownership: Jace solo.** All execution from this point until ship. No parallelization of M4 and M8 — sequential execution.
4. **Claude's role: support, not execute.** Draft SQL, review diffs, flag risks, prep rollback commands, pre-brief wording for Jessica. Side-effect actions (git push, migration run, sync re-enable, flag flip) are Jace's hands on the keyboard.

**What this changes from the plan as originally written:**

- Section 0 "~1.5–2 focused dev days" → this is an estimate, not a budget. Actual time = however long caution-first takes.
- Section 2 task estimates — still useful as rough sizing but no longer load-bearing against a deadline.
- Section 6 risk register — mitigations get MORE runway, not less. The "MVD slips past Sunday evening" risk is downgraded from HIGH to LOW because slipping is acceptable.
- Section 8 open decisions — resolved (see below).

---

## 0. The timeline reality check (read this first)

The reconciled strategic doc's Round 4 P0 scope is roughly **3 epics × ~1 sprint each = 3+ weeks of focused work**:

- P0 #1 — Schema collapse + additive migration + photo gate (8 sequenced steps, flagged for staged rollout)
- P0 #2 — Audit log + live presence row indicator
- P0 #3 — Missed-load detection (Friday diff)
- P0 NEW — Completion tracking ("built in PCS?" badge) — added 2026-04-10, builders' #1 pain

**You have ~3 calendar days (~1.5–2 focused dev days) before dual-run.** 3 weeks of work does not fit into 2 dev days. This plan therefore splits the P0 scope into three horizons instead of pretending the original framing is achievable:

| Horizon                           | Window                       | What ships                                                                             |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| **MVD — Minimum Viable Dual-run** | Fri–Sun (by 2026-04-14 AM)   | Only what's needed for Jessica to sit down Monday and use v2 without obvious blockers  |
| **Phase 1 Fast Follow**           | 2026-04-14 → PCS OAuth ships | Audit log, missed-load, photo gate, comments tab, status colors — completes Round 4 P0 |
| **Phase 2 Trigger**               | PCS OAuth unblocks           | Completion tracking, builder-company filter, per-builder validation, PCS REST push     |

**Critical reframing** (surfaced by the reconciliation pass): completion tracking was called P0 in the strategic doc because it's the builders' #1 pain — BUT in Phase 1 (dual-run), **Jessica validates alone**. Builders stay on sheets until Phase 2. So completion tracking is NOT a dual-run day-1 blocker. It's a Phase 2 day-1 blocker. This reorders the critical path significantly.

---

## 1. Slip-vs-ship decision matrix

Before committing to MVD execution, someone needs to make a call. Two framings to choose from:

### Framing A — Ship MVD, slip the rest (RECOMMENDED)

- Dual-run starts 2026-04-14 on schedule with a minimum v2
- Jessica validates on v2, builders stay on sheets (Phase 1 per the strategic doc)
- Remaining P0 ships week 1–2 of dual-run as fast-follow
- **Trade-off:** Jessica gets fewer features on day 1; the team sees v2 ship and gain confidence that we're delivering on the dual-run commitment

### Framing B — Slip dual-run to 2026-04-21 (fallback)

- Announce a one-week slip to the team now (before Monday)
- Use the extra week to ship real P0 #1 + P0 #2 + P0 #3 properly
- **Trade-off:** Credibility hit from a slip announcement. Team has been told dual-run starts Monday. Slip means renegotiating expectations with Jessica (who set the 2026-04-14 target on the 2026-04-09 follow-up call).

**Recommended framing: A.** The strategic doc's phased rollout explicitly expects Jessica to validate alone in Phase 1. She does not need completion tracking, builder-company filters, or full audit history on day 1. She needs: (a) sync unstuck, (b) the validation page functional, (c) photo gate so she isn't rubber-stamping phantoms, (d) visible search so she can find loads.

**✅ FRAMING A SELECTED 2026-04-11.** Dual-run target stays at ~2026-04-14 but is explicitly NOT a hard deadline. Caution-first posture; slip is acceptable.

---

## 2. MVD — Minimum Viable Dual-run (ship by 2026-04-14 AM)

**Goal:** Jessica can sit down Monday morning, see a live sync, validate Tier 1s with correct photo gating, and find loads by BOL. Nothing else is required on day 1.

**Definition of done:**

1. ✅ Round 3 branch merged/pushed to production
2. ✅ Sync re-enabled, writing to `bolNo` canonically
3. ✅ Photo gate feature-flagged on in production
4. ✅ Validation page shows a non-empty queue with correct Tier 1 scoring post-photo-gate
5. ✅ Visible BOL search affordance on Dispatch Desk header
6. ✅ Jessica can complete at least one round-trip: open a load → verify photo → approve Tier 1 → manually copy to PCS
7. ❌ Everything else in Round 4 P0 is **explicitly OUT of MVD scope** (ships in Phase 1 Fast Follow)

### MVD task sequence (dependency-ordered)

| #   | Task                                              | Est.     | Depends on | Risk | Owner |
| --- | ------------------------------------------------- | -------- | ---------- | ---- | ----- |
| M1  | Push Round 3 branch (19 commits)                  | 0.5–1 hr | —          | LOW  | Jace  |
| M2  | Snapshot tables + expand migration (steps 1–2)    | 1–2 hr   | —          | MED  | Jace  |
| M3  | Bounce Fastify, verify DDL took                   | 0.25 hr  | M2         | LOW  | Jace  |
| M4  | Update sync services to write `bolNo` canonically | 2–4 hr   | M3         | HIGH | Jace  |
| M5  | Re-enable sync, smoke-test against PropX staging  | 1 hr     | M4         | HIGH | Jace  |
| M6  | Photo gate rule + flag (step 5 of the P0 #1 plan) | 1–2 hr   | M5         | MED  | Jace  |
| M7  | Staged re-score: 10% of validation queue          | 0.5 hr   | M6         | LOW  | Jace  |
| M8  | Visible BOL search affordance (Dispatch Desk)     | 2–3 hr   | —          | LOW  | Jace  |
| M9  | End-to-end smoke test with Jessica's test account | 1 hr     | M5, M6, M8 | —    | Jace  |
| M10 | Go/no-go review (Sunday evening / Monday morning) | 0.5 hr   | M9         | —    | Jace  |

**Total estimate: 9.75–15 hours of focused work** (solo, sequential). Friday afternoon + Saturday + Sunday is the rough window, but **caution-first posture means this is a sizing estimate, not a budget**. If M4 needs a full day of staging verification, take the full day.

### MVD task detail

#### M1 — Push Round 3 branch (0.5–1 hr)

- The Round 3 branch (`fix/round-3-quick-wins`, 19 commits) is independent of Round 4 schema work
- None of the Round 3 commits touch `ticketNo`, `bolNo`, or the sync services (verify before push)
- Deploy via normal Railway pipeline, verify health check, move on
- **Rollback:** normal Railway rollback to prior deploy if anything regresses

#### M2 — Expand migration (1–2 hr)

Per Round 4 P0 #1 step 1 of the strategic doc. All additive. Nullable. Metadata-only — no table rewrite.

```sql
-- Snapshot tables (rollback anchor)
CREATE TABLE loads_snapshot_pre_r4 AS SELECT * FROM loads;
CREATE TABLE assignments_snapshot_pre_r4 AS SELECT * FROM assignments;
CREATE TABLE photos_snapshot_pre_r4 AS SELECT * FROM photos;
-- (+ bol_submissions, jotform_submissions if they haven't been added to schema yet)

-- Additive columns
ALTER TABLE loads ADD COLUMN loader text;
ALTER TABLE loads ADD COLUMN sandplant text;
ALTER TABLE loads ADD COLUMN weight_lbs numeric;
-- (ticket_no and bol_no both stay writable for the dual-write window)
```

- **Verification:** run the pre-migration SQL block from `2026-04-06-workflow-architecture-v2.md` Part 7 BEFORE the DDL (source fingerprint + FK dependent inventory)
- **Rollback:** drop the new columns; snapshot tables are preserved

#### M3 — Bounce Fastify (0.25 hr)

- postgres.js has a known result-type cache issue that can return stale shapes on idle connections after DDL
- Do not trust graceful reconnect — restart the Railway deploy
- Verify health check, verify a simple read against `loads` returns the new columns

#### M4 — Sync service `bolNo` canonicalization (2–4 hr)

The most dangerous task in the MVD. Touches:

- `backend/src/plugins/ingestion/services/propx-sync.service.ts` (around line 533 per the code audit)
- `backend/src/plugins/ingestion/services/logistiq-sync.service.ts` (around lines 580–583)
- `backend/src/plugins/verification/services/jotform.service.ts` (around lines 186–193)

**What changes:**

- Writers populate `bolNo` as the canonical BOL column (the value currently going into `ticketNo`)
- `ticketNo` stays writable during the dual-write window
- New columns (`loader`, `sandplant`, `weight_lbs`) get populated from source-API fields where available
- Reconciliation service (`backend/src/plugins/verification/services/reconciliation.service.ts:316-317`) continues matching on both columns until the dual-read flag flips (post-MVD)

**Verification:**

- Unit tests for the sync services (they exist; run them)
- Manual staging sync against PropX with a 10-load window, spot-check `bolNo` vs `ticketNo` values

**Risk:** HIGH because this is the bridge between "sync paused since April 2" and "sync writing live again." If the new writes are malformed, the queue pollutes further. Mitigation: stage the re-enable (M5) against a small window first.

#### M5 — Re-enable sync, staged smoke test (1 hr)

- Re-enable with a 1-hour pull window first, NOT the full "catch up everything since April 2" backfill
- Watch the `loads` table for anomalies (bolNo nulls, weight_lbs format, loader/sandplant nulls)
- If clean, widen to 24 hours, then to full backfill
- **Rollback:** pause sync, revert M4 commit, Fastify bounce, snapshot restore if the writes contaminated the table

#### M6 — Photo gate (1–2 hr)

Per Round 4 P0 #1 step 5:

```typescript
// In the matching engine
isTier1 = hasAllFieldMatches && hasPhoto;
```

- Behind its own feature flag (`PHOTO_GATE_ENABLED`)
- Honor the `photoStatus` enum: `"attached" | "pending" | "missing"` only — do NOT write `"matched"` (known prior-rounds gotcha)
- Ship the code change behind the flag, then flip the flag

#### M7 — Staged re-score 10% (0.5 hr)

- Run the re-score against 10% of the validation queue first
- Write every tier change to `rescore_audit` table keyed on `runId`
- Surface a "Tier 1 → Needs Photo" filter in Surface 2 so the delta is visible
- Proceed to 100% re-score ONLY if the 10% reads cleanly
- **Rollback:** `UPDATE assignments ... FROM assignments_snapshot_pre_r4 WHERE runId = ?`

#### M8 — Visible BOL search (2–3 hr)

- Add a visible search icon + placeholder input to the Dispatch Desk header
- Wire to the existing `/` master search route
- Route search results directly to the load drawer in context (not back to list view)
- Scoped to BOL-first detection — auto-detect BOL format on paste

This is the lowest-risk, highest-adoption-value MVD task. Jessica didn't know `/` existed at the 2026-04-06 call; if it's invisible on day 1 of dual-run, she'll hate v2 within an hour. Worth shipping even if something else slips.

#### M9 — End-to-end smoke test (1 hr)

- Open Jessica's test account (or a proxy)
- Validate one load end-to-end: find via search → open drawer → check photo → approve Tier 1 → confirm audit (if audit log shipped; OK if it didn't)
- Run against the re-scored queue
- Document the smoke-test result in a one-paragraph update to Jessica on Sunday night

#### M10 — Go/no-go (0.5 hr)

Sunday evening or Monday 7 AM review. Criteria:

| Criterion                                                  | Status |
| ---------------------------------------------------------- | ------ |
| Sync writing live to `bolNo`, no errors in last 4 hours    | ☐      |
| Validation queue re-scored, photo gate flag ON             | ☐      |
| `/` search visible and working on Dispatch Desk            | ☐      |
| Jessica's smoke test passed (at least one full round-trip) | ☐      |
| No known-regression in Round 3 deployed code               | ☐      |
| Rollback plan documented and rehearsed                     | ☐      |

**If any criterion is RED on Sunday evening, escalate to Jessica immediately** with the option to start dual-run Tuesday instead of Monday. Better a one-day slip with 24 hours notice than a Monday launch that burns trust.

---

## 3. Phase 1 Fast Follow (2026-04-14 → PCS OAuth ships)

Ships during dual-run week 1–2, in the order below. All tasks are P0/P1 per the reconciled strategic doc; the split from MVD is about what's blocking day 1, not about what matters less.

### F1 — Audit log MVP (2–3 days)

- `auditLog` table + decorator wrapping load mutations
- **R3 scope cut:** 2 event types only (`cleared`, `re-dispatched`)
- Tab in load drawer: Timeline / Audit Log / Comments
- Single-source design — validate adoption before expanding

### F2 — Missed-load Friday diff (1–2 days)

- Tag every load with import timestamp (if not already)
- Friday diff job: per company, pull current period, compare against prior pull, surface new-but-should-have-existed as "missed"
- Ship as weekly manual trigger; automate later
- **Ship BEFORE the first Friday of dual-run (2026-04-18)** so Jessica's broken Friday ritual gets replaced before she misses it

### F3 — Dual-read flag flip + contract migration prep (1 day)

- `USE_CANONICAL_BOL` feature flag on application reads
- Audit remaining `ticketNo` read sites and migrate to `bolNo`
- Contract migration itself (drop `ticketNo` column) defers 1–2 weeks per the strategic doc

### F4 — Status colors (0.5 day)

- **R3 scope cut:** 4 of 7 labels only (Missing Tickets, Loads being built, Loads being cleared, Loads Completed)
- Row coloring on the existing tabs; NOT a tab replacement
- Visual-only change, low risk

### F5 — Comments tab (0.5–1 day)

- `load_comments` table
- Third tab in load drawer alongside Timeline / Audit Log
- Single-example design from Jessica — ship minimal, validate demand, do NOT invest in scoping/mentions/real-time

### F6 — Inline editing parity on Validation page (0.5 day)

- Port the inline-edit affordance from Dispatch Desk to the Validation page
- Jace flagged this as a known gap on 2026-04-06; not a new ask

### F7 — Phased rollout feature flag (0.5 day)

- User-level toggle between "Phase 1 single-user mode" and "Phase 2 multi-user per-builder mode"
- Gate the builder-company filter (Phase 2 trigger) behind this flag
- Ship before Phase 2 so the transition week is smooth

**Phase 1 Fast Follow total estimate: ~7–10 dev days** across 1–2 calendar weeks. Should complete before Kyle's PCS OAuth is ready.

---

## 4. Phase 2 Trigger (blocked on PCS OAuth)

These tasks cannot start until Kyle's PCS OAuth is ready AND Phase 1 Fast Follow is stable. They are P0/P1 for **Phase 2 day 1**, not for dual-run day 1.

### P2A — Completion tracking ("built in PCS?" badge) (half sprint)

**Builders' #1 pain.** Scout (29:28) + Stephanie (41:06) both asked for it on the 2026-04-09 call.

- `builtInPcs` boolean + timestamp + actor on the load record
- Row-level badge on Dispatch Desk: unbuilt / built / cleared
- Write on the build event (via PCS REST push, which is the Phase 2 trigger itself)

### P2B — Builder-company filter (half sprint)

- `primaryCompany` field on users table (Scout=Liberty, Steph=Logistiq, Keli=JRT)
- Default filter on Dispatch Desk = current user's company lane
- Admin toggle (Jessica's manager view)

### P2C — Per-builder validation flow (half sprint)

- Merge Surface 2 (Validation page) validation actions into Surface 1 (Build Workbench) for each builder's lane
- Keep Surface 2 as fallback/admin view for Jessica

### P2D — PCS REST push (unknown estimate, OAuth-gated)

- The actual push-to-PCS integration that replaces the manual copy/paste step
- Estimate depends on Kyle's OAuth shape and PCS API docs
- Tracks separately; blocks P2A/P2B/P2C execution timing

### P2E — Clearing status badge (half sprint)

- **PropX-only** in this round (Logistiq deferred until team confirms field name)
- Observed badge on load drawer: PropX clearing status + PCS clearing status (two sub-states)
- Inform sync-timing race decision with Kati's full walkthrough (still pending)

**Phase 2 total estimate: ~2 sprints + PCS OAuth integration overhead.** Unlockable only when OAuth is ready.

---

## 5. Deferred (next round or later)

Items from the reconciliation that are real but not load-bearing for Round 4:

- **Duplicate BOL flagging** (Kati's ask, 33:20) — ship when Phase 2 P2E ships or in Round 5
- **Payroll report parity** (Brittany's adoption blocker, 57:19) — needed for billing-side adoption, not dual-run
- **PropX PO-in-BOL-field handling** (Kati, 33:38) — ML/rule training, post-OAuth
- **90-day historical backfill** (missed-load bonus) — requires sheet-ingestion pathway that doesn't exist
- **Daily target editing** (demoted from v1 P0 to P2) — keep on roadmap
- **Stephanie's keyboard nav** — confirmed deferred; she didn't ask for it on 2026-04-09
- **Demurrage rules per shipper** — data-gather pending Jessica's old email
- **Logistiq clearing observation** — pending field name confirmation
- **Real RBAC** — per existing rollout strategy memory

---

## 6. Risk register

| Risk                                                                                       | Likelihood | Impact | Mitigation                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------------------------------------- |
| M4 sync writes contaminate `loads` table                                                   | MED        | HIGH   | Staged re-enable (1 hr → 24 hr → full); snapshot rollback; watch for bolNo nulls in first 100 writes      |
| Railway/Neon deploy issue eats 4+ hours during the Fri–Sun window                          | MED        | HIGH   | Deploy Round 3 branch Friday afternoon as a dry-run to surface infra issues before M2 lands               |
| postgres.js result-type cache returns stale schema shapes post-M2                          | LOW        | MED    | Mandatory Fastify bounce after M2 (M3 task); do not trust graceful reconnect                              |
| Photo gate re-score (M7) surfaces 30-40% of current Tier 1s as Needs-Photo, Jessica panics | HIGH       | LOW    | Pre-brief Jessica Sunday night: "You'll see ~30% of current greens move to Needs Photo — this is correct" |
| M8 visible search ships but `/` route has a latent bug Jessica hits Monday morning         | LOW        | MED    | Smoke-test visible search against at least 5 BOL variants (PropX, Logistiq, JotForm) in M9                |
| Kati or Brittany discovers during dual-run that MVD is missing a feature they need         | MED        | MED    | Framing: Phase 1 is Jessica-only. Kati and Brittany are not v2 users in Phase 1. Set that expectation now |
| Dual-run starts but sync lags → Jessica sees stale data                                    | LOW        | HIGH   | M5 staged re-enable; run catch-up backfill overnight Sunday if needed                                     |
| ~~MVD slips past Sunday evening~~ **(downgraded 2026-04-11 caution-first)**                | MED        | LOW    | No hard deadline. If MVD isn't ready Sunday night, inform Jessica Monday AM; start dual-run Tue/Wed.      |

---

## 7. What's on the critical path (one-paragraph TL;DR)

**M1 (Round 3 push) → M2 (expand migration) → M3 (Fastify bounce) → M4 (sync service update) → M5 (re-enable sync)** is the entire critical path to an MVD. Everything else (photo gate, visible search, re-score) can be parallelized or deferred. If M4 doesn't complete by end of day Friday (2026-04-11), escalate to Jessica about a one-day dual-run slip before end of business Friday. Do not carry the risk into Saturday silently.

---

## 8. Open decisions — resolved 2026-04-11

1. ~~**Who owns the work?**~~ → **Jace solo.** All execution from planning-complete to ship. No parallelization.
2. ~~**Framing A or B?**~~ → **A.** Ship MVD, slip the rest. Dual-run is a target, not a hard deadline.
3. **Friday-afternoon Round 3 push — confirmed go?** → **Still open.** Jace to decide. Round 3 is independent and low-risk, but Jessica should probably get a short heads-up before the push so she's not surprised by a deploy noise on a Friday afternoon before dual-run weekend. Recommend a one-sentence message: _"Pushing the Round 3 quick-win branch today. 13 small fixes (error messages, better empty states, bugfixes). No schema changes. Nothing visible should regress. Round 4 P0 work starts after this lands."_
4. **Staging env available for M5 dry-run?** → **Still open.** If no staging, the plan adjusts: M5 runs against production with a 15-minute window (not 1 hour), aggressive monitoring, and prepped rollback commands ready to paste. Caution-first posture accepts this is slower.
5. ~~**Escalation path if MVD fails Sunday night?**~~ → **Non-issue under caution-first.** Slip is acceptable. If MVD isn't ready Sunday night, dual-run starts Tuesday or Wednesday with Jessica informed Monday morning. No crisis path needed.

**Remaining to resolve before M1:** items 3 and 4. Neither blocks planning-level work; both are Jace's call at execution time.

---

## 9. Success criteria (post-MVD, evaluated 2026-04-21)

One week into dual-run, the plan succeeded if:

- Jessica is using v2 for daily validation (not only for show)
- Sync has been stable for 7 days with no rollbacks
- Photo gate is on; no Tier 1s without photos are advancing
- Jessica has found at least one missed load via search that she previously would have missed
- Phase 1 Fast Follow items F1–F4 have shipped (or are in flight)
- Builders are still on sheets (this is correct for Phase 1; not a failure)

The plan failed if:

- Sync had to be rolled back and re-paused
- Jessica abandoned v2 for the week and stayed on sheets
- A data corruption incident happened to the `loads` or `assignments` tables
- Phase 1 Fast Follow stalled on an unrelated blocker

---

## Appendix — Pointer trail

- Strategic doc (reconciled 2026-04-10): `docs/2026-04-06-workflow-architecture-v2.md`
- Source reconciliation (all sources checked): `docs/2026-04-10-source-reconciliation.md`
- First validation call (2026-04-06): `docs/2026-04-06-validation-call-findings.md`
- Team follow-up call (2026-04-09): Not yet written up as a standalone doc; transcript referenced in the reconciliation
- Round 3 quick win sprint AAR: `docs/2026-04-06-round-3-quick-win-sprint-aar.md`
- Code audit references: `backend/src/plugins/ingestion/services/propx-sync.service.ts:533`, `backend/src/plugins/ingestion/services/logistiq-sync.service.ts:580-583`, `backend/src/plugins/verification/services/jotform.service.ts:186-193`, `backend/src/plugins/verification/services/reconciliation.service.ts:316-317`

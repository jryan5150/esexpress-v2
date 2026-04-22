# ES Express — Thursday mic-drop + Monday walkthrough plan

**Date drafted:** 2026-04-22 (Wednesday)
**Revised:** 2026-04-22 evening — Thursday evening as delivery, Monday 10 AM CST walkthrough
**Solo dev:** Jryan (has Hairpin PCS admin access both sides)

---

## North Star

**Thursday evening — mic-drop email.** Site is open for validation, PCS push tested, Monday walkthrough calendar invite attached (unilaterally set — they didn't propose a time). By Friday morning the ES Express team wakes up to: product running, toggle ready, time on the calendar. They get the whole weekend to touch the system before Monday.

**Monday 10 AM CST — walkthrough.** After 3 full days of user-touch, Monday is ratification, not first-look. Answer Jeri's "if working, continue" with evidence instead of promises.

---

## Why Thursday evening, not Friday EOD

| Friday EOD ship                                   | Thursday evening ship                                  |
| ------------------------------------------------- | ------------------------------------------------------ |
| Client has 0-2 days before Monday to touch system | Client has 3 full days before Monday                   |
| Monday is first look → higher stakes              | Monday is confirmation → lower stakes                  |
| Calendar time asked, not given                    | Calendar time set, they respond                        |
| Rush risk Friday morning → all-nighter Thursday   | Test push is Thursday AM (fresh), evening is celebrate |

## Why Monday 10 AM CST (unilateral time)

- Morning coffee past, lunch not yet
- Gives Jryan 2-hr pre-flight cushion Monday AM
- 11 AM ET — east-coast friendly (Mike / Kyle timezone-compatible)
- Oilfield dispatch runs start early; 10 AM avoids their morning rush

---

## Work-back timeline

### Wednesday tonight (2-3 hrs, stop by 2 AM — NOT all-nighter)

**Goal:** deploy to prod with all today's work + PCS REST code, site LIVE, maintenance page GONE. Everything flag-gated OFF. No PCS test yet.

- [ ] Commit Apr-20 revert script ✓ (done: `82400f9`)
- [ ] Commit photo drawer fix ✓ (done: `5d316aa`)
- [ ] Commit apply-jessica-wells script
- [ ] Write merge command sequence as executable script
- [ ] Verify `PCS_CLIENT_ID` + `PCS_CLIENT_SECRET` in Railway env
- [ ] Merge `sprint/hardening-2026-04-22-25` → main
- [ ] Merge `feature/pcs-rest-dispatch` → main
- [ ] Push main → Railway auto-build backend
- [ ] Vercel deploy main (lift maintenance page)
- [ ] Smoke test: login as admin, Load Center, drawer, filter clicks
- [ ] Hit `/health` + `/diag/` — confirm plugins healthy
- [ ] Commit plan doc
- [ ] **SLEEP by 2 AM**

Why bounded: merge+deploy is mechanical. PCS push (decision-making) stays for Thursday fresh eyes.

---

### Thursday AM — fresh (3 hrs)

**Goal:** PCS push test executed end-to-end. You control both sides since you have Hairpin admin access — no coordination waiting.

- [ ] Auth-only smoke test: POST `/authorization/v1/tokens/oauth` with `client_credentials` → expect bearer token
- [ ] If auth works → proceed. If auth fails → debug, don't push.
- [ ] Create test assignment in v2:
  - `ticket_no`: `TEST-20260424-001`
  - `driver_name`: `TEST DRIVER — v2 smoke test`
  - `weight_lbs`: `50000` (clearly round)
  - Low-traffic well + loader
- [ ] Set `PCS_DISPATCH_ENABLED=true` in Railway
- [ ] Trigger push via `/api/v1/pcs/dispatch` or UI Validate button
- [ ] Watch logs: OAuth token → POST `/dispatching/v1/load` → 200 response
- [ ] Log into Hairpin PCS as admin → confirm load arrived with expected fields
- [ ] Void the test load on Hairpin side
- [ ] Set `PCS_DISPATCH_ENABLED=false` back to OFF
- [ ] Write `data_integrity_runs` entry documenting the test: timestamp, payload, response, void confirmed

**If push fails:**

- Read error class (400/401/403/500) → debug per plan
- Schema drift → fix Thursday afternoon, retest
- Credential wall → re-check 1Password → Railway env transfer
- If unfixable in 4 hrs → drop PCS from Monday scope, reframe mic-drop without PCS line

### Thursday midday — reconciliation + bugs (3 hrs, with lunch break)

- [ ] Check on Jessica's sheet share — send short re-ping if nothing yet
- [ ] Reconciliation plumbing: pull one day's sheet rows via service account (or your own Hairpin sheets as fallback if Jessica hasn't shared), compare against system counts for that day/well
- [ ] Document runbook: one command, one output, reviewed by eye
- [ ] Run `/diag/match-accuracy` → confirm trend endpoint live, badge visible on Home

### Thursday afternoon — dress rehearsal (2-3 hrs)

- [ ] Login as Jessica — validation page, click Validate on one load, confirm it advances
- [ ] Login as Scout — Load Center with filters, open drawer, step through photos, advance stage
- [ ] Login as Steph — same path as Scout
- [ ] Login as Jenny — reconciliation surface or admin page
- [ ] Login as admin — Wells admin, edit a rate, confirm persistence
- [ ] Click every high-traffic hot path, document bugs
- [ ] Fix all P0 (blocking) bugs immediately
- [ ] Note P1/P2 for Friday-Saturday

### Thursday ~8-9 PM CST — MIC DROP email

Send to: `Jess@ESExpressllc.com`, `Jeri@ESExpressllc.com`, `Bryan.Janz@Lexcom.com`, +Mike (add manually).

Subject: **ES Express — validation open, PCS push tested, walkthrough Monday April 27**

> Jessica, Jeri, Mike, Bryan —
>
> Site is open for validation as of tonight. PCS push tested end-to-end this morning against a sandbox assignment — toggle is safe to flip whenever your team decides.
>
> Walkthrough Monday April 27 at 10:00 AM CST — calendar invite attached. Between now and Monday, the site is yours to use for daily validation; anything looks wrong, reply and I'll fix same-day.
>
> Thanks,
> Jace

**Calendar invite details:**

- Title: `ES Express — Monday walkthrough`
- Date: Monday April 27, 10:00-11:00 AM CST
- Attendees: Jessica, Jeri, Mike, Bryan, Jryan
- Body: "Walkthrough of the live site. Validation workflow, PCS toggle, reconciliation dashboard, matcher accuracy trend. Bring questions."

**Then: end of day, sleep normally.**

---

### Friday (2026-04-24) — on-call passive

**Goal:** respond to any feedback from Thursday night / Friday morning usage.

- [ ] 8 AM CST: check email + app usage logs
- [ ] Any bug reports → fix same-day
- [ ] If PCS had cleanup leftover, handle it
- [ ] If Jessica shared sheet Thursday/Friday AM, run reconciliation demo against real data
- [ ] Midday: test edge cases not hit Thursday (5+ photo drawer, no-filter 30K scan, magic-link cold browser)
- [ ] Afternoon: free — rest or pre-emptive polish (not new features)

---

### Saturday → Sunday — extended soak + Sunday dress rehearsal

- [ ] Sat: monitor usage, fix surfaces same-day
- [ ] Sun 9 AM: full dress rehearsal, every role, every hot path
- [ ] Sun midday: pre-flight system checks — `/health`, `/diag/`, sync logs show weekend activity
- [ ] Sun EOD: confirm data correctness, silence known-OK warnings, prep for Monday AM
- [ ] Sleep reasonable hour

---

### Monday (2026-04-27) — walkthrough

- [ ] 6 AM CST: pre-flight check, all services healthy, sync logs clean, test login
- [ ] 8 AM: data sanity — overnight loads in system, matcher baseline still sane
- [ ] 10 AM CST — walkthrough:
  - Open: "here's what you asked for — product running, team validating, no PCS push"
  - Jessica's validation workflow (the ask from Apr 6)
  - Scout's dispatch flow under corrected data
  - Matcher accuracy trend (proof it's getting smarter)
  - Audit trail on a recently-cleared load
  - Jenny's reconciliation demo
  - Point at the PCS toggle: "this is yours — flip when you're ready"
  - Explicit ask: _"what would you need to see to say yes?"_

---

## PCS Test Plan (Thursday AM — Jryan controls both sides)

### Preconditions (verified before starting)

- `PCS_CLIENT_ID` + `PCS_CLIENT_SECRET` in Railway env from 1Password share
- `PCS_COMPANY_ID` pointed at Hairpin's PCS company ID (NOT ES Express's)
- Site deployed with `feature/pcs-rest-dispatch` merged
- `PCS_DISPATCH_ENABLED=false` at start

### Test assignment

Deliberately identifiable:

- `ticket_no`: `TEST-20260424-001`
- `driver_name`: `TEST DRIVER — v2 smoke test`
- `destination`: any existing low-traffic well
- `origin`: any existing loader
- `weight_lbs`: `50000`

### Execute

1. Set `PCS_DISPATCH_ENABLED=true` in Railway
2. Hit `/api/v1/pcs/dispatch` with test assignment ID
3. Capture backend logs
4. Log into Hairpin PCS as admin → confirm load arrived
5. Void the test load
6. Set `PCS_DISPATCH_ENABLED=false` back OFF
7. Document in `data_integrity_runs`

### Watch for

- OAuth token request: 200 from `/authorization/v1/tokens/oauth`
- POST `/dispatching/v1/load`: 200 OK, body has PCS load ID
- No 401/403/400/429/timeout

### Failure → fix → fallback

| Error        | Cause                | Fix                               | Fallback                                 |
| ------------ | -------------------- | --------------------------------- | ---------------------------------------- |
| 401 token    | Bad creds            | Re-check Railway env              | Delay PCS, push to Friday                |
| 403 dispatch | Company ID wrong     | Verify `PCS_COMPANY_ID=Hairpin`   | Same                                     |
| 400 dispatch | Payload schema drift | Compare our builder → latest spec | Drop PCS from Monday if unfixable in 4hr |
| 500 dispatch | PCS upstream         | Retry once, contact Kyle          | Delay                                    |
| Timeout      | Network              | Retry                             | Delay                                    |

**If all paths fail:** Thursday evening mic-drop email drops the PCS line. Frame Monday as "validation open, PCS ready on a separate future date." This is a cleaner miss than a broken toggle.

---

## Jessica's sheet-share status

**Wednesday evening status:** unresolved. Service account email was sent in Monday update. No confirmation yet.

**Service account to share with:** `esexpress-photos@pbx-59376783.iam.gserviceaccount.com`

- [ ] Thursday AM: short re-ping. "Any blocker sharing the Load Count Sheet with esexpress-photos@pbx-59376783.iam.gserviceaccount.com? Happy to click through it together if helpful."
- [ ] Thursday EOD: if still no share, include in mic-drop email as a soft ask: "Reconciliation demo Monday will be better with the sheet shared — if you get a chance before then, the account is [email]"

**Fallback:** if Jessica hasn't shared by Sunday, Monday demo shows either (a) the reconciliation email we already sent Wednesday (7-well comparison + deltas), or (b) comparison against Jryan's own Hairpin sheets to show the capability. Less ideal than live ES Express data, still demonstrates the feature.

---

## Decision gates — when to pivot

**Thursday 10 AM:**

- If deploy from Wednesday night is broken → stay in maintenance until fixed, reset Thursday scope

**Thursday 2 PM:**

- If PCS push test failed and can't be fixed in 4 hrs → drop PCS from Thursday mic-drop, open for validation only

**Thursday 8 PM:**

- If dress rehearsal surfaced a P0 that needs >4 hrs → delay mic-drop to Friday AM, fix overnight with breaks

**Sunday EOD:**

- Final go/no-go. Any lingering P1 bugs that would show Monday → send heads-up email Monday AM

**Monday mid-walkthrough:**

- If anything 500s — transparency beats cover-up. "Let me check why that happened" and pull logs live.

---

## What we don't do

- Don't merge anything new into main after Thursday AM deploy — every change after increases regression risk
- Don't take `PCS_DISPATCH_ENABLED=true` after Thursday's test until client flips it
- Don't promise features in mic-drop email that aren't shipped
- Don't drag client into Bryan/SOW conversation — internal Lexcom, stays internal
- Don't all-nighter pre-emptively — reserve for Thursday night only if PCS/dress-rehearsal surfaces real blockers

---

## Energy plan

User-stated capacity: "willing to pull all-nighter through tomorrow night with natural breaks." Reserve that. Don't spend it on Wednesday night.

- **Wed night:** bounded 3hrs, sleep by 2 AM
- **Thu AM–PM:** active dev, with lunch + mid-afternoon breaks
- **Thu evening:** mic-drop email, then stop
- **Thu all-nighter authorization:** only if Thursday PCS test or dress rehearsal surfaces >4hr blocker
- **Fri:** passive on-call
- **Sat–Sun:** normal rest, Sunday rehearsal

The leverage isn't from hours — it's from shipping Thursday instead of Friday.

---

## Confidence calibration

| Checkpoint                                    | After revised plan   |
| --------------------------------------------- | -------------------- |
| Wed night deploy clean                        | 90% (mechanical)     |
| Thu AM PCS auth works                         | 85%                  |
| Thu AM PCS push works                         | 85%                  |
| Thu evening mic-drop goes out with full scope | 80%                  |
| Jessica shares sheet by Sunday                | 75% (with two pings) |
| Monday walkthrough = "yes, continue"          | 85%                  |

85% on the Monday decision. That's the target. Shipping Thursday buys the extra 5% over Friday-ship (70-75%). The rest is execution + luck.

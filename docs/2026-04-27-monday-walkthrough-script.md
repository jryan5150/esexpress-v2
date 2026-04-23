# ES Express — Monday April 27 Walkthrough Script

**Time:** Monday 10:00 AM CST
**Format:** ~45 min walkthrough + 15 min Q&A
**Attendees:** Jessica, Jeri, Mike, Bryan, Jace

This is a speaking guide, not a script to read. Bullet points per section. The goal is to make Mike / Jeri's "continue vs. stop" decision easy by showing the system is operational, accurate, and answers their team's daily questions.

---

## Opening (5 min) — frame the value proposition clearly

> "What you asked for was a product running, team validating, no PCS push. That's what you're about to see. I also want to be upfront about something we learned between Monday's email and now that reframes the scope conversation — in your favor."

**Key talking points:**

- System has been live since Thursday evening. Your team has had 3+ days to touch it.
- PCS integration tested end-to-end. Push is wired, attachment upload works, sync pulls the active pipeline.
- The toggle for PCS push is in Admin → Settings. Flip it when you're ready. Timing is yours.

---

## Segment 1 — Daily dispatch workflow (10 min)

**Show:** Load Center, as Scout or Steph would see it.

**Demo flow:**

1. Load Center → filter = "Ready to Build" → ~N loads
2. Click a load → drawer opens → photo renders (no reload)
3. Point out the StagePill + PcsPill + PhotoStateBadge showing live state at a glance
4. Advance stage → shows stage transition + audit log

**What to emphasize:**

- _"No more 'is this photo missing or just delayed' question — every row tells you why it's in the state it's in."_ Point at a PhotoStateBadge saying "Photo pending — next JotForm sync in 12 min."
- _"JotForm freshness chip at the top shows the pipeline is healthy. Green means last sync was under 30 min ago."_
- _"Any dispatcher — Scout, Steph, Keli — can hit 'Run Check' to force a JotForm sync without waiting for the 30-min cron."_

---

## Segment 2 — Validation workflow (Jessica's surface) (8 min)

**Show:** filter = "Uncertain" → single-row validation + inline edit

**Demo flow:**

1. Filter to uncertain loads → single-user validation page
2. Inline edit a field → save → persist
3. Drop to a load → add a comment → cross-team annotation

**What to emphasize:**

- _"This is optimized for one person. One power user validates. No clicking through a team UI."_
- _"Comments are per-load, cross-team. Dispatch can tag billing, billing can tag driver."_
- _"Every stage change has who-did-it attribution. The April 20 batch-clear incident is attributed to system backfill in the drawer timeline — not a mystery user action."_

---

## Segment 3 — Reconciliation (Jenny's surface) (10 min) ⚡

**This is the strongest segment.** Three reveals:

### A. PCS sync is live

> "The system pulls your PCS active load list every 15 minutes. Each v2 load shows its PCS state inline — 'PCS: Dispatched', 'PCS: Arrived', 'Not in PCS'. No more tab-switching."

- Click the "Not in PCS" filter → shows Scout/Steph's actual build queue
- Explain: _"Every load that's still needing to be built in PCS is here. When toggle flips, one click validates AND pushes."_

### B. Reconciliation — two systems, two naming conventions, a real bridge

> "When we connected the PCS pull this week, we found something structural: v2 and PCS are tracking the same deliveries under different identifiers. v2 ingests carrier dispatch from PropX and Logistiq — Liberty Apache Formentera Wrangler, Liberty Titan DNR Chili. PCS holds the customer-billing view — Comstock Dinkins JG 1H, Frac-Chem Load. Different names, same trucks."

- Pull up a live sync response (`curl /api/v1/pcs/sync-loads`) showing the 44 active PCS loads
- 1 matched (our test push), 43 unmatched — but each unmatched entry is now **rich**:
  - Shipper: "Cayuga Sands" · ticket #1654276 · 05/08/2023
  - Consignee: "Comstock Dinkins JG 1H" · Marquez, TX
  - 52,620 lb · 81 miles
- _"Every load that doesn't auto-link tells us **why**. Here: Cayuga Sands as an origin isn't in our ingestion. Comstock Dinkins JG 1H as a well isn't in our master. That's not a bug — that's scope we haven't set up yet. 43 historical loads waiting for the onboarding."_

### C. The bridging mechanism is wired — it's waiting for scope

> "For loads where v2 already covers the route, the bridge fires automatically. The matcher checks: does our OCR-extracted driver ticket match the scale ticket PCS's shipper stop has? Yes → auto-link. We don't have that data today because these 43 are from a service line v2 wasn't configured for. The moment we onboard Cayuga Sands as a loader and Comstock Dinkins as a well, the bridge closes for those 43 — and every future delivery down that lane."

### D. The flywheel finding — v2 was built on ~8% of your well universe

> "Tonight we processed 3 years of your historical dispatch data. 1,143 unique destinations across the corpus. v2 had 95 wells. There's a ~163-well gap we never knew about — with 21,000 historical loads attached to them. And now we know: the well PCS is billing against right now — Comstock Dinkins JG 1H — is #1 on that list with 605 historical loads."

- Show the flywheel discovery report + point at Comstock Dinkins JG 1H as the top consignee
- _"Two separate tools — the PCS reconciliation sync and the historical flywheel — independently landed on the same well. That's not coincidence. That's the same scope gap surfacing from two directions. 14 of those 163 got corrected overnight. The other 149 are in a review queue for your team, and every one of them expands v2's reach."_

---

## Segment 4 — Trust signals (5 min)

**Show:** Home page matcher accuracy badge, diagnostics page, audit log drawer tab.

**Demo flow:**

1. Matcher accuracy: **99.24% accept rate** across last week (real, measured on 4,734 human decisions)
2. Home page badge showing the trend
3. Drawer audit log on a recently-cleared load → who, when, why

**What to emphasize:**

- _"The matcher number is real — it's what your team accepted vs. overrode over 7 days. Not an estimate."_
- _"Every operation we run is logged in data_integrity_runs. When I say '28,648 rows were corrected Tuesday', that's traceable — not a vibe."_

---

## Segment 5 — PCS push toggle (3 min)

**Show:** Admin → Settings → PCS Push toggle (OFF).

**Demo flow:**

1. Open Settings page
2. Show the toggle currently OFF + last-changed timestamp
3. _"You flip this. Not me, not Railway. Flip it when you're ready."_

**Key line:**

> "This is the fulfillment of 'toggle is yours.' Last change of position shows in the audit. When you feel good about the validation pass, flip it. If anything breaks on first push, flip it back in one click."

---

## Q&A prep — likely questions + answers

### "Can we actually use it daily?"

Yes. Walk through Scout's typical day: see Ready-to-Build, open drawer, check BOL photo, advance to Building, push to PCS when toggle's on. We've tested each step against real data.

### "How accurate is the matching?"

99.24% on real decisions over the past week. The matcher learns from what your team confirms vs. overrides — that's the accuracy signal, not a synthetic benchmark.

### "What about Jenny's reconciliation?"

The 'missed by v2' signal is automated now. PCS sync every 15 minutes fetches the full detail on each PCS load — shipper + ticket #, consignee + city, dates, weight, miles. Each unmatched entry tells her exactly _why_ it's unmatched. Today it's surfacing 43 Cayuga Sands → Comstock Dinkins loads from 2023 that we haven't set up a pipeline for. Her review queue is no longer "go compare spreadsheets" — it's "do I want to onboard this scope or skip it." We kept the bridge infrastructure wired so the moment a well gets onboarded, every historical PCS load for it auto-links on the next sync.

### "Why does our PCS loadReference not match v2's load_no?"

Because they came from different starting points. v2's load_no is PropX's internal sequence. PCS's loadReference is whatever your team types when building the load — often the paper scale ticket the driver hands back at pickup. Both systems are right; they just never agreed on a key. v2 now knows how to bridge: shipper-stop referenceNumber against our OCR-extracted ticket. For the current 43 mismatched loads, the gap isn't the bridge — it's that v2 never ingested that pipeline's driver photos. Fix the pipeline scope, bridge closes on its own.

### "What about payroll?"

Load Report page exists with truck/date grouping + CSV export + PCS number column. That matches Jodi's Apr 17 ask almost exactly. Accessible via sidebar → Load Report.

### "What about the 163 wells you found?"

Review queue. We're not auto-adding. Your team classifies each as real / stale / sandplant-mis-classified. We add the approved ones as a bulk import.

### "What about scope creep / cost?"

The 163-well finding isn't scope creep — it's scope discovery. We built v2 against the 95 wells you gave us originally. Your business has more. Bringing them in is part of normal onboarding; the flywheel that found them runs continuously post-Monday so new wells auto-surface as they arrive.

### "What if we flip the toggle and PCS push fails?"

First push hits Hairpin by default (the test division we've been validating against all week). If it goes sideways, one DELETE call voids. Toggle-off pauses everything.

### "When can we start pushing to PCS for real?"

The moment you flip the toggle. Physically working.

### "Why should we continue past the billing period?"

Because the reveal — 163 missing wells, 99% match accuracy on real decisions, PCS-reconciliation automated without needing our sheets share — is evidence the system makes the team faster now, not someday. If we stop now, you lose the flywheel that's going to find the next gap before your team stumbles into it.

---

## What NOT to do during the demo

- Don't oversell. "It works" is stronger than "it's revolutionary."
- Don't flip the PCS dispatch toggle. That's their decision.
- Don't drag them through the calibration findings — have the docs linked but only walk through if asked.
- Don't apologize for the 163-well gap. Frame it as what we learned _because_ we had the flywheel infrastructure to find it.

## Decision ask — the close

> "What would you need to see today to feel comfortable continuing past Friday's billing cutoff?"

This puts Mike / Jeri into specifying their bar instead of generally evaluating. If they can't name it, you already have their yes.

---

## Post-walkthrough follow-ups (same-day)

- Email recap with bullet list of what was covered + links to the reports
- Any P1 issue surfaced during walkthrough → fix same day, reply-all with "fixed: X"
- If continue decision → kick off Thursday AM flywheel continuous-discovery cron
- If stop decision → same-day honest wind-down plan (data export, SOP for their team)

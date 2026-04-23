# Cross-Check Mechanism — Scenario Reference

**Purpose:** Standalone reference for the Monday ES Express walkthrough. Three business scenarios where v2's two-direction cross-check (PCS billing view ↔ v2 dispatch view) delivers ongoing operational value. Use this during the call as a talking-points lookup, not a script.

**Last updated:** 2026-04-23

---

## The mechanism in one paragraph

v2 and PCS look at the same deliveries from opposite ends — v2 sees the carrier-dispatch side (loads ingested from PropX/Logistiq), PCS sees the customer-billing side (what ES Express bills to the shipper). Every 15 minutes, v2 pulls PCS's active load list and asks two questions per load: "do I already have this?" (direct match on shared identifier) and "is the shipper's scale ticket on any of my OCR-extracted BOL photos?" (Path A bridging). When the answer is no to both, the mismatch is classified and surfaced. Same mechanism, different inputs, three business scenarios it catches.

The cross-check never stops running. That's the product — not what it found Monday, but what it keeps finding while nobody is watching.

---

## Scenario 1 — New customer/well onboards itself

### The business story

> _"Apache signs a new pad called 'Baytex Yucatan' next month. Scout types the first load into PCS. On the 15-minute sync, v2 looks at that load and says 'I don't have this well.' Jessica sees it in her review queue — shipper name, ticket number, date, weight, miles, all pre-filled. One click: Add. v2 learns the well. Every future Baytex Yucatan load from that day forward auto-matches."_

### Why this matters to them

- Onboarding today is tribal knowledge. Jessica remembers to add things because she's been doing it forever.
- That's a single-point-of-failure process — if Jessica's out, or the name comes through slightly differently than she expects, a new well can run for weeks before anyone notices v2 didn't know about it.
- The cross-check removes the "someone has to remember" step. The system remembers for them.

### What's actually wired (be precise)

| Piece                                                                                    | State                 | Where                                                                     |
| ---------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| PCS sync pulls active loads every 15 min                                                 | ✅ Shipped            | `backend/src/scheduler.ts`                                                |
| Sync enriches each missed load with shipper + consignee + date + ticket + weight + miles | ✅ Shipped 2026-04-23 | `backend/src/plugins/pcs/services/pcs-sync.service.ts` (commit `9d8ee5f`) |
| `consigneeInV2Wells` flag on each missed entry                                           | ✅ Shipped            | same                                                                      |
| Admin UI to render the queue + "Add well" action                                         | ❌ Not yet            | Post-Monday build if engagement continues                                 |
| Auto-bridge on next sync once well is added                                              | ✅ Shipped            | Path A logic in sync service                                              |

### Language for the call

**Lead with:** _"The first Cayuga Sands → Comstock Dinkins load that hit PCS came back with full detail — shipper, date, ticket, consignee. Every subsequent one stacked on the same pile. That pile is now the review queue."_

**If they ask how the queue is surfaced today:** _"Backend-wise it's live — the sync returns it. UI-side we can walk you through a curl response Monday if you want to see the raw data; the polished admin page is the first week's worth of continuation work."_

**The honest caveat:** the admin UI isn't built yet. The _mechanism_ is. Be upfront.

### What NOT to promise

- Don't promise "new wells add themselves." They don't — Jessica has to approve.
- Don't promise the bridge fires for current 43 without the well being added first. It won't.

---

## Scenario 2 — Delivered but never billed

### The business story

> _"A driver delivers. The signed BOL gets lost between truck cab and Bryan's desk — you've all seen it happen. Before today: that load sits in dispatch with no PCS billing record. Maybe Jenny catches it in the quarterly audit. Maybe not. Now: v2 knows a load was dispatched. PCS knows what's been billed. The 15-minute sync flags any load v2 has that PCS doesn't. Same day — not next quarter — Jodi sees one missing piece of paper instead of a quarter's worth."_

### Why this matters to them

- The missed-load analysis over 3 years found 1,778 load-number gaps. Even at a conservative 10% "genuine miss" rate, that's **~$60K unrecovered revenue** historically.
- Forward-looking, the cross-check keeps that number at zero. Every missed billing surfaces inside a day.
- It's the automated version of Jenny's workflow, minus the detective work.

### What's actually wired

| Piece                                                                           | State             | Where                                                                 |
| ------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| "Not in PCS" Workbench filter (v2 loads with no PCS counterpart)                | ✅ Shipped        | `backend/src/plugins/dispatch/services/workbench.service.ts` line 332 |
| 15-min PCS sync populates `assignments.pcsDispatch.pcs_status` on matched loads | ✅ Shipped        | `pcs-sync.service.ts`                                                 |
| Historical missed-load analysis quantifying the 3-year exposure                 | ✅ Shipped as doc | `docs/2026-04-23-missed-load-analysis.md`                             |
| Daily/weekly email digest of newly missed loads                                 | ❌ Not yet        | Post-Monday build if continuation                                     |
| Alert threshold (e.g. "missed for more than 48 hrs")                            | ❌ Not yet        | Post-Monday                                                           |

### Language for the call

**Lead with:** _"Your 'Not in PCS' filter on the Workbench is the list of loads v2 dispatched that haven't shown up on PCS's billing side. Today Scout can see it; what's not built yet is the proactive alert — Jodi getting notified when a load's been not-in-PCS for 48 hours. That's a 1-week follow-up."_

**If they ask for a dollar figure:** _"The missed-load analysis over 3 years found between $60K and $150K of unrecovered revenue depending on how strictly you count genuine misses vs cancellations. Going forward, the mechanism catches new ones within 15 minutes. The recoverable dollar figure isn't $60K going forward — it's zero, because nothing ages."_

**The sharpening honest-caveat:** _"The Workbench filter exists today as a queue. The scheduled-alert layer on top of it is the part we'd build next."_

### What NOT to promise

- Don't say "v2 bills the loads." It doesn't — Jodi does, in PCS. v2 just surfaces the gap.
- Don't claim the historical $60K-$150K is recoverable now. Most of that is cancellations already accounted for. Forward-looking is the real story.

---

## Scenario 3 — Rate drift catches itself

### The business story

> _"You're billing Comstock at $25 a ton this week. v2's rate card says $22. Before: that mismatch lives in the seam between the two systems until someone does a margin audit and asks why — usually months later. Now: the cross-check fetches the PCS rate on every load and compares it to the v2 expected rate. When they disagree, the load surfaces for Jessica with both numbers visible. Either the rate card's stale and needs updating, or someone billed wrong. Either way, you know inside a day."_

### Why this matters to them

- Rate integrity is where service-line margins leak silently. $3/ton is real money on a 50-ton load running 500+ times a year.
- The PCS rating endpoint returns `lineHaulRate` + `accessorialRates` (FSC, detention, etc.) on every load. v2 stores rate + FFC/FSC rate per well. Comparing the two is arithmetic the system can do on every sync.
- This is the kind of thing a sharp accountant notices once a quarter. The cross-check does it every 15 minutes.

### What's actually wired

| Piece                                                                     | State                                                | Where                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| PCS GetLoad returns `rating.lineHaulRate` and `accessorialRates[]`        | ✅ Verified 2026-04-23 via `/pcs/debug/load/:loadId` | PCS API                      |
| v2 stores rate on loads + `rate_per_ton`, `ffc_rate`, `fsc_rate` on wells | ✅ Shipped                                           | schema + `wells` table       |
| Rate-comparison logic on sync                                             | ❌ Not yet                                           | Post-Monday (~1-2 day build) |
| Surfacing rate mismatches as a review queue                               | ❌ Not yet                                           | Pairs with #1 admin UI       |

### Language for the call

**Lead with:** _"Both systems carry the rate. PCS has the billed-rate in its detail response; v2 has the expected-rate from the rate card. The comparison isn't wired yet but the data's on both sides — we've verified the PCS side pulls it. That's the next layer of the cross-check: not just 'does it exist' but 'does it match.'"_

**If they ask how soon:** _"About a week of work once the engagement continues. The PCS data is confirmed; v2's side already has the fields. It's arithmetic plus a review queue."_

**If they ask for a dollar impact estimate:** _"Hard to quantify without running a specific comparison against one month of your data. That's a short engagement we could run the first week after continuation — look at one month of delivered loads, compare v2 expected vs PCS billed, tell you exactly what the gap is. If the gap is zero, it's a clean bill of health. If it's not, you've paid for the tool in one finding."_

### What NOT to promise

- Don't claim margin-recovery dollars without running the comparison first. Speculating on a number could backfire if the actual gap is small.
- Don't imply v2 will auto-correct rates. It surfaces; humans decide.

---

## How to talk about all three together

### The unifying frame

> _"Every one of these scenarios is the same mechanism — two systems looking at the same delivery from different angles, raising a flag when they disagree. New customer arrives: mismatch. Delivery missed billing: mismatch. Rate drift: mismatch. The mechanism doesn't know or care which of the three it's catching. It just keeps cross-checking."_

### The compounding argument (for Mike/Jeri)

> _"One gap today. Three gaps next week. Twelve per quarter as the business grows. That's what you're buying — a system that keeps noticing things before anyone has to remember to look. Scope, money, integrity. Same mechanism, three business outcomes, continuous."_

### The single-point-of-failure argument (for ops anxiety)

> _"Jessica is your institutional memory. She's going to get promoted, take vacation, eventually retire. Every one of these catches is a thing the business would normally depend on her catching. The cross-check is her backup — not a replacement, a second pair of eyes that never clocks out."_

---

## What NOT to do on the call

- Don't lead with all three at once. One sinks in. Three blur together.
- Don't promise admin UIs for scenarios 1 & 2 that aren't built. Say "post-continuation" or "week 1 build."
- Don't estimate specific dollar amounts for scenario 3 without data. Offer to run the comparison as a first-week deliverable.
- Don't tie the mechanism to the 43 Cayuga→Comstock loads specifically. Those are the trigger; the value is forward-looking.

---

## Quick status reference (copy-paste into the call)

| Scenario                     | Backend ready                                               | UI ready                          | First-week post-signing build        |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| 1. New customer auto-surface | ✅                                                          | ❌                                | Admin review queue                   |
| 2. Delivered-not-billed      | ✅                                                          | 🟡 (filter exists, alert doesn't) | Scheduled alert layer                |
| 3. Rate drift catch          | 🟡 (PCS side confirmed, v2 side stored, comparison missing) | ❌                                | Comparison + review queue (1-2 days) |

---

## The close-the-deal line if only one lands

> _"The mechanism is the thing you're continuing. What it found this week is just the first output. It runs forever, and every answer it gives is either scope, money, or integrity. That's three of the biggest operational questions in a trucking business, automated."_

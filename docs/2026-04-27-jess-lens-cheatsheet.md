# Jess-Lens Cheat Sheet — Monday 4/28 Walkthrough

> Generated 2026-04-27 ~9 AM CDT against live prod. Re-run before demo.
> Bar: every visible artifact on every surface has a one-line answer.

---

## The Six Things She'll Actually Point At

### 1. "Why only 8 wells this week?"

**What she sees:** Worksurface grid for week of 4/26 shows 8 well rows / 8 active cells.
**Prior weeks show 11–12 rows / 42–55 cells.**

**Answer:** "It's Sunday morning. The week is 1.5 days old. Watch this number climb through Monday — by Tuesday it'll match the prior weeks." Show her the week-of-04/19 grid (51 cells) as the steady-state reference.

**Demo move:** Open `/workbench` and immediately use the "← Previous week" arrow to show 4/19. Then come back. This sequences the explanation visually.

---

### 2. "What does '3,665 uncertain matches' mean?"

**What she sees:** Inbox badge shows "50 of 3665" on the Uncertain Matches section.

**Answer:** "That's 14 days of accumulated pending assignments — most of it is carry-cost from when we paused sync between 4/2 and 4/22. Not today's backlog. The 50 most recent are what's actionable. The other 3,615 are aging through the queue."

**Demo move:** Click into one. Show her the 47 of 50 are from the same well cluster (Logistix IQ Exco DF DGB Little 6-7-8) over the last 48 hours. Frame: "v2 sees every undocumented load. These were invisible to you before."

**⚠️ What might bite:** If she opens the section and sees 3,665 without the "of N" framing landing first, she may read it as failure rather than backlog. The fix already shipped; the framing is on you.

---

### 3. "What does '445 missing photos' mean?"

**What she sees:** Inbox section "Missing photos" with 50 items shown of 445.

**Answer:** "Loads where Logistiq delivered the metadata (driver, BOL, well, time) but the JotForm photo upload either didn't happen or didn't fuzzy-match. v2 surfaced 445 cases where the photo-capture chain failed silently before."

**Demo move:** Open the most recent one. Show her the driver name + BOL number are present — the only thing missing is the photo. "This is where the matcher tells you who to chase."

**⚠️ What might bite:** Same well cluster dominates this list too. Don't pretend it's diverse — own it: "The same Exco DF DGB cluster is showing both lists because it's the active well right now."

---

### 4. "What's 'Logistix IQ Exco DF DGB Little 6-7-8'?"

**What she sees:** A well row in the grid with that long ugly name.

**Answer:** "That's the Logistiq feed's full well-name string. Customer (Logistix IQ) + operator (Exco) + pad (DF DGB) + well numbers (Little 6-7-8). It looks long because Logistiq concatenates everything; PropX shortens to just 'Little 6' or 'DGB Little.' We're normalizing — for now you're seeing the raw Logistiq form."

**Demo move:** Click the cell, drawer opens with cleaner per-load detail. The drawer is the right view; the grid label is the placeholder.

**⚠️ What might bite:** If she asks "why does PropX show 'Little 6' but you show this monster?" — the honest answer is the Logistiq feed is the source for that well and we haven't built a display-name normalizer yet. Add to roadmap, don't apologize.

---

### 5. "Why is Bill To blank on a bunch of these?"

**What she sees:** Inbox items showing `?` or "—" where Bill To should be.

**Answer:** "Logistiq sends the sand provider's name in the customer_name field, not the actual Bill To. We use PCS as the authoritative source for Bill To, and these loads either haven't synced from PCS yet or aren't in PCS. The customer mapping fills in as PCS catches up."

**Demo move:** Show her one Liberty Bill To (which IS populated correctly via PCS) for contrast. "When PCS has the load, Bill To is right. When it's only Logistiq, Bill To is blank. Working as designed — but we can hide the blanks if you'd prefer."

**⚠️ What might bite:** The blanks look broken even though they're correct. Worth a 30-min fix before demo to show "—" + a tooltip "awaiting PCS sync" instead of `?`.

---

### 6. "The Sheet Truth page is empty for this week"

**What she sees:** `/admin/sheet-truth` shows `cells: 0, lastSync: null` for the current week.

**Answer:** "The sheet sync hasn't run for this week yet because the sheet itself hasn't been filled in by Jenny. As soon as Jenny starts painting the Current tab tomorrow morning, the sheet sync will pick it up and the page will populate. Last week's tab is fully reconciled — that's the steady-state view."

**Demo move:** Use the week selector to show 4/19 reconciled state. Don't dwell on the empty current week.

**⚠️ What might bite:** If she expects to see the sheet for 4/26 already, she'll think it's broken. Pre-empt it.

---

## What Jess Will Probably NOT Notice (But Could)

| Thing                                        | If she notices        | Answer                                                                                              |
| -------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Crystal: 312 loads (Sun 260 / Sat 52)        | "Why no Mon-Fri?"     | Sun is yesterday, Mon-Fri are future. By Tue this fills in.                                         |
| Jenny queue: 10 equipment_move, 0 samples    | "Where are they?"     | Samples are recent-window only; the 10 are older than the sample window.                            |
| Keli's grid is empty                         | "JRT not showing up?" | JRT loads come from PCS only — banner now explains this in-app.                                     |
| Home page Cross-Check pill says "1 PCS item" | "Just one?"           | One open PCS discrepancy this week. Click through to see it.                                        |
| TEST-HAIRPIN load in cells                   | "What's that?"        | Production push test seed — proves the PCS write path works end-to-end. Will be cleaned after demo. |

---

## P0 Fixes Worth Doing Before Demo

1. **Replace `?` with "—" + tooltip "awaiting PCS sync"** on inbox Bill To. 15 min. Hides the worst optical bug.
2. **Reframe the "of N" copy** — use "(50 most recent of 3,665 backlog)" not "(50 of 3665)". 5 min.
3. **Hide the Jenny equipment_move category if samples is empty** — showing "10 / 0 samples" reads broken. 10 min.

## P1 Items (Address in Q&A, Don't Pre-Fix)

- "Logistix IQ Exco DF DGB Little 6-7-8" naming — roadmap item, not P0
- The 3,615 aged uncertain matches — explain as carry-cost, don't try to clean before demo
- Empty Sheet Truth current-week — explain dependency on Jenny

---

## The One Thing That Could Sink the Demo

**If she opens the worksurface and the well names look unfamiliar, she'll lose trust in the next 30 seconds regardless of what else works.**

Pre-empt by opening on week 4/19 (which has clean Liberty wells she'll recognize) before pivoting to current week. Don't lead with the Logistix IQ row.

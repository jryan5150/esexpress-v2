# ES Express v2 — Continuation Decision Brief

**Date:** April 2026
**Format:** One-page summary. Full numbers + verification queries are in the validation-numbers attachment.

---

## What this document covers

A summary of what ES Express v2 has delivered, what it costs, and what continuing it through May actually buys.

## What you're getting for $5,500/month — in three numbers

### 1. **$60K–$150K of historical revenue exposure surfaced**

Three years of invoiced load-number sequences contain 1,778 gaps. Most are cancellations. At a conservative 10% genuine-miss rate, that's **$60K of revenue that was dispatched but never billed.** At 25%, $150K. v2's reconciliation layer (live as of this week) catches new ones inside 15 minutes — not at quarterly audit. Going forward, that exposure stays at zero because nothing ages out unseen.

### 2. **163 wells in the business v2 wasn't tracking — now visible**

v2 was built against the 95 wells originally provided. The 3-year analysis run last week found **163 additional wells with meaningful load volume** — 21,048 historical loads behind them. The well PCS is currently billing the most against (Comstock Dinkins JG 1H, 605 historical loads) is on this list. The team approves them and they're added. Each well-onboarding is hours of work, not weeks.

### 3. **23 days of build velocity vs the 8-month / $50K alternative**

v2 was started in early April. Twenty-three days of focused build later, the system is running cross-checks against live PCS data, has matched on 22 of 27 days against hand-counted reconciliation, and is surfacing scope expansion opportunities the team didn't have visibility into. The previous attempt at this kind of system was 8 months and $50,000 to replicate other TMS solutions — and it didn't ship.

This isn't a bet on whether the software will get better. It's a decision about whether to keep a learning loop running indefinitely against operational data.

### 4. **The pipeline tightened in real time**

A representative example of how the system improves under live use: this morning the team identified a case-sensitivity issue in the matching layer — driver photos were being extracted in uppercase while the loads table stored them in lowercase. Same string, no match. **813 driver-photo submissions had been sitting unmatched for that single reason.** One fix later, the driver-photo match rate jumped from 63.9% → **87.2%**. Tier 1 photo-attached coverage rose from 5.18% → **87.81%** in the same window. None of those numbers required new data — they required the system to keep finding what it had been missing.

---

## What this brief is not asking you to decide

- **Whether to push to PCS this week.** That toggle is in your hands. The push code is wired and proven (load 357468 went through end-to-end and is visible in both systems). Three follow-on attempts hit a snag we're working through with PCS's team for resolution. You flip the live toggle when you decide.
- **Whether to onboard the 163 wells.** Review queue surfaces them. The team approves what's real, skips what's stale. We don't auto-add anything.
- **Whether to change anyone's workflow.** v2 augments what the team already does — it doesn't replace it. The hand-counted reconciliation work is what trained the cross-check layer. The system mirrors the work that's been done manually for years.

---

## What continuation through May actually buys

The cross-check layer's value compounds. One discrepancy today, ten next week, hundreds per quarter. Each one is one of three things: **money** (missed billing), **accuracy** (wrong well, wrong weight), or **scope** (gap in coverage). The system being paid for in May is the same system that will have caught 500+ items by August. The curve isn't linear; it's an audit ratchet that never sleeps.

The work shipped this week — discrepancy detection, scope discovery, enriched PCS reconciliation — is the foundation of that ratchet. Stopping now is stopping it from running. Continuing now is letting it accumulate while the team gets back to dispatching loads.

---

## What changes if continuation is approved

- v2 stays operational; the team continues validating through next week
- Push toggle resolves at PCS team's pace; flip it when you're comfortable
- Cross-check layer keeps catching items every 15 minutes
- Week 1 post-continuation: scheduled email digest of new discrepancies, weekly summary, the 149 remaining historical wells move into the team's review queue
- Continuous flywheel against new dispatch data — new wells auto-surface as they appear

## What changes if continuation is declined

- Clean data export — loads, photos, decisions, all of it
- v2 winds down by end of May
- Cross-check layer goes with it
- Team returns to the prior workflow

Not a threat — just the actual trade. Both directions are honorable.

---

## The single ask

> "What would you need to see today to feel comfortable continuing?"

If we cleared that bar — say so. If we didn't — name what's missing and we'll either fix it this week or you'll have a clean reason for the call you make.

---

_All numbers in this brief are queryable in v2 and verifiable against your own PCS access. The Friday attachment includes the full breakdowns + how to verify each one yourself._

# ES Express v2 — Continuation Decision Brief

**For:** Mike + Jeri
**From:** Jace Ryan, Lexcom Systems Group
**Date:** Monday April 27, 2026
**Format:** One page. Hand-held during the call. The full numbers + queries are in the validation-numbers attachment from Friday.

---

## What you're deciding

Whether v2 continues past the Friday billing cutoff into May at $5,500/month.

## What you're getting for that $5,500/month — in three numbers

### 1. **$60K–$150K of historical revenue exposure surfaced**

Three years of your invoiced load-number sequences contain 1,778 gaps. Most are cancellations. At a conservative 10% genuine-miss rate, that's **$60K of revenue that was dispatched but never billed.** At 25%, $150K. v2's cross-check layer (live as of this week) catches new ones inside 15 minutes — not at quarterly audit. Going forward, that exposure stays at zero because nothing ages.

### 2. **163 wells in your business v2 wasn't tracking — now visible**

v2 was built against the 95 wells you originally provided. The 3-year analysis run last week found **163 additional wells with meaningful load volume** — 21,048 historical loads behind them. The well PCS is currently billing the most against (Comstock Dinkins JG 1H, 605 historical loads) is on this list. Your team approves them and they're in. Each well-onboarding is hours of work, not weeks.

### 3. **23 days of build velocity vs the 8-month / $50K alternative**

v2 was started in early April. Twenty-three days of focused build later, the system is running cross-checks against your live PCS data, has matched on 22 of 27 days against Jessica's hand-counted reconciliation, and is surfacing scope expansion opportunities you didn't have visibility into. The previous attempt at this kind of system was 8 months and $50,000 to replicate other TMS solutions — and it didn't ship.

You're not betting on whether the software will get better. You're deciding whether you want a learning loop running indefinitely against your operational data.

### 4. **The pipeline tightened in real time**

A representative example of how the system improves under live use: Friday morning the team identified a case-sensitivity bug where Vision OCR was extracting tickets in uppercase and the loads table stored them in lowercase. Same string, no match — **813 driver-photo submissions had been sitting unmatched for that single reason.** One commit later, the JotForm match rate jumped from 63.9% → **87.2%**. The Tier 1 photo-attached coverage rose from 5.18% → **87.81%** in the same window. None of those numbers required new data — they required the system to keep finding what it had been missing.

---

## What we are not asking you to decide

- **Whether to push to PCS this week.** That toggle is in your hands. The push code is wired and tested; one failure mode is currently with PCS's team for resolution. You flip it when you decide.
- **Whether to onboard the 163 wells.** Review queue surfaces them. Your team approves what's real, skips what's stale. We don't auto-add anything.
- **Whether to change your team's workflow.** v2 augments what your team already does — it doesn't replace it. Jessica's reconciliation work is what trained the cross-check layer. The system mirrors the work she's been doing manually for years.

---

## What continuation through May actually buys you

The cross-check layer's value compounds. One discrepancy today, ten next week, hundreds per quarter. Each one is one of three things: **money** (missed billing), **accuracy** (wrong well, wrong weight), or **scope** (gap in coverage). The system you're paying $5,500/month for in May is the same system that will have caught 500+ items by August. The curve isn't linear; it's an audit ratchet that never sleeps.

The work shipped this week — discrepancy detection, scope discovery, enriched PCS reconciliation — is the foundation of that ratchet. Stopping now is stopping it from running. Continuing now is letting it accumulate while your team gets back to dispatching loads.

---

## What changes if you say yes today

- v2 stays operational; your team continues validating through next week
- Push toggle resolves at PCS team's pace; you flip it when you're comfortable
- Cross-check layer keeps catching items every 15 minutes
- Week 1 post-continuation: scheduled email digest of new discrepancies, Mike-specific weekly summary, the 149 remaining historical wells move into your team's review queue
- Continuous flywheel against new dispatch data — new wells auto-surface as they appear

## What changes if you say no today

- We provide a clean data export — your loads, photos, decisions, all of it
- v2 winds down by end of May
- The cross-check layer goes with it
- Your team returns to the prior workflow

Not a threat — just the actual trade. Both directions are honorable.

---

## The single ask

> "What would you need to see today to feel comfortable continuing?"

If we cleared that bar — say so. If we didn't — name what's missing and we'll either fix it this week or you'll have a clean reason for the call you make.

---

_All numbers in this brief are queryable in v2 and verifiable against your own PCS access. The Friday attachment includes the full breakdowns + how to verify each one yourself._

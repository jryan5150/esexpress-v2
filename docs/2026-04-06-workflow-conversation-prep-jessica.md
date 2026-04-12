# ES Express v2 — Strategic Conversation Prep

**Date:** 2026-04-06
**For:** Jessica
**From:** Jace
**Format:** ~30 minute call, screen-share optional
**Purpose:** I want to validate how I'm thinking about v2 with you before we plan the next round of work.

---

## Why I'm asking for your time

After Round 3 of v2 wrapped this week, I realized something uncomfortable: my engineering team has been building features based on what we _think_ your team needs, filtered through code review notes and persona summaries. We haven't gone back to you directly in a while to check whether the picture in our heads still matches reality.

This week I re-read the actual recordings from our workflow capture sessions — Stephanie's session and the workflow conversation with Scout from February. And I found something none of the engineering notes ever named: **the "chain" concept** — Stephanie builds a load, turns the row her color on the master sheet, and Katie clears. Scout's words: _"We're all part of like a chain."_

The chain is the heart of how your team works. **v2 has zero concept of it.** That's the kind of gap I'm worried about across the rest of the system, too.

So before we plan Round 4, I want 30 minutes of your time to confirm or correct how I'm thinking about v2. **The goal of this call is for you to make me wrong on the parts where I am wrong**, so we don't waste another round building from a wrong frame.

---

## How I'm currently thinking about v2

Let me show you the model I have in my head, then you can tell me where it's right or wrong.

### The four surfaces

I see v2 as four functional pieces, each owned by different parts of the team:

```
1. THE DAILY WORKBENCH (Dispatch Desk)
   Stephanie / Scout — copy validated loads into PCS, mark them done

2. THE RECONCILIATION LOOP (BOL Queue + Validation page)
   You + Katie — fix Tier 2/3 matches, missing tickets, BOL mismatches

3. THE OPERATIONAL OVERSIGHT (Today's Objectives + per-well drilldown)
   You (manager hat) — what's behind, what's ahead, daily targets

4. THE CONFIGURATION (Admin pages)
   Admin role — wells, users, daily targets, eventually carriers
```

### The temporal pipeline

These four surfaces sit on top of a load lifecycle that goes:

```
INGEST → MATCH → VALIDATE → BUILD → CLEAR → DISPATCH → DELIVER → BILL
```

Loads come in from PropX/Logistiq/JotForm, get auto-matched (Tier 1/2/3), you review/release them, Stephanie builds them in PCS, Katie clears them, PCS dispatches, drivers deliver, finance bills.

### The chain (what I missed for months)

From Scout's recording:

> "After I build them, I will like turn it a color on this load count sheet and then Katie knows that she can go in and start clearing. We're all part of like a chain."

And from Stephanie:

> "We all have our own colors that we use so that if somebody's in the sheet and they have an issue or a question about one, they know who to ask."

Your team coordinates via two parallel mechanisms: the personal color on the master Google Sheet (informal — "I built this, ask me about it") and the PCS audit trail (official — PCS stamps the builder's name at the bottom of each load). **v2 has neither as a primary signal.** The data is in our database (`assignedTo`, `assignedToColor`) but we render it as a tiny colored dot, not as the main signal of "whose turn is it next."

This is the biggest miss I'm aware of, and the thing I most want your input on.

### The bridge → REST → replacement plan

The way I'm thinking about v2's evolution is in three phases:

- **Phase A (today): the bridge.** v2 stages and validates loads; Stephanie still copies them into PCS by hand. v2 is one of seven apps on her desktop.
- **Phase B (gated on Kyle's OAuth keys): the REST integration.** When Kyle delivers the credentials, v2 dispatches to PCS automatically. The clipboard step dies. Stephanie's job becomes "exception handler" instead of "clipboard typist."
- **Phase C (long-term): the replacement.** v2 IS the dispatch system. PCS becomes finance read-only or retires.

I'm assuming Phase B is real but unscheduled, and Phase C is the eventual destination. I want to check that with you.

---

## What I'd love your input on

These are the 8 things I'd love to talk through. Skim them ahead of the call if you have time, or just react in the moment — either works.

### 1. Does the four-surface model match how you see v2?

Workbench / Reconciliation / Oversight / Config. Or do you see it as three pieces? Five? Different groupings entirely? I want to be wrong here if I am — the rest of the doc is built on top of this assumption.

### 2. Is the "chain" still how the team works today?

The recordings I have are from February. Has the way the team coordinates evolved since then? Specifically: do Stephanie and Katie still hand off via the colored sheet, or is there a different signal you're using now? And does v2 currently help or hurt that coordination?

This is the most important question. If the chain framing is right, it changes what we ship next.

### 3. Is "clearing" a separate thing from "marking entered"?

In v2 we have one button: "Mark Entered." But Stephanie's transcript suggests Katie does a separate verification step _after_ Stephanie builds. Are those one action or two? What does "clearing" actually mean to Katie day-to-day?

### 4. Of the 38 fields on the Master Dispatch Template, which ones do you actually need v2 to show?

I pulled up the Master Dispatch Template — it has 38 fields. v2 currently surfaces about 14. The 24 I haven't shipped are:

**Identity references:**
Invoice #, ES Express #, Hairpin Express #, PO #, Order #

**Operations:**
Loader, Shipper # BOL, Total Demurrage with Reasons

**Time windows:**
Load In, Load Out, Load Time, ETA, Unload Appt, Unload In, Unload Out, Unload Time

**Financial breakdown:**
Rate/Ton, LINE HAUL, Demurrage breakdown, Total Load, FSC, Settlement Date

Of these — which ones do you and your team actually need to see in v2 every day, which ones live happily in finance/billing, and which ones do you never look at? **I'd rather ship the 6 that matter than the 24 that fill the screen.**

(Specific question: when you have v2 open AND a Google Sheet open at the same time, what's in the sheet that's NOT in v2 that you most often need to look at?)

A side question I have to ask: **what's the difference between "ES Express #" and "Hairpin Express #"?** Are those two separate identifiers for the same load, or are they different concepts? I genuinely don't know, and our schema currently only has one field (`loadNo`).

### 5. Is the bridge → REST → replacement framing real?

Is Phase B (PCS REST integration) actually a definite roadmap item, or is it aspirational? What's the latest on Kyle's OAuth keys — has anything changed? And is Phase C (v2 fully replacing PCS) the real long-term destination, or is v2 a permanent staging layer?

This matters a lot for how we prioritize. If v2 is a permanent bridge, we should optimize the bridge experience forever. If we're building toward replacement, we should start scaffolding the things that only matter in Phase C (audit log, multi-tenant, real RBAC) sooner rather than later.

### 6. The biggest hand-off blocker I see is daily target editing. Am I right?

The pencil button on the WellsAdmin page is dead. There's no UI to edit `dailyTargetLoads`, which is the field that drives your home-page progress bar. The only way to change it today is for an engineer to run raw SQL against production.

In my head, this is THE blocker to handing v2 to you for self-managed operation. Is that the biggest admin gap, or is there something else higher on your list? **Don't let me lead you here** — if there's a different admin blocker I haven't named, that's the thing I most want to hear about.

### 7. Speed asks — Stephanie's keyboard nav and her hardware shortcuts

If Stephanie has 5 minutes, I'd love to ask her directly. If not, your secondhand observation is fine.

The question is: what's her actual workflow at the keyboard today? She mentioned in her recording that she has a "one button to copy" mouse setup (custom mouse button, presumably). **Before we design J/K row navigation in v2, I want to make sure we don't conflict with her existing hardware-level shortcuts.** It would be a lot of work to ship keyboard nav and discover it actually slowed her down because it stepped on her existing setup.

Also: is keyboard nav still her #1 ask, or has that shifted? Round 3 didn't ship it (again), and I want to know how painful that is in 2026 reality.

### 8. The most important question: what do we always get wrong that you've stopped bothering to mention?

This is the hardest question to answer and the most valuable one. I've been working from filtered persona reports for a few months. Re-reading the actual transcripts this week, I found the chain concept and the personal-color system — neither of which the engineering notes ever named. **That tells me there are probably other things we ALWAYS get wrong that you've stopped reporting because you assume we know.**

So: where else has our engineering team's mental model drifted from how you actually work? What's the thing you'd say if you weren't being polite about it?

---

## What I'll do with your answers

After our call:

1. **I'll revise the strategic doc** that this prep material is based on. (I'll send you a copy if you want to read it — it's longer and more internal.) The corrections you give me will be marked "Jessica corrected on [date]" so future people on the team know what you said and when.
2. **Round 4 planning will start from the corrected version**, not from my original guess.
3. **The Round 3 fixes that just shipped** (deliveredOn date editing, the BOL Issues label, the confirm dialogs, the demurrage panel recolor, the home page freshness pill, etc.) will go to production around the same time. You should be able to verify them in v2 the same day or the day after.
4. **If you give me a correction big enough that I need a second conversation** to fully understand, I'll ask for one — better that than building from a half-understood answer.

---

## What I'd love you to bring

- Your honest reaction to the four-surface diagram and the chain framing (Q1 + Q2). Even _"I don't know, I've never thought about it that way"_ is a useful answer.
- A rough sense of which of the 24 missing fields matter most (Q4). You don't need a complete list — just the top 5-6 you'd want shipped first.
- **Stephanie**, if she's available, even for 5 minutes during Q7.
- Anything you've been frustrated about that you assume we already know (Q8). **This is the gold.**

---

## If we run over

If 30 minutes turns into 20, the questions to drop are **5** (the bridge → REST framing — I can hedge in the doc) and **7** (Stephanie's specific keyboard setup — I can ask her directly later).

The questions I most want answered, in order, are:

1. **Q2** — the chain
2. **Q8** — what we always get wrong
3. **Q4** — which fields actually matter
4. **Q6** — the admin blocker
5. **Q3** — clear vs. mark entered
6. **Q1** — the four-surface model

---

Thanks for this. The best engineering conversations are the ones where I find out I was wrong about something important, and that's what I'm hoping to find here. See you on the call.

— Jace

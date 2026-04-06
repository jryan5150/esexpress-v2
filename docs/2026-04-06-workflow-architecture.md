# ES Express v2 — Workflow Architecture & Strategic Frame

**Date:** 2026-04-06
**Status:** Draft pending validation with Jessica + Stephanie (see companion walkthrough doc)
**Audience:** Internal — engineering team, future agents picking up Round 4+
**Companion:** `2026-04-06-workflow-architecture-validation-walkthrough.md`

---

## Why this doc exists

Rounds 1, 2, and 3 of ES Express v2 have shipped real value but have all been _tactical bug-fixing on top of a strategic frame nobody re-read_. After running the Round 3 quick-win sprint, it became clear the persona reports we were working from were filtered through what each persona happened to be looking at — they weren't a model of how the team actually works together.

This document re-grounds v2 in the dispatcher's actual workflow, captured from the source recordings (Stephanie Venn and Scout transcripts, the 16 ScribeHow walkthroughs of the real apps they use today, and the master dispatch CSV templates with their 38 tracked fields). It proposes a four-surface workflow architecture, names the cross-cutting "chain coordination" concept v2 has been missing, identifies the disconnects between our engineering team and the ES Express team, and recommends an ordering for Round 4+.

**The single most important principle this doc advances:** _the system's job is to give to the user, not to ask of the user._ Every feature should reduce clicks, reduce context-switches, reduce things the dispatcher has to remember. Every feature that makes the dispatcher do MORE work — even if it looks impressive — is a regression.

**Status:** This doc is a v1 draft. It will be revised after the validation walkthrough with Jessica (and ideally Stephanie). The walkthrough is designed to surface where this doc is wrong, not where it is right.

---

## Part 0 — The Chain (preamble: how the team actually works)

The ES Express dispatch team is **a chain of 4 people** working asynchronously across a shared dataset. Each person has a role in the load lifecycle. They coordinate via two parallel mechanisms:

1. **PCS audit data** — when a dispatcher builds a load in PCS, PCS stamps the builder's name at the bottom of the load record. Anyone can query "who built load 1234" by opening it in PCS.
2. **Color coding on a shared Google Sheet** — each dispatcher has a personal color (Stephanie blue, Scout yellow, etc.). When you build a load, you turn the row your color. When the next person in the chain sees your color, they know what to do next. _This is informal, no SOP, no formal protocol._

In Stephanie's own words (Workflow Conversation transcript, 24:09):

> "So I change the color on the sheet. We all have our own colors that we use so that if somebody's in the sheet and they have an issue or a question about one, they know who to ask."

And from Scout (Workflow Conversation transcript, ~01:09):

> "After I build them, I will like turn it a color on this load count sheet and then Katie knows that she can go in and start clearing. We're all part of like a chain."

The chain is:

```
INGEST  →  VALIDATE  →  BUILD  →  CLEAR  →  DISPATCHED
   │           │          │         │           │
[PropX     [Jessica   [Stephanie  [Katie /   [PCS auto-
 Logistiq]  reviews    Scout]       Jessica]  advances]
[JotForm]   matches]
```

**Key insight:** v2 has built UI for the BUILD phase (Dispatch Desk), the VALIDATE phase (Validation page), and partial UI for INGEST (BOL Queue). It has shipped _zero_ UI for CLEAR — the handoff between the builder and the verifier. And it has built no model of the chain itself — the data is there (`assignedTo`, `assignedToColor`, `OperatorPresence`) but it's rendered as secondary chrome instead of as the primary signal the team uses to coordinate.

**This is the load-bearing missing concept in v2.** Stephanie's #1 ask isn't keyboard navigation — it's a system that knows whose turn it is next and tells them. Katie's #1 friction isn't unfamiliar acronyms — it's that she has no idea what Stephanie has built and is waiting on her to clear.

There is also a **second color system** that is entirely separate:

> Stephanie (10:42): "I just know that the green ones are where they pick up from the sand plant and the blue is when once they get to location to deliver the load."

The Google Sheet has green columns for _load-side dates_ (pickup) and blue columns for _unload-side dates_ (delivery). This is workflow-phase coloring, not personal coloring. v2 has neither.

Stephanie also makes the protocol's fragility explicit (10:54):

> "I just like to be able to see that other people don't care as much, so it's not always like that. Or they'll turn it off for whatever reason if they have to copy or paste something out of the sheet... some people turn it off."

The team's coordination is held together with **tribal habits and individual preferences**. Some dispatchers use color carefully, some don't. Some turn off color formatting entirely when they need to copy from the sheet. The whole chain protocol is one careless paste away from breaking. **This is the canonical "system gives to user" opportunity — v2 could give the team a real coordination protocol instead of the brittle Google Sheets habit.**

---

## Part 1 — The Four Workflow Surfaces

v2's UI naturally separates into four workflow surfaces, each owned by different parts of the chain.

### Surface 1: The Daily Workbench (Dispatch Desk)

- **Pages:** `/dispatch-desk` (Wells view + Loads view)
- **Owner:** Stephanie + Scout (the speed builders)
- **Job:** Take validated loads, copy them into PCS, mark them entered, color the row to signal Katie
- **Lifecycle phases owned:** BUILD, CLEAR (currently conflated)
- **Round 3 status:** ~60% there
- **Dispatcher voice (Stephanie, 38:56 — counting clicks literally):** "Actually with PropX you have to click 17 boxes. With LogistiqIQ there's a template already saved and we just pick what dates we want and it exports."
- **What's missing:**
  - Keyboard navigation (J/K, auto-expand-next) — Stephanie's #1 ask, open across 3 rounds
  - In-drawer "Mark Entered" button — Stephanie's #2 ask, open across 3 rounds
  - The CLEAR concept entirely (no "Katie clears this" workflow)
  - The chain coordination signal (color = ownership) is rendered as a small dot, not the primary signal
  - 24 of 38 fields from the Master Dispatch Template are missing
  - The dead Missing Ticket button (Round 3 left this disabled with a tooltip; needs the real flag-for-review backend)

### Surface 2: The Reconciliation Loop (BOL Queue + Validation page)

- **Pages:** `/bol`, `/validation`
- **Owner:** Jessica primarily (gatekeeper), Katie secondarily (verifier)
- **Job:** Resolve ambiguous data — Tier 2/3 auto-matches, missing tickets, BOL mismatches — and release clean data back to the workbench
- **Lifecycle phases owned:** AUTO-MATCH, VALIDATE, RECONCILE
- **Round 3 status:** ~70% there
- **Dispatcher voice (Stephanie, 40:11 — on the universal key):** "In Propex you have to have the load number that they give you to find the load in their system. For logistics, you can use the BOL number or the order number. So I usually just copy the BOL number."
- **What's working:** Tier 1/2/3 auto-matcher is solid. Bulk approve Tier 1 is "blazingly fast" per Jessica. Validation page exists and is used.
- **What's missing:**
  - "Flag for Jessica" path from the workbench (Stephanie's #3 ask, 0/3 rounds)
  - Inline editing on Validation page is hidden behind a click (Katie's friction)
  - BOL Queue rename to "Photo BOL" only half-pulled-through (5 places still say "JotForm")
  - The handoff signal back to the workbench when Jessica releases something

### Surface 3: The Operational Oversight (Today's Objectives + Wells)

- **Pages:** `/` (ExceptionFeed home), `/wells/:wellId` (per-well drilldown)
- **Owner:** Jessica (manager hat)
- **Job:** Daily situational awareness — what's behind, what's ahead, daily target progress
- **Lifecycle phases observed:** all of them, in aggregate
- **Round 3 status:** ~50% there
- **Dispatcher voice (Jessica, Round 2 report):** "I have no way to know when the last successful refresh was. If the backend hiccups for 2 minutes I would not know I'm looking at stale numbers."
- **What's missing:**
  - Per-user "today's count" ("Stephanie: 47 built across 5 wells")
  - Daily target editing (the admin blocker — see Surface 4)
  - "Updated HH:MM" freshness pill (P2-3 in Round 3, shipped on home only — workbench has no equivalent)
  - Cross-team awareness: "what is each person working on right now?"
  - The chain coordination layer surfaced as the primary visual signal

### Surface 4: The Configuration (Admin)

- **Pages:** `/admin/wells`, `/admin/users`, `/admin/companies`, `/settings`
- **Owner:** Admin role (currently everyone — intentionally, during rollout)
- **Job:** Set up wells, users, daily targets, eventually carriers/rules
- **Lifecycle phases:** none (config feeds all surfaces)
- **Round 3 status:** ~10% — facade
- **Dispatcher voice (Admin persona Round 2):** "Jessica's home page daily target depends on editing `dailyTargetLoads`, and that cannot be done through the UI at all. The only way to change it is raw SQL against production."
- **What's missing:** Almost everything. Daily target editing (THE handoff blocker). User invitation/role management. Audit log. Real wells CRUD. The pencil button is dead.

---

## Part 2 — The Temporal Pipeline (Load Lifecycle)

Looking across all four surfaces, the load lifecycle is a temporal pipeline:

```
                                                          Phase B: REST integration
                                                          ↓ replaces clipboard step
┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  ┌─────────┐  ┌────────┐
│INGEST  │→ │MATCH   │→ │VALIDATE  │→ │BUILD   │→ │CLEAR   │→ │DISPATCH  │→ │DELIVER  │→ │BILL    │
│        │  │        │  │          │  │        │  │        │  │          │  │         │  │        │
│PropX   │  │Tier    │  │Jessica   │  │Stephanie│ │Katie   │  │PCS auto- │  │Driver + │  │Finance │
│Logistiq│  │matcher │  │confirms  │  │copies  │  │verifies│  │advances  │  │JotForm  │  │batches │
│JotForm │  │(1/2/3) │  │/ fixes   │  │to PCS  │  │in PCS  │  │          │  │photos   │  │+Sheets │
│        │  │        │  │          │  │→ colors│  │→ marks │  │          │  │         │  │export  │
│        │  │        │  │          │  │  row   │  │ cleared│  │          │  │         │  │        │
└────────┘  └────────┘  └──────────┘  └────────┘  └────────┘  └──────────┘  └─────────┘  └────────┘
    ↑           ↑            ↑            ↑           ↑            ↑             ↑           ↑
   S2          S2          S2            S1         S1 (NEW!)    (PCS          S2          (?)
(BOL Queue) (Validation)(Validation) (Workbench)  (Workbench    external)   (BOL Queue)   Finance
                                       build half) clear half)                              surface
                                                                                              (?)
```

### Key observations from this pipeline view

1. **The CLEAR phase is missing in v2.** It exists in the team's workflow but is not a state, not a UI, not a backend concept. Currently we conflate "Stephanie marks entered" with "Katie clears" but they are two distinct people doing two distinct actions.
2. **The BILL phase has no clear v2 owner.** There's a `/finance` page but it's unclear how it connects to the dispatch workflow. The Master Dispatch Template includes Settlement Date, suggesting the workflow extends into billing reconciliation. This is unmodeled and worth a dedicated walkthrough question.
3. **The DISPATCH phase happens in PCS** in Phase A (today). It moves into v2 in Phase B (REST integration). The "Mark Entered" button in v2 currently means "I have manually typed this into PCS" — which is a Phase A concept that becomes obsolete in Phase B.
4. **The MATCH phase is the cleanest single piece of value v2 has shipped.** Tier 1/2/3 auto-matching with bulk approve is the one place dispatchers say "this is faster than the old way." That's the load-bearing thing v2 already does well — protect it.

---

## Part 3 — The Three-Phase Evolution (Bridge → REST → Replacement)

v2's evolution is not a single project. It is three phases with very different shapes.

### Phase A — The Bridge (today)

**What v2 is in Phase A:** A staging/validation/visualization layer that prepares loads for manual entry into PCS via clipboard copy. The dispatcher's day still involves PCS, Google Sheets, JotForm, PropX, LogistiqIQ — v2 is one of seven apps, not the system.

**What ships in Phase A (Round 4 priorities — see Part 12):**

- Chain coordination layer (color = ownership, "who's next" hints, per-user counters)
- Real admin (daily target editing, user mgmt, audit log)
- Field coverage (close the 24-field gap)
- Help/glossary surface (Katie's onboarding)
- BOL number as universal key (global hotkey, copy elevation)
- Speed asks: keyboard nav, in-drawer Mark Entered, real flag-for-Jessica

**Phase A success metric:** Stephanie's daily click count drops by ~50%. The chain is no longer dependent on color habits in Google Sheets.

### Phase B — REST Integration

**Blocked on:** Kyle providing PCS OAuth credentials. Per memory `project_gap_analysis_status.md`, this has been the gating dependency for months.

**What v2 becomes in Phase B:** v2 still ingests, validates, prepares — but now it also DISPATCHES. The "Copy All Fields → tab to PCS → paste → click 17 boxes" workflow becomes a single button: "Dispatch to PCS." Photos auto-upload to PCS attachments. Two-way sync starts (v2 reads PCS arrival/delivered state).

**What changes:**

- The "Mark Entered" button becomes meaningless — it's automatic on dispatch
- The CLEAR phase becomes Katie verifying PCS arrival data, not re-typing anything
- The clipboard bridge dies
- Stephanie's job changes from "clipboard typist" to "exception handler"

**Phase B success metric:** PropX's 17-click export becomes irrelevant because v2 owns the data flow. Stephanie's daily click count drops by another ~50% (cumulative ~75% from baseline).

### Phase C — Replacement

**What v2 becomes in Phase C:** v2 IS the dispatch system. PCS becomes finance read-only or is retired. Customer/carrier configuration moves into v2. Real RBAC, audit log, SLA tracking, multi-tenant if needed. The team no longer juggles 7 apps — they juggle 1.

**What this enables:**

- Real multi-tenant for additional MSP clients (if EsExpress wants to white-label)
- Real financial reconciliation pipeline
- Real demurrage automation
- Real driver-facing app (the BOL Express predecessor's vision)

**Phase C success metric:** ES Express team uses v2 for 100% of dispatch work. Google Sheets dispatch templates are archive-only.

---

## Part 4 — The 4×3 Matrix

This is the planning grid for Round 4+. Each cell answers: "what's the right move on Surface X in Phase Y?"

| Surface               | Phase A (Bridge)                                                                                                          | Phase B (REST)                                                                                      | Phase C (Replacement)                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **1. Workbench**      | Chain coordination, in-drawer Mark Entered, keyboard nav, BOL universal key, the missing 24 fields, real flag-for-Jessica | Replace clipboard with "Dispatch to PCS" button, auto-upload photos, eliminate Mark Entered concept | Workbench becomes the authoritative dispatch surface; PCS reads from v2 |
| **2. Reconciliation** | Better Tier 2/3 review UX, ticket reconciliation flow, undo for single Validate                                           | Real-time match against PCS state, push-back for finance discrepancies                              | Reconciliation IS the system; PCS is downstream                         |
| **3. Oversight**      | Daily target editing, per-user counters, freshness, chain visibility (who's working what right now)                       | Real-time PCS state instead of v2-only state, exception alerting                                    | Add SLA tracking, multi-week target rollups, manager analytics          |
| **4. Config**         | The Big Admin Push: daily target editing, user mgmt, audit log, real wells CRUD, hide CompaniesAdmin if no roadmap        | Configure REST sync rules, mapping rules, carrier deduction config                                  | Carriers as first-class domain, multi-tenant config, SSO                |

**Round 4 should focus on the Phase A column.** Specifically: ship the chain coordination layer first (cheapest, biggest leverage, all the data already exists), then the admin push (the actual handoff blocker), then the field coverage gap.

---

## Part 5 — The Two Cross-Cutting Concerns

### Cross-cutting #1: Chain Coordination Layer

Not a page. A metadata system that surfaces on every load, in every view.

**What it includes:**

- `builtBy` — who built this load (currently `assignedTo`, exists)
- `builtAt` — when it was built (exists as `updatedAt`-ish, fragile)
- `clearedBy` — who cleared this load (NEW field)
- `clearedAt` — when it was cleared (NEW field)
- `chainState` — `pending | building | built | clearing | cleared` (NEW concept, replaces parts of the 14-state machine)
- `personalColor` — the dispatcher's chosen color (exists as `assignedToColor`, underused)

**How it surfaces:**

- Every LoadRow shows a colored left-border or badge for the builder
- Every LoadRow shows a "→ Katie" or "→ Jessica" hint when handoff is pending
- A "what's mine" filter on every list view: "show me what I'm building" / "show me what I need to clear"
- Today's Objectives shows per-person counters: "Stephanie: 47 built / Katie: 23 cleared / Jessica: 5 pending review"
- Inline diagnostics: "this load was built by Stephanie 12 minutes ago; awaiting Katie's clear"

**Why this is the highest-leverage Round 4 work:**

- The data is mostly already in the schema
- It surfaces what dispatchers already know but can't see in v2
- It eliminates the dependency on the Google Sheets color habit
- It makes Katie's job clear (literally — "what to clear")
- It directly answers Jessica's "who's working what" oversight need
- It is the load-bearing missing concept

### Cross-cutting #2: BOL Number as Universal Key

The BOL number is the cross-system primary key for PCS, LogistiqIQ, and JotForm. PropX requires its own internal load number; everything else accepts BOL.

**What v2 should do:**

- **Global hotkey: `B`** to focus a "Find by BOL" search input
- **One-click BOL copy** as the primary copy action on every LoadRow (currently buried in ExpandDrawer)
- **Auto-detect BOL on clipboard** — if the clipboard contains an 8-12 digit BOL-shaped string, offer to jump to it
- **"Open in..." menu** — when v2 has URL-scheme deep links to PCS, PropX, Logistiq, surface them per BOL
- **BOL is the join column** in any cross-source query (already true in the backend, should be visible in the UI)

**Why this is the second-highest Round 4 leverage:**

- It mirrors Stephanie's existing muscle memory ("I usually just copy the BOL number")
- It's a pure UX/affordance change, not a backend rewrite
- It makes v2 feel like a dispatcher tool, not a CRUD app

---

## Part 6 — What We Observed (the dispatcher voice)

Direct quotes from the source recordings, organized by what they tell us.

**On the chain:**

- Scout: "We're all part of like a chain."
- Scout: "After I build them, I will like turn it a color on this load count sheet and then Katie knows that she can go in and start clearing."
- Stephanie (24:09): "We all have our own colors that we use so that if somebody's in the sheet and they have an issue or a question about one, they know who to ask."
- Stephanie (24:26): "A lot of people that have questions like as far as payroll and stuff, they don't necessarily look at the sheet so much as they'll be looking in PCS and they'll see that you built it."

**On click count:**

- Stephanie (38:56): "Actually with PropX you have to click 17 boxes."
- Stephanie (~20:36): "I just push one button to copy" (referencing a custom mouse button binding)

**On the universal key:**

- Stephanie (40:01): "In Propex you have to have the load number that they give you to find the load in their system. For logistics, you can use the BOL number or the order number. So I usually just copy the BOL number."
- Stephanie (40:38): "I just feel like it's easier to do it by the BOL number."

**On error rates:**

- Scout: "There's a lot of human error in this." (volunteered, not asked)

**On data drift:**

- Stephanie (10:06): "You make sure that the dates match the green column on this Google sheet for the pickup."

**On informal protocols:**

- Stephanie (11:24): "I don't know if other people think about it the same way."
- Stephanie (10:54): "Or they'll turn it off for whatever reason if they have to copy or paste something out of the sheet."

**On the spreadsheet shuffle (gap analysis cite):**

- 186 documented steps of pure data transfer per session.

**On the field gap:**

- The Master Dispatch Template tracks 38 fields. v2 surfaces ~14 in a typical row.

**On the workflow loop:**

- Login & Sync → Review Assignments → Create & Duplicate Loads in PCS (207-230 steps) → Download & Distribute (186 steps) → Manage Photos & BOLs → Admin
- 90-150 minutes/day of pure manual data transfer per dispatcher.

---

## Part 7 — What We Set Out to Solve

From the 2026-04-03 gap analysis (verbatim):

> "v2 is **load-centric** (one load at a time). Dispatchers are **batch-centric** (build 51 loads for one well, then 26 for another, tracking progress via color). Until v2 thinks in batches, the dispatchers will keep one eye on the spreadsheet."

The five ROI-ranked automation opportunities from the same doc:

1. **Eliminate the spreadsheet shuffle** — 30-45 min/day. v2 should auto-ingest and replace Sheets as the integration layer.
2. **Replace PCS Remote Desktop with API dispatch** — 45-60 min/day. The 207-230 step PCS workflow becomes a click. _Blocked on Kyle's OAuth._
3. **Batch ticket/report download from PropX** — 15-20 min/day.
4. **Auto-sync on login** — 2-5 min/day.
5. **Smart assignment queue** — 15-30 min/day. _(This is what v2 has shipped — Tier 1/2/3 auto-matcher.)_

We started building #5 (Smart Assignment Queue) and got most of the way. We have not yet shipped #1 or #2 in any form. #3 and #4 are unstarted.

---

## Part 8 — What We Have Delivered

**Round 1 (verified, in production):**

- Login + sidebar polish
- Dispatch Desk with date filter
- Wells/Loads toggle + pagination
- Filter tabs with human labels (capitalize bug, fixed in R3)
- Validation page with Tier auto-matcher
- BOL Queue with JotForm/match/unmatch tabs
- Inline editing for driver/carrier/weight/BOL/ticket
- Photo modal with click-to-zoom
- ExpandDrawer with copy buttons
- Bulk Validate / Mark Entered / Approve

**Round 2 (verified):**

- "Es" + "Express" branding (login + sidebar)
- Wells/Loads view toggle
- Pagination both views (25/50/100/200)
- Select All checkboxes
- "Photo BOL" rename (partial — BolQueue.tsx still has 5 occurrences of "JotForm")
- Trailer + Delivered Date inline edit (Delivered date was broken — fixed in R3)
- Photo thumbnails with click-to-zoom
- Validation page inline editing for Driver/Carrier/Weight/BOL/Ticket (hidden behind expand-row)

**Round 3 (in branch `fix/round-3-quick-wins`, NOT yet pushed):**

- 13 tactical fixes (P0-2 deliveredOn schema, P0-3 Validate confirm, P0-4 Missing Ticket disabled-with-tooltip, P1-1 capitalize, P1-4 Loads-view onClaim, P1-11 reduced-motion canonical, P1-12 Mark Entered label, P2-1 Demurrage recolor, P2-3 home freshness pill, P2-6 Advance All confirm, P2-7 jargon tooltips, P2-8 page-reset on filter, P2-11 sheets dead branch)
- 3 new memories (admin RBAC intentional, velocity sprint pause rules, trace before wire)
- 1 reverted attempt (P1-9 role-gate Admin sidebar — caught mid-edit, conflicts with rollout strategy)
- 1 reverted attempt (P1-8 hide Companies link — Scribe walkthrough confirmed it's an intentional roadmap signal)

---

## Part 9 — Where We Have Fallen Short

1. **Stephanie's #1 ask (keyboard nav) is open across 3 rounds.** We've shipped login animations and photo zoom; we haven't shipped J/K row navigation. This is the single most painful gap because Stephanie measures her job in clicks and we're not reducing them at the rate she needs.
2. **The chain coordination layer doesn't exist as a primary signal.** The data is in the schema (`assignedTo`, `assignedToColor`); we render it as a small dot. The team's actual workflow uses ownership color as the _primary_ coordination signal. We have it backward.
3. **Admin is a facade.** The pencil button on WellsAdmin is dead. There is no UI to edit `dailyTargetLoads`, which is THE admin task. There is no user creation flow. **This is the blocker to handing v2 to Jessica.** Round 3 didn't touch it because it's outside the "<30 min" quick-win budget.
4. **24 of 38 master template fields are missing.** Identity numbers (Invoice #, ES Express #, Hairpin Express #), time windows (Load In/Out/Time, ETA, Unload In/Out/Time), financial breakdown (Rate/Ton, LINE HAUL, Demurrage with Reasons, Total Load, FSC, Settlement Date). Every dispatcher has v2 open _and_ the spreadsheet open.
5. **Onboarding/help is zero.** Katie counted 14 undefined acronyms across 4 pages. There is no `?` button, no glossary, no tour. New hires burn Jessica's time on first-day questions.
6. **The flag-for-Jessica concept is unbuilt.** Stubbed in `PhotoModal.onFlag` since at least Round 1. Stephanie has asked across 3 rounds. The Round 3 "fix" was to disable the dead Missing Ticket button and add a tooltip — honest, but the real feature is still backlog.
7. **The CLEAR phase doesn't exist.** Katie's job is to clear what Stephanie has built. v2 has no model for this. "Mark Entered" is conflated with "Cleared" but they're two distinct actions by two distinct people.
8. **No per-user counters.** "Stephanie: 47 built today" exists only in Stephanie's head and the Google Sheet. v2 doesn't surface it.
9. **No flag for "stale data" on the workbench.** Round 3 shipped P2-3 (Updated HH:MM pill on home) — partial fix. The pill is on home only; the workbench has no equivalent.
10. **PCS Phase B is blocked on Kyle's OAuth keys.** This isn't our shortfall, but it should be made explicit so Round 4 doesn't depend on it.

---

## Part 10 — Disconnects Between Our Team and ES Express Team

These are patterns where our engineering team's mental model and the ES Express team's mental model have diverged. Naming them lets us catch them earlier.

### Disconnect 1 — Bridge vs. replacement framing

**Us:** sometimes ship features as if v2 is the system
**Them:** v2 lives alongside 7+ apps
**Example:** "Mark Entered" makes sense in PCS world (you typed it into PCS) but is a Phase-A-only concept that becomes obsolete in Phase B. We didn't think about Phase B when we built it.

### Disconnect 2 — Load-centric vs. batch-centric

**Us:** we build one-load-at-a-time UI
**Them:** they work in batches of 5/26/51 with color-coding
**Example:** the Loads view was meant to address this but it bounces dispatchers out when they click a row.

### Disconnect 3 — Solo tool vs. chain tool

**Us:** v2 is built for one user at a time
**Them:** they're a chain of 4 people with handoffs
**Example:** there is no "your turn" signal anywhere in v2. The chain happens in Google Sheets colors.

### Disconnect 4 — Polish vs. speed values

**Us:** we optimize for what looks impressive (login animations, breathing letter effects, photo zoom)
**Them:** they optimize for keystrokes saved per day
**Example:** Round 1+2+3 shipped login polish while Stephanie's keyboard nav request stayed open across all three.

### Disconnect 5 — Field coverage gap

**Us:** ~14 fields surfaced
**Them:** 38 fields tracked daily
**Example:** ES Express # vs. Hairpin Express # — different identity systems v2 doesn't even know about.

### Disconnect 6 — Admin gap

**Us:** built admin pages as scaffolding
**Them:** need to actually administer (especially `dailyTargetLoads`)
**Example:** the pencil button on WellsAdmin has been dead for at least 2 rounds, and it controls the home-page progress bar that Jessica depends on.

### Disconnect 7 — Filtered persona reports vs. transcript ground truth (the meta-disconnect)

**Us:** we've been working from Round 2 persona reports that filter the dispatcher's reality through what each persona was looking at
**Them:** they live in a chain coordinated by Google Sheet colors that NO persona report named
**Example:** the chain protocol is the most important thing about how the team works and we re-discovered it only by going back to the source recordings. **This is the meta-disconnect that justifies the validation walkthrough — the only way to keep this honest is to validate our model with them directly, not via filtered code reviews.**

---

## Part 11 — Key Principle: System Gives to User

Every feature should pass this test:

> Does this feature give time / clarity / confidence back to the user, or does it ask them to remember something, switch context, or do extra work?

### Pass examples (from Rounds 1-3)

- ✅ Bulk Validate (gives: scale, removes per-load click overhead)
- ✅ Photo click-to-zoom (gives: visibility, no hunt for full-size button)
- ✅ Pagination with 25/50/100/200 (gives: control over page size)
- ✅ "Updated HH:MM" pill on home (gives: freshness signal without asking)
- ✅ Tier 1 bulk approve on Validation (gives: scale on the matcher's confident output)

### Fail examples (from Rounds 1-3)

- ❌ Login breathing animation (asks: 1.2s of waiting before form is interactive)
- ❌ "Pre-PCS Staging" subtitle (asks: parse marketing language to understand the page)
- ❌ Missing Ticket button shipped without onClick (asks: figure out why it does nothing)
- ❌ Pencil button on WellsAdmin shipped without handler (asks: same)
- ❌ Validation page inline edit hidden behind row expand (asks: discover the affordance)
- ❌ Demurrage panel rendered amber (asks: figure out if it's a warning or just data)
- ❌ "Reconciled" filter tab with no tooltip (asks: know what it means)

### The Stephanie Test

> If Stephanie's daily click count goes down because of this feature, it passes. If it goes up or stays the same, it fails.

### The Jessica Test

> If Jessica trusts the data she's looking at without having to check anywhere else, it passes. If she has to verify against PCS or Google Sheets, it fails.

### The Katie Test

> If a new hire on day three can answer "what should I do next" without asking Jessica, it passes. If they have to ask, it fails.

---

## Part 12 — Round 4+ Recommendation

### Priority order (Phase A column of the 4×3 matrix)

**Round 4 — Chain & Admin (the unblock)**

1. **Chain coordination layer** (~1 sprint)
   - Surface `assignedToColor` as primary visual on every LoadRow
   - Add `clearedBy`, `clearedAt`, `chainState` to schema
   - Per-user counters on home + workbench headers
   - "What's mine" filter on workbench
   - "→ Katie" / "→ Jessica" handoff hints on rows pending downstream action

2. **The Big Admin Push** (~1 sprint)
   - Wire the pencil button on WellsAdmin to inline-edit `dailyTargetLoads` (THE blocker)
   - Add `useUpdateWell` hook
   - Add "+ New Well" button on WellsAdmin (lift WellPicker dialog)
   - Surface real error messages (drop generic "Check your connection")
   - Add audit log table + mutation decorator

**Round 5 — Speed (the Stephanie unlock)**

3. **Keyboard navigation** (~1 sprint)
   - J/K row movement with auto-expand-next
   - Enter to validate / mark entered / clear (state-aware)
   - C to copy all fields (uses existing handleCopyAll)
   - F to flag for Jessica (requires Round 6 work but stub the keyboard binding now)
   - ? to show shortcut sheet
   - **Test with Stephanie before locking layout** — she has hardware-level mouse bindings that the keyboard nav must not conflict with

4. **In-drawer Mark Entered** (~half sprint)
   - Pass `onMarkEntered` to ExpandDrawer
   - Render matching the Validate treatment
   - Eliminates the collapse-find-row-click dance

**Round 6 — Real flag-for-Jessica** (~1 sprint)

- Backend: `flag_reason` column on assignments, `POST /dispatch/assignments/:id/flag` endpoint
- Frontend: wire `PhotoModal.onFlag`, wire LoadRow Missing Ticket button (replaces the Round 3 disabled-with-tooltip)
- New "Flagged" filter tab
- Replaces ~12 dispatcher-to-Jessica texts/day

**Round 7 — Field coverage (~2 sprints)**

- Add the 24 missing fields from the Master Dispatch Template
- Identity refs first (Invoice #, ES Express #, Hairpin Express #)
- Then time windows (Load In/Out/Time, ETA, Unload In/Out/Time)
- Then financial breakdown (Rate/Ton, LINE HAUL, FSC, Settlement Date)
- Surface in ExpandDrawer first; LoadRow density needs design
- **Validate which 24 fields are actually load-bearing in the walkthrough Question 4**

**Round 8+ — Bridge → REST transition** (gated on Kyle's OAuth)

- When OAuth lands: replace clipboard with "Dispatch to PCS" button
- Auto-upload photos via PCS attachment endpoint
- Read-back PCS state for two-way sync
- At this point, "Mark Entered" can be retired

### What to do with the current Round 3 branch

**Recommendation: push as-is, open the PR, deploy.** Reasons:

- 13 of 14 commits are clean, low-risk, type-checked, test-covered
- The two we corrected (P1-8 reverted, P0-4 → disabled) are honest fixes
- The branch is 17 commits — getting it shipped clears state for Round 4 planning
- Holding it gives no benefit; the strategic doc is independent of the branch
- The Scribe walkthrough (provided this session) becomes the verification path

**The PR description should reference this strategic doc** so reviewers understand the broader frame. The PR is tactical Round 3 work. The doc is the Round 4+ frame.

### What to validate with Jessica + Stephanie before Round 4 starts

See companion document `2026-04-06-workflow-architecture-validation-walkthrough.md`. The 8-question script is designed to surface where THIS doc is wrong, so Round 4 starts from a validated frame instead of another round of guessing.

---

## Conclusion

Round 1+2+3 shipped real value but on the wrong axis. We optimized for feature completeness when the team needed coordination. We optimized for visual polish when the team needed click reduction. We optimized for the validation matcher (which is genuinely good) but treated everything else as cosmetic.

**The unlock for Round 4+ is to flip the rendering of the existing data — the chain coordination layer is mostly already in the schema; we just have it backward.** Combined with the Big Admin Push (the actual handoff blocker) and keyboard navigation (Stephanie's 3-rounds-open ask), Round 4 can deliver a system that the team actually feels gives to them rather than asking of them.

The bridge → REST → replacement evolution is real, but Phase B is gated on Kyle. Round 4-7 should focus on Phase A wins that _don't depend on Kyle_ and that _make Phase B easier when it lands_.

The validation walkthrough (Option C) is the way we confirm this model with Jessica + Stephanie before we ship more. **The cost of running it is 30 minutes. The cost of not running it is another round of building from a wrong frame.**

---

## Appendix A — The 38-Field Master Template

Source: `EsExpress/docs/recordings and example material for context/Copy of Master Dispatch Template++ - Dispatch Sheet.csv`

```
Date, Driver, Invoice #, Truck#, ES Express #, PO#, Ticket#, Hairpin Express #,
Order #, Miles, Product, Loader, Shipper # BOL,
Load In, Load Out, Load Time, Wt. Lb., Tons Conv., ETA,
Unload Appt., Unload In, Unload Out, Unload Time,
Total Demurrage, Status, Loading Demurrage Reasons,
Rate/Ton, LINE HAUL, Demurrage, Total Load, FSC,
Settlement Date, Notes, Company
```

(Plus several "EXTRA" placeholder columns and a duplicate Notes column. ~38 substantive fields total.)

v2 currently surfaces approximately:

- `loadNo` (which of Invoice #, ES Express #, or Hairpin Express # this maps to is unclear — needs walkthrough Q4)
- `driverName`, `truckNo`, `trailerNo`, `carrierName`
- `bolNo`, `ticketNo`
- `weightTons`, `netWeightTons`
- `mileage`, `productDescription`
- `rate` (singular — no breakdown)
- `deliveredOn`
- `demurrageAtLoader`, `demurrageAtDestination` (with hours/minutes breakdown — partial coverage of `Loading Demurrage Reasons`)
- `lineHaul`, `fuelSurcharge`, `totalCharge` (in ExpandDrawer Financial panel)

That's roughly 14 substantive fields. The 24-field gap is real.

---

## Appendix B — Source Material Index

For future agents continuing this work, the source material is at:

**Internal v2 docs:**

- `docs/2026-04-03-dispatch-workflow-gap-analysis.md` — the original gap analysis (load-centric vs batch-centric framing)
- `docs/2026-04-06-jessica-round2-report.md` — Jessica's Round 2 persona report
- `docs/2026-04-06-stephanie-round2-report.md` — Stephanie's Round 2 persona report
- `docs/2026-04-06-katie-round2-report.md` — Katie's Round 2 persona report
- `docs/2026-04-06-admin-round2-report.md` — Admin persona Round 2 report (NEW persona this round)
- `docs/2026-04-06-round-2-consolidation.md` — Round 2 → Round 3 action plan
- `docs/2026-04-06-round-3-quick-win-sprint-aar.md` — Round 3 after-action report

**External v1 / source material:**

- `EsExpress/docs/2026-03-31-scribehow-workflow-analysis.md` — synthesis of the 16 ScribeHow walkthroughs
- `EsExpress/docs/recordings and example material for context/` — the gold mine
  - `Stephanie Venn - EsExpress .vtt` — Stephanie's full transcript (149KB, ~5000 lines)
  - `Workflow Conversation_Recording.vtt` — Scout/Jared/Jace conversation (32KB)
  - `Copy of ATMZ Billing Downloads Template - Dispatch Sheet.csv` — 17-field billing template
  - `Copy of Master Dispatch Template++ - Dispatch Sheet.csv` — **38-field master template (the field ground truth)**
  - `Copy of Liberty HV Browning SilverHill Super Snake - Dispatch Sheet.csv` — full per-well dispatch sheet (443KB)
  - 6 video recordings (multi-GB)
  - `BOL-EXPRESS-HANDOFF.md` — predecessor system handoff (2026-02-04)
  - `workflow_bol_intelligence_summary.md` — BOL intelligence design (2026-02-05)

**The 16 ScribeHow walkthroughs** (the 2026-03-31 analysis is the synthesis; individual links are in chat history if needed):

- Add Load Details to PropX Connect Timeline
- Create and Duplicate Express Loads
- How to Download Reports and Tickets from PropX
- Manage Express Loads and Duplicate Load Information
- Download and Organize Load Data Across Multiple Sheets
- Navigate to the EsExpress Overview Page
- Edit Email Conditions in Jotform
- Set Up SMS Notifications and Workflows in Jotform
- How to Use Input Capture Window (×2)
- Navigate and Manage Well Data
- Log In to ES Express LLC and Sync Data
- How to Review and Resolve Job Match Suggestions
- (plus 3 install/troubleshoot guides not directly relevant)

**The two recent Scribe walkthroughs** (used as Round 3 verification):

- "Managing Load Dispatch and Validation on ES Express" (40 steps, comprehensive)
- "Managing Load Dispatch and BOL Validation in ES Express" (22 steps, focused daily workflow)

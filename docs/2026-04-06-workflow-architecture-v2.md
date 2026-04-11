# ES Express v2 — Workflow Architecture v2 (post-validation-call)

**Date:** 2026-04-06 (post-call revision), **reconciled 2026-04-10** against a second follow-up call + sheet artifacts + code audit.
**Status:** Reconciled against four independent sources (see below). The v2 spine holds; role assignments, pipeline completeness, and builder priorities needed correction.
**Supersedes:** `2026-04-06-workflow-architecture.md` (v1, pre-call). v1 is preserved as historical record of what we believed going in.
**Source records:**

- `2026-04-06-validation-call-findings.md` — raw mining of the 75-min Jessica/Jodi call
- `2026-04-10-source-reconciliation.md` — every claim in this doc checked against all sources, confidence-marked
- `2026-04-09-team-followup-call.md` — Scout + Kati + Stephanie + Brittany + Jessica follow-up call
- `Load Count Sheet - Daily (Billing) - Current.csv` + `1560+ Invoice Sheet template.csv` — authoritative field/role artifacts
- Codebase audit (`bolNo` schema audit, `ticketNo` churn audit)

**Audience:** Internal — engineering team and any agent picking up Round 4

---

## [2026-04-10 reconciliation patch notes]

The reconciliation pass confirmed v2's substance (BOL rename, photo gate, clearing-is-external, audit preference) but corrected the following. Each item links to the reconciled section:

1. **Team roster** — Kati Shaffer is a **clearer** (PropX + PCS), not a builder. Brittany Brown (payroll) and Jeri (Logistiq clearing) were missing entirely. Two Jessicas: owner (left the first call at 54:00) vs Handlin (dispatch manager). See Appendix B.
2. **Builder coordination** — Assignment is by **company**, not by chain/color: Liberty → Scout, Logistiq → Steph, JRT → Keli. New cross-cutting concern. See Part 5, CC#4.
3. **Pipeline** — Missing the **"arrive"** step in PCS after build, and missing the **second clearing step** (Kati clears in BOTH PropX _and_ PCS, not just PropX). Also missing the phased-rollout arc (Jessica validates alone in Phase 1, builders take over in Phase 2). See Corrections 2 and 6.
4. **Priorities** — **Completion tracking ("built in PCS?" badge) is the builders' #1 independently-expressed pain.** Scout (29:28) and Stephanie (41:06) both asked for it unprompted on the follow-up call. Promoted to P0/high-P1. See Part 7.
5. **New P1 items** — Duplicate BOL flagging (Kati's ask), payroll report parity (Brittany's adoption blocker), PropX PO-in-BOL-field handling (ML training), builder-company assignment filter.
6. **Cuts** — "What's new in v2" modal (nobody asked; no signal), keyboard nav (Stephanie was on the follow-up call and asked for completion tracking instead of keyboard nav).
7. **Fields** — **Four** load identifiers not three (Invoice template reveals `Shipper # BOL` as the 4th). **ES Express #** is human-assigned during PCS build, not a duplicate. New billing fields from invoice template: `Ac/per ton`, `FSC/Mile`, `Amount Invoiced`, `Tons Conv.`. See Appendix C.
8. **Confidence hedges** — Audit log (4 event types) and Comments tab (cross-team scope) are **single-source from the first Jessica call**; neither was reconfirmed on the follow-up. Treated as "working design" not "validated." See CC#1 and CC#3.
9. **Scope cuts (per R3 MVP)** — Ship **2** audit events (cleared, re-dispatched), not 4. Ship **4** status colors (of 7), not all 7. **PropX-only** clearing observation in Round 4, Logistiq deferred until field name is confirmed. Split **90-day backfill** from the missed-load MVP; the MVP is Friday diff only.
10. **Go-live context** — Dual-run with sheets announced for ~**2026-04-14**. Jessica confirmed this on the follow-up call (37:10). Round 4 P0 must ship before dual-run turns into divergence.

**Open after reconciliation:** Logistiq `reconcileStatus` field name, JRT live-dispatch specifics, demurrage rules per shipper, Kati's full clearing walkthrough, Chitra's role, comment-notes scope. None of these block Round 4 P0.

---

## Why this v2 exists

The pre-call strategic doc (v1) made several confident predictions about how the ES Express dispatch team works. The 75-minute validation call with Jessica Handlin (and Jodi from billing) on 2026-04-06 corrected most of them. Some corrections were one-line fixes; some inverted the spine of the doc.

This v2 captures the validated mental model. It is shorter than v1 because we now have less to speculate about — Jessica answered the questions directly, sometimes by rejecting the question's premise.

**The single most important meta-finding from the call:** the chain/color framing that was the emotional centerpiece of v1 was wrong as a v2 design pattern. Jessica considers the personal-color ownership system her team uses today a _sheet-era workaround_, not something v2 should reproduce. She redirected to the PCS-style **audit log + live presence** pattern as her preferred coordination model. v1 had the right diagnosis (v2 is missing the coordination layer) but the wrong prescription.

**The second most important meta-finding:** **clearing is not a v2 step.** It happens in Logistiq and PropX, imposed by shippers as a payment gate. v2 should _observe_ clearing via API, not drive it. The temporal pipeline in v1 was factually wrong on this stage.

---

## The corrections, in priority order

### Correction 1 — The chain framing → audit log + live presence

**v1 said:** "Color = ownership = chain handoff signal. The chain coordination layer is the load-bearing missing concept v2 needs to surface as the primary visual signal on every load."

**Jessica said:** Use colors for **STATUS classification** (matching the count sheet legend — Missing Tickets, Loads being built, Loads being cleared, etc.), not for personal ownership. For personal ownership, use the PCS-style audit-trail pattern she already likes — "anybody who's touched that load or done anything with it, it shows like, yeah... it shows who's done what to that. Yeah, somebody, somebody cleared the load or somebody re-dispatched the load or somebody changed the rate." (47:06)

**The correct prescription:**

- **Audit log on every load drawer.** Jessica named **three** event types illustratively (cleared, re-dispatched, rate-changed). A fourth ("built") was added by the v2 author and is inferred, not confirmed. **[2026-04-10 reconciled]** This is a single-source ask from the first Jessica call; it was not reconfirmed on the follow-up. Ship the **R3 MVP cut: 2 event types (cleared, re-dispatched)**, validate adoption, then expand.
- **Live presence on the dispatch desk row.** v2 already has this in the drawer (the "live track" feature Jace demoed at 48:37). Jessica didn't know it existed. Surface it on the row level too — small avatar badges showing who's currently in the load. **[2026-04-10 reconciled]** Also single-source from the first call. Treat as working design, not validated.
- **Status colors tied to the load count sheet legend.** The 7 canonical labels (see Appendix A) are the team's actual classifier system — both calls confirm. **[2026-04-10 reconciled]** However, the v2 doc's prior claim that these "replace the filter tabs" is an overreach — Jessica never said that. Ship **4 of 7 per R3 MVP** (the most common states) and revisit tab replacement after adoption.

**What this kills from v1:** the entire "Cross-cutting #1: Chain Coordination Layer" section in v1's Part 5. Replace with "Cross-cutting #1: Audit + Presence + Status" (see Part 5 below).

### Correction 2 — Clearing happens externally

**v1 said:** The temporal pipeline is `INGEST → MATCH → VALIDATE → BUILD → CLEAR → DISPATCH → DELIVER → BILL`, with CLEAR as a v2 stage where Katie verifies what Stephanie built.

**Jessica said:** "We clear the loads in... I always want to call it automatize them, that's not what it is. Anyway, Logistics. So we clear the loads in logistics and PropX on their system before, you know, before we can invoice them out." (38:23) And: "We have to go and approve these loads before they will pay us." (41:42)

**[2026-04-10 reconciled — clearing is a TWO-STEP process, not one.]** The follow-up call surfaced that Kati Shaffer (the clearer — not a builder as v2 originally listed her) clears each load in **BOTH** systems:

> **Jessica (follow-up 26:29):** "Katie's still going to have to clear all of these loads when they go into PCS, and she's still going to have to clear everything in PropX."

So the actual clearing fan-out is: **(a) clear in PropX** (shipper-imposed payment gate) **+ (b) clear in PCS** (internal bookkeeping before billing). Phase 2, if v2 pushes directly to PCS via REST, _may_ eliminate the PCS clearing step — this is an open question for Kati's walkthrough.

**The correct pipeline:**

```
INGEST → MATCH → VALIDATE → BUILD → ARRIVE (in PCS)
       → [CLEAR in PropX, observed by v2] + [CLEAR in PCS, observed by v2]
       → PAYROLL REPORT → BILL
```

The **"arrive"** step was missing from v1 and from the earlier v2 draft. Jessica (follow-up 28:56): _"Once we get a load all put into PCS, then we have to arrive it."_ It's a trivial status transition in PCS that happens after build and before clearing.

`CLEAR` is still not a v2-owned lifecycle stage. It's a _bidirectional integration_ — v2 needs to read the `reconcileStatus` field from PropX (field name confirmed) and the equivalent field from Logistiq (Jessica didn't remember the exact name; not reconfirmed on follow-up). **[2026-04-10 scope cut]** Round 4 ships **PropX-only** clearing observation. Logistiq deferred until the team confirms the field name. Ship one integration to validate the pattern, then expand.

**Open sync-timing race — CONFIRMED but still unresolved.** Jessica raised this in the first call (38:56) and the follow-up confirmed the race is real:

> **Jessica (follow-up 23:48):** "Sometimes I think we get them built before they're actually cleared."

Two options, no decision yet:

- (a) Pull only-cleared loads (delay v2 ingest by 24-48 hours so Kati has cleared them externally first)
- (b) Pull immediately + subscribe to change notifications so v2 updates when Kati edits fields downstream

Kati's full clearing walkthrough is still pending — only fragments were captured on the follow-up call.

### Correction 3 — Field naming cascade (the matching engine is matching on the wrong field)

**Jessica's words at 16:09** (the most important 12-second moment of the call):

> "So I can go in, the ticket number is actually the BOL."

And at 17:53:

> "We have the well, and then we have where we're getting sand from. So it's a little confusing because we have the well, which is where it's actually the destination... we have a loader, that's where it's coming from."

And at 19:05 (admitting a prior spec error from her side):

> "So then the weight, and this is our fault. We told you we needed it in tons. And at the end of the game, we do need it in tons. But the way we enter it right now, what we see on our sheet and the way the girls build below, they actually use the pounds."

**The corrections (full reference in `memory/reference_v2_field_corrections.md`):**

| v2 current name                            | What it actually is                                                |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `ticketNo`                                 | The **BOL number** (driver-searchable, payroll search key)         |
| `bolNo` (what v2 currently shows as "BOL") | An aggregate value of unknown origin — needs schema audit          |
| `well` (treated as origin)                 | The **destination** (delivery point)                               |
| `destination` (finance-side)               | Same as `well` — collapse                                          |
| (no field)                                 | **loader** / **sandplant** = the origin                            |
| `tons`                                     | Working unit is **pounds**; tons is computed for billing end-state |

**Three competing load identifiers exist** and v2 has been mislabeling at least two:

1. **BOL** = driver-searchable, Jodi's payroll search key, currently stored as `ticketNo`
2. **Liberty's "load number"** = small integer (e.g., 543)
3. **PropX's "order number"** = system load identifier (e.g., 5840890)

**Implication for the matching engine:** v2's 100% confidence Tier 1 scores are suspect because the engine has been matching on the wrong field. After the field rename, the whole queue needs re-scoring.

### Correction 4 — Photo gate on Tier 1 confidence

**Jessica at 14:02:**

> "I don't feel like anything can be 100% because we don't want it to push out to PCS unless it has the photo anyways. And so I don't feel like it can be, you know, 100% without that."

**The fix:** One-line matching engine rule change.

```
isTier1 = hasAllFieldMatches && hasPhoto
```

**Downstream:** 30-40% of currently-green loads should drop to a "needs photo" state. Re-score the whole queue after the rule change.

### Correction 5 — Daily target editing was NEVER mentioned

**v1 said:** "The single biggest hand-off blocker I see is daily target editing. The pencil button on Wells Admin is dead."

**Jessica said:** Nothing. She did not flag daily target editing once in 75 minutes. The actual top admin priorities she named:

1. Missed-load detection (revenue recovery)
2. Audit trail
3. Search discoverability
4. Field corrections (the rename cascade above)

**Implication:** Daily target editing drops from P0 (the Big Admin Push) to P2. Keep it on the roadmap, but it is NOT the top admin blocker Jessica feels. v1's Q6 prediction was wrong.

### Correction 6 — Validation is a one-person job (IN PHASE 1 ONLY)

**Jessica at 11:25:**

> "That will be one part, one part, I mean, I'll say one person, it could, you know, somebody else could potentially jump in and do this, but really I think one person's going to do all or 90% of the validation."

And earlier (10:18):

> "I like the validation page for if and when we get to the point that this is, you know, like 100% that we can come here and approve all the tier ones. I do like that. I don't know that we will work from this page a whole lot."

**[2026-04-10 reconciled — there are TWO phases.]** The follow-up call clarified that "one person" is a transitional state, not a steady state. The team is adopting v2 via a **phased rollout**:

> **Jessica (follow-up 15:04):** "For a little while, I will validate all the loads."
>
> **Jessica (follow-up 27:07):** "Once we're able to push to PCS, I will stop, and the girls will take over."

**Phase 1 — Jessica validates alone.** Dual-run with sheets starts ~2026-04-14. Jessica eyeballs every load coming out of the matcher, approves the greens, fixes the reds, and copy/pastes into PCS manually. The Validation page is her single power-user surface in this phase.

**Phase 2 — Builders validate per company.** Once the PCS REST push is live (blocked on Kyle's OAuth), the validation operation hands off to the builders. Each builder validates _their company's_ loads: Scout validates Liberty, Steph validates Logistiq, Keli validates JRT (see Appendix B for the assignment table). Validation and build become **one motion per builder**, on Surface 1 (Build Workbench), not Surface 2.

> **Scout (follow-up 25:13):** "So it's basically like clearing it in PropX." — the cognitive operation is: compare photo against data → confirm → advance to PCS. Validate and build are one motion for a builder.

**Implication — architectural:**

- **Phase 1:** Optimize Surface 2 (Exception Loop / Validation page) for single-user density and keystroke efficiency. This is Jessica's cockpit.
- **Phase 2:** Surface 2 collapses into Surface 1 per builder. The Dispatch Desk needs a **per-builder (or per-company) filter** so Scout sees only Liberty, Steph sees only Logistiq, etc. See Part 5 CC#4.
- **The UI must handle the transition gracefully** — a new P1 item: "phased rollout support" (see Part 7).

### Correction 7 — There's a fifth latent surface (Billing Reporting)

**Jessica at 25:08:**

> "Jodi was like, okay, but what about the sheets? Like if the girls aren't using the sheets, they're no good to me, but I reference the sheets. And so we're wondering on just like reporting and I can kind of explain to you that process."

And at 25:55:

> "Well, at some point, it's going to be really challenging for the girls to work here and on the sheets."

**v1 had four surfaces.** v2 needs to acknowledge a **fifth latent surface** for Billing Reporting (Jodi/Jenny). Until Jodi's reporting needs are served from v2, dispatchers will keep maintaining sheets in parallel — which is Jessica's operational fear.

The fifth surface doesn't need to ship in Round 4, but it should be in the strategic doc so we don't forget it exists.

### Correction 8 — The four-surface model itself was soft-confirmed at the end

At 1:10:58 Jace named **three** of the four surfaces (workbench, reconciliation, oversight — he dropped configuration in his summary), and Jessica said "yep" at minute 71 of a 75-minute call, visibly wrapping up.

**Implication:** The four-surface model is "not contradicted" rather than rigorously validated. Treat it as a working frame, not as a locked architecture. Specifically: Jessica also said at 10:18 "I'm honestly not sure what's best because I know this isn't going to look exactly like what we're used to and that's okay" — she's giving permission to radically rework the Dispatch Desk layout if the underlying workflows work.

---

## The corrected mental model

### The four (or five) workflow surfaces

```
                  ┌─────────────────────────────────────┐
                  │  3. THE OVERSIGHT VIEW              │
                  │  (Jessica's manager hat)            │
                  │  - Today's Objectives               │
                  │  - Per-well drilldown               │
                  │  - "Am I on track?" question        │
                  └─────────────────┬───────────────────┘
                                    │ targets / state
                                    ▼
┌──────────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│ 2. THE EXCEPTION     │    │  1. THE BUILD       │    │  4. THE              │
│    LOOP              │───▶│     WORKBENCH       │◀───│  CONFIGURATION       │
│ (one power user —    │    │  (Stephanie/Scout/  │    │  (rare admin setup)  │
│  not a team surface) │    │   Keli/Crystal)     │    │ - Wells/users        │
│ - Validation Tier    │    │                     │    │ - Settings           │
│ - BOL Queue          │    │  Audit log on every │    │ - Daily targets      │
│ - Tier 1 needs photo │    │    load drawer      │    │   (P2, NOT THE       │
│   gate               │    │  Live presence on   │    │    blocker we        │
│                      │    │    every row        │    │    thought)          │
│ FEEDS the workbench  │    │  Status colors via  │    │                      │
└──────────────────────┘    │    count-sheet      │    └──────────────────────┘
                            │    legend           │
                            └─────────────────────┘
                                    │
                                    │ external integration
                                    ▼
                  ┌──────────────────────────────────────┐
                  │  CLEARING (in Logistiq + PropX)      │
                  │  - shipper-imposed payment gate      │
                  │  - v2 OBSERVES via API, doesn't drive│
                  │  - reconcileStatus field             │
                  └──────────────────────────────────────┘

                  ┌──────────────────────────────────────┐
                  │  5. (LATENT) BILLING REPORTING       │
                  │  (Jodi/Jenny — currently uses sheets)│
                  │  - Reports against load data         │
                  │  - Driver lookup by BOL              │
                  │  - Invoice reconciliation            │
                  │  Not in Round 4, but acknowledged    │
                  └──────────────────────────────────────┘
```

### The corrected temporal pipeline

```
                                                    Phase B: REST integration
                                                    ↓ replaces clipboard step
┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐
│INGEST  │→ │MATCH   │→ │VALIDATE  │→ │BUILD   │→ │DISPATCH  │→ │DELIVER  │→ │CLEAR     │→ │BILL    │
│        │  │        │  │          │  │        │  │          │  │         │  │(EXTERNAL)│  │        │
│PropX   │  │Tier    │  │One power │  │Stephanie│ │PCS auto- │  │Driver + │  │Logistiq +│  │Jodi    │
│Logistiq│  │matcher │  │user      │  │/Scout/ │  │advances  │  │JotForm  │  │PropX     │  │Jenny   │
│JotForm │  │+ photo │  │(not team)│  │Keli/   │  │          │  │photos   │  │approve   │  │batches │
│        │  │ gate   │  │          │  │Crystal │  │          │  │         │  │for       │  │        │
│        │  │        │  │          │  │copies  │  │          │  │         │  │payment   │  │        │
│        │  │        │  │          │  │to PCS  │  │          │  │         │  │          │  │        │
└────────┘  └────────┘  └──────────┘  └────────┘  └──────────┘  └─────────┘  └──────────┘  └────────┘
    ↑           ↑            ↑            ↑            ↑              ↑            ↑            ↑
   S2          S2          S2 (single   S1          (PCS          S2          External       S5
(BOL Queue) (Validation) power user)  (Workbench)  external)   (BOL Queue)  observed via    (latent —
                                                                              API badge      Billing
                                                                              on drawer)     Reporting)
```

**Key changes from v1:**

- "CLEAR" moved out of v2's owned stages → external observed
- "Validate" labeled as single power user, not team
- "Match" includes the photo gate as a precondition for Tier 1
- Surface S5 (Billing Reporting) acknowledged

**[2026-04-10 reconciliation — annotations to the diagram above]** (ASCII diagram kept as-is; these annotations supersede where they differ):

- **CLEARING box** — should read "PropX + PCS" (not "Logistiq + PropX"). Kati clears in both PropX and PCS. Logistiq clearing is handled by Jeri (a team member missing from v1/v2). See Appendix B.
- **ARRIVE step** — missing from the pipeline entirely. Insert between BUILD and CLEAR: _"Once we get a load all put into PCS, then we have to arrive it"_ (Jessica follow-up 28:56).
- **Surface 2 (Exception Loop)** — single power user **only in Phase 1** (Jessica validates alone). In Phase 2, Surface 2 collapses into Surface 1 per builder, with a per-company filter. See Correction 6.
- **Surface 1 (Build Workbench)** — in Phase 2, absorbs validation responsibility for each builder's assigned company. Builders equate "validate" and "build" into one motion.
- **Cross-cutting coordination** — builder assignment is **by company**, not by chain/color. Liberty → Scout, Logistiq → Steph, JRT → Keli. See Part 5 CC#4.
- **Missing feature from surface model** — "Has this been built in PCS?" completion tracking badge. Scout (29:28) and Stephanie (41:06) both independently asked for this. Not a separate surface — it's a dispatch desk column/badge. This is the builders' **#1 pain**.

### The three-phase evolution (unchanged)

Phase A (Bridge today) → Phase B (REST integration, blocked on Kyle's OAuth) → Phase C (Replacement). This framing was not contradicted in the call, though Jessica's "until we get away from PCS" comment about the tons/lbs conversion implies she's mentally planning for Phase C as well.

---

## Part 5 — The two cross-cutting concerns (REVISED)

### Cross-cutting #1: Audit log + Live presence + Status colors

**Replaces v1's "chain coordination layer" entirely.**

**[2026-04-10 confidence note]** This entire cross-cutting concern is based on a **single source** — the first Jessica call (47:06, 48:37, 49:46). The follow-up call did not reconfirm or expand on the audit-log and live-presence asks. Treat as _working design_, not _validated requirement_. Ship the MVP cut below and validate adoption before expanding.

**Audit log on every load drawer:**

- Tab pattern in the drawer bottom pane: **Timeline / Audit Log / Comments**
- Timeline (existing) collapses by default
- Audit Log shows event types (with timestamp + actor)
- **[2026-04-10 scope cut]** Jessica named **three** event types illustratively: cleared, re-dispatched, rate-changed. "Built" was added by the v2 author (inferred, not confirmed). **R3 MVP ships 2 event types: cleared and re-dispatched** (the two with clearest downstream value). Expand after adoption.
- Comments tab is NEW (see Cross-cutting #3)

**Live presence on every dispatch desk row:**

- v2 already has this inside the drawer (the "live track" feature)
- Surface it on row level — small avatar badges showing who's currently in the load
- Jessica reacted positively to the existing version. Round 4 is making it visible.

**Status colors tied to the load count sheet legend (from `Load Count Sheet - Daily (Billing) - Current.csv`):**

- Missing Tickets / Not Arrived
- Missing Driver
- Loads being built
- Loads being cleared
- Need Well Rate Info / New Loading Facility Rate ← **a state v1 had nothing for**
- Loads Completed / Load Count complete
- Export (Transfers) Completed

**These are STATUS labels, not personal-ownership labels.** Both calls confirm they are the team's actual classifier system. **[2026-04-10 reconciled]** The v2 doc's earlier claim that they "replace v2 filter tabs" is an overreach — Jessica never said that. R4 MVP ships **4 of the 7 labels** (Missing Tickets, Loads being built, Loads being cleared, Loads Completed) as row coloring. Tab replacement is a separate decision pending team feedback.

### Cross-cutting #4 (NEW 2026-04-10): Builder assignment by company

**Discovered in the follow-up call and the Load Count Sheet's "Order of Invoicing" section.** Builder assignment is not ad-hoc, not by chain, not by color — it's **by shipper company**:

| Company  | Builder | Source                                     |
| -------- | ------- | ------------------------------------------ |
| Liberty  | Scout   | Load Count Sheet + follow-up call          |
| Logistiq | Steph   | Load Count Sheet + follow-up call          |
| JRT      | Keli    | Load Count Sheet                           |
| overflow | Crystal | Load Count Sheet (98 loads, no assignment) |

**Implications for v2:**

- The Dispatch Desk needs a **per-company filter** (or per-builder, equivalent via the table above).
- In Phase 2, each builder validates _their company's_ loads only. The Validation page (Surface 2) merges into Surface 1 with the filter applied.
- Coordination ambiguity the chain/color pattern was _trying_ to solve ("who owns this load?") is answered by company, not by a chain step. Two builders do not work the same load.
- Completion tracking ("built in PCS?") applies per-builder inside their company lane — each builder sees only the loads they're responsible for.

**This is new v2 territory.** v1 treated all builders as interchangeable and invented a chain/color pattern that never existed. The actual pattern is simpler and already encoded in the Load Count Sheet.

### Cross-cutting #2: BOL number as universal key (UNCHANGED from v1)

The BOL/`ticketNo` rename strengthens this — once `ticketNo` is correctly labeled as BOL, the universal-key argument is even stronger. Jodi's payroll lookup workflow explicitly uses BOL: _"I can jump to this whole sheet and type in the BOL and it's going to take me right to that load"_ (27:00).

Round 4 should:

- Add visible search affordance on Dispatch Desk header (the `/` shortcut is invisible to users — Jessica didn't know it existed)
- Wire search results to route directly to load drawer in context (currently routes to list view)
- Auto-detect BOL on clipboard
- Treat BOL as primary lookup key throughout

### Cross-cutting #3 (NEW): Comment / issue notes on load drawer

**Jessica at 29:41-29:57:**

> "Pending or BOL issues. Would there be a way for us to note on there like what the issue was?... Yeah, and it could even be its own tab, like comments. And then obviously if it said pending or BOL issue, and then there was like a comment section over here, we could write a comment. And then when Jodi saw that, she would be able to relay to the driver, like what was wrong, why he didn't get paid that load."

A free-text annotation field scoped to the load, surfaced in the drawer as the Comments tab. **Cross-team communication scope** — dispatcher writes, billing reads, billing tells driver. This is a small feature with high coordination value.

**[2026-04-10 confidence note]** This is a **single-example extrapolation**. Jessica gave one concrete scenario (BOL issue → note → Jodi reads → relays to driver). No one else asked for comments. The follow-up call did not surface this need from builders, Kati, or Brittany. **Ship as a minimal add-on to the audit log** (same drawer surface, shared infra), and treat the "cross-team scope" claim as unvalidated until billing actually uses it. Don't invest in role-scoping, mentions, or real-time updates until demand is observed.

---

## Part 6 — What we observed (the dispatcher voice, post-call)

### The most striking quotes from the call

1. **The 12-second BOL correction (16:09):** _"So I can go in, the ticket number is actually the BOL."_
2. **The photo-gate principle (14:02):** _"I don't feel like anything can be 100% because we don't want it to push out to PCS unless it has the photo anyways."_
3. **The tons/pounds admission (19:05):** _"This is our fault. We told you we needed it in tons. And at the end of the game, we do need it in tons. But the way we enter it right now... they actually use the pounds."_
4. **The validation page reality (10:18):** _"I don't know that we will work from this page a whole lot."_
5. **The clearing-is-external killer (41:42):** _"We have to go and approve these loads before they will pay us."_
6. **The missed-load ritual (34:27):** _"What we used to do is at the end of every week, so Friday, I would go in and run a report for each company... I would have it set to where anything that was duplicated would turn red. And so then there would be four or five loads... it would alert me, oh, there's four loads."_ — currently broken; missed loads leak to Jenny.
7. **The billing safety net (36:37):** _"Jenny, if it goes that far, if it gets all the way to Jenny and she's building an invoice, she works based on what we have and what they have. And so she might be however much money off. And so at that point, she will go into PropX and start doing the research and she'll find loads that were missed."_
8. **The parallel-sheet anxiety (25:55):** _"At some point, it's going to be really challenging for the girls to work here and on the sheets."_
9. **The audit-log ask, made specific (49:46):** _"It shows who's done what to that. Yeah, somebody, somebody cleared the load or somebody re-dispatched the load or somebody changed the rate."_
10. **The 30-of-38-fields verdict (1:06:12):** _"If we're getting down to then, it looks like all the rest of it probably, I know it's a lot, but it probably is important."_ — NOT "ship the 6 that matter."
11. **The discoverability gap (23:15):** _"Is there a way to search like if I come to this and I'm not seeing the [well] I want?"_ — She didn't know `/` existed.
12. **The accessibility note (54:54):** _"Can you do it because my hand doesn't work?"_ + _"Maybe I'm used to using a mouse. This is tricky."_ — Jessica has a hand limitation; scroll-heavy surfaces need testing.

### Things v2 already has that the team doesn't know about (DISCOVERABILITY GAPS)

This is its own category. We've shipped features the team can't find:

- **`/` master search** — Jessica didn't know it existed
- **Live presence in the drawer** — Jessica didn't know it existed; reacted positively when shown
- **Inline editing on Dispatch Desk** — Jessica wanted it; Jace had to point it out
- **(Inline editing NOT on Validation page)** — Jace noted this was a gap

**Round 4 needs a "what's new in v2" discovery tour or modal**, because we keep shipping features the team can't find.

---

## Part 7 — Round 4 recommendation (REVISED)

The Phase A column from v1's 4×3 matrix gets reordered based on the call.

### Round 4 P0 — The Schema Collapse + Additive Migration + Photo Gate (1 sprint)

**[2026-04-06 revision — post-agent review]** Originally framed as "rename cascade + purge-and-resync." An 11-agent deepen-and-review pass surfaced two load-bearing corrections that inverted the approach:

**Correction A — The `bolNo` mystery is resolved (and it's not a mystery).** A codebase audit found `bolNo` is a regular column populated as a direct passthrough of real BOL values from all three sources (`backend/src/db/schema.ts:122`, `backend/src/plugins/ingestion/services/propx-sync.service.ts:533`, `backend/src/plugins/ingestion/services/logistiq-sync.service.ts:580-583`, `backend/src/plugins/verification/services/jotform.service.ts:186-193`). The reconciliation service already matches extracted BOLs against BOTH `ticketNo` OR `bolNo` at `backend/src/plugins/verification/services/reconciliation.service.ts:316-317`. Jessica's quote at 16:09 ("the ticket number is actually the BOL") means the UI field she sees labeled `ticketNo` IS the BOL — the mystery was ours, not the schema's. **Round 4 P0 #1 is therefore a column COLLAPSE of redundant BOL storage, not a rename.**

**Correction B — "Purge and re-sync" is rejected in favor of additive expand/contract.** A migration review documented 6+ FK dependents on `loads` — `assignments` (with non-derivable human state: `statusHistory`, `photoStatus`, `assignedBy`, `pcsSequence`, `pcsDispatch`), `photos`, `bol_submissions.matchedLoadId`, `jotform_submissions.matchedLoadId`, `propxLoadId`, `logistiqLoadId`. A purge either fails on FK or cascade-wipes builder work. Additive migration re-enables sync _immediately_ at step 3 below instead of blocking on the full cascade — directly addresses the "stale since April 2" pain.

**Revised sequence:**

0. **Collision decision — DECIDED 2026-04-06:** **`bolNo` is canonical. `ticketNo` drops.** Matches Jessica's language ("the ticket number is actually the BOL") and the UI label she wants. The higher churn cost (more call sites read `ticketNo` today) is the one-time price of calling the thing what dispatchers call it. All subsequent steps below assume `bolNo` canonical.

1. **Expand migration (one additive commit).** Add new columns as nullable: `loader`, `sandplant`, `weight_lbs`. Keep both `ticket_no` and `bol_no` writable. Nullable adds are metadata-only — no table rewrite. Snapshot `loads`, `assignments`, `photos`, `bol_submissions`, `jotform_submissions` into `*_snapshot_pre_r4` tables BEFORE the DDL runs. This is your rollback anchor.

2. **Bounce the Fastify process after the DDL.** postgres.js has an internal result-type cache that can return stale shapes on idle connections even with `prepare: false` already configured project-wide. Do not trust graceful reconnect. Bounce the Railway deploy. This is a known trap documented in external postgres.js issues — worth the belt-and-suspenders.

3. **Re-enable sync writing to `bolNo` canonically.** This is what brings sync back — unblocks the "stale since April 2" state. Writers populate `bolNo` (canonical) plus `loader` / `sandplant` from the source APIs plus `weight_lbs` (store pounds canonically; compute tons at billing time). `ticketNo` column left writable during the dual-write window in case a read path is still pointing at it.

4. **Dual-read window behind `USE_CANONICAL_BOL` feature flag (1-2 deploys).** Application reads `bolNo` only when the flag is on. Reconciliation service's dual-column match (`reconciliation.service.ts:316-317`) updated to match against `bolNo` alone instead of `ticketNo` OR `bolNo`. Every call site that still reads `ticketNo` gets audited and migrated before the flag flip. Grep targets: `ticketNo`, `ticket_no`, `Ticket #` labels in the UI.

5. **Photo gate deploy (separate commit, separate flag).** One-line matching engine rule: `isTier1 = hasAllFieldMatches && hasPhoto`. Ship behind its own flag so the re-score can be reverted independently of the schema work. Honor the `photoStatus` enum — values are `"attached" | "pending" | "missing"` only; never write `"matched"` (known gotcha from prior rounds).

6. **Staged re-score.** Run against 10% of the validation queue first. Write every tier change to a `rescore_audit` table keyed on a `runId`. Surface the delta as a "Tier 1 → Needs Photo" filter in Surface 2 (Exception Loop) so Jessica can eyeball it for 24 hours. Proceed to 100% only if the 10% reads cleanly. Rollback is one `UPDATE assignments ... FROM assignments_snapshot_pre_r4 WHERE runId = ?`.

7. **`well` semantics reversal (separate, smaller migration).** Confirm which v2 field currently holds the destination (may already be `destinationName` in the schema — audit `propx-sync.service.ts` and `logistiq-sync.service.ts` to see which source fields land where). May be a no-op at the schema level; may be a sync-code-only fix. Ship after the BOL collapse is stable.

8. **Contract migration (separate commit, next deploy cycle, after 1-2 weeks of stable reads).** Drop the `ticketNo` column, drop the `idx_loads_ticket` index, remove the `USE_CANONICAL_BOL` feature flag, remove the dual-read code path. UI labels saying "Ticket #" also rename to "BOL" in this pass.

**Pre-migration verification:**

```sql
-- Source fingerprint — snapshot this to a file before any DDL
SELECT source, COUNT(*) AS n,
       COUNT(ticket_no) AS has_ticket,
       COUNT(bol_no) AS has_bol,
       COUNT(*) FILTER (WHERE ticket_no = bol_no) AS ticket_equals_bol,
       md5(string_agg(id::text || coalesce(ticket_no,'') || coalesce(bol_no,''), ',' ORDER BY id)) AS hash
FROM loads GROUP BY source;

-- FK dependent inventory — should return ≥6 rows
SELECT conname, conrelid::regclass FROM pg_constraint WHERE confrelid = 'loads'::regclass;

-- Assignment human-state snapshot — the thing you cannot lose
CREATE TABLE assignments_snapshot_pre_r4 AS SELECT * FROM assignments;
CREATE TABLE loads_snapshot_pre_r4 AS SELECT * FROM loads;
CREATE TABLE photos_snapshot_pre_r4 AS SELECT * FROM photos;
```

**Post-migration verification:**

```sql
-- Dual-write sanity (during step 3-4)
SELECT COUNT(*) AS mismatches FROM loads
WHERE ticket_no IS DISTINCT FROM bol_no
   OR (ticket_no IS NOT NULL AND bol_no IS NULL);

-- Re-score delta (during step 6)
SELECT auto_map_tier,
       COUNT(*) AS now,
       (SELECT COUNT(*) FROM assignments_snapshot_pre_r4 s WHERE s.auto_map_tier = a.auto_map_tier) AS before
FROM assignments a GROUP BY auto_map_tier;

-- Tier 1 photo gate compliance (post-rescore)
SELECT COUNT(*) FROM assignments WHERE photo_status = 'attached' AND auto_map_tier = 1;
```

**Rollback procedure:**

1. Flip `USE_CANONICAL_BOL=false` — application reads the legacy column path. Requires dual-read code to still exist (which is why we don't drop it until step 8).
2. Flip the photo gate flag off. If the re-score partially ran, restore from snapshot: `UPDATE assignments a SET auto_map_tier = s.auto_map_tier, auto_map_score = s.auto_map_score, photo_status = s.photo_status FROM assignments_snapshot_pre_r4 s WHERE a.id = s.id;`
3. Drop any new columns (`loader`, `sandplant`, `weight_lbs`). These are additive — legacy columns were never touched, so safe.
4. Re-pause sync if needed (the legacy path was never deleted).
5. Communicate to Jessica that the queue returned to its prior state. Builder work is preserved because `assignments` was never truncated.

**What this replaces from the original framing:** a single "rename cascade + purge-and-resync + re-score" flow becomes eight reversible, individually-flaggable steps. Sync is unstuck at step 3, not step 7. Builder work is preserved throughout. The photo gate can be deployed and rolled back without touching the schema.

### Round 4 P0 — Completion tracking ("built in PCS?" badge) (half sprint) **[2026-04-10 NEW — builders' #1 pain]**

**This was the single biggest independently-expressed pain on the follow-up call.** Scout (29:28) and Stephanie (41:06) both asked, unprompted, the same question: _"Is there a way to know whether a load has been built in PCS yet?"_ They don't want to duplicate work, and they don't want to miss work.

1. **Add `builtInPcs` boolean (+ timestamp + actor)** to the load record. Write on the build event.
2. **Surface as a row-level badge** on the Dispatch Desk: unbuilt / built / cleared (three states).
3. **Per-company filter** interaction: each builder's lane shows their unbuilt loads first, then built, then cleared. Steph sees Logistiq, Scout sees Liberty, Keli sees JRT (see Part 5 CC#4).
4. **Dual-run parity:** during Phase 1 (Jessica validates alone, dual-run with sheets ~2026-04-14), this badge is the single-row equivalent of the "is it in PCS yet?" column in the Load Count Sheet.

**Why P0:** without this, the builders can't trust v2 on day one of the dual-run. Every load they touch requires a PCS lookup to confirm. This kills adoption velocity.

### Round 4 P0 — Audit log + live presence row indicator (1 sprint)

Replaces v1's "chain coordination layer."

1. **Add `auditLog` table** with event types. **[2026-04-10 scope cut]** MVP = 2 event types (cleared, re-dispatched). "Built" is inferred not confirmed; "rate-changed" can follow once audit adoption is proven.
2. **Decorator wrapping load mutations** to auto-write audit events
3. **Tab pattern in load drawer:** Timeline / Audit Log / Comments
4. **Live presence avatar badges on dispatch desk rows** (lift the in-drawer feature)
5. **Status colors on rows tied to count-sheet legend. [2026-04-10 scope cut]** Ship **4 of 7 labels** (Missing Tickets, Loads being built, Loads being cleared, Loads Completed). Not filter-tab replacement — just row coloring on the existing tabs.

### Round 4 P0 — Missed-load detection (1 sprint)

**Frame as REVENUE RECOVERY, not workflow hygiene.** Highest-ROI business case the project has.

1. **Tag every load with import timestamp**
2. **Friday diff job:** for each company, pull current period; compare against prior pull; surface anything new (that should have been in the prior pull) as "missed"
3. **Ship as weekly run first**, automate scheduling later
4. **Surface results in a "Missed Loads" view** — Jessica's manual ritual is now a system feature

**[2026-04-10 scope cut]** The "90-day historical backfill against sheet data" bonus feature from the earlier draft is **split into its own P2 item** below. The MVP is the Friday diff against sync history only — faster, simpler, and addresses the broken-ritual pain without requiring a sheet-ingestion pathway that doesn't exist yet.

### Round 4 P1 — Phased rollout support (half sprint) **[2026-04-10 NEW]**

The Validation page (Surface 2) needs to handle the single-user → multi-user transition gracefully:

1. **Phase 1 mode (default today):** single-user dense list. Jessica's cockpit. No assignment UI.
2. **Phase 2 mode (post-PCS-REST):** per-company filter applied, validation actions surfaced on Surface 1 (Build Workbench) for each builder's lane. Surface 2 becomes optional/vestigial.
3. **Feature flag** to toggle between modes per-user during the transition week(s).
4. **Dual-run support** with sheets ~2026-04-14 → sometime in Phase 2 (TBD when PCS REST ships).

### Round 4 P1 — Duplicate BOL flagging (half sprint) **[2026-04-10 NEW]**

> **Kati (follow-up 33:20):** flagged duplicate BOLs as a recurring pain. The sheet workflow has no detection.

1. **Add uniqueness constraint (or soft-unique check)** on `bolNo` per company + period.
2. **Surface duplicates on the Validation page** as a dedicated filter/banner.
3. **Merge/resolve UI** — not automatic deletion; the clearer decides.
4. **Integration with the matcher** — if the BOL already exists and matches a built load, flag before creating a new assignment.

### Round 4 P1 — Report parity (payroll report from v2) (half sprint) **[2026-04-10 NEW]**

> **Brittany Brown (follow-up 57:19):** payroll workflow today is PCS Reporter → payroll report → date range → per-truck export. She needs the same thing from v2 or she blocks billing-side adoption.

1. **Payroll report endpoint:** date range + per-truck filter → exportable (CSV or sheet-compatible).
2. **Fields required** from invoice template: BOL, driver, weight, rate, FSC, load/unload times, total pay calculation.
3. **Surface as a Reports tab** on the dispatch desk nav (the beginning of Surface 5 / Billing Reporting).

### Round 4 P1 — PropX PO-in-BOL-field handling (half sprint) **[2026-04-10 NEW]**

> **Kati (follow-up 33:38):** "Sometimes it will have a load confirmed, but it has... the BOL and the BOL spot, it has the PO."

PropX sometimes puts the PO number in the BOL field. The matcher can't trust PropX's BOL field blindly. Two moves:

1. **Upstream data quality:** flag loads where `bolNo` is suspiciously PO-like (length, format, numeric range) at ingest time.
2. **ML/rule training:** add a rule to the matching engine that cross-validates BOL against the PO field — if they're identical, treat BOL as unverified.

### Round 4 P1 — Builder-company assignment filter (half sprint) **[2026-04-10 NEW]**

See Part 5 CC#4. Each builder sees only their company's loads by default. Admin override to see all.

1. **Add `assignedBuilder` or `primaryCompany` field** (probably on users table — company assignment)
2. **Default filter on Dispatch Desk** = current user's company lane
3. **Admin toggle** to see all (Jessica's manager view)
4. **Interaction with completion tracking** — the "built in PCS?" badge filters correctly per-lane

### Round 4 P1 — Clearing status badge (half sprint)

1. **[2026-04-10 scope cut]** Add `clearingStatus` field pulled **from PropX only** (`reconcileStatus`). Logistiq deferred until field name is confirmed.
2. **Surface as a badge on the load drawer**
3. **Reflect both PropX and PCS clearing states** (see Correction 2 — Kati clears in both). PCS-side status may require a second data source or heuristic.
4. **Decide the sync-timing race** with Kati's input (her full walkthrough still pending)
5. **Gate invoicing on clearing status**

### Round 4 P1 — Comment / issue notes on load drawer (half sprint)

**[2026-04-10 scope cut]** Ship as a minimal add-on to the audit log. No role-scoping, no mentions, no real-time infra. Single source (Jessica's single example); validate adoption before investing further.

1. **`load_comments` table** (loadId, authorId, body, createdAt)
2. **Comments tab** in load drawer (the third tab alongside Timeline and Audit Log)
3. **Cross-team visibility** — dispatcher writes, billing reads (unscoped; anyone can see)

### Round 4 P1 — Search discoverability + inline editing parity (half sprint)

1. **Visible search affordance** on Dispatch Desk header (icon + placeholder input)
2. **Wire search to route directly to load drawer in context**, not back to list view
3. **Port inline editing from Dispatch Desk → Validation page** (Jace flagged this as a known gap)
4. **[2026-04-10 CUT]** ~~"What's new in v2" modal or tour~~ — nobody asked for it on either call. Replaced by direct discovery via the two features above (visible search + inline edit parity).

### Round 4 P2 — Daily target editing (DEMOTED from P0)

Was v1's "Big Admin Push #1." Jessica didn't flag it once. Keep on roadmap, ship after the P0/P1 work above.

### Round 4 P2 — Date range selectors

Jessica asked for ranges (22:34) but it was the least load-bearing of her three search asks. Date range, sort by well, and well search were the bundle. Search affordance covers most of the value.

### Round 4 P2 — Live presence demo for Jessica

She hasn't actually USED the existing live-track feature. Schedule a screen-share to demo it. Helps validate the audit-log+presence pattern direction.

### Round 4 P2 — 90-day historical backfill (missed-load bonus) **[2026-04-10 split from P0 missed-load]**

Originally bundled into the missed-load MVP. **Split out** because it requires a sheet-ingestion pathway that doesn't exist yet and is not load-bearing for the Friday diff ritual.

1. Ingest historical Load Count Sheet exports
2. Diff against v2 load records
3. Surface uninvoiced/underpaid loads from the last 90 days
4. Ship only after the P0 Friday diff is proven in production

### Round 4 P3 — Manual load entry + CSV upload for JRT-style carriers

> **Jessica (1:09:26):** "for the wells that were live dispatching, J.R.T. is gonna use sheets, and but there's a way to upload that already."

Carriers without API integration need a manual / CSV pathway. Out of scope for Round 4 unless it's blocking JRT operations.

### Round 4 P3 — Demurrage rules engine (per shipper)

> **Jessica (55:44):** "Every company was different on how they paid... I mean, it's all different. So there is math."

Don't ship a calculator. Ship a rules-config-per-shipper. **Data gather first** — Jessica offered to find an old email with the rules.

### Round 4 P3 — Floating help/legend widget ("Clippy")

> **Jodi (52:06):** "Would there be like a map that would tell some of us who don't work in the loads every day, but actually have to go investigate loads and stuff..."

For Jodi/Jenny/investigators who don't live in the app daily. Always-visible glossary affordance.

### Deferred to subsequent rounds

- **Stephanie's keyboard nav** — **[2026-04-10 CONFIRMED DEFERRED]** Stephanie was on the follow-up call. Her unprompted ask was **completion tracking** (41:06), not keyboard navigation. The v1 prediction that keyboard efficiency was her primary pain is unvalidated; she may never ask for it. Drop from the roadmap until she raises it directly.
- **Kati's clearing walkthrough** — **[2026-04-10 PARTIAL]** Fragments captured on the follow-up call (PropX + PCS clearing, PO-in-BOL issue, Automatize/Logistiq vocabulary). A full step-by-step is still pending and would inform the Phase 2 PCS clearing decision.
- **Billing reporting surface (Surface 5)** — **[2026-04-10 expanded]** Brittany Brown is a new consumer (payroll). Report parity is now P1 (see Part 7 above). The broader Surface 5 buildout remains deferred.
- **Real RBAC** — DEFERRED per existing rollout strategy memory.

---

## [2026-04-10] Go-live context

**Dual-run with sheets announced for ~2026-04-14.** Jessica confirmed this on the follow-up call (37:10). This means:

- **Round 4 P0 must ship before dual-run** or the dual-run reveals gaps that erode team trust on day one.
- **Round 3 branch (19 commits) is still unpushed** as of 2026-04-10. It's independent of Round 4 P0 and should ship first to reduce branch-drift risk.
- **Syncs are still stopped** since April 2 (the pause that preceded the BOL/ticketNo decision). Re-enable sequence is in Part 8.
- **Phase 1 of the phased rollout starts at dual-run.** Jessica validates alone; builders continue using sheets in parallel. Phase 2 begins once PCS REST ships (blocked on Kyle's OAuth).

---

## Part 8 — What changes about the Round 3 branch

The Round 3 branch (`fix/round-3-quick-wins`, 19 commits) is independent of the strategic doc and should still ship. **But the call surfaced an operational sequencing concern:**

**Sync is currently STOPPED** — Jace paused syncs to avoid compounding the BOL/ticketNo mislabel. Re-enable sequence:

1. Push the Round 3 branch (deploy the 13 quick-win fixes)
2. **Round 4 P0 ships:** field rename cascade + photo gate
3. Purge incorrect data
4. Re-sync from PropX/Logistiq
5. Re-enable live syncs
6. Re-score the validation queue

**Order matters.** Round 3 is independent of the field renames (none of the Round 3 commits touch `ticketNo` or `well`), so it can ship at any time. But Round 4 P0 must ship before re-sync, or the wrong-labeled data propagates further.

---

## Part 9 — Pending follow-ups (open questions from the call)

**[2026-04-10 reconciled]** — each item tagged with current status after the reconciliation pass.

1. **Clearing race condition** — ⚠️ **CONFIRMED, UNRESOLVED.** Jessica (follow-up 23:48): _"Sometimes I think we get them built before they're actually cleared."_ Both calls agree the race is real; no decision between option (a) pull-only-cleared and option (b) pull-early-and-subscribe. Still needs Kati's input.
2. **Logistiq's equivalent to PropX `reconcileStatus`** — ❓ **STILL OPEN.** Not answered on the follow-up. **[Scope decision]** Round 4 ships PropX-only.
3. **JRT live-dispatching wells** — ❓ **STILL OPEN.** Keli handles JRT; JRT uses sheets. No new info. Jessica seems fine leaving it external.
4. **The mystery `bolNo` field origin** — ✅ **RESOLVED.** Code audit confirmed `bolNo` is a direct BOL passthrough from all three sources. Not a mystery. `ticketNo` drops in the contract migration (decided 2026-04-06).
5. **Demurrage rules per shipper** — ❓ **STILL OPEN.** Jessica described complexity but no rules captured. Email pending.
6. **Stephanie's keyboard workflow** — ✅ **RESOLVED DIFFERENTLY.** Stephanie was on the follow-up call. Her ask was completion tracking (41:06), not keyboard nav. Keyboard nav dropped from roadmap.
7. **Kati's clearing walkthrough** — ⚠️ **PARTIAL.** Fragments captured (PropX clearing, PO-in-BOL issue, v2 as cross-reference tool). Full step-by-step still pending.
8. **Logistiq login URL** — ⚠️ **PARTIAL.** `logistixiq.io/login` mentioned in the original call. Not reconfirmed.
9. **Comment/issue notes scope** — ❓ **STILL OPEN.** Not discussed in follow-up. Treated as single-example extrapolation; ship minimal and validate.
10. **Jodi/Jenny/Chitra role map** — ⚠️ **EXPANDED.** Brittany Brown added (payroll). Jeri added (Logistiq clearing). Two Jessicas distinguished. Kati reassigned from builder to clearer. Chitra still unclear. See Appendix B.

**Resolution score:** 2 fully resolved, 4 partially resolved, 4 still open. None of the 4 open items block Round 4 P0.

---

## Appendix A — The 7 canonical status labels (from Load Count Sheet)

These replace v2's current filter tab labels. Source: `/mnt/c/Users/jryan/Downloads/Load Count Sheet - Daily (Billing) - Current.csv` column K.

1. **Missing Tickets / Not Arrived**
2. **Missing Driver**
3. **Loads being built**
4. **Loads being cleared**
5. **Need Well Rate Info / New Loading Facility Rate** ← v2 has nothing for this state
6. **Loads Completed / Load Count complete**
7. **Export (Transfers) Completed**

These are the team's actual classifier system. v2's current filter tabs (all, pending, assigned, reconciled, ready, validated, bol_mismatch) need to be re-mapped or replaced to align with these.

## Appendix B — The actual team roster (correcting v1 + **[2026-04-10 reconciled]**)

From the Load Count Sheet's "Order of Invoicing" section + the two validation calls + the follow-up call.

### Builders (assigned by COMPANY, not by chain or color)

| Person                       | Role    | Assigned company | Source                                           |
| ---------------------------- | ------- | ---------------- | ------------------------------------------------ |
| **Scout Yochum**             | Builder | **Liberty**      | Load Count Sheet + follow-up call (25:13, 29:28) |
| **Stephanie Venn** ("Steph") | Builder | **Logistiq**     | Load Count Sheet + follow-up call (41:06)        |
| **Keli**                     | Builder | **JRT**          | Load Count Sheet (not on either call)            |
| **Crystal**                  | Builder | overflow         | Load Count Sheet (98 loads, no specific company) |

### Clearers

| Person           | Role                                              | Source                                              |
| ---------------- | ------------------------------------------------- | --------------------------------------------------- |
| **Kati Shaffer** | **CLEARS in PropX AND PCS** (NOT a builder)       | Follow-up call (Jessica 27:07, Kati 44:44, 33:38)   |
| **Jeri**         | Handles Logistiq clearing (Hairpin Trucking area) | First Jessica call (brief mention, not reconfirmed) |

### Management / dispatch

| Person              | Role                                                                                                                             | Source                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Jessica Handlin** | Dispatch manager + **Phase 1 validator** (will validate alone during dual-run, then hand off to builders per-company in Phase 2) | Both calls; follow-up 15:04, 27:07 |
| **Jessica (owner)** | Company owner. **Different person from Jessica Handlin.** Left the first validation call at ~54:00 for a doctor's appointment.   | First Jessica call ~54:00          |

### Billing / payroll / reporting

| Person             | Role                                                                                                               | Source                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **Jodi**           | Billing + driver-pay lookups (searches by BOL)                                                                     | Both calls + first call 27:00                                |
| **Jenny**          | Invoice reconciliation — the safety net catching missed loads when totals don't match                              | First Jessica call 36:37                                     |
| **Brittany Brown** | **Payroll/accounting** — downstream consumer. Needs payroll report parity (PCS Reporter → date range → per-truck). | Follow-up call (stayed for post-call payroll session, 57:19) |
| **Chitra**         | Third person briefly on the first call. **Role still unclear** after reconciliation.                               | First call only                                              |

### Corrected headcount and coordination pattern

That's **4 builders + 2 clearers + 2 dispatchers (2 Jessicas) + 4 billing/payroll = 12 people** in the dispatch chain, not the 4–8 the v1 persona reports assumed. Coordination is **by-company assignment** (see Part 5 CC#4), not by chain/color as v1 invented.

**The biggest single-person correction from v1:** Kati Shaffer (previously labeled "Katie, may be a persona placeholder") is **the clearer**, not a builder. She is the operational bottleneck between BUILD and BILL in both PropX and PCS. Her workflow is the one most likely to reshape Round 4 scope once her full walkthrough is captured.

## Appendix C — The 38-field master template — Jessica's actual keep/drop list

**[2026-04-10 reconciled]** The Invoice template CSV and the follow-up call corrected two things from the earlier keep/drop list:

1. **Load identifiers are FOUR, not three.** The Invoice template reveals `Shipper # BOL` as a distinct 4th identifier alongside BOL, Liberty's load number, and PropX's order number.
2. **`ES Express #` is NOT a duplicate** — it's **human-assigned during PCS build** by the girls. Jessica (follow-up 53:05): _"That's the number that the girls fill that in when they build that load."_ It belongs in the KEEP list, not the DROP list.

### The four load identifiers (corrected)

| #   | Identifier                         | Assigned by                         | Used for                               |
| --- | ---------------------------------- | ----------------------------------- | -------------------------------------- |
| 1   | **BOL** (`bolNo`)                  | Source document (shipper paperwork) | Driver search, payroll lookup, matcher |
| 2   | **Shipper # BOL**                  | Shipper's own reference             | Shipper-side reconciliation (billing)  |
| 3   | **Liberty load # / PropX order #** | Source system (integer / system ID) | System-side load identification        |
| 4   | **ES Express #**                   | **Human-assigned during PCS build** | Internal tracking / ES invoicing       |

### KEEP explicitly

- PO (terminal PO)
- Ticket # (= BOL — rename happens elsewhere)
- Order # (= Liberty's load number / PropX's order number)
- Miles, Product, Loader, Shipper # BOL
- Load In, Load Out, Load Time
- Wt. Lb. (pounds)
- Unload Appt (KEEP — needed for demurrage)
- Unload In, Unload Out, Unload Time
- Total Demurrage, Loading Demurrage Reasons
- Rate/Ton, LINE HAUL, Demurrage, Total Load
- FSC (coming back, currently off)
- Notes, Company
- **[2026-04-10 moved to KEEP] `ES Express #`** — human-assigned during PCS build, not a duplicate

### New fields discovered in the Invoice template **[2026-04-10]**

These come from `1560+ Invoice Sheet template.csv` (billing view, per-truck tabs). They are NOT in the current v2 schema and are needed for report parity with Brittany's payroll workflow:

| Field             | What it is                                          | Where to surface                         |
| ----------------- | --------------------------------------------------- | ---------------------------------------- |
| `Ac/per ton`      | Accessorial rate per ton                            | Billing/payroll report                   |
| `FSC/Mile`        | Fuel surcharge rate per mile                        | Billing/payroll report                   |
| `Amount Invoiced` | Total invoice amount (billing view)                 | Billing/payroll report                   |
| `Tons Conv.`      | Explicitly "converted" tons (computed from Wt. Lb.) | Naming confirmation for the tons compute |

### DROP (Jessica explicit)

- Invoice #
- Settlement Date
- ~~ES Express # (duplicate of PCS assignment)~~ **[2026-04-10 CORRECTED — this is KEEP, see above]**
- Hairpin Express #
- Extra columns
- ETA

### HIDE for now, bring back later

- Status field (will be inferred from live tracking eventually)

### Data quality issue discovered **[2026-04-10]**

> **Kati (follow-up 33:38):** "Sometimes it will have a load confirmed, but it has say the BOL and the BOL spot, it has the PO."

**PropX occasionally writes the PO number into the BOL field.** The matcher cannot trust PropX's BOL field blindly. See Part 7 → P1 "PropX PO-in-BOL-field handling" for the remediation plan.

**Jessica's summary at 1:06:12:** _"If we're getting down to then, it looks like all the rest of it probably, I know it's a lot, but it probably is important."_

So the v1 prediction of "ship 6 of 24" was wrong. Closer to **30 fields kept, 6-8 dropped**, plus **4 new fields from the invoice template** for billing report parity. Round 4 should not gate field shipping on Jessica's keep-list — it should gate on data availability from the source APIs.

---

## What this v2 doesn't change from v1

These v1 sections survived the call intact:

- **The four-surface model** (soft-confirmed at 1:10:58)
- **The bridge → REST → replacement framing** (not contradicted; Jessica's "until we get away from PCS" comment implicitly endorsed Phase C)
- **The "system gives to user" principle and the Stephanie/Jessica/Katie tests** (Part 11 of v1)
- **The honest accounting of Round 1+2+3 deliverables** (Parts 7-8 of v1)
- **Six of the seven disconnects** (Disconnect 7 — "the meta-disconnect about persona reports" — now has a concrete example: this entire revision)
- **Appendix B (source material index)**

For these, refer to v1 directly. v2 doesn't repeat them.

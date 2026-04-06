# ES Express v2 — Workflow Architecture v2 (post-validation-call)

**Date:** 2026-04-06 (post-call revision)
**Status:** Validated against the 2026-04-06 call with Jessica Handlin + Jodi (billing). Stephanie + Katie still pending dedicated sessions.
**Supersedes:** `2026-04-06-workflow-architecture.md` (v1, pre-call). v1 is preserved as historical record of what we believed going in.
**Source records:** `2026-04-06-validation-call-findings.md` (raw mining of the 75-min call transcript)
**Audience:** Internal — engineering team and any agent picking up Round 4

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

- **Audit log on every load drawer.** Four minimum event types: built, cleared, re-dispatched, rate-changed. Replaces the PCS feature she relies on today.
- **Live presence on the dispatch desk row.** v2 already has this in the drawer (the "live track" feature Jace demoed at 48:37). Jessica didn't know it existed. Surface it on the row level too — small avatar badges showing who's currently in the load.
- **Status colors tied to the load count sheet legend.** The 7 canonical labels (see Appendix B) map to v2 filter tabs and row coloring. NOT personal-ownership colors.

**What this kills from v1:** the entire "Cross-cutting #1: Chain Coordination Layer" section in v1's Part 5. Replace with "Cross-cutting #1: Audit + Presence + Status" (see Part 5 below).

### Correction 2 — Clearing happens externally

**v1 said:** The temporal pipeline is `INGEST → MATCH → VALIDATE → BUILD → CLEAR → DISPATCH → DELIVER → BILL`, with CLEAR as a v2 stage where Katie verifies what Stephanie built.

**Jessica said:** "We clear the loads in... I always want to call it automatize them, that's not what it is. Anyway, Logistics. So we clear the loads in logistics and PropX on their system before, you know, before we can invoice them out." (38:23) And: "We have to go and approve these loads before they will pay us." (41:42)

**The correct pipeline:**

```
INGEST → MATCH → VALIDATE → BUILD → DISPATCH → DELIVER → [CLEAR happens in Logistiq/PropX, OBSERVED by v2] → BILL
```

`CLEAR` is not a v2 lifecycle stage. It's a _bidirectional integration_ — v2 needs to read the `reconcileStatus` field from PropX and the equivalent field from Logistiq (Jessica didn't remember the exact name), and surface the clearing status as a badge on the load drawer.

**Open sync-timing race:** Jessica raised this herself (38:56). Two options, no decision yet:

- (a) Pull only-cleared loads (delay v2 ingest by 24-48 hours so Katie has cleared them externally first)
- (b) Pull immediately + subscribe to change notifications so v2 updates when Katie edits fields downstream

This needs Katie's input. Her clearing walkthrough is scheduled for the next session.

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

### Correction 6 — Validation is a one-person job

**Jessica at 11:25:**

> "That will be one part, one part, I mean, I'll say one person, it could, you know, somebody else could potentially jump in and do this, but really I think one person's going to do all or 90% of the validation."

And earlier (10:18):

> "I like the validation page for if and when we get to the point that this is, you know, like 100% that we can come here and approve all the tier ones. I do like that. I don't know that we will work from this page a whole lot."

**Implication:** The Reconciliation Loop surface (Surface 2) is a **single power user surface**, not a team collaboration surface. Optimize for density and keystroke efficiency, not for collaborative triage. UI patterns: claim-based assignment if multi-user, dense list view, no multi-cursor / live-presence emphasis (those matter on Surface 1, not here).

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

### The three-phase evolution (unchanged)

Phase A (Bridge today) → Phase B (REST integration, blocked on Kyle's OAuth) → Phase C (Replacement). This framing was not contradicted in the call, though Jessica's "until we get away from PCS" comment about the tons/lbs conversion implies she's mentally planning for Phase C as well.

---

## Part 5 — The two cross-cutting concerns (REVISED)

### Cross-cutting #1: Audit log + Live presence + Status colors

**Replaces v1's "chain coordination layer" entirely.**

**Audit log on every load drawer:**

- Tab pattern in the drawer bottom pane: **Timeline / Audit Log / Comments**
- Timeline (existing) collapses by default
- Audit Log shows the four event types Jessica named: **built, cleared, re-dispatched, rate-changed** (with timestamp + actor)
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

**These are STATUS labels, not personal-ownership labels.** They map to v2 filter tabs and row coloring.

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

### Round 4 P0 — The Field Rename Cascade + Photo Gate (1 sprint)

This is the unblock. Nothing else can happen until the matching engine is matching on the right field.

1. **Rename `ticketNo` → `bolNo` (the real BOL).** Audit existing `bolNo` field and figure out what it actually is. Likely a PCS assignment number.
2. **Reverse `well` semantics:** well = destination. Add `loader` / `sandplant` field for origin. Collapse the finance-module `destination` field into `well`.
3. **Switch weight display to pounds.** Store pounds canonically, compute tons for billing.
4. **Add the photo gate to the matching engine:** `isTier1 = hasAllFieldMatches && hasPhoto`.
5. **Re-sync sequence:** purge incorrect data → re-sync from PropX/Logistiq → re-enable live syncs (currently STOPPED, data stale as of April 2).
6. **Re-score the whole validation queue** after the rule change.

### Round 4 P0 — Audit log + live presence row indicator (1 sprint)

Replaces v1's "chain coordination layer."

1. **Add `auditLog` table** with event types: built, cleared, re-dispatched, rate-changed
2. **Decorator wrapping load mutations** to auto-write audit events
3. **Tab pattern in load drawer:** Timeline / Audit Log / Comments
4. **Live presence avatar badges on dispatch desk rows** (lift the in-drawer feature)
5. **Status colors on rows tied to count-sheet legend** (the 7 labels above)

### Round 4 P0 — Missed-load detection (1 sprint)

**Frame as REVENUE RECOVERY, not workflow hygiene.** Highest-ROI business case the project has.

1. **Tag every load with import timestamp**
2. **Friday diff job:** for each company, pull current period; compare against prior pull; surface anything new (that should have been in the prior pull) as "missed"
3. **Ship as weekly run first**, automate scheduling later
4. **Bonus revenue-recovery feature:** run the diff against historical sheet data to surface uninvoiced/underpaid loads from the last 90 days
5. **Surface results in a "Missed Loads" view** — Jessica's manual ritual is now a system feature

### Round 4 P1 — Clearing status badge (half sprint)

1. **Add `clearingStatus` field** pulled bidirectionally from PropX (`reconcileStatus`) and Logistiq (TBD field name)
2. **Surface as a badge on the load drawer**
3. **Decide the sync-timing race** with Katie's input (her walkthrough is next session)
4. **Gate invoicing on clearing status**

### Round 4 P1 — Comment / issue notes on load drawer (half sprint)

1. **`load_comments` table** (loadId, authorId, body, createdAt)
2. **Comments tab** in load drawer (the third tab alongside Timeline and Audit Log)
3. **Cross-team visibility** — dispatcher writes, billing reads
4. **Real-time updates** if other people are in the load (uses existing presence infra)

### Round 4 P1 — Search discoverability + inline editing parity (half sprint)

1. **Visible search affordance** on Dispatch Desk header (icon + placeholder input)
2. **Wire search to route directly to load drawer in context**, not back to list view
3. **Port inline editing from Dispatch Desk → Validation page** (Jace flagged this as a known gap)
4. **"What's new in v2" modal** or tour highlighting `/` search, live presence, inline edit

### Round 4 P2 — Daily target editing (DEMOTED from P0)

Was v1's "Big Admin Push #1." Jessica didn't flag it once. Keep on roadmap, ship after the P0/P1 work above.

### Round 4 P2 — Date range selectors

Jessica asked for ranges (22:34) but it was the least load-bearing of her three search asks. Date range, sort by well, and well search were the bundle. Search affordance covers most of the value.

### Round 4 P2 — Live presence demo for Jessica

She hasn't actually USED the existing live-track feature. Schedule a screen-share to demo it. Helps validate the audit-log+presence pattern direction.

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

- **Stephanie's keyboard nav** — DEFERRED. Stephanie wasn't on the call. Don't design without her input. Schedule dedicated session first.
- **Katie's clearing walkthrough** — DEFERRED to next-day call (Jessica committed to setting it up).
- **Billing reporting surface (Surface 5)** — DEFERRED. Acknowledge in doc; scope after Jodi's needs are clearer.
- **Real RBAC** — DEFERRED per existing rollout strategy memory.

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

1. **Clearing race condition** — pull only-cleared vs pull early + subscribe? Needs Katie's input.
2. **Logistiq's equivalent to PropX `reconcileStatus`** — Jessica couldn't remember the field name. Jace will check the API.
3. **JRT live-dispatching wells** — does v2 absorb or stay out? Jessica seems fine leaving it.
4. **The mystery `bolNo` field origin** — Jace said "I will figure that out and fix that" (1:04:00). Schema audit pending.
5. **Demurrage rules per shipper** — Jessica offered to find an old email. Follow-up pending.
6. **Stephanie's keyboard workflow** — needs dedicated session.
7. **Katie's clearing walkthrough** — scheduled for next-day call.
8. **Logistiq login URL** — Jessica couldn't produce the correct URL during the call.
9. **Comment/issue notes scope** — role-scoped? immutable? not specified.
10. **Jodi/Jenny/Chitra role map** — persona model needs updating to reflect actual people.

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

## Appendix B — The actual team roster (correcting v1)

From the Load Count Sheet's "Order of Invoicing" section:

- **Scout** — builder
- **Steph** (Stephanie Venn) — builder
- **Keli** — builder _(NOT Katie — Katie may have been a persona placeholder name)_
- **Crystal** — builder (98 loads on the day captured in the sheet)
- **Jessica Handlin** — dispatch manager
- **Jodi** — billing
- **Jenny** — invoice reconciliation (the safety net catching missed loads)
- **Chitra** — third person briefly on the call, role unclear

That's 4 builders + 1 manager + 2-3 billing roles = 7-8 people total in the dispatch chain. The persona reports treated this as a 4-person operation. It's larger.

## Appendix C — The 38-field master template — Jessica's actual keep/drop list

**KEEP explicitly:**

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

**DROP (Jessica explicit):**

- Invoice #
- Settlement Date
- ES Express # (duplicate of PCS assignment)
- Hairpin Express #
- Extra columns
- ETA

**HIDE for now, bring back later:**

- Status field (will be inferred from live tracking eventually)

**Jessica's summary at 1:06:12:** _"If we're getting down to then, it looks like all the rest of it probably, I know it's a lot, but it probably is important."_

So the v1 prediction of "ship 6 of 24" was wrong. Closer to **30 fields kept, 6-8 dropped**. Round 4 should not gate field shipping on Jessica's keep-list — it should gate on data availability from the source APIs.

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

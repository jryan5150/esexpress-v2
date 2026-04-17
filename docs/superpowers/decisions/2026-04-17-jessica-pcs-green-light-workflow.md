# Decision Record — Jessica's PCS Green Light Workflow

> **Status:** Pending sign-off
> **Captured:** 2026-04-17
> **Source:** Jessica Handlin email thread _Re: PCS Green Light_
> (Internet-Message-Id `<MN2PR03MB519771A5F68059D989971E06B5202@MN2PR03MB5197.namprd03.prod.outlook.com>`, 2026-04-17 19:14 UTC / 14:14 CT)
> **Mockup:** `frontend/public/workbench-jess-signoff.html` (open at `http://localhost:5173/workbench-jess-signoff.html` during dev, or deploy preview for team review)
> **Feature branch:** `feature/workbench-v5`

---

## 1. What Jessica asked for (verbatim-faithful summary)

### Validation Page
- **Every load must be manually cleared** before it is ready to build or pushed to PCS.
- Tiers and percentages for matched loads are good to keep.
- **100%-matched loads** (photo attached required):
  - Currently render **green**.
  - After human confirm, auto-turn **yellow** and move to "ready to build" under the dispatch desk.
  - There must be an option to **override / change an auto-validated load** (un-confirm it).
- **Sub-100% loads** must be manually validated.
  - Sort by **well** and **date range** from the validation page.
  - Clarity on **BOL vs. Ticket number** (both visible, not one-or-the-other).
  - **More options than "confirm or reject"** — at minimum: color-code and route to sub-tabs such as _Missing Ticket_.
  - Individual OR **bulk** validate (select multiple rows → validate together).

### Dispatch Desk
- Incoming loads arrive **yellow** and are available to turn **green** (to be built or pushed to PCS).
- Once built or pushed → turn **pink** = completed.

### Reporting (payroll + invoicing)
- Report filter by **date range**.
- Sort each imported load **by truck number**.
- Report includes **anything that was ever downloaded/imported** (not just built or pushed) so nothing slips through payroll.
- For loads that got built in PCS, the report must include the **PCS load number** alongside all other load info.
- Replaces the current Google Sheets copy-paste + cross-reference with PCS.

### Timing commitment
- Jessica wants a **one-week internal validation window** before pushing live to PCS.
- She is available all weekend for follow-ups.

---

## 2. Color mental model — reconciled

| Jessica's color | Meaning in her workflow | v5 stage mapping (new) |
| ---: | --- | --- |
| **Green** | Auto-validated (100% match, photo attached) — awaiting human confirm | `handler_stage = uncertain` _and_ `auto_match_score = 1.0` _and_ `photo = attached` (new sub-state) |
| **Yellow** | Ready to build / ready to be pushed to PCS | `handler_stage = ready_to_build` |
| **Pink** | Built or pushed → completed | `handler_stage = building` or `entered` (any post-build state) |
| Red / orange (implied) | Needs attention — sub-100%, missing ticket, missing driver, needs rate | `handler_stage = uncertain` with `uncertain_reasons != []` |

**Key deviation from v5 as shipped:** v5 originally had clean loads (no uncertain_reasons) auto-advancing to `ready_to_build` on matcher run. **Jessica is explicit: every load gets a human click.** Clean loads are fast to confirm, but the gate still exists.

---

## 3. Change list — what it means for v5

| # | Area | Change | Effort | Blocks Jessica's workflow? |
| --- | --- | --- | --- | --- |
| 1 | **Stage colors** | Rebrand stage palette from neutral (amber/blue/sky/teal/slate) to traffic-light (green/yellow/pink). Update `StagePill`. | S | Yes — she has to recognize her own color language |
| 2 | **Manual-clear gate** | Reconcile to populate `uncertain_reasons`, but do **not** auto-advance. All rows land on the validation queue. Clean rows render green; human click moves to yellow. | M | Yes — central to her ask |
| 3 | **Confirm action (fast path)** | Add a one-click "Confirm → Ready to Build" button on green rows. Adding a human audit entry. | S | Yes |
| 4 | **Override auto-validation** | Un-confirm / send back to manual review from a confirmed row. | S | Yes |
| 5 | **Granular resolve actions** | Replace single "Advance / Flag" with: Confirm · Mark Missing Ticket · Mark Missing Driver · Needs Rate · Flag Back. Each routes to a filter. | M | Yes |
| 6 | **Bulk validate** | Select N rows → confirm in one action. Mirror of Build+Duplicate but for the validation step. | M | Yes |
| 7 | **BOL + Ticket both visible** | Row shows both fields (two small columns instead of one `bolNo ?? ticketNo`). | S | Yes |
| 8 | **Date range filter** | Filter pill or date-range picker on the Workbench. | S | Yes (for sort/organize) |
| 9 | **Truck-sort / by-truck filter** | Group or filter rows by truck number (Jeri's pattern). | S | Yes (her reporting depends on it) |
| 10 | **New uncertain_reasons** | Add `missing_driver`, `missing_tickets` to the enum (jsonb — no migration). | XS | Yes |
| 11 | **Reporting module (payroll / invoicing)** | Separate surface: date range + truck sort + includes every imported load + PCS load number when built. | L | **Not** MVP — Jessica currently uses sheets; Phase 2 |
| 12 | **PCS push (auto-dispatch)** | Separate track — unblocked by PCS green-light; target per Jessica's 1-week validation window. | L | Tracked on the PCS integration plan, not Workbench |

**S** ≈ under 30 min · **M** ≈ 30–60 min · **L** ≈ multi-session

---

## 4. What stays the same

- The 5-stage model (`uncertain → ready_to_build → building → entered → cleared`) is **compatible** with Jessica's color language. Stages are the data model; colors are the UI.
- Per-handler color stripes (left edge of each row) remain — they indicate _whose turn it is_, not load state.
- The ExpandDrawer with inline edit (landed this afternoon on `feature/workbench-v5`) is orthogonal and still valid.
- The migration `0011_easy_epoch.sql` (handler_stage + uncertain_reasons columns) is still the correct schema.

---

## 5. Open product questions — needs Jessica's answer before building

1. **Green → Yellow transition: who and when?**
   - Option A: Every user in the dispatch chain can confirm (Jess, Steph, Scout, Keli).
   - Option B: Only Jessica confirms (she's the dispatch lead).
   - Option C: Tiered — Jessica confirms, Stephanie/Scout/Keli build.
   - _Current v5 default:_ whoever is "current_handler" can advance.
2. **Pink = built OR pushed: which one?**
   - Her email uses "built or pushed" as if interchangeable. Does "built" mean typed into PCS by a dispatcher (current manual workflow) and "pushed" mean auto-dispatched via API (post-OAuth)? If so, is there a visual distinction needed, or is pink the same for both?
3. **"Loads Being Cleared" and "Invoiced"** from the color-key sheet — do those still apply, or does the workflow end at pink?
4. **Override auto-validation:** does the override return the load to uncertain, or to a "re-review" sub-state? Does the green label stay or change?
5. **Missing Ticket / Missing Driver sub-tabs:** are these filters on the same Workbench page, or distinct pages like the old /bol and /validation?

---

## 6. Sign-off protocol

This decision record is not finalized until:

- [ ] Jessica has reviewed the HTML mockup at `frontend/public/workbench-jess-signoff.html`.
- [ ] Jessica has confirmed the color model (Section 2) matches her mental model.
- [ ] Jessica has answered the open product questions (Section 5) — either in email reply or in a follow-up call.
- [ ] Bryan Janz and Jared Reid have signed off on the engineering impact (Section 3).
- [ ] Jace has filed the decision in the weekly decision log.

**Sign-off capture:**

| Reviewer | Channel | Date | Verdict |
| --- | --- | --- | --- |
| Jessica Handlin (Dispatch Lead) | _email reply / call / annotated mockup_ | _pending_ | _pending_ |
| Bryan Janz (Lexcom) | _email / Slack_ | _pending_ | _pending_ |
| Jared Reid (Lexcom) | _email / Slack_ | _pending_ | _pending_ |

When sign-off lands, append the reply (or link to it) below and move this document to `docs/superpowers/decisions/approved/`.

---

## 7. Next actions (post-sign-off)

Once Jessica approves:

1. Implement Sections 3.1–3.10 in that order on `feature/workbench-v5`. Each is a commit with the cross-reference `docs/superpowers/decisions/2026-04-17-jessica-pcs-green-light-workflow.md#N`.
2. Regenerate the HTML mockup with the real UI hooked up (optional — in-app walkthrough is better).
3. Begin the 1-week internal validation window (Monday → Friday of the week Jessica picks).
4. Begin work on Section 3.11 (reporting) and Section 3.12 (PCS auto-push) as separate tracks.

---

## 8. Related documents

- Workbench v5 plan: `docs/superpowers/plans/2026-04-15-workbench.md`
- Workbench v5 design spec: `docs/superpowers/specs/2026-04-15-workbench-design.md`
- Prior Jessica call mockup: `frontend/public/mockups-call.html` (2026-04-15 context)
- Color Key screenshot (Jessica's sheet): supplied 2026-04-17 in chat
- Load Count Sheet CSV + Invoice Template CSV: supplied 2026-04-17 in chat
- Handoff: `docs/superpowers/handoff-2026-04-15.md`

---

_This document is the single source of truth for the workflow changes triggered by Jessica's 2026-04-17 email. Do not ship UI or DB changes listed in Section 3 until the sign-off checklist in Section 6 is complete._

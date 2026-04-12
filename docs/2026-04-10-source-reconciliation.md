# ES Express v2 — Source Reconciliation

**Date:** 2026-04-10
**Purpose:** Every claim in the v2 strategic doc checked against ALL available sources. Facts only, confidence-marked.

**Sources reconciled:**

1. Validation call transcript (2026-04-06) — Jessica Handlin + Jodi + Jessica (owner, left at 54:00)
2. Team follow-up call transcript (2026-04-09) — Scout Yochum + Kati Shaffer + Stephanie Venn + Jessica Handlin + Brittany Brown
3. Load Count Sheet CSV (weekly dispatch view, by well)
4. 1560+ Invoice Sheet template CSV (billing view, by truck)
5. v2 strategic doc (current, with P0 #1 rewrite from 2026-04-06 agent review)
6. Codebase audit (bolNo schema audit, ticketNo churn audit)
7. 11-agent deepen/review findings (2026-04-06)
8. All project memory files

**Confidence markers:**

- ✅ VALIDATED — confirmed by 2+ independent sources
- ⚠️ PARTIAL — some aspects confirmed, others unverified or extrapolated
- ❌ CONTRADICTED — evidence against
- 🆕 NEW — discovered, not in v2 doc
- ❓ OPEN — no evidence either way

---

## 1. Team Roster

| Person          | v2 doc role                                              | Reconciled role                                                                                                  | Status            | Source                                                                                   |
| --------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| Scout Yochum    | Builder                                                  | Builder, assigned **Liberty** loads                                                                              | ✅                | Load Count Sheet + follow-up call                                                        |
| Stephanie Venn  | Builder                                                  | Builder, assigned **Logistiq** loads                                                                             | ✅                | Load Count Sheet + follow-up call (she was on the call, asked about completion tracking) |
| Keli            | Builder                                                  | Builder, assigned **JRT** loads                                                                                  | ✅                | Load Count Sheet (not on either call)                                                    |
| Crystal         | Builder (98 loads)                                       | Builder, 98 loads, no specific company assignment visible                                                        | ✅                | Load Count Sheet                                                                         |
| Kati Shaffer    | Not clearly defined ("Katie may be persona placeholder") | **CLEARER** — clears in PropX AND PCS. NOT a builder.                                                            | ❌ role was wrong | Follow-up call: Jessica 27:07, Kati 44:44                                                |
| Jessica Handlin | Dispatch manager                                         | Dispatch manager + **initial validator** in phased rollout                                                       | ⚠️ expanded       | Follow-up call 15:04, 27:07                                                              |
| Jodi            | Billing                                                  | Billing/payroll — in room during follow-up, searches by BOL for driver payment inquiries                         | ✅                | Both calls                                                                               |
| Jenny           | Invoice reconciliation                                   | Invoice reconciliation — catches missed loads when totals don't match                                            | ✅                | Jessica call 36:37                                                                       |
| Brittany Brown  | **NOT IN v2 DOC**                                        | Payroll/accounting — downstream consumer, needs report parity                                                    | 🆕                | Follow-up call, stayed for post-call payroll session                                     |
| Jeri            | **NOT IN v2 DOC**                                        | Handles Logistiq clearing (mentioned briefly, Hairpin Trucking email)                                            | 🆕                | Jessica call                                                                             |
| Jessica (owner) | **NOT DISTINGUISHED from Jessica Handlin**               | Company owner — left Jessica call at 54:00 for doctor's appointment. Had prepared chain/color discussion points. | 🆕                | Jessica call ~54:00                                                                      |
| Chitra          | Role unclear                                             | Still unclear                                                                                                    | ❓                | Mentioned in Jessica call only                                                           |

**Key structural finding:** Builder assignment is BY COMPANY, not by personal preference, chain, or color. This is a coordination pattern the v2 doc completely missed.

| Company     | Builder      | Source                                |
| ----------- | ------------ | ------------------------------------- |
| Liberty     | Scout        | Load Count Sheet "Order of Invoicing" |
| Logistiq    | Steph        | Load Count Sheet "Order of Invoicing" |
| JRT         | Keli         | Load Count Sheet "Order of Invoicing" |
| (overflow?) | Crystal (98) | Load Count Sheet                      |

---

## 2. Workflow Pipeline

### v2 doc pipeline:

```
INGEST → MATCH → VALIDATE → BUILD → DISPATCH → DELIVER → [CLEAR external] → BILL
```

### Reconciled pipeline (Phase 1 — Jessica validates):

```
INGEST → MATCH → JESSICA VALIDATES → COPY/PASTE TO PCS → "ARRIVE" IN PCS → KATI CLEARS IN PROPX → KATI CLEARS IN PCS → PAYROLL REPORT → BILL
```

### Reconciled pipeline (Phase 2 — builders validate, after PCS OAuth):

```
INGEST → MATCH → BUILDER VALIDATES (per company assignment) → v2 PUSHES TO PCS VIA REST → ARRIVE (auto?) → KATI CLEARS IN PROPX → [PCS CLEAR ELIMINATED?] → PAYROLL REPORT → BILL
```

### Pipeline corrections:

| v2 doc claim                                    | Status | Evidence                                                                                                                                                                                                              |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLEAR happens in PropX only                     | ❌     | Kati clears in BOTH PropX AND PCS. Jessica (follow-up 26:29): "Katie's still going to have to clear all of these loads when they go into PCS, and she's still going to have to clear everything in PropX."            |
| VALIDATE and BUILD are separate stages          | ⚠️     | Builders equate them. Scout (follow-up 25:13): "So it's basically like clearing it in PropX." The cognitive operation is: compare photo against data → confirm → copy to PCS. Validate and build are one motion.      |
| "ARRIVE" step exists                            | 🆕     | Jessica (follow-up 28:56): "once we get a load all put into PCS, then we have to arrive it." Missing from v2 pipeline.                                                                                                |
| The pipeline has a Phase 1 → Phase 2 transition | 🆕     | Jessica validates first (Phase 1), then hands off to builders (Phase 2). Jessica (follow-up 15:04): "For a little while, I will validate all the loads." Then (27:07): "Once we're able to push to PCS, I will stop." |
| Clearing race condition exists                  | ✅     | Jessica (follow-up 23:48): "Sometimes I think we get them built before they're actually cleared." Both calls confirm. No resolution.                                                                                  |

---

## 3. The Four-Surface Model

| Surface              | v2 doc description           | Status               | Evidence                                                                                                                            |
| -------------------- | ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| S1 Build Workbench   | Stephanie/Scout/Keli/Crystal | ✅ but scope expands | In Phase 2, builders ALSO validate (not just build). S1 absorbs validation for each builder's assigned company.                     |
| S2 Exception Loop    | One power user (not team)    | ✅ for Phase 1 only  | Jessica validates solo initially. In Phase 2 this surface merges into S1 per-builder.                                               |
| S3 Oversight View    | Jessica's manager hat        | ⚠️                   | Soft-confirmed at end of Jessica call. Not discussed in follow-up.                                                                  |
| S4 Configuration     | Rare admin setup             | ⚠️                   | No evidence for or against.                                                                                                         |
| S5 Billing Reporting | Jodi/Jenny (latent)          | ⚠️ expanded          | Brittany Brown is a new consumer. Payroll report parity (PCS Reporter > payroll > date range > per-truck) is now a documented need. |

**Missing capability (doesn't fit a surface):** "Has this been built in PCS?" — Scout 29:28 and Stephanie 41:06 both independently asked for completion tracking. This is a dispatch desk column/badge, not a separate surface.

---

## 4. Cross-cutting Concerns

### CC#1: Audit + Presence + Status

| Element                                                           | Status       | Evidence                                                                                                                              |
| ----------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Audit log (PCS-style, who touched what)                           | ⚠️           | Jessica call only (47:21). Not discussed in follow-up. Single-source validation.                                                      |
| Live presence (avatar badges)                                     | ⚠️           | Jessica reacted positively to demo (48:37). Not discussed in follow-up. Single-source.                                                |
| Status colors from count-sheet legend                             | ✅           | Both calls confirm. Jessica (follow-up 16:27): "color coding them." Load Count Sheet CSV confirms the 7 labels.                       |
| 4 audit event types (built, cleared, re-dispatched, rate-changed) | ⚠️ OVERREACH | Jessica named 3 illustratively (cleared, re-dispatched, rate-changed) at 47:06. "Built" was added by the doc author. R4 flagged this. |
| 7 status labels "replace" v2 filter tabs                          | ⚠️ OVERREACH | Jessica confirmed these are her team's categories. She never said "replace the filter tabs." R4 flagged this.                         |

**Missing cross-cutting:** Builder assignment by company. Each builder sees/owns one shipper's loads. The dispatch desk needs a per-builder or per-company filter.

### CC#2: BOL as universal key

| Claim                         | Status        | Evidence                                                                                                                                                         |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BOL is the primary lookup key | ✅            | Both calls + both sheets + code audit.                                                                                                                           |
| Three load identifiers        | ❌ → **FOUR** | Invoice template reveals `Shipper # BOL` as a 4th identifier.                                                                                                    |
| PropX BOL field is reliable   | ❌            | Kati (follow-up 33:38): "sometimes it will have a load confirmed, but it has say the BOL and the BOL spot, it has the PO." PropX puts PO in BOL field sometimes. |

### CC#3: Comments / issue notes

| Claim                                               | Status       | Evidence                                                                                     |
| --------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| Cross-team scope (dispatcher writes, billing reads) | ⚠️ OVERREACH | One example from Jessica at 29:41. Not discussed in follow-up. Single-example extrapolation. |
| Comments tab in drawer                              | ⚠️           | Same single example. No one else asked for it.                                               |

---

## 5. Field / Data Model

### Confirmed fields:

| Field                                    | Status | Evidence                                             |
| ---------------------------------------- | ------ | ---------------------------------------------------- |
| `bolNo` = canonical BOL column           | ✅     | Jessica call 16:09 + code audit + collision decision |
| `ticketNo` drops in contract migration   | ✅     | Decision 2026-04-06                                  |
| `well` = destination                     | ✅     | Jessica call 18:15                                   |
| `loader`/`sandplant` = origin            | ✅     | Jessica call 18:15                                   |
| `Wt. Lb.` = pounds, tons computed        | ✅     | Both calls + invoice template ("Tons Conv.")         |
| `PO` = keep                              | ✅     | Jessica call                                         |
| `FSC` = keep (fuel surcharge now active) | ✅     | Jessica call 1:01:14                                 |

### New fields from invoice template:

| Field             | What it is                                                                                                                                         | Source                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `Shipper # BOL`   | Shipper's own BOL reference, separate from ES Express Ticket#                                                                                      | 🆕 Invoice template                     |
| `ES Express #`    | Human-assigned load number during PCS build. Jessica (follow-up 53:05): "That's the number that the girls fill that in when they build that load." | 🆕 Follow-up call                       |
| `Ac/per ton`      | Accessorial rate per ton                                                                                                                           | 🆕 Invoice template                     |
| `Amount Invoiced` | Total invoice amount (billing view)                                                                                                                | 🆕 Invoice template                     |
| `FSC/Mile`        | Fuel surcharge rate per mile                                                                                                                       | 🆕 Invoice template                     |
| `Tons Conv.`      | Explicitly "converted" tons (computed from Wt. Lb.)                                                                                                | 🆕 Naming confirmed by invoice template |

### Data quality issue:

PropX sometimes puts PO number in the BOL field. Kati (follow-up 33:38-34:25). The ML BOL classifier needs training to distinguish PO numbers from BOL numbers in the same field position.

---

## 6. Round 4 Priority Shifts

### Moves UP (new or reprioritized):

| Item                                            | Priority                   | Rationale                                                                                                                                                          |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Completion tracking ("built in PCS?" badge)** | 🆕 Should be P0 or high P1 | Builders' #1 independently-expressed pain. Scout 29:28 + Stephanie 41:06 both asked the same question independently. This is what makes the build workflow usable. |
| **PCS "arrive" step in the pipeline**           | 🆕 Model gap               | Jessica (follow-up 28:56). Missing from the entire lifecycle model.                                                                                                |
| **Duplicate BOL flagging**                      | 🆕 P1                      | Kati's explicit ask (follow-up 33:20). Data quality need.                                                                                                          |
| **Report parity (payroll report from v2)**      | 🆕 P1 for adoption         | Brittany (follow-up 57:19). Blocking for billing team.                                                                                                             |
| **PropX PO-in-BOL-field handling**              | 🆕 ML training             | Kati (follow-up 33:38). Upstream data quality issue.                                                                                                               |
| **Builder-company assignment filter**           | 🆕 P1                      | Load Count Sheet. Each builder needs to see their company's loads.                                                                                                 |
| **Phased rollout support (Jessica → builders)** | 🆕 P1                      | Follow-up call 15:04, 27:07. Validation page needs to handle single-user → multi-user transition.                                                                  |

### Moves DOWN:

| Item                                      | Was                          | Now                       | Rationale                                                                                   |
| ----------------------------------------- | ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| Keyboard navigation                       | Deferred (pending Stephanie) | **Confirmed deferred**    | Stephanie was on the follow-up call. She asked about completion tracking, not keyboard nav. |
| "What's new in v2" modal                  | P1                           | **Cut**                   | Neither call surfaced anyone asking for it. R3 recommended cut.                             |
| Both PropX + Logistiq clearing in Round 4 | P1 (both)                    | **PropX only in Round 4** | Team doesn't know Logistiq's field name. Ship one to validate the pattern.                  |

### Stays as planned:

| Item                                                   | Status | Notes                                                                 |
| ------------------------------------------------------ | ------ | --------------------------------------------------------------------- |
| Schema collapse + additive migration (P0 #1)           | ✅     | Nothing contradicts. Still the unblock.                               |
| Photo gate: `isTier1 = hasAllFieldMatches && hasPhoto` | ✅     | Both calls confirm.                                                   |
| Missed-load detection (revenue recovery)               | ✅     | Both calls describe the broken Friday ritual. ROI still unquantified. |
| Audit log on load drawer                               | ⚠️     | Single-source (Jessica call only). Ship MVP (2 event types per R3).   |
| Status colors from count-sheet legend                  | ✅     | Both calls confirm. Ship 4 of 7 per R3 MVP cut.                       |

---

## 7. Open Questions Resolution (v2 Part 9)

| #   | Question                              | Status                   | Answer                                                                                                                           |
| --- | ------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clearing race condition               | ⚠️ Confirmed, unresolved | Jessica (follow-up 23:48): "Sometimes I think we get them built before they're actually cleared." Race is real. No decision yet. |
| 2   | Logistiq's reconcileStatus equivalent | ❓ Still open            | Not answered in either call.                                                                                                     |
| 3   | JRT live-dispatching                  | ❓ Still open            | Keli handles JRT (load count sheet). JRT uses sheets. No new info.                                                               |
| 4   | Mystery bolNo field                   | ✅ Resolved              | Code audit: bolNo = direct BOL passthrough. Not a mystery.                                                                       |
| 5   | Demurrage rules per shipper           | ❓ Still open            | Jessica described complexity but no rules captured. Email pending.                                                               |
| 6   | Stephanie's keyboard workflow         | ✅ Resolved differently  | Stephanie was on follow-up call. Her priority is completion tracking (41:06), not keyboard nav.                                  |
| 7   | Katie's clearing walkthrough          | ⚠️ Partial               | Kati described fragments (PropX clearing, PO-in-BOL issue, v2 as cross-reference tool). Not a full step-by-step.                 |
| 8   | Logistiq login URL                    | ⚠️ Partial               | Jessica mentioned logistixiq.io/login in original call. Not reconfirmed.                                                         |
| 9   | Comment/issue notes scope             | ❓ Still open            | Not discussed in follow-up.                                                                                                      |
| 10  | Jodi/Jenny/Chitra role map            | ⚠️ Expanded              | Brittany Brown added. Jodi confirmed payroll. Jenny confirmed. Chitra still unclear.                                             |

**Score:** 2 fully resolved, 4 partially resolved, 4 still open.

---

## 8. New Items Discovered (not in v2 doc)

1. **Builder assignment by company** — Liberty→Scout, Logistix→Steph, JRT→Keli. Load Count Sheet + follow-up call.
2. **Kati Shaffer = CLEARER** (PropX + PCS, not a builder). Follow-up call.
3. **Brittany Brown = payroll/accounting**. Follow-up call.
4. **Jeri = Logistiq clearing**. Jessica call.
5. **Jessica (owner) ≠ Jessica Handlin (manager)**. Two Jessicas. Jessica call ~54:00.
6. **"Arrive" step in PCS after build**. Follow-up call 28:56.
7. **PCS clearing step** (distinct from PropX clearing). Follow-up call.
8. **Completion tracking** = builders' #1 pain. Follow-up call (Scout 29:28, Stephanie 41:06).
9. **Phased rollout: Jessica validates → builders take over**. Follow-up call 15:04, 27:07.
10. **"Ready to bill" vocabulary from Automatize/Logistiq**. Kati, follow-up call 30:46.
11. **PropX puts PO in BOL field sometimes**. Kati, follow-up call 33:38.
12. **Shipper # BOL = 4th load identifier**. Invoice template.
13. **ES Express # = human-assigned during PCS build**. Follow-up call 53:05.
14. **Payroll report parity needed** (PCS Reporter workflow). Follow-up call, Brittany.
15. **Dual-run with sheets go-live ~2026-04-14**. Follow-up call, Jessica 37:10.
16. **Automatize = a system with known vocabulary**. Follow-up call, Kati.
17. **Invoice sheet organized by TRUCK** (tab per truck). Invoice template + follow-up call 49:55.
18. **Load Count Sheet "Rate" column contains "Ticket Match"/"Ticket Mismatch"** — matching status in a rate column. Load Count Sheet CSV row 50-53.

---

## 9. Confirmed As-Is (no change needed)

These v2 doc claims are validated with no corrections:

- Photo gate rule: `isTier1 = hasAllFieldMatches && hasPhoto`
- Clearing is external to v2 (now expanded to PropX + PCS)
- Audit log preferred over chain/color-ownership pattern
- Missed-load detection = broken Friday ritual
- Weight in pounds, tons computed
- `bolNo` canonical, `ticketNo` drops (decided 2026-04-06)
- Validation is initially one person (Jessica) — correct for Phase 1
- Jodi depends on sheets for billing lookups
- Daily target editing NOT the admin blocker (demoted to P2)
- Bridge → REST → replacement three-phase framing (not contradicted)
- Search by BOL as primary lookup pattern
- Discoverability is a real gap (Scout didn't know about completion status, Stephanie didn't know about it either)

---

## 10. Reconciliation Verdict

**Plan A is producing usable signal.** The two transcripts + sheet artifacts + code audit resolve 2 open questions fully, 4 partially, and surface 18 new items. The v2 doc's substance (field corrections, photo gate, clearing-is-external, audit preference) is confirmed. What's wrong is:

- Role assignments (Kati = clearer, not builder)
- Coordination pattern (company assignment, not chain/color)
- Pipeline completeness (missing "arrive" step, missing PCS clearing, missing phased rollout)
- Builder priorities (completion tracking, not keyboard nav)
- Scope of clearing (two systems, not one)
- Team roster (Brittany, Jeri, two Jessicas)

**What remains unresolved and would need Plan B or more sessions:**

- Logistiq's reconcileStatus field name
- JRT live-dispatching specifics
- Demurrage rules per shipper
- Comment/issue notes scope
- Chitra's role
- Kati's full step-by-step clearing walkthrough (only fragments captured)

None of these unresolved items block Round 4 P0. They're all P1+ scope. **Plan A is sufficient to proceed.**

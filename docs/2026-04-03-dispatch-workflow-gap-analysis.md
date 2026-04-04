# ES Express v2 — Dispatch Workflow Gap Analysis & Next Session Brief

**Date:** 2026-04-03
**Purpose:** Comprehensive gap analysis between the manual dispatch workflow (PCS + Google Sheets + 7 apps) and what v2 currently provides. Use this document as context for fresh sessions.
**Status:** Research complete. Ready for implementation planning.

---

## Executive Summary

v2 has successfully replaced the **data viewing layer** — dispatchers can see loads, filter by well/date, validate matches, and track status. But the **data creation and dispatch execution layer** has significant gaps. The dispatchers' workflow isn't just "view loads and approve them" — it's "build loads, set rates, duplicate in batches, reconcile, assign drivers/trucks, arrive loads, import tickets, and track progress via color-coded spreadsheets across 7+ wells simultaneously."

**The core insight:** v2 is load-centric (one load at a time). Dispatchers are **batch-centric** (build 51 loads for one well, then 26 for another, tracking progress via color). Until v2 thinks in batches, the dispatchers will keep one eye on the spreadsheet.

---

## What's Working (Jessica's Weekend)

These are confirmed shipped and live at `app.esexpressllc.com`:

| Feature                         | What it does                                              |
| ------------------------------- | --------------------------------------------------------- |
| Date-filtered dispatch desk     | Shows loads for selected date (CDT), not all-time         |
| Validate from dispatch desk     | Click load row → expand → see fields + photo → validate   |
| Bulk validate (Shift+V)         | Select multiple loads, validate all at once               |
| Validated filter tab + counter  | Filter view to see what's been reviewed                   |
| Editable fields (PATCH)         | Click-to-edit driver, truck, carrier, weight, BOL, ticket |
| ExpandDrawer                    | Inline expansion with photo, fields, timeline, actions    |
| PhotoModal                      | Full-screen BOL viewer with editable info panel           |
| Missing Tickets tab (BOL Queue) | 947 loads without weight tickets surfaced                 |
| JotForm Submissions tab         | Raw JotForm data with match status                        |
| Presence indicators             | See who's working on which well                           |
| 9-column LoadRow grid           | Matches approved mockup layout                            |
| Code-split lazy routes          | Main chunk under 500KB                                    |

---

## What's Missing: The 10 Gaps

### Gap 1: Per-Load Rate Entry (CRITICAL)

**The pain:** Dispatchers manually enter rates per load (e.g., "$19.54/ton", "$14.58/ton") in both PCS and the billing spreadsheet. Every load has a different rate based on distance, product, and contract.

**v2 status:** The `rate` field exists in the loads table (`schema.ts:119`) but is:

- NOT in the `ALLOWED_FIELDS` set for PATCH updates (`loads.service.ts:64-73`)
- NOT returned by the dispatch desk query (`dispatch-desk.service.ts:140-167`)
- NOT shown in the UI (ExpandDrawer, LoadRow, PhotoModal)

**Fix:** Add `rate` and `mileage` to ALLOWED_FIELDS, include in dispatch desk SELECT, show in ExpandDrawer as editable field. Also add rate to the Finance per-load view.

---

### Gap 2: Load Duplication / Batch Creation (CRITICAL)

**The pain:** PCS workflow duplicates loads in batches of 5, 7, 26, 51 at a time for the same well with different dates. Stephanie says: "If I fix the date on the first one, apply to all X loads in this batch."

**v2 status:** No load duplication, cloning, or templating exists. No POST endpoint for creating loads. Loads only come from PropX/Logistiq sync.

**Fix:** Add `POST /dispatch/loads` for manual load creation. Add `POST /dispatch/loads/:id/duplicate` with batch count + date offset params. Frontend: "Duplicate (x)" button in ExpandDrawer.

---

### Gap 3: Daily Well Load Count Tracker (CRITICAL)

**The pain:** The "Load Count Sheet - Daily (Billing)" is a Google Sheet tracking loads per well per day with yellow highlighting. Dispatchers need to know: "How many loads do we need for this location today? How many are built? How many are queued?"

**v2 status:** `dailyTargetLoads` and `dailyTargetTons` fields exist in the wells table (`schema.ts:72-73`) but are not exposed in any UI or API. No per-well daily dashboard exists.

**Fix:** Add a daily load count endpoint. Show on Today's Objectives: "CHKLA 2513 H: 14/30 loads built (47%)". Add target progress bars to the well picker.

---

### Gap 4: Multi-Well Simultaneous View (HIGH)

**The pain:** Dispatchers work across 7+ Google Sheets workbooks simultaneously — each well has its own workbook with Dispatch Sheet, Jess' Copy, and Sheet30 tabs. They switch between wells constantly.

**v2 status:** Single-well selection only. Dispatch desk forces one well at a time.

**Fix:** Consider a split-view or tabbed-well mode where dispatchers can pin 2-3 wells and switch between them without losing context. Or: a unified "all wells" view with inline well grouping.

---

### Gap 5: PCS Dispatch Package Builder (HIGH)

**The pain:** PCS REST API expects 10-20+ fields per dispatch (driver details, truck/trailer locators, rate/lineHaulRate with type/matrix, pickup/delivery time windows, carrier details with SCAC/DOT#). v2's current `buildDispatchPackage()` sends only 6 fields.

**v2 status:** The SOAP bridge sends: companyObjectId, loadNumber, driverName, truckNumber, trailerNumber, status. The REST API models are generated (`/generated/pcs/dispatch-client/`) but not wired up.

**What PCS REST expects that v2 lacks:**

| Field        | PCS Expects                              | v2 Has                   |
| ------------ | ---------------------------------------- | ------------------------ |
| Rate         | rateType + rate + matrixId               | rate (numeric only)      |
| Driver       | firstName, lastName, middleInitial       | driverName (flat string) |
| CoDriver     | full coDriver block                      | Nothing                  |
| Carrier      | id, scac, name, city, state, mcId, dotId | carrierName (text only)  |
| Time windows | pickup/delivery date + timeIn + timeOut  | deliveredOn only         |
| Contact      | driverMobilePhone, contact               | Nothing                  |
| Trailer      | trailer1Locator (id + number)            | trailerNo (text only)    |

**Fix:** Build a proper REST dispatch package builder. Parse driverName into first/last. Map carrier names to SCAC codes. Add pickup/delivery time window fields. Gate: PCS OAuth keys from Kyle (hard blocker).

---

### Gap 6: Reconciliation / Arrive Status (MEDIUM)

**The pain:** PCS has discrete "Reconcile" and "Arrive Load" steps. Dispatchers track which loads are reconciled and which have been arrived.

**v2 status:** State machine has 14 statuses but no explicit "reconcile" or "arrive" gates. BOL reconciliation happens in the Verification plugin (separate from dispatch). The state machine jumps: `pending → assigned → dispatch_ready → dispatching → dispatched`.

**Fix:** Consider adding `reconciled` status between `assigned` and `dispatch_ready`. Or: enforce that BOL reconciliation is complete before allowing transition to `dispatch_ready`.

---

### Gap 7: Color-Coding / Team Coordination (MEDIUM)

**The pain:** Each dispatcher assigns their own color to rows. Stephanie uses blue, Scout uses yellow. Jessica sees colors and knows who's working on what, what's done, what's queued. "After I build it, I turn it a color, and Katie knows she can go clear."

**v2 status:** Assignment has `assignedTo` (user ID) but no visual per-user color. LoadRow uses fixed colors for validation status (green/amber/red) but doesn't show who's working on each load.

**Fix:** Add operator color assignment (already in design spec: `OperatorPresence` component). Show colored dot or left-border on LoadRow indicating the assigned dispatcher. When Jessica filters by "assigned to Stephanie", show Stephanie's loads in her color.

---

### Gap 8: PCS Photo Upload Integration (MEDIUM)

**The pain:** Steps 173-183 show downloading a ticket from PropX, then importing the image INTO PCS via the "Import Image" dialog. v2 stores photos in GCS but doesn't push them to PCS.

**v2 status:** `pcsUploaded` boolean exists in photos table (`schema.ts:266`) but is never set to true. The PCS REST API has `POST /load/{loadId}/attachments/ScaleTicket` for multipart upload.

**Fix:** After dispatch, auto-upload matched JotForm photos to PCS via the attachment endpoint. Set `pcsUploaded = true` on success.

---

### Gap 9: Manual Load Entry (MEDIUM)

**The pain:** Some loads aren't in PropX or Logistiq — they're created manually in PCS from scratch (Setup New Load → Stop Info → Rate Load). Dispatchers need to be able to add loads that don't exist in the sync sources.

**v2 status:** No `POST /dispatch/loads` endpoint. Loads only come from sync.

**Fix:** Add manual load creation endpoint + UI. Minimal fields: loadNo, driverName, wellId, deliveredOn, rate. Auto-create assignment.

---

### Gap 10: CSV/Spreadsheet Field Coverage (LOW-MEDIUM)

**Dispatchers track 41 fields in their CSV templates. v2 shows 23.**

Key missing fields from the dispatch templates:

- **Demurrage** (Total Demurrage, Loading Demurrage Reasons)
- **Financial** (Rate/Ton, LINE HAUL, Demurrage, Total Load, FSC)
- **Timeline** (Load In, Load Out, Load Time, ETA, Unload Appt, Unload In, Unload Out, Unload Time)
- **Identity** (Invoice #, PO#, ES Express #, Hairpin Express #)
- **Operations** (Loader, Shipper # BOL, Settlement Date)

Most of these exist in the PropX `rawData` JSON but aren't surfaced in the UI.

**Fix:** Extract key fields from rawData and show in ExpandDrawer. Priority: Rate/Ton, Load In/Out times, Invoice #.

---

## The Dispatcher's Mental Model (What v2 Must Feel Like)

### Current mental model (Google Sheets):

```
Morning: Check load count sheet → How many loads per well today?
         Open each well's workbook → Dispatch Sheet tab
         Color-code my rows → Build in PCS via RDP
         Rate each load → Mark built with my color
         Switch to Jess' Copy → Paste for billing
         Switch to Load Count → Enter daily totals
```

### Target mental model (v2):

```
Morning: Open Today's Objectives → See load counts per well (target vs actual)
         Click into well → See all loads, validated in green
         Click "Build All Ready" → System dispatches to PCS
         Loads auto-arrive, photos auto-upload
         Finance page shows billing automatically
```

### Transition mental model (this weekend + Monday):

```
Jessica: Open dispatch desk → Filter by date (4/3, 4/4, 4/5)
         Click well → See loads with photos
         Validate each one → Bulk validate 100% matches
         "Validated" filter shows Stephanie what's ready
Stephanie: Open dispatch desk → Filter "Validated"
           Expand load → Copy fields → Enter in PCS (clipboard bridge)
           Mark as entered → Track with PCS starting #
```

---

## "I Didn't Know I Needed This" Features

Based on dispatcher pain points from workflow sessions:

1. **Smart Date Batch** — "If I fix the date on the first one, apply to all loads in this batch." v2 could offer: select 10 loads → set delivered date → apply to all.

2. **Visual Date Conflict Highlighter** — Auto-flag when Load In/Out dates don't align with Unload dates. Stephanie: "Currently I have to manually glance and worry I missed one."

3. **Load Readiness Pipeline** — Visual pipeline: Queued → Built → Ready for QA → Cleared → Dispatched. Replaces the color-coding system with structured status tracking.

4. **One-Click BOL Verification** — Auto-pull last-4 digits of BOL from weight ticket photo, compare to load. Stephanie: "I look at the last four digits of the BOL number, make sure that matches."

5. **Keyboard-First Copy** — Stephanie uses custom mouse buttons to copy BOL → paste into PCS. v2's ExpandDrawer should have per-field copy buttons (already in DispatchCard pattern).

6. **Daily Target Dashboard** — "How many loads do we need for this sand plant today? How many are built?" Show target vs actual as a progress indicator on the well picker.

7. **New Dispatcher Training Mode** — Stephanie trains new people but they forget save patterns. Field-level validation hints ("Tab to save" → automatic save on blur in v2).

8. **Demurrage Calculator** — Most dispatchers doing it offline. Could auto-calculate from Rate/Ton × Weight × Miles.

---

## PCS Constraint Summary

| Constraint                                         | Impact                                                    |
| -------------------------------------------------- | --------------------------------------------------------- |
| POST-only dispatch (no PATCH)                      | Every field must be correct before dispatch               |
| No attachment download (GET returns metadata only) | JotForm is the only photo source                          |
| Auth keys don't exist yet                          | No REST API testing until Kyle provides OAuth credentials |
| Names work directly (no entity ID lookup)          | Simplifies dispatch package vs old SOAP bridge            |
| Hairpin entity exists in PCS                       | No migration needed                                       |
| BOL/LoadReference is PATCHable after dispatch      | Only field we CAN update post-dispatch                    |

---

## File Reference for Implementation

| Area                   | File                                                                     | What to change                          |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| Rate editing           | `backend/src/plugins/dispatch/services/loads.service.ts:64-73`           | Add `rate`, `mileage` to ALLOWED_FIELDS |
| Rate in dispatch desk  | `backend/src/plugins/dispatch/services/dispatch-desk.service.ts:140-167` | Add rate to SELECT                      |
| State machine          | `backend/src/plugins/dispatch/lib/state-machine.ts`                      | Consider adding `reconciled` status     |
| PCS dispatch builder   | `backend/src/plugins/pcs/services/pcs-soap.service.ts:295-328`           | Rebuild for REST API                    |
| Generated PCS models   | `backend/src/generated/pcs/dispatch-client/src/models/`                  | Reference for REST payload              |
| Well daily targets     | `backend/src/db/schema.ts:72-73`                                         | Fields exist, need endpoint + UI        |
| Load creation          | `backend/src/plugins/dispatch/routes/loads.ts`                           | Add POST endpoint                       |
| Photo PCS upload       | `backend/src/db/schema.ts:266`                                           | Wire pcsUploaded flag                   |
| ExpandDrawer fields    | `frontend/src/components/ExpandDrawer.tsx`                               | Add rate, mileage, copy buttons         |
| LoadRow colors         | `frontend/src/components/LoadRow.tsx:28-50`                              | Add assignedTo color indicator          |
| Dispatch template CSVs | `EsExpress/docs/recordings and example material for context/*.csv`       | Ground truth for field coverage         |

---

## Session Handoff Checklist

When starting a fresh session with this doc:

1. **Read this doc** — it has the full gap analysis
2. **Check `project_jess_weekend_golive.md`** in memory — timeline context
3. **Check `project_jess_meeting_overhaul.md`** in memory — UI overhaul status
4. **Prioritize by blocker status:**
   - Rate entry → immediate (dispatchers need this daily)
   - Load count tracker → immediate (Jessica's primary dashboard)
   - Load duplication → high (enables batch workflow)
   - PCS REST builder → blocked on Kyle's OAuth keys
5. **The mockup is at** `frontend/mockups-jess-meeting.html` — source of truth for visual design
6. **The design spec is at** `frontend/2026_03_31_v2_frontend_design.md` — architecture reference
7. **The ScribeHow analysis is at** `EsExpress/docs/2026-03-31-scribehow-workflow-analysis.md` — pain point quantification

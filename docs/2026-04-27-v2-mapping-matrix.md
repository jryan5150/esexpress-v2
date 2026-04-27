# v2 Mapping Matrix — Current-State Survey

> Generated 2026-04-27 from code in `backend/src/`. All claims sourced to file:line.
> Survey only — no fixes proposed. Flags `[!]` mark contradictions with CLAUDE.md / memory.

## 1. Data Flow Diagram

```
                        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
SOURCES                 │   PropX API  │  │ Logistiq API │  │   JotForm    │
                        │ (loads+phot.)│  │ (carrier exp)│  │ (driver subm)│
                        └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                               │                 │                 │
                  ┌────────────┼─────────────────┼─────────────────┼────────────┐
                  │            ▼                 ▼                 ▼            │
SCHEDULER         │  04:00 daily / 4h refresh  04:15 / 4h        */30 min      │
(scheduler.ts:50- │  syncPropxLoads()          syncLogistiqLoads jot syncWeight│
 188)             │                                              Tickets()      │
                  └────────────┬─────────────────┬─────────────────┬────────────┘
                               │                 │                 │
                               ▼                 ▼                 ▼
                        ┌────────────────────────────────────────────────┐
V2 CANONICAL            │  loads (source, source_id) UNIQUE              │
                        │  + photos (PropX ticket-image URL)             │
                        │  + jotform_imports (driver photo+typed fields) │
                        │  + bol_submissions (Vision-OCR extraction)     │
                        └────────────────────┬───────────────────────────┘
                                             │ 04:30 + 4h refresh
                                             ▼
DISPATCH MAPPING        ┌─────────────────────────────────────┐
                        │  auto-mapper: processLoadBatch()    │
                        │  load.destination_name → well       │
                        │  → assignments (well_id, load_id)   │
                        └────────────────────┬────────────────┘
                                             │
                                             ▼
RECONCILIATION          ┌─────────────────────────────────────┐
                        │  reconciliation.service.autoMatch() │
                        │  bol_submission ↔ load (3-tier)     │
                        │  → discrepancies on bolSubmissions  │
                        └────────────────────┬────────────────┘
                                             │
                          ┌──────────────────┴──────────────────┐
                          ▼                                     ▼
EXTERNAL TRUTH       ┌────────────────────────┐         ┌────────────────────────┐
(read-only           │ Google Sheets          │         │ PCS (Premier Carriers) │
 from v2's pov)      │ - Load Count Sheet     │         │ - Single tenant 138936 │
                     │ - Master Dispatch      │◀────────│ - 15-min sync, READ    │
                     │   (Driver Codes,       │         │ - bridge by ticket_no  │
                     │    Sand Tracking)      │         │ - discrepancy writer   │
                     │ */30m sheet sync       │         │ - PUSH paused (per     │
                     │ pulls TEAM truth INTO  │         │   PCS-pivot memory)    │
                     │ v2 for parity check    │         │                        │
                     └────────────────────────┘         └────────────────────────┘
```

**Cron schedule (scheduler.ts:46-188, TZ America/Chicago):**

| Cron                 | Job                             | Window                                           |
| -------------------- | ------------------------------- | ------------------------------------------------ |
| `0 4 * * *`          | PropX sync                      | 7-day backfill (scheduler.ts:51)                 |
| `15 4 * * *`         | Logistiq sync                   | 7-day backfill (scheduler.ts:56)                 |
| `30 4 * * *`         | Auto-map                        | unmapped loads, 30d (scheduler.ts:61)            |
| `45 4 * * *`         | Master Dispatch sheets sync     | Driver Codes + Sand Tracking (scheduler.ts:156)  |
| `0 8,12,16,20 * * *` | PropX+Logistiq+Auto-map refresh | 2-day window (scheduler.ts:67-75)                |
| `*/30 * * * *`       | JotForm photo sync              | last 200 submissions (scheduler.ts:80)           |
| `*/15 * * * *`       | PCS sync                        | 3-day window (scheduler.ts:91-118)               |
| `*/30 6-22 * * *`    | Sheet load count sync + parity  | rolling Current+Previous tabs (scheduler.ts:126) |

**Source `manual` (per LOAD_SOURCES enum, schema.ts:153):** declared but **no ingestion service in code reads it.** Manual loads exist as a row-creation path (admin/dispatcher routes) — not a sync pipeline. JRT loads come in via Logistiq's carrier export, not a JRT-specific source. **[!]** This contradicts the user's mental model of "manual (JRT, etc)" — JRT is a carrier name, not a source.

---

## 2. Source Field Mapping Matrix

### 2a. PropX → loads

Source: `backend/src/plugins/ingestion/services/propx-sync.service.ts:481-554` (normalizeFromPropx).

| PropX field (raw)                                             | v2 column                                      | Notes                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `load_no` / `loadNo` / `load_number` / `propx_load_id` / `id` | `loadNo`                                       | First non-null wins (propx-sync.service.ts:506-512)                             |
| `propx_load_id` / `id`                                        | `sourceId`                                     | (propx-sync.service.ts:514)                                                     |
| `driver_name` / `driverName`                                  | `driverName`                                   | extractString cascade (:515)                                                    |
| `truck_no` / `truckNo` / `truck_number`                       | `truckNo`                                      | (:517)                                                                          |
| `terminal_name` / `terminalName` / `origin_name`              | `originName`                                   | terminal_name preferred (:529-536)                                              |
| `destination_name`                                            | `destinationName`                              | (:537)                                                                          |
| WEIGHT_ALIASES (21 variants, propx-sync.service.ts:51-73)     | `weightLbs` (raw lbs), `weightTons` (lbs/2000) | Searches direct + nested `ticket/scale/billing/details/weights/distances` paths |
| `bol_no`                                                      | `bolNo`                                        | (:543)                                                                          |
| `ticket_no`                                                   | `ticketNo`                                     | (:548)                                                                          |
| `delivered_on`                                                | `deliveredOn`                                  | new Date(), null if NaN                                                         |
| (everything raw)                                              | `rawData` jsonb                                | (:552)                                                                          |

**PropX gates / quirks:**

- Schema-drift detector compares incoming keys against 200+ known fields. Drift logs warning but does NOT block the row.
- **FINALIZED_STATUSES skip:** `Delivered/Canceled/Cancelled/Transfered/Transferred` already-existing rows are NEVER overwritten. PropX-side late corrections after delivery are invisible to v2.
- **Photo materialization:** for every upserted load with a `ticketNo`, a `photos` row is inserted with `source='propx'` and `sourceUrl=PropX /loads/{id}/ticket_image`. Idempotent.

### 2b. Logistiq → loads

Source: `backend/src/plugins/ingestion/services/logistiq-sync.service.ts:512-671`.

| Logistiq field (raw)                                     | v2 column                                           | Notes                                                                       |
| -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `load_no` / `Load #` / `loadNo` (40+ aliases)            | `loadNo`                                            | COLUMN_ALIASES map (:84-256)                                                |
| `bol` (lowercase!) / `bol_no` / `BOL` / `bolNo`          | `bolNo`                                             | **`bol` lowercase added 2026-04-27** — was the root cause of 1,023 dup rows |
| `order_no` / `orderNo` / `order_id`                      | `orderNo`                                           | order_id added — verified stable across billing-state transitions           |
| `sand_ticket_no` / `uic_ticket_number` / `ticket_no`     | `ticketNo`                                          | (:649-657)                                                                  |
| Direct ton fields (`tons`, `ton`, `tonnage`)             | `weightTons`                                        | Preferred over lbs conversion                                               |
| `weight_lbs` / `weight` / `wt`                           | `weightLbs` (raw), `weightTons` (lbs/2000 fallback) |                                                                             |
| `completed_at` / `delivered_on` / `expected_pickup_time` | `deliveredOn`                                       | priority order                                                              |
| `destination_name` / `well_site_name`                    | `destinationName`                                   |                                                                             |
| (everything raw)                                         | `rawData` jsonb                                     |                                                                             |

**`generateSourceId()` cascade (post-fix today, commit 2f99186):**

1. `lgx-{loadNo}-{orderNo}` if both present
2. `lgx-order-{orderNo}` (orderNo alone is stable) — NEW today
3. `lgx-bol-{bolNo}` (with `bol` lookup) — FIXED today
4. `lgx-ticket-{ticketNo}` (with `sand_ticket_no` lookup) — extended today
5. `lgx-ref-{referenceNo}`
6. **`lgx-unknown-{sha1(JSON.stringify(raw)).slice(0,12)}` — UNSTABLE FALLBACK still in code.** Future unknown field names will silently produce dup rows.

**Cross-source conflict detection (logistiq-sync.service.ts:930-1011):** for each new Logistiq load, looks up a PropX match by `loadNo + orderNo + delivered_on±1day`. If matched, writes `ingestion_conflicts` row with field-level discrepancies.

### 2c. JotForm → bol_submissions + jotform_imports

Source: `jotform.service.ts:177-297`.

| JotForm answer.type  | Field heuristic                        | Extracted field                  |
| -------------------- | -------------------------------------- | -------------------------------- |
| `control_fullname`   | (any)                                  | `driverName`                     |
| `control_textbox`    | label contains `truck`                 | `truckNo`                        |
| `control_textbox`    | label contains `bol`/`bill`/`ticket`   | `bolNo`                          |
| `control_textbox`    | label contains `load number`/`load no` | `loadNo`                         |
| `control_textbox`    | label contains `weight`/`lbs`/`tons`   | `weight`                         |
| `control_fileupload` | (any)                                  | `imageUrls[]` (allowlist filter) |

**Vision pipeline:** if `ANTHROPIC_API_KEY` env present, calls Claude Vision on photos. Vision-extracted fields **override driver-typed when present**, gated through `validateTicketNumber` for the BOL field.

### 2d. Sheet (Load Count) → sheet_load_count_snapshots

| Sheet column        | v2 column                                                               |
| ------------------- | ----------------------------------------------------------------------- |
| Col A "Well Name"   | `wellName` (null = Balance Total aggregate row)                         |
| Col B "Bill To"     | `billTo`                                                                |
| Cols C-I (Sun..Sat) | `sunCount` ... `satCount`                                               |
| Col J (week total)  | `weekTotal`                                                             |
| "Total Built"       | `totalBuilt` ← **THE truth number**                                     |
| "Discrepancy"       | `discrepancy` (their hand calc) — **captured but NEVER compared by v2** |

### 2e. Sheet (Master Dispatch) → driver_roster + sand_jobs

**driver_roster** (Driver Codes tab): Tractor, Trailer, Driver Code, Driver Name, Company, Notes.
**sand_jobs** (Sand Tracking tab): PO #, Location Code, Coordinates, Closest City, Sand Type, Loading Facility, Company.

---

## 3. Canonical Entities + Relationships

### Core graph

```
                 carriers ── (FK) ── wells.carrierId
                                          │ (PK id)
                                          ▼
                                     ┌────────────────┐
                                     │     wells      │
                                     │ name UNIQUE    │
                                     │ aliases[]      │
                                     │ matchFeedback  │
                                     └────┬───────────┘
                                          │ wellId (FK)
                                          ▼
   loads (id) ◀──── loadId ────── assignments ─── status_history[]
       │                          handlerStage  uncertain_reasons[]
       │                          autoMapTier   matchAudit
       │                          photoStatus   pcsNumber
       │
       ├──── photos (loadId)
       ├──── jotformImports (matchedLoadId)
       ├──── bolSubmissions (matchedLoadId) ──── ai_extracted_data
       ├──── ingestionConflicts (propxLoadId, logistiqLoadId)
       ├──── matchDecisions (loadId, assignmentId)
       ├──── discrepancies (loadId, assignmentId)
       ├──── loadComments
       └──── paymentBatchLoads (M:N → paymentBatches)

   locationMappings.sourceName (UNIQUE) → wellId    # destination_name → well
   customerMappings.sourceName (UNIQUE) → canonical
   driverCrossrefs.sourceName  (UNIQUE) → canonical
   builderRouting (builderName, customerId) → who-owns-which-customer

   driverRoster (from Master Dispatch sheet) — Tier 3 fallback
   sandJobs     (from Master Dispatch sheet) — PO → location lookup
```

### Sheet/PCS mirror tables

- `sheetLoadCountSnapshots` — per (sid, tab, weekStart, wellName) UNIQUE
- `sheetWellStatus` — paint workflow color → WORKFLOW_STATUSES enum
- `pcsLoadHistory` — bulk Q1 extract from flywheel.duckdb
- `discrepancies` — productized cross-check writer

---

## 4. Matching Rules

### 4a. auto-mapper.service.ts → load.destinationName ↔ wells

Trigger: cron @ 04:30 + 4h refresh slots. Picks unmapped loads from last 30 days where `historical_complete = false`.

**Per-load processing:**

1. **Confirmed-mapping fast path:** `location_mappings.source_name` matches AND `confirmed=true` → Tier 1.
2. Otherwise call `scoreSuggestions()`.
3. **Initial tier from `classifyTier()`:**
   - Tier 1: matchType ∈ `{propx_job_id, exact_name, exact_alias, confirmed_mapping}`
   - Tier 2: score > 0.5
   - Tier 3: else
4. **Anti-hallucination demotions:** `applyFuzzyNeverAlone`, `applyTwoIdentifierRule`, `applyConfidenceFloor`, `computeCrossSourceBoost`.
5. **Auto-promote (`tryAutoPromote`):** if Tier 1 + photo attached + load not terminal upstream, promote `handler_stage` from `uncertain` → `ready_to_build`. **[!] CLAUDE.md says feature-flagged off; code shows always-on.**

### 4b. JotForm submission ↔ load (3-tier cascade)

- **Tier 1 — ticket_no/bol_no exact:** confidence=95
- **Tier 2 — load_no:** confidence=85
- **Tier 3 — driver+date(±1d)+weight(±5%):** 65-72
- Multi-hit broken by `ORDER BY deliveredOn DESC` — biases to most recent

### 4c. BOL submission ↔ load (reconciliation.service.ts)

Same 3-tier shape with confidence 95/85/60-70.

### 4d. Match scorer — score in [0,1]

DEFAULT_CONFIG weights:
| Feature | Weight |
|---|---|
| bolMatch | 0.20 |
| weightDeltaPct | 0.10 |
| hasPhoto | 0.10 |
| driverSimilarity | 0.08 |
| autoMapTier | 0.08 |
| wellAssigned | 0.08 |
| ocrOverallConfidence | 0.05 |
| ... 7 more | ... |

Tier label: `>=0.80 high`, `>=0.60 medium`, `>=0.40 low`, else `uncertain`.

`wellAssigned=false` is "load-blocking" — encoded as value `-2.5`.

### 4e. Persistence: match_decisions

Every human action writes `featuresSnapshot` jsonb + `scoreBefore/After` + `tierBefore/After`. Action labels: `advance:<stage>`, `route:<action>`, `flag_back`, `bulk_confirm`. **Last write was 2026-04-21 — table stale since then.**

---

## 5. Lifecycle / Status Rules

### Three orthogonal status fields per assignment

**A. `assignment.status`** (14 values): `pending, assigned, reconciled, dispatch_ready, dispatching, dispatched, in_transit, at_terminal, loaded, at_destination, delivered, completed, cancelled, failed`. **No transition state machine — set ad-hoc.** Default=`pending`.

**B. `assignment.handlerStage`** (5 values): `uncertain, ready_to_build, building, entered, cleared`. The dispatch workflow paint stage. Default=`uncertain`.

**C. `assignment.photoStatus`** (3 values): `attached, pending, missing`. Default=`missing`. **Gotcha: never write `"matched"`.**

**D. `loads.status`** — free text, no enum. Stores upstream PropX/Logistiq status verbatim.

**E. `bolSubmissions.status`** (7 values): `pending, extracting, extracted, confirmed, matched, discrepancy, failed`.

**F. WORKFLOW_STATUSES** (10 values, sheet-color enum): NOT used as a v2 lifecycle state for assignments. **[!] Not bridged to handler_stage in code — sheet color and v2 stage are separate vocabularies.**

---

## 6. Reconciliation Rules — what's a discrepancy?

Source: `reconciliation.service.ts:145-238`.

Compares a single `bol_submission.aiExtractedData` against the matched `load` row.

| Field             | Detection                    | Severity                   |
| ----------------- | ---------------------------- | -------------------------- |
| **weight**        | abs % diff vs load weight    | >10% critical, >5% warning |
| **ticket_no**     | strict `!==`                 | warning                    |
| **delivery_date** | `Math.abs(diff) / day > 1.0` | warning                    |
| **driver_name**   | substring containment fail   | info                       |

Reconciliation status: empty → `reconciled`, any critical → `critical_discrepancy`, any warning → `needs_review`, info-only → `reconciled`.

### Cross-source ingestion conflict (PropX vs Logistiq)

Different from BOL-vs-load. Compares same physical load matched by `loadNo + orderNo + delivered_on±1day`.

| Field                             | Mode       | Critical | Warning |
| --------------------------------- | ---------- | -------- | ------- |
| weightTons                        | percent    | >10%     | >5%     |
| rate                              | absolute $ | >$100    | >$10    |
| driverName, carrierName, ticketNo | string     | —        | warning |

### Cross-check writer (10 discrepancy types)

PCS-driven: `status_drift, weight_drift, well_mismatch, photo_gap, rate_drift, orphan_destination`
Sheet-driven: `sheet_vs_v2_week_count, sheet_vs_v2_well_count, sheet_status_drift, sheet_cell_count_drift`

Open rows uniquely keyed on (subjectKey, type) WHERE resolved_at IS NULL. Same row updated on re-detection.

---

## 7. Sheet Recon Rules

Source: `loadcount-sync.service.ts:464-612` (`computeWeekParity`).

**Per Balance-row snapshot:**

1. Pull v2 loads where `delivered_on` ∈ [weekStart 00:00 -05:00, weekEnd 23:59:59 -05:00].
2. **Dedup** loads via composite key set: `bol:{bolNo}` OR `tk:{ticketNo}` OR `dt:{driver}|{15-min-bucket}`.
3. `delta = v2UniqueCount - sheetTotalBuilt`.
4. `withinThreshold` if `|delta| <= 5` (constant).
5. If outside, write `discrepancy` row (`type=sheet_vs_v2_week_count`):
   - severity: `>50 critical, >20 warning, else info`
   - subjectKey = `sheet-week:{spreadsheetId}:{weekStart}`

**v2 considers "Total Built" = sheet's column T** as truth baseline.

**[!] Sheet's own Discrepancy (col U)** is captured into `metadata.sheetDiscrepancyOnTheirSide` but NEVER compared. v2 builds its own delta independently. **Could be a third reconciliation signal.**

**Encoded mappings (sheet → v2):**
| Sheet | v2 |
|---|---|
| "Well Name" | `wellName` (string only — NO FK to wells.id) |
| "Total Built" | `totalBuilt` (truth baseline) |
| Color | `sheet_well_status.status` enum |
| Master Dispatch "Driver Name" | `driver_roster.driverName` (NOT linked to `loads.driverName`) |
| Master Dispatch "PO #" | `sand_jobs.poNumber` (NOT linked to `loads.orderNo`) |

---

## 8. Open Assumptions and Gaps

Numbered for reference. Each is either a code-level admission (TODO/comment) or a logic divergence from CLAUDE.md/memory.

1. **`generateSourceId` hash fallback unstable** — fixed today by adding `bol`+`order_id` lookups, but the hash branch retained. Future unknown sources will silently dup.
2. **Auto-mapper system user hardcoded to ID 1** (jryan) — comment notes that `user_id=0` made every scheduled auto-map silently skip every load before fix.
3. **[!] Auto-promote NOT feature-flagged** — CLAUDE.md says off, code shows always-on Tier-1+photo+not-cleared promotion. **Worth asking Jess if she's seeing surprise promotions.**
4. **PropX skips finalized loads** — once Delivered/Cancelled, NEVER overwritten. Late upstream corrections invisible.
5. **PropX "PO in BOL field"** — known issue. Matcher trusts it anyway in Tier 1.
6. **JotForm Tier 1 multi-hit picks "most recently delivered"** — admitted compromise per code comment.
7. **Reconciliation Tier 3 weight tolerance is 5% but warning threshold is 5%** — asymmetric, near-threshold issues could be masked.
8. **Driver name = substring containment** — "Smith" matches "John Smith" AND "Smithson". Doesn't use `driver_crossrefs` canonical resolution at this point.
9. **No "manual" source ingest in code** despite the enum value. JRT comes via Logistiq's carrier export. **[!] User's mental model needs adjustment.**
10. **WORKFLOW_STATUSES (sheet, 10 values) and HANDLER_STAGES (v2, 5 values) are NOT bridged in code.**
11. **Sheet recon -05:00 offset hardcoded** — DST will produce ±1h boundary drift twice a year.
12. **`wells` table linkage to sheet's "Well Name" is by string, not ID.** Renaming a well in v2 wouldn't update sheet snapshots.
13. **`raw_data.cleared_at` is the only "upstream cleared" signal** the auto-promote gate checks. PropX may emit clearing under different keys.
14. **`discrepancies.subject_key` is opaque text** — typo or format drift would silently create parallel "open" rows.
15. **Two PostgreSQL services trap** — production has phantom `Postgres-gywY` (11 rows) alongside real `Postgres` (55K loads).
16. **[!] Sheet's "Discrepancy" column read but never compared.** Captured for cross-reference but v2 only computes its own delta.
17. **`historical_complete` flag** definition lives in `dispatch/lib/historical-classifier.js` — not surveyed. Worth re-reading before claiming what "won't appear" in validation.

---

_End of survey. All claims grounded to file:line. No fixes proposed._

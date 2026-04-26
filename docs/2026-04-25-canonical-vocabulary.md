# Canonical Vocabulary — ES Express Operations

**Captured:** 2026-04-25 evening | **Status:** authoritative for v2 development | **Source:** operator-defined six roles, expanded with codebase audit | **Revision:** v2 (corrected after schema sweep)

---

## The trap (why this document exists)

Tonight's PCS warehouse pull surfaced a real problem in v2's mental model: **the codebase keeps collapsing customer ↔ carrier ↔ source ↔ builder-company into a single column or single mental model.** Liberty appears as:

- A **PropX feed** (source — where v2 learned about the load)
- A **Liberty customer** (PCS field — who pays the bill)
- An **ES Express carrier** (real-world role — who hauls)
- A **Scout-managed account** (workflow — who in the dispatch team owns it)

All four are true. None is interchangeable with the others. Until tonight, v2 conflated them, which is why the matcher's "customer" inferences were unreliable, why the "by source" reports didn't equal "by customer" totals, and why the team kept asking "which Liberty are you talking about?"

This document defines the **twelve canonical roles** every load carries, which fields in which tables represent them, and where v2 currently falls short.

---

## The data-flow rule (anchor for everything below)

```
Sources (PropX, Logistiq, JotForm, BOL OCR, Manual)
         ↓
Sheet (Load Count Sheet column headers = canonical team vocabulary)
         ↓
PCS (fields are downstream representations of what's on the sheet)
```

**The sheet is the truth-bridge.** Its column headers are the team's actual mental model — built by Jess, used daily for 4+ years. v2 should mirror those header names verbatim in UI labels, not invent new ones. Where v2 has internal terms that don't appear on the sheet (Operator, Job, Pad), surface them as engineering metadata, not as primary labels.

## The fourteen roles

After auditing v2's schema AND the Load Count Sheet (`docs/2026-04-25-load-count-sheet-analysis.md`), there are 14 discrete roles. The first six were operator-defined; six more came from schema audit; two more (Workflow Status, Job Category) came from the sheet itself.

| #   | Role            | Sheet label / where it lives                                         | One-line definition                                                  |
| --- | --------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Customer        | "Bill To" (col B on Current/Previous)                                | Who pays the bill (PCS billTo)                                       |
| 2   | Carrier         | (NOT on sheet — implicit ES Express; JRT inferred via builder=Keli)  | Who physically hauls the load (owns the truck)                       |
| 3   | Shipper         | (NOT on sheet — sheet is well-centric)                               | Where the load picks up (sandplant / loader)                         |
| 4   | Consignee       | "Well Name" (col A — they say WELL not consignee)                    | Where the load delivers (the well being fracked)                     |
| 5   | Builder         | "Order of Invoicing" matrix at bottom (Scout/Steph/Keli/Crystal)     | Dispatch-team person who owns the workflow                           |
| 6   | Source / Feed   | (v2-internal — not on sheet)                                         | Where v2 learned about the load                                      |
| 7   | Driver          | Master Dispatch → "Driver Codes" tab                                 | The human who hauls the load                                         |
| 8   | Truck / Trailer | Master Dispatch → "Driver Codes" tab (Tractor/Trailer per driver)    | The equipment used                                                   |
| 9   | Operator        | (NOT on sheet — embedded in well name as prefix)                     | The oil & gas company that owns/operates the well                    |
| 10  | Job             | (PropX-internal — not on sheet)                                      | PropX's grouping of loads under one work order                       |
| 11  | Product         | "Sand Tracking" tab (Master Dispatch)                                | What's being hauled (sand grade — 100 mesh, 40/70)                   |
| 12  | Pad / Site      | (Encoded in well name — "Wells 1/2/3", "1HU/2HU/3HU")                | The physical site that may contain multiple wells                    |
| 13  | Workflow Status | **Cell BACKGROUND COLOR** — 8-stage paint pipeline + exception state | What stage the load is at in the dispatch→cleared→invoiced pipeline  |
| 14  | Job Category    | "Other Jobs to be Invoiced (Jenny)" section                          | Non-standard work category (Truck Pusher, Equipment Move, Frac Chem) |

**Two roles I had wrong before this rev:**

- I had Crystal absent — she's the **fourth builder** (~300 loads/week, ~25% of throughput). She's a floater (no fixed customer pairing per the sheet).
- I had Operator listed as a primary role. The sheet doesn't track operator. v2 has it internally (Apache/Comstock/Chesapeake) but the team's primary view is well-name; operator is engineering metadata.

Each role is detailed below with sheet labels and v2 storage state.

---

### 1. Customer — who pays the bill

The entity ES Express invoices. PCS calls this `customerName` / `billToName`.

| Customer (PCS billTo)        | Q1 2026 PCS loads | v2 ingest path                  |
| ---------------------------- | ----------------: | ------------------------------- |
| Liberty Energy Services, LLC |            12,362 | PropX feed                      |
| Logistix IQ                  |               639 | Logistiq feed                   |
| JRT Trucking Inc             |               447 | (none — read from PCS, Phase 2) |
| Signal Peak                  |                58 | (none — confirm with team)      |
| Premier Pressure Pumping     |                 8 | (none — confirm with team)      |
| Finoric                      |                 1 | (none — trivial)                |

**v2 storage:**

- `loads.customer_name` text — exists, but is the raw source value, not normalized
- `customer_mappings` table (`source_name` → `canonical_name`, `confirmed` boolean) — naming bridge for customer aliases. **Underused** — only ~handful of rows.
- No `customers` table with a real PK — Phase 2 needs `customers` table + `loads.customer_id` FK so we can stop inferring customer from `source`.

---

### 2. Carrier — who physically hauls

The trucking entity that owns the truck and pays the driver. NOT the same as customer.

| Carrier      | Role in operation                                                  |
| ------------ | ------------------------------------------------------------------ |
| ES Express   | Primary carrier — hauls Liberty + Logistix loads. Owns the trucks. |
| JRT Trucking | Separate carrier (also a customer per #1)                          |
| Hairpin      | Sister-company carrier (Co A in PCS A/B segmentation)              |

**v2 storage:**

- `loads.carrier_name` text — exists, raw source value
- **`carriers` table EXISTS** — `(id, name, phase, active, notes)`. Used by `wells.carrier_id` (so wells are scoped to a carrier's territory).
- The wells→carriers FK is unusual — it scopes wells by carrier, not loads. Suggests the model is "this carrier owns this well-relationship," which matters for builder-company routing (Scout owns Liberty wells through ES Express; JRT routes its own).
- Phase 2: `loads.carrier_id` FK so we can filter "ES-Express-carrier loads only" for Jessica's desk.

---

### 3. Shipper / Origin — where the load picks up

The sandplant or facility where the truck loads.

| Source feed | Field                              | Example               |
| ----------- | ---------------------------------- | --------------------- |
| PropX       | `origin` (string)                  | "Carrizo Springs, TX" |
| Logistiq    | `loader_name`                      | "Atascosa Sand"       |
| PCS         | `stops[?type=Shipper].companyName` | "Atascosa Sandplant"  |
| Sheet       | (not tracked — assumed by carrier) | —                     |

**v2 storage:**

- `loads.origin_name` text — raw source value
- No `shippers` table — multiple naming variants for the same physical loader aren't reconciled
- Phase 2: a `shippers` table + `shipper_mappings` analogous to `location_mappings` for wells

---

### 4. Consignee / Destination (Well) — where the load delivers

The well being fracked. Most vocab chaos lives here because every source names wells differently.

| Source feed | Field                                                              | What you see                       |
| ----------- | ------------------------------------------------------------------ | ---------------------------------- |
| PropX       | `destination_id` (UUID, stable) + `destination_name`               | "CHK LA MIN 25-13-12"              |
| Logistiq    | `well_site_id` (internal int) + `well_name`                        | "Bobcat 5HU"                       |
| PCS         | `stops[?type=Consignee].companyName` OR `dispatch.destinationCity` | "Center, TX" (city only)           |
| Sheet       | `well_name` (carrier-prefixed by Jenny)                            | "ES (LIBERTY) CHK LA MIN 25-13-12" |
| JotForm     | (driver enters free-text)                                          | varies                             |

**Three vocabulary axes:** PropX (operator's well name), Sheet (carrier-prefixed), PCS (city). All three resolve to the same physical well.

**v2 storage:**

- `wells` table — canonical, with `aliases` jsonb (every name PropX/Logistiq/Sheet has called it)
- `wells.carrier_id` FK to carriers — well is scoped to which carrier's territory
- `location_mappings` (source_name → well_id, confidence numeric) — fuzzy bridge from raw destination text to a canonical well
- PropX `destination_id` and Logistiq `well_site_id` are deterministic bridge keys; matcher walks: stable ID → alias exact match → alias fuzzy → location_mappings → escalation

---

### 5. Builder-company — workflow ownership

Who on the ES Express dispatch team owns a load's workflow. NOT a data field on the load — a workflow assignment Jessica makes based on customer.

| Builder | Owns                                        |
| ------- | ------------------------------------------- |
| Scout   | Liberty                                     |
| Steph   | Logistix IQ (via Logistiq feed)             |
| Keli    | JRT (the JRT cross-org loads PCS bills)     |
| Katie   | Backup / overflow                           |
| Jenny   | The Load Count Sheet — daily reconciliation |

**v2 storage:** Currently nowhere as a queryable field. Verbal-only. Phase 2: derive from customer (each builder = one customer), surface as Workbench filter.

---

### 6. Source / Feed — where v2 learned about the load

NOT who's involved with the load — just provenance.

| Source     | What it covers                                    | Customer it implies |
| ---------- | ------------------------------------------------- | ------------------- |
| `propx`    | Liberty's job postings via PropX API              | Liberty             |
| `logistiq` | Logistix IQ's loads via Logistiq API              | Logistix IQ         |
| `jotform`  | Driver-submitted BOL form data                    | (varies)            |
| `bol`      | OCR'd BOL photos uploaded by drivers              | (varies)            |
| `sheet`    | Jenny's Load Count Sheet snapshot                 | (any)               |
| `pcs`      | PCS warehouse extract (now in `pcs_load_history`) | (any)               |
| `manual`   | Created by hand inside v2                         | (varies)            |

**v2 storage:** `loads.source` text — correct as provenance. The mistake was using it AS the customer field. Fixed in PCS Truth page (Coverage by Customer panel separates them cleanly).

---

### 7. Driver — the human who hauls

| Source feed | Field                                  |
| ----------- | -------------------------------------- |
| PropX       | `driver_id` + `driver_name` (in loads) |
| Logistiq    | `driver_name`                          |
| PCS         | (varies, in dispatch records)          |
| JotForm     | `driver_name` (typed by driver)        |
| Sheet       | "Driver Codes" tab in Master Dispatch  |

**v2 storage:**

- `loads.driver_name` + `loads.driver_id` text
- `propx_drivers` table — PropX's full driver roster (id, name, carrier_id, carrier_name, truck_no, trailer_no)
- `driver_roster` table (added today 2026-04-25) — Jessica's Master Dispatch driver-codes roster. Currently empty (Master Dispatch tab data is misaligned — pending canonical sheet from Jessica).
- `driver_crossrefs` (source_name → canonical_name) — naming bridge for driver-name aliases
- Phase 2: `drivers` master table + `loads.driver_id_canonical` FK

---

### 8. Truck / Trailer — the equipment

| Source feed | Field                                               |
| ----------- | --------------------------------------------------- |
| PropX       | `truck_no`, `trailer_no` on loads + `propx_drivers` |
| Logistiq    | `truck_no` (in raw_data)                            |
| Sheet       | (truck visible per row)                             |

**v2 storage:**

- `loads.truck_no`, `loads.trailer_no` text
- `propx_drivers.truck_no/trailer_no` — driver-current-equipment snapshot
- No truck master table — multiple trucks per driver over time isn't tracked historically

---

### 9. Operator — the oil & gas company that owns the well

The company doing the fracking — Apache, Comstock, Chesapeake, Exco, Devon, etc. **NOT the same as customer.** Liberty is the customer (pays the bill); the operator is who Liberty is fracking for.

Currently embedded in well names ("HV (SPITFIRE) **Comstock** - Blocker Gill" → operator = Comstock; "Apache-Warwick-Hayes" → operator = Apache).

| Source signal            | Where it appears                                |
| ------------------------ | ----------------------------------------------- |
| PropX `destination_name` | Often prefixed with operator (CHK = Chesapeake) |
| Sheet well names         | Always prefixed (carrier + operator + well)     |
| PCS                      | Implicit — only city is stored                  |

**v2 storage:** NONE. There is no `operators` table. We parse operator from well name when needed (Apache, Comstock, Chesapeake, Exco, Civitas, etc. as substring matches). This is the biggest unmodeled role and a Phase 2 priority because operator drives:

- Pricing (some operators pay more)
- Routing preferences
- Cleared-by-operator workflow

---

### 10. Job — PropX's grouping of loads under a work order

PropX issues a "job" (e.g., "ABS-2026-Q1-LIB-2378") and assigns N loads to it. Each load belongs to exactly one job. JOB carries `customer_id`, `customer_name`, `status`, `working_status`.

| Source feed | Field                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| PropX       | `job_id` on each load + `propx_jobs` table (id, name, customer, status, load_count) |
| Logistiq    | (no equivalent — flat load list)                                                    |
| PCS         | (closest equivalent: `dispatch.dispatchNumber`)                                     |
| Sheet       | (implicit by well/customer grouping)                                                |

**v2 storage:**

- `propx_jobs` table — PropX's full job catalog (synced)
- No `loads.job_id` FK back to propx_jobs — currently the link is via `raw_data.job_id` lookup
- Job is what changed in the BARRETT mid-stream rename earlier today: PropX renamed the JOB but kept the destination_id, which is why the matcher caught it.

---

### 11. Product — what's being hauled

Sand grade and packaging — "100 mesh", "40/70", "Dune Express", etc.

| Source feed | Field                    |
| ----------- | ------------------------ |
| PropX       | `product_description`    |
| Logistiq    | `product` / `sand_grade` |
| Sheet       | (Sand Tracking tab)      |

**v2 storage:**

- `loads.product_description` text — raw source value
- `product_mappings` (source_name → canonical_name) — naming bridge for product aliases (e.g., "100 Mesh" vs "100 MESH" vs "100M")
- `sand_jobs` table (added today) — Master Dispatch's sand-job catalog
- Phase 2: a `products` master table for clean rate-per-product reporting

---

### 12. Pad / Site — multiple wells per location

Multiple wells often share one pad. Tonight's work created Falcon Wells 1/2/3 — three discrete wells on one Falcon pad. Logistically they share roads, equipment, sometimes drivers in a shift.

**v2 storage:** NONE. We model wells as flat. The pad concept is implicit in well names (numeric suffixes like "1HU/2HU/3HU" or "Wells 1/2/3"). Phase 2 candidate if it materially affects routing or attribution.

---

### 13. Workflow Status — what stage the load is at

**This role lives entirely in cell background color** on the Load Count Sheet, not in any cell value. The Color Key tab is a literal paint legend with 8 swatches + workflow phase names. To read state from this sheet via API we have to call `sheets.spreadsheets.get({ includeGridData: true })` and map RGB to legend.

The 8 canonical pipeline states (in order):

| #   | State                                           | What it means in their workflow                   |
| --- | ----------------------------------------------- | ------------------------------------------------- |
| 1   | Missing Tickets                                 | Load record exists, no ticket number captured yet |
| 2   | Missing Driver                                  | Ticket captured, no driver attribution yet        |
| 3   | Loads being built                               | In-progress in the dispatch-desk build workflow   |
| 4   | Loads Completed                                 | Built; ready for clearing                         |
| 5   | Loads Being cleared                             | In the PCS clearing workflow                      |
| 6   | Loads cleared                                   | Cleared in PCS, awaiting invoice                  |
| 7   | Export (Transfers) Completed                    | Transfers exported to billing system              |
| 8   | Invoiced                                        | Final state — invoice issued                      |
| —   | Need Well Rate Info / New Loading Facility Rate | EXCEPTION — blocks pipeline; needs human          |

**v2 storage today:**

- `loads.status` text + `assignments.status` enum — has its OWN vocabulary ("active", "pending", "built", "reconciled", "billed") that doesn't match the sheet's
- We do NOT yet read sheet color
- Phase 2.5: ingest sheet color + map to a canonical `workflow_status` enum that mirrors the 8 stages exactly. Then v2 can say "this load is at 'Loads Being cleared' per your sheet" instead of "v2 status: built."

The renaming-to-match-sheet payoff: when Jess looks at the workbench, the status pills should read in HER vocabulary, not v2's.

---

### 14. Job Category — non-standard work

The Load Count Sheet has a separate section labeled **"Other Jobs to be Invoiced (Jenny)"** below the well grid. This is for work that doesn't fit the well-centric grid because it has no well destination.

Categories observed (across historical tabs + Current):

| Category        | Example bill-tos                        |
| --------------- | --------------------------------------- |
| Truck Pushers   | Liberty, Logistix                       |
| Equipment Moves | (varies)                                |
| Flatbed Loads   | (varies)                                |
| Frac Chem       | (varies)                                |
| Finoric         | Finoric (the customer is also the type) |
| JoeTex          | JoeTex                                  |
| Panel Truss     | (varies)                                |

**v2 storage today:** NONE. v2 has `loads.source = 'manual'` for hand-entered loads and a JotForm-pending bucket for unmatched submissions. Both lump non-standard work in with regular loads.

**The renaming insight:** v2's "manual load" path should be reframed as **"Jenny's Queue"** in the UI, with a `category` enum (Truck Pusher / Equipment Move / Flatbed / Frac Chem / Other). This converts a "no-match problem" v2 created into a "category v2 understands" — exactly how Jess thinks about it.

Phase 2.5: add `loads.job_category` enum + UI surface `/admin/jenny-queue` mirroring the sheet's section.

---

## How the fourteen compose on a single load

Real load delivered Jan 15, 2026:

| Role          | Value                                    |
| ------------- | ---------------------------------------- |
| **Customer**  | Liberty Energy Services, LLC             |
| **Carrier**   | ES Express                               |
| **Shipper**   | Carrizo Springs (sandplant)              |
| **Consignee** | CHK LA MIN 25-13-12 (well in Center, TX) |
| **Builder**   | Scout                                    |
| **Source**    | `propx`                                  |
| **Driver**    | (driver_name + propx_driver_id)          |
| **Truck**     | (truck_no + trailer_no)                  |
| **Operator**  | Chesapeake (CHK in well name)            |
| **Job**       | `propx_jobs` row this load belongs to    |
| **Product**   | "100 Mesh"                               |
| **Pad**       | (implicit — same as well in this case)   |

Same physical event, twelve perspectives, all true. The matcher needs at least #1, #2, #4, #6, #7, #10 to bind correctly. The team uses #5 to route attention. The PCS Truth page exposes #1 vs #6 cleanly for the first time.

---

## The "naming bridge" pattern v2 already uses

A pattern to NOT lose: v2 has four "bridge" tables that translate raw source-vocab to canonical-vocab:

| Bridge table        | Maps             | Confidence?    | Used by               |
| ------------------- | ---------------- | -------------- | --------------------- |
| `customer_mappings` | source → string  | confirmed bool | (underused — Phase 2) |
| `location_mappings` | source → well_id | numeric(4,3)   | matcher Tier 2        |
| `product_mappings`  | source → string  | confirmed bool | (underused — Phase 2) |
| `driver_crossrefs`  | source → string  | confirmed bool | (underused — Phase 2) |

The `wells.aliases` jsonb is the same pattern compressed into one column. The `customer_mappings` etc. follow a "raw text → canonical" model with confirmed-by-human gates. This is the existing rule corpus pattern for Tier 2.

**Underused = opportunity.** Customer/product/driver already have bridge tables but the matcher mostly ignores them (currently uses `wells.aliases` only). Phase 2: extend matcher pathways to consult all four bridges before escalation.

---

## What's still broken in v2 (corrected)

### Schema gaps

- **`customers` table doesn't exist.** Customer is inferred from `source` or stored as raw text in `loads.customer_name`. The bridge table `customer_mappings` exists but isn't used by the matcher.
- **`loads.carrier_id` FK doesn't exist.** Carrier is in `loads.carrier_name` text only. Wells have `carrier_id`, loads don't.
- **`shippers` table doesn't exist.** Origin names are free text.
- **`operators` table doesn't exist.** The biggest gap — operator drives pricing and routing but is parsed from well-name substrings only.
- **`pads` table doesn't exist.** Falcon Wells 1/2/3 are siblings on a pad, but v2 sees them as three independent wells.
- **`builder_routing` table doesn't exist.** Scout/Steph/Keli are verbal only.

### Naming-bridge underuse

- `customer_mappings`, `product_mappings`, `driver_crossrefs` exist but the matcher doesn't consult them. Tier 2 logic only walks `wells.aliases` and `location_mappings`. Phase 2 should extend each role's matcher pathway to consult its bridge.

### Conflations that still happen

- Workbench filter tabs only have "by source" — no "by customer," "by carrier," "by builder."
- Auto-mapper's prefix bias (the Exco DF-DGB Little misroute earlier today) came from collapsing customer + destination naming.
- Some queries use `loads.source = 'propx'` as a proxy for "Liberty loads" — wrong for sheet-sourced or manual Liberty entries.

---

## Phase 2 schema migrations (priority ordered)

1. **`customers` table + `loads.customer_id` FK** — Liberty, Logistix IQ, JRT, Signal Peak, Premier, Finoric. Wire `customer_mappings` into matcher Tier 2 for ingest-time normalization.
2. **`operators` table + `wells.operator_id` FK** — Apache, Comstock, Chesapeake, Exco, Civitas, Devon, etc. Parse from existing well names + `propx_jobs.customer_name` to seed.
3. **`loads.carrier_id` FK** (carriers table already exists) — JRT loads will look like ES Express loads until this lands.
4. **`shippers` + `shipper_mappings`** — multiple naming variants for the same loader.
5. **`builder_routing`** — derive Scout/Steph/Keli routing from customer; surface as Workbench filter.
6. **`pads`** — only if routing/attribution warrants it.

---

## Document maintenance

Re-read this before any code that touches "customer," "source," "carrier," "operator," "driver," or "builder":

1. Confirm which of the **twelve** roles you actually mean.
2. Don't conflate them in queries. `WHERE source = 'propx'` is NOT the same as `WHERE customer = 'Liberty'`.
3. Don't invent new collapsed terms. Use the twelve.
4. Surface the role in UI labels. "Liberty (customer)" is unambiguous; "Liberty" alone is not.
5. If you find a 13th role this doc missed, append it here.

---

## Related documents

- `docs/2026-04-25-vocab-matrix.tsv` — every well × every source's name
- `docs/2026-04-25-end-to-end-normalization-synthesis.md` — the bigger frame (raw → canonical → end-state)
- `docs/2026-04-25-trigger-pathway-rule-corpus.md` — how the rule corpus uses these roles
- `/admin/pcs-truth` — first UI surface where customer is cleanly separated from source

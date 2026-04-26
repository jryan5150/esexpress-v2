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

## The twelve roles

The original framing had six. A schema audit added six more that exist in real data but weren't articulated as discrete roles. The full set:

| #   | Role             | One-line definition                                                  |
| --- | ---------------- | -------------------------------------------------------------------- |
| 1   | Customer         | Who pays the bill (PCS billTo)                                       |
| 2   | Carrier          | Who physically hauls the load (owns the truck)                       |
| 3   | Shipper          | Where the load picks up (sandplant / loader)                         |
| 4   | Consignee (Well) | Where the load delivers (the well being fracked)                     |
| 5   | Builder-company  | Which dispatch-team person owns the workflow (Scout/Steph/Keli)      |
| 6   | Source / Feed    | Where v2 learned about the load                                      |
| 7   | Driver           | The human who hauls the load                                         |
| 8   | Truck / Trailer  | The equipment used                                                   |
| 9   | Operator         | The oil & gas company that owns/operates the well (Apache, Comstock) |
| 10  | Job              | PropX's grouping of loads under one work order                       |
| 11  | Product          | What's being hauled (sand grade — 100 mesh, 40/70)                   |
| 12  | Pad / Site       | The physical site that may contain multiple wells                    |

Each is detailed below with its fields across upstream systems and its current state in v2.

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

## How the twelve compose on a single load

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

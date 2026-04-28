import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── AUTH ─────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  // Role taxonomy locked 2026-04-28:
  //   admin   — Jess, Bryan, Mike, Jace. Full read/write everywhere.
  //   builder — Scout/Steph/Keli/Crystal/Katie/Jenny. Unscoped R/W on
  //             dispatch surfaces (Today, Load Center, BOL Center, stage
  //             advance, push to PCS). Default Today filter scopes to
  //             their builder_routing customer but they can see all.
  //   finance — owns rate + invoicing. R/W on /finance + Wells rate
  //             fields. Read-only on dispatch surfaces.
  //   viewer  — read-only across the app (auditors, observers).
  // Migration 0031 renamed legacy 'dispatcher' rows → 'builder'.
  role: text("role", { enum: ["admin", "builder", "finance", "viewer"] })
    .notNull()
    .default("viewer"),
  authProvider: text("auth_provider", {
    enum: ["local", "google", "microsoft"],
  })
    .notNull()
    .default("local"),
  ssoProviderId: text("sso_provider_id"),
  color: text("color"), // hex color for dispatcher identification (e.g. "#3b82f6")
  assignedWells: jsonb("assigned_wells").$type<number[]>().default([]),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // 2026-04-28: server-side session invalidation. When set, any JWT
  // whose `iat` is older than this timestamp is rejected by the
  // authenticate guard (forces a fresh login). Use to push WhatsNew /
  // release content without waiting for natural 24h JWT expiry.
  tokensInvalidatedAt: timestamp("tokens_invalidated_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ssoConfig = pgTable("sso_config", {
  id: serial("id").primaryKey(),
  provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
  clientId: text("client_id").notNull(),
  clientSecretEncrypted: text("client_secret_encrypted").notNull(),
  tenantId: text("tenant_id"),
  enabled: boolean("enabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const invitedEmails = pgTable("invited_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["admin", "builder", "finance", "viewer"] })
    .notNull()
    .default("builder"),
  invitedBy: integer("invited_by").references(() => users.id),
  accepted: boolean("accepted").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── DISPATCH CORE ────────────────────────────────────────────────

// Carriers — the trucking companies we coordinate dispatch for. Seeded
// with Liberty / Logistiq / JRT. The `phase` column is the Phase 1 /
// Phase 2 rollout dial: phase1 = Jessica validates all loads for this
// carrier; phase2 = the builder (Scout / Steph / Keli) validates inline
// on the dispatch desk. The phase flip happens per-carrier, starting
// with Liberty once PCS REST dispatch is live. Added 2026-04-22.
export const carriers = pgTable("carriers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  phase: text("phase", { enum: ["phase1", "phase2"] })
    .notNull()
    .default("phase1"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const wells = pgTable(
  "wells",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    aliases: jsonb("aliases").$type<string[]>().default([]),
    status: text("status", {
      enum: ["active", "standby", "completed", "closed"],
    })
      .notNull()
      .default("active"),
    dailyTargetLoads: integer("daily_target_loads"),
    dailyTargetTons: numeric("daily_target_tons", { precision: 10, scale: 2 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    propxJobId: text("propx_job_id"),
    propxDestinationId: text("propx_destination_id"),
    // O-23 (Apr 9): admin-set flag indicating the loading-facility rate
    // for this well isn't dialed in yet. Loads going to this well surface
    // as "Need Well Rate Info" (burnt orange) on the dispatch desk so
    // Jessica can chase the rate before invoicing.
    needsRateInfo: boolean("needs_rate_info").notNull().default(false),
    // Per-well commercial + logistics fields (admin-owned). Added
    // 2026-04-22 to move rate data out of spreadsheets into the app.
    // Numeric rates allow 4 decimal places (cents + micros for fuel
    // surcharge calculations). `mileageFromLoader` is round-trip /
    // one-way depending on how the carrier invoices — follow-up with
    // Jessica which convention wins before it drives any calc.
    ratePerTon: numeric("rate_per_ton", { precision: 10, scale: 4 }),
    ffcRate: numeric("ffc_rate", { precision: 10, scale: 4 }),
    fscRate: numeric("fsc_rate", { precision: 10, scale: 4 }),
    // FSC method — added 2026-04-27 per Jess: FSC is calculated by either
    // miles (fscRate × loads.mileage) or by weight (fscRate × loads.weightTons)
    // depending on the well. Toggle lives per-well, surfaced in WellsAdmin.
    // null = no FSC for this well.
    fscMethod: text("fsc_method", { enum: ["miles", "weight"] }),
    mileageFromLoader: numeric("mileage_from_loader", {
      precision: 10,
      scale: 2,
    }),
    customerName: text("customer_name"),
    // FK to carriers. Left as a plain integer column + foreign key
    // constraint (see migration) so drizzle doesn't try to reorder the
    // table definition — carriers is declared above.
    carrierId: integer("carrier_id").references(() => carriers.id, {
      onDelete: "set null",
    }),
    // Phase 2 (added 2026-04-25): operator = the oil & gas company that
    // owns/operates the well (Apache, Comstock, Chesapeake). Distinct from
    // customer (who pays the bill). Was embedded in well.name as a prefix
    // until now.
    operatorId: integer("operator_id"),
    loaderSandplant: text("loader_sandplant"),
    matchFeedback: jsonb("match_feedback")
      .$type<
        Array<{
          sourceName: string;
          action: "confirmed" | "rejected" | "manual_assign";
          by: number;
          at: string;
        }>
      >()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_wells_status").on(table.status),
    index("idx_wells_propx_job").on(table.propxJobId),
    index("idx_wells_name_trgm").using("gin", sql`"name" gin_trgm_ops`),
  ],
);

export const LOAD_SOURCES = ["propx", "logistiq", "manual"] as const;

// Job category — captures the sheet's "Other Jobs to be Invoiced (Jenny)"
// section. Default 'standard' = well-bound load (the common case). The rest
// are non-standard work the team tracks in Jenny's Queue.
// See docs/2026-04-25-canonical-vocabulary.md role #14.
// Workflow status — the team's 8-stage paint pipeline + exception state
// from the Load Count Sheet. Source: Color Key tab, hex→label captured
// 2026-04-25 via /diag/sheet-color-key.
//
// Snake_case enum values for v2; the UI surfaces the original sheet
// labels verbatim for vocabulary parity.
export const WORKFLOW_STATUSES = [
  "loads_being_built", // #00ff00 green
  "loads_completed", // #ff00ff magenta — "Loads Completed/ Load Count complete"
  "loads_being_cleared", // #f46fa2 light pink
  "loads_cleared", // #da3876 deep pink
  "export_transfers_completed", // #ffff00 yellow
  "invoiced", // #4a86e8 blue
  "missing_tickets", // #9900ff purple — "Missing Tickets/ Not Arrived"
  "missing_driver", // #00ffff cyan
  "need_rate_info", // #e69138 orange — "Need Well Rate Info / New Loading Facility Rate" (exception)
  "unknown", // catch-all for un-painted or off-legend cells
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// Workflow-status snapshots from the sheet. One row per (week, well,
// day-of-week) cell that has a non-default background color. Refreshed
// on each sheet sync; rows replaced on re-sync of a week.
export const sheetWellStatus = pgTable(
  "sheet_well_status",
  {
    id: serial("id").primaryKey(),
    spreadsheetId: text("spreadsheet_id").notNull(),
    sheetTabName: text("sheet_tab_name").notNull(),
    weekStart: text("week_start").notNull(), // 'YYYY-MM-DD' Sunday
    rowIndex: integer("row_index").notNull(), // 0-based within tab
    wellName: text("well_name"),
    billTo: text("bill_to"),
    colIndex: integer("col_index").notNull(), // 0-based — 2..8 = Sun..Sat
    cellValue: text("cell_value"),
    cellHex: text("cell_hex"),
    status: text("status", { enum: [...WORKFLOW_STATUSES] }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_sheet_well_status_unique").on(
      table.spreadsheetId,
      table.sheetTabName,
      table.weekStart,
      table.rowIndex,
      table.colIndex,
    ),
    index("idx_sheet_well_status_status").on(table.status),
    index("idx_sheet_well_status_week").on(table.weekStart),
  ],
);

export const JOB_CATEGORIES = [
  "standard",
  "truck_pusher",
  "equipment_move",
  "flatbed",
  "frac_chem",
  "finoric",
  "joetex",
  "panel_truss",
  "other",
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];
export type LoadSource = (typeof LOAD_SOURCES)[number];

export const LOAD_PHASE_STATES = [
  "pending",
  "in_progress",
  "complete",
] as const;
export type LoadPhaseState = (typeof LOAD_PHASE_STATES)[number];

export const loads = pgTable(
  "loads",
  {
    id: serial("id").primaryKey(),
    loadNo: text("load_no").notNull(),
    source: text("source", { enum: ["propx", "logistiq", "manual"] }).notNull(),
    sourceId: text("source_id").notNull(),
    driverName: text("driver_name"),
    driverId: text("driver_id"),
    truckNo: text("truck_no"),
    trailerNo: text("trailer_no"),
    carrierName: text("carrier_name"),
    // Phase 2 normalized FKs (added 2026-04-25). The text columns above
    // remain authoritative for now — these FKs are populated by backfill
    // and matcher-time normalization. See docs/2026-04-25-canonical-vocabulary.md
    // FK constraints added in migration 0025 after initial backfill landed.
    customerId: integer("customer_id"),
    carrierIdFk: integer("carrier_id_fk"),
    shipperId: integer("shipper_id"),
    // Job category — defaults to 'standard'. Non-standard categories
    // populate Jenny's Queue. See JOB_CATEGORIES above.
    jobCategory: text("job_category", { enum: [...JOB_CATEGORIES] })
      .notNull()
      .default("standard"),
    // (Drizzle infers FK from .references() in entity table; the constraints
    // were intentionally added separately to allow backfill before enforcement.)
    customerName: text("customer_name"),
    productDescription: text("product_description"),
    originName: text("origin_name"),
    destinationName: text("destination_name"),
    weightTons: numeric("weight_tons", { precision: 10, scale: 4 }),
    netWeightTons: numeric("net_weight_tons", { precision: 10, scale: 4 }),
    weightLbs: numeric("weight_lbs", { precision: 12, scale: 2 }),
    rate: numeric("rate", { precision: 10, scale: 2 }),
    mileage: numeric("mileage", { precision: 10, scale: 2 }),
    bolNo: text("bol_no"),
    orderNo: text("order_no"),
    referenceNo: text("reference_no"),
    ticketNo: text("ticket_no"),
    status: text("status").default("active"),
    deliveredOn: timestamp("delivered_on", { withTimezone: true }),
    historicalComplete: boolean("historical_complete").default(false).notNull(),
    historicalCompleteReason: text("historical_complete_reason"),
    rawData: jsonb("raw_data"),
    pickupState: text("pickup_state", { enum: [...LOAD_PHASE_STATES] })
      .notNull()
      .default("pending"),
    deliveryState: text("delivery_state", { enum: [...LOAD_PHASE_STATES] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_loads_source_sourceid").on(table.source, table.sourceId),
    index("idx_loads_source").on(table.source),
    index("idx_loads_destination").on(table.destinationName),
    index("idx_loads_driver").on(table.driverName),
    index("idx_loads_ticket").on(table.ticketNo),
    index("idx_loads_bol").on(table.bolNo),
    index("idx_loads_load_no").on(table.loadNo),
    index("idx_loads_delivered_on").on(table.deliveredOn),
    index("idx_loads_driver_id").on(table.driverId),
    index("idx_loads_status_delivered").on(table.status, table.deliveredOn),
    index("idx_loads_historical_complete").on(table.historicalComplete),
  ],
);

export const loadComments = pgTable(
  "load_comments",
  {
    id: serial("id").primaryKey(),
    loadId: integer("load_id")
      .notNull()
      .references(() => loads.id, { onDelete: "cascade" }),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_load_comments_load_id").on(table.loadId, table.createdAt),
  ],
);

export const ASSIGNMENT_STATUSES = [
  "pending",
  "assigned",
  "reconciled",
  "dispatch_ready",
  "dispatching",
  "dispatched",
  "in_transit",
  "at_terminal",
  "loaded",
  "at_destination",
  "delivered",
  "completed",
  "cancelled",
  "failed",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const PHOTO_STATUSES = ["attached", "pending", "missing"] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const HANDLER_STAGES = [
  "uncertain",
  "ready_to_build",
  "building",
  "entered",
  "cleared",
] as const;
export type HandlerStage = (typeof HANDLER_STAGES)[number];

export const UNCERTAIN_REASONS = [
  "unassigned_well",
  "fuzzy_match",
  "bol_mismatch",
  "weight_mismatch",
  "no_photo_48h",
  "rate_missing",
  "missing_driver",
  "missing_tickets",
] as const;
export type UncertainReason = (typeof UNCERTAIN_REASONS)[number];

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    wellId: integer("well_id")
      .notNull()
      .references(() => wells.id),
    loadId: integer("load_id")
      .notNull()
      .references(() => loads.id),
    status: text("status", { enum: [...ASSIGNMENT_STATUSES] })
      .notNull()
      .default("pending"),
    assignedTo: integer("assigned_to").references(() => users.id),
    assignedBy: integer("assigned_by").references(() => users.id),
    autoMapTier: integer("auto_map_tier"),
    autoMapScore: numeric("auto_map_score", { precision: 4, scale: 3 }),
    matchAudit: jsonb("match_audit"),
    // Free-form dispatcher commentary on a specific assignment
    // (e.g. "held for rate", "Liberty asked us to recheck weight").
    // Existing PUT /assignments/:id route already accepts `notes` but the
    // column was missing — added 2026-04-14 (O-05, Jessica's repeated ask).
    notes: text("notes"),
    pcsSequence: integer("pcs_sequence"),
    pcsDispatch: jsonb("pcs_dispatch")
      .$type<Record<string, unknown>>()
      .default({}),
    photoStatus: text("photo_status", { enum: [...PHOTO_STATUSES] }).default(
      "missing",
    ),
    statusHistory: jsonb("status_history")
      .$type<
        Array<{
          status: string;
          changedAt: string;
          changedBy?: number;
          changedByName?: string;
          notes?: string;
        }>
      >()
      .default([]),
    handlerStage: text("handler_stage", { enum: [...HANDLER_STAGES] })
      .notNull()
      .default("uncertain"),
    currentHandlerId: integer("current_handler_id").references(() => users.id),
    uncertainReasons: jsonb("uncertain_reasons")
      .$type<UncertainReason[]>()
      .notNull()
      .default([]),
    // Updated by advanceStage() on every handler_stage transition;
    // defaultNow() seeds the value at row insert time.
    stageChangedAt: timestamp("stage_changed_at", {
      withTimezone: true,
    }).defaultNow(),
    enteredOn: date("entered_on"),
    // PCS load number — manually entered by dispatcher after building the
    // load in PCS (interim path while OAuth isn't live). Jodi's payroll
    // report joins on this. Once bidirectional OAuth lands this becomes
    // auto-populated and read-only.
    pcsNumber: text("pcs_number"),
    // Set when a Push to PCS click is captured in rehearsal mode (pre-
    // OAuth). Drains to NULL when the cutover script flips the load to
    // a real PCS push and pcsNumber gets populated. Surfaces on /flagged
    // under "📦 Ready for PCS — awaiting Kyle" so Jess can see exactly
    // what would go when the OAuth flag flips. Added 2026-04-28.
    pcsPendingAt: timestamp("pcs_pending_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_assignments_well_load").on(table.wellId, table.loadId),
    index("idx_assignments_status").on(table.status),
    index("idx_assignments_well").on(table.wellId),
    index("idx_assignments_assigned_to").on(table.assignedTo),
    index("idx_assignments_photo_status").on(table.photoStatus),
    index("idx_assignments_load").on(table.loadId),
    index("idx_assignments_status_well").on(table.status, table.wellId),
    index("idx_assignments_handler_stage").on(table.handlerStage),
    index("idx_assignments_current_handler").on(table.currentHandlerId),
    index("idx_assignments_entered_on").on(table.enteredOn),
    index("idx_assignments_pcs_number").on(table.pcsNumber),
    index("idx_assignments_pcs_pending_at").on(table.pcsPendingAt),
  ],
);

// ─── CANONICAL ENTITY TABLES (added 2026-04-25, Phase 2 vocab work) ───
//
// The original schema had loads.customer_name / carrier_name / origin_name
// as raw text — leading to the conflations documented in
// docs/2026-04-25-canonical-vocabulary.md. These tables give us
// canonical PKs for the four roles that didn't yet have them. The naming
// bridges (customer_mappings, location_mappings, product_mappings,
// driver_crossrefs) feed into these via canonical_*_id FKs added below.
//
// Carriers already had a table — we just add loads.carrier_id_fk so
// LOADS (not just wells) can be filtered by carrier.

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  pcsBillToId: text("pcs_bill_to_id"),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// The oil & gas companies (Apache, Comstock, Chesapeake, Exco, Civitas).
// NOT the customer (Liberty pays the bill; Comstock owns the well).
// Embedded in well names today; this table makes the role queryable.
export const operators = pgTable("operators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  shortCodes: jsonb("short_codes").$type<string[]>().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Sandplants and other origin/loader facilities. Multiple naming variants
// per physical loader currently aren't reconciled — shipper_mappings is
// the bridge.
export const shippers = pgTable("shippers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  city: text("city"),
  state: text("state"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Builder-routing: who on the dispatch team owns each customer's workflow.
// Scout owns Liberty; Steph owns Logistix; Keli owns JRT. The team thinks
// in builder-first ("Scout's loads are slow today" = Liberty loads).
// One row per (builder, customer). Multiple builders per customer allowed
// for backup/handoff scenarios.
//
// Note: column is `is_primary` not `primary` — `primary` is a Postgres
// reserved word and would require quoting in every query. Caught in audit
// 2026-04-25 immediately after first INSERT.
export const builderRouting = pgTable("builder_routing", {
  id: serial("id").primaryKey(),
  builderName: text("builder_name").notNull(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "cascade",
  }),
  isPrimary: boolean("is_primary").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const shipperMappings = pgTable("shipper_mappings", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull().unique(),
  shipperId: integer("shipper_id").references(() => shippers.id),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).default("0"),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── MAPPING TABLES ───────────────────────────────────────────────

export const locationMappings = pgTable("location_mappings", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull().unique(),
  wellId: integer("well_id").references(() => wells.id),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).default("0"),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const customerMappings = pgTable("customer_mappings", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull().unique(),
  canonicalName: text("canonical_name").notNull(),
  // Phase 2: bridge points at the customers PK so the matcher can return
  // a canonical customer_id, not just a string.
  canonicalCustomerId: integer("canonical_customer_id").references(
    () => customers.id,
  ),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const productMappings = pgTable("product_mappings", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull().unique(),
  canonicalName: text("canonical_name").notNull(),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const driverCrossrefs = pgTable("driver_crossrefs", {
  id: serial("id").primaryKey(),
  sourceName: text("source_name").notNull().unique(),
  canonicalName: text("canonical_name").notNull(),
  confirmed: boolean("confirmed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── PHOTOS ───────────────────────────────────────────────────────

/**
 * PCS-known loads cache. Each PCS sync run upserts the missed-by-v2
 * entries here so the JotForm matcher can check PCS as a 4th source
 * (after PropX, Logistiq, and raw_data nested) before declaring "no
 * match." Without this cache, the matcher only sees what we've ingested,
 * but PCS knows about loads from a third dispatch source we don't pull.
 *
 * Discovered 2026-04-25: operator pushed back — "the matcher should
 * check the system that historical loads would already be in."
 */
export const pcsKnownTickets = pgTable(
  "pcs_known_tickets",
  {
    id: serial("id").primaryKey(),
    pcsLoadId: text("pcs_load_id").notNull(),
    shipperTicket: text("shipper_ticket"),
    loadReference: text("load_reference"),
    pcsStatus: text("pcs_status"),
    shipperCompany: text("shipper_company"),
    consigneeCompany: text("consignee_company"),
    pickupDate: text("pickup_date"),
    totalWeight: text("total_weight"),
    division: text("division"), // 'A' (Hairpin) or 'B' (ES Express)
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_pcs_known_tickets_load").on(table.pcsLoadId),
    index("idx_pcs_known_tickets_ticket").on(table.shipperTicket),
  ],
);

// pcs_load_history — bulk PCS warehouse extract (NOT just active loads).
// Initial population: operator-supplied flywheel.duckdb extract loaded as
// CSV (27,030 Q1 2026 rows). Future: PCS Invoice API write path will
// populate ongoing weeks. Used by /diag/pcs-truth to compute LIVE parity
// against v2's loads table — the page recomputes every request, so as
// discrepancies resolve and v2 ingest grows, the capture % ticks up.
export const pcsLoadHistory = pgTable(
  "pcs_load_history",
  {
    id: serial("id").primaryKey(),
    pcsLoadNo: text("pcs_load_no").notNull(),
    pickupDate: timestamp("pickup_date", { withTimezone: true }),
    customer: text("customer"),
    origin: text("origin"),
    destinationCity: text("destination_city"),
    pcsStatus: text("pcs_status"),
    weightLbs: integer("weight_lbs"),
    miles: integer("miles"),
    sourceSnapshot: text("source_snapshot"), // e.g. 'flywheel-2026-04-25'
    rawData: jsonb("raw_data"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_pcs_load_history_loadno").on(table.pcsLoadNo),
    index("idx_pcs_load_history_pickup").on(table.pickupDate),
    index("idx_pcs_load_history_customer").on(table.customer),
    index("idx_pcs_load_history_dest_city").on(table.destinationCity),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    loadId: integer("load_id").references(() => loads.id),
    assignmentId: integer("assignment_id").references(() => assignments.id),
    source: text("source", {
      enum: ["propx", "jotform", "bol", "manual", "logistiq"],
    }).notNull(),
    sourceUrl: text("source_url"),
    type: text("type", {
      enum: ["weight_ticket", "bol", "scale_ticket", "other"],
    }),
    ticketNo: text("ticket_no"),
    driverName: text("driver_name"),
    pcsUploaded: boolean("pcs_uploaded").default(false),
    pcsAttachmentType: text("pcs_attachment_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_photos_load").on(table.loadId),
    index("idx_photos_assignment").on(table.assignmentId),
  ],
);

// ─── PCS SESSIONS ─────────────────────────────────────────────────

export const pcsSessions = pgTable("pcs_sessions", {
  id: serial("id").primaryKey(),
  sessionType: text("session_type", { enum: ["soap", "oauth"] }).notNull(),
  token: text("token").notNull(),
  companyId: text("company_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── PROPX REFERENCE DATA ────────────────────────────────────────
// NOTE: propxJobs and jobSyncMetadata COLLAPSED into one table
export const propxJobs = pgTable("propx_jobs", {
  id: serial("id").primaryKey(),
  propxJobId: text("propx_job_id").notNull().unique(),
  jobName: text("job_name"),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  status: text("status"),
  workingStatus: text("working_status"),
  hasPendingLoads: boolean("has_pending_loads").default(true),
  loadCount: integer("load_count").default(0),
  rawData: jsonb("raw_data"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const propxDrivers = pgTable("propx_drivers", {
  id: serial("id").primaryKey(),
  propxDriverId: text("propx_driver_id").notNull().unique(),
  driverName: text("driver_name"),
  carrierId: text("carrier_id"),
  carrierName: text("carrier_name"),
  truckNo: text("truck_no"),
  trailerNo: text("trailer_no"),
  status: text("status"),
  rawData: jsonb("raw_data"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── JOTFORM ──────────────────────────────────────────────────────
export const jotformImports = pgTable(
  "jotform_imports",
  {
    id: serial("id").primaryKey(),
    jotformSubmissionId: text("jotform_submission_id").notNull().unique(),
    driverName: text("driver_name"),
    truckNo: text("truck_no"),
    bolNo: text("bol_no"),
    weight: numeric("weight", { precision: 12, scale: 2 }),
    photoUrl: text("photo_url"),
    imageUrls: jsonb("image_urls").$type<string[]>().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    matchedLoadId: integer("matched_load_id").references(() => loads.id, {
      onDelete: "set null",
    }),
    matchMethod: text("match_method"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    status: text("status", {
      enum: ["pending", "matched", "unmatched", "discrepancy", "archived"],
    }).default("pending"),
    discrepancies: jsonb("discrepancies")
      .$type<
        Array<{
          field: string;
          expected: unknown;
          actual: unknown;
          severity: string;
        }>
      >()
      .default([]),
    importBatchId: text("import_batch_id"),
    manuallyMatched: boolean("manually_matched").default(false),
    manuallyMatchedBy: integer("manually_matched_by").references(
      () => users.id,
    ),
    // Preserves the OCR-extracted BOL value when an operator manually corrects
    // it via the reconciliation queue. Populated only on first correction —
    // subsequent edits don't overwrite (so we keep the OG OCR ground truth).
    // Powers the OCR retraining queue: SELECT WHERE original_ocr_bol_no IS NOT NULL
    // gives photo→correct-BOL pairs for fine-tuning Jetson or whichever
    // extractor we're using.
    originalOcrBolNo: text("original_ocr_bol_no"),
    bolCorrectedBy: integer("bol_corrected_by").references(() => users.id),
    bolCorrectedAt: timestamp("bol_corrected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_jotform_status").on(table.status),
    index("idx_jotform_matched_load").on(table.matchedLoadId),
    index("idx_jotform_bol").on(table.bolNo),
  ],
);

// ─── BOL SUBMISSIONS ──────────────────────────────────────────────
export const bolSubmissions = pgTable(
  "bol_submissions",
  {
    id: serial("id").primaryKey(),
    driverId: text("driver_id"),
    driverName: text("driver_name"),
    loadNumber: text("load_number"),
    photos: jsonb("photos")
      .$type<Array<{ url: string; cloudinaryId: string; filename: string }>>()
      .default([]),
    aiExtractedData: jsonb("ai_extracted_data"),
    aiConfidence: integer("ai_confidence"),
    aiMetadata: jsonb("ai_metadata"),
    driverConfirmedAt: timestamp("driver_confirmed_at", { withTimezone: true }),
    driverCorrections: jsonb("driver_corrections"),
    matchedLoadId: integer("matched_load_id").references(() => loads.id, {
      onDelete: "set null",
    }),
    matchMethod: text("match_method"),
    matchScore: integer("match_score"),
    discrepancies: jsonb("discrepancies")
      .$type<
        Array<{
          field: string;
          expected: unknown;
          actual: unknown;
          severity: string;
        }>
      >()
      .default([]),
    status: text("status", {
      enum: [
        "pending",
        "extracting",
        "extracted",
        "confirmed",
        "matched",
        "discrepancy",
        "failed",
      ],
    }).default("pending"),
    retryCount: integer("retry_count").default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_bol_status").on(table.status),
    index("idx_bol_matched_load").on(table.matchedLoadId),
    index("idx_bol_driver").on(table.driverId),
  ],
);

// ─── INGESTION CONFLICTS ─────────────────────────────────────────
export const ingestionConflicts = pgTable(
  "ingestion_conflicts",
  {
    id: serial("id").primaryKey(),
    propxLoadId: integer("propx_load_id").references(() => loads.id),
    logistiqLoadId: integer("logistiq_load_id").references(() => loads.id),
    matchKey: text("match_key"),
    importBatchId: text("import_batch_id"),
    importFilename: text("import_filename"),
    discrepancies: jsonb("discrepancies"),
    maxSeverity: text("max_severity", {
      enum: ["critical", "warning", "info"],
    }),
    status: text("status", {
      enum: [
        "pending",
        "resolved_propx",
        "resolved_logistiq",
        "resolved_manual",
      ],
    }).default("pending"),
    resolvedBy: integer("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_conflicts_status").on(table.status),
    index("idx_conflicts_match_key").on(table.matchKey),
  ],
);

// ─── PAYMENT BATCHES ─────────────────────────────────────────────
export const paymentBatches = pgTable(
  "payment_batches",
  {
    id: serial("id").primaryKey(),
    batchNumber: text("batch_number").notNull().unique(),
    driverId: text("driver_id").notNull(),
    driverName: text("driver_name").notNull(),
    carrierName: text("carrier_name"),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    weekEnd: timestamp("week_end", { withTimezone: true }).notNull(),
    loadCount: integer("load_count").default(0),
    totalWeightTons: numeric("total_weight_tons", { precision: 12, scale: 4 }),
    totalMileage: numeric("total_mileage", { precision: 12, scale: 2 }),
    ratePerTon: numeric("rate_per_ton", { precision: 10, scale: 2 }),
    ratePerMile: numeric("rate_per_mile", { precision: 10, scale: 2 }),
    rateType: text("rate_type", { enum: ["per_ton", "per_mile"] }).default(
      "per_ton",
    ),
    grossPay: numeric("gross_pay", { precision: 12, scale: 2 }),
    totalDeductions: numeric("total_deductions", {
      precision: 12,
      scale: 2,
    }).default("0"),
    netPay: numeric("net_pay", { precision: 12, scale: 2 }),
    deductions: jsonb("deductions")
      .$type<
        Array<{
          type: string;
          amount: number;
          description: string;
          reference?: string;
          date?: string;
        }>
      >()
      .default([]),
    status: text("status", {
      enum: [
        "draft",
        "pending_review",
        "under_review",
        "approved",
        "rejected",
        "paid",
        "cancelled",
      ],
    }).default("draft"),
    statusHistory: jsonb("status_history").default([]),
    sheetsExportUrl: text("sheets_export_url"),
    sheetsExportedAt: timestamp("sheets_exported_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_payment_status").on(table.status),
    index("idx_payment_driver").on(table.driverId),
    index("idx_payment_driver_week").on(
      table.driverId,
      table.weekStart,
      table.weekEnd,
    ),
  ],
);

// ─── PAYMENT BATCH ↔ LOADS JOIN TABLE ────────────────────────────
export const paymentBatchLoads = pgTable(
  "payment_batch_loads",
  {
    batchId: integer("batch_id")
      .notNull()
      .references(() => paymentBatches.id, { onDelete: "cascade" }),
    loadId: integer("load_id")
      .notNull()
      .references(() => loads.id),
  },
  (table) => [
    primaryKey({ columns: [table.batchId, table.loadId] }),
    index("idx_pbl_load").on(table.loadId),
  ],
);

// ─── SYNC RUNS (pipeline diagnostics) ────────────────────────────
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source", {
      enum: ["propx", "logistiq", "automap", "jotform", "pcs"],
    }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status", {
      enum: ["success", "failed", "skipped"],
    }).notNull(),
    recordsProcessed: integer("records_processed").default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_sync_runs_source").on(table.source),
    index("idx_sync_runs_started").on(table.startedAt),
  ],
);

// ─── NOTIFICATIONS ───────────────────────────────────────────────
// Every outbound email (magic link, alerts, digests, maintenance notices) is
// logged here BEFORE send is attempted and updated after. This is the system
// of record for "did we actually email X about Y?" — queryable for audits and
// for suppressing duplicate notifications.
export const notificationEvents = pgTable(
  "notification_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(), // 'magic_link' | 'alert' | 'maintenance_done' | 'daily_digest' | etc
    recipient: text("recipient").notNull(), // email address
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    success: boolean("success").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("idx_notification_events_event_type").on(table.eventType),
    index("idx_notification_events_recipient").on(table.recipient),
    index("idx_notification_events_sent_at").on(table.sentAt),
  ],
);

// ─── MAGIC LINK AUTH ─────────────────────────────────────────────
// Passwordless sign-in tokens. Generated with 32 bytes of crypto-random
// entropy, hex-encoded, 15-minute TTL. `usedAt` non-null = single-use
// enforced. Rate limiting (3/hr/email) is enforced at route layer by
// counting recent rows for the same email.
export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedFromIp: text("requested_from_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_magic_link_tokens_token").on(table.token),
    index("idx_magic_link_tokens_email").on(table.email),
    index("idx_magic_link_tokens_expires_at").on(table.expiresAt),
  ],
);

// ─── FEEDBACK ────────────────────────────────────────────────────
export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    category: text("category", {
      enum: ["issue", "question", "suggestion"],
    }).notNull(),
    description: text("description").notNull(),
    pageUrl: text("page_url"),
    routeName: text("route_name"),
    screenshotUrl: text("screenshot_url"),
    breadcrumbs: jsonb("breadcrumbs")
      .$type<Array<Record<string, unknown>>>()
      .default([]),
    sessionSummary: jsonb("session_summary"),
    browser: jsonb("browser"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_feedback_category").on(table.category),
    index("idx_feedback_created").on(table.createdAt),
  ],
);

// ── Breadcrumbs (behavioral signal capture) ──────────────────────────

export const breadcrumbs = pgTable(
  "breadcrumbs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    eventData: jsonb("event_data").$type<Record<string, unknown>>().default({}),
    zone: text("zone", { enum: ["live", "archive", "search"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_breadcrumbs_event_type").on(table.eventType),
    index("idx_breadcrumbs_created_at").on(table.createdAt),
    index("idx_breadcrumbs_user_id").on(table.userId),
  ],
);

// ─── MATCH DECISIONS ──────────────────────────────────────────────
// Every human action on an assignment (confirm, route_uncertain, flag_back,
// advance) writes one row here. This is the labeled-data stream the Phase 3
// tuner consumes to re-weight the match scorer.
//
// features_snapshot captures the MatchFeatures object as it looked at decision
// time; score_before is the scorer output pre-decision. score_after is filled
// on transitions that re-score (e.g., a confirm that clears uncertain_reasons).
//
// Indexed on created_at (for the nightly tuner's time-window scan) and on
// action (for outcome-by-action aggregates).
export const matchDecisions = pgTable(
  "match_decisions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    loadId: integer("load_id")
      .notNull()
      .references(() => loads.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    featuresSnapshot: jsonb("features_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    scoreBefore: numeric("score_before", { precision: 4, scale: 3 }).notNull(),
    scoreAfter: numeric("score_after", { precision: 4, scale: 3 }),
    tierBefore: text("tier_before").notNull(),
    tierAfter: text("tier_after"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_match_decisions_created_at").on(table.createdAt),
    index("idx_match_decisions_action").on(table.action),
    index("idx_match_decisions_assignment_id").on(table.assignmentId),
  ],
);

// ─── OPS / AUDIT ──────────────────────────────────────────────────
//
// Every mutation script or remediation run logs a row here: script name,
// timestamp, row counts before/after, dry-run flag, free-form notes, and
// arbitrary metadata. Supports both manual scripts (via a runner helper)
// and automated jobs. Not consumed by any UI yet — the data earns its
// keep forensically. "What did we change between Tuesday and Wednesday?"
// becomes answerable.
export const dataIntegrityRuns = pgTable(
  "data_integrity_runs",
  {
    id: serial("id").primaryKey(),
    scriptName: text("script_name").notNull(),
    ranBy: text("ran_by"),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rowCountBefore: integer("row_count_before"),
    rowCountAfter: integer("row_count_after"),
    dryRun: boolean("dry_run").notNull().default(false),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("idx_data_integrity_runs_ran_at").on(table.ranAt),
    index("idx_data_integrity_runs_script_name").on(table.scriptName),
  ],
);

// Key/value feature-flag + settings store. Created 2026-04-22 to make
// PCS_DISPATCH_ENABLED flippable via admin UI rather than requiring a
// Railway env-var edit. "Toggle is yours" becomes real.
//
// Values stored as text; callers cast. Pattern: one row per key, updated
// in place. `updatedBy` captures who flipped it for audit.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  description: text("description"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── CROSS-CHECK / DISCREPANCY DETECTION ─────────────────────────
//
// Created 2026-04-23 evening. Productizes the cross-check that v2's PCS
// sync was already implicitly performing — every 15 min the sync pulls
// PCS state and matches against v2; this table records WHERE the two
// sources disagree.
//
// One row per (subject_key, discrepancy_type) open at a time. When a
// discrepancy resolves (the values agree, or PCS state catches up), the
// row gets resolved_at set rather than deleted — preserves history for
// "this load drifted twice last week" pattern detection.
//
// `subject_key` is an opaque identifier the unique-open constraint binds
// against. For per-assignment types it's "assignment:{id}"; for
// orphan_destination it's "destination:{name}". Lets one constraint
// enforce uniqueness across heterogeneous subject types.
//
// `assignment_id` and `load_id` are denormalized FK refs for query
// convenience — the JOIN-by-FK is cheaper than parsing subject_key.
//
// Surfaces:
//   - Drawer "Cross-check" section per load
//   - /admin/discrepancies admin index
//   - Workbench row tint when assignment has any open discrepancy
//   - Diag endpoint: GET /api/v1/diag/discrepancies (open only)
//
// Populated by: pcs-sync.service.ts at end of each matched-loop iteration
// (per-load types) + post-loop sweep (orphan_destination aggregate).

export const DISCREPANCY_TYPES = [
  "status_drift", // v2.handler_stage vs PCS pcs_status divergence
  "weight_drift", // >5% diff between v2 weight_lbs and PCS totalWeight
  "well_mismatch", // v2 well name not equal to PCS consignee company
  "photo_gap", // PCS expects BOL but v2 has none, or vice versa
  "rate_drift", // v2 well rate_per_ton vs PCS rating.lineHaulRate
  "orphan_destination", // v2 destination not mapped to any well (3+ loads)
  "sheet_vs_v2_week_count", // Load Count Sheet "Total Built" ≠ v2 weekly count
  "sheet_vs_v2_well_count", // Per-well per-week count divergence
  "sheet_status_drift", // Sheet's painted workflow status != v2's lifecycle for same (well, week)
  "sheet_cell_count_drift", // Sheet's per-cell count != v2's count for that (well, day)
] as const;

export const DISCREPANCY_SEVERITIES = ["info", "warning", "critical"] as const;

export const discrepancies = pgTable(
  "discrepancies",
  {
    id: serial("id").primaryKey(),
    subjectKey: text("subject_key").notNull(),
    assignmentId: integer("assignment_id").references(() => assignments.id, {
      onDelete: "cascade",
    }),
    loadId: integer("load_id").references(() => loads.id, {
      onDelete: "cascade",
    }),
    discrepancyType: text("discrepancy_type", {
      enum: [...DISCREPANCY_TYPES],
    }).notNull(),
    severity: text("severity", { enum: [...DISCREPANCY_SEVERITIES] })
      .notNull()
      .default("info"),
    v2Value: text("v2_value"),
    pcsValue: text("pcs_value"),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: integer("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolutionNotes: text("resolution_notes"),
  },
  (table) => [
    uniqueIndex("uq_discrepancies_open_per_subject_type")
      .on(table.subjectKey, table.discrepancyType)
      .where(sql`${table.resolvedAt} IS NULL`),
    index("idx_discrepancies_assignment_open")
      .on(table.assignmentId)
      .where(
        sql`${table.resolvedAt} IS NULL AND ${table.assignmentId} IS NOT NULL`,
      ),
    index("idx_discrepancies_type_open")
      .on(table.discrepancyType)
      .where(sql`${table.resolvedAt} IS NULL`),
    index("idx_discrepancies_detected_at").on(table.detectedAt),
  ],
);

// ─── Driver roster (from Master Dispatch sheet "Driver Codes" tab) ───────
//
// 983 rows of (Tractor, Trailer, Driver Code, Driver Name, Company, Notes)
// curated by the team. Becomes the carrier-attribution lookup table for
// matcher Tier 3 fuzzy fallback and JotForm pending re-resolution.
//
// Identity strategy: driver_code is the stable key when present, falling
// back to lowercased+trimmed driver_name. Both are indexed.

// Weekly notes — per-week human metadata Jess writes at the bottom of
// each weekly tab on the Load Count Sheet. These explain anomalies in
// the numbers ("Bulk loads finalize Monday", "Equipment moves waiting
// on ATMZ billing"). v2 has no per-load equivalent, so this gives
// dispatch context that doesn't fit anywhere else.
export const weeklyNotes = pgTable(
  "weekly_notes",
  {
    id: serial("id").primaryKey(),
    spreadsheetId: text("spreadsheet_id").notNull(),
    sheetTabName: text("sheet_tab_name").notNull(),
    weekStart: text("week_start").notNull(), // 'YYYY-MM-DD' Sunday
    body: text("body").notNull(),
    rowIndex: integer("row_index"), // approximate row in source tab
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_weekly_notes_unique").on(
      table.spreadsheetId,
      table.sheetTabName,
      table.weekStart,
    ),
    index("idx_weekly_notes_week").on(table.weekStart),
  ],
);

export const driverRoster = pgTable(
  "driver_roster",
  {
    id: serial("id").primaryKey(),
    tractor: text("tractor"),
    trailer: text("trailer"),
    driverCode: text("driver_code"),
    driverName: text("driver_name"),
    company: text("company"),
    notes: text("notes"),
    sourceSpreadsheetId: text("source_spreadsheet_id").notNull(),
    sourceTabName: text("source_tab_name").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawRow: jsonb("raw_row").$type<string[]>(),
  },
  (table) => [
    index("idx_driver_roster_code").on(table.driverCode),
    index("idx_driver_roster_name").on(table.driverName),
    index("idx_driver_roster_company").on(table.company),
    uniqueIndex("uq_driver_roster_source").on(
      table.sourceSpreadsheetId,
      table.sourceTabName,
      table.driverCode,
      table.driverName,
    ),
  ],
);

// ─── Sand jobs (from Master Dispatch sheet "Sand Tracking" tab) ──────────
//
// PO# → location/well metadata: Location Code, Coordinates, Closest City,
// Sand Type, Loading Facility, Company, Rate, Mileage, PO Amount, Delivered,
// Remaining. Used by the auto-mapper to resolve PO# → location → well.

export const sandJobs = pgTable(
  "sand_jobs",
  {
    id: serial("id").primaryKey(),
    poNumber: text("po_number"),
    locationCode: text("location_code"),
    locationCoords: text("location_coords"),
    closestCity: text("closest_city"),
    sandType: text("sand_type"),
    loadingFacility: text("loading_facility"),
    lfCoords: text("lf_coords"),
    company: text("company"),
    rate: text("rate"),
    mileage: text("mileage"),
    poAmount: text("po_amount"),
    delivered: text("delivered"),
    remaining: text("remaining"),
    sourceSpreadsheetId: text("source_spreadsheet_id").notNull(),
    sourceTabName: text("source_tab_name").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawRow: jsonb("raw_row").$type<string[]>(),
  },
  (table) => [
    index("idx_sand_jobs_po").on(table.poNumber),
    index("idx_sand_jobs_location_code").on(table.locationCode),
    index("idx_sand_jobs_facility").on(table.loadingFacility),
    uniqueIndex("uq_sand_jobs_source").on(
      table.sourceSpreadsheetId,
      table.sourceTabName,
      table.poNumber,
      table.locationCode,
    ),
  ],
);

// ─── Sheet truth snapshots ────────────────────────────────────────────────
//
// Periodically read the Load Count Sheet's Current + Previous tabs and
// snapshot the per-well-per-week counts they hand-maintain. Drives the
// sheet-vs-v2 parity surface and the sheet_vs_v2_week_count discrepancy.
//
// The "Total Built" + "Discrepancy" cells on their sheet are what Jess
// reconciles against — this table mirrors that shape so we can compute the
// same delta automatically and show "we match within ±N."

export const sheetLoadCountSnapshots = pgTable(
  "sheet_load_count_snapshots",
  {
    id: serial("id").primaryKey(),
    spreadsheetId: text("spreadsheet_id").notNull(),
    sheetTabName: text("sheet_tab_name").notNull(), // 'Current' | 'Previous' | 'WK of MM/DD/YY'
    weekStart: text("week_start").notNull(), // 'YYYY-MM-DD' (Sunday)
    weekEnd: text("week_end").notNull(), // 'YYYY-MM-DD' (Saturday)
    wellName: text("well_name"), // null for the 'Balance Total' aggregate row
    billTo: text("bill_to"),
    sunCount: integer("sun_count"),
    monCount: integer("mon_count"),
    tueCount: integer("tue_count"),
    wedCount: integer("wed_count"),
    thuCount: integer("thu_count"),
    friCount: integer("fri_count"),
    satCount: integer("sat_count"),
    weekTotal: integer("week_total"), // Column J from sheet
    loadsLeftOver: integer("loads_left_over"), // Col P (only on Balance row)
    loadsForWeek: integer("loads_for_week"), // Col Q (Balance row)
    missedLoad: integer("missed_load"), // Col R (Current tab only)
    totalToBuild: integer("total_to_build"), // Col S (Balance row)
    totalBuilt: integer("total_built"), // Col T (Balance row) — THE truth number
    discrepancy: integer("discrepancy"), // Col U (Balance row) — their hand calc
    statusColorHint: text("status_color_hint"), // Optional: name from Color Key if visible
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawRow: jsonb("raw_row").$type<string[]>(),
  },
  (table) => [
    index("idx_sheet_snapshots_week").on(table.weekStart, table.weekEnd),
    index("idx_sheet_snapshots_well").on(table.wellName),
    uniqueIndex("uq_sheet_snapshots_well_week_tab").on(
      table.spreadsheetId,
      table.sheetTabName,
      table.weekStart,
      table.wellName,
    ),
  ],
);

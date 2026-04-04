import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
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
  role: text("role", { enum: ["admin", "dispatcher", "viewer"] })
    .notNull()
    .default("viewer"),
  authProvider: text("auth_provider", {
    enum: ["local", "google", "microsoft"],
  })
    .notNull()
    .default("local"),
  ssoProviderId: text("sso_provider_id"),
  assignedWells: jsonb("assigned_wells").$type<number[]>().default([]),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
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
  role: text("role", { enum: ["dispatcher", "viewer"] })
    .notNull()
    .default("dispatcher"),
  invitedBy: integer("invited_by").references(() => users.id),
  accepted: boolean("accepted").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── DISPATCH CORE ────────────────────────────────────────────────

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
export type LoadSource = (typeof LOAD_SOURCES)[number];

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
    customerName: text("customer_name"),
    productDescription: text("product_description"),
    originName: text("origin_name"),
    destinationName: text("destination_name"),
    weightTons: numeric("weight_tons", { precision: 10, scale: 4 }),
    netWeightTons: numeric("net_weight_tons", { precision: 10, scale: 4 }),
    rate: numeric("rate", { precision: 10, scale: 2 }),
    mileage: numeric("mileage", { precision: 10, scale: 2 }),
    bolNo: text("bol_no"),
    orderNo: text("order_no"),
    referenceNo: text("reference_no"),
    ticketNo: text("ticket_no"),
    status: text("status").default("active"),
    deliveredOn: timestamp("delivered_on", { withTimezone: true }),
    rawData: jsonb("raw_data"),
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
  ],
);

export const ASSIGNMENT_STATUSES = [
  "pending",
  "assigned",
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
  ],
);

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

export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    loadId: integer("load_id").references(() => loads.id),
    assignmentId: integer("assignment_id").references(() => assignments.id),
    source: text("source", {
      enum: ["propx", "jotform", "bol", "manual"],
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
      enum: ["propx", "logistiq", "automap", "jotform"],
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

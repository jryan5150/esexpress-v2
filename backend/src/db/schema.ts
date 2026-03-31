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
} from 'drizzle-orm/pg-core';

// ─── AUTH ─────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'dispatcher', 'viewer'] }).notNull().default('viewer'),
  authProvider: text('auth_provider', { enum: ['local', 'google', 'microsoft'] }).notNull().default('local'),
  ssoProviderId: text('sso_provider_id'),
  assignedWells: jsonb('assigned_wells').$type<number[]>().default([]),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const ssoConfig = pgTable('sso_config', {
  id: serial('id').primaryKey(),
  provider: text('provider', { enum: ['google', 'microsoft'] }).notNull(),
  clientId: text('client_id').notNull(),
  clientSecretEncrypted: text('client_secret_encrypted').notNull(),
  tenantId: text('tenant_id'),
  enabled: boolean('enabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const invitedEmails = pgTable('invited_emails', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['dispatcher', 'viewer'] }).notNull().default('dispatcher'),
  invitedBy: integer('invited_by').references(() => users.id),
  accepted: boolean('accepted').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── DISPATCH CORE ────────────────────────────────────────────────

export const wells = pgTable(
  'wells',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    aliases: jsonb('aliases').$type<string[]>().default([]),
    status: text('status', { enum: ['active', 'standby', 'completed', 'closed'] })
      .notNull()
      .default('active'),
    dailyTargetLoads: integer('daily_target_loads'),
    dailyTargetTons: numeric('daily_target_tons', { precision: 10, scale: 2 }),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    propxJobId: text('propx_job_id'),
    propxDestinationId: text('propx_destination_id'),
    matchFeedback: jsonb('match_feedback')
      .$type<
        Array<{
          sourceName: string;
          action: 'confirmed' | 'rejected' | 'manual_assign';
          by: number;
          at: string;
        }>
      >()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_wells_status').on(table.status),
    index('idx_wells_propx_job').on(table.propxJobId),
  ],
);

export const LOAD_SOURCES = ['propx', 'logistiq', 'manual'] as const;
export type LoadSource = (typeof LOAD_SOURCES)[number];

export const loads = pgTable(
  'loads',
  {
    id: serial('id').primaryKey(),
    loadNo: text('load_no').notNull(),
    source: text('source', { enum: ['propx', 'logistiq', 'manual'] }).notNull(),
    sourceId: text('source_id').notNull(),
    driverName: text('driver_name'),
    driverId: text('driver_id'),
    truckNo: text('truck_no'),
    trailerNo: text('trailer_no'),
    carrierName: text('carrier_name'),
    customerName: text('customer_name'),
    productDescription: text('product_description'),
    originName: text('origin_name'),
    destinationName: text('destination_name'),
    weightTons: numeric('weight_tons', { precision: 10, scale: 4 }),
    netWeightTons: numeric('net_weight_tons', { precision: 10, scale: 4 }),
    rate: numeric('rate', { precision: 10, scale: 2 }),
    mileage: numeric('mileage', { precision: 10, scale: 2 }),
    bolNo: text('bol_no'),
    orderNo: text('order_no'),
    referenceNo: text('reference_no'),
    ticketNo: text('ticket_no'),
    status: text('status').default('active'),
    deliveredOn: timestamp('delivered_on', { withTimezone: true }),
    rawData: jsonb('raw_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_loads_source_sourceid').on(table.source, table.sourceId),
    index('idx_loads_source').on(table.source),
    index('idx_loads_destination').on(table.destinationName),
    index('idx_loads_driver').on(table.driverName),
    index('idx_loads_ticket').on(table.ticketNo),
    index('idx_loads_bol').on(table.bolNo),
  ],
);

export const ASSIGNMENT_STATUSES = [
  'pending',
  'assigned',
  'dispatch_ready',
  'dispatching',
  'dispatched',
  'in_transit',
  'at_terminal',
  'loaded',
  'at_destination',
  'delivered',
  'completed',
  'cancelled',
  'failed',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const PHOTO_STATUSES = ['attached', 'pending', 'missing'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const assignments = pgTable(
  'assignments',
  {
    id: serial('id').primaryKey(),
    wellId: integer('well_id')
      .notNull()
      .references(() => wells.id),
    loadId: integer('load_id')
      .notNull()
      .references(() => loads.id),
    status: text('status', { enum: [...ASSIGNMENT_STATUSES] }).notNull().default('pending'),
    assignedTo: integer('assigned_to').references(() => users.id),
    assignedBy: integer('assigned_by').references(() => users.id),
    autoMapTier: integer('auto_map_tier'),
    autoMapScore: numeric('auto_map_score', { precision: 4, scale: 3 }),
    pcsSequence: integer('pcs_sequence'),
    pcsDispatch: jsonb('pcs_dispatch').$type<Record<string, unknown>>().default({}),
    photoStatus: text('photo_status', { enum: [...PHOTO_STATUSES] }).default('missing'),
    statusHistory: jsonb('status_history')
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_assignments_well_load').on(table.wellId, table.loadId),
    index('idx_assignments_status').on(table.status),
    index('idx_assignments_well').on(table.wellId),
    index('idx_assignments_assigned_to').on(table.assignedTo),
    index('idx_assignments_photo_status').on(table.photoStatus),
  ],
);

// ─── MAPPING TABLES ───────────────────────────────────────────────

export const locationMappings = pgTable('location_mappings', {
  id: serial('id').primaryKey(),
  sourceName: text('source_name').notNull().unique(),
  wellId: integer('well_id').references(() => wells.id),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).default('0'),
  confirmed: boolean('confirmed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const customerMappings = pgTable('customer_mappings', {
  id: serial('id').primaryKey(),
  sourceName: text('source_name').notNull().unique(),
  canonicalName: text('canonical_name').notNull(),
  confirmed: boolean('confirmed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const productMappings = pgTable('product_mappings', {
  id: serial('id').primaryKey(),
  sourceName: text('source_name').notNull().unique(),
  canonicalName: text('canonical_name').notNull(),
  confirmed: boolean('confirmed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const driverCrossrefs = pgTable('driver_crossrefs', {
  id: serial('id').primaryKey(),
  sourceName: text('source_name').notNull().unique(),
  canonicalName: text('canonical_name').notNull(),
  confirmed: boolean('confirmed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── PHOTOS ───────────────────────────────────────────────────────

export const photos = pgTable(
  'photos',
  {
    id: serial('id').primaryKey(),
    loadId: integer('load_id').references(() => loads.id),
    assignmentId: integer('assignment_id').references(() => assignments.id),
    source: text('source', { enum: ['propx', 'jotform', 'bol', 'manual'] }).notNull(),
    sourceUrl: text('source_url'),
    type: text('type', { enum: ['weight_ticket', 'bol', 'scale_ticket', 'other'] }),
    ticketNo: text('ticket_no'),
    driverName: text('driver_name'),
    pcsUploaded: boolean('pcs_uploaded').default(false),
    pcsAttachmentType: text('pcs_attachment_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_photos_load').on(table.loadId),
    index('idx_photos_assignment').on(table.assignmentId),
  ],
);

// ─── PCS SESSIONS ─────────────────────────────────────────────────

export const pcsSessions = pgTable('pcs_sessions', {
  id: serial('id').primaryKey(),
  sessionType: text('session_type', { enum: ['soap', 'oauth'] }).notNull(),
  token: text('token').notNull(),
  companyId: text('company_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

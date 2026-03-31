import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  users,
  ssoConfig,
  invitedEmails,
  wells,
  loads,
  assignments,
  locationMappings,
  customerMappings,
  productMappings,
  driverCrossrefs,
  photos,
  pcsSessions,
} from '../src/db/schema.js';

describe('Drizzle Schema', () => {
  it('exports users table with correct name', () => {
    expect(getTableName(users)).toBe('users');
  });

  it('exports sso_config table', () => {
    expect(getTableName(ssoConfig)).toBe('sso_config');
  });

  it('exports invited_emails table', () => {
    expect(getTableName(invitedEmails)).toBe('invited_emails');
  });

  it('exports wells table', () => {
    expect(getTableName(wells)).toBe('wells');
  });

  it('exports loads table', () => {
    expect(getTableName(loads)).toBe('loads');
  });

  it('exports assignments table', () => {
    expect(getTableName(assignments)).toBe('assignments');
  });

  it('exports location_mappings table', () => {
    expect(getTableName(locationMappings)).toBe('location_mappings');
  });

  it('exports customer_mappings table', () => {
    expect(getTableName(customerMappings)).toBe('customer_mappings');
  });

  it('exports product_mappings table', () => {
    expect(getTableName(productMappings)).toBe('product_mappings');
  });

  it('exports driver_crossrefs table', () => {
    expect(getTableName(driverCrossrefs)).toBe('driver_crossrefs');
  });

  it('exports photos table', () => {
    expect(getTableName(photos)).toBe('photos');
  });

  it('exports pcs_sessions table', () => {
    expect(getTableName(pcsSessions)).toBe('pcs_sessions');
  });
});

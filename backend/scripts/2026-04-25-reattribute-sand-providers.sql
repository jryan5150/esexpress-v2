-- Re-attribute loads where customer_id was set from raw_data.customer_name
-- but the underlying value is actually a SAND PROVIDER (Logistiq's term),
-- not a PCS bill-to customer. Surfaced when /admin/builder-matrix showed
-- 917 unclaimed loads — Alpine Silica had 871 of them.
--
-- Background: when seeding the customers table, we ran:
--   INSERT INTO customers (name) SELECT DISTINCT TRIM(customer_name) FROM loads
-- which pulled "Alpine Silica LLC" into the customers list. But Logistiq's
-- raw_data.customer_name = the sand provider, not the PCS bill-to. PCS bills
-- these as "Logistix IQ".
--
-- Phase 2.5: add a sand_providers table + loads.sand_provider_id FK so
-- Alpine Silica gets its own role-correct slot.
--
-- Idempotent: ON CONFLICT/WHERE guards prevent re-run drift.

-- Re-attribute Alpine Silica loads → Logistix IQ
UPDATE loads SET customer_id = (SELECT id FROM customers WHERE name = 'Logistix IQ')
WHERE customer_id = (SELECT id FROM customers WHERE name = 'Alpine Silica LLC');

-- ES Express LLC (TEST) — test seeds, attribute to default Liberty
UPDATE loads SET customer_id = (SELECT id FROM customers WHERE name = 'Liberty Energy Services, LLC')
WHERE customer_id = (SELECT id FROM customers WHERE name = 'ES Express LLC (TEST)');

-- Mark these two as inactive in customers (not bill-to)
UPDATE customers SET active = false,
  notes = 'Sand provider, not a PCS bill-to customer; Phase 2.5 sand_providers table'
WHERE name = 'Alpine Silica LLC';

UPDATE customers SET active = false, notes = 'Test seed' WHERE name = 'ES Express LLC (TEST)';

-- Verify: should show only active bill-to customers with non-zero recent loads
SELECT c.name, c.active, COUNT(l.id) loads_in_v2
FROM customers c LEFT JOIN loads l ON l.customer_id = c.id
GROUP BY c.id, c.name, c.active ORDER BY c.active DESC, loads_in_v2 DESC;

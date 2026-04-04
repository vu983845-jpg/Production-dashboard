-- ============================================================
-- Migration: Add Water (Nước) SEU to ISO 50001 system
-- SEU ID = 5, energy_type = 'water', unit = 'm³'
-- ============================================================

-- 1. Add 'water' to energy_type enum (if it's an enum column)
-- If energy_type is a text/varchar column, skip this step.
-- Check first: SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'iso50001_seu_master' AND column_name = 'energy_type';

-- If energy_type is an enum, run:
-- ALTER TYPE energy_type ADD VALUE IF NOT EXISTS 'water';

-- 2. Insert Water SEU master record
INSERT INTO iso50001_seu_master (seu_id, name, energy_type, unit, output_unit, sort_order)
VALUES (5, 'Nước (Water)', 'water', 'm³', 'kg', 5)
ON CONFLICT (seu_id) DO UPDATE
    SET name = EXCLUDED.name,
        energy_type = EXCLUDED.energy_type,
        unit = EXCLUDED.unit,
        output_unit = EXCLUDED.output_unit,
        sort_order = EXCLUDED.sort_order;

-- 3. Verify
SELECT * FROM iso50001_seu_master ORDER BY sort_order;

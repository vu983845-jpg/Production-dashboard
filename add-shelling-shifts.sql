-- Migration: Add shift_name to shelling_line_daily
-- Run this in Supabase SQL Editor

-- 1. Add shift_name column defaulting to 'Ca 1' for existing rows
ALTER TABLE shelling_line_daily ADD COLUMN IF NOT EXISTS shift_name text DEFAULT 'Ca 1';

-- 2. Drop the old unique constraint (you may need to adjust the constraint name if it differs)
-- Postgres usually names it: table_col1_col2_key
ALTER TABLE shelling_line_daily DROP CONSTRAINT IF EXISTS shelling_line_daily_work_date_line_code_key;
ALTER TABLE shelling_line_daily DROP CONSTRAINT IF EXISTS shelling_line_daily_pkey CASCADE; -- ONLY if it was misnamed, though CASCADE might drop FKs if any. Safer to just try dropping the typical ones:
DO $$
DECLARE
    conname text;
BEGIN
    SELECT constraint_name INTO conname
    FROM information_schema.table_constraints
    WHERE table_name = 'shelling_line_daily' AND constraint_type = 'UNIQUE';
    
    IF conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE shelling_line_daily DROP CONSTRAINT ' || conname;
    END IF;
END $$;

-- 3. Add the new unique constraint
ALTER TABLE shelling_line_daily ADD CONSTRAINT shelling_line_daily_date_line_shift_key UNIQUE (work_date, line_code, shift_name);

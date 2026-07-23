-- Add the second Canteen meter. Each raw counter unit represents 0.1 m³.
-- Existing `canteen` readings remain Canteen 1 and historical rows stay valid.
ALTER TABLE daily_water
    ADD COLUMN IF NOT EXISTS canteen_2 NUMERIC;

COMMENT ON COLUMN daily_water.canteen_2 IS
    'Canteen 2 raw meter index; each counter unit represents 0.1 m³';

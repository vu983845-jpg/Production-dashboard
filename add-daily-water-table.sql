-- ============================================================
-- Migration: Create daily_water table for water meter tracking
-- Columns map to physical meters in the factory:
--   tong           = Tổng (Total)
--   cap_vp         = Cấp VP (Office supply)
--   lo_hoi         = Lò hơi (Boiler)
--   lo_hoi_shelling = Lò hơi cấp qua Shelling (ở dưới)
--   ro_cap_vao     = RO cấp vào (RO input)
--   ro_dau_ra      = RO đầu ra (RO output)
--   canteen        = Canteen
--   nha_xe         = Nhà xe (Garage)
--   cooling        = Cooling
--   nuoc_thai      = Nước thải (Waste water)
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_water (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL UNIQUE,
    -- Raw meter index readings (m³)
    tong            NUMERIC,   -- Tổng
    cap_vp          NUMERIC,   -- Cấp VP
    lo_hoi          NUMERIC,   -- Lò hơi
    lo_hoi_shelling NUMERIC,   -- Lò hơi cấp qua Shelling (ở dưới)
    ro_cap_vao      NUMERIC,   -- RO cấp vào
    ro_dau_ra       NUMERIC,   -- RO đầu ra
    canteen         NUMERIC,   -- Canteen
    nha_xe          NUMERIC,   -- Nhà xe
    cooling         NUMERIC,   -- Cooling
    nuoc_thai       NUMERIC,   -- Nước thải
    notes           TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE daily_water ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "water_read_all" ON daily_water
    FOR SELECT TO authenticated
    USING (true);

-- Restrict write/update/delete to admin and HSE
CREATE POLICY "water_write_admin_hse" ON daily_water
    FOR ALL TO authenticated
    USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')) )
    WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')) );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_daily_water_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_water_updated_at
    BEFORE UPDATE ON daily_water
    FOR EACH ROW EXECUTE FUNCTION update_daily_water_updated_at();

-- Verify
SELECT 'daily_water table created successfully' AS status;

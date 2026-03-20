-- Create table for Other Electricity meters
CREATE TABLE IF NOT EXISTS daily_electricity_others (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_date DATE NOT NULL UNIQUE,
    cooling_fan NUMERIC DEFAULT 0,
    boiler NUMERIC DEFAULT 0,
    office NUMERIC DEFAULT 0,
    db_ac_hca NUMERIC DEFAULT 0,
    eco2 NUMERIC DEFAULT 0,
    canteen NUMERIC DEFAULT 0,
    transformer NUMERIC DEFAULT 0,
    maintenance NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE daily_electricity_others ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "others_elec_read_all" ON daily_electricity_others
    FOR SELECT TO authenticated
    USING (true);

-- Restrict write/update/delete to admin and HSE
CREATE POLICY "others_elec_write_admin_hse" ON daily_electricity_others
    FOR ALL TO authenticated
    USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')) )
    WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')) );

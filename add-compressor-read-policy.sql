-- Migration: Allow all authenticated users to read energy and compressor data
-- but restrict INSERT/UPDATE/DELETE to admin and HSE

-- 1. daily_compressor
-- Drop the overly restrictive ALL policy
DROP POLICY IF EXISTS "compressor_admin_all" ON daily_compressor;
DROP POLICY IF EXISTS "compressor_admin_hse_all" ON daily_compressor;

-- Allow all authenticated users to read
CREATE POLICY "compressor_read_all" ON daily_compressor
    FOR SELECT TO authenticated
    USING (true);

-- Restrict write/update/delete to admin and HSE
CREATE POLICY "compressor_write_admin_hse" ON daily_compressor
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    );


-- 2. daily_energy
-- Drop the overly restrictive ALL policy
DROP POLICY IF EXISTS "energy_admin_all" ON daily_energy;
DROP POLICY IF EXISTS "energy_admin_hse_all" ON daily_energy;

-- Allow all authenticated users to read
CREATE POLICY "energy_read_all" ON daily_energy
    FOR SELECT TO authenticated
    USING (true);

-- Restrict write/update/delete to admin and HSE
CREATE POLICY "energy_write_admin_hse" ON daily_energy
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    );

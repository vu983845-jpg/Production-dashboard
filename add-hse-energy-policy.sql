-- Migration: Allow HSE role to insert and update energy tracking tables

-- 1. daily_energy
DROP POLICY IF EXISTS "energy_admin_all" ON daily_energy;
CREATE POLICY "energy_admin_hse_all" ON daily_energy
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    );

-- 2. daily_compressor
DROP POLICY IF EXISTS "compressor_admin_all" ON daily_compressor;
CREATE POLICY "compressor_admin_hse_all" ON daily_compressor
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    );

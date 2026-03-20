-- Force clean all policies on daily_compressor
DROP POLICY IF EXISTS "compressor_admin_all" ON daily_compressor;
DROP POLICY IF EXISTS "compressor_admin_hse_all" ON daily_compressor;
DROP POLICY IF EXISTS "compressor_read_all" ON daily_compressor;
DROP POLICY IF EXISTS "compressor_write_admin_hse" ON daily_compressor;

-- Allow ALL authenticated users to SELECT
CREATE POLICY "compressor_read_all_v2" ON daily_compressor
    FOR SELECT TO authenticated
    USING (true);

-- Restrict write/update/delete to admin and HSE
CREATE POLICY "compressor_write_admin_hse_v2" ON daily_compressor
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE'))
    );

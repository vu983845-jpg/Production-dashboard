-- ============================================================
-- FIX: Cấp quyền ghi ISO 50001 cho role 'hse_admin' và 'hse'
-- Nguyên nhân: RLS policies cũ chỉ cho phép ('admin', 'HSE')
--              → 'hse_admin' bị chặn không input được rawdata
--              → và Baseline Model
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- ── 1. iso50001_seu_master ───────────────────────────────────
DROP POLICY IF EXISTS "iso_seu_write_admin_hse" ON public.iso50001_seu_master;
CREATE POLICY "iso_seu_write_admin_hse" ON public.iso50001_seu_master
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ));

-- ── 2. iso50001_monthly_historical ──────────────────────────
DROP POLICY IF EXISTS "iso_hist_write_admin_hse" ON public.iso50001_monthly_historical;
CREATE POLICY "iso_hist_write_admin_hse" ON public.iso50001_monthly_historical
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ));

-- ── 3. iso50001_baseline_model ───────────────────────────────
DROP POLICY IF EXISTS "iso_baseline_write_admin_hse" ON public.iso50001_baseline_model;
CREATE POLICY "iso_baseline_write_admin_hse" ON public.iso50001_baseline_model
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ));

-- ── 4. iso50001_daily_entry ──────────────────────────────────
DROP POLICY IF EXISTS "iso_daily_write_admin_hse" ON public.iso50001_daily_entry;
CREATE POLICY "iso_daily_write_admin_hse" ON public.iso50001_daily_entry
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'HSE', 'hse', 'hse_admin')
    ));

-- ── Kiểm tra kết quả ────────────────────────────────────────
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename LIKE 'iso50001%'
  AND policyname LIKE '%write%'
ORDER BY tablename;

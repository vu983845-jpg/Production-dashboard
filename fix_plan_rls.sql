-- Cho phép các account HSE và HR có quyền sửa data trong bảng daily_plan, daily_energy

-- 1. Cập nhật Policy cho daily_energy
DROP POLICY IF EXISTS "energy_admin_hse_all" ON public.daily_energy;
CREATE POLICY "energy_admin_hse_all" ON public.daily_energy
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint'))
  );

-- 2. Cập nhật Policy cho daily_compressor
DROP POLICY IF EXISTS "compressor_admin_hse_all" ON public.daily_compressor;
CREATE POLICY "compressor_admin_hse_all" ON public.daily_compressor
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint'))
  );

-- 3. Cập nhật Policy cho daily_plan (nếu có policy cũ đang chặn)
DROP POLICY IF EXISTS "Allow insert/update for admins on daily_plan" ON public.daily_plan;
DROP POLICY IF EXISTS "daily_plan_admin_all" ON public.daily_plan;
DROP POLICY IF EXISTS "daily_plan_admin_all_v2" ON public.daily_plan;

CREATE POLICY "daily_plan_admin_all_v2" ON public.daily_plan
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint', 'hr', 'hr_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint', 'hr', 'hr_admin'))
  );

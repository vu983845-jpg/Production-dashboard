DROP POLICY IF EXISTS "water_write_admin_hse" ON daily_water;
CREATE POLICY "water_write_admin_hse_maint" ON daily_water
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','HSE','maint')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','HSE','maint')));

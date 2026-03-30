-- ============================================================
-- FIX: RLS Policy for daily_energy table
-- Problem: Policy checks public.profiles.role = 'admin'
--          but hse_admin/qa_qc store role in raw_user_meta_data
-- Solution: Also check JWT metadata via auth.jwt()
-- ============================================================

BEGIN;

-- 1. Drop old restrictive policies
DROP POLICY IF EXISTS "Allow insert/update for admins on daily_energy" ON public.daily_energy;
DROP POLICY IF EXISTS "Allow read access for authenticated users on daily_energy" ON public.daily_energy;

-- 2. Re-create READ policy (all authenticated users)
CREATE POLICY "daily_energy_select"
ON public.daily_energy
FOR SELECT
TO authenticated
USING (true);

-- 3. Re-create WRITE policy (admin via profiles OR via JWT metadata)
-- This covers both: users in profiles table AND hse_admin/qa_qc who store role in metadata
CREATE POLICY "daily_energy_insert"
ON public.daily_energy
FOR INSERT
TO authenticated
WITH CHECK (
    -- Check profiles table (if exists)
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    OR
    -- Check JWT metadata (for hse_admin, qa_qc created via SQL script)
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

CREATE POLICY "daily_energy_update"
ON public.daily_energy
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

CREATE POLICY "daily_energy_delete"
ON public.daily_energy
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

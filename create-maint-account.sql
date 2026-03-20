-- Create Maintenance User bypassing the auth API triggers if possible
DO $$
DECLARE
    new_user_id UUID := gen_random_uuid();
    hashed_password TEXT;
BEGIN
    -- Ensure pgcrypto is enabled
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    
    -- Generate bcrypt hash for 'Maint2026@'
    hashed_password := crypt('Maint2026@', gen_salt('bf'));

    -- Insert into auth.users manually
    INSERT INTO auth.users (
        id, 
        instance_id,
        email, 
        encrypted_password, 
        email_confirmed_at, 
        raw_app_meta_data, 
        raw_user_meta_data, 
        created_at, 
        updated_at, 
        role,
        aud,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
    )
    VALUES (
        new_user_id, 
        '00000000-0000-0000-0000-000000000000',
        'maint@viccla.com', 
        hashed_password, 
        NOW(), 
        '{"provider":"email","providers":["email"]}', 
        '{"display_name":"Maintenance"}', 
        NOW(), 
        NOW(), 
        'authenticated',
        'authenticated',
        '', '', '', ''
    )
    ON CONFLICT (email) DO NOTHING;

    -- Update or Insert into profiles
    -- Fetch the ID in case it already existed and wasn't newly inserted
    SELECT id INTO new_user_id FROM auth.users WHERE email = 'maint@viccla.com' LIMIT 1;
    
    INSERT INTO public.profiles (id, email, role, display_name)
    VALUES (new_user_id, 'maint@viccla.com', 'maint', 'Maintenance User')
    ON CONFLICT (id) DO UPDATE 
    SET role = 'maint', display_name = 'Maintenance User';

END $$;

-- Update RLS Policies to allow 'maint' role to insert/update electricity tables

-- 1. daily_energy (Điện & Nước)
DROP POLICY IF EXISTS "energy_write_admin_hse" ON daily_energy;
CREATE POLICY "energy_write_admin_hse_maint" ON daily_energy
    FOR ALL TO authenticated
    USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) )
    WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) );

-- 2. daily_compressor (Máy Nén Khí)
DROP POLICY IF EXISTS "compressor_write_admin_hse_v2" ON daily_compressor;
CREATE POLICY "compressor_write_admin_hse_maint" ON daily_compressor
    FOR ALL TO authenticated
    USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) )
    WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) );

-- 3. daily_electricity_others (Điện Khác)
DROP POLICY IF EXISTS "others_elec_write_admin_hse" ON daily_electricity_others;
CREATE POLICY "others_elec_write_admin_hse_maint" ON daily_electricity_others
    FOR ALL TO authenticated
    USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) )
    WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) );

-- 4. daily_kpi (Shelling Energy requires update on this table)
-- Assuming admin and HSE and maint can update
DROP POLICY IF EXISTS "kpi_maint_allow" ON daily_kpi;
CREATE POLICY "kpi_maint_allow" ON daily_kpi
    FOR UPDATE TO authenticated
    USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) )
    WITH CHECK ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'maint')) );

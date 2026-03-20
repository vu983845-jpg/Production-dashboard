-- 1. Create Maintenance Account

-- Attempt to insert into auth.users (may fail if Supabase is heavily restricted, but we try)
DO $$
DECLARE
    new_user_id UUID := gen_random_uuid();
BEGIN
    -- We can't easily insert passwords into auth.users securely from raw SQL without knowing the hashing.
    -- However, we can create the profile directly for the auto-login or custom login flow.
    
    INSERT INTO public.profiles (id, email, role, display_name)
    VALUES (new_user_id, 'maint@viccla.com', 'maint', 'Maintenance User')
    ON CONFLICT (email) DO UPDATE 
    SET role = 'maint', display_name = 'Maintenance User';
END $$;

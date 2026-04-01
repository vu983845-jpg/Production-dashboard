-- Fix hse_admin profile: sync profiles.role from auth.users metadata
-- Run this in Supabase SQL Editor if the Confirm button is missing for hse_admin

-- 1. Check current state
SELECT 
    u.email,
    p.role AS profile_role,
    u.raw_user_meta_data->>'role' AS meta_role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'hse_admin@dds.com';

-- 2. Fix: update profiles.role to match auth.users metadata
UPDATE public.profiles p
SET role = u.raw_user_meta_data->>'role'
FROM auth.users u
WHERE p.id = u.id
  AND u.email = 'hse_admin@dds.com'
  AND u.raw_user_meta_data->>'role' IS NOT NULL;

-- 3. Verify
SELECT 
    u.email,
    p.role AS profile_role,
    u.raw_user_meta_data->>'role' AS meta_role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'hse_admin@dds.com';

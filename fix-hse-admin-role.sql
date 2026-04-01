-- Fix hse_admin@dds.com role: update raw_user_meta_data.role from 'admin' → 'hse_admin'
-- Run this in Supabase SQL Editor

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "hse_admin"}'::jsonb
WHERE email = 'hse_admin@dds.com';

-- Verify
SELECT email, raw_user_meta_data->>'role' AS role
FROM auth.users
WHERE email = 'hse_admin@dds.com';

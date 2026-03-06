BEGIN;

-- 1. Ensure all profiles' roles match their intended role in auth.users
UPDATE public.profiles p
SET 
  role = COALESCE(u.raw_user_meta_data->>'role', 'viewer'),
  department_id = NULLIF(u.raw_user_meta_data->>'department_id', '')::uuid,
  full_name = COALESCE(u.raw_user_meta_data->>'full_name', p.full_name)
FROM auth.users u
WHERE p.id = u.id;

COMMIT;

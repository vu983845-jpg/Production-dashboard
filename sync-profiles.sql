BEGIN;

-- 1. Link the function to a trigger on auth.users so it runs automatically in the future
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Manually Synchronize existing users who are missing profiles
INSERT INTO public.profiles (id, full_name, role, department_id)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', 'Unknown User'), 
    COALESCE(raw_user_meta_data->>'role', 'viewer'), 
    NULLIF(raw_user_meta_data->>'department_id', '')::uuid
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =====================================================
-- FIX USER PERMISSIONS (Full version - tạo column nếu chưa có)
-- =====================================================

-- BƯỚC 1: Thêm column allowed_dept_ids vào profiles (nếu chưa có)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS allowed_dept_ids uuid[] DEFAULT NULL;

-- BƯỚC 2: Grant shelling@dds.com → SHELL + BORMA
UPDATE public.profiles
SET 
    department_id = (SELECT id FROM departments WHERE code = 'SHELL'),
    allowed_dept_ids = ARRAY(
        SELECT id FROM departments WHERE code IN ('SHELL', 'BORMA')
    )
WHERE id = (SELECT id FROM auth.users WHERE email = 'shelling@dds.com');

-- BƯỚC 3: Fix hse_admin → role 'hse_admin' (full access)
UPDATE public.profiles
SET role = 'hse_admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'hse_admin@dds.com');

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"hse_admin"'
)
WHERE email = 'hse_admin@dds.com';

-- BƯỚC 4: Kiểm tra kết quả
SELECT 
    u.email,
    p.role AS profile_role,
    u.raw_user_meta_data->>'role' AS meta_role,
    p.allowed_dept_ids,
    ARRAY(SELECT d.code FROM departments d WHERE d.id = ANY(p.allowed_dept_ids)) AS allowed_dept_codes
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IN ('shelling@dds.com', 'hse_admin@dds.com');

-- =====================================================
-- RESTORE PERMISSIONS: shelling@dds.com
-- Khôi phục quyền dashboard, downtime, và xem report shelling
-- Chạy trong Supabase SQL Editor
-- =====================================================

-- BƯỚC 1: Unban tài khoản (nếu đang bị ban)
UPDATE auth.users
SET banned_until = NULL
WHERE email = 'shelling@dds.com';

-- BƯỚC 2: Khôi phục role về dept_user
UPDATE public.profiles
SET role = 'dept_user'
WHERE id = (SELECT id FROM auth.users WHERE email = 'shelling@dds.com');

-- BƯỚC 3: Gán department chính là SHELL
UPDATE public.profiles
SET department_id = (SELECT id FROM public.departments WHERE code = 'SHELL')
WHERE id = (SELECT id FROM auth.users WHERE email = 'shelling@dds.com');

-- BƯỚC 4: Gán quyền truy cập SHELL + BORMA
UPDATE public.profiles
SET allowed_dept_ids = ARRAY(
    SELECT id FROM public.departments WHERE code IN ('SHELL', 'BORMA')
)
WHERE id = (SELECT id FROM auth.users WHERE email = 'shelling@dds.com');

-- BƯỚC 5: Đồng bộ metadata trong auth.users
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"dept_user"'
)
WHERE email = 'shelling@dds.com';

-- BƯỚC 6: Kiểm tra kết quả
SELECT
    u.email,
    u.banned_until,
    p.role,
    d.code AS dept_code,
    d.name_vi AS dept_name,
    ARRAY(
        SELECT d2.code FROM public.departments d2
        WHERE d2.id = ANY(p.allowed_dept_ids)
    ) AS allowed_dept_codes,
    u.raw_user_meta_data->>'role' AS meta_role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.departments d ON d.id = p.department_id
WHERE u.email = 'shelling@dds.com';

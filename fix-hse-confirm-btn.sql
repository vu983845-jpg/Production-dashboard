-- ============================================================
-- FIX: hse_admin không thấy nút Confirm trong trang Báo Cơm
-- Chạy từng STEP một trong Supabase SQL Editor
-- ============================================================

-- ── STEP 1: Kiểm tra tình trạng hiện tại ──────────────────
SELECT
    u.email,
    u.id,
    p.role                          AS profile_role,
    u.raw_user_meta_data->>'role'   AS meta_role,
    p.full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IN ('hse_admin@dds.com', 'hr_admin@dds.com')
ORDER BY u.email;


-- ── STEP 2: Upsert profile cho hse_admin ──────────────────
-- (tạo mới nếu chưa có, hoặc update role nếu sai)
INSERT INTO public.profiles (id, full_name, role)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', 'HSE Admin'),
    'hse_admin'
FROM auth.users u
WHERE u.email = 'hse_admin@dds.com'
ON CONFLICT (id) DO UPDATE
    SET role = 'hse_admin';


-- ── STEP 3: Đồng bộ tất cả profiles từ metadata ───────────
-- (đề phòng các tài khoản khác cũng bị sai role)
UPDATE public.profiles p
SET role = COALESCE(u.raw_user_meta_data->>'role', p.role)
FROM auth.users u
WHERE p.id = u.id
  AND u.raw_user_meta_data->>'role' IS NOT NULL
  AND u.raw_user_meta_data->>'role' != ''
  AND p.role IS DISTINCT FROM u.raw_user_meta_data->>'role';


-- ── STEP 4: Verify kết quả ────────────────────────────────
SELECT
    u.email,
    p.role                          AS profile_role,
    u.raw_user_meta_data->>'role'   AS meta_role,
    CASE
        WHEN p.role IN ('hr_admin', 'hse_admin', 'admin') THEN '✅ Có nút Confirm'
        ELSE '❌ KHÔNG có nút Confirm'
    END AS confirm_button_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IN ('hse_admin@dds.com', 'hr_admin@dds.com')
ORDER BY u.email;

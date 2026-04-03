-- ============================================================
-- DEBUG: Kiểm tra role thực tế của hse_admin trong database
-- Chạy file này trong Supabase SQL Editor để xem role đang là gì
-- ============================================================

-- 1. Xem toàn bộ profile của các user email hse_admin
SELECT 
    u.email,
    p.role,
    p.full_name,
    p.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email ILIKE '%hse%'
ORDER BY u.email;

-- 2. Nếu role KHÔNG phải 'hse_admin', fix bằng lệnh dưới:
-- UPDATE public.profiles
-- SET role = 'hse_admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'hse_admin@dds.com');

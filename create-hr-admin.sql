-- =====================================================
-- TẠO TÀI KHOẢN HR ADMIN
-- Email: hr_admin@dds.com
-- Mật khẩu: Hr2026@
-- Quyền: xem dashboard, full quyền báo cơm, KHÔNG nhập SX
-- =====================================================

DO $$
DECLARE
    v_user_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'hr_admin@dds.com') THEN
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            'hr_admin@dds.com',
            crypt('Hr2026@', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            json_build_object('full_name', 'HR Admin', 'role', 'hr_admin', 'department_id', NULL),
            now(), now(),
            '', '', '', ''
        );

        INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
        VALUES (
            gen_random_uuid(), v_user_id, v_user_id::text,
            format('{"sub":"%s","email":"%s"}', v_user_id::text, 'hr_admin@dds.com')::jsonb,
            'email', now(), now()
        );

        -- Upsert profile với role hr_admin
        INSERT INTO public.profiles (id, full_name, role)
        VALUES (v_user_id, 'HR Admin', 'hr_admin')
        ON CONFLICT (id) DO UPDATE SET role = 'hr_admin', full_name = 'HR Admin';

        RAISE NOTICE 'Created hr_admin@dds.com successfully';
    ELSE
        -- Tài khoản đã tồn tại, chỉ cần fix role
        UPDATE public.profiles
        SET role = 'hr_admin', full_name = COALESCE(full_name, 'HR Admin')
        WHERE id = (SELECT id FROM auth.users WHERE email = 'hr_admin@dds.com');

        UPDATE auth.users
        SET raw_user_meta_data = jsonb_set(
            COALESCE(raw_user_meta_data, '{}'::jsonb),
            '{role}', '"hr_admin"'
        )
        WHERE email = 'hr_admin@dds.com';

        RAISE NOTICE 'hr_admin@dds.com already exists, role updated to hr_admin';
    END IF;
END
$$;

-- Xác nhận kết quả
SELECT
    u.email,
    p.role,
    p.full_name,
    u.raw_user_meta_data->>'role' AS meta_role,
    u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'hr_admin@dds.com';

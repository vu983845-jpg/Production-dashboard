-- Tạo account viewer cho tien.nguyen@icc.com
-- Chạy script này trong Supabase SQL Editor (Dashboard > SQL Editor)

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Kiểm tra nếu user đã tồn tại thì bỏ qua
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('tien.nguyen@icc.com')) THEN
    RAISE NOTICE 'User tien.nguyen@icc.com đã tồn tại. Đang cập nhật profile...';
    
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower('tien.nguyen@icc.com');
    
    -- Cập nhật profile thành viewer
    INSERT INTO public.profiles (id, email, role, display_name)
    VALUES (v_user_id, 'tien.nguyen@icc.com', 'viewer', 'Tiến Nguyễn')
    ON CONFLICT (id) DO UPDATE SET role = 'viewer', display_name = 'Tiến Nguyễn';
    
    RAISE NOTICE 'Đã cập nhật role thành viewer cho user: %', v_user_id;
    RETURN;
  END IF;

  -- Tạo user mới
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'tien.nguyen@icc.com',
    crypt('Tien123@', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('full_name', 'Tiến Nguyễn', 'role', 'viewer'),
    now(),
    now(),
    '', '', '', ''
  );

  -- Tạo identity record
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    format('{"sub":"%s","email":"%s"}', v_user_id::text, 'tien.nguyen@icc.com')::jsonb,
    'email',
    now(),
    now()
  );

  -- Tạo profile với role viewer (xem hết, không chỉnh sửa được)
  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (v_user_id, 'tien.nguyen@icc.com', 'viewer', 'Tiến Nguyễn')
  ON CONFLICT (id) DO UPDATE SET role = 'viewer', display_name = 'Tiến Nguyễn';

  RAISE NOTICE '✅ Đã tạo account thành công!';
  RAISE NOTICE '   Email    : tien.nguyen@icc.com';
  RAISE NOTICE '   Password : Tien123@';
  RAISE NOTICE '   Role     : viewer (chỉ xem, không chỉnh sửa)';
  RAISE NOTICE '   User ID  : %', v_user_id;

END
$$;

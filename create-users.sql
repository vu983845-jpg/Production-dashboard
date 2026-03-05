-- DO NOT RUN IF ACCOUNTS ALREADY EXIST! This script generates accounts bulk.

DO $$
DECLARE
  v_dept RECORD;
  v_user_id uuid;
  v_email text;
BEGIN
  -- 1. Create Department Users
  FOR v_dept IN SELECT * FROM public.departments LOOP
    v_user_id := gen_random_uuid();
    v_email := lower(v_dept.code) || '@dds.com';
    
    -- Check if email exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        )
        VALUES (
          v_user_id,
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          v_email,
          crypt('Intersnack@123', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}',
          json_build_object('full_name', v_dept.name_en, 'role', 'dept_user', 'department_id', v_dept.id),
          now(),
          now()
        );

        INSERT INTO auth.identities (id, user_id, identity_data, provider, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          v_user_id,
          format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb,
          'email',
          now(),
          now()
        );
        
        RAISE NOTICE 'Created User: %', v_email;
    END IF;
  END LOOP;

  -- 2. Create HSE Admin and QA/QC Admin
  v_user_id := gen_random_uuid();
  v_email := 'hse_admin@dds.com';
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, crypt('Intersnack@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', json_build_object('full_name', 'HSE Admin', 'role', 'admin', 'department_id', NULL), now(), now());
      
      INSERT INTO auth.identities (id, user_id, identity_data, provider, created_at, updated_at)
      VALUES (gen_random_uuid(), v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb, 'email', now(), now());
  END IF;

  v_user_id := gen_random_uuid();
  v_email := 'qa_qc@dds.com';
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, crypt('Intersnack@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', json_build_object('full_name', 'QA/QC Admin', 'role', 'admin', 'department_id', NULL), now(), now());
      
      INSERT INTO auth.identities (id, user_id, identity_data, provider, created_at, updated_at)
      VALUES (gen_random_uuid(), v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb, 'email', now(), now());
  END IF;
  
END
$$;

-- DO NOT RUN IF ACCOUNTS ALREADY EXIST! This script generates accounts bulk.

DO $$
DECLARE
  v_user_id uuid;
  v_dept_id uuid;
  account RECORD;
BEGIN
  -- We use a TEMP table to store the precise mapping provided by the user
  CREATE TEMP TABLE temp_accounts (
      dept_code text,
      full_name text,
      email text,
      password text
  );

  INSERT INTO temp_accounts (dept_code, full_name, email, password) VALUES
  ('STEAM', 'Steaming', 'steaming@dds.com', 'Steaming2026@'),
  ('SHELL', 'Shelling MC', 'shelling@dds.com', 'Shelling2026@'),
  ('BORMA', 'Borma Drying', 'borma@dds.com', 'Borma2026@'),
  ('PEEL_MC', 'Peeling MC', 'peelingmc@dds.com', 'Peeling2026@'),
  ('CS', 'Color Sorter', 'colorsorter@dds.com', 'Color2026@'),
  ('HAND', 'Hand Peeling', 'handpeeling@dds.com', 'Hand2026@'),
  ('PACK', 'Packing', 'packing@dds.com', 'Packing2026@');

  FOR account IN SELECT * FROM temp_accounts LOOP
      -- Find matching department in Database
      SELECT id INTO v_dept_id FROM public.departments WHERE code = account.dept_code;
      
      IF FOUND AND NOT EXISTS (SELECT 1 FROM auth.users WHERE email = account.email) THEN
          v_user_id := gen_random_uuid();
          
          INSERT INTO auth.users (
              id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
              confirmation_token, recovery_token, email_change_token_new, email_change
          )
          VALUES (
              v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
              account.email, crypt(account.password, gen_salt('bf')), now(), 
              '{"provider":"email","providers":["email"]}', 
              json_build_object('full_name', account.full_name, 'role', 'dept_user', 'department_id', v_dept_id), 
              now(), now(),
              '', '', '', ''
          );

          INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
          VALUES (gen_random_uuid(), v_user_id, v_user_id::text, format('{"sub":"%s","email":"%s"}', v_user_id::text, account.email)::jsonb, 'email', now(), now());
          
          RAISE NOTICE 'Created User: %', account.email;
      END IF;
  END LOOP;

  DROP TABLE temp_accounts;

  -- 2. Create HSE Admin and QA/QC Admin if not already present
  v_user_id := gen_random_uuid();
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'hse_admin@dds.com') THEN
      INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change
      )
      VALUES (
          v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hse_admin@dds.com', crypt('Hse2026@', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', json_build_object('full_name', 'HSE Admin', 'role', 'admin', 'department_id', NULL), now(), now(),
          '', '', '', ''
      );
      
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
      VALUES (gen_random_uuid(), v_user_id, v_user_id::text, format('{"sub":"%s","email":"%s"}', v_user_id::text, 'hse_admin@dds.com')::jsonb, 'email', now(), now());
  END IF;

  v_user_id := gen_random_uuid();
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'qa_qc@dds.com') THEN
      INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change
      )
      VALUES (
          v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa_qc@dds.com', crypt('Qaqc2026@', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', json_build_object('full_name', 'QA/QC Admin', 'role', 'admin', 'department_id', NULL), now(), now(),
          '', '', '', ''
      );
      
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
      VALUES (gen_random_uuid(), v_user_id, v_user_id::text, format('{"sub":"%s","email":"%s"}', v_user_id::text, 'qa_qc@dds.com')::jsonb, 'email', now(), now());
  END IF;

END
$$;

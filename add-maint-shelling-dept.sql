-- Add Maint Shelling (Bảo trì máy cắt) as a department
-- Run this in Supabase SQL editor

INSERT INTO public.departments (code, name_vi, name_en, sort_order)
VALUES ('MAINT_SHELL', 'Bảo trì Shelling', 'Maint Shelling', 99)
ON CONFLICT (code) DO UPDATE
  SET name_vi = EXCLUDED.name_vi,
      name_en = EXCLUDED.name_en;

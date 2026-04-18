-- ====================================================
-- RCN WAREHOUSE MODULE SETUP
-- ====================================================

-- 1. Add RCN department back
INSERT INTO public.departments (name_en, name_vi, code, sort_order)
VALUES ('RCN Warehouse', 'Kho RCN', 'RCN', 1)
ON CONFLICT (code) DO UPDATE SET name_en = 'RCN Warehouse', name_vi = 'Kho RCN', sort_order = 1;

-- 2. Create rcn_inventory table
CREATE TABLE IF NOT EXISTS public.rcn_inventory (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_date       date NOT NULL,
    size_code       varchar(10) NOT NULL,  -- A+, A1, A2, B1, B2, C1, C2, D1, D2
    opening_ton     numeric(10,3) NOT NULL DEFAULT 0,  -- tồn đầu ngày
    ton_received    numeric(10,3) NOT NULL DEFAULT 0,  -- nhập kho
    ton_dispatched  numeric(10,3) NOT NULL DEFAULT 0,  -- xuất kho (→ Steaming)
    note            text,
    updated_by      uuid REFERENCES auth.users(id),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(work_date, size_code)
);

-- 3. View: calculated closing stock
CREATE OR REPLACE VIEW public.v_rcn_inventory AS
SELECT
    id,
    work_date,
    size_code,
    opening_ton,
    ton_received,
    ton_dispatched,
    ROUND(opening_ton + ton_received - ton_dispatched, 3) AS closing_ton,
    note,
    updated_by,
    updated_at
FROM public.rcn_inventory
ORDER BY work_date DESC, size_code;

-- 4. Enable RLS
ALTER TABLE public.rcn_inventory ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "rcn_admin_all" ON public.rcn_inventory
    FOR ALL TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'))
    WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin'));

-- RCN dept user can read/write
CREATE POLICY "rcn_dept_read" ON public.rcn_inventory
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "rcn_dept_write" ON public.rcn_inventory
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
        OR (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'RCN'
    );

CREATE POLICY "rcn_dept_update" ON public.rcn_inventory
    FOR UPDATE TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin')
        OR (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'RCN'
    );

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rcn_inventory;

NOTIFY pgrst, 'reload schema';

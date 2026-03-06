-- Drop old PACK policies
DROP POLICY IF EXISTS "containers_insert" ON public.daily_containers;
DROP POLICY IF EXISTS "containers_update" ON public.daily_containers;

-- Create new RCN policies
CREATE POLICY "containers_insert" ON public.daily_containers FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'RCN'
);
CREATE POLICY "containers_update" ON public.daily_containers FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'RCN'
);

-- Realtime Schema reload hook
NOTIFY pgrst, 'reload schema';

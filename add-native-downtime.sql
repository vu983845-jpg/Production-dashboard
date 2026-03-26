-- Tạo bảng quản lý chi tiết sự cố Downtime
CREATE TABLE IF NOT EXISTS public.downtime_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    duration_mins INTEGER NOT NULL,
    root_cause TEXT NOT NULL,
    note TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Kích hoạt RLS
ALTER TABLE public.downtime_events ENABLE ROW LEVEL SECURITY;

-- Chính sách: Ai cũng được XEM
CREATE Policy "Users can view all downtime_events" ON public.downtime_events 
FOR SELECT USING (true);

-- Chính sách: Thêm/Sửa/Xóa phân quyền theo bộ phận (hoặc là admin/HSE/maint)
CREATE Policy "Users can insert downtime_events for allowed departments" ON public.downtime_events 
FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'HSE', 'maint')) OR 
    department_id IN (SELECT department_id FROM profiles WHERE id = auth.uid()) OR 
    department_id IN (SELECT secondary_department_id FROM profiles WHERE id = auth.uid())
);

CREATE Policy "Users can update downtime_events for allowed departments" ON public.downtime_events 
FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'HSE', 'maint')) OR 
    department_id IN (SELECT department_id FROM profiles WHERE id = auth.uid()) OR 
    department_id IN (SELECT secondary_department_id FROM profiles WHERE id = auth.uid())
);

CREATE Policy "Users can delete downtime_events for allowed departments" ON public.downtime_events 
FOR DELETE USING (
     auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'HSE', 'maint')) OR 
    department_id IN (SELECT department_id FROM profiles WHERE id = auth.uid()) OR 
    department_id IN (SELECT secondary_department_id FROM profiles WHERE id = auth.uid())
);

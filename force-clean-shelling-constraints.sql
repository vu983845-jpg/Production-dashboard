-- Xóa bỏ bất kỳ Unique Constraint hoặc Unique Index CŨ nào trên bảng shelling_line_daily
-- (Những constraint chỉ chặn trùng work_date và line_code nhưng thiếu shift_name)
DO $$ 
DECLARE 
    idx RECORD;
BEGIN 
    FOR idx IN 
        SELECT i.relname AS index_name
        FROM pg_class t, pg_class i, pg_index ix, pg_attribute a
        WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
          AND t.relkind = 'r' AND t.relname = 'shelling_line_daily' AND ix.indisunique = true
        GROUP BY i.relname
        -- Bỏ qua primary key (id) và bỏ qua constraint mới đã có shift_name
        HAVING NOT bool_or(a.attname = 'id') AND NOT bool_or(a.attname = 'shift_name')
    LOOP
        BEGIN
            EXECUTE 'ALTER TABLE public.shelling_line_daily DROP CONSTRAINT IF EXISTS ' || quote_ident(idx.index_name) || ' CASCADE';
        EXCEPTION WHEN OTHERS THEN
            -- Ignore exception if it's just an index
        END;
        BEGIN
            EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(idx.index_name) || ' CASCADE';
        EXCEPTION WHEN OTHERS THEN
            -- Ignore exception 
        END;
    END LOOP;
END $$;

-- Tạo cẩn thận lại Unique Constraint mới CHUẨN GỒM 3 CỘT
ALTER TABLE public.shelling_line_daily DROP CONSTRAINT IF EXISTS shelling_line_daily_work_date_line_code_shift_key;
ALTER TABLE public.shelling_line_daily ADD CONSTRAINT shelling_line_daily_work_date_line_code_shift_key UNIQUE (work_date, line_code, shift_name);

-- Làm mới bộ đệm API của Supabase
NOTIFY pgrst, 'reload schema';

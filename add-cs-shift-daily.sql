-- ============================================================
-- Migration: Add cs_shift_daily for Color Sorter 2-shift tracking
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS cs_shift_daily (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id    UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    work_date        DATE NOT NULL,
    shift_name       TEXT NOT NULL CHECK (shift_name IN ('Ca Tây', 'Ca Kha')),
    shift_leader     TEXT,                             -- 'Mr. Tây' or 'Mr. Kha'
    manpower         INTEGER NOT NULL DEFAULT 0,       -- Số người làm ca
    ot_hours         NUMERIC(5, 2) NOT NULL DEFAULT 0, -- Tổng giờ tăng ca
    isp_ton          NUMERIC(10, 3) NOT NULL DEFAULT 0,     -- Sản lượng ISP ca đó
    non_isp_ton      NUMERIC(10, 3) NOT NULL DEFAULT 0,     -- Sản lượng Non-ISP ca đó
    actual_ton       NUMERIC(10, 3) NOT NULL DEFAULT 0,     -- Tổng = isp + non_isp
    downtime_min     NUMERIC(8, 1) NOT NULL DEFAULT 0,      -- Auto-linked from downtime_events
    note             TEXT,
    updated_by       UUID,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (department_id, work_date, shift_name)
);

-- RLS
ALTER TABLE cs_shift_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_shift_daily_select" ON cs_shift_daily
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "cs_shift_daily_insert" ON cs_shift_daily
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "cs_shift_daily_update" ON cs_shift_daily
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "cs_shift_daily_delete" ON cs_shift_daily
    FOR DELETE USING (auth.role() = 'authenticated');

-- Index
CREATE INDEX IF NOT EXISTS idx_cs_shift_daily_dept_date
    ON cs_shift_daily (department_id, work_date);

NOTIFY pgrst, 'reload schema';

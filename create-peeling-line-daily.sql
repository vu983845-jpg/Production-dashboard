-- ============================================================
-- Migration: Create peeling_line_daily table
-- This is the table used by the Peeling MC input form
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS peeling_line_daily (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id    UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    work_date        DATE NOT NULL,
    line_code        TEXT NOT NULL CHECK (line_code IN ('A', 'B', 'C', 'D1', 'D2')),
    shift_name       TEXT NOT NULL CHECK (shift_name IN ('Ca 1', 'Ca 2', 'Ca 3')),
    shift_leader     TEXT,
    actual_ton       NUMERIC(10, 3) NOT NULL DEFAULT 0,
    pass2_ton        NUMERIC(10, 3) NOT NULL DEFAULT 0,
    broken_pct       NUMERIC(5, 2)  NOT NULL DEFAULT 0,
    unpeel_pct       NUMERIC(5, 2)  NOT NULL DEFAULT 0,
    note             TEXT,
    updated_by       UUID,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (department_id, work_date, line_code, shift_name)
);

-- RLS
ALTER TABLE peeling_line_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peeling_line_daily_select" ON peeling_line_daily
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "peeling_line_daily_insert" ON peeling_line_daily
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "peeling_line_daily_update" ON peeling_line_daily
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Index for fast date + dept queries
CREATE INDEX IF NOT EXISTS idx_peeling_line_daily_dept_date
    ON peeling_line_daily (department_id, work_date);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

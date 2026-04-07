-- ============================================================
-- Migration: Add peeling_shift_daily for 3-shift tracking
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS peeling_shift_daily (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id    UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    work_date        DATE NOT NULL,
    shift_name       TEXT NOT NULL CHECK (shift_name IN ('Ca 1', 'Ca 2', 'Ca 3')),
    shift_leader     TEXT,
    pass1_ton        NUMERIC(10, 3) NOT NULL DEFAULT 0,
    pass2_ton        NUMERIC(10, 3) NOT NULL DEFAULT 0,
    actual_ton       NUMERIC(10, 3) NOT NULL DEFAULT 0,   -- app computes: pass1 + pass2
    broken_pct       NUMERIC(5, 2)  NOT NULL DEFAULT 0,
    unpeel_pct       NUMERIC(5, 2)  NOT NULL DEFAULT 0,
    note             TEXT,
    updated_by       UUID,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (department_id, work_date, shift_name)
);

-- RLS
ALTER TABLE peeling_shift_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peeling_shift_daily_select" ON peeling_shift_daily
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "peeling_shift_daily_insert" ON peeling_shift_daily
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "peeling_shift_daily_update" ON peeling_shift_daily
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Index for fast date + dept queries
CREATE INDEX IF NOT EXISTS idx_peeling_shift_daily_dept_date
    ON peeling_shift_daily (department_id, work_date);

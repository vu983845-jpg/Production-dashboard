-- create-canteen-feedback-table.sql
-- Run this in your Supabase SQL Editor to set up the canteen feedback table.

CREATE TABLE IF NOT EXISTS canteen_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_anonymous BOOLEAN DEFAULT TRUE,
    reporter_name TEXT,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_canteen_feedback_date ON canteen_feedback(work_date);

-- Enable RLS
ALTER TABLE canteen_feedback ENABLE ROW LEVEL SECURITY;

-- Policies for public insert & select
DROP POLICY IF EXISTS "Allow public insert" ON canteen_feedback;
DROP POLICY IF EXISTS "Allow public select" ON canteen_feedback;

CREATE POLICY "Allow public insert" ON canteen_feedback FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public select" ON canteen_feedback FOR SELECT TO public USING (true);

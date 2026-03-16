-- Migration: Create shelling_line_daily table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS shelling_line_daily (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  work_date    date NOT NULL,
  line_code    text NOT NULL CHECK (line_code IN ('A','B','C','D','D1')),
  actual_ton   numeric(10,3) DEFAULT 0,
  run_hours    numeric(5,2)  DEFAULT 0,
  note         text,
  updated_by   uuid REFERENCES auth.users(id),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT shelling_line_daily_pkey UNIQUE (work_date, line_code)
);

-- RLS
ALTER TABLE shelling_line_daily ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "shelling_line_select" ON shelling_line_daily
  FOR SELECT USING (true);

-- Allow all authenticated users to insert/update (Shelling dept user + admin)  
CREATE POLICY "shelling_line_upsert" ON shelling_line_daily
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

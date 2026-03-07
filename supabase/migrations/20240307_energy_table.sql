-- SQL Script to run in Supabase SQL Editor

-- Create the daily_energy table
CREATE TABLE public.daily_energy (
  work_date DATE PRIMARY KEY,
  electricity_kwh NUMERIC DEFAULT 0,
  electricity_target_kwh NUMERIC DEFAULT 0,
  water_m3 NUMERIC DEFAULT 0,
  water_target_m3 NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.daily_energy ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for authenticated users on daily_energy" ON public.daily_energy
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow insert/update for specific roles (admin)
CREATE POLICY "Allow insert/update for admins on daily_energy" ON public.daily_energy
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

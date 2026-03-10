-- Add meter reading columns to daily_energy
ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS electricity_meter_reading NUMERIC;
ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS water_meter_reading NUMERIC;

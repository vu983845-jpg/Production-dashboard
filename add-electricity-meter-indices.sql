ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS meter_peak NUMERIC;
ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS meter_normal NUMERIC;
ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS meter_offpeak NUMERIC;

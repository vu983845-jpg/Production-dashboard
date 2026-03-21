ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS electricity_peak_kwh NUMERIC DEFAULT 0;
ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS electricity_offpeak_kwh NUMERIC DEFAULT 0;
ALTER TABLE public.daily_energy ADD COLUMN IF NOT EXISTS electricity_normal_kwh NUMERIC DEFAULT 0;

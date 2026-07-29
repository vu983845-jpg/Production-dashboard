-- Add the newly tracked electricity meters without modifying existing readings.
ALTER TABLE public.daily_electricity_others
    ADD COLUMN IF NOT EXISTS db_hvac NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vent_1 NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ac_2_panel NUMERIC DEFAULT 0;

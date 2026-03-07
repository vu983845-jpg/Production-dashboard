-- SQL Script to add wood columns to daily_energy table

ALTER TABLE public.daily_energy
ADD COLUMN wood_kg NUMERIC DEFAULT 0,
ADD COLUMN wood_target_kg NUMERIC DEFAULT 0;

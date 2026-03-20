-- Migration: Add Pass 1 and Pass 2 columns to daily_actual for Peeling (HAND) dept
ALTER TABLE daily_actual
  ADD COLUMN IF NOT EXISTS pass1_ton NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS pass2_ton NUMERIC(10, 3);

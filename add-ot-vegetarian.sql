-- Add ot_vegetarian column to meal_headcount table
-- This tracks vegetarian count specifically for OT workers
ALTER TABLE meal_headcount
ADD COLUMN IF NOT EXISTS ot_vegetarian INTEGER NOT NULL DEFAULT 0;

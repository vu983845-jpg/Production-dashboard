-- Add unique constraint to meal_headcount for upsert support
-- Run in Supabase SQL Editor

ALTER TABLE meal_headcount
ADD CONSTRAINT meal_headcount_work_date_dept_shift_key
UNIQUE (work_date, department_id, shift);

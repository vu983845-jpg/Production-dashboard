-- Allow HPEEL subgroups to report separately for the same date and shift.
-- The canonical uniqueness rule is (work_date, department_name, shift).
ALTER TABLE meal_headcount
DROP CONSTRAINT IF EXISTS meal_headcount_work_date_dept_shift_key;

CREATE UNIQUE INDEX IF NOT EXISTS meal_headcount_work_date_dept_name_shift_idx
ON meal_headcount (work_date, department_name, shift);

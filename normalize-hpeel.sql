-- Normalize Hand Peeling sub-sections into S1/S2/S3
-- All Dung / Liên / Ms Huệ groups merge into single shift row

UPDATE meal_headcount SET department_name = 'Hand Peeling S1'
WHERE department_name ILIKE '%manual%peeling%s1%'
   OR department_name ILIKE '%manual%peeling%dung%'
   OR department_name ILIKE '%manual%grading%shift 1%'
   OR department_name ILIKE '%manual%grading%s1%'
   OR department_name = 'Manual Grading -Shift 1 (Ms Huệ)'
   OR department_name = 'Manual Peeling (Dung)';

UPDATE meal_headcount SET department_name = 'Hand Peeling S2'
WHERE department_name ILIKE '%manual%peeling%s2%'
   OR department_name ILIKE '%manual%peeling%liên%'
   OR department_name ILIKE '%manual%peeling%lien%'
   OR department_name ILIKE '%manual%grading%shift 2%'
   OR department_name ILIKE '%manual%grading%s2%'
   OR department_name = 'Manual Peeling (Liên)'
   OR department_name = 'Manual Peeling (Lien)';

UPDATE meal_headcount SET department_name = 'Hand Peeling S3'
WHERE department_name ILIKE '%manual%peeling%s3%'
   OR department_name ILIKE '%manual%grading%shift 3%'
   OR department_name ILIKE '%manual%grading%s3%'
   OR department_name = 'Manual Grading -Shift 3 (Ms Huệ)';

-- Color Sorter normalization (from previous session)
UPDATE meal_headcount SET department_name = 'Color Sorter S1'
WHERE department_name ILIKE '%machine grading%shift 1%'
   OR department_name = 'Machine Grading S1'
   OR department_name = 'Color Sorter';

UPDATE meal_headcount SET department_name = 'Color Sorter S2'
WHERE department_name ILIKE '%machine grading%shift 2%'
   OR department_name = 'Machine Grading S2';

UPDATE meal_headcount SET department_name = 'Color Sorter S3'
WHERE department_name ILIKE '%machine grading%shift 3%'
   OR department_name = 'Machine Grading S3'
   OR department_name ILIKE '%machine grading%thời vụ%';

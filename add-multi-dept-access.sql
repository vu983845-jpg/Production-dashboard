-- Add allowed_dept_ids column to profiles
-- This allows a user to input/plan for multiple departments
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS allowed_dept_ids uuid[] DEFAULT NULL;

-- Grant shelling@dds.com access to both Shelling and Borma
-- First, find the user id and dept ids
UPDATE profiles
SET allowed_dept_ids = ARRAY(
    SELECT d.id
    FROM departments d
    WHERE d.code IN ('SHELL', 'BORMA')
)
WHERE id = (
    SELECT id FROM auth.users WHERE email = 'shelling@dds.com'
);

-- Verify
SELECT
    p.id,
    u.email,
    p.role,
    p.department_id,
    p.allowed_dept_ids,
    ARRAY(
        SELECT d.code FROM departments d WHERE d.id = ANY(p.allowed_dept_ids)
    ) AS allowed_dept_codes
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'shelling@dds.com';

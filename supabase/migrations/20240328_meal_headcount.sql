-- Create meal_headcount table for Báo Cơm data
CREATE TABLE IF NOT EXISTS meal_headcount (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  work_date date NOT NULL,
  department_id uuid REFERENCES departments(id),
  department_name text NOT NULL,
  shift text NOT NULL DEFAULT '1',
  official_present int DEFAULT 0,
  official_absent int DEFAULT 0,
  seasonal_present int DEFAULT 0,
  seasonal_absent int DEFAULT 0,
  ot_count int DEFAULT 0,
  vegetarian int DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(work_date, department_name, shift)
);

-- Enable RLS
ALTER TABLE meal_headcount ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "meal_headcount_select" ON meal_headcount
  FOR SELECT TO authenticated USING (true);

-- Allow insert/update for admin, hr, HSE, hse_admin roles
CREATE POLICY "meal_headcount_insert" ON meal_headcount
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'hr', 'HSE', 'hse', 'hse_admin')
    )
  );

CREATE POLICY "meal_headcount_update" ON meal_headcount
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'hr', 'HSE', 'hse', 'hse_admin')
    )
  );

-- Department name mapping view (for linking Zalo names to production departments)
-- Peeling mc = MC Peeling in departments table
-- Maint-shelling and Clearning are NOT mapped to production departments

-- Migration: Create daily_compressor table for tracking 3 air compressor meter readings
CREATE TABLE IF NOT EXISTS daily_compressor (
    work_date   DATE        NOT NULL,
    meter1      NUMERIC(12, 1),
    meter2      NUMERIC(12, 1),
    meter3      NUMERIC(12, 1),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    updated_by  UUID,
    PRIMARY KEY (work_date)
);

-- Enable RLS
ALTER TABLE daily_compressor ENABLE ROW LEVEL SECURITY;

-- Policy: admin can read/write, others can read only
CREATE POLICY "compressor_admin_all" ON daily_compressor
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "compressor_read_all" ON daily_compressor
    FOR SELECT TO authenticated
    USING (true);

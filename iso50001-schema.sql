-- ============================================================
-- ISO 50001 Energy Management System Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. SEU Master (Significant Energy Use definitions)
CREATE TABLE IF NOT EXISTS public.iso50001_seu_master (
    seu_id   SERIAL PRIMARY KEY,
    name     TEXT NOT NULL,          -- e.g. "Toàn nhà máy điện", "Boiler (Củi)"
    energy_type TEXT NOT NULL,       -- 'electricity' | 'wood'
    unit     TEXT NOT NULL,          -- 'kWh' | 'kg'
    output_unit TEXT NOT NULL,       -- 'kg RCN' (shared: both SEUs use RCN hấp được)
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default SEUs
INSERT INTO public.iso50001_seu_master (name, energy_type, unit, output_unit, sort_order)
VALUES
    ('Toàn nhà máy điện', 'electricity', 'kWh', 'kg RCN', 1),
    ('Boiler (Củi → Hơi)', 'wood', 'kg', 'kg RCN', 2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Monthly Historical Data (source for baseline regression)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iso50001_monthly_historical (
    id              SERIAL PRIMARY KEY,
    seu_id          INT NOT NULL REFERENCES public.iso50001_seu_master(seu_id) ON DELETE CASCADE,
    month_year      DATE NOT NULL,         -- first day of month, e.g. '2025-01-01'
    rcn_hap_duoc_kg NUMERIC NOT NULL,      -- X: RCN absorbed/processed (kg) that month
    actual_energy   NUMERIC NOT NULL,      -- Y: kWh (electricity) or kg (wood)
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (seu_id, month_year)
);

-- ============================================================
-- 3. Baseline Model (saved regression result)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iso50001_baseline_model (
    id          SERIAL PRIMARY KEY,
    seu_id      INT NOT NULL REFERENCES public.iso50001_seu_master(seu_id) ON DELETE CASCADE,
    label       TEXT NOT NULL,             -- e.g. "Đường cơ sở 2024"
    period_from DATE NOT NULL,             -- start month (inclusive)
    period_to   DATE NOT NULL,             -- end month (inclusive)
    slope       NUMERIC NOT NULL,          -- a in y = ax + b
    intercept   NUMERIC NOT NULL,          -- b in y = ax + b
    r_squared   NUMERIC NOT NULL,          -- R² [0..1]
    n_points    INT NOT NULL,              -- number of data points used
    is_active   BOOLEAN NOT NULL DEFAULT FALSE,
    created_by  UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active baseline per SEU at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_iso50001_active_baseline
    ON public.iso50001_baseline_model (seu_id)
    WHERE is_active = TRUE;

-- ============================================================
-- 4. Daily Entry (operational data)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iso50001_daily_entry (
    id              SERIAL PRIMARY KEY,
    entry_date      DATE NOT NULL,
    seu_id          INT NOT NULL REFERENCES public.iso50001_seu_master(seu_id) ON DELETE CASCADE,
    actual_energy   NUMERIC NOT NULL,      -- kWh or kg wood
    rcn_hap_duoc_kg NUMERIC NOT NULL,      -- RCN absorbed that day (kg) → used to calc expected
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entry_date, seu_id)
);

-- ============================================================
-- 5. Row Level Security
-- ============================================================

-- SEU Master: everyone can read, only admin/HSE can modify
ALTER TABLE public.iso50001_seu_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iso_seu_read_all" ON public.iso50001_seu_master
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "iso_seu_write_admin_hse" ON public.iso50001_seu_master
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')));

-- Monthly Historical: admin/HSE full access, others read-only
ALTER TABLE public.iso50001_monthly_historical ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iso_hist_read_all" ON public.iso50001_monthly_historical
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "iso_hist_write_admin_hse" ON public.iso50001_monthly_historical
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')));

-- Baseline Model: admin/HSE full access, others read-only
ALTER TABLE public.iso50001_baseline_model ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iso_baseline_read_all" ON public.iso50001_baseline_model
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "iso_baseline_write_admin_hse" ON public.iso50001_baseline_model
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')));

-- Daily Entry: admin/HSE full access, others read-only
ALTER TABLE public.iso50001_daily_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iso_daily_read_all" ON public.iso50001_daily_entry
    FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "iso_daily_write_admin_hse" ON public.iso50001_daily_entry
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE')));

-- ============================================================
-- 6. Updated_at trigger (reuse pattern from codebase)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_iso_historical_updated_at
    BEFORE UPDATE ON public.iso50001_monthly_historical
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_iso_daily_updated_at
    BEFORE UPDATE ON public.iso50001_daily_entry
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 7. Boiler/Borma monthly mix tracking. Nullable quantities mean missing; zero means measured zero.
CREATE TABLE IF NOT EXISTS public.iso50001_boiler_process_mix (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    month_year DATE NOT NULL UNIQUE CHECK (date_trunc('month', month_year)::date = month_year),
    self_steamed_rcn_kg NUMERIC CHECK (self_steamed_rcn_kg >= 0),
    received_precut_rcn_kg NUMERIC CHECK (received_precut_rcn_kg >= 0),
    receipt_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (receipt_basis IN ('unknown', 'rcn-equivalent', 'kernel-mass')),
    borma_input_kg NUMERIC CHECK (borma_input_kg >= 0),
    borma_input_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (borma_input_basis IN ('unknown', 'rcn-equivalent', 'kernel-mass')),
    borma_runtime_hours NUMERIC CHECK (borma_runtime_hours >= 0),
    moisture_in_pct NUMERIC CHECK (moisture_in_pct BETWEEN 0 AND 100),
    moisture_out_pct NUMERIC CHECK (moisture_out_pct BETWEEN 0 AND 100),
    data_quality_status TEXT NOT NULL DEFAULT 'draft' CHECK (data_quality_status IN ('draft', 'verified', 'estimated')),
    notes TEXT, created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.iso50001_boiler_process_mix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iso_boiler_mix_read_all" ON public.iso50001_boiler_process_mix FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "iso_boiler_mix_write_admin_hse" ON public.iso50001_boiler_process_mix FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lower(role) IN ('admin', 'hse', 'hse_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND lower(role) IN ('admin', 'hse', 'hse_admin')));
CREATE OR REPLACE FUNCTION public.audit_iso_boiler_process_mix() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    ELSE NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
    END IF;
    NEW.updated_at := NOW(); RETURN NEW;
END; $$;
CREATE TRIGGER audit_iso_boiler_process_mix BEFORE INSERT OR UPDATE ON public.iso50001_boiler_process_mix
    FOR EACH ROW EXECUTE FUNCTION public.audit_iso_boiler_process_mix();

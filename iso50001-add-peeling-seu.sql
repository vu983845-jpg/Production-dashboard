-- ============================================================
-- Add SEU 3: Peeling MC + Historical Data
-- ============================================================

-- 1. Insert new SEU
INSERT INTO public.iso50001_seu_master ( Seu_id, name, energy_type, unit, output_unit, sort_order)
VALUES (3, 'Peeling MC (Máy nén khí)', 'electricity', 'kWh', 'kg output', 3)
ON CONFLICT (seu_id) DO UPDATE 
SET name = 'Peeling MC (Máy nén khí)';

-- 2. Insert historical data (Jan-25 to Dec-25)
-- We will use rcn_hap_duoc_kg to store the total KGs produced
INSERT INTO public.iso50001_monthly_historical (seu_id, month_year, rcn_hap_duoc_kg, actual_energy)
VALUES
(3, '2025-01-01', 331460, 67760),
(3, '2025-02-01', 443731, 74180),
(3, '2025-03-01', 525737, 100590),
(3, '2025-04-01', 477889, 104220),
(3, '2025-05-01', 554087, 128170),
(3, '2025-06-01', 524634, 158410),
(3, '2025-07-01', 508057, 159770),
(3, '2025-08-01', 370641, 119670),
(3, '2025-09-01', 568378, 152990),
(3, '2025-10-01', 619161, 176710),
(3, '2025-11-01', 553491, 148440),
(3, '2025-12-01', 378556, 120920)
ON CONFLICT (seu_id, month_year) 
DO UPDATE SET 
    rcn_hap_duoc_kg = EXCLUDED.rcn_hap_duoc_kg,
    actual_energy = EXCLUDED.actual_energy;

-- ============================================================
-- Add SEU 4: Shelling + Historical Data
-- ============================================================

-- 1. Insert new SEU
INSERT INTO public.iso50001_seu_master ( Seu_id, name, energy_type, unit, output_unit, sort_order)
VALUES (4, 'Shelling (Khu vực Cắt/Chẻ)', 'electricity', 'kWh', 'kg output', 4)
ON CONFLICT (seu_id) DO UPDATE 
SET name = 'Shelling (Khu vực Cắt/Chẻ)';

-- 2. Insert historical data (Jun-25 to Dec-25)
INSERT INTO public.iso50001_monthly_historical (seu_id, month_year, rcn_hap_duoc_kg, actual_energy)
VALUES
(4, '2025-06-01', 1323713, 52960),
(4, '2025-07-01', 1445946, 57880),
(4, '2025-08-01', 1075680, 50730),
(4, '2025-09-01', 1593295, 65420),
(4, '2025-10-01', 1701220, 74010),
(4, '2025-11-01', 1601518, 64970),
(4, '2025-12-01', 932000, 46340)
ON CONFLICT (seu_id, month_year) 
DO UPDATE SET 
    rcn_hap_duoc_kg = EXCLUDED.rcn_hap_duoc_kg,
    actual_energy = EXCLUDED.actual_energy;

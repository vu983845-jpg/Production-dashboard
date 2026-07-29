export type ElectricityMeterSource = 'energy' | 'other' | 'compressor';

export type ElectricityMeterDefinition = {
  key: string;
  label: string;
  shortLabel: string;
  source: ElectricityMeterSource;
  field: string;
  multiplier: number;
};

export const ELECTRICITY_METERS = [
  { key: 'total-delivery', label: 'Đồng hồ Tổng giao', shortLabel: 'Tổng giao', source: 'energy', field: 'meter_peak', multiplier: 1 },
  { key: 'transformer', label: 'Đồng hồ Transformer', shortLabel: 'Transformer', source: 'other', field: 'transformer', multiplier: 1 },
  { key: 'maintenance', label: 'Đồng hồ Maint', shortLabel: 'Maint', source: 'other', field: 'maintenance', multiplier: 1 },
  { key: 'eco2', label: 'Đồng hồ ECO2', shortLabel: 'ECO2', source: 'other', field: 'eco2', multiplier: 1 },
  { key: 'db-hvac', label: 'Đồng hồ DB-HVAC', shortLabel: 'DB-HVAC', source: 'other', field: 'db_hvac', multiplier: 1 },
  { key: 'db-color-sorter', label: 'Đồng hồ DB-Color Sorter', shortLabel: 'DB-Color Sorter', source: 'other', field: 'db_ac_hca', multiplier: 1 },
  { key: 'compressor-1', label: 'Đồng hồ MNK Số 1 (×1000)', shortLabel: 'MNK Số 1', source: 'compressor', field: 'meter1', multiplier: 1000 },
  { key: 'compressor-2', label: 'Đồng hồ MNK Số 2 (×1000)', shortLabel: 'MNK Số 2', source: 'compressor', field: 'meter2', multiplier: 1000 },
  { key: 'compressor-3', label: 'Đồng hồ MNK Số 3 (×1000)', shortLabel: 'MNK Số 3', source: 'compressor', field: 'meter3', multiplier: 1000 },
  { key: 'vent-1', label: 'Đồng hồ Vent 1', shortLabel: 'Vent 1', source: 'other', field: 'vent_1', multiplier: 1 },
  { key: 'ac-2-panel', label: 'Đồng hồ AC 2. Panel', shortLabel: 'AC 2. Panel', source: 'other', field: 'ac_2_panel', multiplier: 1 },
  { key: 'cooling', label: 'Đồng hồ Cooling', shortLabel: 'Cooling', source: 'other', field: 'cooling_fan', multiplier: 1 },
  { key: 'boiler', label: 'Đồng hồ Lò hơi', shortLabel: 'Lò hơi', source: 'other', field: 'boiler', multiplier: 1 },
  { key: 'db-office', label: 'Đồng hồ DB-Office', shortLabel: 'DB-Office', source: 'other', field: 'office', multiplier: 1 },
] as const satisfies readonly ElectricityMeterDefinition[];

export function calculateMeterConsumption(
  current: number | undefined,
  previous: number | undefined,
  multiplier = 1,
): number {
  if (current === undefined || previous === undefined) return 0;
  return Math.max(0, (current - previous) * multiplier);
}

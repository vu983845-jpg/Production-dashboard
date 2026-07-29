import assert from 'node:assert/strict';
import test from 'node:test';

// Node's native TypeScript test runner requires the explicit extension.
import {
  ELECTRICITY_METERS,
  calculateMeterConsumption,
// @ts-expect-error TS5097: production compilation keeps allowImportingTsExtensions disabled.
} from './electricity-meters.ts';

test('defines the 14 electricity meters in the required input order', () => {
  assert.deepEqual(
    ELECTRICITY_METERS.map(({ label }) => label),
    [
      'Đồng hồ Tổng giao',
      'Đồng hồ Transformer',
      'Đồng hồ Maint',
      'Đồng hồ ECO2',
      'Đồng hồ DB-HVAC',
      'Đồng hồ DB-Color Sorter',
      'Đồng hồ MNK Số 1 (×1000)',
      'Đồng hồ MNK Số 2 (×1000)',
      'Đồng hồ MNK Số 3 (×1000)',
      'Đồng hồ Vent 1',
      'Đồng hồ AC 2. Panel',
      'Đồng hồ Cooling',
      'Đồng hồ Lò hơi',
      'Đồng hồ DB-Office',
    ],
  );
});

test('maps existing and new meters to their intended storage fields', () => {
  assert.deepEqual(
    ELECTRICITY_METERS.map(({ source, field }) => [source, field]),
    [
      ['energy', 'meter_peak'],
      ['other', 'transformer'],
      ['other', 'maintenance'],
      ['other', 'eco2'],
      ['other', 'db_hvac'],
      ['other', 'db_ac_hca'],
      ['compressor', 'meter1'],
      ['compressor', 'meter2'],
      ['compressor', 'meter3'],
      ['other', 'vent_1'],
      ['other', 'ac_2_panel'],
      ['other', 'cooling_fan'],
      ['other', 'boiler'],
      ['other', 'office'],
    ],
  );
});

test('calculates cumulative meter consumption and clamps rollbacks to zero', () => {
  assert.equal(calculateMeterConsumption(125.5, 120), 5.5);
  assert.equal(calculateMeterConsumption(119, 120), 0);
  assert.equal(calculateMeterConsumption(undefined, 120), 0);
});

test('applies the x1000 multiplier to compressor meter differences', () => {
  assert.equal(calculateMeterConsumption(125.5, 120, 1000), 5500);
});

import { describe, expect, it } from 'vitest';
import { connectorsOf, statusCategory } from './codes';
import { findPreset, VEHICLE_PRESETS } from './vehicles';

describe('connectorsOf', () => {
  it('복합 타입은 여러 커넥터로 펼친다', () => {
    expect(connectorsOf('06')).toEqual(['CHADEMO', 'AC3', 'CCS1']);
    expect(connectorsOf('10')).toEqual(['CCS1', 'NACS']);
  });
  it('버스전용·미정의 코드는 별도 표시', () => {
    expect(connectorsOf('11')).toEqual(['BUS_ONLY']);
    expect(connectorsOf('99')).toEqual(['UNKNOWN']);
  });
});

describe('statusCategory', () => {
  it('공식 코드표대로 분류', () => {
    expect(statusCategory('2')).toBe('available');
    expect(statusCategory('3')).toBe('busy');
    expect(statusCategory('6')).toBe('busy');
    expect(statusCategory('1')).toBe('unknown');
    expect(statusCategory('5')).toBe('offline');
    expect(statusCategory('')).toBe('unknown');
  });
});

describe('vehicle presets', () => {
  it('기본 차량(첫 번째)은 Model Y RWD 2025', () => {
    expect(VEHICLE_PRESETS[0]!.id).toBe('tesla-model-y-rwd-2025');
  });

  it('Model Y 는 NACS·CCS1 호환, 충전 곡선은 SoC 오름차순', () => {
    const p = findPreset('tesla-model-y-lr')!;
    expect(p.compatibleConnectors).toEqual(['NACS', 'CCS1']);
    const socs = p.chargeCurve.map(([s]) => s);
    expect(socs).toEqual([...socs].sort((a, b) => a - b));
  });
});

import { describe, expect, it } from 'vitest';
import type { VehiclePreset } from '@ev-route/shared';
import { chargeDurationS, chargeWindow, curveKw, planCharge, type BatteryInput } from './battery';

// 100% 주행거리 375km
const preset: VehiclePreset = {
  id: 't', name: 't', batteryKwh: 75, efficiencyKmPerKwh: 5, maxChargeKw: 250,
  chargeCurve: [[0, 250], [20, 250], [30, 200], [80, 60], [100, 10]],
  compatibleConnectors: ['NACS', 'CCS1'], provisional: false,
};
const b: BatteryInput = { preset, currentSocPct: 60, arriveSocPct: 20, reserveSocPct: 10, chargeCapSocPct: 80 };

describe('chargeWindow', () => {
  it('충전 구간 = [상한 충전 시 도착 가능한 최초 지점, 예비 SoC 도달 지점]', () => {
    const w = chargeWindow(b, 400);
    expect(w).toMatchObject({ needed: true, feasible: true });
    expect(w.maxKm).toBeCloseTo(187.5); // (60-10)% × 375
    expect(w.minKm).toBeCloseTo(175); // 400 - (80-20)% × 375
  });
  it('짧은 거리는 충전 불필요', () => {
    expect(chargeWindow(b, 100).needed).toBe(false);
  });
  it('1회 충전으로 불가능하면 feasible=false', () => {
    expect(chargeWindow(b, 600).feasible).toBe(false);
  });
});

describe('planCharge', () => {
  it('목적지 도착 SoC 만큼만 충전', () => {
    const p = planCharge(b, 180, 220);
    expect(p.arriveAtStationPct).toBe(12);
    expect(p.chargeToPct).toBeCloseTo(78.7, 1);
    expect(p.arriveAtDestinationPct).toBeCloseTo(20, 0);
  });
  it('충전 상한을 넘지 않는다', () => {
    expect(planCharge(b, 100, 400).chargeToPct).toBe(80);
  });
});

describe('charging', () => {
  it('곡선 선형 보간', () => {
    expect(curveKw(preset, 25)).toBeCloseTo(225);
    expect(curveKw(preset, 100)).toBe(10);
  });
  it('충전기 출력이 낮으면 오래 걸리고, 낮은 SoC 에서 시작하면 같은 양이 더 빠르다', () => {
    const fast = chargeDurationS(preset, 10, 50, 250, 0.95);
    const slow = chargeDurationS(preset, 10, 50, 50, 0.95);
    expect(slow).toBeGreaterThan(fast * 2);
    expect(chargeDurationS(preset, 10, 40, 250, 0.95)).toBeLessThan(chargeDurationS(preset, 40, 70, 250, 0.95));
  });
  it('50kW 충전기로 10→50% (30kWh) 는 약 38분', () => {
    expect(chargeDurationS(preset, 10, 50, 50, 0.95) / 60).toBeCloseTo(30 / 47.5 * 60, 0);
  });
});

// 배터리 모델: 주행에 따른 SoC, 충전 가능 구간, 충전소별 충전 계획·시간
import type { VehiclePreset } from '@ev-route/shared';

export interface BatteryInput {
  preset: VehiclePreset;
  currentSocPct: number;
  arriveSocPct: number;
  reserveSocPct: number;
  chargeCapSocPct: number;
}

/** 100% 로 갈 수 있는 거리(km) */
const fullRangeKm = (p: VehiclePreset) => p.batteryKwh * p.efficiencyKmPerKwh;
/** dKm 주행에 쓰는 SoC(%p) */
export const socUsedPct = (p: VehiclePreset, dKm: number) => (dKm / fullRangeKm(p)) * 100;

export interface ChargeWindow {
  /** 목적지에 arriveSoc 이상으로 도착하려면 충전이 필요한가 */
  needed: boolean;
  /** 1회 충전으로 가능한가 */
  feasible: boolean;
  /** 이 지점(출발 후 km)보다 먼저 충전하면 상한까지 채워도 목적지 도착 SoC 부족 */
  minKm: number;
  /** 이 지점을 넘기면 reserveSoc 아래로 떨어짐 */
  maxKm: number;
}

export function chargeWindow(b: BatteryInput, totalKm: number, forceCharge = false): ChargeWindow {
  const range = fullRangeKm(b.preset);
  const maxKm = Math.min(totalKm, ((b.currentSocPct - b.reserveSocPct) / 100) * range);
  const needed = b.currentSocPct - socUsedPct(b.preset, totalKm) < b.arriveSocPct;
  if (!needed) return { needed: false, feasible: true, minKm: 0, maxKm: forceCharge ? Math.max(maxKm, 0) : 0 };
  const minKm = Math.max(0, totalKm - ((b.chargeCapSocPct - b.arriveSocPct) / 100) * range);
  return { needed: true, feasible: maxKm > 0 && minKm <= maxKm, minKm, maxKm: Math.max(maxKm, 0) };
}

export interface SocPlan {
  arriveAtStationPct: number;
  chargeToPct: number;
  arriveAtDestinationPct: number;
}

/**
 * 출발 후 toStationKm 를 달려 충전소에 도착하고, stationToDestKm 를 남긴 상황의 충전 계획.
 * 필요한 만큼만(목적지 arriveSoc 도착) 충전하고, forceCharge 면 상한까지 채운다.
 */
export function planCharge(b: BatteryInput, toStationKm: number, stationToDestKm: number, forceCharge = false): SocPlan {
  const arrive = b.currentSocPct - socUsedPct(b.preset, toStationKm);
  const need = b.arriveSocPct + socUsedPct(b.preset, stationToDestKm);
  const target = forceCharge ? b.chargeCapSocPct : need;
  const chargeTo = Math.max(arrive, Math.min(b.chargeCapSocPct, target));
  return {
    arriveAtStationPct: round1(arrive),
    chargeToPct: round1(chargeTo),
    arriveAtDestinationPct: round1(chargeTo - socUsedPct(b.preset, stationToDestKm)),
  };
}

/** 충전 곡선 선형 보간 */
export function curveKw(p: VehiclePreset, socPct: number): number {
  const c = p.chargeCurve;
  if (socPct <= c[0]![0]) return c[0]![1];
  for (let i = 1; i < c.length; i++) {
    const [s1, k1] = c[i - 1]!;
    const [s2, k2] = c[i]!;
    if (socPct <= s2) return k1 + ((k2 - k1) * (socPct - s1)) / (s2 - s1);
  }
  return c[c.length - 1]![1];
}

/** fromPct → toPct 충전 시간(초). 각 순간 출력 = min(차량 곡선, 충전기 출력 × 효율) */
export function chargeDurationS(p: VehiclePreset, fromPct: number, toPct: number, chargerKw: number, chargerEfficiency: number): number {
  if (toPct <= fromPct) return 0;
  const STEP = 0.5;
  const stepKwh = (p.batteryKwh * STEP) / 100;
  let hours = 0;
  for (let s = Math.max(0, fromPct); s < toPct; s += STEP) {
    const kw = Math.min(curveKw(p, s + STEP / 2), p.maxChargeKw, chargerKw * chargerEfficiency);
    hours += (stepKwh * Math.min(STEP, toPct - s)) / STEP / kw;
  }
  return Math.round(hours * 3600);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

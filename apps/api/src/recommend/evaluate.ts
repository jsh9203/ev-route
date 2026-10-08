// 후보 추출과 비용 계산 (외부 호출 없는 순수 로직)
import { SCORING, statusCategory, type CostBreakdown, type StationSummary, type StatusSource, type VehiclePreset } from '@ev-route/shared';
import { chargeDurationS, planCharge, type BatteryInput, type SocPlan } from '../battery/battery';
import type { StationWithChargers } from '../db/stationStore';
import type { ChargerRow } from '../db/types';
import { expandBbox, type Projection, type RouteLine } from '../route/routeLine';
import type { StationIndex } from '../stations/stationIndex';
import type { ChargerStatus } from '../status/statusService';

export interface Candidate {
  station: StationWithChargers;
  /** 호환 커넥터 + 최소 출력 이상 + 이용제한 없음 */
  eligible: ChargerRow[];
  maxKw: number;
  proj: Projection;
}

export function eligibleChargers(s: StationWithChargers, preset: VehiclePreset, minOutputKw: number): ChargerRow[] {
  return s.chargers.filter(
    (c) => !c.limited && (c.outputKw ?? 0) >= minOutputKw && c.connectors.some((k) => preset.compatibleConnectors.includes(k)),
  );
}

/** 경로 [fromKm, toKm] 구간에서 bufferM 이내, 조건에 맞는 충전기가 있는 충전소 */
export function findCandidates(opts: {
  index: StationIndex;
  line: RouteLine;
  fromKm: number;
  toKm: number;
  bufferM: number;
  preset: VehiclePreset;
  minOutputKw: number;
}): Candidate[] {
  const { index, line, bufferM, preset, minOutputKw } = opts;
  const fromM = opts.fromKm * 1000, toM = opts.toKm * 1000;
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const box of line.chunkBboxes(fromM, toM)) {
    for (const s of index.inBbox(...expandBbox(box, bufferM))) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const eligible = eligibleChargers(s, preset, minOutputKw);
      if (eligible.length === 0) continue;
      const proj = line.project(s.lng, s.lat, bufferM);
      if (!proj || proj.alongM < fromM || proj.alongM > toM) continue;
      out.push({ station: s, eligible, maxKw: Math.max(...eligible.map((c) => c.outputKw ?? 0)), proj });
    }
  }
  return out;
}

/** 경로에서 충전소까지 다녀오는 근사 우회. 반대 차로 휴게소면 null (이용 불가) */
export function approxDetour(c: Candidate): { detourS: number; detourKm: number } | null {
  const onHighway = SCORING.highwayRoadTypes.includes(c.proj.roadType);
  const perpKm = c.proj.perpM / 1000;
  if (c.station.isRestArea && onHighway) {
    if (c.proj.side === 'left' && c.proj.perpM > SCORING.restAreaSideAmbiguousM) return null;
    return { detourS: SCORING.restAreaDetourMin * 60, detourKm: 0.5 };
  }
  const driveMin = ((2 * perpKm) / SCORING.approxLocalSpeedKmh) * 60;
  return { detourS: Math.round((driveMin + (onHighway ? SCORING.highwayExitPenaltyMin : 0)) * 60), detourKm: 2 * perpKm };
}

export interface StatusInput {
  /** undefined 면 실시간 상태 없음 */
  statuses: ChargerStatus[] | undefined;
  /** 상태 조회를 시도했는데 실패했는지 (슈퍼차저는 false) */
  source: StatusSource;
}

export interface Evaluation {
  candidate: Candidate;
  summary: StationSummary;
  socPlan: SocPlan;
  detourS: number;
  chargeS: number;
  etaToStationS: number;
  cost: CostBreakdown;
}

export interface EvalContext {
  battery: BatteryInput;
  totalKm: number;
  baseDurationS: number;
  preferredOperatorIds: readonly string[];
  allowFullStations: boolean;
  forceCharge: boolean;
}

/** 충전소 하나의 계획·비용. 이용 불가(전부 고장, 만차 제외 설정)면 null */
export function evaluate(c: Candidate, detour: { detourS: number; detourKm: number }, status: StatusInput, ctx: EvalContext): Evaluation | null {
  const byId = new Map(status.statuses?.map((s) => [s.chargerId, s]) ?? []);
  let available = 0, busy = 0, unknown = 0, offline = 0;
  let latestChangeAt: string | null = null;
  for (const ch of c.eligible) {
    const st = byId.get(ch.chargerId);
    const cat = st ? statusCategory(st.stat) : 'unknown';
    if (cat === 'available') available++;
    else if (cat === 'busy') busy++;
    else if (cat === 'offline') offline++;
    else unknown++;
    if (st?.changedAt && (!latestChangeAt || st.changedAt > latestChangeAt)) latestChangeAt = st.changedAt;
  }
  if (offline === c.eligible.length) return null;
  const allBusy = available === 0 && unknown === 0;
  if (allBusy && !ctx.allowFullStations) return null;

  const alongKm = c.proj.alongM / 1000;
  const socPlan = planCharge(ctx.battery, alongKm + detour.detourKm / 2, Math.max(0, ctx.totalKm - alongKm) + detour.detourKm / 2, ctx.forceCharge);
  const chargeS = chargeDurationS(ctx.battery.preset, socPlan.arriveAtStationPct, socPlan.chargeToPct, c.maxKw, SCORING.chargerEfficiency);
  const etaToStationS = Math.round(ctx.baseDurationS * (alongKm / Math.max(ctx.totalKm, 0.001)));

  const w = SCORING.wait;
  const waitBase = available >= 2 ? w.twoOrMore : available === 1 ? w.one : allBusy ? w.noneBusy : w.unknown;
  const etaWeight = Math.max(SCORING.etaDecay.minWeight, 1 - etaToStationS / 60 / SCORING.etaDecay.horizonMin);
  const cost: CostBreakdown = {
    detour: detour.detourS / 60,
    charge: chargeS / 60,
    wait: waitBase * etaWeight,
    reliability: c.eligible.length === 1 ? SCORING.singleChargerPenalty : 0,
    preference: c.station.operatorId && ctx.preferredOperatorIds.includes(c.station.operatorId) ? -SCORING.preferredOperatorBonus : 0,
    total: 0,
  };
  cost.total = cost.detour + cost.charge + cost.wait + cost.reliability + cost.preference;
  for (const k of Object.keys(cost) as (keyof CostBreakdown)[]) cost[k] = Math.round(cost[k] * 10) / 10;

  const s = c.station;
  return {
    candidate: c,
    summary: {
      id: s.id, name: s.name, address: s.address, lng: s.lng, lat: s.lat,
      operatorId: s.operatorId, operator: s.operator, isRestArea: s.isRestArea, direction: s.direction,
      chargers: { eligible: c.eligible.length, available, busy, unknown, maxOutputKw: c.maxKw },
      status: { source: status.source, latestChangeAt },
    },
    socPlan,
    detourS: detour.detourS,
    chargeS,
    etaToStationS,
    cost,
  };
}

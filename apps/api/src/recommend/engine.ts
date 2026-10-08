// 추천 파이프라인 (PLAN.md §4)
import {
  findPreset, SCORING,
  type LngLat, type RecommendRequest, type RecommendResponse, type RecommendWarning, type Recommendation, type RouteSummary, type StatusSource,
  type ChargingFee, type TripBattery, type VehiclePreset,
} from '@ev-route/shared';
import type { PriceBook } from '../pricing/priceBook';
import { chargeWindow, socUsedPct, type BatteryInput } from '../battery/battery';
import { haversineM } from '../geo';
import { RouteLine } from '../route/routeLine';
import type { StationIndex } from '../stations/stationIndex';
import type { StatusService } from '../status/statusService';
import type { TmapClient, TmapRoute } from '../tmap/client';
import { approxDetour, evaluate, findCandidates, type EvalContext, type Evaluation } from './evaluate';

export class BadRequestError extends Error {}

export interface EngineDeps {
  tmap: TmapClient;
  index: StationIndex;
  status: StatusService;
  /** 없으면 요금 추정을 하지 않는다 */
  prices?: PriceBook;
}

const toSummary = (r: TmapRoute): RouteSummary => ({ distanceM: r.distanceM, durationS: r.durationS, polyline: r.coords });

export async function recommend(req: RecommendRequest, deps: EngineDeps): Promise<RecommendResponse> {
  const preset = findPreset(req.vehicle.presetId);
  if (!preset) throw new BadRequestError(`알 수 없는 차량 프리셋: ${req.vehicle.presetId}`);
  const prefs = req.preferences;
  const warnings: RecommendWarning[] = preset.provisional ? ['PRESET_PROVISIONAL'] : [];

  const origin: LngLat = [req.origin.lng, req.origin.lat];
  const dest: LngLat = [req.destination.lng, req.destination.lat];
  const base = await deps.tmap.route(origin, dest);
  const line = new RouteLine(base.coords, base.segmentRoadTypes);
  const totalKm = base.distanceM / 1000;

  let battery: BatteryInput = { preset, ...req.vehicle };
  let win = chargeWindow(battery, totalKm, prefs.forceCharge);
  if (win.needed && !win.feasible && win.maxKm > 0 && battery.chargeCapSocPct < 100) {
    // 충전 상한까지만으로는 한 번에 못 가면, 상한을 100% 로 올려 1회 충전이 가능한지 다시 본다 (80% 이상은 곡선상 느리게 계산됨)
    const raised = { ...battery, chargeCapSocPct: 100 };
    const w = chargeWindow(raised, totalKm, prefs.forceCharge);
    if (w.feasible) {
      battery = raised;
      win = w;
      warnings.push('CHARGE_CAP_RAISED');
    }
  }
  const tripUsePct = socUsedPct(preset, totalKm);
  const tripBattery: TripBattery = {
    tripUsePct: round1(tripUsePct),
    arriveWithoutChargePct: round1(req.vehicle.currentSocPct - tripUsePct),
    fullRangeKm: Math.round(preset.batteryKwh * preset.efficiencyKmPerKwh),
  };
  const empty = (chargeWindowKm: [number, number] | null, w: RecommendWarning[] = []): RecommendResponse => ({
    baseRoute: toSummary(base), battery: tripBattery, chargeNeeded: win.needed, chargeWindowKm,
    recommended: null, alternatives: [], warnings: [...warnings, ...w],
  });
  if (!win.needed && !prefs.forceCharge) return empty(null);
  if (win.maxKm <= 0) return empty(null, ['SOC_BELOW_RESERVE']);
  if (!win.feasible) return empty([round1(win.minKm), round1(win.maxKm)], ['MULTI_STOP_REQUIRED']);
  const windowKm: [number, number] = [round1(win.minKm), round1(win.maxKm)];

  // 1차 후보 → 근사 우회 → 상위 K
  const wantSupercharger = prefs.preferSupercharger || prefs.superchargerOnly;
  const candidates = findCandidates({
    index: deps.index, line, fromKm: win.minKm, toKm: win.maxKm,
    bufferM: prefs.bufferKm * 1000, preset, minOutputKw: prefs.minOutputKw,
  }).filter((c) => !prefs.superchargerOnly || c.station.source === 'supercharger');
  const ctx: EvalContext = {
    battery, totalKm, baseDurationS: base.durationS,
    preferredOperatorIds: prefs.preferredOperatorIds, allowFullStations: prefs.allowFullStations, forceCharge: prefs.forceCharge,
  };
  const approx = candidates.flatMap((c) => {
    const d = approxDetour(c);
    const e = d && evaluate(c, d, { statuses: undefined, source: 'unavailable' }, ctx);
    return e ? [{ e, d: d! }] : [];
  });
  approx.sort((a, b) => a.e.cost.total - b.e.cost.total);
  if (wantSupercharger && !approx.some((x) => isSupercharger(x.e))) warnings.push('NO_SUPERCHARGER');
  const topK = approx.slice(0, SCORING.candidateK);
  // 슈퍼차저 우선이면 상위 K 밖의 슈퍼차저도 2곳까지 끌어와 비교 대상에 넣는다
  if (prefs.preferSupercharger) topK.push(...approx.slice(SCORING.candidateK).filter((x) => isSupercharger(x.e)).slice(0, 2));

  // 실시간 상태 결합
  const evcsIds = topK.filter((x) => x.e.candidate.station.source === 'evcs').map((x) => x.e.candidate.station.id);
  const statuses = await deps.status.get(evcsIds);
  if (evcsIds.length > 0 && statuses.size === 0) warnings.push('STATUS_UNAVAILABLE');
  const withStatus = topK.flatMap(({ e, d }) => {
    const s = e.candidate.station;
    const source: StatusSource = s.source === 'supercharger' ? 'supercharger-static' : statuses.has(s.id) ? 'realtime' : 'unavailable';
    const r = evaluate(e.candidate, d, { statuses: statuses.get(s.id), source }, ctx);
    return r ? [r] : [];
  });
  withStatus.sort((a, b) => a.cost.total - b.cost.total);
  const distinct = dedupeSameSite(withStatus);
  const topN = distinct.slice(0, SCORING.preciseN);
  // 슈퍼차저 우선이면 근사 기준 상위 슈퍼차저 2곳은 반드시 정밀 계산에 포함 (근사와 실측 순위가 뒤바뀔 수 있음)
  if (prefs.preferSupercharger) {
    for (const sc of distinct.filter(isSupercharger).slice(0, 2)) if (!topN.includes(sc)) topN.push(sc);
  }
  if (topN.length === 0) return empty(windowKm, warnings.includes('NO_SUPERCHARGER') ? [] : ['NO_CANDIDATE']);

  // 상위 N 개 TMAP 실측 우회
  const precise = await Promise.all(
    topN.map(async (e) => {
      const st = e.candidate.station;
      try {
        const via = await deps.tmap.route(origin, dest, [[st.lng, st.lat]]);
        const detour = { detourS: Math.max(0, via.durationS - base.durationS), detourKm: Math.max(0, (via.distanceM - base.distanceM) / 1000) };
        const r = evaluate(e.candidate, detour, { statuses: statuses.get(st.id), source: e.summary.status.source }, ctx);
        return r ? { e: r, route: toSummary(via) } : null;
      } catch {
        return null;
      }
    }),
  );
  const refined = precise.filter((x): x is { e: Evaluation; route: RouteSummary } => x !== null);
  const feeOf = (e: Evaluation) => chargingFee(e, preset, deps.prices);
  const results = refined.length > 0
    ? refined.map((x) => toRecommendation(x.e, x.route, true, feeOf(x.e)))
    : topN.map((e) => toRecommendation(e, null, false, feeOf(e)));
  const ranked = orderResults(results, prefs.preferSupercharger).map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    baseRoute: toSummary(base),
    battery: tripBattery,
    chargeNeeded: win.needed,
    chargeWindowKm: windowKm,
    recommended: ranked[0] ?? null,
    alternatives: ranked.slice(1),
    warnings,
  };
}

const isSupercharger = (e: Evaluation) => e.candidate.station.source === 'supercharger';

/** 같은 장소(휴게소 등)에 운영사만 다른 충전소가 여러 개면 비용이 가장 낮은 하나만 남긴다. 슈퍼차저와 일반 충전소는 따로 본다 */
export function dedupeSameSite(sorted: readonly Evaluation[]): Evaluation[] {
  const kept: Evaluation[] = [];
  for (const e of sorted) {
    const s = e.candidate.station;
    const dup = kept.some((k) => {
      const t = k.candidate.station;
      return t.source === s.source && haversineM(s.lng, s.lat, t.lng, t.lat) <= SCORING.sameSiteRadiusM;
    });
    if (!dup) kept.push(e);
  }
  return kept;
}

/**
 * 비용순 정렬 후 상위 N. 슈퍼차저 우선이면 가장 좋은 슈퍼차저가
 * 최적보다 허용 시간 이내로 느릴 때 1순위로 올리고, 그렇지 않아도 목록에는 반드시 남긴다.
 */
export function orderResults(list: readonly Recommendation[], preferSupercharger: boolean): Recommendation[] {
  const sorted = [...list].sort((a, b) => a.cost.total - b.cost.total);
  const sc = sorted.find((r) => r.station.operatorId === 'TE');
  if (!preferSupercharger || !sc) return sorted.slice(0, SCORING.preciseN);
  const others = sorted.filter((r) => r !== sc);
  if (sc.cost.total <= sorted[0]!.cost.total + SCORING.superchargerPreferToleranceMin) {
    return [sc, ...others].slice(0, SCORING.preciseN);
  }
  return [...others.slice(0, SCORING.preciseN - 1), sc];
}

/** 충전량 × 운영사 단가. 단가표가 없으면 null */
export function chargingFee(e: Evaluation, preset: VehiclePreset, prices: PriceBook | undefined): ChargingFee | null {
  const quote = prices?.quote(e.candidate.station.operatorId);
  if (!quote) return null;
  const batteryKwh = (Math.max(0, e.socPlan.chargeToPct - e.socPlan.arriveAtStationPct) / 100) * preset.batteryKwh;
  const energyKwh = Math.round(batteryKwh * SCORING.billedEnergyFactor * 10) / 10;
  return { energyKwh, wonPerKwh: quote.wonPerKwh, won: Math.round((energyKwh * quote.wonPerKwh) / 100) * 100, source: quote.source };
}

function toRecommendation(e: Evaluation, route: RouteSummary | null, precise: boolean, fee: ChargingFee | null): Recommendation {
  return {
    rank: 0,
    fee,
    station: e.summary,
    socPlan: e.socPlan,
    detourDurationS: e.detourS,
    chargeDurationS: e.chargeS,
    etaToStationS: e.etaToStationS,
    precise,
    cost: e.cost,
    route,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

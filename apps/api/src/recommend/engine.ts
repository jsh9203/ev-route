// 추천 파이프라인 (PLAN.md §4)
import {
  findPreset, SCORING,
  type LngLat, type RecommendRequest, type RecommendResponse, type RecommendWarning, type Recommendation, type RouteSummary, type StatusSource,
} from '@ev-route/shared';
import { chargeWindow, type BatteryInput } from '../battery/battery';
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

  const battery: BatteryInput = { preset, ...req.vehicle };
  const win = chargeWindow(battery, totalKm, prefs.forceCharge);
  const empty = (chargeWindowKm: [number, number] | null, w: RecommendWarning[] = []): RecommendResponse => ({
    baseRoute: toSummary(base), chargeNeeded: win.needed, chargeWindowKm, recommended: null, alternatives: [], warnings: [...warnings, ...w],
  });
  if (!win.needed && !prefs.forceCharge) return empty(null);
  if (win.maxKm <= 0) return empty(null, ['SOC_BELOW_RESERVE']);
  if (!win.feasible) return empty([round1(win.minKm), round1(win.maxKm)], ['MULTI_STOP_REQUIRED']);
  const windowKm: [number, number] = [round1(win.minKm), round1(win.maxKm)];

  // 1차 후보 → 근사 우회 → 상위 K
  const candidates = findCandidates({
    index: deps.index, line, fromKm: win.minKm, toKm: win.maxKm,
    bufferM: prefs.bufferKm * 1000, preset, minOutputKw: prefs.minOutputKw,
  });
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
  const topK = approx.slice(0, SCORING.candidateK);

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
  const topN = withStatus.slice(0, SCORING.preciseN);
  if (topN.length === 0) return empty(windowKm, ['NO_CANDIDATE']);

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
  const ranked: Recommendation[] = (refined.length > 0
    ? refined.sort((a, b) => a.e.cost.total - b.e.cost.total).map((x) => toRecommendation(x.e, x.route, true))
    : topN.map((e) => toRecommendation(e, null, false))
  ).map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    baseRoute: toSummary(base),
    chargeNeeded: win.needed,
    chargeWindowKm: windowKm,
    recommended: ranked[0] ?? null,
    alternatives: ranked.slice(1),
    warnings,
  };
}

function toRecommendation(e: Evaluation, route: RouteSummary | null, precise: boolean): Recommendation {
  return {
    rank: 0,
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

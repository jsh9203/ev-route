import { describe, expect, it } from 'vitest';
import { RecommendRequestSchema, type LngLat } from '@ev-route/shared';
import type { StationWithChargers } from '../db/stationStore';
import { StationIndex } from '../stations/stationIndex';
import type { StatusService } from '../status/statusService';
import type { TmapClient, TmapRoute } from '../tmap/client';
import { recommend } from './engine';

// 위도 37도를 따라 동쪽으로 약 400km 직선 고속도로 (경도 1도 ≈ 88.9km)
const KM_PER_DEG = 88.9;
const lngAt = (km: number) => 127 + km / KM_PER_DEG;
const coords: LngLat[] = Array.from({ length: 451 }, (_, i) => [127 + i * 0.01, 37]);
const base: TmapRoute = { distanceM: 400_000, durationS: 14_400, coords, segmentRoadTypes: coords.slice(1).map(() => 0) };

const station = (id: string, km: number, latOffset: number, o: Partial<StationWithChargers> = {}): StationWithChargers => ({
  id, name: id, address: null, lng: lngAt(km), lat: 37 + latOffset, operatorId: 'ME', operator: null,
  kindDetail: null, isRestArea: false, direction: null, useTime: null, source: 'evcs',
  chargers: [1, 2].map((n) => ({ stationId: id, chargerId: `0${n}`, chargerType: '04', connectors: ['CCS1'], outputKw: 200, limited: false })),
  ...o,
});

const index = new StationIndex([
  station('REST_RIGHT', 182, -0.002, { isRestArea: true }), // 진행방향 휴게소
  station('REST_LEFT', 182, 0.002, { isRestArea: true }), // 반대 차로 휴게소 → 제외
  station('OFF_ROAD', 180, -0.01), // 고속도로 밖 1.1km → IC 진출입 페널티
  station('TOO_EARLY', 50, -0.002, { isRestArea: true }), // 충전 구간 밖
  station('CHADEMO', 181, -0.002, {
    isRestArea: true,
    chargers: [{ stationId: 'CHADEMO', chargerId: '01', chargerType: '01', connectors: ['CHADEMO'], outputKw: 100, limited: false }],
  }),
]);

const viaCalls: string[] = [];
const tmap: TmapClient = {
  async route(_o, _d, vias = []) {
    if (vias.length === 0) return base;
    const v = vias[0]!;
    const id = index.near(v[0], v[1], 10)[0]!.station.id;
    viaCalls.push(id);
    const extraS = id === 'OFF_ROAD' ? 900 : 90;
    return { ...base, distanceM: base.distanceM + (id === 'OFF_ROAD' ? 2500 : 300), durationS: base.durationS + extraS };
  },
  async searchPlaces() {
    return [];
  },
};
const status: StatusService = {
  async get(ids) {
    return new Map(ids.map((id) => [id, [{ chargerId: '01', stat: '2', changedAt: null }, { chargerId: '02', stat: '2', changedAt: null }]]));
  },
};

const req = RecommendRequestSchema.parse({
  origin: { lng: 127, lat: 37 },
  destination: { lng: 131, lat: 37 },
  vehicle: { presetId: 'tesla-model-y-lr', currentSocPct: 60 },
});

describe('recommend', () => {
  it('진행방향 휴게소를 추천하고 반대 차로·비호환·구간 밖 충전소는 제외', async () => {
    const r = await recommend(req, { tmap, index, status });
    expect(r.chargeNeeded).toBe(true);
    expect(r.chargeWindowKm).toEqual([175, 187.5]);
    expect(r.recommended?.station.id).toBe('REST_RIGHT');
    expect(r.recommended?.precise).toBe(true);
    expect(r.recommended?.detourDurationS).toBe(90);
    const ids = [r.recommended, ...r.alternatives].map((x) => x!.station.id);
    expect(ids).not.toContain('REST_LEFT');
    expect(ids).not.toContain('TOO_EARLY');
    expect(ids).not.toContain('CHADEMO');
    expect(viaCalls).not.toContain('REST_LEFT');
    expect(r.recommended!.socPlan.arriveAtDestinationPct).toBeGreaterThanOrEqual(19.5);
    expect(r.recommended!.station.chargers.available).toBe(2);
    expect(r.warnings).toContain('PRESET_PROVISIONAL');
  });

  it('충전이 필요 없으면 추천 없이 기본 경로만', async () => {
    const shortTmap: TmapClient = { ...tmap, route: async () => ({ ...base, distanceM: 100_000 }) };
    const s = await recommend(req, { tmap: shortTmap, index, status });
    expect(s.chargeNeeded).toBe(false);
    expect(s.recommended).toBeNull();
  });

  it('실시간 상태 조회가 전부 실패해도 추천은 계속하고 경고', async () => {
    const r = await recommend(req, { tmap, index, status: { get: async () => new Map() } });
    expect(r.recommended?.station.status.source).toBe('unavailable');
    expect(r.warnings).toContain('STATUS_UNAVAILABLE');
  });

  it('1회 충전으로 불가능하면 경고', async () => {
    const r = await recommend({ ...req, vehicle: { ...req.vehicle, currentSocPct: 30 } }, { tmap, index, status });
    expect(r.warnings).toContain('MULTI_STOP_REQUIRED');
    expect(r.recommended).toBeNull();
  });
});

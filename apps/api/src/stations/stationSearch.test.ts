import { describe, expect, it } from 'vitest';
import { findPreset } from '@ev-route/shared';
import type { StationWithChargers } from '../db/stationStore';
import type { StatusService } from '../status/statusService';
import { StationIndex } from './stationIndex';
import { searchByName, searchNearby, toListItems } from './stationSearch';

const st = (id: string, name: string, lng: number, lat: number, type = '04', kw = 100): StationWithChargers => ({
  id, name, address: '경기도 수원시 팔달구', lng, lat, operatorId: 'JA', operator: '이브이시스', kindDetail: null,
  isRestArea: false, direction: null, useTime: '10:00 ~ 22:00', source: 'evcs',
  chargers: [1, 2].map((n) => ({ stationId: id, chargerId: `0${n}`, chargerType: type, connectors: type === '02' ? ['AC_SLOW'] : ['CCS1'], outputKw: kw, limited: false })),
});
const index = new StationIndex([
  st('A', '홈플러스 동수원점', 127.0300, 37.2627),
  st('B', '수원시청', 127.0287, 37.2636),
  st('C', '홈플러스 서수원점', 126.97, 37.27),
  st('D', '완속만 있는 홈플러스', 127.031, 37.263, '02', 7),
]);
const opts = { preset: findPreset('tesla-model-y-rwd-2025')!, minOutputKw: 50, compatibleOnly: true, limit: 30 };

describe('searchByName', () => {
  it('공백 무시 부분 일치, 호환 급속 없는 곳 제외', () => {
    expect(searchByName(index, '홈플러스동수원', opts).map((s) => s.id)).toEqual(['A']);
    expect(searchByName(index, '홈플러스', opts).map((s) => s.id).sort()).toEqual(['A', 'C']);
    expect(searchByName(index, '홈플러스', { ...opts, compatibleOnly: false })).toHaveLength(3);
  });
  it('주소로도 찾는다', () => {
    expect(searchByName(index, '팔달구', opts)).toHaveLength(3);
  });
});

describe('searchNearby + toListItems', () => {
  it('가까운 순, 앞쪽에 실시간 상태', async () => {
    const rows = searchNearby(index, 127.0300, 37.2627, 1000, opts);
    expect(rows.map((r) => r.station.id)).toEqual(['A', 'B']);
    const status: StatusService = { get: async (ids) => new Map(ids.map((id) => [id, [{ chargerId: '01', stat: '2', changedAt: null }, { chargerId: '02', stat: '3', changedAt: null }]])) };
    const items = await toListItems(rows.map((r) => ({ station: r.station, distM: r.distM })), opts, status);
    expect(items[0]).toMatchObject({ id: 'A', distanceM: 0, useTime: '10:00 ~ 22:00', chargers: { eligible: 2, available: 1, busy: 1, maxOutputKw: 100 }, status: { source: 'realtime' } });
    expect(items[1]!.distanceM).toBeGreaterThan(100);
  });
});

import { describe, expect, it } from 'vitest';
import { openDb } from '../db/db';
import { createStationWriter, loadPublicStations } from '../db/stationStore';
import type { StationRow } from '../db/types';
import { StationIndex } from './stationIndex';

const station = (id: string, lng: number, lat: number): StationRow => ({
  id, name: id, address: null, lat, lng, operatorId: 'ME', operator: null,
  kindDetail: null, isRestArea: false, direction: null, useTime: null, source: 'evcs',
});

function buildIndex() {
  const db = openDb(':memory:');
  const w = createStationWriter(db, '2026-10-08T00:00:00Z');
  const add = (s: StationRow, limited: boolean) => {
    w.station(s);
    w.charger({ stationId: s.id, chargerId: '01', chargerType: '04', connectors: ['CCS1'], outputKw: 100, limited });
  };
  add(station('GANGNAM', 127.0276, 37.4979), false);
  add(station('SEOCHO', 127.0324, 37.4837), false); // 강남에서 약 1.6km
  add(station('BUSAN', 129.0756, 35.1796), false);
  add(station('APT', 127.028, 37.498), true); // 이용 제한 → 후보 아님
  const idx = new StationIndex(loadPublicStations(db));
  db.close();
  return idx;
}

describe('StationIndex', () => {
  const idx = buildIndex();

  it('이용 제한 충전기만 있는 충전소는 적재하지 않는다', () => {
    expect(idx.size).toBe(3);
    expect(idx.stations.map((s) => s.id)).not.toContain('APT');
  });

  it('bbox 검색', () => {
    const ids = idx.inBbox(126.9, 37.4, 127.1, 37.6).map((s) => s.id).sort();
    expect(ids).toEqual(['GANGNAM', 'SEOCHO']);
  });

  it('반경 검색은 실제 거리로 거르고 가까운 순 정렬', () => {
    expect(idx.near(127.0276, 37.4979, 1000).map((r) => r.station.id)).toEqual(['GANGNAM']);
    const r = idx.near(127.0276, 37.4979, 2000);
    expect(r.map((x) => x.station.id)).toEqual(['GANGNAM', 'SEOCHO']);
    expect(r[1]!.distM).toBeGreaterThan(1500);
  });
});

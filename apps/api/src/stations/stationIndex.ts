import Flatbush from 'flatbush';
import type { StationWithChargers } from '../db/stationStore';
import { haversineM } from '../geo';

const M_PER_DEG_LAT = 111_320;

/** 충전소 좌표 R-tree. 기동 시 한 번 만들고 읽기 전용으로 쓴다 */
export class StationIndex {
  private readonly tree: Flatbush;

  constructor(readonly stations: readonly StationWithChargers[]) {
    this.tree = new Flatbush(Math.max(stations.length, 1));
    for (const s of stations) this.tree.add(s.lng, s.lat, s.lng, s.lat);
    if (stations.length === 0) this.tree.add(0, 0, 0, 0); // flatbush 는 빈 인덱스를 허용하지 않음
    this.tree.finish();
  }

  get size(): number {
    return this.stations.length;
  }

  /** 경위도 사각형 안의 충전소 */
  inBbox(minLng: number, minLat: number, maxLng: number, maxLat: number): StationWithChargers[] {
    return this.tree.search(minLng, minLat, maxLng, maxLat).flatMap((i) => this.stations[i] ?? []);
  }

  /** 좌표 반경 radiusM 이내 충전소 (가까운 순) */
  near(lng: number, lat: number, radiusM: number): { station: StationWithChargers; distM: number }[] {
    const dLat = radiusM / M_PER_DEG_LAT;
    const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    return this.inBbox(lng - dLng, lat - dLat, lng + dLng, lat + dLat)
      .map((station) => ({ station, distM: haversineM(lng, lat, station.lng, station.lat) }))
      .filter((r) => r.distM <= radiusM)
      .sort((a, b) => a.distM - b.distM);
  }
}

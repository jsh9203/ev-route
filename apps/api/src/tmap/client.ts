// TMAP 자동차 경로 / POI 검색 클라이언트
import type { LngLat, PlaceResult } from '@ev-route/shared';

const BASE_URL = 'https://apis.openapi.sk.com/tmap';

export class UpstreamError extends Error {
  constructor(readonly code: 'UPSTREAM_TMAP' | 'UPSTREAM_EVCS', message: string) {
    super(message);
  }
}

export interface TmapRoute {
  distanceM: number;
  durationS: number;
  /** 이어붙인 경로 좌표 */
  coords: LngLat[];
  /** 구간 i (coords[i] → coords[i+1]) 의 TMAP roadType */
  segmentRoadTypes: number[];
}

interface Feature {
  geometry: { type: 'Point' | 'LineString'; coordinates: unknown };
  properties: { totalDistance?: number; totalTime?: number; roadType?: number; lineIndex?: number; pointType?: string };
}

/**
 * TMAP 경로 응답 → 하나의 polyline. LineString 끼리 맞닿는 중복 좌표는 제거.
 * 경유지가 있으면 도착점(pointType 'E') 뒤에 "경유지와 연결된 가상의 라인"(lineIndex 없음)이 붙으므로 제외한다.
 */
export function parseRouteResponse(json: { features?: Feature[] }): TmapRoute {
  const features = json.features;
  const first = features?.[0]?.properties;
  if (!features || first?.totalDistance === undefined || first.totalTime === undefined) {
    throw new UpstreamError('UPSTREAM_TMAP', 'TMAP 경로 응답 형식이 올바르지 않습니다');
  }
  const coords: LngLat[] = [];
  const segmentRoadTypes: number[] = [];
  for (const f of features) {
    if (f.properties.pointType === 'E') break;
    if (f.geometry.type !== 'LineString' || f.properties.lineIndex === undefined) continue;
    const roadType = f.properties.roadType ?? -1;
    for (const c of f.geometry.coordinates as LngLat[]) {
      const last = coords[coords.length - 1];
      if (last && last[0] === c[0] && last[1] === c[1]) continue;
      if (coords.length > 0) segmentRoadTypes.push(roadType);
      coords.push([c[0], c[1]]);
    }
  }
  if (coords.length < 2) throw new UpstreamError('UPSTREAM_TMAP', 'TMAP 경로에 좌표가 없습니다');
  return { distanceM: first.totalDistance, durationS: first.totalTime, coords, segmentRoadTypes };
}

export interface TmapClient {
  route(start: LngLat, end: LngLat, vias?: LngLat[]): Promise<TmapRoute>;
  searchPlaces(keyword: string): Promise<PlaceResult[]>;
}

export function createTmapClient(appKey: string, fetchFn: typeof fetch = fetch): TmapClient {
  async function call(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, headers: { appKey, Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new UpstreamError('UPSTREAM_TMAP', `TMAP 연결 실패: ${(e as Error).message}`);
    }
    if (res.status === 204) return null;
    const body = await res.text();
    if (!res.ok) throw new UpstreamError('UPSTREAM_TMAP', `TMAP HTTP ${res.status}: ${body.slice(0, 200)}`);
    return JSON.parse(body);
  }

  return {
    async route(start, end, vias = []) {
      const body: Record<string, string> = {
        startX: String(start[0]), startY: String(start[1]),
        endX: String(end[0]), endY: String(end[1]),
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
        searchOption: '0', startName: 'start', endName: 'end',
      };
      if (vias.length > 0) body.passList = vias.map(([x, y]) => `${x},${y}`).join('_');
      const json = await call(`${BASE_URL}/routes?version=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return parseRouteResponse(json as { features?: Feature[] });
    },

    async searchPlaces(keyword) {
      const q = new URLSearchParams({ version: '1', searchKeyword: keyword, count: '10', reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO' });
      const json = (await call(`${BASE_URL}/pois?${q}`, { method: 'GET' })) as {
        searchPoiInfo?: { pois?: { poi?: Array<Record<string, string>> } };
      } | null;
      const pois = json?.searchPoiInfo?.pois?.poi ?? [];
      return pois.flatMap((p) => {
        // 경로 탐색에는 진입 좌표(front)를 쓴다
        const lng = Number(p.frontLon ?? p.noorLon);
        const lat = Number(p.frontLat ?? p.noorLat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
        const address = [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.roadName].filter(Boolean).join(' ') || null;
        return [{ name: p.name ?? '', address, lng, lat }];
      });
    },
  };
}

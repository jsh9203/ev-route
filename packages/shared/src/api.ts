// API 응답 타입 (web·api 공유). 좌표는 GeoJSON 순서 [lng, lat]
export type LngLat = [number, number];

export interface RouteSummary {
  distanceM: number;
  durationS: number;
  polyline: LngLat[];
}

export type StatusSource = 'realtime' | 'supercharger-static' | 'unavailable';

export interface StationSummary {
  id: string;
  name: string;
  address: string | null;
  lng: number;
  lat: number;
  operatorId: string | null;
  operator: string | null;
  isRestArea: boolean;
  direction: string | null;
  chargers: {
    /** 호환 커넥터 + 최소 출력 이상 + 이용제한 없음 */
    eligible: number;
    available: number;
    busy: number;
    unknown: number;
    maxOutputKw: number;
  };
  status: { source: StatusSource; latestChangeAt: string | null };
}

export interface CostBreakdown {
  total: number;
  detour: number;
  charge: number;
  wait: number;
  reliability: number;
  preference: number;
}

export interface Recommendation {
  rank: number;
  station: StationSummary;
  socPlan: { arriveAtStationPct: number; chargeToPct: number; arriveAtDestinationPct: number };
  detourDurationS: number;
  chargeDurationS: number;
  etaToStationS: number;
  /** true 면 TMAP 실측 경로 기반, false 면 근사값 */
  precise: boolean;
  cost: CostBreakdown;
  route: RouteSummary | null;
}

export type RecommendWarning =
  | 'MULTI_STOP_REQUIRED'
  | 'SOC_BELOW_RESERVE'
  | 'NO_CANDIDATE'
  | 'STATUS_UNAVAILABLE'
  | 'PRESET_PROVISIONAL';

export interface RecommendResponse {
  baseRoute: RouteSummary;
  chargeNeeded: boolean;
  /** 충전 가능 구간 (출발 후 km) */
  chargeWindowKm: [number, number] | null;
  recommended: Recommendation | null;
  alternatives: Recommendation[];
  warnings: RecommendWarning[];
}

export interface PlaceResult {
  name: string;
  address: string | null;
  lng: number;
  lat: number;
}

export interface ApiError {
  code: 'BAD_REQUEST' | 'NOT_FOUND' | 'UPSTREAM_TMAP' | 'UPSTREAM_EVCS' | 'INTERNAL';
  message: string;
}

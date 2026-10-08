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
  /** 설정한 충전 상한으로는 1회 충전이 불가능해 100% 까지 충전하는 계획으로 계산함 */
  | 'CHARGE_CAP_RAISED'
  | 'SOC_BELOW_RESERVE'
  | 'NO_CANDIDATE'
  /** 슈퍼차저 우선/전용인데 충전 가능 구간에 슈퍼차저가 없음 */
  | 'NO_SUPERCHARGER'
  | 'STATUS_UNAVAILABLE'
  | 'PRESET_PROVISIONAL';

export interface TripBattery {
  /** 기본 경로 전체를 달리는 데 쓰는 배터리 (%p, 100 초과 가능) */
  tripUsePct: number;
  /** 충전 없이 갔을 때 목적지 도착 배터리 (%, 음수면 부족) */
  arriveWithoutChargePct: number;
  /** 이 차량의 100% 기준 주행 가능 거리 (km) */
  fullRangeKm: number;
}

export interface RecommendResponse {
  baseRoute: RouteSummary;
  battery: TripBattery;
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

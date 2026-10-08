import type { LngLat, Recommendation, RecommendWarning, StationListItem } from '@ev-route/shared';

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export const formatKm = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)}km`;

/** 지금부터 seconds 뒤 시각 HH:MM */
export function clockAfter(seconds: number, now = new Date()): string {
  const t = new Date(now.getTime() + seconds * 1000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

export const WARNING_TEXT: Record<RecommendWarning, string> = {
  MULTI_STOP_REQUIRED: '현재 배터리로는 한 번 충전으로 목적지까지 갈 수 없습니다. 출발 배터리를 높이거나 도착 목표 배터리를 낮춰 보세요. (여러 번 충전하는 경로는 추후 지원)',
  CHARGE_CAP_RAISED: '설정한 충전 상한으로는 한 번 충전으로 갈 수 없어, 상한을 넘겨 최대 100%까지 충전하는 계획으로 계산했습니다. 80% 이상은 충전이 느려 시간이 더 걸립니다.',
  SOC_BELOW_RESERVE: '현재 배터리가 최소 여유 배터리보다 낮습니다. 출발지 근처에서 먼저 충전하세요.',
  NO_CANDIDATE: '충전 가능 구간에서 조건에 맞는 충전소를 찾지 못했습니다. 최소 출력을 낮추거나 탐색 반경을 넓혀 보세요.',
  NO_SUPERCHARGER: '충전 가능 구간 근처에 테슬라 슈퍼차저가 없습니다.',
  STATUS_UNAVAILABLE: '충전기 실시간 상태를 불러오지 못해 가용 여부 없이 추천했습니다.',
  PRESET_PROVISIONAL: '차량 배터리·충전 곡선은 공개 자료 기반 추정치입니다.',
};

export type Availability = 'good' | 'few' | 'none' | 'unknown';

export function availabilityOf(r: Recommendation): Availability {
  const c = r.station.chargers;
  if (r.station.status.source !== 'realtime') return 'unknown';
  if (c.available >= 2) return 'good';
  if (c.available === 1) return 'few';
  return c.busy > 0 ? 'none' : 'unknown';
}

/** 충전소 찾기 결과의 가용성 (호환 충전기 기준) */
export function listAvailability(s: StationListItem): Availability {
  const c = s.chargers;
  if (s.status.source !== 'realtime' || c.eligible === 0) return 'unknown';
  if (c.available >= 2) return 'good';
  if (c.available === 1) return 'few';
  return c.busy > 0 ? 'none' : 'unknown';
}

export const AVAILABILITY_COLOR: Record<Availability, string> = {
  good: '#16a34a',
  few: '#ea580c',
  none: '#dc2626',
  unknown: '#64748b',
};

const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
function distM([x1, y1]: LngLat, [x2, y2]: LngLat): number {
  const a = Math.sin(rad(y2 - y1) / 2) ** 2 + Math.cos(rad(y1)) * Math.cos(rad(y2)) * Math.sin(rad(x2 - x1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** polyline 의 [fromKm, toKm] 구간 좌표 */
export function slicePolyline(line: readonly LngLat[], fromKm: number, toKm: number): LngLat[] {
  const out: LngLat[] = [];
  let acc = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) acc += distM(line[i - 1]!, line[i]!);
    const km = acc / 1000;
    if (km >= fromKm && km <= toKm) out.push(line[i]!);
    if (km > toKm) break;
  }
  return out;
}

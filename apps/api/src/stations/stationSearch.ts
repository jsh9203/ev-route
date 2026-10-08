// 충전소 이름 검색 / 좌표 주변 찾기
import type { StationListItem, StatusSource, VehiclePreset } from '@ev-route/shared';
import type { StationWithChargers } from '../db/stationStore';
import { countStatuses, eligibleChargers } from '../recommend/evaluate';
import type { StatusService } from '../status/statusService';
import type { StationIndex } from './stationIndex';

/** 실시간 상태를 조회하는 최대 충전소 수 (공공데이터 호출량 보호) */
const STATUS_LOOKUP_LIMIT = 10;

export interface ListOptions {
  preset: VehiclePreset;
  minOutputKw: number;
  /** true 면 차량 호환 + 최소 출력 이상 충전기가 있는 곳만 */
  compatibleOnly: boolean;
  limit: number;
}

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

export function searchByName(index: StationIndex, q: string, opts: ListOptions): StationWithChargers[] {
  const needle = normalize(q);
  if (!needle) return [];
  const matched: StationWithChargers[] = [];
  for (const s of index.stations) {
    if (!normalize(s.name).includes(needle) && !normalize(s.address ?? '').includes(needle)) continue;
    if (opts.compatibleOnly && eligibleChargers(s, opts.preset, opts.minOutputKw).length === 0) continue;
    matched.push(s);
  }
  // 이름이 검색어로 시작하는 것 → 충전기 많은 순
  return matched
    .sort((a, b) => Number(normalize(b.name).startsWith(needle)) - Number(normalize(a.name).startsWith(needle)) || b.chargers.length - a.chargers.length)
    .slice(0, opts.limit);
}

export function searchNearby(index: StationIndex, lng: number, lat: number, radiusM: number, opts: ListOptions) {
  return index
    .near(lng, lat, radiusM)
    .filter((r) => !opts.compatibleOnly || eligibleChargers(r.station, opts.preset, opts.minOutputKw).length > 0)
    .slice(0, opts.limit);
}

/** 목록에 앞쪽 일부만 실시간 상태를 붙여 응답 형태로 */
export async function toListItems(
  rows: readonly { station: StationWithChargers; distM: number | null }[],
  opts: ListOptions,
  status: StatusService,
): Promise<StationListItem[]> {
  const lookup = rows.filter((r) => r.station.source === 'evcs').slice(0, STATUS_LOOKUP_LIMIT).map((r) => r.station.id);
  const statuses = await status.get(lookup);
  return rows.map(({ station: s, distM }) => {
    const eligible = eligibleChargers(s, opts.preset, opts.minOutputKw);
    const counted = countStatuses(eligible, statuses.get(s.id));
    const source: StatusSource = s.source === 'supercharger' ? 'supercharger-static' : statuses.has(s.id) ? 'realtime' : 'unavailable';
    return {
      id: s.id, name: s.name, address: s.address, lng: s.lng, lat: s.lat,
      operatorId: s.operatorId, operator: s.operator, isRestArea: s.isRestArea, useTime: s.useTime,
      distanceM: distM === null ? null : Math.round(distM),
      chargers: {
        eligible: eligible.length,
        total: s.chargers.length,
        // 호환 충전기가 있으면 그 중 최대, 없으면 전체 중 최대
        maxOutputKw: Math.max(0, ...(eligible.length ? eligible : s.chargers).map((c) => c.outputKw ?? 0)),
        available: counted.available,
        busy: counted.busy,
        unknown: counted.unknown + counted.offline,
      },
      status: { source },
    };
  });
}

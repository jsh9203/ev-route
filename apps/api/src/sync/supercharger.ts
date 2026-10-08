// supercharge.info (커뮤니티 운영 데이터) 에서 한국 테슬라 슈퍼차저 수집·정규화. 실시간 상태 없음.
import type { Connector } from '@ev-route/shared';
import type { ChargerRow, StationRow } from '../db/types';
import { isInKorea } from '../geo';
import { nearestRestArea, type RestAreaRef } from './restArea';

const URL = 'https://supercharge.info/service/supercharge/allSites';
/** 출력 미기재(0) 사이트에 보수적으로 가정하는 값 */
const UNKNOWN_POWER_KW = 120;

export interface SuperchargeSite {
  id: number;
  name?: string;
  status?: string;
  address?: { street?: string; city?: string; country?: string };
  gps?: { latitude?: number; longitude?: number };
  stallCount?: number;
  powerKilowatt?: number;
  plugs?: Record<string, number>;
}

export async function fetchSuperchargeSites(): Promise<SuperchargeSite[]> {
  const res = await fetch(URL, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'ev-route (personal project)' } });
  if (!res.ok) throw new Error(`supercharge.info HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('supercharge.info 응답 형식이 배열이 아님');
  return data as SuperchargeSite[];
}

/** 한국·운영중(OPEN) 사이트만 충전소/충전기로 변환. 휴게소 300m 이내면 한글 이름·방향을 빌려온다 */
export function normalizeSupercharger(
  site: SuperchargeSite,
  restAreas: readonly RestAreaRef[],
): { station: StationRow; chargers: ChargerRow[] } | null {
  if (site.address?.country !== 'South Korea' || site.status !== 'OPEN') return null;
  const lat = Number(site.gps?.latitude);
  const lng = Number(site.gps?.longitude);
  const stalls = Number(site.stallCount);
  if (!isInKorea(lng, lat) || !(stalls > 0)) return null;

  const connectors: Connector[] = [];
  if ((site.plugs?.nacs ?? 0) > 0) connectors.push('NACS');
  if ((site.plugs?.ccs1 ?? 0) > 0) connectors.push('CCS1');
  if (connectors.length === 0) connectors.push('NACS');

  const power = Number(site.powerKilowatt) > 0 ? Number(site.powerKilowatt) : UNKNOWN_POWER_KW;
  const rest = nearestRestArea(lng, lat, restAreas);
  const id = `SC-${site.id}`;
  const englishName = (site.name ?? '').replace(/,\s*South Korea/, '').trim();

  return {
    station: {
      id,
      name: rest ? `테슬라 슈퍼차저 ${rest.name}` : `테슬라 슈퍼차저 ${englishName}`,
      address: [site.address?.city, site.address?.street].filter(Boolean).join(' ') || null,
      lat,
      lng,
      operatorId: 'TE',
      operator: '테슬라',
      kindDetail: rest ? 'C001' : null,
      isRestArea: rest !== null,
      direction: rest?.direction ?? null,
      useTime: null,
      source: 'supercharger',
    },
    chargers: Array.from({ length: stalls }, (_, i) => ({
      stationId: id,
      chargerId: String(i + 1).padStart(2, '0'),
      chargerType: 'SC',
      connectors,
      outputKw: power,
      limited: false,
    })),
  };
}

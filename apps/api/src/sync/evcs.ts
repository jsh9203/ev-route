// 한국환경공단 getChargerInfo 수집·정규화
import { connectorsOf, KIND_DETAIL_HIGHWAY_REST_AREA } from '@ev-route/shared';
import type { ChargerRow, StationRow } from '../db/types';
import { isInKorea } from '../geo';
import { parseDirection } from './restArea';

const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger';
const PAGE_SIZE = 9999; // API 최대값

/** getChargerInfo 응답 item 중 사용하는 필드 */
export interface EvcsInfoItem {
  statNm: string;
  statId: string;
  chgerId: string;
  chgerType: string;
  addr?: string;
  lat: string;
  lng: string;
  useTime?: string;
  busiId?: string;
  busiNm?: string;
  output?: string;
  kindDetail?: string;
  limitYn?: string;
  delYn?: string;
}

const clean = (s: string | undefined) => (s ?? '').trim() || null;

/** 원본 행 하나 → 충전소/충전기. 삭제됐거나 좌표가 잘못된 행은 null */
export function normalizeEvcsItem(x: EvcsInfoItem): { station: StationRow; charger: ChargerRow } | null {
  if (x.delYn === 'Y') return null;
  const lat = Number(x.lat);
  const lng = Number(x.lng);
  if (!x.statId || !x.chgerId || !isInKorea(lng, lat)) return null;

  const name = clean(x.statNm) ?? x.statId;
  const kindDetail = clean(x.kindDetail);
  const isRestArea = kindDetail === KIND_DETAIL_HIGHWAY_REST_AREA;
  const output = Number(x.output);
  return {
    station: {
      id: x.statId.trim(),
      name,
      address: clean(x.addr),
      lat,
      lng,
      operatorId: clean(x.busiId),
      operator: clean(x.busiNm),
      kindDetail,
      isRestArea,
      direction: isRestArea ? parseDirection(name) : null,
      useTime: clean(x.useTime),
      source: 'evcs',
    },
    charger: {
      stationId: x.statId.trim(),
      chargerId: x.chgerId.trim(),
      chargerType: x.chgerType,
      connectors: connectorsOf(x.chgerType),
      outputKw: Number.isFinite(output) && output > 0 ? output : null,
      limited: x.limitYn === 'Y',
    },
  };
}

async function fetchPage(serviceKey: string, pageNo: number): Promise<{ totalCount: number; items: EvcsInfoItem[] }> {
  const url =
    `${BASE_URL}/getChargerInfo?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&dataType=JSON&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { totalCount?: number | string; items?: { item?: EvcsInfoItem[] } };
      if (j.totalCount === undefined) throw new Error('응답에 totalCount 없음');
      return { totalCount: Number(j.totalCount), items: j.items?.item ?? [] };
    } catch (e) {
      if (attempt >= 3) throw new Error(`getChargerInfo page ${pageNo} 실패: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** 전국 충전기 정보를 페이지 단위로 넘겨준다 (전체를 메모리에 올리지 않음) */
export async function* fetchAllEvcsPages(serviceKey: string): AsyncGenerator<{ pageNo: number; totalCount: number; items: EvcsInfoItem[] }> {
  let totalCount = Infinity;
  for (let pageNo = 1; (pageNo - 1) * PAGE_SIZE < totalCount; pageNo++) {
    const page = await fetchPage(serviceKey, pageNo);
    totalCount = page.totalCount;
    yield { pageNo, ...page };
  }
}

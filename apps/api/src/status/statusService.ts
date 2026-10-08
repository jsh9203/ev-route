// 충전기 현재 상태를 충전소 단위로 조회, TTL 캐시
// getChargerStatus 는 최근 period(최대 10)분 안에 상태가 바뀐 충전기만 돌려주므로 현재 상태 조회에 쓸 수 없다.
// getChargerInfo 를 statId 로 조회하면 모든 충전기의 현재 stat 이 온다.
import { UpstreamError } from '../tmap/client';

const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

export interface ChargerStatus {
  chargerId: string;
  stat: string;
  /** 상태가 마지막으로 바뀐 시각 (ISO). 갱신 주기가 아니라 변경 시각임 */
  changedAt: string | null;
}

export interface StatusService {
  /** 조회 실패한 충전소는 결과 Map 에서 빠진다 */
  get(stationIds: readonly string[]): Promise<Map<string, ChargerStatus[]>>;
}

/** 'YYYYMMDDHHmmss' (KST) → ISO */
export function parseKstTimestamp(s: string | undefined): string | null {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00` : null;
}

export function createStatusService(serviceKey: string, ttlSec: number, fetchFn: typeof fetch = fetch, concurrency = 5): StatusService {
  const cache = new Map<string, { at: number; value: ChargerStatus[] }>();

  async function fetchOne(statId: string): Promise<ChargerStatus[]> {
    const url = `${BASE_URL}?serviceKey=${encodeURIComponent(serviceKey)}&dataType=JSON&pageNo=1&numOfRows=100&statId=${encodeURIComponent(statId)}`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new UpstreamError('UPSTREAM_EVCS', `getChargerInfo HTTP ${res.status}`);
    const j = (await res.json()) as { items?: { item?: Array<{ statId: string; chgerId: string; stat: string; statUpdDt?: string; delYn?: string }> } };
    return (j.items?.item ?? [])
      .filter((x) => x.statId?.trim() === statId && x.delYn !== 'Y')
      .map((x) => ({ chargerId: x.chgerId.trim(), stat: x.stat.trim(), changedAt: parseKstTimestamp(x.statUpdDt?.trim()) }));
  }

  return {
    async get(stationIds) {
      const out = new Map<string, ChargerStatus[]>();
      const now = Date.now();
      const todo = stationIds.filter((id) => {
        const hit = cache.get(id);
        if (hit && now - hit.at < ttlSec * 1000) {
          out.set(id, hit.value);
          return false;
        }
        return true;
      });
      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const id = todo[next++]!;
          try {
            const value = await fetchOne(id);
            cache.set(id, { at: Date.now(), value });
            out.set(id, value);
          } catch {
            // 실패한 충전소는 상태 미상으로 둔다
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
      return out;
    },
  };
}

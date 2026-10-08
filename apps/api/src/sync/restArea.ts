import { haversineM } from '../geo';

/**
 * 휴게소 이름의 괄호에서 방향 표기를 뽑는다. 예: '기흥(부산) 휴게소' → '부산', '음성(남이) 휴게소' → '남이'
 * 표시용 값이다. 실제 이용 가능 여부는 추천 단계에서 경로 진행방향 기준 좌·우측으로 판정한다.
 */
export function parseDirection(name: string): string | null {
  const m = name.match(/\(([^()]+)\)/);
  if (!m?.[1]) return null;
  const d = m[1].trim().replace(/\s*방향$/, '');
  return d || null;
}

export interface RestAreaRef {
  name: string;
  lat: number;
  lng: number;
  direction: string | null;
}

/** 좌표에서 maxDistM 이내의 가장 가까운 휴게소 */
export function nearestRestArea(lng: number, lat: number, restAreas: readonly RestAreaRef[], maxDistM = 300): RestAreaRef | null {
  let best: RestAreaRef | null = null;
  let bestDist = maxDistM;
  for (const r of restAreas) {
    const d = haversineM(lng, lat, r.lng, r.lat);
    if (d <= bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}

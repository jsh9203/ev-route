// 경로 polyline 위 투영: 진행거리, 직교거리, 좌·우, 구간 도로유형
import Flatbush from 'flatbush';
import type { LngLat } from '@ev-route/shared';
import { haversineM } from '../geo';

const M_PER_DEG_LAT = 111_320;

export interface Projection {
  /** 출발점부터 투영점까지 경로상 거리 */
  alongM: number;
  /** 경로에서 점까지 직선거리 */
  perpM: number;
  /** 진행방향 기준. 우측통행이라 진행방향 휴게소는 right */
  side: 'left' | 'right';
  segmentIndex: number;
  roadType: number;
}

export class RouteLine {
  /** cumM[i] = coords[0] 부터 coords[i] 까지 경로 거리 */
  readonly cumM: number[];
  private readonly segIndex: Flatbush;

  constructor(
    readonly coords: readonly LngLat[],
    readonly segmentRoadTypes: readonly number[],
  ) {
    if (coords.length < 2) throw new Error('경로 좌표가 2개 미만입니다');
    this.cumM = [0];
    this.segIndex = new Flatbush(coords.length - 1);
    for (let i = 1; i < coords.length; i++) {
      const [x1, y1] = coords[i - 1]!;
      const [x2, y2] = coords[i]!;
      this.cumM.push(this.cumM[i - 1]! + haversineM(x1, y1, x2, y2));
      this.segIndex.add(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
    }
    this.segIndex.finish();
  }

  get lengthM(): number {
    return this.cumM[this.cumM.length - 1]!;
  }

  /** 점에서 maxDistM 이내에 경로가 있으면 가장 가까운 투영 결과 */
  project(lng: number, lat: number, maxDistM: number): Projection | null {
    const dLat = maxDistM / M_PER_DEG_LAT;
    const dLng = maxDistM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    let best: Projection | null = null;
    for (const i of this.segIndex.search(lng - dLng, lat - dLat, lng + dLng, lat + dLat)) {
      const p = this.projectOnSegment(i, lng, lat);
      if (p.perpM <= maxDistM && (!best || p.perpM < best.perpM)) best = p;
    }
    return best;
  }

  private projectOnSegment(i: number, lng: number, lat: number): Projection {
    const [x1, y1] = this.coords[i]!;
    const [x2, y2] = this.coords[i + 1]!;
    // 점 위도 기준 등장방형 평면(m) 근사 — 구간 길이 수백 m 수준이라 충분
    const kx = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    const ax = (x1 - lng) * kx, ay = (y1 - lat) * M_PER_DEG_LAT;
    const bx = (x2 - lng) * kx, by = (y2 - lat) * M_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2));
    const px = ax + t * dx, py = ay + t * dy;
    const segLen = this.cumM[i + 1]! - this.cumM[i]!;
    // 진행벡터 × (점 - 투영점). 점은 원점이므로 (−px, −py). 음수면 오른쪽
    const cross = dx * -py - dy * -px;
    return {
      alongM: this.cumM[i]! + t * segLen,
      perpM: Math.hypot(px, py),
      side: cross < 0 ? 'right' : 'left',
      segmentIndex: i,
      roadType: this.segmentRoadTypes[i] ?? -1,
    };
  }

  /** 경로상 [fromM, toM] 구간을 약 chunkM 단위로 나눈 bbox 목록 (후보 검색용) */
  chunkBboxes(fromM: number, toM: number, chunkM = 2000): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    let box: [number, number, number, number] | null = null;
    let boxStartM = 0;
    for (let i = 0; i < this.coords.length - 1; i++) {
      if (this.cumM[i + 1]! < fromM) continue;
      if (this.cumM[i]! > toM) break;
      const [x1, y1] = this.coords[i]!;
      const [x2, y2] = this.coords[i + 1]!;
      if (!box) {
        box = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
        boxStartM = this.cumM[i]!;
      } else {
        box = [Math.min(box[0], x1, x2), Math.min(box[1], y1, y2), Math.max(box[2], x1, x2), Math.max(box[3], y1, y2)];
      }
      if (this.cumM[i + 1]! - boxStartM >= chunkM) {
        out.push(box);
        box = null;
      }
    }
    if (box) out.push(box);
    return out;
  }
}

/** bbox 를 m 단위로 확장 */
export function expandBbox([minX, minY, maxX, maxY]: [number, number, number, number], m: number): [number, number, number, number] {
  const dLat = m / M_PER_DEG_LAT;
  const dLng = m / (M_PER_DEG_LAT * Math.cos((((minY + maxY) / 2) * Math.PI) / 180));
  return [minX - dLng, minY - dLat, maxX + dLng, maxY + dLat];
}

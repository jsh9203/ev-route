import { describe, expect, it } from 'vitest';
import { parseRouteResponse } from './client';

const point = (c: [number, number], props: object) => ({ geometry: { type: 'Point' as const, coordinates: c }, properties: props });
const line = (cs: [number, number][], props: object) => ({ geometry: { type: 'LineString' as const, coordinates: cs }, properties: props });

describe('parseRouteResponse', () => {
  it('구간을 이어붙이고, 도착점 뒤 경유지 가상 라인은 버린다', () => {
    const r = parseRouteResponse({
      features: [
        point([0, 0], { totalDistance: 2000, totalTime: 120, pointType: 'S' }),
        line([[0, 0], [1, 0]], { lineIndex: 0, roadType: 0 }),
        point([1, 0], { pointType: 'B1' }),
        line([[1, 0], [2, 0]], { lineIndex: 1, roadType: 5 }),
        point([2, 0], { pointType: 'E' }),
        point([1, 0], { pointType: 'B1' }),
        line([[1, 0], [1, 0.0001]], { description: '경유지와 연결된 가상의 라인입니다' }),
      ],
    });
    expect(r.coords).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(r.segmentRoadTypes).toEqual([0, 5]);
    expect(r).toMatchObject({ distanceM: 2000, durationS: 120 });
  });

  it('형식이 다르면 UPSTREAM_TMAP 오류', () => {
    expect(() => parseRouteResponse({})).toThrow(/TMAP/);
  });
});

import { describe, expect, it } from 'vitest';
import { RouteLine } from './routeLine';

// 위도 37도를 따라 동쪽으로 가는 경로: 앞 구간 고속도로(0), 뒤 구간 일반도로(5)
const line = new RouteLine([[127.0, 37.0], [127.1, 37.0], [127.2, 37.0]], [0, 5]);

describe('RouteLine', () => {
  it('누적 거리', () => {
    expect(line.lengthM).toBeGreaterThan(17_700);
    expect(line.lengthM).toBeLessThan(17_900);
  });

  it('진행방향 왼쪽(북쪽) 점', () => {
    const p = line.project(127.05, 37.001, 500)!;
    expect(p.side).toBe('left');
    expect(p.perpM).toBeCloseTo(111, -1);
    expect(p.alongM).toBeCloseTo(line.lengthM / 4, -2);
    expect(p.roadType).toBe(0);
  });

  it('진행방향 오른쪽(남쪽) 점, 두 번째 구간', () => {
    const p = line.project(127.15, 36.999, 500)!;
    expect(p.side).toBe('right');
    expect(p.roadType).toBe(5);
  });

  it('반경 밖이면 null', () => {
    expect(line.project(127.05, 37.1, 500)).toBeNull();
  });

  it('구간 bbox 는 요청 범위만 덮는다', () => {
    const boxes = line.chunkBboxes(0, 5000, 2000);
    expect(boxes.length).toBeGreaterThan(0);
    expect(Math.max(...boxes.map((b) => b[2]))).toBeLessThanOrEqual(127.1);
  });
});

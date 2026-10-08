import { describe, expect, it } from 'vitest';
import { createStatusService, parseKstTimestamp } from './statusService';

const okResponse = (statId: string) =>
  new Response(JSON.stringify({ items: { item: [
    { statId, chgerId: '01', stat: '2', statUpdDt: '20261008141042' },
    { statId, chgerId: '02', stat: '3', statUpdDt: '20261008140545' },
    { statId, chgerId: '03', stat: '2', statUpdDt: '20261008140545', delYn: 'Y' },
  ] } }));

describe('statusService', () => {
  it('충전소별 현재 상태를 받고 TTL 동안 캐시한다', async () => {
    const urls: string[] = [];
    const svc = createStatusService('KEY', 60, async (url) => {
      urls.push(String(url));
      return okResponse(new URL(String(url)).searchParams.get('statId')!);
    });
    const r = await svc.get(['A', 'B']);
    expect(r.get('A')).toEqual([
      { chargerId: '01', stat: '2', changedAt: '2026-10-08T14:10:42+09:00' },
      { chargerId: '02', stat: '3', changedAt: '2026-10-08T14:05:45+09:00' },
    ]);
    expect(urls[0]).toContain('/getChargerInfo?');
    await svc.get(['A']);
    expect(urls).toHaveLength(2);
  });

  it('실패한 충전소는 결과에서 빠진다', async () => {
    const svc = createStatusService('KEY', 60, async (url) =>
      String(url).includes('statId=BAD') ? new Response('err', { status: 500 }) : okResponse('OK'),
    );
    const r = await svc.get(['OK', 'BAD']);
    expect([...r.keys()]).toEqual(['OK']);
  });

  it('KST 타임스탬프 변환', () => {
    expect(parseKstTimestamp('20261008141042')).toBe('2026-10-08T14:10:42+09:00');
    expect(parseKstTimestamp('')).toBeNull();
  });
});

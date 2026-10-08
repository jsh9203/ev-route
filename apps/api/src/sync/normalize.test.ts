import { describe, expect, it } from 'vitest';
import { normalizeEvcsItem, type EvcsInfoItem } from './evcs';
import { nearestRestArea, parseDirection } from './restArea';
import { normalizeSupercharger, type SuperchargeSite } from './supercharger';

const evcs = (o: Partial<EvcsInfoItem> = {}): EvcsInfoItem => ({
  statNm: '기흥(부산) 휴게소 ', statId: 'ME000001', chgerId: '01', chgerType: '04',
  lat: '37.2', lng: '127.1', busiId: 'ME', busiNm: '기후에너지환경부 ', output: '200',
  kindDetail: 'C001', limitYn: 'N', delYn: 'N', ...o,
});

describe('normalizeEvcsItem', () => {
  it('충전소·충전기로 나누고 문자열을 정리한다', () => {
    const r = normalizeEvcsItem(evcs())!;
    expect(r.station).toMatchObject({ id: 'ME000001', name: '기흥(부산) 휴게소', operator: '기후에너지환경부', isRestArea: true, direction: '부산' });
    expect(r.charger).toMatchObject({ connectors: ['CCS1'], outputKw: 200, limited: false });
  });
  it('삭제 충전기·잘못된 좌표는 버린다', () => {
    expect(normalizeEvcsItem(evcs({ delYn: 'Y' }))).toBeNull();
    expect(normalizeEvcsItem(evcs({ lat: '0', lng: '0' }))).toBeNull();
  });
  it('이용자 제한은 충전기 단위로 표시한다', () => {
    expect(normalizeEvcsItem(evcs({ limitYn: 'Y' }))!.charger.limited).toBe(true);
  });
  it('휴게소가 아니면 방향을 뽑지 않고, 출력 미기재는 null', () => {
    const r = normalizeEvcsItem(evcs({ kindDetail: 'E001', statNm: '이마트(성수점)', output: '' }))!;
    expect(r.station.direction).toBeNull();
    expect(r.charger.outputKw).toBeNull();
  });
});

describe('parseDirection', () => {
  it.each([
    ['기흥(부산) 휴게소', '부산'],
    ['음성(남이) 휴게소', '남이'],
    ['덕평(강릉방향) 휴게소', '강릉'],
    ['옥천만남 휴게소', null],
  ])('%s → %s', (name, dir) => expect(parseDirection(name)).toBe(dir));
});

const restAreas = [
  { name: '덕평자연(강릉) 휴게소', lat: 37.2400, lng: 127.3700, direction: '강릉' },
  { name: '덕평자연(인천) 휴게소', lat: 37.2420, lng: 127.3700, direction: '인천' },
];

describe('nearestRestArea', () => {
  it('반경 안에서 가장 가까운 휴게소', () => {
    expect(nearestRestArea(127.3700, 37.2402, restAreas)?.direction).toBe('강릉');
    expect(nearestRestArea(127.40, 37.24, restAreas)).toBeNull();
  });
});

const site = (o: Partial<SuperchargeSite> = {}): SuperchargeSite => ({
  id: 1, name: 'Deokpyeong Rest Area(Gangneung), South Korea', status: 'OPEN',
  address: { country: 'South Korea', city: 'Icheon', street: 'Yeongdong Expressway' },
  gps: { latitude: 37.2401, longitude: 127.3701 }, stallCount: 4, powerKilowatt: 250, plugs: { nacs: 4, ccs1: 4 }, ...o,
});

describe('normalizeSupercharger', () => {
  it('휴게소 근처면 한글 이름·방향을 빌려오고 스톨 수만큼 충전기를 만든다', () => {
    const r = normalizeSupercharger(site(), restAreas)!;
    expect(r.station).toMatchObject({ id: 'SC-1', name: '테슬라 슈퍼차저 덕평자연(강릉) 휴게소', operatorId: 'TE', isRestArea: true, direction: '강릉', source: 'supercharger' });
    expect(r.chargers).toHaveLength(4);
    expect(r.chargers[0]).toMatchObject({ chargerType: 'SC', connectors: ['NACS', 'CCS1'], outputKw: 250 });
  });
  it('휴게소가 아니면 영문 이름 사용', () => {
    const r = normalizeSupercharger(site({ gps: { latitude: 37.5, longitude: 127.0 } }), restAreas)!;
    expect(r.station.name).toBe('테슬라 슈퍼차저 Deokpyeong Rest Area(Gangneung)');
    expect(r.station.isRestArea).toBe(false);
  });
  it('해외·미운영·스톨 0 은 제외', () => {
    expect(normalizeSupercharger(site({ address: { country: 'Japan' } }), restAreas)).toBeNull();
    expect(normalizeSupercharger(site({ status: 'CONSTRUCTION' }), restAreas)).toBeNull();
    expect(normalizeSupercharger(site({ stallCount: 0 }), restAreas)).toBeNull();
  });
  it('출력 미기재는 120kW, 플러그 정보 없으면 NACS', () => {
    const r = normalizeSupercharger(site({ powerKilowatt: 0, plugs: undefined }), restAreas)!;
    expect(r.chargers[0]).toMatchObject({ outputKw: 120, connectors: ['NACS'] });
  });
});

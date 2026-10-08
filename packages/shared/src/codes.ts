// 한국환경공단 전기자동차 충전소 정보 OpenAPI 공통코드
// 출처: references/ 활용가이드 v1.25 (2026-07-01). 명세서 개정 시 이 파일을 갱신한다.

export type Connector =
  | 'CCS1'
  | 'NACS'
  | 'CHADEMO'
  | 'AC_SLOW'
  | 'AC3'
  | 'CCS1_SLOW' // DC콤보(완속): 저출력 DC, 급속 아님
  | 'BUS_ONLY' // DC콤보2(버스전용): 승용차 사용 불가
  | 'UNKNOWN'; // 코드표에 없는 신규 코드

/** chgerType(충전기 타입) → 정규화 커넥터 */
export const CHARGER_TYPES: Readonly<Record<string, { label: string; connectors: readonly Connector[] }>> = {
  '01': { label: 'DC차데모', connectors: ['CHADEMO'] },
  '02': { label: 'AC완속', connectors: ['AC_SLOW'] },
  '03': { label: 'DC차데모+AC3상', connectors: ['CHADEMO', 'AC3'] },
  '04': { label: 'DC콤보', connectors: ['CCS1'] },
  '05': { label: 'DC차데모+DC콤보', connectors: ['CHADEMO', 'CCS1'] },
  '06': { label: 'DC차데모+AC3상+DC콤보', connectors: ['CHADEMO', 'AC3', 'CCS1'] },
  '07': { label: 'AC3상', connectors: ['AC3'] },
  '08': { label: 'DC콤보(완속)', connectors: ['CCS1_SLOW'] },
  '09': { label: 'NACS', connectors: ['NACS'] },
  '10': { label: 'DC콤보+NACS', connectors: ['CCS1', 'NACS'] },
  '11': { label: 'DC콤보2(버스전용)', connectors: ['BUS_ONLY'] },
};

export function connectorsOf(chgerType: string): readonly Connector[] {
  return CHARGER_TYPES[chgerType]?.connectors ?? ['UNKNOWN'];
}

export type StatusCategory = 'available' | 'busy' | 'unknown' | 'offline';

/** stat(충전기 상태) → 추천 계산용 분류 */
export const CHARGER_STAT: Readonly<Record<string, { label: string; category: StatusCategory }>> = {
  '0': { label: '알수없음', category: 'unknown' },
  '1': { label: '통신이상', category: 'unknown' }, // 실제로는 사용 가능한 경우가 있어 offline 으로 보지 않음
  '2': { label: '충전대기', category: 'available' },
  '3': { label: '충전중', category: 'busy' },
  '4': { label: '운영중지', category: 'offline' },
  '5': { label: '점검중', category: 'offline' },
  '6': { label: '예약중', category: 'busy' },
  '9': { label: '상태미확인', category: 'unknown' },
};

export function statusCategory(stat: string): StatusCategory {
  return CHARGER_STAT[stat]?.category ?? 'unknown';
}

/** kindDetail(충전소 구분 상세 코드) 중 추천 로직에서 쓰는 값 */
export const KIND_DETAIL_HIGHWAY_REST_AREA = 'C001';

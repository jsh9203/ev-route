// 추천 비용함수 상수 (단위: 분, 낮을수록 좋음). 튜닝은 이 파일에서만 한다.
export const SCORING = {
  /** 근사 우회: 경로에서 충전소까지 왕복을 이 속도로 이동한다고 가정 */
  approxLocalSpeedKmh: 30,
  /** 근사 우회: 고속도로 구간에서 휴게소가 아닌 충전소로 나갔다 들어오는 IC 진출입 비용 */
  highwayExitPenaltyMin: 8,
  /** 근사 우회: 진행방향 휴게소 진입·이동 동선 */
  restAreaDetourMin: 2,
  /** 경로와 이 거리(m) 이내로 붙은 휴게소는 좌·우 판정을 보류 (양방향 공용 등) */
  restAreaSideAmbiguousM: 30,
  /** TMAP roadType 중 고속도로로 보는 값 (0: 고속국도, 1: 도시고속화도로) */
  highwayRoadTypes: [0, 1] as readonly number[],

  wait: { twoOrMore: 0, one: 5, noneBusy: 20, unknown: 5 },
  /** 지금 상태의 신뢰도를 도착 예정 시간에 따라 낮춤: max(min, 1 - eta/horizon) */
  etaDecay: { minWeight: 0.2, horizonMin: 180 },
  /** 조건에 맞는 충전기가 1대뿐인 충전소 */
  singleChargerPenalty: 5,
  preferredOperatorBonus: 3,

  /** 충전기 공칭 출력 대비 실제 전달 효율 */
  chargerEfficiency: 0.95,
  /** 근사 비용 상위 K개만 실시간 상태 조회, 그중 상위 N개만 TMAP 정밀 경로 */
  candidateK: 15,
  preciseN: 3,
} as const;

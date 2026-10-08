import type { Connector } from './codes';

export interface VehiclePreset {
  id: string;
  name: string;
  /** 사용 가능 배터리 용량 */
  batteryKwh: number;
  /** 고속도로 주행 기준 전비 */
  efficiencyKmPerKwh: number;
  maxChargeKw: number;
  /** [SoC %, 해당 SoC 에서 받을 수 있는 최대 kW] — SoC 오름차순, 구간 사이는 선형 보간 */
  chargeCurve: readonly (readonly [number, number])[];
  compatibleConnectors: readonly Connector[];
  /** true 면 공개 자료 기반 추정치. 실제 충전 기록으로 보정 필요 */
  provisional: boolean;
}

export const VEHICLE_PRESETS: readonly VehiclePreset[] = [
  {
    // 2025년 이후 신형(주니퍼) RWD, LFP 배터리
    // 출처: ev-database.org (사용 가능 60kWh, 피크 175kW, 10→80% 24분·평균 110kW, 110km/h 온화한 날씨 171Wh/km)
    // 국내 인증: 배터리 62.1kWh, 상온 고속 384km / 저온 고속 344km
    id: 'tesla-model-y-rwd-2025',
    name: 'Tesla Model Y RWD (2025~)',
    batteryKwh: 60,
    efficiencyKmPerKwh: 5.8,
    maxChargeKw: 175,
    // LFP 특성: 중간 SoC 까지 높게 유지 후 완만히 감소. 10→80% 약 23분이 되도록 맞춤
    chargeCurve: [
      [0, 170], [10, 175], [20, 175], [30, 160], [40, 130],
      [50, 105], [60, 90], [70, 75], [80, 58], [90, 35], [100, 15],
    ],
    compatibleConnectors: ['NACS', 'CCS1'],
    provisional: true,
  },
  {
    id: 'tesla-model-y-lr',
    name: 'Tesla Model Y Long Range',
    batteryKwh: 75,
    efficiencyKmPerKwh: 5.0,
    maxChargeKw: 250,
    chargeCurve: [
      [0, 250], [10, 250], [20, 240], [30, 200], [40, 170],
      [50, 140], [60, 115], [70, 90], [80, 65], [90, 40], [100, 15],
    ],
    // 차량 NACS 충전구 + DC콤보 컨버터 보유
    compatibleConnectors: ['NACS', 'CCS1'],
    provisional: true,
  },
];

export function findPreset(id: string): VehiclePreset | undefined {
  return VEHICLE_PRESETS.find((p) => p.id === id);
}

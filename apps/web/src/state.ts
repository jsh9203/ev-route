import type { PlaceResult, RecommendRequestInput } from '@ev-route/shared';

export interface FormState {
  origin: PlaceResult | null;
  destination: PlaceResult | null;
  presetId: string;
  currentSocPct: number;
  arriveSocPct: number;
  reserveSocPct: number;
  chargeCapSocPct: number;
  minOutputKw: number;
  bufferKm: number;
  preferSupercharger: boolean;
  superchargerOnly: boolean;
  allowFullStations: boolean;
  forceCharge: boolean;
}

export const DEFAULT_FORM: FormState = {
  origin: null,
  destination: null,
  presetId: 'tesla-model-y-rwd-2025',
  currentSocPct: 60,
  arriveSocPct: 20,
  reserveSocPct: 10,
  chargeCapSocPct: 80,
  minOutputKw: 100,
  bufferKm: 3,
  preferSupercharger: false,
  superchargerOnly: false,
  allowFullStations: false,
  forceCharge: false,
};

const STORAGE_KEY = 'ev-route:form';

/** 마지막 입력값 (브라우저 저장소를 못 쓰면 기본값) */
export function loadForm(): FormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FORM;
    const saved = JSON.parse(raw) as Partial<FormState> & { presetVersion?: number };
    // v2: 기본 차량을 Model Y RWD(2025~)로 변경 — 이전에 저장된 기본값(LR)은 한 번 바꿔준다
    if (saved.presetVersion !== 2) saved.presetId = DEFAULT_FORM.presetId;
    return { ...DEFAULT_FORM, ...saved };
  } catch {
    return DEFAULT_FORM;
  }
}

export function saveForm(f: FormState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...f, presetVersion: 2 }));
  } catch {
    // 저장 실패는 무시
  }
}

export function toRequest(f: FormState): RecommendRequestInput {
  return {
    origin: f.origin!,
    destination: f.destination!,
    vehicle: {
      presetId: f.presetId,
      currentSocPct: f.currentSocPct,
      arriveSocPct: f.arriveSocPct,
      reserveSocPct: f.reserveSocPct,
      chargeCapSocPct: f.chargeCapSocPct,
    },
    preferences: {
      minOutputKw: f.minOutputKw,
      bufferKm: f.bufferKm,
      allowFullStations: f.allowFullStations,
      forceCharge: f.forceCharge,
      preferSupercharger: f.preferSupercharger,
      superchargerOnly: f.superchargerOnly,
    },
  };
}

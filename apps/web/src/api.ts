import type { ApiError, PlaceResult, RecommendRequestInput, RecommendResponse, VehiclePreset } from '@ev-route/shared';

export class ApiRequestError extends Error {
  constructor(readonly code: ApiError['code'] | 'NETWORK', message: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiRequestError('NETWORK', '서버에 연결할 수 없습니다. API 서버가 실행 중인지 확인하세요.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as ApiError | null;
    throw new ApiRequestError(err?.code ?? 'INTERNAL', err?.message ?? `요청 실패 (HTTP ${res.status})`);
  }
  return body as T;
}

export const api = {
  config: () => request<{ tmapWebAppKey: string }>('/api/v1/config'),
  presets: () => request<VehiclePreset[]>('/api/v1/vehicles/presets'),
  searchPlaces: (q: string) => request<PlaceResult[]>(`/api/v1/places/search?q=${encodeURIComponent(q)}`),
  recommend: (body: RecommendRequestInput) =>
    request<RecommendResponse>('/api/v1/routes/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

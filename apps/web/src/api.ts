import type { ApiError, PlaceResult, RecommendRequestInput, RecommendResponse, StationListItem, VehiclePreset } from '@ev-route/shared';

export interface StationListOptions {
  presetId: string;
  minOutputKw: number;
  compatibleOnly: boolean;
}
const listParams = (o: StationListOptions) => ({ presetId: o.presetId, minOutputKw: String(o.minOutputKw), compatibleOnly: String(o.compatibleOnly) });

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
  searchStations: (q: string, o: StationListOptions) =>
    request<StationListItem[]>(`/api/v1/stations/search?${new URLSearchParams({ q, ...listParams(o) })}`),
  nearbyStations: (lng: number, lat: number, radiusKm: number, o: StationListOptions) =>
    request<StationListItem[]>(`/api/v1/stations/nearby?${new URLSearchParams({ lng: String(lng), lat: String(lat), radiusKm: String(radiusKm), ...listParams(o) })}`),
  recommend: (body: RecommendRequestInput) =>
    request<RecommendResponse>('/api/v1/routes/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

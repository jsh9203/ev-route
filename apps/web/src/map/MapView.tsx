import { useQuery } from '@tanstack/react-query';
import type { LngLat, PlaceResult, RecommendResponse, StationListItem } from '@ev-route/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AVAILABILITY_COLOR, availabilityOf, listAvailability, slicePolyline, SUPERCHARGER_COLOR } from '../lib/format';
import { labelPin, rankPin, stationPin, type MarkerIcon } from './markers';
import { loadTmap, type TMap, type TOverlay, type Tmapv2Namespace } from './tmap';

const KOREA_CENTER = { lat: 36.4, lng: 127.8 };
/** 줌이 끝난 것으로 보는 대기 시간 (마지막 줌 이벤트 이후) */
const ZOOM_SETTLE_MS = 400;

interface Props {
  mode: 'route' | 'stations';
  origin: PlaceResult | null;
  destination: PlaceResult | null;
  result: RecommendResponse | null;
  selectedRank: number | null;
  onSelectRank: (rank: number) => void;
  stations: StationListItem[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  /** 지도 클릭 위치 (출발/도착 선택 모드일 때만 의미 있음) */
  onMapClick: (p: LngLat) => void;
}

export function MapView(props: Props) {
  const { mode, origin, destination, result, selectedRank, stations, selectedStationId } = props;
  const containerId = 'tmap-container';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TMap | null>(null);
  const sdkRef = useRef<Tmapv2Namespace | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(props);
  cb.current = props;

  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });

  // 지도 1회 생성
  useEffect(() => {
    if (!config.data || mapRef.current) return;
    let cancelled = false;
    loadTmap(config.data.tmapWebAppKey)
      .then((T) => {
        if (cancelled || mapRef.current) return;
        sdkRef.current = T;
        const map = new T.Map(containerId, {
          center: new T.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng),
          width: '100%',
          height: '100%',
          zoom: 7,
          zoomControl: true,
          scrollwheel: true,
        });
        map.addListener('click', (e) => cb.current.onMapClick([e.latLng.lng(), e.latLng.lat()]));
        map.addListener('zoom_changed', () => hideVectorsWhileZooming());
        mapRef.current = map;
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [config.data]);

  // TMAP SDK 는 줌 애니메이션 때 경로선(canvas)을 지도 타일과 따로 확대하는데,
  // 드래그로 지도를 옮긴 뒤에는 확대 기준점이 어긋나 경로선이 지도보다 먼저/다르게 움직인다.
  // SDK 내부 동작이라 고칠 수 없으므로, 줌하는 동안만 경로선을 숨기고 끝나면 다시 보여준다.
  const settleTimer = useRef<number | undefined>(undefined);
  const hideVectorsWhileZooming = () => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.add('vectors-hidden');
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => el.classList.remove('vectors-hidden'), ZOOM_SETTLE_MS);
  };
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // 휠·더블클릭은 zoom_changed 보다 먼저 와서, 애니메이션 시작 전에 숨길 수 있다
    el.addEventListener('wheel', hideVectorsWhileZooming, { capture: true, passive: true });
    el.addEventListener('dblclick', hideVectorsWhileZooming, { capture: true });
    return () => {
      el.removeEventListener('wheel', hideVectorsWhileZooming, { capture: true });
      el.removeEventListener('dblclick', hideVectorsWhileZooming, { capture: true });
    };
  }, []);

  const marker = (T: Tmapv2Namespace, map: TMap, lat: number, lng: number, icon: MarkerIcon, title: string, zIndex: number) =>
    new T.Marker({ position: new T.LatLng(lat, lng), map, icon: icon.url, iconSize: new T.Size(icon.width, icon.height), title, zIndex });

  // 출발/도착 마커
  useOverlays(ready, sdkRef, mapRef, (T, map) => {
    const out: TOverlay[] = [];
    if (origin) out.push(marker(T, map, origin.lat, origin.lng, labelPin('출발', '#2563eb'), origin.name, 40));
    if (destination) out.push(marker(T, map, destination.lat, destination.lng, labelPin('도착', '#0f172a'), destination.name, 40));
    return out;
  }, [origin, destination]);

  // 경로 추천: 경로·충전 구간·추천 충전소
  useOverlays(ready, sdkRef, mapRef, (T, map) => {
    if (mode !== 'route' || !result) return [];
    const toPath = (line: readonly LngLat[]) => line.map(([lng, lat]) => new T.LatLng(lat, lng));
    const out: TOverlay[] = [];
    out.push(new T.Polyline({ path: toPath(result.baseRoute.polyline), strokeColor: '#94a3b8', strokeWeight: 6, strokeOpacity: 0.9, map }));
    if (result.chargeWindowKm && result.chargeWindowKm[0] < result.chargeWindowKm[1]) {
      const seg = slicePolyline(result.baseRoute.polyline, result.chargeWindowKm[0], result.chargeWindowKm[1]);
      if (seg.length > 1) out.push(new T.Polyline({ path: toPath(seg), strokeColor: '#22c55e', strokeWeight: 14, strokeOpacity: 0.35, map }));
    }
    const recs = [result.recommended, ...result.alternatives].filter((r) => r !== null);
    const selected = recs.find((r) => r.rank === selectedRank);
    if (selected?.route) out.push(new T.Polyline({ path: toPath(selected.route.polyline), strokeColor: '#2563eb', strokeWeight: 6, map }));
    for (const r of recs) {
      const isSel = r.rank === selectedRank;
      const color = r.station.operatorId === 'TE' ? SUPERCHARGER_COLOR : AVAILABILITY_COLOR[availabilityOf(r)];
      const m = marker(T, map, r.station.lat, r.station.lng, rankPin(r.rank, color, isSel), r.station.name, isSel ? 30 : 10);
      m.addListener('click', () => cb.current.onSelectRank(r.rank));
      out.push(m);
    }
    return out;
  }, [mode, result, selectedRank]);

  // 충전소 찾기: 결과 마커
  useOverlays(ready, sdkRef, mapRef, (T, map) => {
    if (mode !== 'stations') return [];
    return stations.map((s) => {
      const isSel = s.id === selectedStationId;
      const color = s.operatorId === 'TE' ? SUPERCHARGER_COLOR : AVAILABILITY_COLOR[listAvailability(s)];
      const icon = stationPin(color, { selected: isSel });
      const m = marker(T, map, s.lat, s.lng, icon, s.name, isSel ? 30 : 10);
      m.addListener('click', () => cb.current.onSelectStation(s.id));
      return m;
    });
  }, [mode, stations, selectedStationId]);

  // 화면 맞추기: 새 추천 결과 → 기본 경로 / 새 충전소 목록 → 결과 전체
  useEffect(() => {
    const T = sdkRef.current, map = mapRef.current;
    if (!ready || !T || !map) return;
    const points: LngLat[] =
      mode === 'route' ? result?.baseRoute.polyline ?? [] : stations.map((s) => [s.lng, s.lat] as LngLat);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(new T.LatLng(points[0]![1], points[0]![0]));
      map.setZoom(15);
      return;
    }
    const bounds = new T.LatLngBounds();
    for (const [lng, lat] of points) bounds.extend(new T.LatLng(lat, lng));
    map.fitBounds(bounds, 60);
  }, [ready, mode, result, stations]);

  // 목록에서 충전소를 고르면 그 위치로 이동
  useEffect(() => {
    const T = sdkRef.current, map = mapRef.current;
    const s = stations.find((x) => x.id === selectedStationId);
    if (!ready || !T || !map || !s) return;
    map.setCenter(new T.LatLng(s.lat, s.lng));
    if (map.getZoom() < 15) map.setZoom(15);
  }, [ready, selectedStationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div id={containerId} ref={containerRef} className="h-full w-full" />
      {ready && ((mode === 'route' && result?.recommended) || (mode === 'stations' && stations.length > 0)) && <Legend />}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-slate-500">
          {error ?? config.error?.message ?? '지도를 불러오는 중…'}
        </div>
      )}
    </div>
  );
}

const LEGEND: [string, string][] = [
  [AVAILABILITY_COLOR.good, '사용 가능 2기 이상'],
  [AVAILABILITY_COLOR.few, '사용 가능 1기'],
  [AVAILABILITY_COLOR.none, '모두 충전 중'],
  [AVAILABILITY_COLOR.unknown, '실시간 정보 없음'],
  [SUPERCHARGER_COLOR, '테슬라 슈퍼차저'],
];

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-8 left-3 rounded-lg bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow">
      {LEGEND.map(([color, label]) => (
        <div key={label} className="flex items-center gap-1.5 py-0.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {label}
        </div>
      ))}
    </div>
  );
}

/** deps 가 바뀔 때마다 이전 오버레이를 지우고 새로 그린다 */
function useOverlays(
  ready: boolean,
  sdkRef: React.RefObject<Tmapv2Namespace | null>,
  mapRef: React.RefObject<TMap | null>,
  draw: (T: Tmapv2Namespace, map: TMap) => TOverlay[],
  deps: unknown[],
) {
  useEffect(() => {
    const T = sdkRef.current, map = mapRef.current;
    if (!ready || !T || !map) return;
    const overlays = draw(T, map);
    return () => overlays.forEach((o) => o.setMap(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);
}

import { useQuery } from '@tanstack/react-query';
import type { LngLat, PlaceResult, RecommendResponse } from '@ev-route/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AVAILABILITY_COLOR, availabilityOf, slicePolyline } from '../lib/format';
import { loadTmap, type TMap, type TOverlay, type Tmapv2Namespace } from './tmap';

const KOREA_CENTER = { lat: 36.4, lng: 127.8 };

interface Props {
  origin: PlaceResult | null;
  destination: PlaceResult | null;
  result: RecommendResponse | null;
  selectedRank: number | null;
  onSelectRank: (rank: number) => void;
  /** 지도 클릭 위치 (출발/도착 선택 모드일 때만 의미 있음) */
  onMapClick: (p: LngLat) => void;
}

/** 번호가 들어간 핀 아이콘 (data URI SVG) */
function pinIcon(label: string, color: string, size = 34): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.3}" viewBox="0 0 34 44">
<path d="M17 43C17 43 2 27 2 17a15 15 0 0 1 30 0c0 10-15 26-15 26z" fill="${color}" stroke="white" stroke-width="2.5"/>
<text x="17" y="22" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function MapView({ origin, destination, result, selectedRank, onSelectRank, onMapClick }: Props) {
  const containerId = 'tmap-container';
  const mapRef = useRef<TMap | null>(null);
  const sdkRef = useRef<Tmapv2Namespace | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onSelectRef = useRef(onSelectRank);
  onSelectRef.current = onSelectRank;

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
        map.addListener('click', (e) => onMapClickRef.current([e.latLng.lng(), e.latLng.lat()]));
        mapRef.current = map;
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [config.data]);

  // 출발/도착 마커
  useOverlays(ready, sdkRef, mapRef, (T, map) => {
    const out: TOverlay[] = [];
    if (origin) out.push(new T.Marker({ position: new T.LatLng(origin.lat, origin.lng), map, icon: pinIcon('출', '#2563eb'), iconSize: new T.Size(34, 44), title: origin.name, zIndex: 20 }));
    if (destination) out.push(new T.Marker({ position: new T.LatLng(destination.lat, destination.lng), map, icon: pinIcon('도', '#0f172a'), iconSize: new T.Size(34, 44), title: destination.name, zIndex: 20 }));
    return out;
  }, [origin, destination]);

  // 경로·충전 구간·충전소 마커
  useOverlays(ready, sdkRef, mapRef, (T, map) => {
    if (!result) return [];
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
      const m = new T.Marker({
        position: new T.LatLng(r.station.lat, r.station.lng),
        map,
        icon: pinIcon(String(r.rank), AVAILABILITY_COLOR[availabilityOf(r)], isSel ? 42 : 32),
        iconSize: isSel ? new T.Size(42, 55) : new T.Size(32, 42),
        title: r.station.name,
        zIndex: isSel ? 30 : 10,
      });
      m.addListener('click', () => onSelectRef.current(r.rank));
      out.push(m);
    }
    return out;
  }, [result, selectedRank]);

  // 새 결과가 오면 기본 경로에 맞춰 화면 이동
  useEffect(() => {
    const T = sdkRef.current, map = mapRef.current;
    if (!ready || !T || !map || !result) return;
    const bounds = new T.LatLngBounds();
    for (const [lng, lat] of result.baseRoute.polyline) bounds.extend(new T.LatLng(lat, lng));
    map.fitBounds(bounds, 60);
  }, [ready, result]);

  return (
    <div className="relative h-full w-full">
      <div id={containerId} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-slate-500">
          {error ?? config.error?.message ?? '지도를 불러오는 중…'}
        </div>
      )}
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

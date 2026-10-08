// TMAP JS SDK v2 동적 로더와 사용하는 API 의 최소 타입
//
// 공식 로더(jsv2?appKey=...)는 document.write 로 본체 스크립트(tmapjs2.min.js)를 넣는다.
// 페이지 로드 후 동적으로 넣은 스크립트의 document.write 는 무시되므로,
// 로더 실행 동안만 document.write 를 가로채 <script> 태그를 직접 추가한다.
// 로더 <script> 는 appKey 가 담긴 src 그대로 DOM 에 남겨둔다 (본체가 키를 거기서 읽을 수 있음).

export interface TLatLng {
  lat(): number;
  lng(): number;
}
export interface TMap {
  setCenter(c: TLatLng): void;
  setZoom(z: number): void;
  fitBounds(b: TLatLngBounds, margin?: number | { left: number; top: number; right: number; bottom: number }): void;
  addListener(event: 'click', fn: (e: { latLng: TLatLng }) => void): void;
  destroy?(): void;
}
export interface TLatLngBounds {
  extend(p: TLatLng): void;
}
export interface TOverlay {
  setMap(m: TMap | null): void;
}
export interface TMarker extends TOverlay {
  addListener(event: 'click', fn: () => void): void;
}
export interface Tmapv2Namespace {
  Map: new (el: string | HTMLElement, opts: { center: TLatLng; width: string; height: string; zoom: number; zoomControl?: boolean; scrollwheel?: boolean }) => TMap;
  LatLng: new (lat: number, lng: number) => TLatLng;
  LatLngBounds: new () => TLatLngBounds;
  Polyline: new (opts: { path: TLatLng[]; strokeColor: string; strokeWeight: number; strokeOpacity?: number; map: TMap }) => TOverlay;
  Marker: new (opts: { position: TLatLng; map: TMap; icon?: string; iconSize?: unknown; title?: string; zIndex?: number }) => TMarker;
  Size: new (w: number, h: number) => unknown;
}

declare global {
  interface Window {
    Tmapv2?: Partial<Tmapv2Namespace>;
  }
}

let loading: Promise<Tmapv2Namespace> | null = null;

export function loadTmap(appKey: string): Promise<Tmapv2Namespace> {
  if (loading) return loading;
  loading = new Promise<Tmapv2Namespace>((resolve, reject) => {
    const inner: Promise<void>[] = [];
    const originalWrite = document.write.bind(document);
    document.write = (...chunks: string[]) => {
      for (const m of chunks.join('').matchAll(/<script[^>]*src=['"]([^'"]+)['"][^>]*><\/script>/gi)) {
        inner.push(addScript(m[1]!));
      }
    };
    addScript(`https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(appKey)}`)
      .then(() => {
        document.write = originalWrite;
        return Promise.all(inner);
      })
      .then(() => waitFor(() => typeof window.Tmapv2?.Map === 'function', 10_000))
      .then(() => resolve(window.Tmapv2 as Tmapv2Namespace))
      .catch((e) => {
        document.write = originalWrite;
        loading = null;
        reject(e);
      });
  });
  return loading;
}

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`TMAP 지도 스크립트를 불러오지 못했습니다 (${new URL(src).host})`));
    document.head.appendChild(s);
  });
}

function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('TMAP 지도 SDK 초기화 시간 초과'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

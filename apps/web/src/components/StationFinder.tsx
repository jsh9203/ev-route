import { useQuery } from '@tanstack/react-query';
import type { PlaceResult, StationListItem } from '@ev-route/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { availabilityTextColor, formatDistance, listAvailability } from '../lib/format';

type Search =
  | { kind: 'name'; q: string }
  | { kind: 'near'; which: 'origin' | 'destination'; radiusKm: number }
  | null;

interface Props {
  presetId: string;
  origin: PlaceResult | null;
  destination: PlaceResult | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResults: (stations: StationListItem[]) => void;
}

export function StationFinder({ presetId, origin, destination, selectedId, onSelect, onResults }: Props) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState<Search>(null);
  const [radiusKm, setRadiusKm] = useState(3);
  const [minOutputKw, setMinOutputKw] = useState(50);
  const [compatibleOnly, setCompatibleOnly] = useState(true);

  // 이름 입력은 0.3초 멈추면 검색
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => setSearch({ kind: 'name', q }), 300);
    return () => clearTimeout(t);
  }, [text]);

  const nearPlace = search?.kind === 'near' ? (search.which === 'origin' ? origin : destination) : null;
  const opts = { presetId, minOutputKw, compatibleOnly };
  const query = useQuery({
    queryKey: ['stations', search, nearPlace?.lng, nearPlace?.lat, opts],
    queryFn: () =>
      search!.kind === 'name'
        ? api.searchStations(search!.q, opts)
        : api.nearbyStations(nearPlace!.lng, nearPlace!.lat, search!.radiusKm, opts),
    enabled: search !== null && (search.kind === 'name' || nearPlace !== null),
    staleTime: 60_000,
  });
  const stations = query.data ?? [];
  useEffect(() => onResults(query.data ?? []), [query.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // 지도에서 핀을 눌러 선택이 바뀌면 목록도 그 카드로 스크롤
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-station-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId]);

  const nearBtn = (which: 'origin' | 'destination', place: PlaceResult | null, label: string) => {
    const active = search?.kind === 'near' && search.which === which;
    return (
      <button
        type="button"
        disabled={!place}
        title={place ? place.name : `${label}를 먼저 지정하세요 (경로 추천 탭)`}
        onClick={() => {
          setText('');
          setSearch({ kind: 'near', which, radiusKm });
        }}
        className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
      >
        {label} 주변
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">충전소 이름·주소 검색</span>
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="예: 홈플러스 동수원, 덕평휴게소"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <div>
        <span className="mb-1 block text-xs font-medium text-slate-500">주변 충전소 찾기</span>
        <div className="flex gap-2">
          {nearBtn('origin', origin, '출발지')}
          {nearBtn('destination', destination, '도착지')}
          <select
            aria-label="반경"
            className="rounded-lg border border-slate-300 bg-white px-2 text-sm"
            value={radiusKm}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRadiusKm(r);
              if (search?.kind === 'near') setSearch({ ...search, radiusKm: r });
            }}
          >
            {[1, 3, 5, 10].map((r) => <option key={r} value={r}>{r}km</option>)}
          </select>
        </div>
        {!origin && !destination && <p className="mt-1 text-xs text-slate-400">경로 추천 탭에서 출발지·도착지를 지정하면 쓸 수 있습니다.</p>}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-700">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="accent-blue-600" checked={compatibleOnly} onChange={(e) => setCompatibleOnly(e.target.checked)} />
          내 차로 쓸 수 있는 급속만
        </label>
        <select
          aria-label="최소 출력"
          disabled={!compatibleOnly}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40"
          value={minOutputKw}
          onChange={(e) => setMinOutputKw(Number(e.target.value))}
        >
          {[50, 100, 200].map((kw) => <option key={kw} value={kw}>{kw}kW 이상</option>)}
        </select>
      </div>

      {query.isFetching && <p className="text-sm text-slate-400">찾는 중…</p>}
      {query.isError && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{query.error.message}</div>}
      {query.isSuccess && !query.isFetching && (
        <p className="text-xs text-slate-500">
          {stations.length === 0 ? '조건에 맞는 충전소가 없습니다.' : `${stations.length}곳${stations.length >= 30 ? ' (상위 30곳)' : ''} · 앞쪽 10곳만 실시간 상태 표시`}
        </p>
      )}

      <ul ref={listRef} className="space-y-2">
        {stations.map((s) => (
          <li key={s.id} data-station-id={s.id}>
            <StationCard s={s} selected={s.id === selectedId} onClick={() => onSelect(s.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StationCard({ s, selected, onClick }: { s: StationListItem; selected: boolean; onClick: () => void }) {
  const c = s.chargers;
  const color = availabilityTextColor(listAvailability(s));
  const status =
    s.status.source === 'realtime'
      ? `사용 가능 ${c.available} · 충전 중 ${c.busy}${c.unknown ? ` · 미확인 ${c.unknown}` : ''} / ${c.eligible}기`
      : s.status.source === 'supercharger-static'
        ? `실시간 정보 없음 · ${c.eligible}기`
        : `상태 미조회 · 호환 ${c.eligible}기 / 전체 ${c.total}기`;
  const limitedHours = s.useTime && !/24\s*시간/.test(s.useTime);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl border bg-white p-3 text-left transition ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-900">{s.name}</span>
            {s.operatorId === 'TE' && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">슈퍼차저</span>}
            {s.isRestArea && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">휴게소</span>}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{s.operator ?? '운영기관 미상'} · 최대 {c.maxOutputKw}kW</div>
        </div>
        {s.distanceM !== null && <span className="shrink-0 text-sm font-semibold text-slate-700">{formatDistance(s.distanceM)}</span>}
      </div>
      <div className="mt-1.5 text-xs font-medium" style={{ color }}>{status}</div>
      {limitedHours && <div className="mt-0.5 text-xs text-amber-700">이용 시간 {s.useTime}</div>}
      {s.address && <div className="mt-0.5 truncate text-[11px] text-slate-400">{s.address}</div>}
    </button>
  );
}

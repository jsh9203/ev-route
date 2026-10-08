import { useMutation, useQuery } from '@tanstack/react-query';
import type { LngLat, RecommendResponse, StationListItem } from '@ev-route/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { Attribution } from './components/Attribution';
import { BottomSheet, snapHeight, type SheetSnap } from './components/BottomSheet';
import { ResultPanel } from './components/ResultPanel';
import { SearchForm } from './components/SearchForm';
import { StationFinder } from './components/StationFinder';
import { useIsMobile, useViewportHeight } from './lib/useMediaQuery';
import { MapView } from './map/MapView';
import { loadForm, saveForm, toRequest, type FormState } from './state';

type Tab = 'route' | 'stations';

export function App() {
  const [tab, setTab] = useState<Tab>('route');
  const [form, setForm] = useState<FormState>(loadForm);
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [stations, setStations] = useState<StationListItem[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const presets = useQuery({ queryKey: ['presets'], queryFn: api.presets, staleTime: Infinity });

  const isMobile = useIsMobile();
  const viewportH = useViewportHeight();
  const [sheet, setSheet] = useState<SheetSnap>('full');
  /** 모바일에서 시트가 접혀 있으면 결과를 볼 수 있게 반쯤 올린다 */
  const revealSheet = () => isMobile && setSheet((s) => (s === 'peek' ? 'half' : s));

  useEffect(() => saveForm(form), [form]);

  const recommend = useMutation({
    mutationFn: api.recommend,
    onSuccess: (r: RecommendResponse) => {
      setSelectedRank(r.recommended?.rank ?? null);
      if (isMobile) setSheet('half'); // 지도와 추천 카드를 함께 보이게
    },
  });

  const startPicking = (p: 'origin' | 'destination' | null) => {
    setPicking(p);
    if (isMobile && p) setSheet('peek'); // 지도를 누를 수 있게 시트를 내린다
  };
  const onMapClick = ([lng, lat]: LngLat) => {
    if (!picking) return;
    setForm({ ...form, [picking]: { name: `지도에서 선택 (${lat.toFixed(4)}, ${lng.toFixed(4)})`, address: null, lng, lat } });
    setPicking(null);
    if (isMobile) setSheet('full');
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(t);
        setPicking(null);
      }}
      className={`flex-1 border-b-2 py-2.5 text-sm font-semibold ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
    >
      {label}
    </button>
  );

  const header = (
    <>
      <header className={`flex items-center gap-2 bg-white px-4 ${isMobile ? 'pt-0.5' : 'pt-3'}`}>
        <img src="/logo.png" alt="" width={36} height={36} className={`${isMobile ? 'h-7 w-7' : 'h-9 w-9'} shrink-0`} />
        <div>
          <h1 className="text-base font-bold leading-tight">붕찌의 맘마로드</h1>
          {!isMobile && <p className="text-xs text-slate-500">붕찌를 위한 가장 효율적인 충전소 찾기</p>}
        </div>
      </header>
      <nav className="flex border-b border-slate-200 bg-white px-2">
        {tabBtn('route', '경로 추천')}
        {tabBtn('stations', '충전소 검색')}
      </nav>
    </>
  );

  // 탭을 오가도 입력·결과가 남도록 둘 다 렌더링하고 숨기기만 한다
  const body = (
    <>
      <div className={`flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 ${tab === 'route' ? '' : 'hidden'}`}>
        <SearchForm
          form={form}
          setForm={setForm}
          presets={presets.data ?? []}
          picking={picking}
          setPicking={startPicking}
          pending={recommend.isPending}
          onSubmit={() => {
            (document.activeElement as HTMLElement | null)?.blur(); // 모바일 키보드 닫기
            recommend.mutate(toRequest(form));
          }}
        />
        {recommend.isError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{recommend.error.message}</div>
        )}
        {recommend.data && !recommend.isPending && (
          <ResultPanel result={recommend.data} selectedRank={selectedRank} onSelect={setSelectedRank} />
        )}
        {isMobile && <Attribution />}
      </div>
      <div className={`flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 ${tab === 'stations' ? '' : 'hidden'}`}>
        <StationFinder
          presetId={form.presetId}
          origin={form.origin}
          destination={form.destination}
          selectedId={selectedStationId}
          onSelect={setSelectedStationId}
          onResults={(list) => {
            setStations(list);
            setSelectedStationId(null);
            if (list.length > 0 && isMobile) setSheet('half');
          }}
        />
        {isMobile && <Attribution />}
      </div>
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {!isMobile && (
        <aside className="flex w-100 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
          {header}
          {body}
          <Attribution />
        </aside>
      )}
      <main className="relative flex-1">
        <MapView
          mode={tab}
          origin={form.origin}
          destination={form.destination}
          result={recommend.isPending ? null : recommend.data ?? null}
          selectedRank={selectedRank}
          onSelectRank={(r) => {
            setSelectedRank(r);
            revealSheet();
          }}
          stations={stations}
          selectedStationId={selectedStationId}
          onSelectStation={(id) => {
            setSelectedStationId(id);
            revealSheet();
          }}
          onMapClick={onMapClick}
          bottomInset={isMobile ? snapHeight(sheet, viewportH) : 0}
          compact={isMobile}
        />
        {picking && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1.5 text-sm whitespace-nowrap text-white shadow">
            지도를 눌러 {picking === 'origin' ? '출발지' : '도착지'}를 지정하세요
          </div>
        )}
      </main>
      {isMobile && (
        <BottomSheet snap={sheet} onSnapChange={setSheet} viewportH={viewportH} header={header}>
          {body}
        </BottomSheet>
      )}
    </div>
  );
}

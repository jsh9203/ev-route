import { useMutation, useQuery } from '@tanstack/react-query';
import type { LngLat, RecommendResponse } from '@ev-route/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { ResultPanel } from './components/ResultPanel';
import { SearchForm } from './components/SearchForm';
import { MapView } from './map/MapView';
import { loadForm, saveForm, toRequest, type FormState } from './state';

export function App() {
  const [form, setForm] = useState<FormState>(loadForm);
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const presets = useQuery({ queryKey: ['presets'], queryFn: api.presets, staleTime: Infinity });

  useEffect(() => saveForm(form), [form]);

  const recommend = useMutation({
    mutationFn: api.recommend,
    onSuccess: (r: RecommendResponse) => setSelectedRank(r.recommended?.rank ?? null),
  });

  const onMapClick = ([lng, lat]: LngLat) => {
    if (!picking) return;
    setForm({ ...form, [picking]: { name: `지도에서 선택 (${lat.toFixed(4)}, ${lng.toFixed(4)})`, address: null, lng, lat } });
    setPicking(null);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-[400px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">⚡</span>
          <div>
            <h1 className="text-base font-bold leading-tight">EV Route</h1>
            <p className="text-xs text-slate-500">가는 길에 가장 효율적인 충전소</p>
          </div>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <SearchForm
            form={form}
            setForm={setForm}
            presets={presets.data ?? []}
            picking={picking}
            setPicking={setPicking}
            pending={recommend.isPending}
            onSubmit={() => recommend.mutate(toRequest(form))}
          />
          {recommend.isError && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{recommend.error.message}</div>
          )}
          {recommend.data && !recommend.isPending && (
            <ResultPanel result={recommend.data} selectedRank={selectedRank} onSelect={setSelectedRank} />
          )}
        </div>
      </aside>
      <main className="relative flex-1">
        <MapView
          origin={form.origin}
          destination={form.destination}
          result={recommend.isPending ? null : recommend.data ?? null}
          selectedRank={selectedRank}
          onSelectRank={setSelectedRank}
          onMapClick={onMapClick}
        />
        {picking && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1.5 text-sm text-white shadow">
            지도를 클릭해 {picking === 'origin' ? '출발지' : '도착지'}를 지정하세요
          </div>
        )}
      </main>
    </div>
  );
}

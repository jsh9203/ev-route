import type { PlaceResult, VehiclePreset } from '@ev-route/shared';
import type { FormState } from '../state';
import { PlaceInput } from './PlaceInput';

interface Props {
  form: FormState;
  setForm: (f: FormState) => void;
  presets: VehiclePreset[];
  picking: 'origin' | 'destination' | null;
  setPicking: (p: 'origin' | 'destination' | null) => void;
  onSubmit: () => void;
  pending: boolean;
}

export function SearchForm({ form, setForm, presets, picking, setPicking, onSubmit, pending }: Props) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });
  const setPlace = (k: 'origin' | 'destination') => (p: PlaceResult | null) => set(k, p);
  const togglePick = (k: 'origin' | 'destination') => () => setPicking(picking === k ? null : k);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-2">
        <PlaceInput label="출발지" placeholder="장소·주소 검색" value={form.origin} onChange={setPlace('origin')} picking={picking === 'origin'} onPickToggle={togglePick('origin')} />
        <PlaceInput
          label="도착지"
          placeholder="장소·주소 검색"
          value={form.destination}
          onChange={setPlace('destination')}
          picking={picking === 'destination'}
          onPickToggle={togglePick('destination')}
          labelAction={
            <button
              type="button"
              onClick={() => setForm({ ...form, origin: form.destination, destination: form.origin })}
              className="text-xs text-slate-500 hover:text-blue-600"
            >
              ⇅ 출발·도착 바꾸기
            </button>
          }
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">차량</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={form.presetId}
            onChange={(e) => set('presetId', e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block w-28">
          <span className="mb-1 block text-xs font-medium text-slate-500">현재 배터리</span>
          <div className="flex items-center rounded-lg border border-slate-300 bg-white pr-3">
            <input
              type="number" min={1} max={100}
              className="w-full min-w-0 rounded-lg px-3 py-2 text-right text-sm outline-none"
              value={form.currentSocPct}
              onChange={(e) => set('currentSocPct', clampPct(e.target.valueAsNumber))}
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </label>
      </div>
      <input
        type="range" min={1} max={100}
        className="w-full accent-blue-600"
        value={form.currentSocPct}
        aria-label="현재 배터리"
        onChange={(e) => set('currentSocPct', Number(e.target.value))}
      />

      <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <summary className="cursor-pointer text-slate-600">고급 설정</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="도착 목표 배터리" unit="%" value={form.arriveSocPct} onChange={(v) => set('arriveSocPct', v)} />
          <NumberField label="충전 상한" unit="%" value={form.chargeCapSocPct} onChange={(v) => set('chargeCapSocPct', v)} />
          <NumberField label="최소 여유 배터리" unit="%" value={form.reserveSocPct} onChange={(v) => set('reserveSocPct', v)} />
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">최소 충전 출력</span>
            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5" value={form.minOutputKw} onChange={(e) => set('minOutputKw', Number(e.target.value))}>
              {[50, 100, 150, 200].map((kw) => <option key={kw} value={kw}>{kw}kW 이상</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">경로 탐색 반경</span>
            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5" value={form.bufferKm} onChange={(e) => set('bufferKm', Number(e.target.value))}>
              {[1, 2, 3, 5].map((km) => <option key={km} value={km}>{km}km</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 space-y-1.5">
          <Check label="테슬라 슈퍼차저 우선" checked={form.preferTesla} onChange={(v) => set('preferTesla', v)} />
          <Check label="빈 충전기가 없는 충전소도 포함" checked={form.allowFullStations} onChange={(v) => set('allowFullStations', v)} />
          <Check label="충전이 필요 없어도 충전소 추천" checked={form.forceCharge} onChange={(v) => set('forceCharge', v)} />
        </div>
      </details>

      <button
        type="submit"
        disabled={!form.origin || !form.destination || pending}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {pending ? '최적 충전소 찾는 중…' : '충전소 찾기'}
      </button>
    </form>
  );
}

const clampPct = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0);

function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <div className="flex items-center rounded-md border border-slate-300 pr-2">
        <input type="number" min={0} max={100} className="w-full min-w-0 rounded-md px-2 py-1.5 text-right outline-none" value={value} onChange={(e) => onChange(clampPct(e.target.valueAsNumber))} />
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-slate-700">
      <input type="checkbox" className="accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

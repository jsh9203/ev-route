import { useQuery } from '@tanstack/react-query';
import type { PlaceResult } from '@ev-route/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api';

interface Props {
  label: string;
  placeholder: string;
  value: PlaceResult | null;
  onChange: (p: PlaceResult | null) => void;
  picking: boolean;
  onPickToggle: () => void;
  /** 라벨 오른쪽에 붙는 보조 버튼 */
  labelAction?: React.ReactNode;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PlaceInput({ label, placeholder, value, onChange, picking, onPickToggle, labelAction }: Props) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim(), 300);

  // 외부(지도 클릭, 바꾸기 버튼)에서 값이 바뀌면 입력창도 맞춘다. 타이핑으로 값을 비운 경우는 제외
  const clearedByTyping = useRef(false);
  useEffect(() => {
    if (clearedByTyping.current) {
      clearedByTyping.current = false;
      return;
    }
    setText(value?.name ?? '');
  }, [value]);

  const search = useQuery({
    queryKey: ['places', q],
    queryFn: () => api.searchPlaces(q),
    enabled: open && q.length >= 2 && q !== value?.name,
    staleTime: 5 * 60_000,
  });
  // 입력 직후 디바운스 동안 이전 검색어의 목록이 남아 잘못 선택되지 않도록, 현재 입력과 같은 검색어 결과만 보여준다
  const stale = q !== text.trim();
  const results = stale ? [] : search.data ?? [];
  const searching = stale || search.isFetching;

  const select = (p: PlaceResult) => {
    onChange(p);
    setText(p.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-500" htmlFor={listId + '-input'}>{label}</label>
        {labelAction}
      </div>
      <div className="flex gap-1.5">
        <input
          id={listId + '-input'}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder={placeholder}
          value={text}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
            if (value) {
              clearedByTyping.current = true;
              onChange(null);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); select(results[active]!); }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        <button
          type="button"
          onClick={onPickToggle}
          title="지도를 클릭해서 위치 지정"
          className={`shrink-0 rounded-lg border px-2.5 text-xs font-medium ${picking ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          {picking ? '지도 클릭…' : '지도'}
        </button>
      </div>
      {open && text.trim().length >= 2 && !value && (searching || results.length > 0 || search.isError || search.isSuccess) && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">검색 중…</li>}
          {!searching && search.isSuccess && results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">검색 결과가 없습니다</li>}
          {search.isError && <li className="px-3 py-2 text-sm text-red-600">{search.error.message}</li>}
          {results.map((p, i) => (
            <li
              key={`${p.name}-${p.lng}-${p.lat}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); select(p); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-blue-50' : ''}`}
            >
              <div className="text-sm text-slate-900">{p.name}</div>
              {p.address && <div className="text-xs text-slate-500">{p.address}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useRef, useState, type ReactNode } from 'react';

export type SheetSnap = 'peek' | 'half' | 'full';

/** 접힘 높이(px): 손잡이 + 제목 + 탭이 보이는 정도 */
export const PEEK_HEIGHT = 132;

export function snapHeight(snap: SheetSnap, viewportH: number): number {
  if (snap === 'peek') return PEEK_HEIGHT;
  if (snap === 'half') return Math.round(viewportH * 0.5);
  return viewportH - 48; // 위쪽에 지도가 조금 보이게
}

interface Props {
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  viewportH: number;
  /** 손잡이 아래 고정 영역 (제목·탭) — 여기를 끌어도 시트가 움직인다 */
  header: ReactNode;
  children: ReactNode;
}

/** 모바일 바텀 시트. 손잡이·헤더를 위아래로 끌면 가까운 단계(접힘/반/전체)로 붙는다 */
export function BottomSheet({ snap, onSnapChange, viewportH, header, children }: Props) {
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const height = dragH ?? snapHeight(snap, viewportH);

  const onPointerDown = (e: React.PointerEvent) => {
    // 탭 버튼 등 클릭은 그대로 두고, 끌기만 가로챈다
    drag.current = { startY: e.clientY, startH: height, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    d.moved = true;
    setDragH(Math.min(viewportH - 48, Math.max(PEEK_HEIGHT * 0.8, d.startH + dy)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || dragH === null) return;
    const options: SheetSnap[] = ['peek', 'half', 'full'];
    const nearest = options.reduce((best, s) =>
      Math.abs(snapHeight(s, viewportH) - dragH) < Math.abs(snapHeight(best, viewportH) - dragH) ? s : best,
    );
    setDragH(null);
    onSnapChange(nearest);
  };
  const cycle = () => onSnapChange(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');

  return (
    <section
      className={`fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-slate-50 shadow-[0_-6px_24px_rgba(15,23,42,0.18)] ${dragH === null ? 'transition-[height] duration-200 ease-out' : ''}`}
      style={{ height }}
    >
      <div
        className="shrink-0 touch-none select-none rounded-t-2xl bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button type="button" aria-label="패널 크기 바꾸기" onClick={cycle} className="flex w-full justify-center pt-2 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </button>
        {header}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

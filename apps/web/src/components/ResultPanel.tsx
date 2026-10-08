import type { Recommendation, RecommendResponse } from '@ev-route/shared';
import { useEffect, useRef } from 'react';
import { AVAILABILITY_COLOR, availabilityOf, availabilityTextColor, clockAfter, formatDuration, formatKm, SUPERCHARGER_COLOR, WARNING_TEXT } from '../lib/format';

interface Props {
  result: RecommendResponse;
  selectedRank: number | null;
  onSelect: (rank: number) => void;
}

export function ResultPanel({ result, selectedRank, onSelect }: Props) {
  const recs = [result.recommended, ...result.alternatives].filter((r): r is Recommendation => r !== null);
  const base = result.baseRoute;
  // 정보성 경고(추정치)는 아래쪽에 작게
  const warnings = result.warnings.filter((w) => w !== 'PRESET_PROVISIONAL');

  // 지도에서 순위 핀을 눌러 선택이 바뀌면 그 카드로 스크롤
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedRank === null) return;
    rootRef.current?.querySelector(`[data-rank="${selectedRank}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedRank]);

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        충전 없이 <b>{formatKm(base.distanceM)}</b> · <b>{formatDuration(base.durationS)}</b>
        <TripBatteryRow battery={result.battery} />
        {result.chargeWindowKm && result.chargeWindowKm[0] <= result.chargeWindowKm[1] && (
          <div className="mt-0.5 text-xs text-slate-500">
            충전 가능 구간: 출발 후 {Math.round(result.chargeWindowKm[0])}~{Math.round(result.chargeWindowKm[1])}km
            <span className="ml-1 inline-block h-2 w-4 rounded-sm bg-green-500/40 align-middle" />
          </div>
        )}
      </div>

      {warnings.map((w) => (
        <div key={w} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{WARNING_TEXT[w]}</div>
      ))}

      {!result.chargeNeeded && recs.length === 0 && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-3 text-sm text-green-900">
          🎉 충전 없이 목적지까지 갈 수 있습니다.
          <div className="mt-1 text-xs text-green-800">그래도 들를 충전소를 보려면 고급 설정에서 “충전이 필요 없어도 충전소 추천”을 켜세요.</div>
        </div>
      )}

      {recs.map((r) => {
        // 슈퍼차저 우선 설정으로 더 느린 슈퍼차저가 1순위가 된 경우 차이를 알려준다
        const fastest = Math.min(...recs.map((x) => x.cost.total));
        const slowerBy = Math.round(r.cost.total - fastest);
        const note = r.rank === 1 && r.station.operatorId === 'TE' && slowerBy >= 1
          ? `가장 빠른 곳보다 약 ${slowerBy}분 더 걸리지만 슈퍼차저 우선 설정으로 1순위`
          : undefined;
        return (
          <div key={r.station.id} data-rank={r.rank}>
            <RecommendationCard r={r} note={note} selected={r.rank === selectedRank} onClick={() => onSelect(r.rank)} />
          </div>
        );
      })}

      {result.warnings.includes('PRESET_PROVISIONAL') && <p className="text-xs text-slate-400">※ {WARNING_TEXT.PRESET_PROVISIONAL}</p>}
    </div>
  );
}

function TripBatteryRow({ battery }: { battery: RecommendResponse['battery'] }) {
  const { tripUsePct, arriveWithoutChargePct: left } = battery;
  const current = left + tripUsePct;
  const enough = left >= 0;
  return (
    <div className="mt-2 border-t border-slate-200 pt-2">
      <div className="flex items-baseline justify-between">
        <span>예상 배터리 소모</span>
        <b className="text-base text-slate-900">{Math.round(tripUsePct)}%</b>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
        {/* 현재 배터리 중 쓰고 남는 부분(초록) / 쓰는 부분(주황) */}
        <div className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${Math.max(0, Math.min(100, left))}%` }} />
        <div className="absolute inset-y-0 bg-orange-400" style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0, Math.min(100, current) - Math.max(0, left))}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500">
        지금 {Math.round(current)}% → 충전 없이 도착하면{' '}
        {enough ? <b className="text-green-700">{Math.round(left)}% 남음</b> : <b className="text-red-600">{Math.round(-left)}% 부족</b>}
        <span className="ml-1 text-slate-400">(100% 기준 약 {battery.fullRangeKm}km 주행)</span>
      </div>
    </div>
  );
}

function RecommendationCard({ r, note, selected, onClick }: { r: Recommendation; note?: string; selected: boolean; onClick: () => void }) {
  const s = r.station;
  const c = s.chargers;
  const totalS = (r.route?.durationS ?? 0) + r.chargeDurationS;
  const color = AVAILABILITY_COLOR[availabilityOf(r)];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl border bg-white p-3 text-left transition ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: s.operatorId === 'TE' ? SUPERCHARGER_COLOR : color }}
        >
          {r.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-900">{s.name}</span>
            {r.rank === 1 && <Badge className="bg-blue-600 text-white">추천</Badge>}
            {s.operatorId === 'TE' && <Badge className="bg-red-600 text-white">슈퍼차저</Badge>}
            {s.isRestArea && <Badge className="bg-slate-100 text-slate-600">휴게소</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{s.operator ?? '운영기관 미상'} · 최대 {c.maxOutputKw}kW</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-slate-900">+{Math.round((r.detourDurationS + r.chargeDurationS) / 60)}분</div>
          <div className="text-[11px] text-slate-400">우회+충전</div>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="우회" value={`${Math.round(r.detourDurationS / 60)}분`} />
        <Stat label="충전" value={`${Math.round(r.chargeDurationS / 60)}분`} />
        <Stat label="도착 예정" value={clockAfter(r.etaToStationS)} />
      </div>

      <SocBar plan={r.socPlan} />

      {r.fee && (
        <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
          <div className="flex items-baseline justify-between">
            <span className="text-slate-500">예상 충전 비용</span>
            <b className="text-sm text-slate-900">약 {r.fee.won.toLocaleString()}원</b>
          </div>
          <div className="mt-0.5 text-right text-[11px] text-slate-400">
            약 {r.fee.energyKwh}kWh × {r.fee.source === 'operator' ? `${r.fee.wonPerKwh}원/kWh` : `기본 단가 ${r.fee.wonPerKwh}원/kWh (추정)`}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs">
        <span style={{ color: availabilityTextColor(availabilityOf(r)) }} className="font-medium">
          {s.status.source === 'realtime'
            ? `사용 가능 ${c.available} · 충전 중 ${c.busy}${c.unknown ? ` · 미확인 ${c.unknown}` : ''} / ${c.eligible}기`
            : s.status.source === 'supercharger-static'
              ? `실시간 정보 없음 · ${c.eligible}기`
              : `상태 조회 실패 · ${c.eligible}기`}
        </span>
        {totalS > 0 && <span className="text-slate-500">총 {formatDuration(totalS)}</span>}
      </div>
      {note && <div className="mt-1.5 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{note}</div>}
      {!r.precise && <div className="mt-1 text-[11px] text-slate-400">경로 시간은 근사값입니다</div>}
    </button>
  );
}

function SocBar({ plan }: { plan: Recommendation['socPlan'] }) {
  const { arriveAtStationPct: a, chargeToPct: b, arriveAtDestinationPct: d } = plan;
  return (
    <div className="mt-2.5">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 bg-slate-300" style={{ width: `${a}%` }} />
        <div className="absolute inset-y-0 bg-green-500" style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>충전소 도착 {Math.round(a)}%</span>
        <span className="font-medium text-green-700">→ {Math.round(b)}%까지 충전</span>
        <span>목적지 {Math.round(d)}%</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 py-1">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>{children}</span>;
}

import type { Recommendation, RecommendResponse } from '@ev-route/shared';
import { AVAILABILITY_COLOR, availabilityOf, clockAfter, formatDuration, formatKm, WARNING_TEXT } from '../lib/format';

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

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        충전 없이 <b>{formatKm(base.distanceM)}</b> · <b>{formatDuration(base.durationS)}</b>
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

      {recs.map((r) => (
        <RecommendationCard key={r.station.id} r={r} selected={r.rank === selectedRank} onClick={() => onSelect(r.rank)} />
      ))}

      {result.warnings.includes('PRESET_PROVISIONAL') && <p className="text-xs text-slate-400">※ {WARNING_TEXT.PRESET_PROVISIONAL}</p>}
    </div>
  );
}

function RecommendationCard({ r, selected, onClick }: { r: Recommendation; selected: boolean; onClick: () => void }) {
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
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>
          {r.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-900">{s.name}</span>
            {r.rank === 1 && <Badge className="bg-blue-600 text-white">추천</Badge>}
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

      <div className="mt-2 flex items-center justify-between text-xs">
        <span style={{ color }} className="font-medium">
          {s.status.source === 'realtime'
            ? `사용 가능 ${c.available} · 충전 중 ${c.busy}${c.unknown ? ` · 미확인 ${c.unknown}` : ''} / ${c.eligible}기`
            : s.status.source === 'supercharger-static'
              ? `실시간 정보 없음 · ${c.eligible}기`
              : `상태 조회 실패 · ${c.eligible}기`}
        </span>
        {totalS > 0 && <span className="text-slate-500">총 {formatDuration(totalS)}</span>}
      </div>
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

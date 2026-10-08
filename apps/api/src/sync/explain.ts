// 개발 도구: 특정 충전소가 왜 추천에 안 나오는지 근사 비용 순위로 확인
// 실행: node --disable-warning=ExperimentalWarning --import tsx src/sync/explain.ts <originLng,lat> <destLng,lat> <socJson> <prefsJson> <stationId...>
import { findPreset, RecommendRequestSchema } from '@ev-route/shared';
import { chargeWindow } from '../battery/battery';
import { config } from '../config';
import { openDb } from '../db/db';
import { loadPublicStations } from '../db/stationStore';
import { approxDetour, evaluate, findCandidates } from '../recommend/evaluate';
import { RouteLine } from '../route/routeLine';
import { StationIndex } from '../stations/stationIndex';
import { createTmapClient } from '../tmap/client';

const [o, d, vehicleJson, prefsJson, ...ids] = process.argv.slice(2);
const req = RecommendRequestSchema.parse({
  origin: { lng: Number(o!.split(',')[0]), lat: Number(o!.split(',')[1]) },
  destination: { lng: Number(d!.split(',')[0]), lat: Number(d!.split(',')[1]) },
  vehicle: JSON.parse(vehicleJson!),
  preferences: JSON.parse(prefsJson!),
});
const db = openDb(config.dbPath);
const index = new StationIndex(loadPublicStations(db));
db.close();
const preset = findPreset(req.vehicle.presetId)!;
const base = await createTmapClient(config.tmapAppKey).route([req.origin.lng, req.origin.lat], [req.destination.lng, req.destination.lat]);
const line = new RouteLine(base.coords, base.segmentRoadTypes);
const totalKm = base.distanceM / 1000;
const battery = { preset, ...req.vehicle, chargeCapSocPct: Number(process.env.CAP ?? req.vehicle.chargeCapSocPct) };
const win = chargeWindow(battery, totalKm);
const p = req.preferences;
const ctx = { battery, totalKm, baseDurationS: base.durationS, preferredOperatorIds: [], allowFullStations: p.allowFullStations, forceCharge: p.forceCharge };
const ranked = findCandidates({ index, line, fromKm: win.minKm, toKm: win.maxKm, bufferM: p.bufferKm * 1000, preset, minOutputKw: p.minOutputKw })
  .flatMap((c) => {
    const det = approxDetour(c);
    const e = det && evaluate(c, det, { statuses: undefined, source: 'unavailable' }, ctx);
    return e ? [e] : [];
  })
  .sort((a, b) => a.cost.total - b.cost.total);
console.log(`window ${win.minKm.toFixed(1)}~${win.maxKm.toFixed(1)}km, 후보 ${ranked.length}곳`);
ranked.slice(0, 8).forEach((e, i) => console.log(`  ${i + 1}. ${e.summary.name} | 경로에서 ${(e.candidate.proj.perpM / 1000).toFixed(2)}km | 근사 우회 ${(e.detourS / 60).toFixed(1)}분 | 비용 ${e.cost.total}`));
for (const id of ids) {
  const i = ranked.findIndex((e) => e.summary.id === id);
  const e = ranked[i];
  console.log(e ? `→ ${id} ${e.summary.name}: ${i + 1}위, 경로에서 ${(e.candidate.proj.perpM / 1000).toFixed(2)}km, 근사 우회 ${(e.detourS / 60).toFixed(1)}분, 비용 ${e.cost.total}` : `→ ${id}: 후보에 없음`);
}

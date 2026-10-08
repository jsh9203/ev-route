// 적재된 DB 점검용 (개발 도구). 실행: node --disable-warning=ExperimentalWarning --import tsx src/sync/inspect.ts
import { findPreset } from '@ev-route/shared';
import { config } from '../config';
import { openDb } from '../db/db';
import { loadPublicStations } from '../db/stationStore';
import { StationIndex } from '../stations/stationIndex';

const db = openDb(config.dbPath);
let t = performance.now();
const stations = loadPublicStations(db);
const loadMs = performance.now() - t;
t = performance.now();
const idx = new StationIndex(stations);
const indexMs = performance.now() - t;
console.log(`공개 충전소 ${idx.size.toLocaleString()}곳 — DB 로드 ${loadMs.toFixed(0)}ms, 인덱스 ${indexMs.toFixed(0)}ms, heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)}MB`);

const modelY = findPreset('tesla-model-y-lr')!;
const usable = stations.filter((s) =>
  s.chargers.some((c) => (c.outputKw ?? 0) >= 50 && c.connectors.some((k) => modelY.compatibleConnectors.includes(k))),
);
console.log(`Model Y 급속(50kW+) 사용 가능 충전소 ${usable.length.toLocaleString()}곳 (휴게소 ${usable.filter((s) => s.isRestArea).length}곳)`);

// 슈퍼차저 ↔ 가장 가까운 고속도로 휴게소 거리 분포
const rest = new StationIndex(stations.filter((s) => s.isRestArea && s.source === 'evcs'));
const buckets: Record<string, number> = { '≤300m': 0, '≤600m': 0, '≤1km': 0, '>1km': 0 };
const samples: string[] = [];
for (const sc of stations.filter((s) => s.source === 'supercharger')) {
  const d = rest.near(sc.lng, sc.lat, 5000)[0]?.distM ?? Infinity;
  const k = d <= 300 ? '≤300m' : d <= 600 ? '≤600m' : d <= 1000 ? '≤1km' : '>1km';
  buckets[k]!++;
  if (k !== '≤300m' && k !== '>1km') samples.push(`${sc.name} → ${rest.near(sc.lng, sc.lat, 1000)[0]!.station.name} ${d.toFixed(0)}m`);
  if (/rest area|휴게소/i.test(sc.name) && d > 300) samples.push(`[이름엔 휴게소] ${sc.name} 최근접 ${d.toFixed(0)}m`);
}
console.log('슈퍼차저→휴게소 거리', buckets);
samples.slice(0, 20).forEach((s) => console.log('  ' + s));
db.close();

// 충전소 정적 데이터 동기화: 환경공단 + 슈퍼차저 → 새 SQLite 파일에 만든 뒤 기존 파일과 교체
// 실행: pnpm sync:stations
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { openDb, transaction } from '../db/db';
import { createStationWriter } from '../db/stationStore';
import { fetchAllEvcsPages, normalizeEvcsItem } from './evcs';
import type { RestAreaRef } from './restArea';
import { fetchSuperchargeSites, normalizeSupercharger } from './supercharger';

const removeDbFiles = (p: string) => ['', '-wal', '-shm'].forEach((s) => fs.rmSync(p + s, { force: true }));

async function main() {
  const startedAt = new Date().toISOString();
  const finalPath = config.dbPath;
  const tmpPath = `${finalPath}.tmp`;
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  removeDbFiles(tmpPath);

  const db = openDb(tmpPath);
  const write = createStationWriter(db, startedAt);
  const meta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');

  // 1. 환경공단 (실패하면 전체 중단 → 기존 DB 유지)
  let rows = 0, kept = 0;
  for await (const page of fetchAllEvcsPages(config.dataGoKrServiceKey)) {
    transaction(db, () => {
      for (const item of page.items) {
        rows++;
        const n = normalizeEvcsItem(item);
        if (!n) continue;
        kept++;
        write.station(n.station);
        write.charger(n.charger);
      }
    });
    console.log(`[evcs] page ${page.pageNo} — ${rows.toLocaleString()} / ${page.totalCount.toLocaleString()}`);
  }
  meta.run('evcs_synced_at', startedAt);
  console.log(`[evcs] 원본 ${rows.toLocaleString()}행 중 ${kept.toLocaleString()}행 적재 (삭제·좌표오류 ${(rows - kept).toLocaleString()}행 제외)`);

  // 2. 슈퍼차저 (실패하면 이전 DB 의 슈퍼차저 데이터를 그대로 가져옴)
  const restAreas = db
    .prepare("SELECT name, lat, lng, direction FROM stations WHERE is_rest_area = 1 AND source = 'evcs'")
    .all() as unknown as RestAreaRef[];
  try {
    const sites = await fetchSuperchargeSites();
    let sc = 0, matched = 0;
    transaction(db, () => {
      for (const site of sites) {
        const n = normalizeSupercharger(site, restAreas);
        if (!n) continue;
        sc++;
        if (n.station.isRestArea) matched++;
        write.station(n.station);
        n.chargers.forEach(write.charger);
      }
    });
    meta.run('supercharger_synced_at', startedAt);
    console.log(`[supercharger] 한국 운영중 ${sc}곳 적재 (휴게소 매칭 ${matched}곳)`);
  } catch (e) {
    console.warn(`[supercharger] 수집 실패: ${(e as Error).message}`);
    if (fs.existsSync(finalPath)) {
      db.exec(`ATTACH DATABASE '${finalPath.replaceAll("'", "''")}' AS old`);
      transaction(db, () => {
        db.exec("INSERT OR IGNORE INTO stations SELECT * FROM old.stations WHERE source = 'supercharger'");
        db.exec("INSERT OR IGNORE INTO chargers SELECT c.* FROM old.chargers c JOIN old.stations s ON s.id = c.station_id WHERE s.source = 'supercharger'");
        db.exec("INSERT OR REPLACE INTO meta SELECT * FROM old.meta WHERE key = 'supercharger_synced_at'");
      });
      db.exec('DETACH DATABASE old');
      console.warn('[supercharger] 이전 DB 의 슈퍼차저 데이터를 유지합니다');
    }
  }

  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  console.log(
    `[done] 충전소 ${count('SELECT COUNT(*) n FROM stations').toLocaleString()}곳, ` +
      `충전기 ${count('SELECT COUNT(*) n FROM chargers').toLocaleString()}대 ` +
      `(이용제한 없음 ${count('SELECT COUNT(*) n FROM chargers WHERE limited = 0').toLocaleString()}대)`,
  );

  db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
  db.close();
  removeDbFiles(finalPath);
  fs.renameSync(tmpPath, finalPath);
  console.log(`[done] ${finalPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

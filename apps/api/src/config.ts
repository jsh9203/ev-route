import fs from 'node:fs';
import path from 'node:path';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');

const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 비어 있습니다 (.env 확인)`);
  return v;
}

export const config = {
  get tmapAppKey() { return required('TMAP_APP_KEY'); },
  get dataGoKrServiceKey() { return required('DATA_GO_KR_SERVICE_KEY'); },
  port: Number(process.env.PORT ?? 3001),
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH ?? './data/stations.sqlite'),
  pricesPath: path.resolve(ROOT_DIR, process.env.PRICES_PATH ?? './data/prices.json'),
  statusCacheTtlSec: Number(process.env.STATUS_CACHE_TTL_SEC ?? 120),
  stationSyncIntervalHours: Number(process.env.STATION_SYNC_INTERVAL_HOURS ?? 24),
};

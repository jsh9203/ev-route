import fs from 'node:fs';
import { config } from './config';
import { openDb } from './db/db';
import { loadPublicStations } from './db/stationStore';
import { createFilePriceBook } from './pricing/priceBook';
import { buildServer } from './server';
import { StationIndex } from './stations/stationIndex';
import { createStatusService } from './status/statusService';
import { createTmapClient } from './tmap/client';

if (!fs.existsSync(config.dbPath)) {
  console.error(`충전소 DB 가 없습니다: ${config.dbPath}\n먼저 'pnpm sync:stations' 를 실행하세요.`);
  process.exit(1);
}

const db = openDb(config.dbPath);
const index = new StationIndex(loadPublicStations(db));
db.close();

const app = buildServer({
  tmap: createTmapClient(config.tmapAppKey),
  index,
  status: createStatusService(config.dataGoKrServiceKey, config.statusCacheTtlSec),
  prices: createFilePriceBook(config.pricesPath),
  tmapWebAppKey: process.env.TMAP_WEB_APP_KEY || config.tmapAppKey,
});
app.log.info(`충전소 ${index.size.toLocaleString()}곳 적재`);
await app.listen({ port: config.port, host: '0.0.0.0' });

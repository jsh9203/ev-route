import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (
  id            TEXT PRIMARY KEY,   -- 환경공단 statId / 슈퍼차저는 'SC-' 접두
  name          TEXT NOT NULL,
  address       TEXT,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  operator_id   TEXT,               -- busiId (슈퍼차저는 'TE')
  operator      TEXT,
  kind_detail   TEXT,
  is_rest_area  INTEGER NOT NULL DEFAULT 0,
  direction     TEXT,               -- 이름 괄호 속 방향 표기 (표시용)
  use_time      TEXT,
  source        TEXT NOT NULL,      -- 'evcs' | 'supercharger'
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chargers (
  station_id    TEXT NOT NULL REFERENCES stations(id),
  charger_id    TEXT NOT NULL,
  charger_type  TEXT NOT NULL,      -- 원본 chgerType (슈퍼차저는 'SC')
  connectors    TEXT NOT NULL,      -- 쉼표 구분 정규화 커넥터
  output_kw     INTEGER,
  limited       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, charger_id)
);
CREATE INDEX IF NOT EXISTS idx_chargers_station ON chargers(station_id);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

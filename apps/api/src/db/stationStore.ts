import type { DatabaseSync } from 'node:sqlite';
import type { Connector } from '@ev-route/shared';
import type { ChargerRow, StationRow } from './types';

/** 같은 충전소의 첫 행만 저장 (환경공단 데이터는 충전기 단위 행이라 충전소 정보가 반복됨) */
export function createStationWriter(db: DatabaseSync, updatedAt: string) {
  const insStation = db.prepare(`
    INSERT OR IGNORE INTO stations (id, name, address, lat, lng, operator_id, operator, kind_detail, is_rest_area, direction, use_time, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insCharger = db.prepare(`
    INSERT OR REPLACE INTO chargers (station_id, charger_id, charger_type, connectors, output_kw, limited)
    VALUES (?, ?, ?, ?, ?, ?)`);
  return {
    station(s: StationRow) {
      insStation.run(s.id, s.name, s.address, s.lat, s.lng, s.operatorId, s.operator, s.kindDetail, s.isRestArea ? 1 : 0, s.direction, s.useTime, s.source, updatedAt);
    },
    charger(c: ChargerRow) {
      insCharger.run(c.stationId, c.chargerId, c.chargerType, c.connectors.join(','), c.outputKw, c.limited ? 1 : 0);
    },
  };
}

interface StationDbRow {
  id: string; name: string; address: string | null; lat: number; lng: number;
  operator_id: string | null; operator: string | null; kind_detail: string | null;
  is_rest_area: number; direction: string | null; use_time: string | null; source: StationRow['source'];
}
interface ChargerDbRow {
  station_id: string; charger_id: string; charger_type: string; connectors: string; output_kw: number | null; limited: number;
}

export interface StationWithChargers extends StationRow {
  chargers: ChargerRow[];
}

/** 이용자 제한이 없는 충전기가 1대 이상인 충전소만 (추천 후보 모집단) */
export function loadPublicStations(db: DatabaseSync): StationWithChargers[] {
  const chargersByStation = new Map<string, ChargerRow[]>();
  for (const r of db.prepare('SELECT * FROM chargers WHERE limited = 0').all() as unknown as ChargerDbRow[]) {
    let list = chargersByStation.get(r.station_id);
    if (!list) chargersByStation.set(r.station_id, (list = []));
    list.push({
      stationId: r.station_id,
      chargerId: r.charger_id,
      chargerType: r.charger_type,
      connectors: r.connectors.split(',') as Connector[],
      outputKw: r.output_kw,
      limited: false,
    });
  }
  const stations: StationWithChargers[] = [];
  for (const s of db.prepare('SELECT * FROM stations').all() as unknown as StationDbRow[]) {
    const chargers = chargersByStation.get(s.id);
    if (!chargers) continue;
    stations.push({
      id: s.id, name: s.name, address: s.address, lat: s.lat, lng: s.lng,
      operatorId: s.operator_id, operator: s.operator, kindDetail: s.kind_detail,
      isRestArea: s.is_rest_area === 1, direction: s.direction, useTime: s.use_time, source: s.source,
      chargers,
    });
  }
  return stations;
}

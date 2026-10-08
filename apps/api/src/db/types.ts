import type { Connector } from '@ev-route/shared';

export interface StationRow {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  operatorId: string | null;
  operator: string | null;
  kindDetail: string | null;
  isRestArea: boolean;
  direction: string | null;
  useTime: string | null;
  source: 'evcs' | 'supercharger';
}

export interface ChargerRow {
  stationId: string;
  chargerId: string;
  chargerType: string;
  connectors: readonly Connector[];
  outputKw: number | null;
  limited: boolean;
}

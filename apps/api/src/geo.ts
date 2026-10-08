const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** 두 좌표 사이 대원거리(m) */
export function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** 국내 좌표 범위 검사 (잘못 입력된 원본 좌표 걸러내기용) */
export function isInKorea(lng: number, lat: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

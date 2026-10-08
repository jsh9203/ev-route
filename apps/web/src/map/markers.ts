// 지도 마커 아이콘 (SVG data URI). 이미지 파일 없이 색·숫자를 바꿔 그린다.
// TMAP Marker 는 icon 이미지의 아래 가운데를 좌표에 맞추므로, 핀 끝이 이미지 하단 중앙에 오도록 그린다.

export interface MarkerIcon {
  url: string;
  width: number;
  height: number;
}

const toUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s*\n\s*/g, ' '))}`;

const SHADOW = `<filter id="s" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#0f172a" flood-opacity=".35"/></filter>`;
/** 24x24 기준 번개 아이콘 */
const BOLT = 'M13.5 2 5 13.5h6L9.8 22 19 10h-6.2z';

/** 추천 순위 핀: 물방울 모양 + 흰 원 안에 순위 번호 */
export function rankPin(rank: number, color: string, selected: boolean): MarkerIcon {
  const s = selected ? 1.25 : 1;
  const w = Math.round(36 * s), h = Math.round(48 * s);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 36 48">
    <defs>${SHADOW}<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".85"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
    <path filter="url(#s)" d="M18 46c-1.2-1.6-15-17-15-28a15 15 0 0 1 30 0c0 11-13.8 26.4-15 28z" fill="url(#g)" stroke="white" stroke-width="2.5"/>
    <circle cx="18" cy="18" r="10" fill="white"/>
    <text x="18" y="23" text-anchor="middle" font-family="Pretendard,Malgun Gothic,sans-serif" font-size="14" font-weight="800" fill="${color}">${rank}</text>
    ${selected ? `<circle cx="18" cy="18" r="13" fill="none" stroke="white" stroke-width="1.5" stroke-dasharray="3 2"/>` : ''}
  </svg>`;
  return { url: toUrl(svg), width: w, height: h };
}

/** 출발/도착 라벨 핀: 둥근 말풍선 + 아래 꼬리 */
export function labelPin(label: '출발' | '도착', color: string): MarkerIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="40" viewBox="0 0 52 40">
    <defs>${SHADOW}</defs>
    <g filter="url(#s)">
      <rect x="3" y="3" width="46" height="26" rx="13" fill="${color}" stroke="white" stroke-width="2"/>
      <path d="M21 28h10l-5 9z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
      <rect x="20" y="25" width="12" height="4" fill="${color}"/>
    </g>
    <text x="26" y="21" text-anchor="middle" font-family="Pretendard,Malgun Gothic,sans-serif" font-size="13" font-weight="700" fill="white">${label}</text>
  </svg>`;
  return { url: toUrl(svg), width: 52, height: 40 };
}

/** 충전소 찾기 결과 핀: 원형 배지 + 번개. 슈퍼차저는 빨간 테두리 */
export function stationPin(color: string, opts: { supercharger: boolean; selected: boolean }): MarkerIcon {
  const s = opts.selected ? 1.3 : 1;
  const w = Math.round(30 * s), h = Math.round(38 * s);
  const ring = opts.supercharger ? '#dc2626' : 'white';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 30 38">
    <defs>${SHADOW}</defs>
    <g filter="url(#s)">
      <path d="M11 30h8l-4 6z" fill="${ring}"/>
      <circle cx="15" cy="15" r="13" fill="${color}" stroke="${ring}" stroke-width="${opts.supercharger ? 3 : 2.5}"/>
    </g>
    <g transform="translate(3 3)"><path d="${BOLT}" fill="white"/></g>
  </svg>`;
  return { url: toUrl(svg), width: w, height: h };
}

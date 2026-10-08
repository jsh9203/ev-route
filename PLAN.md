# ⚡ EV Route — 기획서 (v3)

> `PROJECT_SPEC.md`(Gemini 초안)를 재설계한 문서. 원본은 보존.
> v2 작성 2026-10-08 → v3 검토 반영 2026-10-08
> 1차 목표: **PC 웹에서 출발지·도착지 입력 → 경로상 최적 충전소 1곳 추천** (로컬 실행)

### 확정 사항
| 항목 | 결정 |
|---|---|
| 대상 차량 | **Tesla Model Y** 우선 (프리셋), 직접 입력은 후순위 |
| 충전 정차 | 1차는 **1회**. 이후 "정차 횟수 지정" 기능 추가 (Phase 5) |
| 실행 환경 | 1차 로컬 → 이후 **개인 NAS에 Docker 배포** |
| API 키 | 사용자가 발급 후 `.env`에 입력 (`.env.example` 참조) |

### v3 변경 요약
커넥터 호환 필터 추가 · 가용 대수 기준 정의 · 슈퍼차저 데이터를 Phase 0 핵심 검증으로 격상 · SoC 기반 충전 곡선 모델 · 고속도로 IC 페널티를 반영한 우회 근사 · 도착 시점 기준 가용성 신뢰도 · 상태 조회 대안 설계 · 충전 구간 정의 명확화 · 응답에 SoC 정보 추가 · Docker/런타임 설정 설계

---

## 1. 초안(PROJECT_SPEC) 대비 변경점

| 구분 | 내용 |
|---|---|
| ✅ 유지 | 경로 polyline 기반 후보 필터링, 환경공단 충전소 API, "후보 추출 → 실시간 상태 → 스코어링 → 재경로" 구조 |
| 🔄 변경 | 지도 Kakao → **TMAP JS SDK v2** · PostGIS+Redis → **SQLite + 인메모리** · Python+React → **TypeScript 단일 스택** · 후보 전수 TMAP 호출 → **근사 후 상위 N개만 정밀** · 임의 점수 → **분 단위 비용함수** · 좌표 `[lat,lng]` → **GeoJSON `[lng,lat]`** |
| ➕ 추가 | 배터리/SoC 모델, SoC별 충전 곡선, 커넥터 호환성, 진행방향·IC 진출입 고려, 상태 데이터 신뢰도, Docker 배포 설계 |
| ❌ 제외(1차) | 다중 정차, 테슬라 Fleet API, 요금/멤버십, 모바일, 계정 |

초안의 주요 문제: ① 휴게소 ΔT≈0 가정(방향 무시) ② 가용 0대 일괄 제외 ③ 차량 한계를 무시한 임의 속도 점수 ④ 1차에 과한 인프라 ⑤ 키 관리 미정의.

---

## 2. 기술 스택

**TypeScript 단일 스택, pnpm 모노레포**

```
EVRoute/
├─ apps/
│  ├─ web/        # Vite + React + TS + Tailwind, TanStack Query, TMAP JS SDK v2
│  └─ api/        # Fastify + TS, zod, node:sqlite (운영 시 web 빌드 결과도 서빙)
│                 #   src/sync/ 충전소 수집·적재 (pnpm sync:stations)
├─ packages/
│  └─ shared/     # zod 스키마·타입, 차량 프리셋, 스코어링 상수
├─ scripts/       # 개발 보조 스크립트 (setup-git.ps1)
├─ data/          # stations.sqlite, 보완 데이터(supplement/*.json)  ※ DB는 gitignore
├─ docker/        # Dockerfile, docker-compose.yml (Phase 4)
├─ .env.example
└─ PLAN.md
```

| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트 | Vite + React + TS | 지도 중심 SPA라 SSR 불필요, 정적 빌드로 배포 단순, 앱 확장 시 재사용 |
| 백엔드 | Fastify + zod | 경량·타입 안전, 외부 API 키를 숨기는 프록시 |
| 공간 연산 | `@turf/turf`, `flatbush` | 수만 개 점 규모에서 PostGIS 불필요 |
| 저장소 | SQLite (Node 24 내장 `node:sqlite`) | 파일 1개, 네이티브 모듈 빌드 불필요(NAS ARM/x86 무관), NAS 볼륨 마운트로 운영 |
| 캐시 | 프로세스 내 TTL Map (인터페이스 분리) | 단일 인스턴스면 충분, 필요 시 Redis 교체 |
| 테스트 | Vitest | 배터리 모델·스코어링·공간 로직 단위 테스트 |

---

## 3. 외부 API

### 3.1 TMAP
| 용도 | 사용 API | 비고 |
|---|---|---|
| 지도 | JS SDK v2 (`Tmapv2`) | 브라우저 로드. 키는 런타임에 서버에서 받아 동적 로드 (§9) |
| 장소 검색 | POI 통합검색 | 서버 프록시 경유, 자동완성 |
| 경로 | 자동차 경로안내 (`passList` 경유지) | GeoJSON LineString 이어붙여 polyline 구성, 구간별 도로 유형 정보 활용(제공 여부 확인) |
| 다중 경유 | 다중 경유지 경로 | Phase 5(다중 정차) |

### 3.2 공공데이터포털 — 한국환경공단 전기자동차 충전소 정보
- `getChargerInfo`(정적): 위치, 운영기관, 충전기 타입·출력 → **일 1회 전체 덤프 → SQLite**
- `getChargerStatus`(실시간): 충전기 상태 → 조회 방식은 §3.3 검증 결과에 따라 결정 (§4 5단계 참고)

### 3.2.1 supercharge.info (테슬라 슈퍼차저)
- `GET https://supercharge.info/service/supercharge/allSites` → 전 세계 사이트 배열. **일 1회** 받아 `address.country == "South Korea"` 필터 후 SQLite에 `source='supercharger'`로 적재.
- 상태 매핑: `OPEN`만 적재, 나머지(`CLOSED_TEMP`·`VOTING`·`CONSTRUCTION`·`PLAN`·`CLOSED_PERM`)는 적재 안 함.
- 충전기 수 = `stallCount`, 출력 = `powerKilowatt`(0이면 출력 미상 → 120kW로 보수적 가정), 커넥터 = `plugs`의 nacs/ccs1 존재 여부 (없으면 `NACS`).
- 실시간 상태: 항상 "알 수 없음"(`status.source = 'supercharger-static'`). 대신 스톨 수가 많아(평균 약 7개) 대기 위험이 낮으므로 P_wait는 "알 수 없음" 기본값 적용.
- **한글 이름·휴게소 방향 보강**: 슈퍼차저 좌표 300m 이내에 환경공단 `C001`(고속도로 휴게소) 충전소가 있으면 그 이름·방향을 가져와 표시·방향 판정에 사용. 없으면 영문 이름 + 괄호 안 영문 방향(예: `(Gangneung)`)을 한글 지명 사전으로 변환.
- 주의: 커뮤니티가 관리하는 데이터라 실제와 차이가 날 수 있음 → UI에 출처 "supercharge.info" 표기. 공식 API가 아니므로 호출은 하루 1회로 제한하고, 외부 공개 전에 사이트 이용 정책 확인. 응답 문자열은 외부 데이터이므로 화면 출력 시 이스케이프.

### 3.3 Phase 0 검증 체크리스트
**🔴 핵심 (결과에 따라 설계가 바뀜)**
- [ ] **테슬라 슈퍼차저가 환경공단 데이터에 포함되는가** (위치·충전기 수·실시간 상태 각각). 미포함/부분 포함이면 → `data/supplement/tesla_superchargers.json` 수동 보완 목록(위치·대수·출력)으로 1차 대응, 실시간 상태는 "알 수 없음" 처리
- [ ] **국내 Model Y 충전구 규격과 사용 가능한 커넥터/어댑터 조합** → 차량 프리셋의 `compatibleConnectors` 확정. 환경공단 충전기 타입 코드 중 어떤 값이 해당하는지 매핑
- [ ] **`getChargerStatus`가 충전소(statId) 단위 조회를 지원하는가**, 아니면 지역/기간(최근 N분 변경분) 단위만인가 → 상태 조회 방식 A/B 결정 (§4)

**🟡 일반**
- [ ] TMAP 무료 쿼터·일일 한도, 경유지 최대 개수, 결과 캐싱 관련 약관
- [ ] TMAP 경로 응답의 좌표 순서·좌표계 옵션, 총 시간/거리 필드, **구간별 도로 유형(고속도로 여부) 필드 존재 여부**
- [ ] TMAP이 휴게소 좌표를 경유지로 받을 때 반대편 차로로 붙는 문제가 있는지 (서울→부산 경로로 상·하행 휴게소 각각 테스트)
- [ ] 환경공단 API 일일 한도, 상태 갱신 주기
- [ ] TMAP JS SDK v2를 SPA에서 동적 로드할 때의 이슈
- [ ] Model Y 트림별 배터리 용량·최대 충전 출력·충전 곡선 근사값 (공개 측정 자료 기반)

### 3.4 Phase 0 진행 결과
| 항목 | 결과 (2026-10-08) |
|---|---|
| TMAP 경로 | ✅ 강남역→부산시청 397km/약 4h59m. 좌표 `[lng,lat]` WGS84, LineString 40개·좌표 5,492개. **구간별 `roadType`·`facilityType` 제공** → 고속도로 판정에 사용 가능 (코드값 의미는 공식 문서로 확인 필요) |
| TMAP POI | ✅ 강남역 검색 정상. `frontLat/Lon`(진입 좌표)·`noorLat/Lon`(중심 좌표) 제공 → 경로 탐색에는 진입 좌표 사용 |
| 환경공단 API | ✅ 키 반영 후 정상. 전국 **526,197 충전기 / 100,975 충전소** (출력 50kW 이상 보유 충전소 24,198). 9,999건/페이지 53회, **전체 덤프 약 41초** → 일 1회 동기화 충분 |
| 🔴 슈퍼차저 포함 여부 | ❌ 명세서 기관코드표에 **`TE`(테슬라)는 정의돼 있으나 실제 데이터는 0건** (이름 검색도 0건). → **슈퍼차저는 보완 데이터로 반드시 별도 확보**, 실시간 상태는 "알 수 없음". 동기화 시 `TE` 행이 생기면 자동으로 원본 데이터 우선 |
| 🔴 상태 조회 방식 | ✅ **`getChargerInfo`를 `statId`로 조회 → 방식 A**. ⚠️ Phase 2에서 정정: `getChargerStatus`는 `statId`를 줘도 **최근 period(최대 10)분 안에 상태가 바뀐 충전기만** 반환 → 현재 상태 조회에 부적합 (상태 변화 없는 충전소는 빈 목록). `getChargerInfo`는 모든 충전기의 현재 `stat` 반환, 응답 약 60ms. `getChargerStatus`는 방식 B(변경분 동기화)에만 사용 가능 |
| 🔴 커넥터 매핑 | ✅ 공식 코드표 확인 (`references/` 활용가이드 v1.25). 50kW 이상 분포: 04 DC콤보(41,380) · 06 차데모+AC3상+DC콤보(6,380) · **11 DC콤보2(버스전용, 5,581 → 반드시 제외)** · 05 차데모+DC콤보(1,467) · **10 DC콤보+NACS(266, SK일렉링크·채비·브라이트에너지파트너스, 200/350kW)** · 09 NACS 단독 0건. Model Y 호환 코드는 차량 충전구 규격 확정 후 결정 (§7 매핑표) |
| Model Y 커넥터 | ✅ 차량 NACS + DC콤보 컨버터 보유 → **`CCS1`, `NACS` 모두 호환**. 사용 가능 타입: 04·05·06·09·10 (+ 슈퍼차저). 11(버스전용)·08(DC콤보 완속)은 제외 |
| 슈퍼차저 데이터 | ✅ **supercharge.info `allSites`** (커뮤니티 운영 데이터, 전 세계 11,218곳). 한국 205곳 중 **OPEN 183곳·스톨 1,251개**. 출력 250kW 166곳 · 325kW 10곳 · 120kW 23곳. `plugs`(nacs/ccs1 수), `otherEVs`, `gps` 제공. **실시간 상태 없음**. 이름·주소는 영문(예: `Deokpyeong Rest Area(Gangneung)`) |
| 휴게소 판정 | ✅ `kindDetail=C001`(고속도로 휴게소) **602곳, 그중 급속 보유 598곳** → 이름 패턴 추정 대신 코드로 판정. 방향은 이름의 괄호에서 추출(예: `기흥(부산) 휴게소`). 단 `음성(남이)`처럼 괄호가 방향이 아닌 경우, `옥천만남 휴게소`처럼 방향 표기가 없는 경우(양방향 공용 가능) 존재 → 수동 보정 목록 필요 |
| 🔴 이용자 제한 | **`limitYn=Y`가 338,557대(64%)** — 아파트 등 외부인 이용 불가 충전기. **하드 필터로 반드시 제외** |
| 삭제 충전기 | `delYn=Y` 3,961대 → 적재 시 제외 |
| 상태 분포 | 충전대기 433,641 · 충전중 58,100 · 미확인(9) 21,415 · 통신이상 10,607 · 점검중 1,886 · 운영중지 548. 코드표에만 있는 `0`(알수없음)·`6`(예약중)도 처리 |
| API 제약 | `numOfRows` 10~9,999 · `getChargerStatus`의 `period` 1~10분(기본 5) · 지역코드 `12`(전남광주통합특별시) 신설 등 코드 변경 잦음 → 코드표는 데이터로 관리 |
| 데이터 특이사항 | 같은 운영기관이 여러 이름으로 등장(예: `EV:에버온`/`EV:주식회사 에버온`, `SG:SK시그넷 ` 뒤 공백) → 선호 운영기관 필터는 `busiId` 기준, 문자열은 trim |

---

## 4. 추천 파이프라인

```
[Web] 출발/도착 + 차량 프리셋 + 현재 SoC
   │ POST /api/v1/routes/recommend
   ▼
[API]
 1. TMAP 기본 경로 → polyline, 총 시간/거리, 구간별 도로 유형
 2. 배터리 모델로 충전 필요 여부·충전 구간 [d_min, d_max] 산출 (§5.1)
      · 충전 불필요 → chargeNeeded=false (옵션: 그래도 추천받기)
      · 1회 충전으로 불가능 → MULTI_STOP_REQUIRED 경고 후 종료
 3. 1차 후보 추출
      · polyline 단순화 → flatbush bbox → 버퍼(기본 3km) 내 충전소
      · 각 후보의 경로상 진행거리(km)·경로와의 직교거리 계산
      · 하드 필터: 진행거리가 [d_min, d_max] 안 / 호환 커넥터 보유 /
        호환 충전기 중 최소 출력(minOutputKw) 이상이 1대 이상 /
        이용자 제한 없음(limitYn=N) / 삭제 아님(delYn=N)
 4. 근사 비용으로 상위 K(기본 15) 선별 — 근사 우회시간(§5.3) + 충전시간(§5.2)
 5. 실시간 상태 결합 (방식은 Phase 0 결과로 결정)
      · A: 충전소 단위 조회 가능 → K개만 조회, TTL 캐시
      · B: 지역/변경분 단위만 가능 → 백그라운드 작업이 N분마다 변경분을 받아
           전국 상태 캐시 유지, 요청 시에는 캐시만 읽음
      · 호환·고출력 충전기 기준으로 가용 대수 계산 (§5.4)
      · 전부 고장/점검/통신이상 → 제외
 6. 비용 정렬 → 상위 N(기본 3)에 대해 TMAP 경유 경로 호출 → 실측 ΔT로 교체
 7. 재정렬 → 1위 추천, 나머지 대안. 각 후보에 SoC 계획 포함해 반환
```
TMAP 호출: 요청당 약 1 + N = 4회.

---

## 5. 계산 모델

### 5.1 배터리 모델과 충전 구간
입력: `currentSocPct`, 차량 프리셋(용량 kWh, 전비 km/kWh, 최대 충전 kW, 충전 곡선), `reserveSocPct`(주행 중 최저 허용, 기본 10%), `arriveSocPct`(목적지 도착 목표, 기본 20%), `chargeCapSocPct`(충전 상한, 기본 80%)

```
SoC(d)   = currentSoc − d / (전비 × 용량) × 100       # d = 출발 후 진행거리(km)
d_max    = SoC(d) 가 reserveSoc 에 닿는 지점          # 이보다 늦으면 도달 불가
d_min    = 상한(80%)까지 충전하면 목적지에 arriveSoc 로 도착 가능한 가장 이른 지점
           = 전체거리 − (chargeCap − arriveSoc)/100 × 전비 × 용량
충전 필요 없음: SoC(전체거리) ≥ arriveSoc
1회 불가:     d_min > d_max
```
- 전비는 프리셋 값 × 고속 주행 보정계수(설정값). 1차에서 기온·고도는 미반영.
- 충전소 i에서의 계획: `도착SoC_i = SoC(진행거리_i + 우회거리)`, `목표SoC_i = arriveSoc + (남은거리 / (전비×용량)) × 100` (상한 이하). **필요한 만큼만 충전**.

### 5.2 충전 시간 — SoC 기반 충전 곡선
- 차량 프리셋에 **SoC 구간별 최대 수전 출력(kW)** 표를 둔다 (예: 0–10%, 10–20%, … 구간). 값은 Phase 0에서 공개 측정 자료로 근사.
- 구간별 실제 출력 = `min(곡선값(SoC), 충전기 출력 × 효율계수)` (효율계수 기본 0.95, 충전기 공칭 출력 대비)
- `T_charge = Σ 구간 에너지 / 구간 출력` (도착SoC → 목표SoC 구간 합산)
- 효과: 낮은 SoC에서 빨리 충전되는 특성이 반영되어, 출력이 같아도 **충전 시점에 따라 시간이 달라지는 것**이 비교에 들어감.

### 5.3 우회 시간 근사 (4단계 전용, 6단계에서 실측으로 교체)
```
ΔT_approx = 2 × 직교거리 / v_local  +  P_exit
v_local   : 일반도로 평균속도 (설정값, 기본 30km/h)
P_exit    : 후보와 가장 가까운 경로 구간이 고속도로이고, 후보가 휴게소가 아니면 IC 진출입 고정 페널티 (기본 8분)
휴게소    : 경로 진행방향 기준 오른쪽에 있으면 ΔT_approx = 2분(진입·대기 동선), 왼쪽(반대 차로)이면 제외
```
- "직교거리 ≤ 50m면 0분" 규칙은 폐기 (고가도로·병행 도로 오판 위험).
- 도로 유형 정보가 TMAP 응답에 없으면 차선책으로 "경로 구간 평균속도 ≥ 80km/h → 고속도로"로 판정.
- **휴게소 이용 가능 방향은 기하로 판정**: 우측통행이므로 진행방향 휴게소는 도로 오른쪽에 있음. 가장 가까운 경로 구간의 진행 벡터와 (충전소 − 최근접점) 벡터의 외적 부호로 좌·우 판정. 이름이 필요 없어 `음성(남이)`처럼 괄호가 지명이 아닌 경우나 방향 표기가 없는 경우에도 동작. 경로에서 수십 m 이내로 붙은 양방향 공용 휴게소는 판정 보류 후 6단계 실측에 맡김. 이름 괄호 속 방향은 표시용으로만 사용.
- 근사가 틀려도 최적 후보가 탈락하지 않도록 K를 넉넉히 유지, 실측 대비 근사 오차를 로그로 남겨 상수 튜닝.

### 5.4 가용 대수와 신뢰도
- **가용 대수 = 호환 커넥터 + minOutputKw 이상 충전기 중 "충전대기" 상태 수**. 완속·비호환 충전기는 total/available 모두에서 제외.
- 상태 코드 처리 (공식 코드표):
  | 코드 | 의미 | 분류 |
  |---|---|---|
  | 2 | 충전대기 | 가용 |
  | 3 | 충전중 | 사용중 |
  | 6 | 예약중 | 사용중 |
  | 1 | 통신이상 | 알 수 없음 (실제로는 사용 가능한 경우 있음) |
  | 0, 9 | 알수없음 / 상태미확인 | 알 수 없음 |
  | 4, 5 | 운영중지 / 점검중 | 사용 불가 |
- **도착 시점 감쇠**: 지금의 가용 상태는 도착이 멀수록 의미가 약하므로 가중치 `w_eta = max(0.2, 1 − 도착예정분/180)`.

### 5.5 비용함수 (분 단위, 낮을수록 좋음)
```
Cost = ΔT_detour + T_charge + w_eta × P_wait + P_reliability − B_preference
```
| 항목 | 기본값 |
|---|---|
| P_wait | 가용 ≥2: 0 / 1: +5 / 0(사용중만): +20 (`allowFullStations=false`면 제외) / 알 수 없음: +5 |
| P_reliability | 호환 고출력 충전기 총 1대: +5 (※ `statUpdDt`는 "상태가 바뀐 시각"이라 오래됐다고 데이터가 낡은 것이 아님 → 갱신 시각 기반 페널티는 폐기) |
| B_preference | 선호 운영기관 일치: −3 |

상수는 `packages/shared/scoring.ts` 한 곳에서 관리, 대표 시나리오(서울→부산, 서울→강릉 등) 스냅샷 테스트로 회귀 방지.

---

## 6. API 명세

### `POST /api/v1/routes/recommend`
**Request**
```jsonc
{
  "origin":      { "name": "강남역",   "lng": 127.0276, "lat": 37.4979 },
  "destination": { "name": "부산시청", "lng": 129.0756, "lat": 35.1796 },
  "vehicle": {
    "presetId": "tesla-model-y-lr",      // 프리셋 사용 시 아래 값은 생략 가능(덮어쓰기용)
    "currentSocPct": 60,
    "arriveSocPct": 20,
    "reserveSocPct": 10,
    "chargeCapSocPct": 80
  },
  "preferences": {
    "minOutputKw": 100,
    "preferredOperators": ["테슬라", "환경부"],
    "bufferKm": 3,
    "allowFullStations": false,
    "forceCharge": false
  }
}
```

**Response**
```jsonc
{
  "baseRoute": { "distanceM": 395000, "durationS": 15400, "polyline": [[127.02, 37.49], "..."] },
  "chargeNeeded": true,
  "chargeWindowKm": [120, 250],
  "recommended": {
    "rank": 1,
    "station": {
      "id": "ME10293", "name": "OO휴게소(부산방향)", "lng": 127.36, "lat": 37.20,
      "operator": "한국환경공단", "isRestArea": true, "direction": "부산방향",
      "chargers": { "compatibleTotal": 6, "available": 3, "maxOutputKw": 200 },
      "status": { "source": "realtime", "updatedAt": "2026-10-08T10:12:00+09:00" }  // realtime | supplement | unknown
    },
    "socPlan": {
      "arriveAtStationPct": 22, "chargeToPct": 58, "arriveAtDestinationPct": 20
    },
    "detourDurationS": 120,
    "chargeDurationS": 1260,
    "etaToStationS": 7200,
    "cost": { "total": 23.0, "detour": 2.0, "charge": 21.0, "wait": 0, "reliability": 0, "preference": 0 },
    "route": { "distanceM": 395800, "durationS": 16740, "polyline": ["..."] }
  },
  "alternatives": [ /* 동일 구조 */ ],
  "warnings": []   // MULTI_STOP_REQUIRED | SOC_BELOW_RESERVE | NO_CANDIDATE | STATUS_UNAVAILABLE | PRESET_PROVISIONAL
  // ※ 실제 구현 타입은 packages/shared/src/api.ts 가 기준
}
```
보조 엔드포인트
- `GET /api/v1/places/search?q=` — POI 프록시
- `GET /api/v1/stations/:id` — 상세 + 실시간 상태
- `GET /api/v1/vehicles/presets` — 차량 프리셋 목록
- `GET /api/v1/config` — 프론트 런타임 설정(TMAP 웹 키 등, §9)
- `GET /api/v1/health`

에러 형식 `{ code, message }`. TMAP 실패 → `UPSTREAM_TMAP`(추천 불가). 상태 API 실패 → 계속 진행하고 가용성 "알 수 없음" + `STATUS_UNAVAILABLE` 경고.

---

## 7. 데이터 모델 (SQLite)

```sql
CREATE TABLE stations (
  id            TEXT PRIMARY KEY,   -- statId (보완 데이터는 'SUP-' 접두)
  name          TEXT NOT NULL,
  address       TEXT,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  operator_id   TEXT,               -- busiId (필터 기준)
  operator      TEXT,               -- busiNm (표시용, trim)
  kind_detail   TEXT,               -- 충전소 구분 상세 (C001=고속도로 휴게소)
  is_rest_area  INTEGER DEFAULT 0,
  direction     TEXT,               -- 휴게소 방향(예: '부산방향'), 미상 NULL
  open_hours    TEXT,
  source        TEXT NOT NULL,      -- 'evcs' | 'supercharger' | 'supplement'
  updated_at    TEXT
);
CREATE TABLE chargers (
  station_id    TEXT NOT NULL REFERENCES stations(id),
  charger_id    TEXT NOT NULL,
  charger_type  TEXT NOT NULL,      -- 원본 chgerType
  connectors    TEXT NOT NULL,      -- 정규화 커넥터 목록, 쉼표 구분 (예: 'CCS1,NACS')
  output_kw     INTEGER,
  limited       INTEGER DEFAULT 0,  -- limitYn=Y → 1 (충전기 단위 값, 후보 계산에서 제외)
  PRIMARY KEY (station_id, charger_id)
);
CREATE INDEX idx_chargers_station ON chargers(station_id);
```
- 원본 충전기 타입 코드 → 정규화 커넥터 매핑표를 `packages/shared`에 둠 (복합 타입은 여러 커넥터로 펼침). 공식 코드표 기준:
  | chgerType | 원문 | 정규화 커넥터 | 비고 |
  |---|---|---|---|
  | 01 | DC차데모 | `CHADEMO` | |
  | 02 | AC완속 | `AC_SLOW` | |
  | 03 | DC차데모+AC3상 | `CHADEMO`, `AC3` | |
  | 04 | DC콤보 | `CCS1` | |
  | 05 | DC차데모+DC콤보 | `CHADEMO`, `CCS1` | |
  | 06 | DC차데모+AC3상+DC콤보 | `CHADEMO`, `AC3`, `CCS1` | |
  | 07 | AC3상 | `AC3` | |
  | 08 | DC콤보(완속) | `CCS1_SLOW` | 저출력 DC, 급속 아님 |
  | 09 | NACS | `NACS` | 현재 0건 |
  | 10 | DC콤보+NACS | `CCS1`, `NACS` | |
  | 11 | DC콤보2(버스전용) | `BUS_ONLY` | **승용차 사용 불가 → 항상 제외** |
  | 그 외 | (미정의 신규 코드) | `UNKNOWN` | 경고 로그, 후보 제외 |
- 적재 제외: `delYn=Y`. 후보 제외: `limitYn=Y` (DB에는 보관해 상세 표시용으로 사용 가능).
- 공통코드(기관·타입·상태·지역·충전소 구분)는 `packages/shared/codes/`에 데이터로 두고, 명세서 개정 시 갱신.
- 실시간 상태는 DB에 저장하지 않고 메모리 캐시.
- 기동 시 stations를 `flatbush`에 적재.
- 휴게소: `kindDetail=C001`(고속도로 휴게소)로 판정. 방향은 이름 괄호에서 추출하되 방향 사전(서울·부산·강릉·인천·목포·순천·대전·광주 등 도로 종점명)에 있는 값만 인정, 나머지는 `data/supplement/rest_area_overrides.json` 수동 보정.

### 차량 프리셋 (packages/shared)
```ts
{
  id: "tesla-model-y-lr",
  name: "Tesla Model Y Long Range",
  batteryKwh: /* Phase 0 확정 */,
  efficiencyKmPerKwh: /* Phase 0 확정 */,
  maxChargeKw: /* Phase 0 확정 */,
  chargeCurve: [[0, kw], [10, kw], ... [90, kw]],   // SoC% → 최대 수전 kW
  compatibleConnectors: ["NACS", "CCS1"]   // 차량 NACS 충전구 + DC콤보 컨버터 (확정)
}
```
1차는 Model Y 트림 프리셋만 제공. 직접 입력 UI는 Phase 5.

---

## 8. 프론트엔드 화면

```
┌────────────────────────────────────────────────────────────────┐
│ [출발지 ▾] [도착지 ▾] [⇄]  차량 [Model Y LR ▾]  현재 [60%]  [검색] │
│ ▸ 고급: 도착 목표 SoC · 충전 상한 · 최소 출력 · 선호 운영기관 · 버퍼   │
├──────────────────────────────┬─────────────────────────────────┤
│                              │ ▌추천 1  OO휴게소(부산방향)  +23분 │
│          TMAP 지도            │  우회 2분 · 충전 21분 · 가용 3/6   │
│  기본경로(회색)               │  22% 도착 → 58%까지 충전 → 목적지 20% │
│  추천경로(강조)               │ ▌대안 2 / 대안 3 (클릭 시 경로 전환) │
│  충전 구간 하이라이트          │ ─ 총 4시간 39분 · 396km            │
│  마커: 가용 多/少/알 수 없음    │ ─ 경고 배너                        │
└──────────────────────────────┴─────────────────────────────────┘
```
- 자동완성(디바운스 300ms), 지도 클릭으로 출발/도착 지정.
- 경로 위에 충전 가능 구간 `[d_min, d_max]` 표시.
- 상태 출처 표시: 실시간 / 보완 데이터 / 알 수 없음.
- 마지막 입력값은 `localStorage`(try/catch).

---

## 9. 설정·배포

### 런타임 설정
- 모든 설정은 환경변수 (`.env.example`).
- **TMAP 웹 키는 빌드 시 주입하지 않는다** (`VITE_*` 미사용). 프론트는 `GET /api/v1/config`로 키를 받아 SDK를 동적 로드 → 키 교체 시 이미지 재빌드 불필요.
- 웹 키는 브라우저에 노출되므로 TMAP 콘솔에서 허용 도메인 제한 (localhost, 추후 NAS 도메인).

### 로컬 개발
- `pnpm dev`: Vite(5173)와 API(3001) 동시 실행, Vite가 `/api` 요청을 API로 프록시.

### NAS Docker (Phase 4)
- **단일 컨테이너**: 멀티스테이지 빌드(web 빌드 → api 이미지에 정적 파일 포함), Fastify가 `/api`와 정적 파일을 함께 서빙. 포트 1개.
- `data/`는 볼륨 마운트 (SQLite DB, 보완 데이터 유지).
- 충전소 정적 데이터 갱신: 컨테이너 내 일 1회 스케줄(또는 기동 시 오래됐으면 갱신).
- SQLite는 Node 내장(`node:sqlite`)이라 네이티브 빌드가 없음 → 공식 `node:24` 이미지면 NAS CPU 아키텍처와 무관. (`node:sqlite`는 아직 실험 기능 표시가 붙어 있으므로 Node 업그레이드 시 변경 사항 확인)
- 외부 접속 시 NAS 리버스 프록시 + HTTPS, 쿼터 보호용 레이트리밋 필수.

---

## 10. 마일스톤

| Phase | 내용 | 완료 기준 |
|---|---|---|
| **0. 검증** | 키 발급, §3.3 체크리스트 (특히 🔴 3개) | 샘플 호출 3종 성공, 슈퍼차저 포함 여부·커넥터 매핑·상태 조회 방식 결론 문서화 |
| **1. 기반·데이터** ✅ | 모노레포, shared 스키마·프리셋, 충전소 덤프 → SQLite, 커넥터 매핑, 휴게소·방향 추출, 슈퍼차저 동기화 | 전국 충전소 적재, bbox 질의·매핑 단위 테스트 — **완료 (2026-10-08)**: 충전소 100,693곳·충전기 523,487대 적재, 공개 충전소 56,968곳 메모리 적재 0.7초, Model Y 급속 가능 20,764곳, 테스트 20개 통과 |
| **2. 추천 엔진** ✅ | TMAP 클라이언트, 배터리 모델·충전 곡선, 후보 추출, 우회 근사, 상태 결합, 비용함수, 정밀 재경로, Fastify API | 대표 시나리오 테스트 통과 — **완료 (2026-10-08)**: 테스트 40개 통과, 실제 API로 서울→부산·서울→강릉 추천 0.6~1.2초. 남은 일: 근사 vs 실측 ΔT 오차 로그(튜닝용) |
| **3. 웹 UI** | 지도·검색·결과 패널·경로/구간/마커 렌더링 | 입력 → 추천 → 대안 전환 전체 동작 |
| **4. 품질·배포** | 에러/빈 결과 처리, 로깅, 레이트리밋, Dockerfile·compose, README | 로컬 Docker 실행 성공, API 장애 시 degrade 확인 |
| **5. 고도화** | **충전 정차 횟수 지정(다중 정차)**, 차량 직접 입력, 테슬라 Fleet API SoC 연동, 요금/멤버십, 모바일 | — |

---

## 11. 리스크

| 리스크 | 대응 |
|---|---|
| 슈퍼차저 데이터 누락·부정확 | supercharge.info 일 1회 동기화, 출처·"실시간 상태 없음" UI 표시, 사이트 장애 시 마지막 적재본 유지 |
| supercharge.info 정책 변경·차단 | 하루 1회 호출, 마지막 성공본 보관, 외부 공개 전 이용 정책 확인 |
| 비호환 충전기 추천 | 커넥터 하드 필터 + 매핑 단위 테스트 |
| 근사 오차로 최적 후보 누락 | IC 페널티·휴게소 방향 반영, K 여유, 오차 로그로 튜닝 |
| 휴게소 경유지가 반대 차로로 붙음 | Phase 0 실험, 필요 시 경유지 좌표를 진행방향 차로 쪽으로 보정 |
| 실시간 상태 지연·부정확 | 도착 시점 감쇠, 상태 출처(실시간/슈퍼차저 정적/조회 실패) 표시, 조회 실패 시 STATUS_UNAVAILABLE 경고 |
| 상태 API가 충전소 단위 조회 불가 | 방식 B(백그라운드 변경분 동기화) |
| TMAP 쿼터 초과 | 요청당 약 4회 제한, 단기 캐시, 레이트리밋 |
| 충전 곡선 값 부정확 | 설정값으로 분리, 실제 충전 기록으로 보정 가능하게 |
| NAS 아키텍처 빌드 문제 | buildx 멀티 플랫폼 빌드, 대안으로 순수 JS SQLite 드라이버 검토 |

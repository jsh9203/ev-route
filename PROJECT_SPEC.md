# ⚡ Project: EV Route Optimizer (전기차 최적 충전 경로 탐색 서비스)

## 1. 프로젝트 개요 (Overview)
* **목표**: 전기차(테슬라 등) 운전자가 출발지와 목적지를 설정했을 때, 주행 경로 상에서 우회 시간(Detour Time)이 가장 적고 즉시 충전 가능한 최적 충전소를 추천 및 경유지로 자동 편성해 주는 웹 서비스 구축.
* **핵심 가치**: 
  - 단순 반경 검색이 아닌 주행 동선(Polyline Buffer) 기반 충전소 필터링
  - 실시간 충전기 가용 상태(대기/충전 중/고장) 반영
  - 충전 속도 및 우회 비용 기반 스코어링 알고리즘 제공

---

## 2. 시스템 아키텍처 및 기술 스택 (Tech Stack)

### 2.1 Backend
* **Language/Framework**: Python 3.11+ / FastAPI
* **Spatial & Data Processing**: `shapely`, `geopandas`, `httpx` (비동기 HTTP 클라이언트)
* **Database**: PostgreSQL (PostGIS 확장 권장) 또는 MySQL 8.0+ (Spatial Index 사용)
* **Cache**: Redis (외부 API 호출량 절감 및 실시간 충전소 상태 캐싱)

### 2.2 Frontend
* **Framework**: React / TypeScript (또는 Vite 기반 SPA)
* **Map SDK**: Kakao Maps JavaScript SDK (또는 Naver Maps SDK)
* **State Management & Query**: TanStack Query (React Query), Tailwind CSS

### 2.3 External APIs
1. **TMAP Mobility API**: 
   * 자동차 경로 탐색 (다중 경유지 경로 및 Polyline 좌표 배열 추출)
2. **공공데이터포털 (한국환경공단)**:
   * `전기자동차 충전소 정보` API (정적 위치 정보 및 실시간 사용 가능 현황)

---

## 3. 핵심 파이프라인 및 데이터 흐름 (Data Flow)

[사용자]
  │ 출발지 / 목적지 / 필터 조건 입력
  ▼
[Frontend] ──(POST /api/v1/routes/optimize)──▶ [FastAPI Backend]
                                                      │
  ┌───────────────────────────────────────────────────┘
  │ 1. TMAP API 호출: 기본 경로 Polyline (LineString) 획득
  │ 2. Spatial Buffer 생성: 도로망 축 반경 N km 이내 영역 산출
  │ 3. DB Spatial Query: 버퍼 내 후보 충전소 1차 추출
  │ 4. 공공 API / Redis: 후보 충전소의 실시간 상태(충전 가능 여부) 조인
  │ 5. Scoring Engine: 우회 시간 + 충전기 스펙 기반 순위 매김
  │ 6. TMAP API 재호출: 1순위 충전소를 경유지로 삽입한 최종 상세 경로 계산
  ▼
[Frontend]
  │ 최종 Polyline 렌더링, 추천 충전소 마커 및 상세 요약 정보 표시

---

## 4. 핵심 모듈 상세 설계

### 4.1 데이터베이스 스키마 (Candidate Table: `charging_stations`)

CREATE TABLE charging_stations (
    station_id VARCHAR(50) PRIMARY KEY,     -- 충전소 식별자 (statId)
    name VARCHAR(100) NOT NULL,             -- 충전소명
    latitude DOUBLE PRECISION NOT NULL,     -- 위도 (lat)
    longitude DOUBLE PRECISION NOT NULL,    -- 경도 (lng)
    location GEOMETRY(Point, 4326),         -- 공간 인덱스용 포인트
    operator VARCHAR(50),                   -- 운영기관 (환경부, 테슬라, 채비 등)
    fast_charger_count INT DEFAULT 0,       -- 급속 충전기 수량
    slow_charger_count INT DEFAULT 0,       -- 완속 충전기 수량
    max_output_kw INT DEFAULT 50,           -- 최대 출력 (kW)
    is_highway_rest_area BOOLEAN DEFAULT FALSE, -- 고속도로 휴게소 여부
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stations_location ON charging_stations USING GIST(location);

### 4.2 충전소 추천 스코어링 알고리즘 (Scoring Logic)
* **목적**: 불필요한 우회 시간이 적고, 출력이 높으며, 지금 당장 빈자리가 있는 충전소를 우선 선별.
* **수식**:
  Score = (w1 * Detour Penalty) + (w2 * Speed Score) + (w3 * Availability Score)

* **세부 산출 기준**:
  1. **우회 페널티 (Detour Penalty, 음수 가중치)**:
     - Delta T = Duration(출발 → 충전소 → 도착) - Duration(출발 → 도착)
     - 고속도로 휴게소 충전소는 IC 진출입이 없어 Delta T ≈ 0으로 높은 점수 부여.
  2. **속도 점수 (Speed Score, 양수 가중치)**:
     - 50kW: 1점, 100kW~200kW: 3점, 250kW+(수퍼차저 V3 등): 5점.
  3. **가용성 점수 (Availability Score)**:
     - 사용 가능 충전기 수 >= 2: 2점
     - 사용 가능 충전기 수 == 1: 1점
     - 사용 가능 충전기 수 == 0: 후보에서 제외 (Hard Filter)

---

## 5. API 엔드포인트 명세 (API Specifications)

### POST /api/v1/routes/optimize

* **Request Body 예시**:
{
  "origin": {
    "name": "출발지",
    "lat": 37.4979,
    "lng": 127.0276
  },
  "destination": {
    "name": "목적지",
    "lat": 35.1796,
    "lng": 129.0756
  },
  "preferences": {
    "min_output_kw": 100,
    "preferred_operators": ["환경부", "테슬라"],
    "buffer_distance_km": 2.0
  }
}

* **Response Body 예시**:
{
  "summary": {
    "total_distance_meter": 395000,
    "total_duration_seconds": 15400,
    "detour_duration_seconds": 360
  },
  "selected_station": {
    "station_id": "ME10293",
    "name": "덕평자연휴게소 강릉방향 충전소",
    "lat": 37.2023,
    "lng": 127.3688,
    "available_chargers": 3,
    "total_chargers": 6,
    "max_output_kw": 200,
    "operator": "한국환경공단"
  },
  "route_polyline": [
    [37.4979, 127.0276],
    [37.2023, 127.3688],
    [35.1796, 129.0756]
  ],
  "alternative_candidates": []
}

---

## 6. 단계별 마일스톤 (Milestones)

* **Phase 1: 데이터 파이프라인 및 DB 구축**
  - 공공데이터포털 충전소 API 데이터 덤프 수집 스크립트 작성
  - 공간 DB(Spatial Table) 생성 및 데이터 정규화 적재
* **Phase 2: 백엔드 핵심 로직 구현**
  - TMAP API 연동 (경로 탐색 및 Polyline 파싱)
  - Polyline 기반 Buffer 지리 쿼리 작성 (ST_DWithin / ST_Buffer)
  - 실시간 충전소 상태 조회 API 연동 및 스코어링 모듈 작성
* **Phase 3: 프론트엔드 연동 및 시각화**
  - 지도 SDK 연동, 출발지/목적지 검색 UI 구현
  - 경로 Polyline 렌더링 및 경유 충전소 커스텀 마커 표시
* **Phase 4: 고도화 (Nice-to-Have)**
  - 테슬라 Fleet API 연동을 통한 실시간 배터리 잔량(SoC) 자동 반영
  - 요금제 및 멤버십 혜택별 필터링 기능 추가
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## 프로젝트

EV Route: 출발지·도착지를 입력하면 경로상 최적 충전소 1곳을 추천하는 전기차 웹 서비스 (한국 대상, UI/문서/주석은 한국어). 설계 기준 문서는 `PLAN.md`(v3, 현행)이며 `PROJECT_SPEC.md`는 폐기된 Gemini 초안(참고용 보존). 알고리즘·단계(Phase)·확정 사항은 `PLAN.md`를 먼저 볼 것.

## 명령어

pnpm 모노레포 (Node >= 24, TypeScript 단일 스택). 루트에서 실행:

- `pnpm dev` — api(`:3001`) + web(Vite `:5173`, `/api`는 api로 프록시) 동시 실행
- `pnpm test` — vitest (`packages/**/src/**/*.test.ts`, `apps/**/src/**/*.test.ts`)
  - 단일 파일: `pnpm vitest run apps/api/src/battery/battery.test.ts`, 단일 테스트: `-t "<이름>"`
- `pnpm typecheck` — 전 워크스페이스 `tsc`
- `pnpm sync:stations` — 환경공단 충전소 정적 데이터를 `data/stations.sqlite`로 동기화
- `pnpm --filter @ev-route/api explain|inspect` — 동기화 데이터 확인용 보조 스크립트
- `pnpm --filter @ev-route/web build` — 웹 빌드

API는 빌드 없이 `tsx`로 직접 실행한다. 린터는 없다.

## 환경

`.env.example`을 `.env`로 복사해 사용. 필요한 키: `TMAP_APP_KEY`(서버 전용), `TMAP_WEB_APP_KEY`(브라우저 SDK용, 비면 `TMAP_APP_KEY` 사용), `DATA_GO_KR_SERVICE_KEY`(Decoding 키). 웹 빌드에는 키를 넣지 않고 서버가 `/api/v1/config`로 런타임에 전달한다. `apps/api/src/config.ts`의 키는 getter라 사용 시점에 검증된다.

## 아키텍처

- `packages/shared` — web/api가 공유하는 zod 스키마·API 타입·차량 프리셋(`vehicles.ts`)·스코어링 상수(`scoring.ts`)·경고/오류 코드(`codes.ts`). 요청/응답 계약을 바꾸면 여기부터 수정.
- `apps/api` — Fastify. `server.ts`가 라우트를 정의하고 `buildServer(deps)`로 의존성(TMAP 클라이언트, StationIndex, StatusService, PriceBook)을 주입받는 구조라 테스트에서 목 주입이 쉽다. 오류는 `setErrorHandler`에서 `ApiError`(`code`/`message`)로 통일 변환(Zod/BadRequest→400, UpstreamError→502).
  - 추천 파이프라인(`recommend/engine.ts`): TMAP 기본 경로 → `RouteLine`(경로 따라 km 위치/고속도로 구간 판별) → 배터리 모델(`battery/`)로 충전 가능 구간 산출 → 인메모리 공간 인덱스(`stations/stationIndex.ts`, flatbush)로 후보 추출 → 근사 우회비용(`recommend/evaluate.ts`)으로 정렬 → 상위 N개만 TMAP 정밀 재탐색 + 실시간 상태 조회 → 분 단위 비용함수로 최종 순위. 80% 충전으로 불가능하면 100%로 자동 상향(`CHARGE_CAP_RAISED`).
  - 충전소 데이터는 SQLite(`db/`)에 저장되고 기동 시 메모리 인덱스로 로드된다. 소스는 환경공단(`evcs`), 슈퍼차저(`sync/supercharger.ts`), 휴게소(`sync/restArea.ts`) 세 가지이며 `source` 필드로 구분. 실시간 상태는 환경공단 `getChargerInfo`를 `statId`로 조회(`getChargerStatus`는 최근 변경분만 반환해 부적합 — PLAN.md §3.4)하고 TTL 캐시(`status/`).
  - 요금: 공식 API가 없어 `data/prices.json`(운영사 busiId별 원/kWh)을 직접 관리하며 저장 즉시 반영(재시작 불필요). 순위에는 영향 없이 예상 비용 표시용.
- `apps/web` — Vite + React 19 + Tailwind 4 + TanStack Query, TMAP JS SDK v2 지도. 상태는 `state.ts`, 지도 로직은 `map/`, 모바일은 지도 전체화면 + `BottomSheet`(`useMediaQuery`로 분기).
- 좌표는 전부 GeoJSON 순서 `[lng, lat]` (초안의 `[lat,lng]`와 다름).

## 기타

- `scripts/make_icon.py <busiId> <image_url> [out_dir]` — 충전 사업자 로고를 100x100 투명 PNG로 변환 (`python -I`, Pillow/requests 필요, SVG는 `resvg-py`). 결과물은 `apps/web/public/icon/`.
- `scripts/setup-git.ps1` — `.env`의 GIT_*/GITHUB_* 값으로 이 저장소에만 local git 계정 설정.
- `data/*.sqlite*`는 git 제외. 새 환경에서는 `pnpm sync:stations`로 생성.

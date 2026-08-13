# Config

이 디렉터리는 MARKET BRIEF의 **지표 Master / Source Map / 실제 API 매핑**을 분리해서 관리합니다.

## 상태

- Master 기준: 277개 항목
- KRX: 공급자와 대상 영역은 확인됨. 각 API 상품의 정확한 URL/API ID와 이용승인을 지표별로 매핑해야 함.
- ECOS: Open API collector 기본 함수 준비됨. 정확한 통계표코드/주기/항목코드를 지표별로 매핑해야 함.
- KOFIA / 글로벌 공식소스는 이후 source family별로 추가.

## 중요한 규칙

1. `metricId`는 전 항목에서 유일해야 합니다.
2. API 키는 config 파일에 넣지 않습니다.
3. `publicRepoSafe !== true`인 제3자 값은 공개 snapshot에 자동 게시하지 않습니다.
4. 날짜가 한국 기준일과 다르다는 이유만으로 미국 전일 종가를 stale 처리하지 않습니다.
5. 파생지표는 upstream metric ID와 sourceDate lineage를 보존합니다.

## 다음 파일

실제 시리즈 매핑 단계에서 아래 파일을 추가합니다.

- `metric-registry.v1.json` — 277개 지표의 고유 ID와 중요도
- `krx-series-map.v1.json` — KRX API 상품/필드 매핑
- `ecos-series-map.v1.json` — ECOS 통계표/항목코드 매핑
- 이후 `global-series-map.v1.json`

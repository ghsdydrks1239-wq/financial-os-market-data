# Config

이 디렉터리는 MARKET BRIEF의 **지표 Master / Source Map / 실제 API 매핑**을 분리해서 관리합니다.

## 상태

- Master 기준: 277개 항목
- KRX: 7개 API 인증과 주요 selector 검증 완료. 공개 저장소 재배포 권리 확인 전까지 값은 비공개 처리.
- ECOS: 국내 금리·신용·원화환율 19개 항목 매핑과 수집 완료.
- EIA: 원자재 5개 history HTML 매핑과 transient collector 완료. 제3자 가격 재배포 권리 확인 전까지 public bundle 제외.
- 글로벌 공식소스는 source family별 config와 collector를 추가해 관리.

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

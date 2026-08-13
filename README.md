# Financial OS — Market Data

MARKET BRIEF용 시장 데이터 파이프라인 저장소입니다.

## 목적

- 기존 시황 자료에서 정리한 **277개 Market Metric Master**를 기준으로 데이터를 수집합니다.
- 숫자는 가능한 한 공식 API / 공식 다운로드를 우선합니다.
- 누락값은 `0`으로 만들지 않고 `null + status`로 보존합니다.
- `referenceDate`, `sourceDate`, `marketSession`, `sessionAligned`, `status`를 분리해 저장합니다.
- 공개 재배포 권리가 확인되지 않은 데이터는 public snapshot에 값을 넣지 않습니다.

## 2026-08-13 현재 상태

### ECOS

- `ECOS_API_KEY` GitHub Secret 확인 완료
- 실제 ECOS API 연결 성공
- 국내 금리·신용·원화환율 19개 Master 항목을 `config/ecos-series.v1.json`에 매핑
- 19개 중 18개 실제 수집 성공, `RP 금리` 1개는 정확한 시장 RP 개념의 소스를 찾을 때까지 `missing`으로 유지
- 첫 정규화 snapshot 생성 완료: `data/snapshots/ecos/2026-08-13.json`
- 요청 timeout + retry 적용

### KRX

- `KRX_API_KEY` GitHub Secret 확인 완료
- KOSPI 지수 / KOSDAQ 지수 / 유가증권 / 코스닥 / ETF / 선물 / 옵션 7개 API 실제 인증 성공
- KOSPI, KOSDAQ, KOSPI200 및 주요 ETF exact selector 검증 완료
- KOSPI200 선물 product selector와 KOSPI200 옵션 CALL/PUT 입력 존재 여부 검증 완료
- 확인 결과는 `config/krx-verification.v1.json`에 저장
- KRX 수신값은 현재 이 public 저장소의 snapshot에 저장하지 않음

KRX OPEN API 기본 약관상 수신 정보를 제3자에게 제공하는 데 제한이 있으므로, `config/krx-series.v1.json`의 `publicOutputAllowed`는 `false`로 둡니다. KRX 값은 권리 구조를 확정하기 전까지 내부 수집/검증용으로만 취급합니다.

## GitHub Actions

- `Check MARKET DATA setup`: Secret, ECOS, KRX 인증 및 selector를 수동 검증
- `Collect ECOS snapshot`: ECOS 지표를 수집해 날짜별 snapshot과 `latest.json`을 생성
- 현재 둘 다 `workflow_dispatch` 수동 실행만 사용합니다. 데이터 소스와 공개범위를 더 확정한 뒤 일일 스케줄을 붙입니다.

## 필요한 GitHub Actions Secrets

이 저장소의 `Settings → Secrets and variables → Actions`에 아래 두 값이 필요합니다.

- `KRX_API_KEY`
- `ECOS_API_KEY`

API 키는 코드, 커밋, 이슈, README에 직접 기록하지 않습니다.

## 디렉터리

```text
config/                 지표/소스 매핑과 스키마
src/collectors/         공급자별 collector
src/lib/                공통 유틸리티
scripts/                검증·smoke-test·snapshot 생성 스크립트
data/snapshots/         날짜별 공개 가능한 snapshot
.github/workflows/      GitHub Actions
```

## 운영 원칙

`collect → normalize → validate → snapshot → market-brief`

AI는 검증된 숫자를 해석하는 마지막 단계에서만 사용하며, 없는 숫자를 추정해 채우지 않습니다.

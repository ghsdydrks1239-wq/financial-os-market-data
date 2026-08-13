# Financial OS — Market Data

MARKET BRIEF용 시장 데이터 파이프라인 저장소입니다.

## 목적

- 기존 시황 자료에서 정리한 **277개 Market Metric Master**를 기준으로 데이터를 수집합니다.
- 숫자는 가능한 한 공식 API / 공식 다운로드를 우선합니다.
- 누락값은 `0`으로 만들지 않고 `null + status`로 보존합니다.
- `referenceDate`, `sourceDate`, `marketSession`, `sessionAligned`, `status`를 분리해 저장합니다.
- 공개 재배포 권리가 확인되지 않은 데이터는 public snapshot에 값을 넣지 않습니다.

## 2026-08-13 현재 상태

### Public MARKET bundle

- 프런트엔드가 바로 읽을 수 있는 `data/public/latest.json` 생성 완료
- 현재 **40개 지표 중 39개 available / 1개 missing / 0 error**
- 포함 공급자: ECOS, ECOS 기반 검증 파생지표, U.S. Treasury, Fed Liquidity, Federal Reserve Board Commercial Paper
- KRX와 NY Fed reference-rate 값은 현재 public bundle에서 제외

### ECOS

- `ECOS_API_KEY` GitHub Secret 확인 완료
- 실제 ECOS API 연결 성공
- 국내 금리·신용·원화환율 19개 Master 항목을 `config/ecos-series.v1.json`에 매핑
- 19개 중 18개 실제 수집 성공, `RP 금리` 1개는 정확한 시장 RP 개념의 소스를 찾을 때까지 `missing`으로 유지
- 날짜별 snapshot: `data/snapshots/ecos/`
- 요청 timeout + retry 적용

### 국내 금리 파생지표

- 기존 시황 파일의 실제 수식을 audit에서 복구해 7개 스프레드를 구현
- KTB 10Y-3Y, AA- 신용스프레드, BBB- 신용스프레드, CD91-TB91, KTB3-기준금리, CD91-기준금리, KTB3-TB91
- 7개 모두 실제 계산 성공
- 날짜별 snapshot: `data/snapshots/derived/`

### U.S. Treasury / Fed Liquidity / Commercial Paper / NY Fed

- U.S. Treasury 공식 XML 연결 성공
- UST 3M / 1Y / 2Y / 3Y / 5Y / 10Y / 20Y / 30Y + 2s10s = 9개 수집 성공
- 날짜별 Treasury snapshot: `data/snapshots/treasury/`
- Federal Reserve Board Data Download Program에서 IORB와 H.4.1 TGA 시리즈를 직접 수집
- ON RRP Balance / ON RRP Rate는 FRED의 Federal Reserve Bank of New York 원천 시리즈를 수집하고 원천 출처 메타데이터를 유지
- Fed Liquidity 4개(IORB, TGA Balance, ON RRP Balance, ON RRP Rate) 모두 실제 수집 성공
- 날짜별 Fed Liquidity snapshot: `data/snapshots/fed-liquidity/`
- Federal Reserve Board Commercial Paper 공식 일별 표에서 `US CP Rate = 90-Day AA Nonfinancial Commercial Paper Interest Rate`를 수집
- 최신 일자의 90일물 계산이 `n.a.`이면, 최근 일별 행 중 거래 데이터가 충분해 실제 금리가 계산된 가장 가까운 관측일을 사용하고 `sourceDate`와 `expectedSourceDate`를 분리
- 날짜별 US CP snapshot: `data/snapshots/us-cp/`
- NY Fed SOFR / EFFR API 연결과 정규화 수집은 성공했으나, reference-rate 표시 시 필요한 이용조건을 프런트엔드에 반영하기 전까지 public bundle에는 넣지 않음

### KRX

- `KRX_API_KEY` GitHub Secret 확인 완료
- KOSPI 지수 / KOSDAQ 지수 / 유가증권 / 코스닥 / ETF / 선물 / 옵션 7개 API 실제 인증 성공
- KOSPI, KOSDAQ, KOSPI200 및 주요 ETF exact selector 검증 완료
- KOSPI200 선물 product selector와 KOSPI200 옵션 CALL/PUT 입력 존재 여부 검증 완료
- 확인 결과는 `config/krx-verification.v1.json`에 저장
- KRX 수신값은 현재 이 public 저장소의 snapshot에 저장하지 않음

KRX OPEN API 기본 약관상 수신 정보를 제3자에게 제공하는 데 제한이 있으므로, `config/krx-series.v1.json`의 `publicOutputAllowed`는 `false`로 둡니다. KRX 값은 권리 구조를 확정하기 전까지 내부 수집/검증용으로만 취급합니다.

## GitHub Actions

- `Check MARKET DATA setup`: Secret, ECOS, KRX 인증 및 selector 수동 검증
- `Check global rates sources`: U.S. Treasury / NY Fed / Federal Reserve Board / Fed Liquidity / US CP 연결과 정규화 수동 검증
- `Collect public market snapshot`: ECOS + 검증 파생지표 + U.S. Treasury + Fed Liquidity + US CP를 수집해 `data/public/latest.json` 생성
- 현재 자동 스케줄은 붙이지 않았습니다. 데이터 소스와 공개범위를 더 확정한 뒤 일일 스케줄을 붙입니다.

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
data/snapshots/         날짜별 source snapshot
data/public/            공개 가능한 MARKET BRIEF 숫자 bundle
.github/workflows/      GitHub Actions
```

## 운영 원칙

`collect → normalize → validate → snapshot → market-brief`

AI는 검증된 숫자를 해석하는 마지막 단계에서만 사용하며, 없는 숫자를 추정해 채우지 않습니다.

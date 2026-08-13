# Financial OS — Market Data

MARKET BRIEF용 시장 데이터 파이프라인 저장소입니다.

## 목적

- 기존 시황 자료에서 정리한 **277개 Market Metric Master**를 기준으로 데이터를 수집합니다.
- 숫자는 가능한 한 공식 API / 공식 다운로드를 우선합니다.
- 누락값은 `0`으로 만들지 않고 `null + status`로 보존합니다.
- `referenceDate`, `sourceDate`, `marketSession`, `sessionAligned`, `status`를 분리해 저장합니다.
- 공개 재배포 권리가 확인되지 않은 데이터는 public snapshot에 값을 넣지 않습니다.
- AI는 검증된 숫자 bundle을 해석할 뿐, 누락된 숫자를 추정해 만들지 않습니다.

## 2026-08-13 현재 상태

### Public MARKET bundle

- 프런트엔드가 바로 읽을 수 있는 `data/public/latest.json` 생성 완료
- 현재 **69개 지표 중 68개 available / 1개 missing / 0 error**
- 포함 공급자: ECOS, ECOS 기반 검증 파생지표, U.S. Treasury, Fed Liquidity, Federal Reserve Board Commercial Paper, BLS 기반 파생지표, 일본 재무성, BIS, 영란은행, 독일 연방은행, 스페인 중앙은행, OECD
- KRX 값, NY Fed SOFR/EFFR reference-rate 값, 별도 권리 검토가 필요한 FRED 저작권 시리즈는 public bundle에서 제외
- NY Fed의 **Reverse Repo operation data는 NY Fed Markets Data API에서 직접 수집해 포함**

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

### U.S. Treasury / Fed Liquidity / Commercial Paper

- U.S. Treasury 공식 XML 연결 성공
- UST 3M / 1Y / 2Y / 3Y / 5Y / 10Y / 20Y / 30Y + 2s10s = 9개 수집 성공
- 날짜별 Treasury snapshot: `data/snapshots/treasury/`
- Federal Reserve Board Data Download Program에서 IORB와 H.4.1 TGA 시리즈를 직접 수집
- ON RRP Balance / ON RRP Rate는 FRED를 거치지 않고 **New York Fed Markets Data API의 Reverse Repo operation results를 직접 수집**
- Fed Liquidity 4개(IORB, TGA Balance, ON RRP Balance, ON RRP Rate) 모두 실제 수집 성공
- 날짜별 Fed Liquidity snapshot: `data/snapshots/fed-liquidity/`
- Federal Reserve Board Commercial Paper 공식 일별 표에서 `US CP Rate = 90-Day AA Nonfinancial Commercial Paper Interest Rate`를 수집
- 최신 일자의 90일물 계산이 `n.a.`이면 최근 일별 행 중 실제 금리가 계산된 가장 가까운 관측일을 사용하고 `sourceDate`와 최신 표 일자를 구분
- 날짜별 US CP snapshot: `data/snapshots/us-cp/`

### BLS / Sahm Rule

- BLS Public Data API의 계절조정 실업률 `LNS14000000`을 직접 수집
- 최신 3개월 평균 실업률에서 직전 12개월의 3개월 평균 최저치를 빼는 방식으로 `Sahm Rule`을 계산
- 현재 데이터 vintage 기준 계산값을 저장하며, 과거 시점의 실시간 vintage를 재구성한 값은 아님을 quality note에 명시
- 날짜별 snapshot: `data/snapshots/us-labor-signals/`

### NY Fed reference rates

- SOFR / EFFR direct API 연결과 정규화 수집은 성공
- reference-rate 데이터를 표시할 때 필요한 New York Fed 고지문을 프런트엔드에 반영하기 전까지 public bundle에는 넣지 않음
- Reverse Repo operation data는 reference-rate 데이터와 구분해 direct API로 수집

### KRX

- `KRX_API_KEY` GitHub Secret 확인 완료
- KOSPI 지수 / KOSDAQ 지수 / 유가증권 / 코스닥 / ETF / 선물 / 옵션 7개 API 실제 인증 성공
- KOSPI, KOSDAQ, KOSPI200 및 주요 ETF exact selector 검증 완료
- KOSPI200 선물 product selector와 KOSPI200 옵션 CALL/PUT 입력 존재 여부 검증 완료
- 확인 결과는 `config/krx-verification.v1.json`에 저장
- KRX 수신값은 현재 이 public 저장소의 snapshot에 저장하지 않음

KRX OPEN API 수신값의 공개 재배포 권리 구조를 확정하기 전까지 `config/krx-series.v1.json`의 `publicOutputAllowed`는 `false`로 유지합니다.

### EIA 원자재 가격

- EIA 공식 일별 history HTML에서 WTI, Brent, Henry Hub 천연가스, 휘발유, 난방유 5개 시리즈를 API 키 없이 수집
- 주간 표의 월~금 값을 실제 일별 `sourceDate`로 정규화하고 휴일·결측 칸은 건너뜀
- 단위 테스트와 GitHub Actions 실소스 검증을 연결
- 기초 가격의 제3자 재배포 권리가 확정되지 않았으므로 수집 결과는 `.tmp` 검증 출력에만 쓰며 `data/public/latest.json`과 커밋되는 snapshot에는 포함하지 않음

## 데이터 권리 원칙

- 원 출처의 공식 API/다운로드를 우선합니다.
- 단순히 무료로 조회된다는 이유만으로 public 재배포 가능하다고 가정하지 않습니다.
- FRED에서 제공되는 제3자/저작권 시리즈는 원 제공기관의 직접 소스 또는 별도 권리 검토가 없으면 AI-facing public bundle에 넣지 않습니다.
- New York Fed reference rates처럼 별도 표시 조건이 있는 데이터는 프런트엔드 고지 요건까지 충족된 뒤 공개합니다.

## GitHub Actions

- `Check MARKET DATA setup`: Secret, ECOS, KRX 인증 및 selector 수동 검증
- `Check global rates sources`: U.S. Treasury / NY Fed / Federal Reserve Board / Fed Liquidity / US CP / BLS Sahm Rule / EIA 원자재 가격 연결과 정규화 수동 검증
- `Collect public market snapshot`: 공개 가능한 공식 소스들을 수집해 `data/public/latest.json` 생성
- 공개 스냅샷은 매일 07:30 KST에 실행하고 07:40·07:50 KST를 백업 슬롯으로 사용합니다. 같은 KST 기준일의 snapshot이 이미 있으면 백업 실행은 API 호출 없이 종료합니다.

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

# Windows Local Market Dashboard

이 화면은 서버나 별도 프로그램 설치 없이 Windows 기본 기능과 브라우저로 실행합니다.

## 실행

1. 저장소 루트의 `START_MARKET_DASHBOARD.bat`를 더블클릭합니다.
2. 최신 `data/public/latest.json`을 GitHub에서 내려받습니다.
3. 기본 브라우저에서 로컬 대시보드가 열립니다.

다운로드에 실패하면 저장소에 포함된 snapshot을 사용합니다. 한 번이라도 정상 실행했다면 `viewer/.local-data/`의 마지막 캐시도 사용할 수 있습니다.

## 표시 원칙

- 수집 또는 계산된 숫자만 표시합니다.
- `missing`, `stale`, `error`를 숨기지 않습니다.
- 누락값을 `0`으로 대체하지 않습니다.
- 각 지표의 단위, source date, provider를 함께 표시합니다.
- API 키와 제한 데이터는 이 화면이나 Git 커밋에 저장하지 않습니다.

## 현재 화면

- Overview
- Korea Rates
- Global Rates
- FX
- Data Quality

원자재와 주식은 공개 가능한 snapshot이 준비된 뒤 같은 구조로 추가합니다.

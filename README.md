# Financial OS — Market Data

MARKET BRIEF용 시장 데이터 파이프라인 저장소입니다.

## 목적

- 기존 시황 자료에서 정리한 **277개 Market Metric Master**를 기준으로 데이터를 수집합니다.
- 숫자는 가능한 한 공식 API / 공식 다운로드를 우선합니다.
- 누락값은 `0`으로 만들지 않고 `null + status`로 보존합니다.
- 한국 아침 브리프에서는 전일 미국 종가를 정상적인 `sessionAligned` 데이터로 처리합니다.
- 공개 재배포 권리가 불분명한 제3자 지표는 권리 확인 전까지 public snapshot에 값이 노출되지 않도록 설계합니다.

## 현재 단계

1. 저장소 구조 생성
2. KRX / ECOS collector 기반 코드 준비
3. 277개 지표의 source / series / product 매핑
4. 실제 API smoke test
5. 일별 snapshot 생성
6. `market-brief.json` 생성
7. 이후 웹 `financial-os-prototype`에서 결과를 읽도록 연결

## 필요한 GitHub Actions Secrets

이 저장소의 `Settings → Secrets and variables → Actions`에 아래 두 값을 등록합니다.

- `KRX_API_KEY`
- `ECOS_API_KEY`

API 키는 코드, 커밋, 이슈, README에 직접 기록하지 않습니다.

## 디렉터리

```text
config/                 지표/소스 매핑과 스키마
src/collectors/         공급자별 collector
src/lib/                공통 유틸리티
scripts/                검증·smoke-test·snapshot 생성 스크립트
data/snapshots/         향후 날짜별 snapshot
.github/workflows/      GitHub Actions
```

## 운영 원칙

`collect → normalize → validate → snapshot → market-brief`

AI는 검증된 숫자를 해석하는 마지막 단계에서만 사용하며, 없는 숫자를 추정해 채우지 않습니다.

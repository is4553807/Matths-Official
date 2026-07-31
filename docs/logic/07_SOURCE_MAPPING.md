# 문서 권위와 정책 이동표

## 권위 원본

| 주제 | 문서 |
|---|---|
| 현행 Matths 구현 | `01_MATTHS_CURRENT_SYSTEM.md` |
| 공통 1대1 규칙 | `02_GOAT_ARENA_COMMON_MATCH_RULES.md` |
| Sub·학습권·페이백·재구독 | `03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md` |
| Main 만료·Sub 강등·재진입 경계 | `04_MAIN_DIVISION_RANKING_SYSTEM.md` |
| 기술 설계 | `05_SHARED_TECHNICAL_DESIGN.md` |
| 구현 계획 | `06_IMPLEMENTATION_PLAN.md` |
| Final Ranking | `08_FINAL_RANKING_SYSTEM.md` |
| 손익 시뮬레이션·출시 가정 | `09_GOAT_ARENA_PROFIT_LOSS_SIMULATION.md` |
| 룰 평가·설명·콘텐츠 전략 | `10_RULE_EVALUATION_AND_CONTENT_STRATEGY.md` |
| DB·캐시 저장 경계 | `11_DATA_STORAGE_AND_CACHE_BOUNDARIES.md` |

## 폐기된 정책

다음 정책은 비활성이다.

- 무료 Sub Arena
- 무료 방어자 풀
- 무료 주 1회 공격
- 만료 사용자의 주간 모의고사
- 만료 사용자의 활성 Final Ranking

## 현재 만료 루프

```text
학습권 0
→ Main 사용자는 Sub로 강등
→ 모든 공식 경쟁·주간 모의고사 잠금
→ 결제창
```

Main 사용자:

```text
72시간 내 결제
→ Main-to-Sub Convert
→ 새 Sub 페이백 주기

72시간 초과 결제
→ 재구독 랭크 결정전
→ 변환 기준보다 낮은 Sub 배치
→ 새 페이백 주기
```

## 시험 명칭

| 명칭 | 역할 |
|---|---|
| 최초 배치고사 | 최초 MMR·Sub 배치 |
| 시즌 배치고사 | 연간 시즌 Division 내부 배치 |
| 재구독 랭크 결정전 | 72시간 초과 갱신자의 Sub 재진입 |
| 랭크 복귀전 | 위 시험의 앱 축약명 |
| 휴면 복귀 평가전 | 장기 미접속 복귀 |

## 결제일 규칙

```text
20:00 이전
→ 오늘이 1일차

20:00 이후
→ 오늘 차감 없음
→ 다음 00:00부터 1일차
```

## 금지되는 해석

- 학습권이 남았는데 추가 패키지 구매
- 만료 사용자를 무료 방어자로 사용
- 학습권 만료 후에도 Main 소속을 유지한다고 표시
- 72시간 내 갱신자를 Main에서 바로 재개
- 재구독 랭크 결정전을 시즌 배치고사로 표현
- 늦은 갱신자가 정상 변환 위치보다 높게 배치
- 실제 낮은 페널티 배치를 Final Ranking 성장 기준으로 사용
- 클라이언트 시각으로 20:00·72시간 판정

## 밑작업 코드 매핑 (2026-08-01)

| 책임 | 구현 파일 |
|---|---|
| Arena 정책·이용 주기·순위·학습일 원장 | `models/goatArenaModel.js` |
| 20시 첫날·29일 주기와 재결제 정책 변경 고지 초안 | `services/accessCycleService.js` |
| 활성 정책 snapshot·캐시·변경 비교 | `services/arenaPolicyService.js` |
| 첫 달 실측 지표·가정 카탈로그 | `dataAnalysis/metricCatalog.js` |
| 분석 컬렉션 (`dataAnalysis`) | `dataAnalysis/dataAnalysisModel.js` |
| 분석 관측·카탈로그 seed | `services/dataAnalysisService.js`, `scripts/seedDataAnalysisCatalog.js` |
| DB·캐시 저장 경계 | `11_DATA_STORAGE_AND_CACHE_BOUNDARIES.md` |
| 생년월일 검증·실명+생년월일+고등학교 해시·관리자 알림 | `services/identityRiskService.js` |
| 기존 계정 3요소 해시 백필(dry-run 기본) | `scripts/backfillIdentityMatchV1.js` |
| Arena GP 티어 표시 정책(MMR 설정과 분리) | `services/arenaTierPolicy.js` |
| 구매·경기·주간 모의고사 자격 판정 골격 | `services/arenaEligibilityService.js` |
| 매치·스냅샷·변환·Final Ranking·이벤트 골격 | `models/goatArenaModel.js` |
| N수생 학사연도 전환 | `services/userLifecycleService.js` |
| N수생 게시판 권한 | `services/communityService.js` |

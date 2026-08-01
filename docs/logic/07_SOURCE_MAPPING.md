# 문서 권위와 정책 이동표

## 권위 원본

| 주제 | 문서 |
|---|---|
| 현행 Matths 구현 | `01_MATTHS_CURRENT_SYSTEM.md` |
| 공통 1대1 규칙 | `02_GOAT_ARENA_COMMON_MATCH_RULES.md` |
| Sub·학습권·페이백·재구독 | `03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md` |
| Main 경기·학습일수·초대·만료·Sub 강등·재진입 | `04_MAIN_DIVISION_RANKING_SYSTEM.md` |
| 기술 설계 | `05_SHARED_TECHNICAL_DESIGN.md` |
| 구현 계획 | `06_IMPLEMENTATION_PLAN.md` |
| Final Ranking | `08_FINAL_RANKING_SYSTEM.md` |
| 손익 시뮬레이션·출시 가정 | `09_GOAT_ARENA_PROFIT_LOSS_SIMULATION.md` |
| 룰 평가·설명·콘텐츠 전략 | `10_RULE_EVALUATION_AND_CONTENT_STRATEGY.md` |
| DB·캐시 저장 경계 | `11_DATA_STORAGE_AND_CACHE_BOUNDARIES.md` |

## 현재 만료 루프

```text
Sub 사용 가능 학습일수 0
→ Sub 공식 경쟁·주간 모의고사 잠금

Main 사용 가능·예약·잠금 학습일수 총합 0
AND 미정산 경기 없음
→ Sub로 강등
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

## 현재 불변식

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
| Main 정책·초대 예약·사용 가능/예약/잠금 학습일수 기반 | `models/goatArenaModel.js`의 `MainDivisionPolicyVersion`, `MainInvitationRequest`, `AccessCycle` |
| Sub·Main 공통 일요일 14:30 신규 경기 마감 | `services/arenaMatchService.js`, `services/arenaMatchAttemptService.js` |
| 결제 승인 멱등 처리·29일 이용 주기·20시 첫날 차감·재결제 정책 변경 고지 | `services/accessCycleService.js` |
| KST 일일 차감·누락 날짜 복구·Sub 만료·Main 강등·72시간 기한 | `services/accessCycleDailyService.js` |
| 학습권 패키지 승인 감사 기록 | `models/goatArenaModel.js`의 `ArenaPackagePayment` |
| 활성 정책 snapshot·캐시·변경 비교 | `services/arenaPolicyService.js` |
| 정책 작성·예약 활성화·구간 충돌 방지·취소 | `services/arenaPolicyService.js`, `views/admin-arena-policies.ejs` |
| 첫 달 실측 지표·가정 카탈로그 | `dataAnalysis/metricCatalog.js` |
| 분석 컬렉션 (`dataAnalysis`) | `dataAnalysis/dataAnalysisModel.js` |
| 분석 관측·카탈로그 seed | `services/dataAnalysisService.js`, `scripts/seedDataAnalysisCatalog.js` |
| DB·캐시 저장 경계 | `11_DATA_STORAGE_AND_CACHE_BOUNDARIES.md` |
| 생년월일 검증·실명+생년월일+고등학교 해시·관리자 알림 | `services/identityRiskService.js` |
| 기존 계정 3요소 해시 백필(dry-run 기본) | `scripts/backfillIdentityMatchV1.js` |
| Arena GP 티어 표시 정책(MMR 설정과 분리) | `services/arenaTierPolicy.js` |
| 최초 배치고사 GP 시드·티어 내 순위 재정렬·결제/배치 결합 | `services/arenaStandingService.js` |
| 배치 완료·재방문 멱등 연결 | `services/placementExamService.js` |
| 최초 배치 선완료 순위의 결제 후 활성화 | `services/accessCycleService.js` |
| 최초 배치·Sub 순위 회귀 검증 | `scripts/verifyInitialArenaPlacement.js` |
| Sub 목표 티어 선택·서버 무작위 상대 선정·자격·참가자/일수 잠금·경기 생성 | `services/arenaMatchService.js` |
| 일반 쟁탈전 신청 화면·서버 렌더링 | `controllers/goatArenaController.js`, `views/goat-arena-sub-challenge.ejs` |
| 일반 쟁탈전 보호 경로 | `routes/goat-arena-routes.js` |
| 일반 쟁탈전 생성 회귀 검증 | `scripts/verifyArenaMatchCreation.js` |
| 경기 신청 시 문제 팩 생성·자동 봉인 해시·검산 | `services/arenaProblemPackService.js`, `services/arenaMatchService.js` |
| Sub 티어 조합·30개 묶음·5유형 생성기 skeleton | `services/arenaOneOnOneProblemBank.js` |
| 봉인 팩 배정·개인 타이머·답안/활동 저장·자동 제출 | `services/arenaMatchAttemptService.js` |
| 60초 풀이 증거·이상 징후·24시간 미시작 처리 | `services/arenaMatchEvidenceService.js`, `middleware/arenaEvidenceUpload.js` |
| 운영자 전체 경기 증거 열람 | `views/admin-arena-matches.ejs`, `controllers/matthsController.js` |
| 유료 기능·유료 배치고사 권한 | `services/paidFeatureAccessService.js`, `services/privateMockExamService.js` |
| 폴더별 아카이브 권한 상속 | `services/archiveService.js`, `views/admin-archive.ejs` |
| 최종 종합·학교 평균·N수생 랭킹 | `services/rankingService.js`, `views/war-of-masters-rankings.ejs` |
| 실시간 관리자 매출 지표 | `services/adminService.js`, `views/admin-dashboard.ejs` |
| 참가자 전용 경기 준비·응시 화면 | `views/goat-arena-match.ejs`, `public/js/goat-arena-match.js` |
| 경기 문제 팩·응시 흐름 회귀 검증 | `scripts/verifyArenaMatchAttemptFlow.js` |
| Sub 일반 쟁탈전 채점·Arena 상태 교환·학습일수 단일 정산 | `services/arenaMatchSettlementService.js` |
| Sub 일반 쟁탈전 정산표·자동 호출 회귀 검증 | `scripts/verifyArenaMatchSettlement.js` |
| 구매·경기·주간 모의고사 자격 판정 골격 | `services/arenaEligibilityService.js` |
| Main 최소 배팅·Sub/Main 복수전 경제 사본·초대 취소·일요일 보류 계산 | `services/arenaDivisionRuleService.js` |
| 상대 선별 감사·Main 초대 제안·복수전 권리 | `models/goatArenaModel.js`의 `ArenaOpponentSelectionAudit`, `MainInvitationOffer`, `ArenaRevengeRight` |
| 관리자 Sub/Main 정책 분리·활성 런타임 조회 | `services/arenaPolicyService.js`, `views/admin-arena-policies.ejs` |
| Division 기능별 로그인 보호 페이지 골격 | `routes/goat-arena-routes.js`, `views/goat-arena-feature.ejs` |
| 매치·스냅샷·변환·Final Ranking·이벤트 골격 | `models/goatArenaModel.js` |
| N수생 학사연도 전환 | `services/userLifecycleService.js` |
| N수생 게시판 권한 | `services/communityService.js` |

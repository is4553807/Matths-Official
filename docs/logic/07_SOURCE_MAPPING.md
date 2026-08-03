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
| Main Division 상점 아이템·구매·효과·복구 | `12_SHOP.md` |
| 운영자·사용자 파일 저장 위치·보존·백업 | `13_STORAGE.md` |

## 현재 만료 루프

```text
Sub 사용 가능 학습일수 0
→ Sub 공식 경쟁·주간 모의고사 잠금

Main 사용 가능·예약·경기 예치 학습일수 총합 0
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

Main 휴면 강등에는 별도 휴면 복귀 시험을 만들지 않는다. 모든 강등 사용자는 일반 Sub Division 배치고사와 페이백 경로를 사용한다. 20일 차감 뒤 남은 학습일수는 Sub에 반영하지 않고, 일반 경로로 Main Division에 다시 진입할 때만 새 Main 이용 주기에 복원한다.

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
| Main 정책·초대 예약·사용 가능/예약/경기 예치 학습일수 기반 | `models/goatArenaModel.js`의 `MainDivisionPolicyVersion`, `MainInvitationRequest`, `AccessCycle` |
| Sub·Main 공통 일요일 14:30 신규 경기 마감 | `services/arenaMatchService.js`, `services/arenaMatchAttemptService.js` |
| 결제 승인 멱등 처리·29일 이용 주기·20시 첫날 차감·재결제 정책 변경 고지 | `services/accessCycleService.js` |
| KST 일일 차감·누락 날짜 복구·Sub 만료·Main 강등·72시간 기한 | `services/accessCycleDailyService.js` |
| Main 전용 20일 공식 경기·모의고사 미활동 판정, 20일 차감, 잔여 일수 동결·복귀 또는 0일 Sub 강등 | `services/arenaDormancyService.js`, `services/accessCycleDailyService.js`, `services/mainArenaSettlementService.js`, `services/mainArenaRevengeService.js`, `services/privateMockExamService.js`, `services/finalRankingService.js` |
| 학습권 패키지 승인 감사 기록 | `models/goatArenaModel.js`의 `ArenaPackagePayment` |
| 활성 정책 snapshot·캐시·변경 비교 | `services/arenaPolicyService.js` |
| 정책 작성·예약 활성화·구간 충돌 방지·취소 | `services/arenaPolicyService.js`, `views/admin-arena-policies.ejs` |
| 첫 달 실측 지표·가정 카탈로그 | `dataAnalysis/metricCatalog.js` |
| 분석 컬렉션 (`dataAnalysis`) | `dataAnalysis/dataAnalysisModel.js` |
| 분석 관측·카탈로그 seed | `services/dataAnalysisService.js`, `scripts/seedDataAnalysisCatalog.js` |
| DB·캐시 저장 경계 | `11_DATA_STORAGE_AND_CACHE_BOUNDARIES.md` |
| 생년월일 검증·실명+생년월일+고등학교 해시·관리자 알림 | `services/identityRiskService.js` |
| 기존 계정 3요소 해시 백필(dry-run 기본) | `scripts/backfillIdentityMatchV1.js` |
| 티어별 0~99 Arena GP·티어 서열·과거 누적 GP 변환(MMR 설정과 분리) | `services/arenaTierPolicy.js`, `scripts/migrateArenaGpToTierLocal.js` |
| 최초 배치고사 Arena tuple 시드·티어 내 순위 재정렬·고유 위치 충돌 방지·결제/배치 결합 | `services/arenaStandingService.js` |
| 배치 완료·재방문 멱등 연결 | `services/placementExamService.js` |
| 최초 배치 선완료 순위의 결제 후 활성화 | `services/accessCycleService.js` |
| 최초 배치·Sub 순위 회귀 검증 | `scripts/verifyInitialArenaPlacement.js` |
| Sub 목표 티어 선택·서버 무작위 상대 선정·자격·참가자 잠금·학습일수 예치·경기 생성 | `services/arenaMatchService.js` |
| 일반 쟁탈전 신청 화면·서버 렌더링 | `controllers/goatArenaController.js`, `views/goat-arena-sub-challenge.ejs` |
| 일반 쟁탈전 보호 경로 | `routes/goat-arena-routes.js` |
| 일반 쟁탈전 생성 회귀 검증 | `scripts/verifyArenaMatchCreation.js` |
| 경기 신청 시 문제 팩 생성·자동 봉인 해시·검산 | `services/arenaProblemPackService.js`, `services/arenaMatchService.js` |
| Sub·Main 공통 방어자 앵커 T1~T9·목표 정답률·유형 카탈로그·팩 곡선·실측 보정 | `services/arenaOneOnOneDifficultyPolicy.js` |
| Sub·Main 1대1 독립 준킬러 생성기와 티어 조합별 30묶음·5유형 배정 | `services/arenaOneOnOneProblemTypes.js`, `services/arenaOneOnOneProblemBank.js` |
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
| Main 최소 예치·Sub/Main 복수전 경제 사본·초대 취소·일요일 보류 계산 | `services/arenaDivisionRuleService.js` |
| 상대 선별 감사·Main 초대 제안·복수전 권리 | `models/goatArenaModel.js`의 `ArenaOpponentSelectionAudit`, `MainInvitationOffer`, `ArenaRevengeRight` |
| 관리자 Sub/Main 정책 분리·활성 런타임 조회 | `services/arenaPolicyService.js`, `views/admin-arena-policies.ejs` |
| Division 기능별 로그인 보호 페이지 골격 | `routes/goat-arena-routes.js`, `views/goat-arena-feature.ejs` |
| 매치·스냅샷·변환·Final Ranking·이벤트 골격 | `models/goatArenaModel.js` |
| N수생 학사연도 전환 | `services/userLifecycleService.js` |
| N수생 게시판 권한 | `services/communityService.js` |
| Matths 주간 공식 모의고사 이용권 정책 | `models/goatArenaModel.js`, `services/mockExamPackageService.js` |
| 29일 학습권/Matths 주간 공식 모의고사 이용권 권한 분기 | `services/paidFeatureAccessService.js`, `services/privateMockExamService.js` |
| 무료·Matths 주간 공식 모의고사 이용권·29일 학습권 가격 비교와 로그인 상태별 결제 진입 | `views/pricing.ejs`, `public/css/pricing.css`, `routes/matths-routes.js` |
| 29일·29,000원 학습 패키지 기본값·관리자 가격 버전 변경 | `services/arenaPolicyService.js`, `views/admin-arena-policies.ejs`, `routes/matths-routes.js` |
| 주간 4회 이상 기록과 배치고사 MMR 보정 | `services/mmrService.js` |
| 접속시간 heartbeat·누적 시간 | `services/connectionUsageService.js`, `public/js/session-usage.js` |
| 다중 서버 로그인 공유·TTL 만료 세션 | `models/sessionModel.js`, `services/mongoSessionStore.js`, `server.js` |
| 연간 시즌 catch-up·다중 서버 단일 실행 lease | `models/operationModel.js`, `services/arenaSeasonService.js` |
| Division별 공식 규정·활성 페이백 정책 표·KST 수정일 | `services/arenaRulebookViewService.js`, `controllers/goatArenaController.js`, `views/goat-arena-rules.ejs` |
| 관리자 문제은행 코드 지도·T1~T9 문제 데이터 버전 편집 | `services/problemBankCatalogService.js`, `services/arenaProblemDataService.js`, `views/admin-problem-banks.ejs`, `public/js/admin-problem-data.js` |
| Arena 1대1 독립 문제 유형·T1~T9 설계 정책·활성 DB 구성·티어 조합별 30묶음 | `services/arenaOneOnOneProblemTypes.js`, `services/arenaOneOnOneDifficultyPolicy.js`, `services/arenaProblemDataService.js`, `services/arenaOneOnOneProblemBank.js`, `services/arenaProblemPackService.js` |
| 관리자 기능군 드롭다운 내비게이션 | `views/partials/admin-navigation.ejs`, `public/css/admin.css`, `public/js/admin-navigation.js` |
| 관리자 표준 절차·보존 기간·자동 작업·환경 변수·전체 DB 스키마 매뉴얼 | `services/adminOperationsGuideService.js`, `views/admin-operations-guide.ejs`, `routes/matths-routes.js` |
| 관리자 무제한·무기한 상품 접근 | `services/superAdminAccessService.js`, `services/paidFeatureAccessService.js`, `services/dashboardService.js`, `controllers/goatArenaController.js` |
| 사용자 Cloudinary 공용 임시 저장·24시간 정리 | `middleware/userCloudUploadStorage.js`, `middleware/communityUpload.js`, `middleware/arenaEvidenceUpload.js`, `middleware/archiveUpload.js`, `server.js` |
| 운영자 파일 업로드 직후·일일 R2 증분 백업 | `services/archiveService.js`, `services/localStorageBackupService.js` |
| Arena Main 상점 탭·화면·구매 라우트 | `views/partials/goat-arena-navigation.ejs`, `views/goat-arena-main-shop.ejs`, `controllers/goatArenaController.js`, `routes/goat-arena-routes.js` |
| Sub 29일 전일 학습·페이백 독립 판정 | `services/userLifecycleService.js`, `services/accessCycleService.js`, `services/arenaPaybackReviewService.js`, `views/goat-arena-profile.ejs` |
| 계정 익명 보존·전체 데이터 삭제 | `services/accountDeletionService.js`, `views/admin-user-detail.ejs` |
| 관리자 계정 상세의 최소 운영 정보 분기 | `services/adminService.js`, `views/admin-user-detail.ejs` |
| Sub 복수전 권리·생성·포기 | `services/arenaRevengeService.js`, `services/arenaMatchSettlementService.js` |
| Sub 복수전 정상·한쪽 No-show 정산 | `services/arenaMatchSettlementService.js` |
| Sub 복수전 양측 No-show 2일 전액 소각 | `services/arenaDivisionRuleService.js`, `services/arenaMatchSettlementService.js` |
| Main 만료 전체 순위 스냅샷·Main-to-Sub 기준 계산 | `services/accessCycleDailyService.js`, `services/mainToSubConversionService.js` |
| 배치 동점 점수·풀이시간·MMR·시작 시각 | `models/goatArenaModel.js`, `services/arenaStandingService.js` |
| 페이백 미정산 경기 보류·이메일·우편함 통지 | `services/arenaPaybackReviewService.js`, `services/moderationNoticeService.js` |
| 관리자 패키지 실제 권한 변경·휘장 조회 | `services/adminPackageAccessService.js`, `services/arenaBadgeService.js`, `views/admin-user-detail.ejs` |
| Sub 복수전 Atlas 트랜잭션 검증 | `scripts/verifySubRevengeSettlementDb.js` |
| 관리자 Arena 읽기 감사: 학습일수 원장·Arena 상태·참가 잠금·Main 초대·처리 대기 이벤트 | `services/arenaReconciliationService.js`, `views/admin-arena-audit.ejs`, `public/js/admin-arena-audit.js`, `scripts/verifyArenaReconciliation.js` |

## Main Division 상점 실제 구현 매핑

Main Division 상점은 권위 DB 모델과 정책 버전, 사용자 보호 라우트, 구매·효과 서비스에 연결되어 있다. 실제 책임 경계는 다음과 같다.

| 책임 | 실제 구현 위치 |
|---|---|
| 상점 정책 버전·구매·활성 효과 원본 | `models/goatArenaModel.js` |
| 구매 자격·가격 고정·원자적 소각·반환 | `services/arenaShopPolicyService.js` |
| 방어 일정 보호권의 양측 예치분 반환·보상·경기 취소 | `services/arenaShopPolicyService.js`, `services/arenaMatchSettlementService.js` |
| 방어 휴식권 후보 제외·초대 가속 우선순위 | `services/arenaShopPolicyService.js`, `services/mainArenaMatchService.js` |
| Main 상점 사용자 화면·보호 라우트 | `controllers/goatArenaController.js`, `routes/goat-arena-routes.js`, `views/goat-arena-main-shop.ejs` |
| 상점 정책·거래·복구 검증 | `scripts/verifyLatestArenaPolicyDecisions.js` |

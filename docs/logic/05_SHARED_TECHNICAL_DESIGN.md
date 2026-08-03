# GOAT Arena 공통 기술 설계

> 상태: Sub·Main 현행 운영 정책 · Final Ranking v1.4 구현 기준
> 기준 시간대: `Asia/Seoul`

---

# 1. 핵심 상태

```text
PAID_ACTIVE_MAIN
→ LEARNING_DAYS_DEPLETED
→ MAIN_DEMOTED_TO_SUB
→ SUB_ACCESS_EXPIRED_LOCKED
→ RENEWAL_PAYMENT
→ SUB_REENTRY_READY | PAID_PENDING_RENEWAL_ASSESSMENT
→ PAID_ACTIVE
```

무료 Arena 상태는 존재하지 않는다.

---

# 2. 핵심 불변식

- Sub 학습권이 0이면 Arena·주간 모의고사·활성 Final Ranking 불가. Main은 사용 가능·예약·경기 예치 잔액과 미정산 경기가 모두 정리된 뒤 만료한다.
- 패키지는 사용 가능·예약·경기 예치 잔액이 모두 0이고 미정산 경기가 없을 때만 구매 가능.
- 1대1은 Skill MMR을 변경하지 않음.
- 모든 Arena 티어의 공개 GP는 `0~99`이며 서열 비교는 `티어 → 티어 내부 GP → 티어 내 순위 동점 기준` 순서로 수행함.
- 도전자 승리 시 Arena tuple 전체 교환.
- 방어자 승리 시 Arena tuple 무변경.
- Main 사용자는 학습권 만료 즉시 Sub로 강등되고 새 결제주기를 Sub에서 시작.
- 72시간 이내 갱신은 Main-to-Sub 변환.
- 72시간 초과 갱신은 `재구독 랭크 결정전`.
- 늦은 재구독 배치는 정상 변환 기준보다 낮아야 함.
- 20:00 이후 결제일은 차감하지 않음.
- Final Ranking 계산은 점수를 누적하지 않고 덮어쓰기.
- Main 상점은 사용 가능 학습일수만 사용하고 구매 뒤 최소 1일을 남김.
- 상점 구매·효과·원장과 방어 일정 보호권 경기 종료는 멱등·원자적으로 처리함.

---

# 3. 정책 모델

## 3.1 `SubscriptionPolicyVersion`

```text
code
displayName
status = DRAFT | ACTIVE | RETIRED
effectiveFrom
effectiveUntil
timezone = Asia/Seoul

initialLearningDays = 29
initialPaybackScoreDays = 29

paymentDayCutoff = 20:00
renewalGraceHours = 72

packagePurchaseRequiresZeroBalance = true
packagePurchaseRequiresZeroLockedBalance = true

lateRenewalTierPenalty = 1
normalStakeDays = 1
revengeStakeDays = 2
```

- 정책은 관리자 화면에서 먼저 작성 중 상태로 저장한 뒤 적용 일정에 등록한다.
- 같은 적용 시작 시각에 둘 이상의 활성 정책을 둘 수 없다.
- 새 정책을 적용 일정에 등록하면 직전 정책의 종료 시각과 다음 예약 정책의 시작 시각을 자동으로 연결한다.
- 적용 일정에 등록했거나 종료된 정책의 가격·학습일·페이백 조건은 직접 수정할 수 없다. 변경하려면 새 정책 버전을 만든다.
- 페이백 구간은 0점부터 빈틈이나 중복 없이 이어지고 마지막 구간에는 상한이 없어야 한다.
- `AccessCycle.policySnapshot`에는 구매 승인 시점에 선택된 정책 전체를 복사하여 이후 정책 변경을 소급하지 않는다.
- 활성 정책이 하나도 없는 초기 환경에서는 29일·29점·29,000원 및 기본 페이백 구간을 가진 2026-08-02 KST 기준 정책을 멱등 생성한다.
- 가격 전용 관리자 작업도 기존 문서를 직접 수정하지 않고 현재 정책의 페이백 조건을 복제한 새 활성 버전을 만든다.
- 사용자 노출 용어는 `예치`와 `경기 예치 학습일수`로 고정한다. 데이터 호환을 위해 내부 필드 `stakeDays`, `lockedLearningDays`는 유지하며 화면과 오류 문구에서 내부 명칭을 직접 노출하지 않는다.

## 3.2 `FinalRankingPolicyVersion`

```text
weeklyMockBonusCompleted = 30
weeklyMockBonusMissed = 0

divisionLockStartsAt = SUNDAY_15_00
divisionLockEndsAt = MONDAY_00_00

softResetCenter = 1500
softResetRetention = 0.60
```

## 3.3 `MainDivisionPolicyVersion`

```text
code
status = DRAFT | ACTIVE | RETIRED
effectiveFrom
effectiveUntil
timezone = Asia/Seoul

mainEntryBonusDays = 2
mainCarryoverBaseDays = 29
stakeDaysByTierGap = [{1,1}, {2,2}, {3,3}]
maximumTargetTierGap = 3

unlimitedDailyAttacks = true
unlimitedDailyDefenses = true
maximumNetGainPerCycle = null

invitationRequestExpiresAt = null
invitationOfferBatchSize = null | positive integer
invitationCancellationFeeDays = 1
manualInvitationCancellationAllowed = true
manualInvitationCancellationFeeDays = 0
repeatOpponentExclusionDays = 7
maximumActiveInvitationReservationsPerTargetTier = 1
requiresServerRandomOpponent = true
requiresOpponentDaysGreaterThanStake = true
revengeStakeMultiplier = 2
revengeFeeDays = 1
maximumUnresolvedOfficialMatches = 1
```

`DRAFT`는 관리자 작성 중 상태일 뿐 정책 미확정을 뜻하지 않는다. 활성 정책의 예치 기준표는 1부터 최대 티어 차이까지 빈 구간 없이 있어야 한다. 활성화·종료된 정책의 보너스·예치·초대·복수전 조건은 직접 수정하지 않고 새 정책 버전을 만든다. 실제 경기·초대·원장은 생성 시점의 활성 Main 정책 식별자·코드와 경제 조건 사본을 함께 고정한다.

## 3.4 `MainShopPolicyVersion`

```text
code
status = DRAFT | ACTIVE | RETIRED
effectiveFrom
effectiveUntil
timezone = Asia/Seoul

minimumRemainingLearningDays = 1
catalog[
  itemId
  displayName
  priceDays
  releasePhase
  effectType
  effectDurationSeconds
  cooldownDays
]

defenseScheduleProtectionUseWindowSeconds = 10800
defenseScheduleProtectionCompensationDays = 1
defenseScheduleProtectionBurnDays = 1
```

활성화 시 각 아이템의 가격·효과 기간·제한을 단일 값으로 검증한다. 구매에는 정책 식별자와 아이템 조건 사본을 고정하여 이후 가격 변경을 소급하지 않는다. 우선순위·실패 복구·공통 쿨다운·시즌 이월은 `12_SHOP.md`의 확정값을 사용한다.

---

# 4. `AccessCycle`

```text
cycleId
userId
paidAt
startsAt
evaluationAt
status

availableLearningDays
reservedLearningDays
lockedLearningDays
paybackScoreDays

learningDayBuckets[
  SUB_CARRYOVER,
  MAIN_ENTRY_BONUS,
  MAIN_MATCH_TRANSFER
]

firstConsumptionDateKst
firstDayMode = SAME_DAY | NEXT_DAY
firstDayConsumedAt

paidNormalAttacksCompleted
streakDays

cashbackQualified
paybackRate
paybackAmount
evaluatedAt
```

Main에서는 `paybackScoreDays`를 새로 누적하지 않는다. `available + reserved + locked`가 화면에 표시하는 Main 총 학습일수이고, 출처별 잔액은 `learningDayBuckets`와 `ArenaLearningDayLedger.sourceBucket`으로 복구한다.

## 4.1 `MainInvitationRequest`

```text
requestId
initiatorUserId
initiatorStandingId
initiatorArenaTier
targetTier
stakeDays
policyVersionId / policyVersionCode

status = SEARCHING | OFFERED | PAUSED | MATCH_FORMING | MATCHED | CANCELLED | INVALID
reservedLearningDays
selectedCandidateId / acceptedCandidateId / matchedOfferId
candidatePoolSnapshot / candidatePoolHash
selectionPolicyVersion
randomSelectionSeed
requestExpiresAt = null
activeReservationKey = initiatorUserId + targetTier
cancellationFeeDays / releasedLearningDays / burnedLearningDays
selectedAt / matchedAt / pausedAt / resumedAt / cancelledAt
```

후보 전체 스냅샷과 난수 seed는 일반 사용자 응답에서 제외하고 운영 감사에만 사용한다. `activeReservationKey`의 부분 고유 인덱스로 생성자·목표 티어별 활성 예약 하나를 DB에서도 보장한다. 초대가 수락되기 전에는 공식 `ArenaMatch`가 아니며, 예약 취소는 `reserved → available`, 수락은 초대자 `reserved → locked`와 수락자 `available → locked`를 한 트랜잭션에서 처리한다.

---

# 5. 첫날 차감

## 5.1 결제 시각 전처리

```text
localPaymentTime = paidAt in Asia/Seoul
```

20:00 이전:

```text
firstDayMode = SAME_DAY
firstConsumptionDateKst = localPaymentDate
→ 결제 트랜잭션 안에서 FIRST_DAY_CONSUMPTION -1
```

20:00 이후:

```text
firstDayMode = NEXT_DAY
firstConsumptionDateKst = localPaymentDate + 1 day
→ 다음 00:00 배치에서 FIRST_DAY_CONSUMPTION -1
```

멱등 키:

```text
cycleId + firstConsumptionDateKst + FIRST_DAY_CONSUMPTION
```

---

# 6. `ArenaAccessState`

```text
userId
state =
  PAID_ACTIVE
  | MAIN_DEMOTED_TO_SUB
  | SUB_ACCESS_EXPIRED_LOCKED
  | PAID_PENDING_RENEWAL_ASSESSMENT
  | SEASON_PLACEMENT_REQUIRED
  | PAYMENT_REQUIRED

currentCompetitiveDivision
mainAchievementStatus
currentSeasonPlacementCompleted

expiredAt
renewalGraceDeadline
lastMainQualifyingActivityAt
mainInactivityStartedAt
mainInactivityStartAvailableDays
mainDormantAt
mainDormancyFrozenLearningDays
mainDormancyRecoveryMode = RESTORE_ON_MAIN_REENTRY | SUB_STANDARD_FLOW
lastMainSnapshotId
referenceSubPlacementId
```

최초 진입 상태 결합:

```text
active AccessCycle + placement incomplete
→ SEASON_PLACEMENT_REQUIRED

no active AccessCycle + placement complete
→ PAYMENT_REQUIRED

active AccessCycle + placement complete
→ PAID_ACTIVE
```

최초 배치 반영은 `AssessmentAttempt` ID를 멱등 키로 사용한다. 활성 Sub 모집단 재정렬은 `(seasonKey, division)`별 revision 문서를 트랜잭션 안에서 먼저 갱신한 뒤 GP·도달 시각 순으로 수행한다.

휴면은 `currentCompetitiveDivision = MAIN`인 사용자에게만 적용한다. Sub Division은 29일 학습권 패키지와 페이백 주기의 기존 만료 규칙만 사용하고 별도 휴면 상태를 만들지 않는다.

권위 있는 휴면 초기화 활동은 정산 가능한 공식 1대1 경기 완료와 Matths 주간 공식 모의고사 제출 완료뿐이다. 각 완료 경계에서 `lastMainQualifyingActivityAt`을 서버 시각으로 갱신한다. 로그인, 페이지 열람, 개념 학습, 평가센터 이용, 경기 신청·시작만으로는 이 값을 바꾸지 않는다.

첫 미활동 KST 날짜 경계에서 `mainInactivityStartedAt`과 `mainInactivityStartAvailableDays`를 한 번 저장한다. 시작 잔액이 20일 이상인 경우에만 해당 연속 구간을 휴면 판정 대상으로 고정한다. 20일차에 공식 활동이 완료되면 미활동 필드를 초기화하며 직전 19일 동안의 정상 일일 차감은 되돌리지 않는다. 20일차 종료까지 활동이 없으면 20일차 차감까지 완료한 뒤 다음 날 00:00 KST에 전환한다.

20일차 종료까지 활동이 없으면 잔여 일수와 관계없이 `currentCompetitiveDivision = SUB`, `state = SUB_ACCESS_EXPIRED_LOCKED`로 강등한다. 잔여 일수가 있으면 기존 Main 이용 주기에서 가용 잔액을 0으로 분리하고 `mainDormancyFrozenLearningDays`와 `mainDormancyRecoveryMode = RESTORE_ON_MAIN_REENTRY`에 보관한다. 해당 일수는 Sub 이용 주기·페이백 점수·연속 학습 판정에서 조회하지 않는다.

인증 성공은 복귀 경계가 아니다. 사용자는 일반 Sub 패키지·배치·페이백 경로를 완료해야 한다. 페이백 승인과 Main 진입을 묶은 트랜잭션에서만 `MAIN_DORMANCY_RESERVE_RESTORED` 원장을 기록하고 `MAIN_DORMANCY_RESTORE` 버킷으로 새 Main 이용 주기에 추가한 뒤 휴면 보관 필드를 비운다.

20일 차감 뒤 잔액이 0이면 `mainDormancyRecoveryMode = SUB_STANDARD_FLOW`로 기록하고 복원 없이 일반 Sub 경로만 사용한다. 과거 `RESUME_MAIN` 레코드는 로그인 또는 스케줄러가 자동 복귀시키지 않고 새 정책의 Sub 강등·재진입 보관 형태로 멱등 변환한다.

휴면 전환과 Main 재진입 복원은 각각 이용 주기 기반 멱등 키로 한 번만 기록한다. 일일 차감, 기존 Main 가용 잔액 분리, 순위 비활성화와 outbox는 같은 트랜잭션에 묶고, Main 재진입 주기의 잔액·버킷·원장·접근 상태 복원도 하나의 트랜잭션으로 처리한다.

---

# 7. 만료 전환

```text
if availableLearningDays = 0
AND reservedLearningDays = 0
AND lockedLearningDays = 0
AND noPendingSettlement:

    if currentCompetitiveDivision = MAIN:
        state = MAIN_DEMOTED_TO_SUB
        currentCompetitiveDivision = SUB

    state = SUB_ACCESS_EXPIRED_LOCKED
    currentSeasonPlacementCompleted = false
    defensePoolEligible = false
    weeklyMockEligible = false
    finalRankingActive = false
```

마지막 Arena·Final Ranking 값을 snapshot으로 보존한다.

Main 만료 스냅샷은 티어 내 표시 순위와 별도로 활성 Main 전체 정확한 순위, 참가자 수, 해당 위치 도달 시각을 저장한다. 같은 만료 트랜잭션에서 `MAIN_TO_SUB_CONVERSION_V1` 결과를 만들고 `ArenaAccessState.referenceSubPlacementId`에 연결한다.

---

# 8. Main-to-Sub 변환

## 8.1 `MainToSubConversionPolicy`

```text
version
effectiveAt
mainPercentileBands
subRankMappings
subGpSeedRules
maximumSubRank
```

## 8.2 `MainToSubConversionResult`

```text
conversionId
userId
sourceMainSnapshotId
policyVersion
referenceSubRank
referenceSubPositionBand
mainPercentile
referenceSubGp
referenceSubPercentile
referenceSubOverallPosition
subParticipantCountAtConversion
renewalGraceDeadline
snapshotValid
integrityStatus
createdAt
```

72시간 내 결제자는 이 결과를 실제 Sub Seed로 사용한다.

환산 공식과 티어 구간은 `04_MAIN_DIVISION_RANKING_SYSTEM.md` 15장을 권위 원본으로 사용한다. `sourceMainSnapshotId`는 고유하며 동일 스냅샷을 재처리해도 결과를 한 번만 만든다.

## 8.3 배치 동점 원본

`ArenaStanding`은 최초·시즌 배치의 `seedPlacementScore`, `seedPlacementElapsedTimeMs`, `seedPlacementMmr`, `seedPlacementStartedAt`을 함께 저장한다. GP가 같을 때 배치 점수가 높은 순을 먼저 적용하고, 배치 점수도 같으면 전체 풀이시간이 짧은 순, MMR이 높은 순, 실제 시작 시각이 빠른 순으로 정렬한다.

`ArenaStanding`과 `arenaTupleSchema`에는 `gpScaleVersion = TIER_LOCAL_0_99_V1`을 둔다. 과거 누적 GP 문서는 `scripts/migrateArenaGpToTierLocal.js`가 기존 티어를 보존하면서 티어 내부 0~99 GP로 변환한다. 기본 실행은 읽기 전용 dry-run이며 실제 반영은 명시적인 `--apply`와 MongoDB 트랜잭션으로 수행한다.

## 8.4 Main 시즌 배지

`ArenaAchievementBadge`는 `userId + badgeCode + seasonKey` 고유 키를 사용한다. Main 시즌 보상은 학습일수나 경기 결과를 만들지 않는 배지로 지급하고 Main 만료·Sub 복귀 뒤에도 유지한다.

---

# 9. 재구독 랭크 결정전

## 9.1 모델

```text
RenewalRankAssessment
```

```text
assessmentId
userId
cycleId
sourceMainSnapshotId
referenceSubPlacementId

startedAt
submittedAt
score
integrityStatus

examDerivedSubPlacement
lateRenewalCeiling
finalSubPlacement
status
```

## 9.2 공식

```text
lateRenewalCeiling
= oneFullSubTierBelow(referenceSubPlacement)

finalSubPlacement
= worseOf(
    examDerivedSubPlacement,
    lateRenewalCeiling
  )
```

Skill MMR을 직접 초기화하지 않는다.

---

# 10. Final Ranking 재진입

72시간 내:

```text
payment
→ conversion result
→ Sub profile creation
→ Final Ranking active
```

72시간 초과:

```text
payment
→ PAID_PENDING_RENEWAL_ASSESSMENT
→ assessment
→ Sub profile creation
→ Final Ranking active
```

성장 기준:

```text
seasonSubStartPercentile
= referenceSubPlacement.percentile
```

실제 낮은 페널티 배치를 기준으로 사용하지 않는다.

---

# 11. 주간 모의고사 권한

주간 공식 모의고사는 두 상품 경로를 분리한다.

```text
학습권 패키지
→ 배치고사 완료 + PAID_ACTIVE + 유효 학습일수 필요
→ 주간 공식 모의고사 + GOAT Arena 허용

Matths 주간 공식 모의고사 이용권
→ 활성 MockExamSubscription 필요
→ 주간 공식 모의고사만 허용
→ 배치고사 + GOAT Arena 차단
```

```text
weeklyMockEligible
= state = PAID_ACTIVE
AND (
  Sub: availableLearningDays > 0
  OR Main: availableLearningDays + reservedLearningDays + lockedLearningDays > 0
)
AND seasonPlacementCompleted
```

만료 사용자:

```text
weeklyMockEligible = false
weeklyMockBonus = 0
```

## 11.1 일반 쟁탈전 생성·문제 봉인 트랜잭션

```text
티어 조합·30개 슬롯 중 1개 결정
+ ACTIVE ArenaProblemDataVersion의 T1~T9 유형 구성 조회
+ 주관식 준킬러 5문항 자동 생성·자동 검산
+ ArenaProblemPack(SEALED, AUTO_ON_CHALLENGE)
+ ArenaMatch(READY)
+ challenger ArenaMatchAttempt(READY)
+ defender ArenaMatchAttempt(READY)
+ challenger ArenaMatchParticipantLock
+ defender ArenaMatchParticipantLock
+ ArenaOpponentSelectionAudit
+ AccessCycle available → locked
+ MATCH_STAKE_LOCKED ledger
+ ArenaMatchCreated·ArenaMatchReady outbox
= one transaction
```

- `matchKey`는 신청자와 요청 식별자로 만든 고유 멱등 키다.
- 사용자는 목표 티어만 제출하고 서버가 적격 후보 중 한 명을 무작위로 정한다. 후보 풀 해시·선정 대상·난수 감사값은 `ArenaOpponentSelectionAudit`에 보존한다.
- `ArenaMatchParticipantLock.userId`는 고유하므로 한 사용자가 두 미정산 공식 경기에 들어갈 수 없다.
- 참가자에는 경기 생성 시점의 `standingId`, `accessCycleId`, Arena tuple과 적용 일수를 저장한다.
- 경기 정책 코드는 공격자의 이용 주기 정책 사본과 연결한다.
- 도전자·방어자의 티어는 허용된 정확한 조합인지 서버에서 재검증한다. 브론즈는 브론즈·실버, 챌린저는 챌린저, 나머지는 바로 위 티어만 허용한다.
- `arenaOneOnOneDifficultyPolicy.js`가 Sub·Main 공통 방어자 앵커 T1~T9, 목표 정답률, 5슬롯 곡선, 단원 2·2·1, 유형 ID 75개, 1~999 자연수 답과 실측 보정 임계값을 관리한다. `arenaOneOnOneProblemTypes.js`는 숫자·조건을 생성하는 독립 콘텐츠 원본이다. 관리자는 실행 코드를 입력하지 않고 `ArenaProblemDataVersion` DRAFT에서 유형별 사용 여부·배정 가중치·정답 최솟값/최댓값을 조정하고 T1~T9별 등록 생성 유형을 최소 5개씩 선택한다. 가중치는 30개 팩별 결정적 유형 순서에 반영되고, 정답 범위 밖의 생성 결과는 서버가 버린 뒤 재생성한다. 적용 시 유형별 5회 검산에 성공한 버전만 ACTIVE가 되고, 신규 경기 생성 서비스는 ACTIVE 문서를 조회한다. 현재 콘텐츠는 배치고사 심화 준킬러를 독립 복사한 임시 버전이며 `PENDING_FINAL_GENERATORS`로 저장한다. 최종 티어별 생성기가 연결되면 `ACTIVE`로 전환하고 단원 배분·2분 예상 시간·자연수 답 검증을 강제한다. 유형 누락이나 자동 검산 실패 시 문제·경기·학습일수 예치·원장을 전부 만들지 않는다.
- 같은 경기 문제는 양측에 공통 배정하며 제한 시간은 정확히 10분이다.
- 문제 팩에는 `problemDataVersionId`, `designPolicyVersion`, `contentSourceVersion`, `designCompliance`, `difficultyAnchor=DEFENDER`, `difficultyTier`, 양측 목표 정답률 범위와 `packCurve`를 봉인 해시에 포함한다. 각 문항에는 계획 단원·슬롯·티어 내 위치를 함께 저장한다. 관리자가 다음 ACTIVE 문제 데이터를 적용해도 SEALED 팩은 생성 당시 버전과 문항을 유지한다.
- 경기 생성 서비스는 내부 실력 지표와 최종 종합 랭킹 모델을 읽거나 쓰지 않는다.

## 11.2 문제 팩·응시 트랜잭션

개인 시작:

```text
ArenaMatchAttempt(READY → IN_PROGRESS)
+ server startedAt/deadlineAt
+ ArenaMatch(READY → IN_PROGRESS, 최초 시작만)
+ ATTEMPT_STARTED immutable event
+ ArenaAttemptStarted outbox
= one transaction
```

문항 확정·이동:

```text
현재 문항 최종 답안 snapshot revision
+ 문항 풀이시간
+ QUESTION_ADVANCED immutable event
+ currentQuestionIndex + 1
= one transaction + request idempotency key
```

5번 문항 완료 또는 10분 만료:

```text
ArenaMatchAttempt(IN_PROGRESS → EVIDENCE_REQUIRED)
+ participant submittedAt
+ evidenceDeadlineAt = server now + 60 seconds
= one transaction
```

풀이 증거 제출 뒤에만 개인 상태를 `SUBMITTED`로 전환한다. 양쪽 증거가 모두 제출되면 채점·정산을 시도하고, 한쪽이 아직 진행 중이면 그 사용자의 제한 시간 종료까지 기다린다.

- `ArenaProblemPack.questions`, 정답·해설과 `contentHash`는 기본 조회에서 제외한다.
- 문제 팩은 운영자 수동 검수 없이 JS 생성기와 자동 검산기가 정답 일치·유일답·계산기 불필요·풀이 가능을 모두 확인하고 콘텐츠 해시를 봉인한다.
- 현행은 동일 팩 `COMMON` variant만 사용하며 두 사용자에게 서로 다른 문제를 배정하지 않는다.
- `ArenaMatchAttemptEvent`는 답안 변경과 heartbeat·focus의 서버 수신 시각을 보존하는 감사 원본이다. 최종 답안 snapshot은 빠른 화면 복구용 현재 상태다.

모든 주기 자동 작업은 프로세스 메모리 플래그만으로 중복을 막지 않는다. 실행 직전 `schedulerLeases` 컬렉션의 작업별 MongoDB 분산 임대를 원자적으로 선점하고, 실행 중에는 만료 시각을 갱신한다. 다른 서버는 활성 임대가 있는 작업을 건너뛰고, 완료·실패 또는 임대 만료 뒤 다음 서버가 이어받는다. 경기 타이머, 학습권 차감·만료 알림, 주간 공식 모의고사 상태 전환, 휴면·시즌, 데이터 분석, 무결성 점검, outbox, 증거·아카이브 보존 삭제, R2 백업과 사용자 임시 파일 정리에 동일하게 적용한다.
- 만료 응시 스케줄러는 `deadlineAt <= now`인 진행 중 응시를 마지막 저장 답안으로 닫고 60초 증거 제출 단계로 전환한다.
- 모든 풀이 증거는 운영자만 열람할 수 있는 보호 저장소에 두고 동일 파일·비정상 속도·반복 화면 이탈은 관리자 알림으로 만든다.
- 공식 경기 성립 뒤 시작 기한은 24시간이다. 일요일을 통과하면 Sub와 Main 모두 일요일 14:30으로 단축한다. 아직 성립되지 않은 Main 하위 티어 초대 예약에는 고정 24시간 만료를 두지 않는다. 미시작은 `noShowRole`과 관리자 알림을 남긴다.
- 일반 경기와 복수전 No-show는 역할을 별도로 기록한다. 복수전 결과는 `ATTACKER_WIN`, `DEFENDER_WIN`, `DEFENDER_NO_SHOW`, `ATTACKER_NO_SHOW`, `BOTH_NO_SHOW`를 구분하고, Division 정책 사본의 반환·이전·소각표로 계산한다. 반환·이전·소각 합계가 예치 학습일수와 다르면 거래를 적용하지 않고 `HELD`로 둔다.
- 일요일 15:00~월요일 00:00에는 응시 쓰기와 만료 자동 제출도 멈춘다. 15:00 미정산 경기의 `HELD` 전환은 정산 단계의 일요일 잠금 트랜잭션에서 완성한다.
- 이 쓰기 경로는 `ArenaStanding`, `AccessCycle`, GP·티어·티어 내 순위와 학습일 원장을 변경하지 않는다.

## 11.3 Sub 일반 쟁탈전 정산 트랜잭션

양측의 풀이 증거가 정상 제출되고 이상 징후가 없을 때만 다음을 한 트랜잭션으로 처리한다.

```text
봉인 문제 팩으로 양측 답안 재채점
+ 점수 → 정답 수 → 정답 문항 풀이시간 → 전체 풀이시간 비교
+ 완전 동점이면 방어자 승리
+ 도전자 승리 시 GP·티어·티어 내 순위 tuple 전체 교환
+ 도전자가 예치한 1일 반환·소각 또는 방어자 이전
+ 양측 ArenaStandingChangeLedger
+ 양측 필요분 ArenaLearningDayLedger
+ 참가자 잠금 해제
+ ArenaMatch(SETTLED) + 결과 사본 + ArenaMatchSettled outbox
= one transaction
```

증거 이상 징후, 생성 시점 Arena 상태와 현재 상태 불일치, 학습일수 원본 불일치, 일요일 15시 정산 잠금은 `HELD`로 보내고 순위·GP·티어·학습일수는 변경하지 않는다. 정산 결과로 사용 가능·예약·경기 예치 학습일수가 모두 0이 되면 트랜잭션 완료 뒤 기존 이용 만료 전환기를 호출한다.

## 11.4 Sub 복수전 생성·정산 트랜잭션

```text
원경기 SETTLED
→ 패자 ArenaRevengeRight(AVAILABLE, 1회)
→ 복수하기: 패자를 도전자, 직전 승자를 방어자로 자동 고정
→ 도전자 availableLearningDays -2 / lockedLearningDays +2
→ 같은 5문항·10분 문제 팩과 양측 READY
→ completionDeadlineAt = min(신청+24시간, 일요일 14:30)
```

정상 승패와 한쪽 미완료는 Sub 문서의 2일 정산표로 처리한다. 결과 화면의 `경기 종료`를 누르면 권리를 `FORFEITED`로 만들고 다시 생성하지 않는다. 양측 모두 미완료하면 Arena 상태를 유지하고 도전자가 예치한 2일을 전부 소각한다.

## 11.5 Matths 주간 공식 모의고사 이용권과 MMR 보정

- `MockExamPackagePolicyVersion`은 월 가격과 30일 이용 기간을 버전으로 저장한다.
- `MockExamSubscription`은 학습권 패키지와 분리된 이용권 원본이다.
- Matths 주간 공식 모의고사 이용권 사용자의 주간 공식 모의고사 결과는 `RankingProfile.mmr`과 이력에 계속 저장한다.
- 주간 공식 모의고사 응시가 4회 이상인 사용자가 나중에 학습권 패키지의 배치고사를 완료하면 기존 MMR을 초기화하지 않는다.
- 보정값은 `기존 MMR × 기존 주간 응시 수 + 배치 MMR`을 `기존 주간 응시 수 + 1`로 나눈 서버 계산값이며, `placement-calibration` 이력으로 남긴다.

## 11.6 접속시간 집계

- 로그인 상태의 활성 브라우저 탭이 60초 주기로 heartbeat를 보낸다.
- 서버는 직전 heartbeat와의 간격이 90초 이하인 구간만 `User.totalConnectedSeconds`에 누적한다.
- 비활성 탭, 긴 네트워크 단절과 서버가 받지 못한 구간을 접속시간으로 추정하지 않는다.
- 화면에는 누적 초를 시간 단위로 변환해 표시하되 DB 권위값은 정수 초다.

## 11.7 규정 페이지의 활성 페이백 정책 투영

- Sub Division 규정 요청은 `getActiveArenaPolicy()`를 통해 현재 시점의 활성 `SubscriptionPolicyVersion`을 조회한다.
- 뷰 모델은 패키지 가격, 정기권 학습 가능 일수, 자격 기준, 점수 구간, 비율과 `가격 × 비율`의 예상 페이백 금액만 사용자 화면에 노출한다.
- 활성 정책은 정기권 학습 가능 일수와 페이백 점수를 별도 장부로 유지하고, 29일 이용 주기의 29일 전일 학습을 페이백 학습 조건으로 투영한다.
- 최근 수정일은 초기 기준일 2026-08-02 KST보다 이르지 않으며 `createdAt`, `updatedAt`, `activatedAt`, `effectiveFrom` 중 가장 최근 시각을 KST 날짜로 표시한다.
- 관리자 정책 변경 뒤 활성 정책 캐시를 무효화하므로 다음 규정 요청은 새 표를 사용한다. 개별 구매자의 실제 판정은 계속 `AccessCycle.policySnapshot`을 사용한다.

## 11.8 관리자 계정 삭제

```text
익명 보존
→ 로그인·실명·생년월일·이메일·정확한 학교 제거
→ 업로드 원본 파일 제거
→ 학습·시험·MMR·Arena 통계는 익명 사용자 ID로 보존

모든 데이터 삭제
→ User + 학습 + 시험 + MMR + Arena + 게시판 + 첨부파일 삭제
→ 식별 불가능한 관리자 감사 행위 종류만 보존
```

## 11.9 Main Division 상점

권위 모델:

```text
MainShopPurchase
= purchaseId + userId + itemId + policyVersionId
+ priceDays + beforeAvailableDays + afterAvailableDays
+ status(PENDING | APPLIED | REVERSED | CANCELLED)
+ relatedMatchId? + relatedInvitationId?
+ idempotencyKey + purchasedAt + reversedAt?

MainShopEffect
= effectId + purchaseId + userId + effectType
+ status(ACTIVE | APPLIED | EXPIRED | CANCELLED)
+ startsAt + endsAt? + cooldownEndsAt?
+ relatedMatchId? + relatedInvitationId?
```

일반 구매:

```text
Main·PAID_ACTIVE·무결성 자격 재검증
+ availableLearningDays > priceDays 검증
+ availableLearningDays 차감
+ SHOP_ITEM_PURCHASE_BURN 원장
+ MainShopPurchase(APPLIED)
+ MainShopEffect 생성 또는 즉시 적용
+ outbox
= one transaction
```

방어 일정 보호권:

```text
의무 방어 일반 경기·배정 후 3시간·양측 미열람 재검증
+ 양측 기존 경기 예치분 반환
+ 방어자 availableLearningDays -2
+ 공격자 availableLearningDays +1
+ 시스템 1일 소각 원장
+ ArenaMatch(INSURED_CANCELLED)
+ 양측 참가자 잠금 해제
+ 7일 쿨다운 효과
+ outbox
= one transaction
```

- 내부 호환 필드 `stakeDays`, `lockedLearningDays`와 기존 원장 이벤트 코드는 유지한다. 사용자 문구와 설명에서는 `예치`, `경기 예치 학습일수`를 사용한다.
- `purchaseId` 또는 클라이언트 요청 식별자를 고유 멱등 키로 사용하여 재시도 중복 차감을 막는다.
- 방어 휴식권과 초대 가속권은 DB 효과가 권위 원본이다. 후보 수·우선순위의 짧은 캐시는 효과 변경 즉시 무효화한다.
- 분석 결과 본문이 크면 보호 파일 저장소에 두고 DB에는 생성 상태·버전·해시·위치만 저장한다.

---

# 12. 일요일 잠금

Sub·Main 공통 14:30:

```text
new request / accept / prepare / start locked
```

Sub·Main 공통 15:00:

```text
Arena writes locked
Public Final Ranking frozen
```

15:00~24:00:

- Eligible user mock results
- Skill MMR staging
- Weekly Mock Bonus staging
- Final Ranking staging

00:00:

```text
atomic publish
→ Arena unlock
```

---

# 13. 페이백 심사

```text
dailyPaybackReviewJob
```

조회 조건:

```text
evaluationAt <= now
AND evaluatedAt = null
```

새 결제주기가 시작돼도 이전 주기 심사는 독립적으로 처리한다.

평가 시점에 `HELD` 또는 미정산 공식 경기가 있으면 `ArenaPaybackReview.status = HELD`로 저장하고 결과를 확정하지 않는다. 사이트 우편함과 가입 이메일을 멱등 발송하고 경기 정산 뒤 같은 `cycleId + evaluationVersion`으로 재심사한다.

관리자 패키지 변경은 UI 플래그만 바꾸지 않는다. `무료`는 활성 이용권을 종료하고, `Matths 주간 공식 모의고사 이용권`은 `MockExamSubscription`, `29일 학습권 패키지`는 실제 `AccessCycle`과 초기 원장을 생성한다. 관리자 무상 지급은 매출 결제로 기록하지 않고 `AdminActionLog`와 관리자 조정 원장에 남기며, 미정산 경기·예약·경기 예치분이 있으면 변경을 거절한다.

---

# 14. 보안·어뷰징 방지

- 72시간 계산은 서버 `expiredAt` 기준
- 결제 승인 시각은 PG 서버 결과 기준
- 클라이언트 시계 사용 금지
- 늦은 갱신 상한 DB 제약
- Main snapshot 변경 금지
- 같은 Main snapshot으로 conversion 1회
- 재구독 시험 문제 노출·재사용 제한
- 학습권이 남은 계정의 추가 패키지 결제 차단
- 20:00 cutoff 경계 테스트
- Final Ranking 성장 기준과 실제 배치 분리

---

# 15. 이벤트

```text
LearningDaysDepleted
MainDemotedToSub
AccessExpired
RenewalPaymentCompleted
RenewalGraceQualified
RenewalGraceExpired
MainToSubConverted
RenewalRankAssessmentRequired
RenewalRankAssessmentCompleted
SubReentryActivated
FirstDayConsumed
WeeklyMockAccessDenied
ArenaOpponentSelected
MainInvitationOffered
MainInvitationAccepted
MainInvitationDeclined
MainInvitationSuperseded
MainInvitationPaused
MainInvitationResumed
MainInvitationCancelled
ArenaRevengeRightCreated
ArenaRevengeForfeited
ArenaRevengeMatchCreated
ArenaRevengeNoShowSettled
ArenaMainDormancyActivated
ArenaMainDormancyResumed
MainShopItemPurchased
MainShopItemReversed
MainShopEffectApplied
MainShopEffectExpired
ArenaMatchInsuredCancelled
```

---

# 16. 운영 지표

- 학습권 만료 수
- 만료 후 결제창 전환율
- 72시간 내 갱신율
- 72시간 초과 갱신율
- 재구독 랭크 결정전 이탈률
- Main-to-Sub 랭크 분포
- 늦은 갱신 배치 페널티 분포
- 20:00 전후 결제 전환율
- 첫날 차감 CS
- 만료로 인한 방어 풀 감소
- 랭크별 매칭 실패율
- Main 상점 아이템별 구매율·소각 학습일수·복구율
- 방어 일정 보호권 보상 이전량·사용률·반복 사용 시도율
- 방어 휴식권과 초대 가속권 사용 전후 매칭 소요시간

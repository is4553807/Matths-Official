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

- Sub 학습권이 0이면 Arena·주간 모의고사·활성 Final Ranking 불가. Main은 사용 가능·예약·잠금 잔액과 미정산 경기가 모두 정리된 뒤 만료한다.
- 패키지는 사용 가능·예약·잠금 잔액이 모두 0이고 미정산 경기가 없을 때만 구매 가능.
- 1대1은 Skill MMR을 변경하지 않음.
- 도전자 승리 시 Arena tuple 전체 교환.
- 방어자 승리 시 Arena tuple 무변경.
- Main 사용자는 학습권 만료 즉시 Sub로 강등되고 새 결제주기를 Sub에서 시작.
- 72시간 이내 갱신은 Main-to-Sub 변환.
- 72시간 초과 갱신은 `재구독 랭크 결정전`.
- 늦은 재구독 배치는 정상 변환 기준보다 낮아야 함.
- 20:00 이후 결제일은 차감하지 않음.
- Final Ranking 계산은 점수를 누적하지 않고 덮어쓰기.

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

`DRAFT`는 관리자 작성 중 상태일 뿐 정책 미확정을 뜻하지 않는다. 활성 정책의 배팅표는 1부터 최대 티어 차이까지 빈 구간 없이 있어야 한다. 활성화·종료된 정책의 보너스·배팅·초대·복수전 조건은 직접 수정하지 않고 새 정책 버전을 만든다. 실제 경기·초대·원장은 생성 시점의 활성 Main 정책 식별자·코드와 경제 조건 사본을 함께 고정한다.

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
referenceSubGp
referenceSubPercentile
createdAt
```

72시간 내 결제자는 이 결과를 실제 Sub Seed로 사용한다.

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
- 실제 문제 유형 생성기가 연결되지 않았거나 자동 검산이 실패하면 문제·경기·잠금·원장을 전부 만들지 않는다.
- 같은 경기 문제는 양측에 공통 배정하며 제한 시간은 정확히 10분이다.
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
- 만료 응시 스케줄러는 `deadlineAt <= now`인 진행 중 응시를 마지막 저장 답안으로 닫고 60초 증거 제출 단계로 전환한다.
- 모든 풀이 증거는 운영자만 열람할 수 있는 보호 저장소에 두고 동일 파일·비정상 속도·반복 화면 이탈은 관리자 알림으로 만든다.
- 공식 경기 성립 뒤 시작 기한은 24시간이다. 일요일을 통과하면 Sub와 Main 모두 일요일 14:30으로 단축한다. 아직 성립되지 않은 Main 하위 티어 초대 예약에는 고정 24시간 만료를 두지 않는다. 미시작은 `noShowRole`과 관리자 알림을 남긴다.
- 일반 경기와 복수전 No-show는 역할을 별도로 기록한다. 복수전 결과는 `ATTACKER_WIN`, `DEFENDER_WIN`, `DEFENDER_NO_SHOW`, `ATTACKER_NO_SHOW`, `BOTH_NO_SHOW`를 구분하고, Division 정책 사본의 반환·이전·소각표로 계산한다. 반환·이전·소각 합계가 잠긴 배팅액과 다르면 거래를 적용하지 않고 `HELD`로 둔다.
- 일요일 15:00~월요일 00:00에는 응시 쓰기와 만료 자동 제출도 멈춘다. 15:00 미정산 경기의 `HELD` 전환은 정산 단계의 일요일 잠금 트랜잭션에서 완성한다.
- 이 쓰기 경로는 `ArenaStanding`, `AccessCycle`, GP·티어·티어 내 순위와 학습일 원장을 변경하지 않는다.

## 11.3 Sub 일반 쟁탈전 정산 트랜잭션

양측의 풀이 증거가 정상 제출되고 이상 징후가 없을 때만 다음을 한 트랜잭션으로 처리한다.

```text
봉인 문제 팩으로 양측 답안 재채점
+ 점수 → 정답 수 → 정답 문항 풀이시간 → 전체 풀이시간 비교
+ 완전 동점이면 방어자 승리
+ 도전자 승리 시 GP·티어·티어 내 순위 tuple 전체 교환
+ 도전자 잠금 1일 반환·소각 또는 방어자 이전
+ 양측 ArenaStandingChangeLedger
+ 양측 필요분 ArenaLearningDayLedger
+ 참가자 잠금 해제
+ ArenaMatch(SETTLED) + 결과 사본 + ArenaMatchSettled outbox
= one transaction
```

증거 이상 징후, 생성 시점 Arena 상태와 현재 상태 불일치, 학습일수 원본 불일치, 일요일 15시 정산 잠금은 `HELD`로 보내고 순위·GP·티어·학습일수는 변경하지 않는다. 정산 결과로 사용 가능·예약·잠금 학습일수가 모두 0이 되면 트랜잭션 완료 뒤 기존 이용 만료 전환기를 호출한다.

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
ArenaRevengeRightForfeited
ArenaRevengeMatchCreated
ArenaRevengeNoShowSettled
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

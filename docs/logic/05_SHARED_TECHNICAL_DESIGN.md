# GOAT Arena 공통 기술 설계

> 상태: Sub v2.9 · Final Ranking v1.4 구현 기준  
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

- 학습권이 0이면 Arena·주간 모의고사·활성 Final Ranking 불가.
- 패키지는 학습권과 잠금 잔액이 모두 0일 때만 구매 가능.
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
version
timezone = Asia/Seoul

initialLearningDays = 29
initialPaybackScoreDays = 29

paymentDayCutoff = 20:00
renewalGraceHours = 72

packagePurchaseRequiresZeroBalance = true
packagePurchaseRequiresZeroLockedBalance = true

lateRenewalTierPenalty = 1
```

## 3.2 `FinalRankingPolicyVersion`

```text
weeklyMockBonusCompleted = 30
weeklyMockBonusMissed = 0

divisionLockStartsAt = SUNDAY_15_00
divisionLockEndsAt = MONDAY_00_00

softResetCenter = 1500
softResetRetention = 0.60
```

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
lockedLearningDays
paybackScoreDays

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

currentCompetitiveDivision
mainAchievementStatus
currentSeasonPlacementCompleted

expiredAt
renewalGraceDeadline
lastMainSnapshotId
referenceSubPlacementId
```

---

# 7. 만료 전환

```text
if availableLearningDays = 0
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
AND availableLearningDays > 0
AND seasonPlacementCompleted
```

만료 사용자:

```text
weeklyMockEligible = false
weeklyMockBonus = 0
```

---

# 12. 일요일 잠금

15:00:

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

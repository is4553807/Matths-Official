# Maths GOAT Arena
# Final Ranking System

> 상태: **Final Ranking 활성 정책 · v1.4 MAIN DEMOTION FINAL**  
> 기준일: 2026-08-01  
> 기준 시간대: `Asia/Seoul`

---

# 1. Final Ranking 구성

```text
Final Rating
= Skill MMR
+ Division 기본점수
+ 시즌 Division 성장점수
+ 시즌 Division 위치점수
+ Weekly Mock Bonus
+ 정책상 임시 조정값
```

점수는 누적하지 않고 권위 입력으로 다시 계산한다.

---

# 2. 활성 자격

```text
finalRankingActive
= currentSeasonPlacementCompleted
AND accountStatus = ACTIVE
AND accessState = PAID_ACTIVE
AND (
  Sub: availableLearningDays > 0
  OR Main: availableLearningDays + reservedLearningDays + lockedLearningDays > 0
)
AND integrityStatus = CLEAR
```

Division별 활성 학습일수 조건을 충족하지 못하면 비활성화한다.

```text
Sub: availableLearningDays = 0
OR Main: availableLearningDays + reservedLearningDays + lockedLearningDays = 0
→ finalRankingStatus = INACTIVE_ACCESS_EXPIRED
```

마지막 Final Rating과 Final Rank는 개인 기록으로 보존하지만
활성 leaderboard에서는 제외한다.

---

# 3. 주간 모의고사 Bonus

```text
정상 응시
→ weeklyMockBonus = 30

미응시
→ weeklyMockBonus = 0

학습권 만료
→ 시험 응시 불가
→ weeklyMockBonus = 0
```

Bonus는 매주 덮어쓰기 값이다.

---

# 4. 실시간 갱신

정상 이용 상태에서는 다음 이벤트 뒤 실시간 재계산한다.

- Arena tuple 정상 정산
- Main 상태 정상 정산
- Skill MMR 갱신
- Weekly Mock Bonus 갱신
- Main 진입
- Sub 재진입
- 시즌 배치 완료

만료 상태에서는 실시간 재계산을 중지한다.

---

# 5. 일요일 잠금

```text
일요일 14:30
→ Sub·Main Division 신규 Arena 경기·수락·준비·시작 차단

일요일 15:00
→ Arena 잠금
→ 공개 Final Ranking 동결
```

15:00~24:00:

- 정상 이용자의 주간 모의고사
- Skill MMR staging
- Weekly Mock Bonus staging
- Final Rating staging
- Final Rank staging

```text
월요일 00:00
→ 새 MMR·Bonus·Final Rank 일괄 공개
→ Arena 재활성화
```

만료 사용자는 staging 대상에서 제외한다.

## 5.1 Matths 대시보드 랭킹 화면

Matths 대시보드의 랭킹 화면은 사용자가 Division을 선택하는 화면이 아니다. 현재 활성 사용자 전체의 `최종 종합 랭킹`과 학교·N수생 집계만 제공한다.

- 학교 랭킹은 현재 `재학` 상태인 해당 학교 학생들의 최종 종합 랭킹 순위 평균이 낮은 순서로 정렬한다.
- 학교 상세에서는 그 학교 학생들의 최종 종합 랭킹 순위를 공개한다.
- 졸업생과 N수생은 학교 평균에서 제외한다.
- N수생에게는 학교 랭킹 대신 N수생끼리의 최종 종합 랭킹을 제공한다.
- GOAT Arena 내부 랭킹 화면은 사용자의 실제 소속 Division을 기본 탭으로 열고 Sub Division·Main Division 순위를 각각 표시한다. Division은 사용자가 선택하여 소속을 바꾸는 값이 아니다.

---

# 6. 연간 시즌

12월 31일:

- 시즌 Final Ranking 보관
- Skill MMR Soft Reset Seed 생성 준비
- Arena 랭크·순위·GP 초기화
- 시즌 공격 횟수 초기화

1월 1일:

```text
newSeasonSeedMmr
= 1500 + 0.60 × (previousMmr - 1500)
```

Division 소속은 유지한다.

현재 Division의 `시즌 배치고사`를 완료해야
Arena와 Final Ranking을 새 시즌에 활성화한다.

---

# 7. Main 만료 사용자의 Sub 강등과 재구독

학습권이 끝나는 순간:

```text
currentCompetitiveDivision = MAIN
→ currentCompetitiveDivision = SUB
→ finalRankingStatus = INACTIVE_ACCESS_EXPIRED
```

사용자 안내 문구:

```text
학습권이 끝나 Main에서 Sub로 강등되었습니다.
GOAT Arena와 주간 모의고사를 다시 이용하려면 재구독해 주세요.
```

Main 달성 이력은 프로필 배지와 과거 시즌 기록으로 보존한다.

## 7.1 72시간 이내

```text
Main-to-Sub conversion
→ Sub Arena Seed
→ Final Ranking 재활성화
```

새 Final Rating은 현재 Skill MMR과 변환된 Sub 성과를 사용한다.

## 7.2 72시간 초과

`재구독 랭크 결정전`을 완료해야 한다.

```text
referenceSubPlacement
= Main-to-Sub conversion result

actualSubPlacement
= 시험 결과와 늦은 갱신 상한을 적용한 위치
```

Final Ranking 성장 기준:

```text
seasonSubStartPercentile
= referenceSubPlacement.percentile
```

실제 낮은 페널티 배치를 성장 기준으로 사용하지 않는다.

---

# 8. 시험 명칭 분리

| 시험 | Final Ranking 역할 |
|---|---|
| 최초 배치고사 | 최초 MMR과 시작 기준 |
| 시즌 배치고사 | 새 시즌 시작 기준 |
| 재구독 랭크 결정전 | 늦은 갱신자의 Sub 실제 배치 |
| 휴면 복귀 평가전 | 장기 휴면 복귀 |

`재구독 랭크 결정전`은 Skill MMR을 Soft Reset하지 않는다.

---

# 9. Sub 사용자 공식

```text
subGrowth
= clamp(
    80 × (
      seasonSubCurrentPercentile
      - seasonSubStartPercentile
    ),
    -20,
    +20
  )
```

```text
Final Rating
= Skill MMR
+ 15
+ subGrowth
+ 10 × seasonSubCurrentPercentile
+ weeklyMockBonus
+ temporaryAdjustment
```

---

# 10. Main 사용자 공식

시즌 중 Sub에서 Main으로 진입한 사용자:

```text
Final Rating
= Skill MMR
+ 35
+ frozenSubGrowth
+ 10 × seasonSubEndPercentile
+ mainGrowth
+ 20 × seasonMainCurrentPercentile
+ weeklyMockBonus
+ temporaryAdjustment
```

새 결제주기에서 Sub로 재진입하면
현재 경쟁 Division에 맞는 Sub 공식을 적용한다.

---

# 11. 동점 처리

```text
1. finalRating DESC
2. seasonSettledNormalAttackCount DESC
3. skillMmr DESC
4. stableUserId ASC
```

---

# 12. 데이터 모델

## 12.1 `LiveFinalRankingProfile`

```text
seasonId
userId
accessState
currentCompetitiveDivision

skillMmr
weeklyMockBonus

seasonSubStartPercentile
seasonSubCurrentPercentile
seasonSubEndPercentile

seasonMainStartPercentile
seasonMainCurrentPercentile

referenceSubPercentile
actualRenewalSubPercentile

finalRating
finalRank
status
calculationKey
```

## 12.2 상태

```text
ACTIVE
INACTIVE_ACCESS_EXPIRED
INACTIVE_PLACEMENT_REQUIRED
PENDING_RENEWAL_RANK_ASSESSMENT
SUNDAY_DISPLAY_FROZEN
```

---

# 13. 사용자 화면

만료:

```text
Final Ranking 참여가 일시 중지되었습니다.

학습권을 충전하면
GOAT Arena와 주간 모의고사를 다시 이용할 수 있습니다.
```

Main 72시간 내:

```text
지금 재구독하면 시험 없이
Main 성과를 반영한 Sub 랭크에서 시작합니다.
```

72시간 이후:

```text
랭크 복귀전이 필요합니다.

최고점을 받아도 정상 갱신 기준보다
낮은 Sub 랭크에서 시작합니다.
```

---

# 14. 운영 지표

- 만료로 비활성화된 Final Ranking 수
- 72시간 내 재활성화율
- 랭크 복귀전 완료율
- 만료 시점 Final Rank별 재구독률
- 주간 모의고사 접근 제한 전환율
- 정상 변환 기준과 실제 늦은 배치 차이
- 성장 기준 악용 차단 건수

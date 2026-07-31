# GOAT Arena
# Sub Division Ranking · Learning Pass · Payback

> 상태: **Sub Division 활성 정책 · v2.9 MAIN DEMOTION FINAL**  
> 기준일: 2026-08-01  
> 기준 시간대: `Asia/Seoul`

---

# 1. 목적

Sub Division은 다음 기능을 담당한다.

- 최초·시즌·재구독 후 Arena 랭킹
- 학습권을 이용한 1대1 Rank Takeover
- 결제주기별 페이백 경쟁
- Main Division 진입 자격
- Main 사용자의 새 결제주기 재진입 구간

무료 Arena 모드는 운영하지 않는다.

---

# 2. 핵심 값

| 값 | 목적 |
|---|---|
| `availableLearningDays` | 실제 서비스 이용·배팅 가능 학습권 |
| `lockedLearningDays` | 진행 중 경기에서 잠긴 학습권 |
| `paybackScoreDays` | 페이백·Main 진입 심사용 점수 |
| `arenaRank` | Sub Arena 랭크 |
| `arenaPosition` | Sub 정확한 순위 |
| `arenaGp` | Sub GP |
| Skill MMR | 배치·주간 공식 모의고사의 시험 실력 |
| Final Rating | Skill MMR과 Division 성과를 합친 전역 점수 |

Skill MMR과 Arena 상태를 같은 값으로 사용하지 않는다.

---

# 3. 결제주기 시작

정상 패키지 결제 시 새 `AccessCycle`을 생성한다.

```text
availableLearningDays = 29
paybackScoreDays = 29
paidNormalAttacksCompleted = 0
streakDays = 0
```

과거 결제주기의 잔액·페이백 점수는 새 주기로 이월하지 않는다.

---

# 4. 패키지 구매 제한

사용자는 학습권이 남아 있을 때 새 패키지를 즉시 구매할 수 없다.

```text
packagePurchaseEligible
= availableLearningDays = 0
AND lockedLearningDays = 0
AND noPendingSettlement
```

```text
availableLearningDays > 0
→ 패키지 구매 불가
```

목적:

- 학습권 무제한 적립 방지
- 결제주기 중첩 방지
- 페이백 심사 원본 분리
- Main·Sub 재진입 시점 명확화

자동갱신 예약 기능의 도입 여부는 별도 결제 정책에서 결정한다.

---

# 5. 결제 시각과 첫 학습일

기준은 KST 결제 승인 시각이다.

## 5.1 20:00 이전 결제

```text
paymentLocalTime < 20:00
```

결제 당일을 첫 학습일로 계산한다.

```text
결제 승인
→ AccessCycle 활성화
→ FIRST_DAY_CONSUMPTION -1
→ availableLearningDays 29 → 28
```

당일부터 Arena·주간 모의고사 자격을 얻는다.
단, 일요일 15:00~24:00 Arena 잠금은 그대로 적용한다.

## 5.2 20:00 이후 결제

```text
paymentLocalTime >= 20:00
```

결제 당일은 활성화 유예일이며 학습권을 차감하지 않는다.

```text
결제 승인
→ availableLearningDays = 29 유지
→ 당일 서비스 이용 가능
→ 다음 00:00 FIRST_DAY_CONSUMPTION -1
```

즉, 다음 날짜부터 첫 학습일로 계산한다.

## 5.3 경계 처리

- 정확히 20:00:00부터 이후 결제로 처리
- 서버 승인 시각을 권위 원본으로 사용
- 한 결제주기에 유예일은 한 번만 제공
- 결제 재시도·웹훅 중복에도 한 번만 적용
- 일요일 잠금 중 결제해도 Arena 경기는 월요일 00:00 이후 가능

---

# 6. 일일 학습권 차감

첫날 이후 KST 날짜 경계마다 활성 주기의 실제 학습권을 1일 차감한다.

```text
availableLearningDays
= max(0, availableLearningDays - 1)
```

거래 유형:

```text
DAILY_ACCESS_CONSUMPTION = -1
```

`paybackScoreDays`는 일일 시간 차감으로 줄지 않는다.

---

# 7. 학습권 만료

```text
availableLearningDays = 0
AND lockedLearningDays = 0
→ ACCESS_EXPIRED_LOCKED
```

즉시 제한:

- Sub 공격·방어·Revenge
- Main 공격·방어
- 주간 공식 모의고사
- Weekly Mock Bonus
- 시험 기반 Skill MMR 갱신
- 활성 Final Ranking 참여
- 신규 페이백 점수 획득

사용 가능:

- 결제 화면
- 마지막 Arena·Final Rank 스냅샷
- 과거 전적
- 계정·결제 관리
- 공지와 상세 규칙

만료 사용자는 방어 후보로 남지 않는다.

---

# 8. Sub 1대1 기본 원칙

모든 일반전과 Revenge는 Skill MMR을 사용하지 않는다.

```text
Arena tuple
= arenaRank + arenaPosition + arenaGp
```

도전자 승리:

```text
challenger.arenaTuple
<-> defender.arenaTuple
```

방어자 승리:

```text
Arena tuple write = none
```

---

# 9. 유료 경기 경제

일반 공격:

```text
normalStakeDays = 1
```

Revenge:

```text
revengeStakeDays = 2
```

정상 정산 결과는 `availableLearningDays`와 `paybackScoreDays`에
정책상 같은 방향으로 반영한다.

예:

```text
방어자 승리
→ 공격자 availableLearningDays -1
→ 공격자 paybackScoreDays -1
→ 방어자 availableLearningDays +1
→ 방어자 paybackScoreDays +1
```

도전자 승리 시의 소각 상세와 Bronze 예외는 이 문서 세트에 아직 확정되어 있지 않다. 구버전 값을 자동 승계하지 않으며, 실제 정산 구현 전에 이 문서의 새 정책 버전으로 먼저 확정한다.

---

# 10. 페이백 조건

```text
cashbackQualified
= streakDays >= 30
AND paidNormalAttacksCompleted >= 2
AND paybackScoreDays >= 30
AND integrityStatus = CLEAR
```

구간:

| paybackScoreDays | 페이백 |
|---:|---:|
| 29 이하 | 0% |
| 30~34 | 50% |
| 35~39 | 80% |
| 40 이상 | 100% |

페이백 자격이 확정되면 실제 송금 완료 전에도 Main 진입이 가능하다.

---

# 11. 페이백 심사

모든 사용자의 결제 시점이 다르므로 심사 스케줄러는 매일 실행한다.

```text
dailyPaybackReviewJob
→ evaluationAt <= now
→ evaluatedAt = null
→ 사용자별 30일차 심사
```

각 결제주기는 정확히 한 번만 평가한다.

멱등 키:

```text
cycleId + evaluationVersion
```

새 결제주기가 시작돼도 이전 결제주기의 30일차 심사는 별도로 진행한다.

---

# 12. Main 사용자의 학습권 만료와 Sub 강등

Main 사용자가 학습권을 모두 소진하면 Main에서 Sub로 강등되고 다음 상태로 전환한다.

```text
ACTIVE_MAIN
→ MAIN_DEMOTED_TO_SUB
→ SUB_ACCESS_EXPIRED_LOCKED
```

즉시 처리:

- GOAT Arena 이용 제한
- 주간 모의고사 제한
- 활성 Final Ranking 제외
- 마지막 Main 랭크·순위·GP 보존
- Main 백분위 스냅샷 보존
- 프로필의 Main 달성 이력 배지 보존
- 현재 경쟁 Division을 Sub로 변경
- 결제창 즉시 표시
- 72시간 재구독 유예 시작

72시간은 무료 이용 기간이 아니다. 사용자는 이미 Sub로 강등된 상태이며, 결제 전까지 Sub 경기와 주간 모의고사도 이용할 수 없다.

---

# 13. Main 사용자의 72시간 이내 재구독

```text
renewedAt <= expiredAt + 72 hours
```

배치 시험 없이 직전 Main 성과를 Sub Arena Seed로 변환한다.

```text
referenceSubPlacement
= MainToSubConvert(
    previousMainRank,
    previousMainPosition,
    previousMainGp,
    previousMainParticipantCount,
    conversionPolicyVersion
  )
```

처리:

```text
새 결제주기 29일·29점
→ currentCompetitiveDivision = SUB
→ demotionReason = LEARNING_DAYS_DEPLETED
→ referenceSubPlacement 적용
→ 새 Sub 페이백 경쟁 시작
```

과거 Main 진출 기록은 유지한다.

```text
mainAchievementStatus = ACHIEVED
currentCompetitiveDivision = SUB
```

새 주기에서 페이백 자격을 다시 충족하면
페이백과 Main 재진입이 가능하다.

---

# 14. 72시간 초과 재구독

## 14.1 시험 이름

공식 명칭:

```text
재구독 랭크 결정전
```

앱의 짧은 표기:

```text
랭크 복귀전
```

영문 내부 키:

```text
RENEWAL_RANK_ASSESSMENT
```

이 시험은 다음 시험들과 다르다.

| 시험 | 목적 |
|---|---|
| 최초 배치고사 | 최초 Skill MMR·Sub 배치 |
| 시즌 배치고사 | 새 시즌의 현재 Division 내부 배치 |
| 재구독 랭크 결정전 | 늦은 재구독자의 Sub 재진입 랭크 |
| 휴면 복귀 평가전 | 장기 미접속 Final Ranking 복귀 |

## 14.2 시험 효과

`재구독 랭크 결정전`은 Sub Arena 재진입 Seed를 결정한다.

Skill MMR을 임의로 초기화하지 않는다.

```text
assessmentPlacement
= scoreToSubPlacement(result)
```

## 14.3 악용 방지 상한

먼저 72시간 이내에 결제했을 경우의 변환 위치를 계산한다.

```text
referenceSubPlacement
= MainToSubConvert(previousMainSnapshot)
```

늦은 재구독자의 최고 가능 위치:

```text
lateRenewalCeiling
= oneFullSubTierBelow(referenceSubPlacement)
```

최종 배치:

```text
lateRenewalPlacement
= worseOf(
    assessmentPlacement,
    lateRenewalCeiling
  )
```

시험에서 최고점을 받아도 `referenceSubPlacement`보다 반드시 낮다.

## 14.4 Final Ranking 성장점수 악용 방지

실제 낮은 배치를 성장 기준으로 사용하면
늦은 갱신자가 성장점수를 쉽게 얻을 수 있다.

따라서:

```text
displayedSubPlacement
= lateRenewalPlacement

finalRankingSubGrowthBaseline
= referenceSubPlacement.percentile
```

늦은 결제 페널티를 성장점수 파밍에 이용할 수 없다.

---

# 15. 늦은 재구독의 활성화 순서

```text
결제
→ PAID_PENDING_RENEWAL_ASSESSMENT
→ 일반 학습 가능
→ 재구독 랭크 결정전
→ Sub 랭크·순위·GP 확정
→ GOAT Arena 활성화
→ 주간 모의고사 활성화
→ Final Ranking 활성화
```

시험 완료 전에는 Arena와 주간 모의고사를 이용할 수 없다.

---

# 16. Sub 사용자의 만료 후 재진입

Sub 사용자의 결제 만료 후 랭크 복귀 상세 방식은 별도 정책으로 확정한다.

현재 확정된 공통 원칙:

- 학습권 0이면 모든 Arena·주간 모의고사 제한
- 새 패키지는 학습권 0일 때만 구매 가능
- 새 결제주기는 새로운 페이백 기회
- 이전 결제주기의 paybackScore는 이월하지 않음
- 늦은 복귀로 성장 기준을 유리하게 바꾸는 행위 금지

---

# 17. 일요일 잠금

```text
일요일 15:00
→ Sub·Main Arena 잠금
→ 공개 Final Ranking 동결
```

15:00~24:00:

- 정상 이용자의 공식 모의고사
- Skill MMR staging
- Weekly Mock Bonus staging
- Final Ranking staging

월요일 00:00:

```text
새 MMR·Bonus·Final Rank 공개
→ Arena 잠금 해제
```

만료 사용자는 주간 시험과 staging 대상에 포함하지 않는다.

---

# 18. 사용자 화면

## 18.1 학습권 만료

```text
학습권이 모두 소진되었습니다.

GOAT Arena와 주간 모의고사를 계속 이용하려면
새 플랜을 구독해 주세요.
```

## 18.2 Main 72시간 유예

```text
학습권이 끝나 Main에서 Sub로 강등되었습니다.
Main 달성 기록은 프로필에 보존됩니다.

72시간 내 재구독:
시험 없이 Main 성과를 반영한 Sub 랭크에서 시작

72시간 이후:
랭크 복귀전 필요
```

## 18.3 20:00 결제 안내

```text
20:00 이전 결제
오늘이 1일차로 계산됩니다.

20:00 이후 결제
오늘은 차감되지 않으며
자정부터 1일차가 시작됩니다.
```

---

# 19. 운영 지표

- 학습권 0 도달률
- 결제창 노출 대비 전환율
- 24시간·72시간 내 재구독률
- 72시간 초과 재구독률
- Main-to-Sub 변환 분포
- 재구독 랭크 결정전 완료율
- 늦은 갱신 후 페이백 성공률
- 20:00 전후 결제 비중
- 첫날 차감 관련 CS 건수
- 주간 모의고사 접근 제한 후 재구독 전환
- 랭크별 활성 방어자 수
- 공격 요청 대비 매칭 성립률

---

# 20. 개발 체크리스트

- [ ] 무료 Arena 코드 제거
- [ ] 학습권 0 즉시 접근 잠금
- [ ] 주간 모의고사 권한 검사
- [ ] Final Ranking 활성 권한 검사
- [ ] 패키지 구매 `balance=0` 검사
- [ ] 잠금 학습권·미정산 경기 검사
- [ ] 20:00 결제 cutoff
- [ ] 당일 첫날 즉시 소비
- [ ] 20:00 이후 다음 00:00 첫 소비
- [ ] Main 만료 스냅샷
- [ ] 72시간 유예 타이머
- [ ] Main-to-Sub conversion policy
- [ ] `RENEWAL_RANK_ASSESSMENT`
- [ ] 늦은 재구독 상한
- [ ] Final Ranking 성장 기준 보호
- [ ] 새 결제주기 페이백 심사
- [ ] 일요일 잠금·00:00 공개

---

# 21. 최종 요약

```text
학습권 0
→ Main 사용자는 Sub로 강등
→ Arena·주간 모의고사·활성 Final Ranking 제한
→ 결제창
```

```text
Main 만료 후 72시간 내 결제
→ Main 성과를 Sub 랭크로 변환
→ 시험 없이 새 페이백 경쟁
```

```text
72시간 이후 결제
→ 재구독 랭크 결정전
→ 정상 변환 랭크보다 낮게 Sub 배치
```

```text
20:00 이전 결제
→ 당일이 1일차

20:00 이후 결제
→ 당일 차감 없음
→ 다음 00:00부터 1일차
```

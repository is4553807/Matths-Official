# GOAT Arena
# Sub Division Ranking · Learning Pass · Payback

> 상태: **Sub Division 활성 정책 · v2.9 MAIN DEMOTION FINAL**  
> 기준일: 2026-08-03
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

Main Division 전용 상점은 Sub Division에서 노출하거나 사용할 수 없다. Sub 사용자의 학습일수는 상점 구매 재화로 사용하지 않는다.

---

# 2. 핵심 값

| 값 | 목적 |
|---|---|
| `availableLearningDays` | 실제 서비스 이용·예치 가능 학습권 |
| `lockedLearningDays` | 진행 중 경기에 예치된 학습권 |
| `paybackScoreDays` | 페이백·Main 진입 심사용 점수 |
| `arenaRank` | Sub Arena 랭크 |
| `arenaPosition` | Sub 정확한 순위 |
| `arenaGp` | Sub GP |
| Skill MMR | 배치·주간 공식 모의고사의 시험 실력 |
| Final Rating | Skill MMR과 Division 성과를 합친 전역 점수 |

Skill MMR과 Arena 상태를 같은 값으로 사용하지 않는다.

`availableLearningDays`와 `paybackScoreDays`도 서로 다른 권위 장부다. 날짜 경과에 따른 일일 차감은 학습 가능 일수에만 적용하고, 페이백 점수는 그 잔액에서 계산하지 않는다. 경기 정산이 두 값을 모두 바꾸는 경우에도 각각 명시된 원장 변동을 기록한다.

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
페이백의 학습 조건은 이 29일 이용 주기의 29일 모두에 학습 기록을 남기는 것이다. 하루라도 빠지면 해당 주기의 전일 학습 조건은 실패한다.

최초 배치고사와 결제는 어느 순서로 완료해도 된다.

```text
결제만 완료
→ SEASON_PLACEMENT_REQUIRED

최초 배치고사만 완료
→ PAYMENT_REQUIRED + 잠긴 Sub 순위

두 조건 모두 완료
→ PAID_ACTIVE + 활성 Sub 순위
```

배치고사가 만든 Skill MMR과 최초 Sub GP는 생성 뒤 서로 다른 권위 원본에서 관리한다. 이후 Skill MMR 갱신이 Arena GP를 덮어쓰지 않는다.

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

최초 배치고사도 완료한 사용자라면 당일부터 Arena·주간 공식 모의고사 자격을 얻는다.
단, 일요일 14:30 신규 경기 차단과 15:00~24:00 Arena 잠금은 그대로 적용한다.

## 5.2 20:00 이후 결제

```text
paymentLocalTime >= 20:00
```

결제 당일은 활성화 유예일이며 학습권을 차감하지 않는다.

```text
결제 승인
→ availableLearningDays = 29 유지
→ 배치고사 완료 시 당일 서비스 이용 가능
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

- Sub 공격·방어·복수전
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

Sub Division의 공식 1대1은 `일반 쟁탈전`과 `복수전`이다. 별도의 일반전은 존재하지 않는다. 두 경기 모두 Skill MMR을 사용하지 않는다. 문제·채점·증거 제출은 공통 경기 규칙을 사용하지만 복수전의 예치와 정산은 Division별로 다르다.

신청 가능한 티어 조합:

| 도전자 | 방어자 |
|---|---|
| 브론즈 | 브론즈 또는 실버 |
| 실버 | 골드 |
| 골드 | 플래티넘 |
| 플래티넘 | 에메랄드 |
| 에메랄드 | 다이아몬드 |
| 다이아몬드 | 마스터 |
| 마스터 | 그랜드마스터 |
| 그랜드마스터 | 챌린저 |
| 챌린저 | 챌린저 |

브론즈·챌린저 경계 예외를 제외하면 도전자는 자신의 바로 위 티어에만 신청할 수 있다. 같은 티어와 두 티어 이상 차이 나는 신청은 서버가 거절한다.

- 경기 신청 순간 `arenaOneOnOneProblemTypes.js`의 Arena 전용 JS 생성기가 주관식 준킬러 5문항을 만든다. 현재 원본은 배치고사 심화 유형을 파일 단위로 독립 복사한 임시 구성이고 배치고사 파일을 직접 import하지 않는다.
- 양측은 완전히 같은 문제를 풀고, 난이도는 상위 티어인 방어자 쪽에 더 가깝게 맞춘다.
- 티어 조합당 30개 묶음 슬롯과 묶음당 서로 다른 5개 유형을 둔다. 현재 모든 조합은 독립 복사한 임시 Arena 유형에 연결되어 있으며, 유형 누락이나 자동 검산 실패가 있으면 경기를 열지 않는다.
- 제한 시간은 10분이며 문항별·전체 풀이 시간을 서버 시각으로 저장한다.
- `다음 문제`를 누르면 이전 문항의 답과 문제를 모두 다시 볼 수 없다.
- 5번 문항 완료 또는 시간 종료 뒤 문제를 닫고 60초 동안 풀이 증거 1~5장을 받는다.
- 분수·소수·동치식은 같은 수학적 값이면 정답으로 인정한다.
- 사용자는 목표 티어만 고르고 서버가 적격 사용자 한 명을 무작위로 정한다. 선정된 상위 티어 사용자는 자동 참가한다.
- 상대 배정 전에는 개인 후보를 공개하지 않고, 매치 성립 뒤에는 서비스 닉네임을 표시한다. 실명·학교·지역·연락처는 공개하지 않는다.

Sub Division 복수전:

- 적용 일수는 2일이다.
- 가장 최근 원경기의 패자만 결과 화면에서 즉시 `복수하기`를 선택할 수 있다.
- `경기 종료`를 선택하면 해당 원경기의 복수전 권리는 소멸한다.
- 상대는 선택권 없이 자동 참가하고, 신청 뒤 24시간 안에 문제 풀이를 완료해야 한다.
- 일반 쟁탈전과 같은 문제 형식·채점·Arena 상태 교환·무결성·증거 제출 규칙을 사용한다.
- Sub와 Main 모두 일요일 14:30부터 신규 신청·수락·준비·시작을 차단한다.
- 복수전 도전자가 승리하면 Arena 상태를 다시 교환하고 예치한 2일은 소각한다.
- 복수전 방어자가 정상 승리하면 Arena 상태를 교환하지 않는다. 도전자가 예치한 2일 중 1일은 방어자에게 이전하고 나머지 1일은 수수료로 소각한다.
- 복수전 신청을 받은 상대가 24시간 안에 완료하지 않으면 Arena 상태를 다시 교환하고, 도전자에게 1일을 반환하며 나머지 1일은 수수료로 소각한다.
- 복수전 도전자가 24시간 안에 완료하지 않으면 Arena 상태를 교환하지 않는다. 도전자가 예치한 2일 중 1일은 방어자에게 이전하고 나머지 1일은 수수료로 소각한다.
- 양측 모두 24시간 안에 완료하지 않으면 Arena 상태는 유지하고 도전자가 복수전에 예치한 2일을 전부 소각한다. 서버가 문제와 경기 시간을 정상 제공했으나 양측이 이용하지 않은 결과로 기록한다.

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

복수전:

```text
revengeStakeDays = 2
```

일반 쟁탈전 신청 시 Sub Division 전역 고정값인 `normalStakeDays = 1`만큼 다음과 같이 예치한다.

```text
availableLearningDays -= normalStakeDays
lockedLearningDays += normalStakeDays
```

이 단계에서는 `paybackScoreDays`를 변경하지 않는다. 방어자는 경기 생성 시 학습일수를 예치하지 않으며, 승패에 따른 이전·반환·소각은 공식 정산 단계에서 한 번만 처리한다.

두 장부는 서로의 값에서 파생하거나 자동 동기화하지 않는다. 정상 경기 정산에서는 아래 확정표가 각 값에 별도의 원장 변동을 명시하며, 현재 일반 쟁탈전의 일부 결과에서 두 변동 방향이 같더라도 하나의 잔액으로 취급하지 않는다.

예:

```text
방어자 승리
→ 공격자 availableLearningDays -1
→ 공격자 paybackScoreDays -1
→ 방어자 availableLearningDays +1
→ 방어자 paybackScoreDays +1
```

도전자 승리:

```text
실버 이상 도전자
→ Arena 상태 전체 교환
→ 예치한 1일 소각
→ 도전자 availableLearningDays -1
→ 도전자 paybackScoreDays -1

브론즈 도전자
→ Arena 상태 전체 교환
→ 예치한 1일 반환
→ 도전자 학습일수·페이백 점수 순변화 없음
```

Bronze 예외는 도전자의 경기 시작 전 티어가 브론즈일 때만 적용하며, 경기 결과로 받은 새 티어를 기준으로 소급 판정하지 않는다.

---

# 10. 페이백 조건

```text
cashbackQualified
= streakDays >= 29
AND paidNormalAttacksCompleted >= 2
AND paybackScoreDays >= 30
AND integrityStatus = CLEAR
```

`streakDays >= 29`는 29일 이용 주기의 첫날부터 마지막 날까지 매일 학습했다는 뜻이다. 중간에 하루라도 빠지면 연속 기록이 초기화되어 해당 주기 안에서 29일을 다시 채울 수 없으므로 전일 학습 조건은 실패한다.

구간:

| paybackScoreDays | 페이백 |
|---:|---:|
| 29 이하 | 0% |
| 30~34 | 50% |
| 35~39 | 80% |
| 40 이상 | 100% |

페이백 자격이 확정되면 실제 송금 완료 전에도 Main 진입이 가능하다.

Main 진입 시 Sub의 최종 페이백 점수를 그대로 Main 잔액으로 복사하지 않는다. Main 전용 정책에 따라 다음처럼 계산하고, 같은 Sub 이용 주기에는 진입 보너스를 한 번만 지급한다.

```text
mainCarryoverLearningDays = finalSubPaybackScoreDays - 29
mainEntryBonusDays = 2
mainStartingLearningDays = mainCarryoverLearningDays + mainEntryBonusDays
```

Main에서는 페이백 점수를 새로 누적하거나 다시 심사하지 않는다. 자세한 출처별 학습일수와 멱등 처리는 `04_MAIN_DIVISION_RANKING_SYSTEM.md`를 따른다.

---

# 11. 페이백 심사

모든 사용자의 결제 시점이 다르므로 심사 스케줄러는 매일 실행한다.

```text
dailyPaybackReviewJob
→ evaluationAt <= now
→ evaluatedAt = null
→ 사용자별 29일 이용 주기 종료 심사
```

각 결제주기는 정확히 한 번만 평가한다.

멱등 키:

```text
cycleId + evaluationVersion
```

새 결제주기가 시작돼도 이전 결제주기의 29일 이용 주기 종료 심사는 별도로 진행한다.

평가 시각에 `HELD` 또는 아직 정산되지 않은 공식 경기가 남아 있으면 페이백 결과를 확정하지 않는다.

```text
unresolvedOfficialMatch = true
→ ArenaPaybackReview.status = HELD
→ 경기 정산 또는 운영자 검토 완료 뒤 같은 cycleId로 재심사
```

보류 시 사용자에게 사이트 우편함과 가입 이메일을 모두 발송한다. 통지에는 보류 사유, 재심사 조건과 해당 결제주기를 표시하며, 같은 보류 건을 스케줄러가 다시 읽어도 중복 발송하지 않는다.

---

# 12. Main 사용자의 학습권 만료와 Sub 강등

Main 사용자의 사용 가능·초대 예약·경기 예치 학습일수가 모두 0이고 미정산 경기가 없으면 Main에서 Sub로 강등되고 다음 상태로 전환한다.

```text
availableLearningDays = 0
AND reservedLearningDays = 0
AND lockedLearningDays = 0
AND noPendingSettlement
```

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

Sub Division에는 별도 휴면 상태나 휴면 복귀 배치고사가 없다. 29일 학습권 패키지와 페이백 주기가 끝나면 기존 만료·재구매 규칙을 적용한다. Main Division에서 정확히 20일의 학습 가능 일수를 모두 차감해 Sub Division으로 강등된 사용자는 휴면 복귀 시험이 아니라 일반 Sub Division의 새 패키지 활성화와 배치고사 절차를 따른다.

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

Sub 사용자의 학습권이 만료된 뒤 29일 학습권 패키지를 다시 결제하면 배치고사를 다시 완료해야 한다. 이전 시즌 배치 결과나 만료 전 Sub Arena 상태로 경쟁 권한을 즉시 복구하지 않는다.

확정 원칙:

- 학습권 0이면 모든 Arena·주간 모의고사 제한
- 새 패키지는 학습권 0일 때만 구매 가능
- 새 결제주기는 새로운 페이백 기회
- 이전 결제주기의 paybackScore는 이월하지 않음
- 재결제 뒤 `SEASON_PLACEMENT_REQUIRED`로 전환하고 새 배치고사를 완료해야 Arena·주간 모의고사·Final Ranking을 다시 활성화
- 늦은 복귀로 성장 기준을 유리하게 바꾸는 행위 금지

---

# 17. 일요일 잠금

```text
일요일 14:30
→ 신규 경기 신청·수락·준비·시작 차단

일요일 15:00
→ Sub·Main Arena 잠금
→ 공개 Final Ranking 동결
```

14:30 전에 시작한 경기는 15:00까지 답안·풀이 증거 제출과 정산을 끝내야 한다. 15:00에 진행 중인 예외 경기는 `HELD`로 보내고 운영자 알림을 만든다.

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

- [x] 무료 Arena 코드 제거
- [x] 학습권 0 즉시 접근 잠금
- [x] 주간 모의고사 권한 검사
- [x] Final Ranking 활성 권한 검사
- [x] 패키지 구매 `balance=0` 검사
- [x] 예치 학습권·미정산 경기 검사
- [x] 20:00 결제 cutoff
- [x] 당일 첫날 즉시 소비
- [x] 20:00 이후 다음 00:00 첫 소비
- [x] Main 만료 스냅샷
- [x] 72시간 유예 타이머
- [x] Main-to-Sub conversion policy와 만료 시 기준값 저장
- [x] `RENEWAL_RANK_ASSESSMENT`
- [x] 늦은 재구독 상한
- [x] Final Ranking 성장 기준 보호
- [x] 새 결제주기 페이백 심사
- [x] 일요일 잠금·00:00 공개
- [x] 일반 쟁탈전 패자 복수전 권리 생성
- [x] 결과 화면 `복수하기`·`경기 종료` 단일 선택
- [x] Sub 복수전 2일 예치·24시간 완료 기한·일요일 14:30 상한
- [x] Sub 복수전 정상 승패와 한쪽 No-show 자동 정산
- [x] Sub 복수전 양측 No-show 시 Arena 상태 유지·예치 2일 전액 소각

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

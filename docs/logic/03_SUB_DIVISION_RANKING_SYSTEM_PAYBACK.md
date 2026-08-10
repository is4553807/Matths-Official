# GOAT Arena
# Unranked Ranking · Learning Pass · Payback

> 상태: **Unranked 활성 정책 · v2.9 MAIN DEMOTION FINAL**
> 기준일: 2026-08-03
> 기준 시간대: `Asia/Seoul`

---

# 1. 목적

Unranked는 다음 기능을 담당한다.

- 최초·시즌·재구독 후 Arena 랭킹
- 학습권을 이용한 1대1 Rank Takeover
- 결제주기별 페이백 경쟁
- Ranked 진입 자격
- Ranked 사용자의 새 결제주기 재진입 구간

무료 Arena 모드는 운영하지 않는다.

Ranked 전용 상점은 Unranked에서 노출하거나 사용할 수 없다. Unranked 사용자의 학습일수는 상점 구매 재화로 사용하지 않는다.

---

# 2. 핵심 값

| 값 | 목적 |
|---|---|
| `availableLearningDays` | 29일 패키지의 실제 서비스 이용 기간 |
| `paybackScoreDays` | 페이백·Ranked 진입 심사용 점수 |
| `lockedPaybackScoreDays` | 진행 중 Unranked 경기에 예치된 페이백 점수 |
| `lockedLearningDays` | Ranked 경기에서만 사용하는 예치 학습일수. Unranked 경기에는 사용하지 않음 |
| `arenaRank` | Unranked Arena 랭크 |
| `arenaPosition` | Unranked 정확한 순위 |
| `arenaGp` | Unranked GP |
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
→ PAYMENT_REQUIRED + 잠긴 Unranked 순위

두 조건 모두 완료
→ PAID_ACTIVE + 활성 Unranked 순위
```

배치고사가 만든 Skill MMR과 최초 Unranked GP는 생성 뒤 서로 다른 권위 원본에서 관리한다. 이후 Skill MMR 갱신이 Arena GP를 덮어쓰지 않는다.

---

# 4. 패키지 구매 제한

사용자는 학습권이 남아 있을 때 새 패키지를 즉시 구매할 수 없다.

```text
packagePurchaseEligible
= availableLearningDays = 0
AND lockedPaybackScoreDays = 0
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
- Ranked·Unranked 재진입 시점 명확화

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
단, 일요일 14:00 신규 경기 차단과 15:00~24:00 Arena 잠금은 그대로 적용한다.

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
AND lockedPaybackScoreDays = 0
AND lockedLearningDays = 0
→ ACCESS_EXPIRED_LOCKED
```

즉시 제한:

- Unranked 공격·방어·복수전
- Ranked 공격·방어
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

`paybackScoreDays = 0`과 패키지 만료를 혼동하지 않는다. 활성 29일 패키지의 학습 가능 일수가 남아 있는 동안 페이백 점수가 0이 되면 일반 공격·복수전 신청만 막는다 (일반 공격이나 복수전에 필요한 예치 페이백 점수가 없음). 학습·주간 공식 모의고사·기존 서비스 이용은 패키지 종료일까지 유지하며, 서버가 배정하는 방어 후보에도 남는다. 반대로 `availableLearningDays = 0`이 되면 페이백 점수가 남아 있어도 GOAT Arena 전체를 잠그고 방어 후보에서 즉시 제외한다.

---

# 8. Unranked 1대1 기본 원칙

Unranked의 공식 1대1은 `일반 쟁탈전`과 `복수전`이다. 별도의 일반전은 존재하지 않는다. 두 경기 모두 Skill MMR을 사용하지 않는다. 문제·채점·증거 제출은 공통 경기 규칙을 사용하지만 복수전의 예치와 정산은 Division별로 다르다.

신청 가능한 티어 조합:

| 도전자 | 방어자 |
|---|---|
| 브론즈 | 더 높은 브론즈 → 없으면 실버 |
| 실버 | 더 높은 실버 → 없으면 골드 |
| 골드 | 더 높은 골드 → 없으면 플래티넘 |
| 플래티넘 | 더 높은 플래티넘 → 없으면 에메랄드 |
| 에메랄드 | 더 높은 에메랄드 → 없으면 다이아몬드 |
| 다이아몬드 | 더 높은 다이아몬드 → 없으면 마스터 |
| 마스터 | 더 높은 마스터 → 없으면 그랜드마스터 |
| 그랜드마스터 | 더 높은 그랜드마스터 → 없으면 챌린저 |
| 챌린저 | 더 높은 챌린저 |

사용자는 상대나 목표 티어를 직접 고르지 않는다. 서버는 먼저 도전자와 같은 티어에서 도전자보다 티어 내부 순위가 높은 적격 후보를 찾고, 한 명이라도 있으면 그 후보군만 사용한다. 같은 티어의 상위 후보가 없을 때만 정확히 바로 위 티어로 한 단계 확장하며 두 단계 이상 위로는 넘어가지 않는다.

같은 티어 경기의 방어자는 항상 공격자보다 티어 내부 순위가 높은 사용자로 제한한다. 각 티어의 절대 최하위 사용자는 별도 방어 예외를 받지 않으며, 공격으로 순위를 높인 뒤 자신보다 아래 순위가 생겼을 때만 같은 티어 방어 후보가 된다. 이 제한은 승리한 공격자가 더 낮은 위치와 교환되는 하향 매치를 막는다.

서버가 자동 배정한 방어전을 시작하지 않은 기록이 5회 누적되면 자동 방어 후보에서 제외한다. 이 상태에서도 정기권 학습 가능 일수는 매일 기존 규정대로 차감한다. 사용자가 참가 가능한 공격을 한 번 정상적으로 생성하면 미응시 누적을 0회로 초기화하고 자동 방어 후보 자격을 복구한다. 복수전과 자발적으로 수락한 Ranked 초대전 미응시는 이 누적에 포함하지 않는다.

- 경기 신청 순간 활성 DB 카탈로그가 선택한 공식 사고 유형과 그 유형에 직접 결속된 독립 검산 생성기가 주관식 5문항을 만든다. 공개 난이도는 Unranked `U1~U9`이며, 기존 `T1~T9`는 배포된 문제 유형 DB를 찾는 내부 호환 키로만 사용한다. 공통수학Ⅰ·Ⅱ·대수·확률과 통계·미적분Ⅰ 유형 골격은 `arenaOneOnOneTypeSkeletons.js`가 관리한다. U1~U6은 1~5번 모두 13·14·20·21·27·28번형 준킬러 사고 구조에서 배정하고, 마스터·그랜드마스터·챌린저에 해당하는 U7~U9은 1~5번 모두 29·30번형 다중 조건 킬러로 배정한다. 공개 난이도마다 최소 30개 수치·조건 변형 유형을 두며, 양쪽 참가자의 최근 공식 경기 5개 유형을 우선 제외한다. 상세 기준은 `02_GOAT_ARENA_COMMON_MATCH_RULES.md` 3절을 따른다.
- 양측은 완전히 같은 문제를 풀고, 난이도는 항상 방어자 티어에 해당하는 `U1~U9` 등급으로 확정한다.
- 티어 조합당 30개 묶음 슬롯과 묶음당 서로 다른 5개 유형을 둔다. 현재 모든 조합은 독립 복사한 임시 Arena 유형에 연결되어 있으며, 유형 누락이나 자동 검산 실패가 있으면 경기를 열지 않는다.
- 각 문항의 제한 시간은 10분이며 문항별·전체 풀이 시간을 서버 시각으로 저장한다.
- `다음 문제`를 누르면 이전 문항의 답과 문제를 모두 다시 볼 수 없다.
- 5번 문항 완료 또는 시간 종료 뒤 문제를 닫고 60초 동안 풀이 증거 1~5장을 받는다.
- 필수 풀이 증거를 60초 안에 내지 않은 사용자는 자동 패배한다. 이 기한은 운영자의 추가 소명 요청과 다르므로 별도 소명 유예를 적용하지 않는다.
- 새로고침·네트워크 단절 뒤에도 서버의 문항·답안·문항당 10분 타이머는 유지되며, 돌아오지 않아 마지막 문항 또는 필수 증거를 끝내지 못하면 자동 판정을 적용한다.
- 답은 1~999 자연수로만 받는다. 빈 답은 미응답으로 처리하며 분수·소수·동치식 입력은 Arena 1대1 정답 형식에 포함하지 않는다.
- 사용자는 상대와 목표 티어를 고르지 않으며, 서버가 같은 티어 상위 순위 우선·바로 위 티어 폴백 규칙으로 적격 사용자 한 명을 정한다. 선정된 사용자는 자동 참가한다.
- 상대 배정 전에는 개인 후보를 공개하지 않고, 매치 성립 뒤에는 서비스 닉네임만 표시한다. 실명·학교·지역·연락처는 공개하지 않는다.

Unranked 복수전:

- 예치하는 페이백 점수는 2점이다.
- 가장 최근 원경기의 패자만 결과 화면에서 즉시 `복수하기`를 선택할 수 있다.
- `경기 종료`를 선택하면 해당 원경기의 복수전 권리는 소멸한다.
- 상대는 선택권 없이 자동 참가하고, 신청 뒤 24시간 안에 문제 풀이를 완료해야 한다.
- 복수전은 일반 쟁탈전의 최근 7일 재대결 제한의 예외다.
- 일반 쟁탈전과 같은 문제 형식·채점·Arena 상태 교환·무결성·증거 제출 규칙을 사용한다.
- Unranked와 Ranked 모두 일요일 14:00부터 신규 신청·수락·준비·시작을 차단한다.
- 복수전 도전자가 승리하면 Arena 상태를 다시 교환하고 예치한 2점은 소각한다.
- 복수전 방어자가 정상 승리하면 Arena 상태를 교환하지 않는다. 도전자가 예치한 2점 중 1점은 방어자에게 이전하고 나머지 1점은 수수료로 소각한다.
- 복수전 신청을 받은 상대가 24시간 안에 완료하지 않으면 Arena 상태를 다시 교환하고, 도전자에게 1점을 반환하며 나머지 1점은 수수료로 소각한다.
- 복수전 도전자가 24시간 안에 완료하지 않으면 Arena 상태를 교환하지 않는다. 도전자가 예치한 2점 중 1점은 방어자에게 이전하고 나머지 1점은 수수료로 소각한다.
- 양측 모두 24시간 안에 완료하지 않으면 Arena 상태는 유지하고 도전자가 복수전에 예치한 2점을 전부 소각한다. 서버가 문제와 경기 시간을 정상 제공했으나 양측이 이용하지 않은 결과로 기록한다.

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

# 9. Unranked 경기의 페이백 점수 경제

일반 공격:

```text
normalStakePaybackScore = 1
```

복수전:

```text
revengeStakePaybackScore = 2
```

일반 쟁탈전 신청 시 Unranked 전역 고정값인 `normalStakePaybackScore = 1`점을 다음과 같이 예치한다.

```text
paybackScoreDays -= normalStakePaybackScore
lockedPaybackScoreDays += normalStakePaybackScore
```

`availableLearningDays`와 `lockedLearningDays`는 Unranked 경기 생성·정산으로 변경하지 않는다. 방어자는 경기 생성 시 페이백 점수를 예치하지 않으며, 승패에 따른 이전·반환·소각은 공식 정산 단계에서 한 번만 처리한다.

학습 가능 일수와 페이백 점수는 서로의 값에서 파생하거나 자동 동기화하지 않는다. Unranked 경기 결과는 페이백 점수 장부만 변경한다.

예:

```text
방어자 승리
→ 공격자의 예치 페이백 점수 1점 해제
→ 방어자 paybackScoreDays +1
→ 양측 availableLearningDays 변화 없음
```

도전자 승리:

```text
실버 이상 도전자
→ Arena 상태 전체 교환
→ 예치한 페이백 점수 1점 소각
→ 도전자 availableLearningDays 변화 없음

브론즈 도전자
→ Arena 상태 전체 교환
→ 예치한 페이백 점수 1점 반환
→ 도전자 학습 가능 일수·페이백 점수 순변화 없음
```

Bronze 예외는 도전자의 경기 시작 전 티어가 브론즈일 때만 적용하며, 경기 결과로 받은 새 티어를 기준으로 소급 판정하지 않는다.

## 9.1 티어별 일일 일반 쟁탈전 상한

복수전은 아래 일반 공격·일반 방어 상한과 별도로 계산한다.

| 현재 티어 | 일일 공격 상한 | 일일 방어 상한 |
|---|---:|---:|
| 브론즈 | 4회 | 1회 |
| 실버 | 4회 | 1회 |
| 골드 | 3회 | 2회 |
| 플래티넘 | 3회 | 2회 |
| 에메랄드 | 2회 | 3회 |
| 다이아몬드 | 2회 | 3회 |
| 마스터 | 1회 | 4회 |
| 그랜드마스터 | 1회 | 4회 |
| 챌린저 | 1회 | 4회 |

- KST 날짜를 기준으로 당일 완료·성립한 일반 쟁탈전 횟수를 집계한다.
- 경기 뒤 티어가 바뀌면 새 티어 상한을 즉시 적용한다. 이미 새 상한 이상을 사용했다면 그날 추가 일반 공격·방어를 열지 않는다.
- 일반 쟁탈전에서 도전자가 승리하면 그날 남은 일반 공격·방어를 모두 막는다.
- 페이백 점수가 0인 활성 패키지 사용자는 공격·복수전을 신청할 수 없지만, 일일 방어 상한 안에서 방어 후보로 남는다.
- 29일 패키지가 만료되면 남은 페이백 점수나 당일 한도와 관계없이 공격·방어를 모두 잠근다.

---

# 10. 페이백 조건

```text
cashbackQualified
= streakDays >= 29
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

페이백 자격이 확정되면 실제 송금 완료 전에도 Ranked 진입이 가능하다.

Ranked 진입 시 Unranked의 최종 페이백 점수를 그대로 Ranked 잔액으로 복사하지 않는다. Ranked 전용 정책에 따라 다음처럼 계산하고, 같은 Unranked 이용 주기에는 진입 보너스를 한 번만 지급한다.

```text
mainCarryoverLearningDays = finalSubPaybackScoreDays - 29
mainEntryBonusDays = 2
mainStartingLearningDays = mainCarryoverLearningDays + mainEntryBonusDays
```

Ranked에서는 페이백 점수를 새로 누적하거나 다시 심사하지 않는다. 자세한 출처별 학습일수와 멱등 처리는 `04_MAIN_DIVISION_RANKING_SYSTEM.md`를 따른다.

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

# 12. Ranked 사용자의 이용 만료

Ranked 사용자의 사용 가능·초대 예약·경기 예치 학습일수가 모두 0이고 미정산 경기가 없으면 Ranked 이용이 만료되고 다음 상태로 전환한다. 재구독과 재진입은 Ranked 규정 8을 따른다.

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
- 마지막 Ranked 랭크·순위·GP 보존
- Ranked 백분위 스냅샷 보존
- 프로필의 Ranked 달성 이력 배지 보존
- 현재 경쟁 Division을 Unranked로 변경
- 결제창 즉시 표시
- 72시간 재구독 유예 시작

72시간은 무료 이용 기간이 아니다. Ranked 이용은 만료된 상태이며, 결제 전까지 Unranked 경기와 주간 모의고사도 이용할 수 없다.

---

# 13. Ranked 사용자의 72시간 이내 재구독

```text
renewedAt <= expiredAt + 72 hours
```

배치 시험 없이 직전 Ranked 성과를 Unranked Arena Seed로 변환한다.

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
→ 새 Unranked 페이백 경쟁 시작
```

과거 Ranked 진출 기록은 유지한다.

```text
mainAchievementStatus = ACHIEVED
currentCompetitiveDivision = SUB
```

새 주기에서 페이백 자격을 다시 충족하면
페이백과 Ranked 재진입이 가능하다.

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
| 최초 배치고사 | 최초 Skill MMR·Unranked 배치 |
| 시즌 배치고사 | 새 시즌의 현재 Division 내부 배치 |
| 재구독 랭크 결정전 | 늦은 재구독자의 Unranked 재진입 랭크 |


## 14.2 시험 효과

`재구독 랭크 결정전`은 Unranked Arena 재진입 Seed를 결정한다.

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
→ Unranked 랭크·순위·GP 확정
→ GOAT Arena 활성화
→ 주간 모의고사 활성화
→ Final Ranking 활성화
```

시험 완료 전에는 Arena와 주간 모의고사를 이용할 수 없다.

---

# 16. Unranked 사용자의 만료 후 재진입

Unranked 사용자의 학습권이 만료된 뒤 29일 학습권 패키지를 다시 결제하면 배치고사를 다시 완료해야 한다. 이전 시즌 배치 결과나 만료 전 Unranked Arena 상태로 경쟁 권한을 즉시 복구하지 않는다.

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
일요일 14:00
→ 신규 경기 신청·수락·준비·시작 차단

일요일 15:00
→ Unranked·Ranked Arena 잠금
→ 공개 Final Ranking 동결
```

14:00 전에 시작한 경기는 15:00까지 답안·풀이 증거 제출과 정산을 끝내야 한다. 15:00에 진행 중인 예외 경기는 `HELD`로 보내고 운영자 알림을 만든다.

일반 쟁탈전은 성립 뒤 24시간 안에 양측이 시작한다. 공격자만 미시작이면 방어자 자동 승리, 방어자만 미시작이면 공격자 자동 승리로 처리한다. 양측 모두 미시작이면 승패·복수전 권리 없이 `CANCELLED`로 끝내고 공격자가 예치한 페이백 점수 1점을 그대로 반환한다. 경기 생성 시점의 패키지·일일 한도·예치 정책 사본과 봉인된 문제 팩을 끝까지 사용하며, 이후 정책 변경은 진행 중 경기에는 적용하지 않는다.

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

## 18.2 Ranked 72시간 유예

```text
Ranked 이용이 만료되었습니다.
Ranked 달성 기록은 프로필에 보존됩니다.

72시간 내 재구독:
시험 없이 Ranked 성과를 반영한 Unranked 랭크에서 시작

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
- Ranked-to-Unranked 변환 분포
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
- [x] Ranked 만료 스냅샷
- [x] 72시간 유예 타이머
- [x] Ranked-to-Unranked conversion policy와 만료 시 기준값 저장
- [x] `RENEWAL_RANK_ASSESSMENT`
- [x] 늦은 재구독 상한
- [x] Final Ranking 성장 기준 보호
- [x] 새 결제주기 페이백 심사
- [x] 일요일 잠금·00:00 공개
- [x] 일반 쟁탈전 패자 복수전 권리 생성
- [x] 결과 화면 `복수하기`·`경기 종료` 단일 선택
- [x] Unranked 복수전 페이백 점수 2점 예치·24시간 완료 기한·일요일 14:00 상한
- [x] Unranked 복수전 정상 승패와 한쪽 No-show 자동 정산
- [x] Unranked 복수전 양측 No-show 시 Arena 상태 유지·예치 페이백 점수 2점 전액 소각

---

# 21. 최종 요약

```text
학습권 0
→ Ranked 사용자는 이용 만료 후 재구독 규정 적용
→ Arena·주간 모의고사·활성 Final Ranking 제한
→ 결제창
```

```text
Ranked 만료 후 72시간 내 결제
→ Ranked 성과를 Unranked 랭크로 변환
→ 시험 없이 새 페이백 경쟁
```

```text
72시간 이후 결제
→ 재구독 랭크 결정전
→ 정상 변환 랭크보다 낮게 Unranked 배치
```

```text
20:00 이전 결제
→ 당일이 1일차

20:00 이후 결제
→ 당일 차감 없음
→ 다음 00:00부터 1일차
```

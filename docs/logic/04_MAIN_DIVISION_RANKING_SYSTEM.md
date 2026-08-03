# Main Division Ranking System

> 상태: **Main Division 경기·학습일수 운영 정책 v1.1**
> 기준일: 2026-08-02
> 기준 시간대: `Asia/Seoul`

문서의 정책은 현재 확정 규칙이다. 코드와 DB에서 `DRAFT`는 관리자가 새 정책 버전을 만들었지만 아직 적용 일정에 등록하지 않은 상태를 뜻한다. 운영 중인 규칙은 `ACTIVE`, 사용이 끝난 과거 정책은 `RETIRED`로 보존한다.

---

# 1. 목적과 Division 분리

Main Division은 Sub Division에서 페이백 및 Main 진입 조건을 달성한 사용자가
남은 학습일수를 예치하고 경쟁하는 상위 Arena다.

Sub와 Main은 다음 항목을 분리한다.

- 참가자 풀
- Arena 랭크·정확한 순위·GP
- 경기 상대 선정
- 학습일수 예치 정책
- 경기 정책 버전
- 페이백 평가 여부

Sub Division은 결제주기별 페이백과 Main 진입 조건을 평가한다.
Main Division에서는 페이백을 다시 평가하지 않는다.

```text
Sub Division
= 페이백 및 Main 진입 자격 경쟁

Main Division
= 페이백 없이 학습일수를 예치하고 경쟁하는 상위 Arena
```

Main에서는 다음 값을 사용하지 않는다.

- `paybackScoreDays`의 신규 누적
- `paidNormalAttacksCompleted` 조건
- Main 페이백 비율
- Main 페이백 심사
- Main 페이백 지급

Main 일반 쟁탈전과 복수전은 Skill MMR을 변경하지 않는다.
Skill MMR은 배치고사와 매주 일요일 공식 모의고사에서만 변경된다.

---

# 2. Main 진입 조건과 시작 학습일수

Main 소속은 Sub Division에서 페이백 및 Main 진입 자격을 달성해 획득한다.
Sub 심사가 끝난 뒤 Main으로 넘어오는 학습일수는 다음 공식으로 계산한다.

```text
mainCarryoverLearningDays
= finalSubPaybackScoreDays - 29
```

Main 진입 보너스:

```text
mainEntryBonusDays = 2
```

최종 Main 시작 학습일수:

```text
mainStartingLearningDays
= mainCarryoverLearningDays
+ mainEntryBonusDays
```

Sub의 Main 진입 기준이 최소 30일이므로,
조건을 정확히 달성한 사용자는 다음처럼 시작한다.

```text
finalSubPaybackScoreDays = 30

mainCarryoverLearningDays
= 30 - 29
= 1

mainStartingLearningDays
= 1 + 2
= 3
```

29일을 빼는 이유는 30일을 정확히 달성한 사용자가
페이백 및 Main 진입 조건을 모두 충족한 직후
잔여 학습일수 0일로 Main에 진입하는 상황을 방지하기 위해서다.

Main 진입 보너스는 같은 Sub 결제주기에서 한 번만 지급한다.
중복 웹훅·중복 심사·중복 재시도에서도 같은 보너스를 다시 지급하지 않는다.

멱등 키 예시:

```text
sourceSubCycleId + MAIN_ENTRY_BONUS
```

---

# 3. Main 학습일수 구성과 사용 순서

Main의 실제 이용 및 예치 자산은 Main 학습일수다.

출처는 원장에서 분리해 기록한다.

```text
SUB_CARRYOVER
= Sub 최종 점수에서 29일을 뺀 이월분

MAIN_ENTRY_BONUS
= Main 진입 보너스 2일

MAIN_MATCH_TRANSFER
= Main 경기에서 다른 사용자에게서 이전받은 학습일수
```

사용자 화면에서는 합산 잔액을 표시한다.

```text
Main 잔여 학습일수
= 사용 가능한 학습일수
+ 예약 중 학습일수
+ 경기 예치 학습일수
```

일일 학습일수 소비 순서:

```text
1. SUB_CARRYOVER
2. MAIN_ENTRY_BONUS
3. MAIN_MATCH_TRANSFER
```

각 KST 날짜 경계마다 활성 Main 사용자의 학습일수를 1일 차감한다.

```text
DAILY_ACCESS_CONSUMPTION = -1
```

Main 사용자는 잔여 학습일수가 있는 동안 매주 공식 모의고사에 응시할 수 있다.
정상 응시 시 Skill MMR과 Weekly Mock Bonus는 Final Ranking 정책에 따라 갱신한다.

---

# 4. Main 학습일수 상태

Main 경기의 중복 예치와 미성립 경기의 반환을 구분하기 위해
학습일수를 세 상태로 관리한다.

```text
availableLearningDays
= 자유롭게 이용·예치할 수 있는 학습일수

reservedLearningDays
= 아직 상대가 수락하지 않은 Main 초대에 예약된 학습일수

lockedLearningDays
= 매치가 성립되어 경기 정산까지 예치된 학습일수
```

총 Main 학습일수:

```text
mainTotalLearningDays
= availableLearningDays
+ reservedLearningDays
+ lockedLearningDays
```

화면의 실제 사용 가능 잔액:

```text
spendableLearningDays
= availableLearningDays
```

예시:

```text
총 보유 학습일수 = 8일
예약 중 학습일수 = 2일
경기 예치 학습일수 = 1일

화면상 사용 가능 학습일수 = 5일
```

예약과 경기 예치는 학습일수 소비가 아니다.
정상 취소·무효 처리 시 정해진 조건에 따라 사용 가능 학습일수로 반환한다.

---

# 5. Main Arena 상태

```text
Main Arena 상태
= Main Arena 랭크
+ Main Arena 랭크 내 정확한 순위
+ Main Arena GP
```

일반 Main 경기와 복수전은 Skill MMR을 상대 선정, 문제 난이도,
승패 판정, 학습일수 정산 또는 Arena 상태 교환에 사용하지 않는다.

기본 Arena 상태 교환 원칙:

```text
Arena 도전자가 승리
→ 두 사용자의 Arena 상태 전체 교환

Arena 방어자가 승리
→ Arena 상태 교환 없음
```

Main 상위→하위 초대전에서는 요청을 만든 사용자와
Arena 정산상 도전자 역할을 구분한다.
자세한 내용은 `9. 상위 티어의 하위 티어 초대전`을 따른다.

모든 Main 경기는 Sub Division과 같은 순서로 승패를 정한다.

```text
1. 점수 높은 사용자
2. 정답 수가 많은 사용자
3. 정답 문항 풀이시간이 짧은 사용자
4. 전체 풀이시간이 짧은 사용자
5. 네 값이 모두 같으면 방어자 승리
```

---

# 6. Main 예치 정책

Main 사용자는 특정 사용자를 직접 선택하지 않고 목표 티어를 선택한다.
서버가 선택된 티어의 적격 후보 중 상대를 무작위로 결정한다.

```text
stakeDays
= 사용자가 선택한 정수 학습일수
  단, 티어 차이별 최소값 이상
```

| 티어 차이 | 최소 예치 학습일수 |
|---:|---:|
| 1단계 | 1일 |
| 2단계 | 2일 |
| 3단계 | 3일 |
| 4단계 이상 | 신청 불가 |

최대 티어 차이는 3단계다. 사용자는 최소값 이상을 예치할 수 있지만, 신청자와 상대 모두 예치 뒤 사용할 학습일수가 최소 1일 남아야 한다.

공격 또는 초대 생성자의 기본 자격:

```text
availableLearningDays > stakeDays
```

상대 후보의 기본 자격:

```text
candidate.availableLearningDays > stakeDays
```

예치 학습일수와 잔여 학습일수가 정확히 같은 사용자는
신규 경기의 공격자·초대자·상대 후보가 될 수 없다.

목적:

- 경기 패배만으로 즉시 학습일수 0일이 되는 상황 방지
- 정산 불가능한 경기 생성 방지
- 운영자의 신규 학습일수 임의 발행 방지
- 학습일수 몰아주기와 특정 상대 지정 어뷰징 완화

학습일수가 0이거나 필요한 예치 일수 이하인 사용자의 부족분을
운영자가 새 학습일수로 보충하지 않는다.
조건을 충족하지 못하면 매치를 성립시키지 않는다.

---

# 7. 상대 후보 랜덤 선정

공격자 또는 초대자는 상대 사용자를 직접 선택하지 않고 티어만 선택한다.

```text
사용자 입력
= targetTier

서버 결정
= selectedOpponentId
```

후보 기본 조건:

```text
candidate.currentCompetitiveDivision = MAIN
AND candidate.arenaTier = targetTier
AND candidate.availableLearningDays > stakeDays
AND candidate.accountStatus = ACTIVE
AND candidate.integrityStatus = CLEAR
AND candidate.currentSeasonPlacementCompleted = true
AND candidate.sundayDivisionLock = false
AND candidate has no unresolved official match
```

서버는 다음 후보를 제외한다.

- 요청자 본인
- 공식적으로 연관된 계정
- 정지·제재·무결성 심사 중인 계정
- 다른 공식 경기의 정산이 끝나지 않은 계정
- 정책상 반복 매칭 제한 대상
- 학습일수 지급 능력이 없는 계정

무작위 선정 감사 기록:

```text
candidatePoolSnapshot
selectionPolicyVersion
randomSelectionSeed
selectedOpponentId
selectedAt
```

랜덤 선정은 클라이언트가 아니라 서버에서 수행한다.

---

# 8. 일반 상향 공격

일반 상향 공격은 낮은 티어 사용자가 높은 티어를 선택해 도전하는 경기다.

```text
하위 티어 사용자
→ 목표 상위 티어 선택
→ 서버가 상위 티어의 적격 후보를 무작위 선정
→ 상대는 기존 공통 방어 규칙에 따라 의무 참가
```

공격자 자격:

```text
attacker.availableLearningDays > stakeDays
```

방어자 후보 자격:

```text
defender.availableLearningDays > stakeDays
```

매치가 성립하면 양측이 같은 `stakeDays`를 예치한다.

```text
attacker.availableLearningDays -= stakeDays
attacker.lockedLearningDays += stakeDays

defender.availableLearningDays -= stakeDays
defender.lockedLearningDays += stakeDays
```

## 8.1 공격자가 승리

```text
공격자가 예치한 stakeDays
→ 공격자에게 반환

방어자가 예치한 stakeDays
→ 공격자에게 이전

Arena 상태
→ 두 사용자 전체 교환
```

순효과:

```text
공격자 +stakeDays
방어자 -stakeDays
```

## 8.2 방어자가 승리

```text
방어자가 예치한 stakeDays
→ 방어자에게 반환

공격자가 예치한 stakeDays
→ 방어자에게 이전

Arena 상태
→ 교환 없음
```

순효과:

```text
공격자 -stakeDays
방어자 +stakeDays
```

---

# 9. 상위 티어의 하위 티어 초대전

상위 티어 사용자는 자신의 랭크를 걸고 학습일수를 예치해
하위 티어 사용자에게 경기 기회를 요청할 수 있다.

상위 사용자는 특정 하위 사용자를 고르지 않고 목표 하위 티어만 선택한다.

```text
상위 티어 초대 생성자
→ 목표 하위 티어 선택
→ 서버가 해당 티어의 적격 후보를 무작위 선정
→ 선정된 하위 사용자는 수락 또는 거절
```

이 경기는 일반 상향 공격과 달리 하위 사용자의 참가가 선택 사항이다.
거절해도 랭크·학습일수·Final Ranking에 불이익을 주지 않는다.

## 9.1 역할 분리

상위 사용자가 요청을 만들지만 Arena 정산 역할은 다음처럼 처리한다.

```text
상위 사용자
= invitationInitiator
= Arena 랭크 보유자
= Arena 방어자

하위 사용자
= invitationRecipient
= 수락 시 Arena 도전자
```

따라서 상위 사용자가 패배하면
Arena 도전자인 하위 사용자가 승리한 것으로 처리하여
두 사용자의 Arena 상태를 전체 교환한다.

## 9.2 초대 생성 자격

```text
invitationInitiator.availableLearningDays > stakeDays
```

## 9.3 하위 후보 자격

```text
candidate.arenaTier = selectedLowerTier
AND candidate.availableLearningDays > stakeDays
AND candidate meets Main opponent eligibility
```

상위 사용자가 건 학습일수보다 학습일수가 많은 후보만 선정한다.

## 9.4 하위 사용자가 수락한 경우

수락 시점에 양측의 자격과 잔액을 서버에서 다시 확인한다.

```text
상위 초대자의 예약 stakeDays
→ lockedLearningDays로 전환

하위 수락자의 availableLearningDays
→ stakeDays 차감 후 lockedLearningDays로 이동
```

## 9.5 상위 사용자가 승리

```text
상위 사용자가 예치한 stakeDays
→ 상위 사용자에게 반환

하위 사용자가 예치한 stakeDays
→ 상위 사용자에게 이전

Arena 상태
→ 교환 없음
```

순효과:

```text
상위 사용자 +stakeDays
하위 사용자 -stakeDays
```

## 9.6 하위 사용자가 승리

```text
하위 사용자가 예치한 stakeDays
→ 하위 사용자에게 반환

상위 사용자가 예치한 stakeDays
→ 하위 사용자에게 이전

Arena 상태
→ 두 사용자 전체 교환
```

순효과:

```text
상위 사용자 -stakeDays
하위 사용자 +stakeDays
하위 사용자가 상위 사용자의 기존 Arena 상태 획득
```

상위 사용자는 초대전을 만들 때 다음 두 가지를 함께 위험에 둔다.

- 예치한 학습일수
- 자신의 상위 Arena 상태

---

# 10. Main 초대 예약

상위→하위 초대전은 요청을 생성하는 즉시 공식 매치로 만들지 않는다.
상대가 수락하기 전까지 학습일수는 `reservedLearningDays`로 예약한다.

## 10.1 예약 생성

```text
availableLearningDays > stakeDays
```

조건을 만족하면:

```text
availableLearningDays -= stakeDays
reservedLearningDays += stakeDays
```

이 이동은 학습일수 소비나 경기 패배가 아니다.
아직 매치가 성립되지 않은 예약 상태다.

사용자 화면:

```text
실제 사용 가능 학습일수
= 원래 사용 가능 학습일수 - 예약 학습일수
```

예약된 학습일수는 다른 공격·초대·복수전에 중복 사용할 수 없다.

원장 거래 예시:

```text
MAIN_INVITATION_RESERVE
MAIN_INVITATION_RELEASE
MAIN_INVITATION_TO_MATCH_LOCK
```

## 10.2 예약 유효기간

상위→하위 초대 예약에는 고정 24시간 만료를 두지 않는다.

```text
requestExpiresAt = null
```

예약은 다음 중 하나가 발생할 때까지 유지한다.

```text
1. 초대 생성자가 직접 취소
2. 적격 하위 사용자가 수락하여 매치 성립
3. 초대 생성자가 Main 경기 자격 상실
4. 일일 차감 후 자동 취소 조건 충족
5. 관리자 또는 무결성 시스템이 요청 무효화
```

후보가 거절하거나 자격을 잃으면 전체 예약은 유지하고
서버가 같은 목표 티어의 새로운 적격 후보를 다시 무작위로 선정한다.
전체 초대 예약 자체에는 최대 대기시간을 두지 않는다.

서버는 목표 하위 티어의 적격 후보를 필터링한 뒤 순서를 무작위화해 초대장을 일괄 발송한다. 활성 정책의 `invitationOfferBatchSize`가 비어 있으면 전체 적격 후보에게 발송하고, 값이 있으면 그 수만큼만 발송한다. 가장 먼저 수락 트랜잭션을 완료한 한 명과만 매치를 만들고 나머지 초대는 자동 종료한다.

초대 생성자와 최근 7일 안에 공식 매치가 성립했던 사용자는 후보 단계에서 자동 제외하며 초대 알림도 보내지 않는다. 같은 초대 생성자가 동시에 유지할 수 있는 미성립 초대 예약은 목표 티어 하나당 1개다. 예를 들어 챌린저 사용자는 브론즈 대상 활성 예약을 한 번에 하나만 가질 수 있고, 그 예약이 종료되기 전에는 브론즈 대상 새 예약을 만들 수 없다.

## 10.3 매치 성립

하위 사용자가 수락하면 다음 값을 다시 검증한다.

```text
양측 accountStatus = ACTIVE
AND 양측 currentCompetitiveDivision = MAIN
AND 양측 available/reserved 잔액 충족
AND 목표 티어 관계 유효
AND sundayDivisionLock = false
AND 양측 no unresolved official match
```

검증 성공:

```text
초대자 reservedLearningDays -= stakeDays
초대자 lockedLearningDays += stakeDays

수락자 availableLearningDays -= stakeDays
수락자 lockedLearningDays += stakeDays
```

검증 실패 시 공식 매치를 만들지 않고
예약을 유지하거나 정책상 취소·반환한다.

## 10.4 매치 성립 전 취소

초대 생성자는 매치 성립 전 예약을 직접 취소할 수 있으며 직접 취소 수수료는 0일이다. 예약된 학습일수 전부를 사용 가능 학습일수로 반환하고 요청 상태와 취소 원인을 기록한다. 일일 차감으로 초대 생성자의 사용 가능 학습일수가 0이 된 자동 취소만 `11. 일일 차감과 예약 자동 취소`의 1일 수수료를 적용한다. 매치가 성립해 `lockedLearningDays`로 이동한 뒤에는 사용자가 임의로 취소할 수 없다.

---

# 11. 일일 차감과 예약 자동 취소

일일 학습일수 차감은 자유 잔액인 `availableLearningDays`에서 우선 처리한다.

예시:

```text
availableLearningDays = 1
reservedLearningDays = 2
lockedLearningDays = 0
```

KST 날짜 경계에서 1일 차감:

```text
availableLearningDays 1 → 0
reservedLearningDays = 2 유지
```

매치가 성립되지 않은 예약이 남아 있는 상태에서
사용 가능 학습일수가 0이 되면 해당 예약을 자동 취소하고 반환한다.

```text
availableLearningDays = 0
AND reservedLearningDays > 0
AND invitation match not formed

→ 미성립 초대 자동 취소
→ reservedLearningDays에서 1일 수수료 소각
→ 나머지를 availableLearningDays로 반환
```

위 예시의 자동 취소 결과:

```text
availableLearningDays = 1
reservedLearningDays = 0
```

반환된 1일도 이후 날짜 경계에서 정상적으로 매일 차감된다.
예약을 이용해 학습일수의 시간 차감을 영구 회피할 수 없다.

예약 학습일수가 1일이면 반환되는 학습일수는 없고 1일 전체를 수수료로 소각한다. 사용 가능·예약·경기 예치 학습일수가 모두 0이고 미정산 경기가 없으면 즉시 Sub Division으로 강등한다. Arena를 다시 이용하려면 학습권 패키지를 추가 구매하고 Sub Division부터 다시 시작한다.

매치가 이미 성립해 `lockedLearningDays`로 전환된 학습일수는
자동 취소하지 않는다.

```text
reservedLearningDays
= 매치 미성립
= 자동 취소·반환 가능

lockedLearningDays
= 매치 성립
= 경기 정산 우선
= 임의 자동 반환 금지
```

---

# 12. 일일 횟수와 동시 경기

Main Division에는 다음 일일 횟수 제한을 두지 않는다.

```text
일일 최대 공격 횟수 없음
일일 최대 방어 횟수 없음
일일 최대 초대전 횟수 없음
```

결제주기당 경기 순증가 학습일수 상한도 두지 않는다.

```text
maximumNetLearningDaysGainPerCycle = none
```

다만 공통 경기 무결성과 정산 안정성을 위해
한 사용자는 같은 시점에 정산되지 않은 공식 경기 하나만 가진다.

```text
unresolvedOfficialMatchCount <= 1
```

초대 예약도 중복 예치를 막기 위해
정책상 허용된 예약 수와 예약 총액을 서버에서 검증한다.
일일 횟수 무제한은 동일 학습일수의 중복 예약을 허용한다는 뜻이 아니다.

```text
maximumActiveInvitationReservationsPerTargetTier = 1
repeatOpponentExclusionDays = 7
```

---

# 13. Main 복수전

- 가장 최근 원경기의 패자만 결과 화면에서 즉시 `복수하기`를 누를 수 있다.
- `경기 종료`를 누르면 해당 원경기의 복수전 권리는 즉시 소멸한다.
- 신청을 받은 상대는 거절할 수 없고 자동 참가한다.
- 신청 뒤 24시간 안에 양측 모두 문제 풀이를 완료해야 하며 일요일 14:30을 넘길 수 없다.
- 문제 형식·승패 우선순위·완전 동점 방어자 승리·증거 제출·무결성 규칙은 Sub Division과 같다. 문제 난이도는 티어 차이와 무관하게 방어자 티어의 T1~T9 등급으로 고정하며, 답은 1~999 자연수만 허용한다. 전체 유형·팩·실측 보정 기준은 `02_GOAT_ARENA_COMMON_MATCH_RULES.md` 3절을 단일 원본으로 사용한다.

원경기에서 양측이 예치한 학습일수를 `S`라고 하면 Main 복수전 신청자가 예치하는 일수는 다음과 같다.

```text
revengeStakeDays = 2 × S
baseFeeDays = 1
```

정상 완료와 No-show 정산은 다음 표를 그대로 적용한다. 여기서 공격자는 직전 경기의 패자이자 복수전 신청자인 하위 티어 사용자이고, 방어자는 직전 경기에서 승리한 상위 티어 사용자다.

| 결과 | Arena 상태 | 신청자가 예치한 `2 × S`일 처리 |
|---|---|---|
| 공격자 정상 승리 | 공격자·방어자 Arena 상태 전체 교환 | 전부 소각 |
| 방어자 정상 승리 | Arena 상태 유지 | `2 × S - 1`일을 방어자에게 이전하고 1일 소각 |
| 방어자만 24시간 안에 미완료 | 공격자·방어자 Arena 상태 전체 교환 | `2 × S - 1`일을 공격자에게 반환하고 1일 소각 |
| 공격자만 24시간 안에 미완료 | Arena 상태 유지 | `2 × S - 1`일을 방어자에게 이전하고 1일 소각 |
| 양측 모두 24시간 안에 미완료 | Arena 상태 유지 | 전부 소각 |

모든 거래에서 반환·이전·소각 합계는 신청자가 실제로 예치한 `revengeStakeDays`와 정확히 같아야 한다. 한쪽만 No-show인 경우 정상 참여한 쪽을 원장에 남기며, 양측 No-show는 서버가 문제와 경기 시간을 제공했지만 양측이 이용하지 않은 것으로 기록한다.

---

# 14. 일요일 잠금

```text
일요일 14:30
→ Main 신규 공식 경기 매칭·수락·준비·시작 차단

일요일 15:00
→ Main 공식 경기 쓰기·정산 잠금
→ 공개 Final Ranking 동결
```

잠금 대상:

- 일반 상향 공격 매칭
- 상위→하위 초대 후보 수락 및 매치 성립
- 복수전 신청·수락·시작
- Arena 상태를 변경하는 공식 정산

기존 미성립 초대 예약은 자동 취소하지 않고 유지한다.

```text
일요일 14:30~월요일 00:00
→ 예약 유지
→ 신규 후보 선정·수락·매치 성립 일시 중단
```

```text
월요일 00:00
→ 자격·잔액·티어를 다시 검증
→ 적격 예약의 매칭 재개
```

정상 Main 사용자는 잠금 시간 동안 주간 공식 모의고사에 응시할 수 있다.
새 Skill MMR·Weekly Mock Bonus·Final Rank는 월요일 00:00에 일괄 공개한다.

---

# 15. 학습일수 만료와 Sub 강등

Main 사용자는 시간 차감과 경기 결과로 학습일수가 줄어든다.

```text
availableLearningDays = 0
AND reservedLearningDays = 0
AND lockedLearningDays = 0
AND noPendingSettlement
→ MAIN_DEMOTED_TO_SUB
→ SUB_ACCESS_EXPIRED_LOCKED
```

진행 중 경기와 예약은 먼저 정산한다. 만료 전 다음 값을 서버 권위 스냅샷으로 저장한다.

```text
mainTierSnapshot
mainGpSnapshot
mainPositionSnapshot
mainParticipantCountSnapshot
mainPositionReachedAt
mainExpiredAt
```

mainPositionSnapshot은 티어 안의 표시 순위가 아니라 만료 순간 활성 Main 전체에서의 정확한 순위다. 강등 뒤 현재 Main 순위가 바뀌어도 이 스냅샷을 다시 계산하지 않는다.

강등 처리 순서:

```text
1. Main 상태·전체 순위·참가자 수 스냅샷 저장
2. Main-to-Sub 기준 티어·GP·전체 순위 계산 및 저장
3. currentCompetitiveDivision = SUB
4. accessState = SUB_ACCESS_EXPIRED_LOCKED
5. Arena·주간 모의고사·활성 Final Ranking 잠금
6. 72시간 재구독 유예 시작
7. Main 성취 이력·시즌 배지·경기 원장 보존
```

## 15.1 Main 백분위

```text
mainParticipantCount = 1
→ mainPercentile = 1.000

그 외
mainPercentile
= 1 - (mainPosition - 1) / (mainParticipantCount - 1)
```

Main 1위는 1.000, 최하위는 0.000이다.

## 15.2 Sub 환산 백분위

```text
referenceSubPercentile
= 0.58 + 0.42 × mainPercentile
```

따라서 정상 스냅샷을 가진 72시간 이내 재구독자는 최소 Platinum에서 시작하고 Main 상위권은 Challenger까지 배치될 수 있다. Skill MMR, Final Rating, 주간 공식 모의고사 점수, 페이백 점수·비율·금액은 이 계산에 사용하지 않는다.

| Sub 티어 | 환산 백분위 구간 |
|---|---:|
| Bronze | 0.00 이상 0.20 미만 |
| Silver | 0.20 이상 0.40 미만 |
| Gold | 0.40 이상 0.58 미만 |
| Platinum | 0.58 이상 0.73 미만 |
| Emerald | 0.73 이상 0.83 미만 |
| Diamond | 0.83 이상 0.91 미만 |
| Master | 0.91 이상 0.96 미만 |
| Grandmaster | 0.96 이상 0.99 미만 |
| Challenger | 0.99 이상 1.00 이하 |

## 15.3 환산 GP와 정확한 Sub 전체 순위

각 환산 티어의 기준 GP는 0~99 GP로 계산한다.

```text
referenceSubGp
= floor(
    100 ×
    (referenceSubPercentile - tierLowerBound)
    / (tierUpperBound - tierLowerBound)
  )

referenceSubGp = clamp(referenceSubGp, 0, 99)
referenceSubPercentile = 1.000이면 referenceSubGp = 99
```

```text
targetSubPosition
= 1 + floor(
    (1 - referenceSubPercentile)
    × currentSubParticipantCount
  )

targetSubPosition
= clamp(targetSubPosition, 1, currentSubParticipantCount + 1)
```

targetSubPosition은 Sub 전체 정확한 순위다. 사용자를 이 위치에 삽입하고 기존 사용자들은 아래로 이동시킨다.

대표값:

| Main 내 위치 | Main 백분위 | Sub 환산 백분위 | Sub 티어 | GP |
|---|---:|---:|---|---:|
| 최하위 | 0.00 | 0.580 | Platinum | 0 |
| 하위 25% 지점 | 0.25 | 0.685 | Platinum | 70 |
| 중간 | 0.50 | 0.790 | Emerald | 60 |
| 상위 25% | 0.75 | 0.895 | Diamond | 81 |
| 상위 10% | 0.90 | 0.958 | Master | 96 |
| 상위 5% | 0.95 | 0.979 | Grandmaster | 63 |
| 상위 2% | 0.98 | 0.992 | Challenger | 20 |
| 1위 | 1.00 | 1.000 | Challenger | 99 |

## 15.4 동시 재진입 순서

같은 처리 묶음에서 여러 사용자가 재진입하면 다음 순서를 사용한다.

```text
1. referenceSubPercentile 높은 순
2. mainGpSnapshot 높은 순
3. mainPositionSnapshot 숫자가 작은 순
4. mainPositionReachedAt 빠른 순
5. 재결제 승인 시각 빠른 순
6. userId 오름차순
```

## 15.5 서버 검증과 버전

```text
mainParticipantCountSnapshot >= 1
1 <= mainPositionSnapshot <= mainParticipantCountSnapshot
0.000 <= mainPercentile <= 1.000
0.580 <= referenceSubPercentile <= 1.000
0 <= referenceSubGp <= 99
policyVersion = MAIN_TO_SUB_CONVERSION_V1
```

클라이언트의 티어·GP·백분위·순위 입력을 신뢰하지 않는다. 만료 뒤 정책이 바뀌어도 기존 스냅샷은 당시 버전으로 고정하며, 서버 계산 오류 정정은 관리자 조정 원장을 남긴다.

---

# 16. 72시간 이내 재구독

```text
renewedAt <= expiredAt + 72 hours
→ 새 29일 Sub 결제주기
→ 별도 랭크 복귀전 없음
→ referenceSubTier·referenceSubGp·targetSubPosition 그대로 적용
→ 새 Sub 페이백 경쟁 시작
```

정상 Main 만료, integrityStatus = CLEAR, 유효 스냅샷을 모두 만족할 때 최저 Platinum 0 GP를 보장한다. 부정행위 제재나 Main 랭크 무효 처리가 있으면 보장하지 않는다.

사용자에게 결제 전 예상 Sub 티어·GP, 72시간 종료 시각과 지연 시 최고 상한을 표시한다.

---

# 17. 72시간 초과 재구독

공식 시험명은 재구독 랭크 결정전, 앱 표기는 랭크 복귀전이다.

먼저 72시간 이내였을 때 받을 기준값을 보존한다.

```text
referenceSubTier
referenceSubGp
referenceSubOverallPosition
referenceSubPercentile
```

지연 재구독 최고 상한은 기준보다 정확히 한 티어 낮고 GP는 같은 값이다.

| 정상 변환 기준 | 지연 재구독 최고 상한 |
|---|---|
| Challenger 20 GP | Grandmaster 20 GP |
| Grandmaster 63 GP | Master 63 GP |
| Master 96 GP | Diamond 96 GP |
| Diamond 81 GP | Emerald 81 GP |
| Emerald 60 GP | Platinum 60 GP |
| Platinum 70 GP | Gold 70 GP |
| Platinum 0 GP | Gold 0 GP |

```text
actualLatePlacement
= Arena 서열상 더 낮은 값(
    assessmentPlacement,
    lateRenewalMaximumPlacement
  )
```

복귀전 결과가 낮으면 Bronze·Silver까지 배치될 수 있다. Final Ranking 성장 기준은 실제 지연 배치가 아니라 보존된 referenceSubPercentile을 사용한다.

---

# 18. 새 Sub 결제주기

Main 만료 후 재구독해도 Main에서 바로 재개하지 않는다.

```text
availableLearningDays = 29
paybackScoreDays = 29
paidNormalAttacksCompleted = 0
streakDays = 0
currentCompetitiveDivision = SUB
```

새 Sub 결제주기에서 페이백과 Main 진입 조건을 다시 달성하면 finalSubPaybackScoreDays - 29 이월분과 Main 진입 보너스 2일을 적용해 Main으로 재진입한다.

---

# 19. 연간 시즌

연도가 바뀌어도 Main 성취·소속 이력은 유지한다.

다만 Arena 랭크·순위·GP와 Final Rank는 초기화하고 Main 내부 시즌 배치고사를 완료해야 새 시즌에 집계한다.

Main 시즌 보상은 시즌별 성취 배지로 지급한다. 배지는 시즌이 끝나거나 사용자가 Sub로 이동해도 보존하며 경기 자산이나 학습일수를 만들지 않는다.

시즌 배치 결과가 같으면 다음 순서로 정확한 순위를 정한다.

```text
1. 배치 점수 높은 순
2. 전체 풀이시간 짧은 순
3. 배치에서 계산한 Skill MMR 높은 순
4. 배치고사 startedAt 빠른 순
5. userId 오름차순
```

startedAt은 제출 속도가 아니라 배치고사를 실제 시작한 날짜와 시각이다. 시즌 배치고사와 재구독 랭크 결정전은 다른 시험이다.

## 19.1 Main Division 휴면

휴면은 Main Division에만 적용하며 Sub Division에는 별도 휴면 상태를 두지 않는다.

휴면 미활동을 초기화하는 공식 활동은 다음 두 가지뿐이다.

```text
1. 공식 1대1 경기 완료
2. Matths 주간 공식 모의고사 제출 완료
```

로그인·페이지 열람·개념 학습·평가센터 이용·경기를 완료하지 않은 단순 신청이나 시작은 휴면 미활동을 초기화하지 않는다.

Main 사용자가 미활동 구간을 시작할 때 사용 가능한 정기권 학습 가능 일수가 20일 이상이면 휴면 판정 대상으로 고정한다. 현재 잔액을 매일 다시 검사하지 않고 미활동 시작 시점의 잔액을 스냅샷으로 남긴다. 그렇지 않으면 첫날 차감 뒤 20일 미만이 되어 휴면 판정을 영구히 피하는 오류가 생긴다.

```text
미활동 1~19일차
→ 기존 KST 일일 차감으로 하루 1일씩 차감

20일차에 공식 활동 완료
→ 휴면 전환 없음
→ 직전 19일의 차감은 유지
→ 미활동 시작 시각과 잔액 스냅샷 초기화

20일차 종료까지 공식 활동 없음
→ 20일차 일일 차감 완료
→ 다음 날 00:00 KST에 Sub Division으로 휴면 강등
```

20일 차감 뒤 잔여 학습일수가 있더라도 Main Division에 남거나 로그인만으로 복귀하지 않는다. Main 순위는 잠그고 활성 Arena·Final Ranking에서 제외한 뒤 Sub Division으로 강등한다. 남은 일수는 휴면 강등 예치분으로 별도 보관하며 Sub 이용 주기·페이백 점수·연속 29일 학습 판정에 넣지 않는다.

강등 사용자는 일반 Sub Division 사용자와 동일하게 새 학습권 패키지를 활성화하고 배치고사를 완료하며, 29일 학습과 페이백 조건을 실제로 달성해야 한다. 그 결과 Main Division에 다시 진입하는 트랜잭션에서만 보관 일수를 새 Main 이용 주기의 별도 출처로 추가한다. Main 재진입 전에 로그인하거나 Sub 활동을 하더라도 보관 일수를 꺼내지 않는다.

20일 차감 뒤 잔여 일수가 0이면 보관·복원 없이 일반 Sub Division 절차만 적용한다. Main 성취 배지와 과거 스냅샷은 두 경우 모두 보존한다.

---

# 20. 무결성과 어뷰징 방지

Main은 일일 경기 횟수와 결제주기 순증가 상한을 두지 않으므로
상대 선정과 학습일수 이전의 무결성 통제가 필수다.

최소 탐지 대상:

- 동일·연관 기기 계정의 반복 경기
- 동일 네트워크·결제수단·신원 신호 계정의 반복 경기
- 특정 방향으로만 반복되는 학습일수 이전
- 의도적인 오답·비정상 제출 패턴
- 반복적인 초대 수락·거절을 통한 상대 탐색
- 여러 계정을 이용한 학습일수 몰아주기
- 정책상 비정상적으로 높은 단기 경기량

위험 경기:

```text
RESOLVED
→ HELD
→ 운영 검토
→ SETTLED | INVALID
```

`HELD` 상태에서는 Arena 상태와 학습일수를 확정하지 않는다.
모든 예약·예치·이전·소각·반환은 학습일수 원장에 기록한다.

## 20.1 Main Division 상점 연계

Main 전용 상점의 아이템·가격·구매 제한·복구 정책은 [`12_SHOP.md`](./12_SHOP.md)를 따른다.

- `MAIN`이면서 `PAID_ACTIVE`인 사용자만 이용한다.
- 상점 구매에는 `availableLearningDays`만 사용하며 예약·경기 예치 학습일수는 사용할 수 없다.
- 구매 뒤 최소 1일을 남겨야 한다.
- 방어 휴식권은 상대 선정 전 일반 의무 방어 후보 조회에서만 제외 신호로 사용한다.
- 초대 매칭 가속권은 서버 무작위 후보 선정, 최근 상대 제외와 목표 티어별 예약 상한을 우회하지 않는다.
- 방어 일정 보호권은 일반 상향 공격의 의무 방어자만 문제 팩 열람 전에 사용할 수 있다. 사용하면 `INSURED_CANCELLED`로 종료하며 승패·Arena 상태 교환·복수전 권리를 만들지 않는다.
- 보호권 사용 트랜잭션은 양측 기존 예치분 반환, 방어자 가격 2일 차감, 공격자 1일 보상, 시스템 1일 소각과 참가자 잠금 해제를 한 번에 확정한다.
- `INSURED_CANCELLED` 경기는 Main 경기 승패, 시즌 정산 공격 수와 Final Ranking 경기 실적으로 집계하지 않지만 최근 7일 동일 상대 제외와 어뷰징 탐지에는 포함한다.

---

# 21. 정책 모델 예시

## 21.1 `MainDivisionPolicyVersion`

```text
code
status = DRAFT | ACTIVE | RETIRED
effectiveFrom
effectiveUntil
timezone = Asia/Seoul

mainEntryBonusDays = 2
mainCarryoverBaseDays = 29

stakeDaysByTierGap
maximumTargetTierGap

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

## 21.2 `MainInvitationRequest`

```text
requestId
initiatorUserId
initiatorArenaTier
targetTier
stakeDays
policyVersionId
policyVersionCode

status =
  SEARCHING
  | OFFERED
  | PAUSED
  | MATCH_FORMING
  | MATCHED
  | CANCELLED
  | INVALID

reservedLearningDays
selectedCandidateId
acceptedCandidateId
matchedOfferId
candidatePoolSnapshot
candidatePoolHash
selectionPolicyVersion
randomSelectionSeed
activeReservationKey

createdAt
pausedAt
resumedAt
matchedAt
cancelledAt
cancelReason
cancellationFeeDays
releasedLearningDays
burnedLearningDays
```

## 21.3 `ArenaLearningDayLedger`의 Main 이벤트

Main 전용 잔액 원장을 별도 컬렉션으로 중복 저장하지 않는다. 공통 `ArenaLearningDayLedger`에 Main 출처·예약·예치 이벤트를 기록한다.

```text
ledgerId
userId
matchId
requestId
sourceBucket = SUB_CARRYOVER | MAIN_ENTRY_BONUS | MAIN_MATCH_TRANSFER
eventType
amountDays
balanceBefore
balanceAfter
policyVersion
idempotencyKey
createdAt
```

---

# 22. 확정 구현 기준

- Main 시즌 배치 동점은 점수 → 전체 풀이시간 → Skill MMR → 배치 시작 시각 → userId 순으로 정한다.
- Main-to-Sub 변환은 15장의 MAIN_TO_SUB_CONVERSION_V1 공식을 사용한다.
- Main 시즌 보상은 시즌별 성취 배지다.
- 휴면은 Main Division에서만 적용하며 공식 1대1 경기와 Matths 주간 공식 모의고사 모두를 20일 연속 완료하지 않았을 때 판정한다.
- 20일 차감 뒤 잔여 일수가 있더라도 Sub Division으로 강등하고, 잔여 일수는 Sub 학습일수·페이백 점수와 분리해 Main 재진입 때까지 보관한다.
- 강등 사용자는 일반 Sub 과정을 모두 거쳐 Main에 다시 진입해야 하며, 그 순간에만 보관 일수를 새 Main 이용 주기에 추가한다.
- 상점 운영값은 [12_SHOP.md](./12_SHOP.md)의 확정 정책을 사용한다.

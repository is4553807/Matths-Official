# Main Division Ranking System

> 상태: **Main Division 경기·학습일수 운영 정책 v1.1**
> 기준일: 2026-08-02
> 기준 시간대: `Asia/Seoul`

문서의 정책은 현재 확정 규칙이다. 코드와 DB에서 `DRAFT`는 관리자가 새 정책 버전을 만들었지만 아직 적용 일정에 등록하지 않은 상태를 뜻한다. 운영 중인 규칙은 `ACTIVE`, 사용이 끝난 과거 정책은 `RETIRED`로 보존한다.

---

# 1. 목적과 Division 분리

Main Division은 Sub Division에서 페이백 및 Main 진입 조건을 달성한 사용자가
남은 학습일수를 걸고 경쟁하는 상위 Arena다.

Sub와 Main은 다음 항목을 분리한다.

- 참가자 풀
- Arena 랭크·정확한 순위·GP
- 경기 상대 선정
- 학습일수 배팅 정책
- 경기 정책 버전
- 페이백 평가 여부

Sub Division은 결제주기별 페이백과 Main 진입 조건을 평가한다.
Main Division에서는 페이백을 다시 평가하지 않는다.

```text
Sub Division
= 페이백 및 Main 진입 자격 경쟁

Main Division
= 페이백 없이 학습일수를 걸고 경쟁하는 상위 Arena
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

Main의 실제 이용 및 배팅 자산은 Main 학습일수다.

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
+ 경기 중 잠금 학습일수
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

Main 경기의 중복 배팅과 미성립 경기의 반환을 구분하기 위해
학습일수를 세 상태로 관리한다.

```text
availableLearningDays
= 자유롭게 이용·배팅할 수 있는 학습일수

reservedLearningDays
= 아직 상대가 수락하지 않은 Main 초대에 예약된 학습일수

lockedLearningDays
= 매치가 성립되어 경기 정산까지 잠긴 학습일수
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
경기 중 잠금 학습일수 = 1일

화면상 사용 가능 학습일수 = 5일
```

예약과 잠금은 학습일수 소비가 아니다.
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

# 6. Main 배팅 정책

Main 사용자는 특정 사용자를 직접 선택하지 않고 목표 티어를 선택한다.
서버가 선택된 티어의 적격 후보 중 상대를 무작위로 결정한다.

```text
stakeDays
= 사용자가 선택한 정수 학습일수
  단, 티어 차이별 최소값 이상
```

| 티어 차이 | 최소 배팅 학습일수 |
|---:|---:|
| 1단계 | 1일 |
| 2단계 | 2일 |
| 3단계 | 3일 |
| 4단계 이상 | 신청 불가 |

최대 티어 차이는 3단계다. 사용자는 최소값 이상을 배팅할 수 있지만, 신청자와 상대 모두 배팅 뒤 사용할 학습일수가 최소 1일 남아야 한다.

공격 또는 초대 생성자의 기본 자격:

```text
availableLearningDays > stakeDays
```

상대 후보의 기본 자격:

```text
candidate.availableLearningDays > stakeDays
```

배팅 학습일수와 잔여 학습일수가 정확히 같은 사용자는
신규 경기의 공격자·초대자·상대 후보가 될 수 없다.

목적:

- 경기 패배만으로 즉시 학습일수 0일이 되는 상황 방지
- 정산 불가능한 경기 생성 방지
- 운영자의 신규 학습일수 임의 발행 방지
- 학습일수 몰아주기와 특정 상대 지정 어뷰징 완화

학습일수가 0이거나 필요한 배팅량 이하인 사용자의 부족분을
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

매치가 성립하면 양측이 같은 `stakeDays`를 잠근다.

```text
attacker.availableLearningDays -= stakeDays
attacker.lockedLearningDays += stakeDays

defender.availableLearningDays -= stakeDays
defender.lockedLearningDays += stakeDays
```

## 8.1 공격자가 승리

```text
공격자의 잠금 stakeDays
→ 공격자에게 반환

방어자의 잠금 stakeDays
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
방어자의 잠금 stakeDays
→ 방어자에게 반환

공격자의 잠금 stakeDays
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

상위 티어 사용자는 자신의 랭크와 학습일수를 걸고
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
상위 사용자의 잠금 stakeDays
→ 상위 사용자에게 반환

하위 사용자의 잠금 stakeDays
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
하위 사용자의 잠금 stakeDays
→ 하위 사용자에게 반환

상위 사용자의 잠금 stakeDays
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

- 배팅한 학습일수
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

예약 학습일수가 1일이면 반환되는 학습일수는 없고 1일 전체를 수수료로 소각한다. 사용 가능·예약·잠금 학습일수가 모두 0이고 미정산 경기가 없으면 즉시 Sub Division으로 강등한다. Arena를 다시 이용하려면 학습권 패키지를 추가 구매하고 Sub Division부터 다시 시작한다.

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

초대 예약도 중복 배팅을 막기 위해
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
- 문제 형식·승패 우선순위·완전 동점 방어자 승리·증거 제출·무결성 규칙은 Sub Division과 같다.

원경기의 양측 잠금 배팅 일수를 `S`라고 하면 Main 복수전 신청자가 잠그는 일수는 다음과 같다.

```text
revengeStakeDays = 2 × S
baseFeeDays = 1
```

정상 완료와 No-show 정산은 다음 표를 그대로 적용한다. 여기서 공격자는 직전 경기의 패자이자 복수전 신청자인 하위 티어 사용자이고, 방어자는 직전 경기에서 승리한 상위 티어 사용자다.

| 결과 | Arena 상태 | 신청자가 잠근 `2 × S`일 처리 |
|---|---|---|
| 공격자 정상 승리 | 공격자·방어자 Arena 상태 전체 교환 | 전부 소각 |
| 방어자 정상 승리 | Arena 상태 유지 | `2 × S - 1`일을 방어자에게 이전하고 1일 소각 |
| 방어자만 24시간 안에 미완료 | 공격자·방어자 Arena 상태 전체 교환 | `2 × S - 1`일을 공격자에게 반환하고 1일 소각 |
| 공격자만 24시간 안에 미완료 | Arena 상태 유지 | `2 × S - 1`일을 방어자에게 이전하고 1일 소각 |
| 양측 모두 24시간 안에 미완료 | Arena 상태 유지 | 전부 소각 |

모든 거래에서 반환·이전·소각 합계는 신청자가 실제로 잠근 `revengeStakeDays`와 정확히 같아야 한다. 한쪽만 No-show인 경우 정상 참여한 쪽을 원장에 남기며, 양측 No-show는 서버가 문제와 경기 시간을 제공했지만 양측이 이용하지 않은 것으로 기록한다.

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

Main 사용자는 시간 차감과 경기 결과로 Main 학습일수가 줄어든다.

최종 만료 조건:

```text
availableLearningDays = 0
AND reservedLearningDays = 0
AND lockedLearningDays = 0
AND noPendingSettlement

→ MAIN_DEMOTED_TO_SUB
→ SUB_ACCESS_EXPIRED_LOCKED
```

`availableLearningDays = 0`이더라도 미성립 예약이 남아 있으면
먼저 `11. 일일 차감과 예약 자동 취소`에 따라 예약을 해제한다.

진행 중 경기의 `lockedLearningDays`가 남아 있으면
경기 정산을 우선하고 정산 완료 뒤 만료 여부를 판정한다.

보존:

- 마지막 Main 랭크
- 마지막 Main 정확한 순위
- Main GP
- Main 백분위
- Main 참가자 수
- Main 성취 이력
- Main 경기·학습일수 원장

강등 결과:

- 현재 경쟁 Division을 Sub로 변경
- GOAT Arena와 주간 모의고사 이용 잠금
- Main 달성 이력 배지는 유지

제거:

- 활성 Main 방어 후보 자격
- 활성 Main 초대 생성 자격
- 활성 Final Ranking 자격
- 주간 모의고사 자격

---

# 16. 72시간 이내 재구독

```text
expiredAt + 72 hours 이내 결제
→ Main-to-Sub Rank Convert
→ 시험 없음
→ 새 Sub 결제주기
→ 새 페이백 경쟁
```

학습일수가 끝난 시점에 이미 Main에서 Sub로 강등되므로,
재결제 후에도 Main에서 바로 재개하지 않는다.

```text
mainAchievementStatus = ACHIEVED
currentCompetitiveDivision = SUB
```

---

# 17. 72시간 초과 재구독

공식 시험명:

```text
재구독 랭크 결정전
```

앱 표기:

```text
랭크 복귀전
```

이 시험은 늦은 재구독자의 Sub 랭크를 결정한다.

최고점을 받아도 다음 기준보다 높게 배치하지 않는다.

```text
referenceSubPlacement
= MainToSubConvert(previousMainSnapshot)

maximumLatePlacement
= oneFullSubTierBelow(referenceSubPlacement)
```

Final Ranking 성장 기준은 실제 페널티 배치가 아니라
`referenceSubPlacement` 백분위를 사용한다.

---

# 18. 새 Sub 결제주기

Main 만료 후 재구독하면 Main에서 직접 새 주기를 시작하지 않는다.
새 Sub 결제주기를 생성한다.

```text
availableLearningDays = 29
paybackScoreDays = 29
paidNormalAttacksCompleted = 0
streakDays = 0
```

새 Sub 주기에서 페이백 및 Main 진입 조건을 다시 달성하면:

```text
Sub 페이백 심사 완료
→ mainCarryoverLearningDays = finalSubPaybackScoreDays - 29
→ Main 진입 보너스 +2
→ Main 재진입
```

---

# 19. 연간 시즌

연도가 바뀌어도 Main 성취·소속 이력은 유지한다.

다만 Arena 랭크·순위·GP와 Final Rank는 초기화하고
Main 내부 `시즌 배치고사`를 완료해야 새 시즌에 집계한다.

`시즌 배치고사`와 `재구독 랭크 결정전`은 다른 시험이다.

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
모든 예약·잠금·이전·소각·반환은 학습일수 원장에 기록한다.

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

Main 전용 잔액 원장을 별도 컬렉션으로 중복 저장하지 않는다. 공통 `ArenaLearningDayLedger`에 Main 출처·예약·잠금 이벤트를 기록한다.

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

# 22. 추후 운영 정책에서 확정할 항목

다음 수치는 아직 별도 정책 버전에서 확정해야 한다.

- Main 배치고사 동점 처리
- Main-to-Sub 정확한 변환표
- Main 시즌 보상
- Main 휴면 복귀 처리

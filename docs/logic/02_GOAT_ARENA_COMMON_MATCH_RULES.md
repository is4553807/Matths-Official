# GOAT Arena 공통 1대1 경기 규칙

> 상태: Division 공통 기반  
> 우선순위: 각 Division 최종 규칙보다 낮음  
> Sub 전용 수치·정산: [`03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md`](./03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md)  
> Main 전용 규칙: 개발 중

이 문서는 Sub와 향후 Main이 함께 사용할 수 있는 경기 진행, 문제 공정성, 서버 판정, 기록 원칙을 정의한다. 공격 대상, 일일 횟수, 배팅 학습일수, Revenge와 페이백 수치는 Division 문서에서 정한다. 단, 모든 1대1 경기의 MMR 분리와 Arena 상태 교환 원칙은 이 문서의 공통 불변식으로 적용한다.

## 1. Division 분리 원칙

- Sub와 Main은 참가자 풀, 랭킹, 경제 자산과 정책 버전을 분리한다.
- 서로 다른 Division 사용자는 공식 랭킹 경기에서 만나지 않는다.
- Sub 자산이나 결과를 Main 규칙에 임의로 전환하지 않는다.
- Main 진입 여부는 Sub 평가 결과일 수 있지만, 진입 후 Main 경기 규칙을 뜻하지 않는다.
- 클라이언트가 보낸 Division, 상대, 배팅량, 랭크를 권위 값으로 신뢰하지 않는다.

## 1.1 모든 1대1 경기의 MMR 분리 불변식

일반 1대1과 Revenge는 MMR과 완전히 분리한다.

```text
MMR
= 배치고사 및 매주 일요일 공식 모의고사에서만 변경

Arena 상태
= Arena 랭크 + Arena 랭크 내 순위 + Arena GP
```

1대1 서비스는 다음 목적으로 MMR을 읽거나 사용하지 않는다.

- 상대 후보 선정
- 공격 자격 또는 방어 자격
- 문제 난이도 배정
- 승패 판정
- 타이브레이커
- Arena 상태 교환 여부
- 학습일수 정산
- 일일 공격·방어 상한

### 도전자가 승리한 경우

두 사용자의 Arena 상태 3종을 한 묶음으로 통째로 교환한다.

```text
swap(challenger.arenaRank, defender.arenaRank)
swap(challenger.arenaPosition, defender.arenaPosition)
swap(challenger.arenaGp, defender.arenaGp)
```

도전자는 방어자가 경기 전에 보유한 Arena 랭크·순위·GP를 모두 받고,
방어자는 도전자가 경기 전에 보유한 Arena 랭크·순위·GP를 모두 받는다.

### 방어자가 승리한 경우

```text
Arena 랭크 교환 없음
Arena 순위 교환 없음
Arena GP 교환 없음
MMR 변경 없음
```

학습일수 정산만 Division 정책에 따라 수행한다.

### MMR 변경 경로

일요일 공식 모의고사 정산만 MMR을 변경한다.

일요일 공식 모의고사로 갱신된 MMR은 Final Ranking의 핵심 입력으로 사용한다.
Final Rating 계산은 Sub·Main Division 성과를 읽기만 하며,
Arena GP 또는 Arena 랭크·순위를 변경하지 않는다.
해당 작업은 1대1 Match 정산과 분리된 별도 정책·이벤트·트랜잭션으로 처리한다.

## 1.2 Final Ranking과 1대1의 경계

Final Ranking은 1대1 경기의 입력이나 정산 결과가 아니다.

- Final Rating으로 상대를 배정하지 않는다.
- Final Rank로 문제 난이도를 바꾸지 않는다.
- 1대1 결과 직후 Final Rating에 보너스를 누적하지 않는다.
- 정산된 Arena 상태 변화가 있으면 Final Rating을 공식으로 실시간 재계산한다.
- Division 기본점수와 성장·위치점수는 매번 덮어쓰며 중복 누적하지 않는다.
- Final Ranking은 Skill MMR과 Division 성과를 권위 입력으로 다시 계산하되, 그 계산 결과로 Skill MMR이나 Arena 랭크·순위·GP를 변경하지 않는다.

자세한 공식은
[`08_FINAL_RANKING_SYSTEM.md`](./08_FINAL_RANKING_SYSTEM.md)를 따른다.

## 1.3 구독·학습권 기반 경기 자격

공식 1대1 참가자는 다음을 모두 만족해야 한다.

```text
currentSeasonPlacementCompleted = true
AND accountStatus = ACTIVE
AND availableLearningDays > 0
AND accessState = PAID_ACTIVE
AND sundayDivisionLock = false
```

학습권이 0이 되면 공격·방어·Revenge와 신규 매칭을 즉시 중단한다.

```text
availableLearningDays = 0
→ ACCESS_EXPIRED_LOCKED
→ defensePoolEligible = false
```

만료 사용자는 무료 방어자로 남지 않는다.

진행 중 경기의 잠금 학습권이 남아 있으면 정산을 우선하고,
정산 완료 뒤 만료 상태로 전환한다.

## 1.4 재구독과 Arena 재진입

Main 사용자의 학습권이 끝나면 Main에서 Sub로 강등되고 GOAT Arena 이용이 잠긴다.
재결제하면 강등된 Sub Division에서 새 결제주기의 페이백 경쟁을 시작한다.

```text
72시간 이내 재구독
→ Main-to-Sub Rank Convert
→ 시험 없음

72시간 초과 재구독
→ 재구독 랭크 결정전
→ Sub 재진입 랭크 확정
```

늦은 재구독자는 시험 최고점을 받아도
정상 72시간 내 갱신 시 받을 변환 랭크보다 높은 위치에 배치할 수 없다.

`재구독 랭크 결정전`은 Skill MMR 배치고사가 아니라
Sub Arena 재진입 Seed를 결정하는 시험이다.

## 2. 공통 경기 생명주기

```text
자격 확인
→ 상대 후보 결정
→ 정책 버전·경기 조건 고정
→ 필요한 자산 잠금
→ 문제 팩 배정
→ 양측 응시·답안 저장
→ 서버 채점
→ 무결성 검사
→ 결과 확정 또는 보류
→ Arena 상태·자산·통계를 원자적으로 정산
→ 알림·기록 이벤트 발행
```

권장 상태:

```text
REQUESTED
→ MATCHED
→ READY
→ IN_PROGRESS
→ SUBMITTED
→ RESOLVED | HELD | INVALID
→ SETTLED | CANCELLED
```

- 한 사용자는 같은 시점에 정산되지 않은 공식 경기를 하나만 가진다.
- `HELD` 상태에서는 Arena 상태와 학습일수를 확정하지 않는다.
- 이미 `SETTLED`된 경기는 같은 요청이 다시 와도 재정산하지 않는다.
- 경기 시작 시점의 `PolicyVersion`과 문제·채점 버전을 끝까지 유지한다.

## 2.1 일요일 Sub·Main 공통 잠금

매주 일요일 15:00부터 월요일 00:00까지
Sub와 Main의 모든 공식 1대1 경기를 잠근다.

잠금 대상:

- 일반 공격·방어 매칭
- Revenge 신청·수락·시작
- Arena 상태를 변경할 수 있는 공식 정산

```text
latestMatchStart
= Sunday 15:00
- maximumMatchDuration
- settlementGracePeriod
```

15:00까지 정산되지 않은 경기는 `HELD` 처리하며
일요일 Division 스냅샷을 변경하지 않는다.

잠금 중 공개 Final Ranking은 15:00 상태로 고정한다. 정상 이용자의 공식 모의고사 MMR과 Weekly Mock Bonus, 새 Final Rank는 staging에서 계산한 뒤 월요일 00:00에 Arena 잠금 해제와 함께 일괄 공개한다. 학습권 만료 사용자는 시험과 staging 대상에서 제외한다.

## 3. 문제 구성과 공정성

초기 공통 경기 형식은 구버전의 다음 기준을 후보 기본값으로 유지한다. 실제 적용 전 정책 버전으로 확정해야 한다.

- 준킬러 수준 5문제
- 동일한 교육과정 범위, 문항 수, 배점, 목표 난이도와 제한시간
- 사전에 검증하고 봉인한 문제 팩
- 두 사용자에게 동일 문제 또는 사전 보정된 동등 Variant Set 제공
- 경기 시작 시 서로 다른 난이도의 문제를 즉석 생성해 배정하는 방식 금지

동등 Variant Set은 다음 조건을 만족해야 한다.

```text
same curriculum coverage
same question count
same score weights
same target difficulty distribution
same time limit
same scoring policy
```

답은 제한시간 안에 변경할 수 있고, 모든 변경 이벤트를 서버에 저장한다. 종료 시점의 최종 답을 채점한다. 다른 정책을 사용할 경우 경기 시작 전에 사용자에게 공개하고 정책 버전에 고정한다.

## 4. 승패 판정

구버전에서 유지할 공통 판정 후보는 다음과 같다.

```text
1. calibratedScore DESC
2. advancedCorrectCount DESC
3. correctAnswerActiveSolveTimeMs ASC
4. 공개된 추가 타이브레이커
5. 최종 완전 동점이면 방어자 승리
```

- 점수와 정답 성과가 시간보다 우선한다.
- 브라우저가 보낸 시간 숫자를 그대로 사용하지 않는다.
- 서버 시각, heartbeat, focus 이벤트와 네트워크 유예 정책으로 유효 풀이시간을 산정한다.
- 문제 오류나 서버 장애로 공정한 판정이 불가능하면 방어자 승리로 강제하지 않고 `HELD` 또는 `INVALID`로 보낸다.

Sudden Death의 사용 여부, 문항 수와 제한시간은 아직 공통 후보 정책이며 Sub v2.9의 필수 확정 규칙은 아니다. 정책 버전에 명시되기 전에는 구현하지 않는다.

## 5. 익명성과 개인정보

- 경기 전에는 정책이 허용한 임시 가명과 필요한 최소 정보만 공개한다.
- 실명, 학교, 지역, 연락처, 결제 정보와 공모 탐지 신호는 공개하지 않는다.
- 경기 종료 뒤 실제 서비스 닉네임을 공개하는 범위는 Division 정책과 사용자 공개 설정을 따른다.
- 탈퇴 사용자의 과거 경기·랭킹 이력은 운영상 필요한 기록을 유지하되 공개 화면에서는 익명화한다.

Sub Division의 구체적인 경기 전후 공개 범위는 Sub v2.9에 아직 별도로 확정되어 있지 않다. 새 정책 버전이 나오기 전에는 위 최소 공개 원칙만 적용하고 구버전 공개 범위를 자동 승계하지 않는다.

## 6. 서버 권위와 멱등성

서버가 직접 계산하거나 재검증해야 하는 값:

- 계정·결제주기·Division 참가 자격
- 상대 후보와 재매칭 제한
- 현재 Arena 랭크·Arena 순위·Arena GP와 당일 사용 횟수
- 잠글 학습일수와 사용 자산
- 문제 팩과 채점 정책
- 시작·종료 시각과 유효 풀이시간
- 승패, Arena 상태 3종의 교환 여부, 이전·반환·소각량
- streak, 최소 공격과 페이백 자격

다음 동작은 고유 멱등 키를 사용한다.

```text
challenge request
match start
answer save
submission
settlement
ledger transaction
notification/outbox event
```

## 7. 정산 공통 불변식

- 모든 학습일수 변화는 불변 원장 거래로 설명할 수 있어야 한다.
- 잠금, 결과, Arena 상태 교환, 카운터와 원장 거래는 한 정산 트랜잭션에서 확정한다.
- 확정 원장 기록은 수정·삭제하지 않고 조정 거래로 정정한다.
- 취소·무효 시 정책상 차감 사유가 없다면 잠긴 자산을 원래 사용자에게 반환한다.
- 한 경기에서 잠근 양은 이전, 반환, 소각 중 명시된 거래의 합과 같아야 한다.
- 경기 기능이 Division 문서에 없는 새 학습일수를 발행해서는 안 된다.
- 1대1 정산 트랜잭션은 MMR, MMR 이력, MMR 표시 티어와 MMR 표시용 `rankPoint`를 쓰지 않는다.
- 도전자 승리 시 Arena 랭크·순위·GP 세 필드가 모두 교환되거나 모두 롤백되어야 한다.
- 방어자 승리 시 Arena 랭크·순위·GP에 쓰기 작업이 발생해서는 안 된다.

## 8. 부정행위와 공모

최소 탐지 항목:

- 동일 기기·네트워크·결제수단·페이백 계좌 연관 계정의 반복 경기
- 한 방향으로만 반복되는 학습일수 이전
- 비정상적으로 빠른 제출 또는 반복 무응답
- 동일 답안·고의 오답 패턴
- 특정 상대와의 반복 No-show
- 매칭 후 상대 교체 또는 클라이언트 파라미터 조작

의심 경기의 기본 흐름:

```text
NORMAL → 자동 정산
SUSPICIOUS → HELD
CONFIRMED → 정산
INVALID → 잠금 해제 또는 조정 거래
```

특정 사용자의 페이백을 임의로 통제하기 위해 문제 난이도, 상대 가중치 또는 판정을 비공개로 조작하지 않는다.

## 9. 취소·No-show·장애

확정된 공통 처리:

| 상황 | 처리 |
|---|---|
| 적격 상대 없음 | 자산 잠금 없이 종료 |
| 서버 장애 | 경기 무효·잠금 해제 |
| 문제 오류 | `HELD` 후 재채점 또는 무효 |
| 결과 미확정 상태에서 평가일 도달 | 페이백 심사 보류 또는 서버 책임 취소 |
| 정지·탈퇴·결제 분쟁 | 원인과 시점에 따라 hold 또는 무효 |

도전자·방어자 No-show의 승패, 학습일수 정산, 최소 공격 인정 여부는 약관과 함께 확정해야 한다. 구버전 값을 자동 승계하지 않는다.

## 10. 비경제적 확장 기능

배지, 시즌 기록, Arena Feed와 프로필 장식은 학습일수로 교환되지 않는 비경제적 기능으로만 둘 수 있다.

- 이벤트 재처리로 배지가 중복 지급되지 않아야 한다.
- 결과 취소·정정 시 취소 또는 조정 이벤트를 남긴다.
- 비경제적 보상이 Sub 학습일수나 페이백 자격을 생성해서는 안 된다.
- Main 전용 Shield, 상점, 비용 체계는 Main 정책 확정 전까지 구현하지 않는다.

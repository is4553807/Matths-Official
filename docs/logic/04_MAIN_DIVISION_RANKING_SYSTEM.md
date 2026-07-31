# Main Division Ranking System

> 상태: **내부 경기 규칙 미작성 / 만료·Sub 강등·재구독 경계 확정**  
> 기준일: 2026-08-01

---

# 1. 확정된 Main 경계

- Main 소속은 Sub 페이백 자격을 달성해 획득한다.
- Main 일반전은 Skill MMR을 변경하지 않는다.
- Final Ranking은 Main 상태를 읽기만 한다.
- 일요일 15:00~월요일 00:00 공식 경기를 잠근다.
- 학습권 0이면 Main 공격·방어·주간 모의고사를 즉시 제한한다.

---

# 2. 학습권 만료와 Sub 강등

```text
ACTIVE_MAIN
→ availableLearningDays = 0
→ MAIN_DEMOTED_TO_SUB
→ SUB_ACCESS_EXPIRED_LOCKED
```

보존:

- 마지막 Main 랭크
- 마지막 Main 정확한 순위
- Main GP
- Main 백분위
- Main 참가자 수
- Main 성취 이력

강등 결과:

- 현재 경쟁 Division을 Sub로 변경
- GOAT Arena와 주간 모의고사 이용 잠금
- Main 달성 이력 배지는 유지

제거:

- 활성 Main 방어 후보 자격
- 활성 Final Ranking 자격
- 주간 모의고사 자격

---

# 3. 72시간 이내 재구독

```text
expiredAt + 72 hours 이내 결제
→ Main-to-Sub Rank Convert
→ 시험 없음
→ 새 Sub 결제주기
→ 새 페이백 경쟁
```

학습권이 끝난 시점에 이미 Main에서 Sub로 강등되므로, 재결제 후에도 Main에서 바로 재개하지 않는다.

```text
mainAchievementStatus = ACHIEVED
currentCompetitiveDivision = SUB
```

---

# 4. 72시간 초과 재구독

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

# 5. 새 결제주기

```text
availableLearningDays = 29
paybackScoreDays = 29
paidNormalAttacksCompleted = 0
streakDays = 0
```

새 주기에서 페이백 조건을 다시 달성하면:

```text
페이백
→ Main 재진입
```

---

# 6. 연간 시즌

연도가 바뀌어도 Main 성취·소속 이력은 유지한다.

다만 Arena 랭크·순위·GP와 Final Rank는 초기화하고
Main 내부 `시즌 배치고사`를 완료해야 새 시즌에 집계한다.

`시즌 배치고사`와 `재구독 랭크 결정전`은 다른 시험이다.

---

# 7. 추후 확정할 Main 항목

- Main 내부 Arena 랭크·순위·GP
- Main 공격·방어 상한
- Main 배팅 자산
- Main-to-Sub 정확한 변환표
- Main 배치고사 동점 처리
- Main 시즌 보상
- Main 휴면 복귀 처리

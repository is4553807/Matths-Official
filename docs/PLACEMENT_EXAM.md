# War of GOAT 입단 배치고사

## 문항 구성

- 30문항, 100점
- 1~20번: 3점 문항 20개
- 21~30번: 4점 문항 10개
- 제한 시간: 100분
- 시간은 시험 기록의 `startedAt`을 기준으로 서버에서 계산한다.
- 답안은 입력할 때마다 자동 저장하며, 브라우저를 닫아도 제한 시간은 계속 흐른다.
- 제한 시간이 끝나면 서버가 해당 회차를 `disqualified`로 확정한다.
- 응시 중에는 한 화면에 한 문항만 표시한다.
- 문항을 이동하거나 5초 심박 저장이 발생할 때 서버가 직전 문항의
  체류 시간을 누적한다. 탭이 닫히거나 전장으로 나가면 해당 문항의
  측정을 닫아 자리를 비운 시간을 풀이 시간에 포함하지 않는다.
- 시험지에는 `generationVersion`을 저장한다. 새 출제 버전이 배포될
  때 한 문제도 답하지 않은 구버전 진행 회차는 새 문제로 자동
  교체하고 제한 시간을 다시 시작한다. 이미 답한 회차는 공정성을
  위해 기존 문제를 유지한다.

## 유형과 확률

문항 청사진은 `services/placementExamBank.js`의
`PLACEMENT_QUESTION_BLUEPRINTS`에 있다.

첨부 분석 문서의 공식 39회 세부 유형 비율을 번호별로 보존한다.
다만 과거 선택과목 구조를 새 통합형에 그대로 섞지 않도록 다음 순서로
후보를 만든다.

1. 각 번호의 `새 통합형 고정 영역`과 다른 과목의 과거 유형을 제외한다.
2. 같은 과목으로 남은 과거 유형의 공식 비율은 그대로 유지한다.
3. 과거 선택과목 체계 때문에 비게 된 확률의 35%는 해당 번호의
   `2028 평가원 예시 기준형`에 배정한다.
4. 나머지 65%는 같은 고정 과목·난이도 구간의 공식 출제 유형에
   전체 공식 빈도 비율로 나눈다.
5. 예시 기준형과 역사 유형이 실제로 같은 유형이면 하나로 합쳐
   중복 후보를 만들지 않는다.
6. 합계가 정확히 100%인 후보군에서 가중 무작위 추첨한다.
7. 발문 중복, 빈 정답, 중복 선지, 정답 선지 누락을 검사한 뒤 통과한
   문항만 시험지에 넣는다.

분석 문서의 `수식 중심·수동 검토 필요`는 수학 문제 유형이 아니라
자동 분류 보류 표시이므로 출제 유형에서는 제외한다. 이를 제외한 과거
세부 유형 28개와 번호별 2028 기준형 30개가 모두 자바스크립트 생성기로
연결되어 있다.

### 준킬러·킬러

`services/placementAdvancedTypes.js`는 긴 해석형 참고 문항을 다음
8개 구조군으로 분리한다.

- 함수 조건과 그래프 추론
- 적분으로 정의된 함수와 넓이
- 미분·극한·변화율·운동
- 수열·점화식·귀납적 구조
- 확률·경우의 수·확률분포
- 지수·로그·삼각함수·주기성
- 도형·좌표·공간 기하
- 복합 조건과 경우 분기

기하는 현재 배치 범위 밖이므로 참고 목록에는 남기되 출제하지 않는다.
20·21번은 준킬러 생성형, 28·30번은 킬러 생성형에서만 출제한다.
현재 독립 생성형은 준킬러 10종, 킬러 11종이다.

- 20번: 미적분Ⅰ 준킬러 5유형
- 21번: 확률과 통계 준킬러 5유형
- 28번: 확률과 통계 킬러 5유형
- 30번: 미적분Ⅰ 킬러 5유형

나머지 번호도 공식 번호별 분포와 기준 생성기를 합쳐 실제 생성기
식별자 기준 최소 5유형을 확보한다. 회차마다 유형을 먼저 뽑고, 선택된
유형 안에서 다시 수치를 생성하므로 발문 구조와 숫자가 함께 달라진다.

수치 변형 문항은 다음 검사를 모두 통과해야 한다.

1. 생성기와 독립된 계산 또는 전수 열거로 다시 답을 구한다.
2. 해가 존재하고 최종 답이 유일한지 확인한다.
3. 생성 답과 독립 검산 답이 같은지 확인한다.
4. 정수·유리수 크기와 연산량을 검사해 계산기 없이 정확 계산이
   가능한지 확인한다.
5. 준킬러는 최소 4단계, 킬러는 최소 5단계 추론 구조인지 확인한다.
6. 하나라도 실패하면 버리고 새 수치로 다시 생성한다.

## 저장 데이터

배치고사는 기존 `AssessmentAttempt` 컬렉션에
`scopeType: "placement"`로 저장한다.

- `userId`
- `earnedPoints`, `scorePercent`
- `elapsedTimeMs`, `timeLimitMs`
- 전체 문항과 각 문항의 제출 답, 정답 여부, 배점, 출제 유형
- 각 문항의 `placementCategory`, `skillTags`, `difficultyScore`
- 각 문항의 `placementNumber`, `fixedCourseId`
- 각 문항의 `selectedTypeKey`, `selectedTypeLabel`
- 각 문항의 실제 `selectionProbability`, `distributionSource`
- 각 문항의 `expectedTimeMs`, `responseTimeMs`, `answerChanges`
- 각 문항의 `enteredAt`, `exitedAt`, `answeredAt`, `submittedAt`
- 각 문항의 `similarGroupId`와 수치 변형 검산 결과
- `placementResult.threePoint.correct/total`
- `placementResult.fourPoint.correct/total`
- 3점·4점·준킬러·킬러별 원 정답률과 소표본 보정 정답률
- `placementResult.keyQuestions`
  - 20번, 21번: 준킬러 지표
  - 28번, 30번: 킬러 지표
- `placementResult.question20Correct`
- `placementResult.question21Correct`
- `placementResult.question28Correct`
- `placementResult.question30Correct`
- `placementResult.answeredCount/unansweredCount`
- `placementResult.cohortSize`
- `placementResult.cohortAverage`
- `placementResult.percentile`
- `placementResult.initialRating`
- `placementResult.initialTier`
- `placementResult.abilityProfile`
  - 기본 실력, 검증 전 심화 실력, 일관성, 배치 신뢰도
  - 기본 안정성, 잠정 실수 후보 수, 확인된 개념 결손 수
- `placementResult.verification`
  - 추가 확인 필요 여부, 판정 점수, 이유 코드, 확인 상태
- `placementResult.placementScore`
- `placementResult.initialMmr`, `tier`, `division`
- `placementResult.rankingStatus: "provisional"`
- `placementResult.matchesUntilConfirmed: 2`

보정 정답률은 `(정답 수 + 1) / (전체 문항 수 + 2)`로 계산한다.
기본 실력은 총점 백분위 55%와 3점 보정 정답률 45%, 심화 실력은
4점 50%·준킬러 20%·킬러 30%로 계산한다. 배치 점수는 기본 실력
65%와 심화 실력 35%를 합친다. 초기 MMR은 응시 집단 배치 점수의
평균과 표준편차로 표준화한 뒤 `1000 + 200 × z`로 계산한다.
응시 완료 표본이 5명보다 적으면 한 명뿐인 응시자가 자동으로
100백분위가 되는 왜곡을 막기 위해 전체 점수 백분위를 중립값
`0.5`로 둔다. 5명부터 실제 응시 집단 백분위를 적용한다.
표준편차가 아직 형성되지 않은 소표본에서는 15점을 안전 기준으로 쓴다.

풀이 시간이 빠르다는 이유만으로 찍기나 부정행위를 확정하지 않는다.
고난도 정답, 쉬운 문항과의 개념 일관성, 티어 경계 여부를 함께 보고
추가 5문제 확인이 필요한지만 저장한다.

## 검증

다음 명령은 모든 유형을 반복 생성하고 무작위 완성 시험지 300회에 대해
문항 수, 총점, 배점 분포, 발문·고난도 유형 중복, 독립 정답 검산,
계산기 없는 풀이 가능성, 랭킹 프로필 및 문항별 서버 시간 누적을
검사한다.

300회 생성 동안 각 번호에서 실제 생성기 기준으로 최소 5종 이상의
문제가 나오는지도 함께 검사한다. 공식 분포가 한 유형 100%인 번호는
같은 유형 안의 서로 다른 생성기와 수치 변형을 검사한다.

활성 시험의 타이머는 기본적으로 문서 흐름 안에 있어 문항 이동표를
가리지 않는다. 왼쪽 손잡이를 끌면 화면 안 원하는 위치에 고정되고,
손잡이를 두 번 누르면 원래 위치로 돌아간다.

```bash
npm run placement:verify
```

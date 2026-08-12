# 6-A단계 — `STRUCTURE_TEMPLATE_READY` 20개 구현 확장

## 결론

- PDF 원문 대표 문항을 직접 대조한 뒤 `STRUCTURE_TEMPLATE_READY` 20개를 실제 숫자 변형 생성기로 구현했다.
- 기존 `PILOT_READY_MANUAL` 12개와 합쳐 실제 격리 생성기는 **32개**다.
- 32개 구조가 대표하는 PDF 원문 레코드는 **89개**다.
- 전체 572개 정규 구조 가운데 **32개 구현, 540개 미구현** 상태다.
- 전체 629개 원문 레코드 기준으로는 **89개 구조 대표 범위 확인, 540개 남음**이다.
- 평가센터와 운영 GOAT Arena 1대1 매치에는 연결하지 않았다.

## 이번에 추가한 20개

| 번호 | 대표 원문 | 구현 유형 |
|---:|---|---|
| 1 | 2020-09-KICE-NA-Q27 | 이산확률분포표의 선형변환 평균·분산 |
| 2 | 2019-06-KICE-NA-Q28 | 정수 공차 범위와 부분합으로 등차수열 항 복원 |
| 3 | 2018-07-EDUCATION_OFFICE-NA-Q28 | 정규분포 대칭성과 표준화 |
| 4 | 2019-06-KICE-GA-Q25 | 치역 원소 수와 고정점 수가 지정된 함수 개수 |
| 5 | 2018-04-EDUCATION_OFFICE-NA-Q27 | 거듭제곱과 근호가 자연수가 되는 지수의 합 |
| 6 | 2016-06-KICE-GA-Q24 | 두 집단에서 지정 인원을 뽑는 조합 |
| 7 | 2018-09-KICE-NA-Q28 | 두 점의 속도가 같아지는 순간의 거리 |
| 8 | 2019-03-EDUCATION_OFFICE-GA-Q27 | 평행한 로그곡선 절편 사다리꼴 넓이 |
| 9 | 2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 속도와 위치로 상수 복원 |
| 10 | 2019-03-EDUCATION_OFFICE-NA-Q27 | 등차수열 첫째항의 역수 복원 |
| 11 | 2018-06-KICE-NA-Q26 | 이항식 곱의 특정 차수 계수 |
| 12 | 2019-07-EDUCATION_OFFICE-GA-Q24 | 이항분포 선형변환의 분산 |
| 13 | 2020-06-KICE-GA-Q25 | 음함수 곡선의 접선 기울기 |
| 14 | 2016-06-KICE-GA-Q25 | 밑이 같은 지수방정식의 해 |
| 15 | 2018-06-KICE-GA-Q27 | 중복 문자열에서 지정 문자의 최소 출현 횟수 |
| 16 | 2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | 닫힌구간 삼차함수의 최댓값·최솟값 |
| 17 | 2023-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | 방향 전환 순간의 가속도 |
| 18 | 2022-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17 | 좌표축과 포물선 사이의 넓이 |
| 19 | 2017-06-KICE-NA-Q24 | 고정 부분집합과 서로소인 부분집합 개수 |
| 20 | 2021-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 평균변화율과 순간변화율 일치 |

## 정적 검증

- 유형 수: 32
- 유형당 시드: 1,000
- 총 생성 문항: 32,000
- 주 풀이기와 독립 풀이기 불일치: 0
- 1~999 정답 범위 오류: 0
- 동일 시드 비결정성: 0
- 유형별 최소 파라미터 변형 수: 7
- 유형별 최소 서로 다른 정답 수: 5
- MathJax 인라인 구분자 불균형: 0
- 시각자료 계약 누락: 0

상세 기계 검증 결과는 `pilot-verification-v2.json`에 기록했다.

## 브라우저 렌더링 검증

- 렌더 카드: 32
- 고유 유형 ID: 32
- MathJax 렌더 컨테이너: 183
- 시각자료: 3
  - 원형 배치도 1
  - 정규분포표 1
  - 로그곡선·사다리꼴 도형 1
- 카드 또는 프롬프트 가로 넘침: 0
- 페이지 가로 넘침: 0
- 정답·풀이·푸터 누락: 0
- 브라우저 콘솔 오류: 0

렌더 결과는 `pilot-render-v2.html`에 기록했다.

## 격리 경계

다음 운영 파일에서 `arenaPdfPilotGenerators`를 import하지 않는 것을 검증했다.

- `services/assessmentService.js`
- `services/arenaOneOnOneProblemBank.js`
- `services/arenaTierQuestionCatalogService.js`
- `services/arenaProblemPackService.js`

즉 이번 구현은 평가센터와도, 운영 GOAT Arena 1대1 문제 출제와도 연결되지 않은 검증용 격리 모듈이다.

## 남은 작업

| 계약 상태 | 구조 수 | 다음 처리 |
|---|---:|---|
| `FORMULA_TRANSCRIPTION_REQUIRED` | 200 | PDF 수식·조건을 정확히 전사하고 생성 파라미터/풀이 계약 확정 |
| `MANUAL_FORMULA_REVIEW_REQUIRED` | 340 | 원문을 수동 판독해 잘못 분류된 구조와 누락 조건 교정 |
| 합계 | 540 | 검증 후에만 7단계 운영 풀 연결 후보가 됨 |

6-B에서는 `FORMULA_TRANSCRIPTION_REQUIRED` 200개부터 원문 식 전사와 계약 확정을 진행한다.

# 6-B-7단계 - 다음 25개 수식·조건 전사

## 결론

- 6-B-1부터 6-B-6 다음 순서의 `FORMULA_TRANSCRIPTION_REQUIRED` 구조 25개를 원본 크롭에서 직접 판독했다.
- 정확한 정답률이 있는 나머지 18개는 64.9%~80.1%이고, 정확한 수치가 공개되지 않은 다음 7개는 EBSi Top 15 경계에서 확인되는 정답률 하한 70.1%~71.3%를 사용했다.
- 정답률 비공개 7개는 임의의 대표값이나 중간값으로 바꾸지 않고 `correctRatePercent: null`과 객관적 하한·상한·근거 종류를 함께 기록했다.
- 난이도 티어 구성은 T4 14개, T3 10개, T2 1개다.
- 결과는 GOAT Arena 1대1 전용 격리 데이터이며 운영 출제 코드에는 연결하지 않았다.
- 생성기 구현과 브라우저 렌더링은 아직 수행하지 않았다.

구조화 결과는 `formula-transcriptions-batch-6b7.json`에 저장했다.

## 전사한 25개

| 순번 | 원문 ID | 정답률 근거 | 핵심 구조 |
|---:|---|---:|---|
| 1 | 2025-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 64.9% | 두 수열의 이동곱 전개와 곱합 |
| 2 | 2020-09-KICE-GA-Q27 | 65.3% | 등비수열의 세 항 합과 부분합 차 |
| 3 | 2018-04-EDUCATION_OFFICE-GA-Q25 | 65.8% | 유리함수 도함수 부호구간 |
| 4 | 2016-07-EDUCATION_OFFICE-GA-Q23 | 65.9% | 탄젠트 합성함수 미분 |
| 5 | 2016-09-KICE-NA-Q26 | 65.9% | 두 색 공의 비복원 동시추출 확률 |
| 6 | 2018-07-EDUCATION_OFFICE-NA-Q25 | 65.9% | 등차수열과 두 연속항의 합 |
| 7 | 2018-09-KICE-NA-Q26 | 66.0% | 양의 등비수열과 두 항의 기하평균 |
| 8 | 2016-09-KICE-NA-Q25 | 66.1% | 조각함수 접합점 미분가능성 |
| 9 | 2016-04-EDUCATION_OFFICE-NA-Q23 | 67.5% | 제곱합과 상수항의 유한합 |
| 10 | 2020-07-EDUCATION_OFFICE-GA-Q25 | 67.5% | 매개변수 좌표 운동의 속력 |
| 11 | 2017-06-KICE-NA-Q25 | 68.6% | 로그 합의 곱셈법칙 |
| 12 | 2019-04-EDUCATION_OFFICE-NA-Q26 | 69.0% | 무한대 극한과 제거가능 극한 |
| 13 | 2016-04-EDUCATION_OFFICE-GA-Q25 | 69.3% | 로그형 정적분과 매개변수 복원 |
| 14 | 2016-09-KICE-NA-Q23 | 69.3% | 다항함수 정적분 계산 |
| 15 | 2017-04-EDUCATION_OFFICE-GA-Q24 | 70.7% | 매개변수 곡선의 미분계수 |
| 16 | 2018-09-KICE-GA-Q26 | 70.9% | 합성함수 접선과 미분계수 극한 |
| 17 | 2017-07-EDUCATION_OFFICE-GA-Q25 | 71.0% | 지수함수 합성의 연쇄법칙 |
| 18 | 2016-09-KICE-GA-Q24 | 80.1% | 두 색 공의 비복원 동시추출 확률 |
| 19 | 2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q16 | 70.1% 이상 | 이차함수 도함수와 계수 복원 |
| 20 | 2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17 | 70.1% 이상 | 삼각함수 합의 제곱 항등식 |
| 21 | 2016-06-KICE-NA-Q22 | 70.5% 이상 | 순열 값 계산 |
| 22 | 2016-06-KICE-NA-Q23 | 70.5% 이상 | 삼차함수 도함숫값 |
| 23 | 2017-04-EDUCATION_OFFICE-GA-Q22 | 70.7% 이상 | 중복순열 값 계산 |
| 24 | 2017-04-EDUCATION_OFFICE-GA-Q23 | 70.7% 이상 | 음의 거듭제곱함수 도함숫값 |
| 25 | 2017-06-KICE-NA-Q22 | 71.3% 이상 | 조합 값 계산 |

## 계약 검수에서 발견한 오류

### 시각자료 계약 2건

| 원문 ID | 기존 계약 | 원문에 맞는 교정 후보 |
|---|---|---|
| 2020-07-EDUCATION_OFFICE-GA-Q25 | GRAPH | 원문은 좌표식만 있으므로 NONE |
| 2018-09-KICE-GA-Q26 | GRAPH | 접선 조건은 문장으로만 주어지므로 NONE |

두 문항 모두 그래프를 새로 그려 설명 자료로 제공할 수는 있지만, 원문 구조를 정의하는 필수 시각자료는 아니다.

### 수학 유형 계약 8건

| 원문 ID | 기존 유형 | 원문에 맞는 교정 후보 |
|---|---|---|
| 2020-09-KICE-GA-Q27 | ALG-SEQUENCE-RECURRENCE | ALG-SEQUENCE-SUM |
| 2018-07-EDUCATION_OFFICE-NA-Q25 | ALG-SEQUENCE-RECURRENCE | ALG-SEQUENCE-SUM |
| 2018-09-KICE-NA-Q26 | ALG-SEQUENCE-RECURRENCE | ALG-SEQUENCE-SUM |
| 2020-07-EDUCATION_OFFICE-GA-Q25 | ALG-TRIG-GRAPH | C1-VELOCITY-DISTANCE |
| 2016-04-EDUCATION_OFFICE-GA-Q25 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2016-09-KICE-NA-Q23 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2017-07-EDUCATION_OFFICE-GA-Q25 | ALG-EXP-LOG-EQUATION | C1-DERIVATIVE |
| 2016-09-KICE-GA-Q24 | PS-COUNTING | PS-PROBABILITY-AXIOMS |

2016-09-KICE-NA-Q26과 2016-09-KICE-GA-Q24는 원문 조건과 목표가 같은 공 추출 확률 문항인데 서로 다른 유형으로 분류돼 있었다. 교정 단계에서는 두 문항을 같은 확률 구조로 통합할 수 있는지 참조 전체를 함께 검토한다.

### 목표값 계약 5건

| 원문 ID | 기존 목표 | 실제 요청 목표 |
|---|---|---|
| 2025-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | EXTREMUM | 유한 SUM |
| 2020-09-KICE-GA-Q27 | INTEGER_PARAMETER | SEQUENCE_TERM |
| 2016-09-KICE-NA-Q26 | PROBABILITY | REDUCED_RATIONAL_COMPONENT_SUM |
| 2018-09-KICE-GA-Q26 | LIMIT_VALUE | SCALED_SQUARED_PARAMETER |
| 2016-09-KICE-GA-Q24 | PROBABILITY | REDUCED_RATIONAL_COMPONENT_SUM |

기존 계약 파일과 운영 코드는 수정하지 않고 전사 데이터에 교정 필요 상태만 기록했다.

## 기계 검증

| 검증 항목 | 결과 |
|---|---:|
| JSON 파싱 | 통과 |
| 레코드 수 | 25 |
| 고유 원문 ID | 25 |
| 이전 150개와 중복 | 0 |
| 자동 정렬상 정확한 다음 25개 | 통과 |
| 원본 크롭 존재 | 25/25 |
| 이전 계약 상태 FORMULA_TRANSCRIPTION_REQUIRED | 25/25 |
| 정규 구조 ID 일치 | 25/25 |
| 정답률·하한 원장 일치 | 25/25 |
| 정확한 정답률 오름차순 | 통과 |
| 검열 하한 오름차순 | 통과 |
| TeX 수식 필드 | 83 |
| TeX 중괄호 균형 | 83/83 |
| 시각자료 계약 교정 | 2 |
| 수학 유형 계약 교정 | 8 |
| 목표값 계약 교정 | 5 |
| 원문 맥락 보강 | 0 |
| 검열 정답률 하한 기록 | 7 |

검증 당시 전사 JSON의 SHA-256은 `66b95d3e7b7676c1bc2fab53edc294651e963301bed8d7d886d9c3f7dd6f1f94`이다.

## 현재 진척도

| 구분 | 완료 | 남음 |
|---|---:|---:|
| 6-B 수식 전사 | 175 | 25 |
| 6-B 전사 묶음 | 7 | 1 |
| 실제 격리 생성기 구현 | 32 | 540 |
| 별도 수동 공식 검토 | 0 | 340 |

수식 전사 175개는 구현 완료가 아니다. 실제 생성기 구현·독립 풀이 검증·브라우저 렌더링이 끝난 구조는 계속 32개다. 남은 25개를 전사한 다음에는 생성기 구현보다 먼저 전체 오류 교정과 canonical ID 이관을 수행한다.

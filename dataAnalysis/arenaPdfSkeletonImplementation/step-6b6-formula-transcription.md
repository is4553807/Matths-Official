# 6-B-6단계 - 다음 저정답률 25개 수식·조건 전사

## 결론

- 6-B-1부터 6-B-5 다음으로 정답률이 낮은 FORMULA_TRANSCRIPTION_REQUIRED 구조 25개를 원본 크롭에서 직접 판독했다.
- 정답률 범위는 48.3%~62.6%이며 T6 3개, T5 18개, T4 4개다.
- 결과는 GOAT Arena 1대1 전용 격리 데이터이며 운영 출제 코드에는 연결하지 않았다.
- 생성기 구현과 브라우저 렌더링은 아직 수행하지 않았다.

구조화 결과는 formula-transcriptions-batch-6b6.json에 저장했다.

## 전사한 25개

| 순번 | 원문 ID | 정답률 | 핵심 구조 |
|---:|---|---:|---|
| 1 | 2017-04-EDUCATION_OFFICE-GA-Q28 | 48.3% | 색·숫자 중복공의 제한 배치 |
| 2 | 2016-03-EDUCATION_OFFICE-NA-Q23 | 48.6% | 부분합 차분으로 일반항 계산 |
| 3 | 2020-10-EDUCATION_OFFICE-NA-Q25 | 49.6% | 유한등비합 곱의 함수값 비 |
| 4 | 2016-10-EDUCATION_OFFICE-NA-Q25 | 50.6% | 상호 역수 로그와 매개변수 곱 |
| 5 | 2017-09-KICE-GA-Q26 | 50.6% | 모평균 신뢰구간과 변동계수 |
| 6 | 2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 51.9% | 일차·이차 모멘트로 합 계산 |
| 7 | 2022-06-KICE-PROBABILITY_STATISTICS-Q19 | 52.1% | 사차함수의 극소점과 계수 |
| 8 | 2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | 52.2% | 적분방정식과 도함수 적분 |
| 9 | 2026-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 53.3% | 코사인법칙과 변의 제곱 |
| 10 | 2023-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17 | 54.2% | 직선과 사차곡선의 접선 조건 |
| 11 | 2020-06-KICE-GA-Q24 | 54.5% | 주기 점화수열의 절댓값 개수 |
| 12 | 2019-04-EDUCATION_OFFICE-NA-Q27 | 55.0% | 등비중항과 서로 다른 밑의 로그 |
| 13 | 2018-10-EDUCATION_OFFICE-NA-Q25 | 55.6% | 적분으로 정의된 다항함수 |
| 14 | 2017-03-EDUCATION_OFFICE-GA-Q23 | 55.7% | 사인함수의 기본 극한 |
| 15 | 2016-07-EDUCATION_OFFICE-NA-Q24 | 57.3% | 로그 비와 역수 로그 |
| 16 | 2017-07-EDUCATION_OFFICE-GA-Q27 | 58.0% | 미지 상수를 포함한 적분함수 |
| 17 | 2016-10-EDUCATION_OFFICE-GA-Q26 | 58.5% | 꽃 종류별 재고 제한 선택 |
| 18 | 2018-04-EDUCATION_OFFICE-NA-Q26 | 59.0% | 조각함수 합성과 분기 검증 |
| 19 | 2018-09-KICE-GA-Q25 | 59.0% | 코사인 세제곱 정적분 |
| 20 | 2019-03-EDUCATION_OFFICE-NA-Q25 | 59.0% | 피보나치형 점화식 역추적 |
| 21 | 2022-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 59.1% | 평행이동된 제곱합의 차 |
| 22 | 2020-10-EDUCATION_OFFICE-GA-Q24 | 60.7% | 보각·여각 삼각함수식 |
| 23 | 2017-07-EDUCATION_OFFICE-NA-Q25 | 60.9% | 적분함수의 미분계수 극한 |
| 24 | 2021-09-KICE-PROBABILITY_STATISTICS-Q18 | 61.0% | 두 수열 합의 연립방정식 |
| 25 | 2019-04-EDUCATION_OFFICE-NA-Q25 | 62.6% | 자연수 합과 주어진 수열 합 |

## 계약 검수에서 발견한 오류

### 수학 유형 계약 5건

| 원문 ID | 기존 유형 | 원문에 맞는 교정 후보 |
|---|---|---|
| 2017-09-KICE-GA-Q26 | ALG-EXP-LOG-EQUATION | PS-NORMAL-SAMPLE |
| 2022-06-KICE-PROBABILITY_STATISTICS-Q19 | FUNCTION-GRAPH-CONDITION | C1-TANGENT-EXTREMA |
| 2018-10-EDUCATION_OFFICE-NA-Q25 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2018-09-KICE-GA-Q25 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2017-07-EDUCATION_OFFICE-NA-Q25 | ALG-EXP-LOG-EQUATION | C1-DERIVATIVE |

### 목표값 계약 5건

| 원문 ID | 기존 목표 | 실제 요청 목표 |
|---|---|---|
| 2022-06-KICE-PROBABILITY_STATISTICS-Q19 | EXTREMUM | 계수의 합 a+b |
| 2026-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | EXTREMUM | SQUARED_LENGTH |
| 2019-03-EDUCATION_OFFICE-NA-Q25 | INTEGER_PARAMETER | SEQUENCE_TERM |
| 2022-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | DISTANCE_OR_LENGTH | SCALAR_VALUE |
| 2020-10-EDUCATION_OFFICE-GA-Q24 | INTEGER_PARAMETER | SCALAR_VALUE |

### 시각자료 계약

이번 묶음에서는 시각자료 계약 교정이 필요하지 않았다. 2017-04-EDUCATION_OFFICE-GA-Q28의 사물함과 공 그림, 2016-10-EDUCATION_OFFICE-GA-Q26의 꽃병 그림은 설명용이며 전사한 조건만으로 문제를 정의할 수 있다.

### 공식 해설 교차확인

2019-04-EDUCATION_OFFICE-NA-Q27은 작은 로그 밑이 이미지에서 혼동될 수 있어 공식 해설을 추가 확인했다. 정확한 조건은 첫 로그가 log base a of 3b이고 두 번째 로그가 log base 3 of b이다. 이를 전사 데이터에 명시했다.

기존 계약 파일과 운영 코드는 수정하지 않고 전사 데이터에 교정 필요 상태만 기록했다.

## 기계 검증

| 검증 항목 | 결과 |
|---|---:|
| JSON 파싱 | 통과 |
| 레코드 수 | 25 |
| 고유 원문 ID | 25 |
| 이전 125개와 중복 | 0 |
| 자동 정렬상 정확한 다음 25개 | 통과 |
| 원본 크롭 존재 | 25/25 |
| 이전 계약 상태 FORMULA_TRANSCRIPTION_REQUIRED | 25/25 |
| 정규 구조 ID 일치 | 25/25 |
| 정답률 원장 일치 | 25/25 |
| 정답률 오름차순 | 통과 |
| TeX 수식 필드 | 79 |
| TeX 중괄호 균형 | 79/79 |
| 시각자료 계약 교정 | 0 |
| 수학 유형 계약 교정 | 5 |
| 목표값 계약 교정 | 5 |
| 원문 맥락 보강 | 0 |

검증 당시 전사 JSON의 SHA-256은 6421fe710570b278955f368bdde9374b86897e679d3c682b324474620ab37ad8이다.

## 현재 진척도

| 구분 | 완료 | 남음 |
|---|---:|---:|
| 6-B 수식 전사 | 150 | 50 |
| 6-B 전사 묶음 | 6 | 2 |
| 실제 격리 생성기 구현 | 32 | 540 |
| 별도 수동 공식 검토 | 0 | 340 |

수식 전사 150개는 구현 완료가 아니다. 실제 생성기 구현·독립 풀이 검증·브라우저 렌더링이 끝난 구조는 계속 32개다.

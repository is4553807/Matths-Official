# 6-B-5단계 - 다음 저정답률 25개 수식·조건 전사

## 결론

- 6-B-1부터 6-B-4 다음으로 정답률이 낮은 FORMULA_TRANSCRIPTION_REQUIRED 구조 25개를 원본 크롭에서 직접 판독했다.
- 정답률 범위는 37.8%~48.0%이며 T7 7개, T6 18개다.
- 결과는 GOAT Arena 1대1 전용 격리 데이터이며 운영 출제 코드에는 연결하지 않았다.
- 생성기 구현과 브라우저 렌더링은 아직 수행하지 않았다.

구조화 결과는 formula-transcriptions-batch-6b5.json에 저장했다.

## 전사한 25개

| 순번 | 원문 ID | 정답률 | 핵심 구조 |
|---:|---|---:|---|
| 1 | 2019-09-KICE-NA-Q27 | 37.8% | 삼차곡선과 직선의 이중교점 매개변수 |
| 2 | 2017-10-EDUCATION_OFFICE-GA-Q26 | 38.5% | 순서 제약이 있는 일대일 함수 |
| 3 | 2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17 | 38.6% | 절댓값 포함 정적분 계산 |
| 4 | 2018-04-EDUCATION_OFFICE-GA-Q27 | 39.1% | 로그 치환 적분함수의 최댓값 합 |
| 5 | 2019-07-EDUCATION_OFFICE-NA-Q26 | 39.2% | 중근 조건 수열과 등비합 |
| 6 | 2024-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 39.7% | 적분 항등식으로 정한 이차함수 |
| 7 | 2023-06-KICE-PROBABILITY_STATISTICS-Q19 | 39.9% | 사인함수 비음성·영점 개수 |
| 8 | 2017-07-EDUCATION_OFFICE-GA-Q26 | 40.9% | 서로 다른 물건의 전사 분배 |
| 9 | 2020-06-KICE-NA-Q24 | 41.3% | 삼차함수 접선의 절편 |
| 10 | 2019-10-EDUCATION_OFFICE-GA-Q28 | 41.4% | 라벨 삼각조각 타일링 개수 |
| 11 | 2018-03-EDUCATION_OFFICE-GA-Q24 | 42.3% | 자연수 분할과 집합 분할 |
| 12 | 2016-06-KICE-NA-Q27 | 44.1% | 두 상자의 조건부확률 |
| 13 | 2018-03-EDUCATION_OFFICE-GA-Q27 | 44.2% | 적분방정식과 함수값 곱 |
| 14 | 2017-04-EDUCATION_OFFICE-NA-Q26 | 45.1% | 조각함수의 일대일 조건 |
| 15 | 2016-03-EDUCATION_OFFICE-NA-Q29 | 46.2% | 부분집합 합 조건과 차집합 원소 곱 |
| 16 | 2020-06-KICE-NA-Q26 | 46.2% | 평균변화율과 순간변화율 |
| 17 | 2018-03-EDUCATION_OFFICE-NA-Q24 | 47.0% | 부분합 극한과 일반항 극한 |
| 18 | 2018-04-EDUCATION_OFFICE-GA-Q24 | 47.0% | 사인곡선 위 정수 높이 점 개수 |
| 19 | 2018-09-KICE-GA-Q28 | 47.0% | 비음이 아닌 순서쌍의 합사건 확률 |
| 20 | 2019-04-EDUCATION_OFFICE-GA-Q27 | 47.7% | 역함수 미분과 정적분 치환 |
| 21 | 2023-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | 47.8% | 이차방정식 두 근과 유한합 |
| 22 | 2016-10-EDUCATION_OFFICE-GA-Q28 | 47.9% | 직각삼각형 내 접원과 삼각함수 극한 |
| 23 | 2024-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | 47.9% | 사인·코사인 교점 삼각형 넓이 |
| 24 | 2019-10-EDUCATION_OFFICE-NA-Q23 | 48.0% | 상용로그와 밑변환 |
| 25 | 2021-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | 48.0% | 부분합을 포함한 수열 점화식 |

## 계약 검수에서 발견한 오류

### 시각자료 계약 1건

2018-04-EDUCATION_OFFICE-GA-Q24는 기존 계약이 GRAPH지만 원문에는 그래프가 없고 사인식과 구간만 제시된다. NONE 또는 선택적 생성 그래프로 교정 검토가 필요하다.

그 밖에 2019-10-EDUCATION_OFFICE-GA-Q28과 2016-10-EDUCATION_OFFICE-GA-Q28은 원문 그림이 배치와 접선 구조를 결정하므로 도형 렌더가 필수다. 2024-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19의 그래프와 2017-07-EDUCATION_OFFICE-GA-Q26의 가방 그림은 설명용이라 수식과 조건만으로도 문제를 정의할 수 있다.

### 수학 유형 계약 9건

| 원문 ID | 기존 유형 | 원문에 맞는 교정 후보 |
|---|---|---|
| 2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2018-04-EDUCATION_OFFICE-GA-Q27 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2024-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2023-06-KICE-PROBABILITY_STATISTICS-Q19 | C1-TANGENT-EXTREMA | ALG-TRIG-GRAPH |
| 2018-03-EDUCATION_OFFICE-GA-Q24 | CM2-SETS-PROPOSITIONS | PS-COUNTING |
| 2018-03-EDUCATION_OFFICE-GA-Q27 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |
| 2016-03-EDUCATION_OFFICE-NA-Q29 | C1-TANGENT-EXTREMA | CM2-SETS-PROPOSITIONS |
| 2020-06-KICE-NA-Q26 | ALG-EXP-LOG-EQUATION | C1-DERIVATIVE |
| 2019-04-EDUCATION_OFFICE-GA-Q27 | C1-INTEGRAL-AREA | C1-INTEGRAL-DEFINED |

### 목표값 계약 5건

| 원문 ID | 기존 목표 | 실제 요청 목표 |
|---|---|---|
| 2018-04-EDUCATION_OFFICE-GA-Q27 | EXTREMUM | 12개 최댓값의 SUM |
| 2019-07-EDUCATION_OFFICE-NA-Q26 | INTEGER_PARAMETER | 수열의 유한 SUM |
| 2018-03-EDUCATION_OFFICE-GA-Q24 | EXTREMUM | 두 분할 수의 SUM |
| 2016-03-EDUCATION_OFFICE-NA-Q29 | SUM | 차집합 원소의 PRODUCT |
| 2021-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | INTEGER_PARAMETER | PARTIAL_SUM_VALUE |

### 원문 맥락 보강 1건

2018-03-EDUCATION_OFFICE-GA-Q24는 문제지에서 P(n,r), S(n,r)의 정의를 다시 쓰지 않고 표준 분할 기호를 사용한다. 원문만 복제하면 생성 문항이 자립하지 못하므로 공식 해설을 추가 확인해 자연수 분할 수와 집합 분할 수의 정의를 전사 데이터에 명시했다.

기존 계약 파일과 운영 코드는 수정하지 않고 전사 데이터에 교정 필요 상태만 기록했다.

## 기계 검증

| 검증 항목 | 결과 |
|---|---:|
| JSON 파싱 | 통과 |
| 레코드 수 | 25 |
| 고유 원문 ID | 25 |
| 이전 100개와 중복 | 0 |
| 자동 정렬상 정확한 다음 25개 | 통과 |
| 원본 크롭 존재 | 25/25 |
| 이전 계약 상태 FORMULA_TRANSCRIPTION_REQUIRED | 25/25 |
| 정규 구조 ID 일치 | 25/25 |
| 정답률 원장 일치 | 25/25 |
| 정답률 오름차순 | 통과 |
| TeX 수식 필드 | 107 |
| TeX 중괄호 균형 | 107/107 |
| 시각자료 계약 교정 | 1 |
| 수학 유형 계약 교정 | 9 |
| 목표값 계약 교정 | 5 |
| 원문 맥락 보강 | 1 |

검증 당시 전사 JSON의 SHA-256은 7d9d3189f84b241a211389109fc600750c939e5e224b6fc405ad8a392f38b643이다.

## 현재 진척도

| 구분 | 완료 | 남음 |
|---|---:|---:|
| 6-B 수식 전사 | 125 | 75 |
| 6-B 전사 묶음 | 5 | 3 |
| 실제 격리 생성기 구현 | 32 | 540 |
| 별도 수동 공식 검토 | 0 | 340 |

수식 전사 125개는 구현 완료가 아니다. 실제 생성기 구현·독립 풀이 검증·브라우저 렌더링이 끝난 구조는 계속 32개다.

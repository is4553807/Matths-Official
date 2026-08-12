# 6-B-3단계 - 다음 저정답률 25개 수식·조건 전사

## 결론

- 6-B-1과 6-B-2 다음으로 정답률이 낮은 FORMULA_TRANSCRIPTION_REQUIRED 구조 25개를 원본 크롭에서 직접 판독했다.
- 정답률 범위는 13.4%~21.8%이며 T9 7개, T8 18개다.
- 결과는 GOAT Arena 1대1 전용 격리 데이터이며 운영 출제 코드에는 연결하지 않았다.
- 생성기 구현과 브라우저 렌더링은 아직 수행하지 않았다.

구조화 결과는 formula-transcriptions-batch-6b3.json에 저장했다.

## 전사한 25개

| 순번 | 원문 ID | 정답률 | 핵심 구조 |
|---:|---|---:|---|
| 1 | 2021-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29 | 13.4% | 중복 카드 조건부확률 |
| 2 | 2022-06-KICE-PROBABILITY_STATISTICS-Q29 | 13.6% | 합성값 조건 함수 개수 |
| 3 | 2018-04-EDUCATION_OFFICE-GA-Q29 | 13.8% | 함수값 합의 합동식 |
| 4 | 2023-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20 | 13.8% | 적분방정식 다항함수 |
| 5 | 2025-06-KICE-CALCULUS-Q29 | 14.4% | 주기수열·등비급수 |
| 6 | 2018-09-KICE-NA-Q29 | 14.7% | 계단 경로와 대각선 교점 |
| 7 | 2016-10-EDUCATION_OFFICE-NA-Q28 | 14.8% | 제한 중복분배 |
| 8 | 2018-06-KICE-GA-Q28 | 15.0% | 순서쌍 조건부확률 |
| 9 | 2024-09-KICE-PROBABILITY_STATISTICS-Q22 | 15.6% | 이중 분기 점화식 |
| 10 | 2021-03-EDUCATION_OFFICE-CALCULUS-Q30 | 15.7% | 삼차함수 극대점 점근 |
| 11 | 2016-03-EDUCATION_OFFICE-NA-Q30 | 15.8% | 유리수열 부분합 최댓값 |
| 12 | 2019-07-EDUCATION_OFFICE-NA-Q28 | 16.0% | 약수 순서 보존 전단사 |
| 13 | 2024-10-EDUCATION_OFFICE-CALCULUS-Q29 | 16.1% | 지수곡선 교점 음함수 미분 |
| 14 | 2016-03-EDUCATION_OFFICE-NA-Q26 | 16.2% | 곡선·직선 교점 무게중심 |
| 15 | 2022-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29 | 16.4% | 상한 조건 단조 함수 |
| 16 | 2017-10-EDUCATION_OFFICE-NA-Q29 | 17.4% | 좌표 무게중심 점화식 |
| 17 | 2025-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20 | 19.3% | 사인·코사인 공통값 |
| 18 | 2020-10-EDUCATION_OFFICE-GA-Q29 | 20.1% | 자연수 삼각형 개수 |
| 19 | 2019-10-EDUCATION_OFFICE-NA-Q26 | 20.2% | 색상별 중복조합 |
| 20 | 2020-06-KICE-GA-Q27 | 21.2% | 번호 충돌 조건부확률 |
| 21 | 2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21 | 21.2% | 부분합·절댓값 차 수열 |
| 22 | 2026-03-EDUCATION_OFFICE-CALCULUS-Q29 | 21.3% | 사각형 좌표기하 점근 |
| 23 | 2019-04-EDUCATION_OFFICE-GA-Q29 | 21.5% | 두 원의 접선 사이각 |
| 24 | 2020-05-EDUCATION_OFFICE-NA-Q26 | 21.6% | 속도의 절댓값 적분 |
| 25 | 2016-03-EDUCATION_OFFICE-GA-Q28 | 21.8% | 로지스틱형 함수 대칭 |

## 계약 검수에서 발견한 오류

### 시각자료 과분류

2017-10-EDUCATION_OFFICE-NA-Q29는 기존 계약이 GRAPH지만 원문에는 그래프가 없고 좌표와 무게중심 관계만으로 완전히 정의된다. 생성 전에 NONE 또는 선택적 좌표도식으로 교정 검토가 필요하다.

### 수학 유형 오분류

2020-05-EDUCATION_OFFICE-NA-Q26는 현재 C1-INTEGRAL-AREA로 분류됐지만 실제 구조는 속도 함수의 부호가 바뀌는 시점을 기준으로 절댓값을 적분하는 이동거리 문제다. C1-VELOCITY-DISTANCE로 교정해야 한다.

기존 계약 파일과 운영 코드는 수정하지 않고 전사 데이터에 교정 필요 상태만 기록했다.

## 기계 검증

| 검증 항목 | 결과 |
|---|---:|
| JSON 파싱 | 통과 |
| 레코드 수 | 25 |
| 고유 원문 ID | 25 |
| 이전 50개와 중복 | 0 |
| 자동 정렬상 정확한 다음 25개 | 통과 |
| 원본 크롭 존재 | 25/25 |
| 정규 구조 ID 일치 | 25/25 |
| 정답률 원장 일치 | 25/25 |
| 정답률 오름차순 | 통과 |
| TeX 수식 필드 | 122 |
| TeX 중괄호 균형 | 122/122 |
| 시각자료 계약 교정 | 1 |
| 수학 유형 계약 교정 | 1 |

검증 당시 전사 JSON의 SHA-256은 959ccb560897fbfbf193f908080591b6cf907fbeb2baffcd5297c34c48fbe151이다.

## 현재 진척도

| 구분 | 완료 | 남음 |
|---|---:|---:|
| 6-B 수식 전사 | 75 | 125 |
| 6-B 전사 묶음 | 3 | 5 |
| 실제 격리 생성기 구현 | 32 | 540 |
| 별도 수동 공식 검토 | 0 | 340 |

수식 전사 75개는 구현 완료가 아니다. 실제 생성기 구현·독립 풀이 검증·브라우저 렌더링이 끝난 구조는 계속 32개다.

# 6-B-1단계 — 최저 정답률 25개 수식·조건 전사

## 결론

- `FORMULA_TRANSCRIPTION_REQUIRED` 200개 중 정답률이 가장 낮은 25개를 원본 문제 크롭에서 직접 판독했다.
- 25개 모두 **GOAT Arena 1대1 전용 후보**이며 운영 출제 코드에는 연결하지 않았다.
- 정답률 범위는 **1.9%~6.2%**이고, 기존 정답률 정책상 25개 모두 `T9 / KILLER`다.
- 문제 전문을 복제하지 않고 생성기 설계에 필요한 수식, 조건, 요구값, 독립 풀이 전략만 구조화했다.
- 이번 단계는 전사 완료 단계다. 숫자 변형 생성기 구현 및 렌더링은 아직 하지 않았다.

구조화 결과는 `formula-transcriptions-batch-6b1.json`에 저장했다.

## 전사한 25개

| 순번 | 원문 ID | 정답률 | 유형 | 요구값 |
|---:|---|---:|---|---|
| 1 | `2018-06-KICE-NA-Q30` | 1.9% | 함수 조건 역추론 | 함수값 |
| 2 | `2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30` | 2.5% | 함수 개수 | 개수 |
| 3 | `2018-10-EDUCATION_OFFICE-NA-Q30` | 2.6% | 접선·근 개수 | 함수값 |
| 4 | `2026-07-EDUCATION_OFFICE-CALCULUS-Q30` | 2.6% | 음함수·역함수 | 기약분수 성분합 |
| 5 | `2025-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22` | 2.7% | 분기 점화식 | 기약분수 성분합 |
| 6 | `2017-09-KICE-NA-Q30` | 2.8% | 함수 넓이 최적화 | 상수식 |
| 7 | `2020-09-KICE-NA-Q30` | 2.9% | 절댓값 미분가능성 | 비율 |
| 8 | `2023-06-KICE-PROBABILITY_STATISTICS-Q22` | 2.9% | 평균변화율 부호 | 도함숫값 |
| 9 | `2018-03-EDUCATION_OFFICE-NA-Q30` | 3.4% | 유리함수 부등식 수열 | 합 |
| 10 | `2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29` | 3.6% | 단조 함수 개수 | 개수 |
| 11 | `2019-09-KICE-GA-Q30` | 3.9% | 합성형 도함수 조건 | 함수값 |
| 12 | `2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30` | 3.9% | 조건부확률 | 기약분수 성분합 |
| 13 | `2022-09-KICE-PROBABILITY_STATISTICS-Q30` | 4.0% | 함수상·합성함수상 | 개수 |
| 14 | `2017-10-EDUCATION_OFFICE-NA-Q30` | 4.2% | 조각함수 미분가능성 | 합 |
| 15 | `2024-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30` | 4.2% | 2-순환 함수 | 개수 |
| 16 | `2025-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30` | 4.7% | 복합 추출 조건부확률 | 기약분수 성분합 |
| 17 | `2024-06-KICE-PROBABILITY_STATISTICS-Q30` | 4.8% | 단조 함수 제한 | 개수 |
| 18 | `2019-04-EDUCATION_OFFICE-NA-Q30` | 5.0% | 유리함수·직선 영역 | 최댓값 |
| 19 | `2022-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21` | 5.0% | 정수 등차수열 | 공차의 합 |
| 20 | `2019-06-KICE-NA-Q30` | 5.5% | 교점 개수 역추론 | 합성함숫값 |
| 21 | `2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22` | 5.5% | 적분 정의·절댓값 | 정적분값 |
| 22 | `2026-06-KICE-PROBABILITY_STATISTICS-Q22` | 5.5% | 인덱스 점화식 | 개수 |
| 23 | `2020-07-EDUCATION_OFFICE-NA-Q28` | 5.6% | 주기함수 적분 최적화 | 정적분값 |
| 24 | `2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22` | 5.7% | 절댓값 조각함수 | 함수값 |
| 25 | `2017-09-KICE-GA-Q30` | 6.2% | 접점·구간 최댓값 | 도함숫값 |

## 원문 대조에서 발견한 계약 오류

`2017-09-KICE-NA-Q30`은 기존 정규 구조 ID가 `...-NONE-...`으로 되어 있지만, 실제 핵심은 다음 두 함수의 그래프 포함 관계와 넓이 최적화다.

- 포물선형 조각함수 `g`
- 꺾은선 사다리꼴형 조각함수 `h`

따라서 이 구조는 생성기 구현 전에 시각자료 계약을 `GRAPH`로 교정해야 한다. 지금은 기존 계약 파일을 수정하지 않고 전사 데이터에 `VISUAL_CONTRACT_CORRECTION_REQUIRED`로만 기록했다.

## 기계 검증

| 검증 항목 | 결과 |
|---|---:|
| JSON 파싱 | 통과 |
| 레코드 수 | 25 |
| 고유 원문 ID | 25 |
| 원본 크롭 존재 | 25/25 |
| 정규 구조 ID 일치 | 25/25 |
| 이전 계약 상태 `FORMULA_TRANSCRIPTION_REQUIRED` | 25/25 |
| 정답률 원장 일치 | 25/25 |
| 문제 번호·크롭 대응 | 25/25 |
| 정답률 오름차순 | 통과 |
| TeX 수식 필드 | 121 |
| TeX 중괄호 균형 | 121/121 |

검증 당시 전사 JSON의 SHA-256은 `8f8c5e6f5de29e39f847ff298fe17bab39e2441627fed87ef58fc04790018c21`이다.

## 현재 정확한 진척도

| 구분 | 구조 수 |
|---|---:|
| 실제 격리 생성기 구현·검증 완료 | 32 |
| 6-B-1 수식 전사 완료, 생성기 미구현 | 25 |
| 남은 `FORMULA_TRANSCRIPTION_REQUIRED` | 175 |
| 남은 `MANUAL_FORMULA_REVIEW_REQUIRED` | 340 |
| 전체 미구현 구조 | 540 |

전사 25개가 추가됐다고 해서 구현 완료 구조가 57개가 된 것은 아니다. 실제 생성기는 계속 32개다.

## 다음 작업

6-B-2에서는 다음으로 정답률이 낮은 25개를 같은 방식으로 전사한다. 6-B의 200개 전사가 끝난 뒤, 풀이 계약이 안정적인 구조부터 생성기 구현 묶음으로 넘긴다.

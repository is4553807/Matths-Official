# PDF 스켈레톤 구현 3단계 - canonical structure 확정

- 배정 문항: 629개
- canonical structure: 572개
- 독립 solver group: 569개
- 문제 PDF·대표 캡처 기준 교과·계열 보정: 101개
- 그중 2021년 이후 선택과목 29·30번: 75개
- 문제 PDF 기준 목표값·조건·연산·분기·시각자료 재분해: 619개
- 그중 2021년 이후 선택과목 29·30번: 124개
- 6-B 전사 감사 교정 반영: 41개 문항
- 교정 플래그: {'CONTEXT': 1, 'FAMILY': 25, 'TARGET': 15, 'VISUAL': 9}
- 6-B-10 전사 계약 재연결: 200개 문항
- 캡처 전사 기준 목표값 정밀화: 91개 문항
- 2개 이상 문항을 공유하는 구조: 28개
- 단독 구조: 544개
- 수식 텍스트 손실로 자동 병합 금지: 200개
- 상위 12개 파일럿 대표 화면 검토: 12개
- 3단계 콘텐츠 해시: `662ac239778e9d7c8ad212fc4400f93596ca02c6a1c3216afff5fdc95a68fa68`

## 동일 구조 판정 계약

2021년 이후 선택과목 29·30번은 해설의 중복 번호를 신뢰하지 않고 문제 PDF 본문과 과목 형식으로 교과·계열을 다시 판정한다. 전체 문항도 문제 PDF 본문으로 목표값·조건·연산·분기·시각자료를 다시 분해한다. 교과 계열, 알고리즘 변형, 목표값, 분기 깊이, 조건 위상과 핵심 연산 조합이 모두 같은 문항만 solver group을 공유한다. 실제 문제에 필요한 시각자료 계약이 다르면 같은 solver라도 structureId를 분리한다. 수식 텍스트가 빠져 포괄 라벨이나 계열 fallback만 남은 문항은 자동 병합하지 않고 source별 독립 solver로 둔다.

## 구조 규모

| 구조당 문항 수 | 구조 수 |
|---|---:|
| 1 | 544 |
| 2-3 | 21 |
| 4-7 | 6 |
| 8+ | 1 |

## 4단계 우선순위 상위 12개

| 순위 | structureId | 문항 수 | 킬러 | 준킬러 | 대표 문항 |
|---:|---|---:|---:|---:|---|
| 1 | `STR-PSCNT-DISTRIBUTION-PARTITION-COUNT-BM-NONE-AC32573A` | 6 | 2 | 2 | `2020-09-KICE-GA-Q29` |
| 2 | `STR-PSCNT-DISTRIBUTION-PARTITION-COUNT-B1-NONE-28C68A12` | 2 | 2 | 0 | `2024-09-KICE-PROBABILITY_STATISTICS-Q30` |
| 3 | `STR-PSCNT-POSITIVE-INTEGER-SUM-EXCLUSION-COUNT-B0-NONE-4B3D126D` | 5 | 1 | 3 | `2020-10-EDUCATION_OFFICE-NA-Q27` |
| 4 | `STR-PSCNT-INTEGER-SUM-RESIDUE-CONSTRAINT-COUNT-B0-NONE-9E08ACB5` | 3 | 1 | 1 | `2016-04-EDUCATION_OFFICE-GA-Q28` |
| 5 | `STR-PSCNT-CIRCULAR-ADJACENCY-ARRANGEMENT-COUNT-B1-LAYOUT-7142B77A` | 2 | 1 | 1 | `2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29` |
| 6 | `STR-C1TRDER-INVERSE-COMPOSITE-DIFFERENTIATION-SCALAR-VALUE-B0-NONE-22BF5E70` | 2 | 1 | 1 | `2021-07-EDUCATION_OFFICE-CALCULUS-Q29` |
| 7 | `STR-PSCNT-DIGIT-INTEGER-CONSTRUCTION-COUNT-B1-NONE-A70A9C69` | 2 | 1 | 1 | `2016-03-EDUCATION_OFFICE-GA-Q27` |
| 8 | `STR-C1TANEXT-COMMON-OR-MOVING-TANGENT-SCALAR-VALUE-B0-NONE-9FE76009` | 2 | 1 | 0 | `2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19` |
| 9 | `STR-PSAXM-REPEATED-TRIAL-STATE-TRANSITION-PROBABILITY-B0-NONE-D3470457` | 1 | 1 | 0 | `2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30` |
| 10 | `STR-C1TRINT-ABSOLUTE-EXP-LOG-INTEGRAL-EXTREMUM-SCALAR-VALUE-B0-NONE-4579A109` | 1 | 1 | 0 | `2024-07-EDUCATION_OFFICE-CALCULUS-Q30` |
| 11 | `STR-C1INTDEF-INTERVAL-EXTREMA-THRESHOLD-INTEGRAL-INTEGRAL-VALUE-B0-NONE-67DA61E2` | 1 | 1 | 0 | `2020-07-EDUCATION_OFFICE-NA-Q30` |
| 12 | `STR-C1TANEXT-ABSOLUTE-TANGENT-ROOT-RECOVERY-SCALAR-VALUE-B1-NONE-8E3C7A19` | 1 | 1 | 0 | `2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22` |

## 4단계 입력 계약

- 각 structureId마다 매개변수 스키마, 허용 범위, 퇴화 조건과 독립 풀이기 검증 계약을 작성한다.
- 우선순위 상위 12개는 5단계 JS 파일럿 대상으로 유지한다.
- 원문 숫자만 바꾸는 방식이 아니라 동일 solver group의 불변량을 보존해야 한다.
- 문제은행과 1대1 매치 런타임은 아직 변경하지 않는다.

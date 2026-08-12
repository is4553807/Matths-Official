# PDF 스켈레톤 구현 1단계 - 출처 원장 동결

- 원본 PDF SHA-256: `ec4109c3fc5c3dfbdf347564d064570b259833894aa22a0d9b66c7f1831a7893`
- PDF 페이지: 994쪽
- 감사 단답형 문항: 982개
- 구현 대상 동결: 629개
- 원장 콘텐츠 해시: `db084d888aac52be97fabe188c5075f45de301c41880fd3a93e08e51f04f45d5`

## 구현 대상 선정 규칙

다음 조건을 모두 만족한 문항만 2단계 구조 분해 대상으로 동결한다.

1. `status === ACTIVE_REFERENCE`
2. `difficultyClass !== UNRESOLVED`
3. `runtimeDifficultyEligible === true`
4. 2016-2020은 22-30번, 2021-2026은 16-22번과 29-30번 단답형 범위

## 난이도별 구현 대상

| 난이도 | 문항 수 | 구현 파동 |
|---|---:|---|
| 킬러 | 241 | 1차 |
| 준킬러 | 149 | 1차 |
| 상위 일반 | 87 | 2차 |
| 일반 | 92 | 3차 |
| 기초 일반 | 60 | 3차 |

## 과목별 구현 대상

| 과목 | 문항 수 |
|---|---:|
| 대수 | 196 |
| 미적분 I | 192 |
| 확률과 통계 | 210 |
| 공통수학 2 | 30 |
| 공통수학 1 | 1 |

## 이번 단계에서 보류한 문항

- 활성 상태이나 정답률 구간 미확정: 199개
- 교과과정 또는 운영 범위 제외: 126개
- 추가 교과과정 검토 필요: 28개

## 상위 구조 계열

| 계열 ID | 문항 수 |
|---|---:|
| PS-COUNTING | 145 |
| C1-TANGENT-EXTREMA | 45 |
| ALG-TRIG-GRAPH | 44 |
| ALG-EXP-LOG-EQUATION | 36 |
| C1-INTEGRAL-AREA | 36 |
| ALG-SEQUENCE-RECURRENCE | 35 |
| ALG-SEQUENCE-SUM | 35 |
| C1-LIMIT-CONTINUITY | 35 |
| C1-DERIVATIVE | 29 |
| C1-INTEGRAL-DEFINED | 29 |
| ALG-EXP-LOG-GRAPH | 28 |
| PS-CONDITIONAL | 26 |
| ALG-TRIG-GEOMETRY | 18 |
| PS-NORMAL-SAMPLE | 15 |
| PS-RANDOM-VARIABLE | 14 |
| CM2-SETS-PROPOSITIONS | 12 |
| PS-PROBABILITY-AXIOMS | 10 |
| C1-DERIVATIVE-ROOTS | 9 |
| C1-VELOCITY-DISTANCE | 9 |
| FUNCTION-GRAPH-CONDITION | 9 |
| CM2-COMPOSITION-INVERSE | 4 |
| CM2-RATIONAL-RADICAL | 4 |
| CM1-EQUATION-INEQUALITY | 1 |
| CM2-COORDINATE-CIRCLE | 1 |

## 2단계 입력 계약

원장의 모든 문항은 아직 `canonicalStructureId`가 비어 있다. 2단계에서 PDF 문제 화면과 공식 풀이를 함께 검토해 목표값, 조건, 풀이 변환, 경우 분기, 매개변수, 퇴화 조건, 시각자료 요구를 기록한다.


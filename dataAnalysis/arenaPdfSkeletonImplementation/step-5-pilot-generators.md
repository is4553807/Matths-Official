# 5단계 - GOAT Arena PDF 스켈레톤 파일럿 생성기

## 완료 범위

- PDF 대표 문항 12개를 서로 다른 canonical structure 12개로 구현했다.
- 각 유형은 시드 기반 매개변수 생성, 주 검산기, 독립 검산기, 퇴화 조건 거부를 갖는다.
- 모든 정답은 GOAT Arena 단답형 계약인 1~999 자연수다.
- 평가센터와 운영 GOAT Arena 1대1 문제은행에는 연결하지 않았다.

## 구현 위치

- `services/arenaPdfPilotGenerators/core.js`
- `services/arenaPdfPilotGenerators/counting.js`
- `services/arenaPdfPilotGenerators/calculus.js`
- `services/arenaPdfPilotGenerators/discrete.js`
- `services/arenaPdfPilotGenerators/index.js`

운영 출제 모듈인 `assessmentService.js`, `arenaOneOnOneProblemBank.js`,
`arenaTierQuestionCatalogService.js`, `arenaProblemPackService.js`는 이 파일럿을 import하지 않는다.

## 12개 파일럿

| 대표 문항 | 파일럿 구조 |
|---|---|
| 2020-09-KICE-GA-Q29 | 두 색 공의 상자별 최소 수량 분배 |
| 2024-09-KICE-PROBABILITY_STATISTICS-Q30 | 두 색 공의 수령인별 상하한 분배 |
| 2020-10-EDUCATION_OFFICE-NA-Q27 | 양의 정수 순서쌍의 합과 제외값 |
| 2016-04-EDUCATION_OFFICE-GA-Q28 | 고정합 순서쌍의 나머지 개수 |
| 2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29 | 회전동치 원순열의 인접·비인접 조건 |
| 2021-07-EDUCATION_OFFICE-CALCULUS-Q29 | 역함수 합성과 삼각 브리지의 미분가능성 |
| 2016-03-EDUCATION_OFFICE-GA-Q27 | 자릿수 합과 홀짝 조건 |
| 2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19 | 수직이동 삼차곡선의 공통접선 |
| 2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30 | 조건부 종점이 있는 주사위 보행 |
| 2024-07-EDUCATION_OFFICE-CALCULUS-Q30 | 절댓값 지수·로그 적분함수의 극값과 적분 |
| 2020-07-EDUCATION_OFFICE-NA-Q30 | 구간별 극값 임계함수의 적분 |
| 2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22 | 절댓값 삼차함수의 접선·실근 복원 |

## 대량 검산 결과

- 유형당 1,000개, 총 12,000개를 생성했다.
- 주 검산기와 독립 검산기 불일치: 0개
- 1~999 범위 밖 정답: 0개
- 동일 시드 비결정성: 0개
- 12개 계약의 대표 source ID와 canonical structure ID 일치: 통과

기계 검산 결과는 `pilot-verification-v1.json`에 저장했다.

## 렌더링 검증

- 12개 문제 카드를 실제 브라우저에서 모두 렌더링했다.
- MathJax 수식 80개에서 렌더링 오류가 없었다.
- 12개 카드 모두 가로·세로 오버플로, 프롬프트 누락, 정답 표시 누락이 없었다.
- 원순열 문제의 원탁 좌석 도식도 별도 SVG로 렌더링했다.
- 검토용 화면은 `pilot-render-v1.html`에 저장했다.

## 남은 범위

- 조사 문항: 629개
- canonical structure: 572개
- 실제 파일럿 구현 완료: 12개
- 아직 구현하지 않은 canonical structure: 560개

다음 단계에서는 이 12개 방식으로 대량 생성·난도 붕괴 검사를 강화한 뒤,
검산 가능한 구조부터 묶음 단위로 확장한다. 운영 1대1 연결은 별도 7단계에서만 진행한다.

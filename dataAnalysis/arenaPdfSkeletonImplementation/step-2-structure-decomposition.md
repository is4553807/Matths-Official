# PDF 스켈레톤 구현 2단계 - 문항별 구조 분해

- 구조 분해 대상: 629개
- 문제 스크린샷 연결: 629개
- 문제 PDF 텍스트 추출 성공: 567개
- 텍스트층 부분·미추출(캡처/해설 근거 유지): 62개
- 공식 해설 출제의도 연결: 628개
- 공식 해설 출제의도 미연결: 1개 (2016-04 나형 28번 보충 문항)
- 자동 미확정 목표값 스크린샷 수동 확인: 30개
- 2단계 콘텐츠 해시: `04c2496692d0d6f51c41d8ee64fd3d1cd0dee8ef0480e2fe53bb70e8ff23ab6a`

## 이번 단계에서 기록한 구조

각 문항마다 목표값, 조건 형식, 풀이 연산, 경우 분기 축, 매개변수 역할, 시각자료 요구, 구현 위험도와 임시 풀이기 시그니처를 기록했다. 원문 문제와 해설 전문은 복제하지 않고 원본 캡처·PDF 경로와 텍스트 해시만 남겼다.

문제 PDF 텍스트층이 짧거나 비어 있던 문항도 스크린샷은 629개 모두 연결되어 있다. 목표값을 자동 확정하지 못했거나 텍스트층이 완전히 비어 있던 30개는 캡처를 직접 열어 목표값을 확인했고, 그 판단은 `MANUAL_SCREENSHOT_REVIEW`로 분리 기록했다.

## 목표값 분포

| 목표값 유형 | 문항 수 |
|---|---:|
| AREA | 21 |
| COEFFICIENT | 8 |
| COUNT | 139 |
| DISTANCE_OR_LENGTH | 15 |
| EXTREMUM | 49 |
| FUNCTION_VALUE | 3 |
| INTEGER_PARAMETER | 16 |
| INTEGRAL_VALUE | 1 |
| INTERCEPT | 1 |
| LIMIT_VALUE | 31 |
| MAX_MIN_COMBINATION | 9 |
| PROBABILITY | 29 |
| PRODUCT | 7 |
| SCALAR_VALUE | 243 |
| SEQUENCE_TERM | 1 |
| SLOPE | 6 |
| SPEED_OR_ACCELERATION | 5 |
| SUM | 45 |

## 분기 구조

| 분기 유형 | 문항 수 |
|---|---:|
| NESTED_OR_MULTI_AXIS_CASE_SPLIT | 155 |
| NO_EXPLICIT_CASE_SPLIT | 248 |
| SINGLE_AXIS_CASE_SPLIT | 226 |

## 구현 위험도

| 위험도 | 문항 수 |
|---|---:|
| HIGH | 214 |
| LOW | 52 |
| MEDIUM | 363 |

## 3단계로 넘기는 계약

- `solverSignatureDraft`는 자동 구조 신호이며 최종 유형 ID가 아니다.
- 3단계에서 문제 캡처와 공식 풀이를 함께 대조해 동일 독립 풀이기를 공유하는 문항만 묶는다.
- `canonicalStructureId`와 `solverGroupId`는 그 검토가 끝날 때까지 비워 둔다.
- 문제은행과 1대1 매치 런타임은 아직 변경하지 않는다.

# PDF 스켈레톤 구현 6-B-10 - 200개 전사 문항 전수 재검증

- 검증 문항: 200 / 200개
- 수식 필드 완전성: 200개
- TeX 기본 무결성: 200개
- 원문 캡처 존재·연결: 200개
- canonical/solver/contract ID 일치: 200개
- 계열·목표값·시각자료 계약 일치: 200개
- 캡처 전사 기준 목표값 정밀화: 91개
- 배치 canonical ID 갱신: 116개
- 배치 계열 메타데이터 갱신: 25개
- 격리 solver 유지: 200개
- 운영 코드·문제은행 변경: false
- 검증 해시: `d0a69707e66ef90d0a82798d7551ff59c58d346a9cf75add18b1f7f37ad68e1e`

## 추가 발견 및 처리

6-B-9의 명시적 오류 41개를 다시 연결하는 과정에서, OCR 기반 canonical 목표값보다 캡처 전사 목표값이 더 정확한 문항 91개를 추가로 확인했다. `SCALAR_VALUE`, `PROBABILITY`, `COUNT` 같은 넓은 라벨을 분자·분모 합, 배율 적용값, 계수 합, 정적분값 등 실제 답 투영으로 교체했고 이에 따라 최종 ID를 재발급했다.

## 배치별 결과

| 배치 | 문항 | ID 갱신 | 계열 갱신 | 상태 |
|---|---:|---:|---:|---|
| `formula-transcriptions-batch-6b1` | 25 | 8 | 0 | `VERIFIED` |
| `formula-transcriptions-batch-6b2` | 25 | 11 | 0 | `VERIFIED` |
| `formula-transcriptions-batch-6b3` | 25 | 8 | 1 | `VERIFIED` |
| `formula-transcriptions-batch-6b4` | 25 | 18 | 0 | `VERIFIED` |
| `formula-transcriptions-batch-6b5` | 25 | 19 | 9 | `VERIFIED` |
| `formula-transcriptions-batch-6b6` | 25 | 19 | 5 | `VERIFIED` |
| `formula-transcriptions-batch-6b7` | 25 | 19 | 8 | `VERIFIED` |
| `formula-transcriptions-batch-6b8` | 25 | 14 | 2 | `VERIFIED` |

## 6-C 진입 조건

200개 모두 전사·ID·계열·목표값·시각자료 계약 검증을 통과했다. 다음 단계에서는 이 자료를 생성기 입력 계약으로 변환하고, 독립 솔버 검산과 실제 1대1 매치 렌더 규격 검증을 통과한 구조만 구현 가능 상태로 승격한다. 현재 운영 출제 풀에는 아직 연결하지 않는다.

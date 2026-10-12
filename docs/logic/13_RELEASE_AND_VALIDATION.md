# 출시와 검증

## 자동 검증

다음 검증군이 현재 코드의 기본 회귀 경계다.

- `npm run account-plans:verify`
- `npm run active-commerce:verify`
- `npm run arena-v2:verify`
- `npm run arena-v21:verify-scoring`
- `npm run arena-v22:verify-rulebook`
- `npm run arena-normal-baseline:verify`
- `npm run arena-cheating-modes:verify`
- `npm run logic-parity:verify`
- `npm run ui:verify`
- `npm run contrast:verify`

DB 동작은 메모리 replica set 검증으로 트랜잭션, 인덱스, 멱등 정산과 동시 요청을 확인한다. 레이팅 시뮬레이션은 일반전 기준 기록과 경쟁전 단방향 갱신을 각각 실행한다. 현재 서로 다른 문제 세트 비교 시뮬레이션의 45.67% 결과는 허용 가능한 공정성 범위로 채택하며, 이를 맞추기 위한 추가 상수 조정은 하지 않는다.

## 스테이징

프로덕션 전 별도 스테이징 DB에서 Arena 인덱스를 적용하고 쿼리 계획을 확인한다. 실제 Cloudinary/R2 설정으로 풀이 업로드·조회·삭제를 확인하고, KG Inicis와 Apple은 각 공급자 테스트 계약으로 소유권과 재전송을 검증한다.

## 수동 QA

- 데스크톱 Chrome/Safari에서 경기 시작부터 결과·도전장 공유까지 확인
- iPad/iPhone에서 격자 풀이판, 회전, 재연결과 최종화 확인
- 작은 화면에서 규정, 친구, 프로필, 순위 상세 확인
- 경쟁전 검토 보류·소명·확정, 내부 MMR 1회 반영과 공개 점수 1회 반영 확인
- 일반전 감지 경기의 즉시 결과·XP 확정, 기록 풀 보류와 운영자 승인 후 복귀 확인
- 주간 모의고사 응시자 내부 MMR만 변하고 공개 경쟁전 점수와 미응시자 값은 유지되는지 확인

## 배포 조건

자동 검증, 스테이징 인덱스, 실제 저장소, 동시 정산, 브라우저·모바일 QA와 레이팅 공정성 검토가 모두 완료되어야 프로덕션 배포를 진행한다. 경쟁전은 별도의 활성화 설정을 켜기 전에 같은 조건을 다시 확인한다.

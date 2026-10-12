# Matths / GOAT Arena 2.2 — 26개 감사 항목 수정 기록

기준: 2026-10-11. 기존 감사의 확인된 F01–F26을 대상으로 서버와 인접 앱 프로젝트의 코드를 수정했다. 원래 저장소의 미완성 작업 위에 필요한 변경만 적용했으며, 초기 파일·Git 상태 백업을 별도로 보관했다. 이 문서는 최초 242개 요구사항 감사 전체의 재인증을 뜻하지 않는다.

**현재 결론:** 26개 항목의 코드 수정과 아래 격리 검증을 완료했다. 운영 적용·실저장소/결제/메일·실기기 검증과 실제 기준 문항 승인까지 완료했다는 뜻은 아니다. 앱 전체 Debug 빌드는 `ipad/Frameworks/llama.xcframework`가 없어 Xcode 계획 단계에서 실패했다. 새 앱 코드의 Swift 파싱, 실제 DTO 디코딩 및 계약 검증은 통과했다. 기존 Release/서명 게이트를 변경하지 않았다.

## 항목별 변경과 근거

| 항목 | 문제 | 적용한 변경 | 주 검증 |
|---|---|---|---|
| F01 | 운영자 삭제와 금융·다른 사용자 기록 | 금융 원장·Apple 소유권 토큰을 보존하고, 과거 상대 참조 그래프를 보존한다. DB 정리는 트랜잭션으로 수행하며 파일 삭제 작업을 먼저 영속화한다. [services/accountDeletionService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/accountDeletionService.js>) | audit/verifyArenaAuditCommandsDb.js; scripts/verifyAccountDeletionDb.js |
| F02 | 수열 정답 | a_m=1/(m+1)로 수정. 11·14 인덱스 문항의 정답은 23. 독립 부분합 검산 및 기존 오류 문항 재사용 차단. [services/arenaPdfTranscriptionGenerators/wave2Batch2.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaPdfTranscriptionGenerators/wave2Batch2.js>) | audit/verifyArenaAuditFixes.js |
| F03 | 유일하지 않은 할선 해 | 양의 정수 범위를 명시하고 전체 해를 검증한다. 2..12, 도함수 지점 1..6의 모든 생성 조합을 독립 정수 탐색으로 확인한다. [services/arenaPdfTranscriptionGenerators/wave2Batch2.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaPdfTranscriptionGenerators/wave2Batch2.js>) | audit/verifyArenaAuditFixes.js |
| F04 | 필수 도형 누락 | 사각형·다각형 도형 보존, 필수 도형 누락 시 출제 거절. 타일링의 칸별 규칙과 ○ 조각 개수 문구를 정정하고 960/240/80을 독립 열거로 검증했다. [services/arenaProblemVisualizationPolicy.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaProblemVisualizationPolicy.js>) | audit/verifyArenaAuditFixes.js; regenerated capture templates |
| F05 | 캡처·업로드 시간이 공식 시간에 포함 | 작은 완료 잠금 요청으로 답안·시각을 먼저 확정한다. 웹 인라인 보드는 내용 해시를 잠그고, 사진 제출형 앱은 PHOTO_UPLOAD_V1을 사용한다. [services/arenaQuestionCompletionService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaQuestionCompletionService.js>) | audit/verifyArenaAuditCommandsDb.js; audit/verifyArenaWebCompletionProtocol.js; native contract |
| F06 | 늦은 풀이 저장·버전 충돌 | 저장·진행·경기 종료가 시도/경기 문서를 함께 쓰도록 트랜잭션 경계를 구성했다. 같은 버전의 다른 내용은 409. 웹 로컬 초안과 잠금 복구를 추가했다. [services/arenaInlineSolutionBoardService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaInlineSolutionBoardService.js>) | audit/verifyArenaAuditCommandsDb.js: prepare/advance and overlapping-transaction races |
| F07 | 앱 evidence URL | 중앙 URL 생성기로 실제 /api/v1 경로를 반환한다. [services/arenaPublicResponseService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaPublicResponseService.js>) | audit/verifyArenaAsyncEvidenceDeliveryDb.js |
| F08 | 가입 전 게스트 증명 재사용 | 서버 증명 세대·만료를 관리하고, 계정 연결 후 익명 증명을 거절한다. 로그인한 회원으로 복구한다. [services/arenaGuestChallengeService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaGuestChallengeService.js>) | audit/verifyArenaGuestChallengeDb.js; audit/verifyArenaAuditCommandsDb.js |
| F09 | 삭제 실패 뒤 재시도 손실 | 확인된 삭제만 완료 처리한다. 식별자·시도·백오프·리스·개별 파일 완료 영수증을 유지하며, 계정 삭제에도 영속 삭제 작업을 사용한다. [services/arenaMatchEvidenceService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaMatchEvidenceService.js>) | audit/verifyArenaAuditStorageFailuresDb.js |
| F10 | 메일 실패 뒤 재시도 손실 | 사이트 알림과 메일 발송 원장을 분리했다. 재시도·리스·백오프를 구현하고 발송 결과 불명 상태는 자동 재발송 대신 운영 확인 대상으로 보존한다. [services/arenaNotificationEmailService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaNotificationEmailService.js>) | audit/verifyArenaAuditStorageFailuresDb.js |
| F11 | 유효한 일반전 공유 차단 | 일반전의 이상 신호와 사용자 공유 자격을 분리했다. 소유권·유효 완료·5문항·원본 보존을 확인한다. [services/arenaGuestChallengeService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaGuestChallengeService.js>) | audit/verifyArenaGuestChallengeDb.js; normal sharing fixtures |
| F12 | 네이티브 명령 헤더·재시도 | 변경 API/별칭 및 배치 경계에 공통 검증과 응답 원장을 연결했다. 앱은 계정·본문·빌드 버전에 묶인 재시도 키를 보존한다. [middleware/arenaNativeMutation.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/middleware/arenaNativeMutation.js>) | audit/verifyArenaAuditCommandsDb.js; audit/verifyIpadPlacementHttpContract.js; native key-store concurrency cases |
| F13 | 가까운 기준 풀 소진 | 다음 적격 난이도군을 시도하며 조합을 전부 열거하지 않는다. 실제 풀 전체가 부족하면 명확하게 거절한다. [services/arenaNormalBaselineQuestionService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaNormalBaselineQuestionService.js>) | audit/verifyArenaAuditBaselineFallbackDb.js; 1000-record bounded selection |
| F14 | 친선전 미확정 MMR 우선 | 확정 경쟁전 MMR → 일반전 숨은 MMR → 1000 순서를 적용했다. [services/arenaV2DifficultyService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaV2DifficultyService.js>) | audit/verifyArenaAuditFixes.js |
| F15 | 펼친 규칙 표 넘침 | 표 스크롤을 컨테이너 안에 유지하고 그리드 트랙의 최소 크기를 제한했다. [public/css/goat-arena.css](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/public/css/goat-arena.css>) | IAB normal/competitive open tables: 11 widths each, click and Enter |
| F16 | 미리보기 링크 무기한 | 웹·앱 풀이 미리보기를 300초 링크로 발급하고 R2 비동기 서명도 기다린다. [services/arenaInlineSolutionBoardService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaInlineSolutionBoardService.js>) | file-storage:verify; provider access after actual expiry remains staging verification |
| F17 | 내부 위험 신호·MMR 노출 | 공개 응답 허용 목록을 적용했다. 증거 수신 상태는 RECEIVED, 공개 경쟁전 점수만 제공한다. Apple 로그의 거래 식별자를 제거했다. [services/arenaPublicResponseService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaPublicResponseService.js>) | audit/verifyArenaAuditFixes.js; native actual-DTO decode |
| F18 | 도전장 생성 실패의 고아 홀드 | 원본 참조 등록과 도전장 생성을 같은 트랜잭션으로 처리한다. 다른 보존 사유는 유지한다. [services/arenaGuestChallengeService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaGuestChallengeService.js>) | audit/verifyArenaGuestChallengeDb.js: injected create failure and rollback |
| F19 | 객체 순서에 따른 문제 해시 | 재귀 키 정렬·배열 순서 유지·toJSON 변환을 적용했다. v1/v2 해시를 함께 비교해 전환 기간 반복 제외를 유지한다. [services/arenaQuestionIdentityService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaQuestionIdentityService.js>) | audit/verifyArenaAuditFixes.js |
| F20 | 검토 성공 후 재시도 404 | 같은 운영자·결정·근거의 완료 검토를 재생하고, 상충하는 결정은 409로 거절한다. [services/adminArenaV2Service.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/adminArenaV2Service.js>) | audit/verifyArenaAdminCurrentOperationsDb.js |
| F21 | 폐기된 검증 대상 | malformed-ID 검증을 현행 결과/풀이 읽기로 교체하고 기본 메모리 DB 실행 목록을 정리했다. [audit/verifyMalformedDynamicIds.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/verifyMalformedDynamicIds.js>) | dynamic-id-errors:verify; memory Mongo suites |
| F22 | 설명·설정·CSS 불일치 | 명시적인 잘못된 핵심 숫자 설정을 거절하고, 비활성 상위 티어 제한과 5경기 규칙을 문서에 반영했다. 소비자가 없는 페이백 CSS 71개 선택자를 제거했다. [services/goatArenaV2Config.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/goatArenaV2Config.js>) | invalid-config regression; ui:verify; logic-parity:verify |
| F23 | 잘못된 결과 ID 500 | 결과·풀이 공통 읽기 경계에서 ObjectId 형식을 확인하고 제어된 404를 반환한다. [services/arenaAsyncNormalService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaAsyncNormalService.js>) | dynamic-id-errors:verify: normal/competitive results and evidence |
| F24 | 티어 코드·이름 불일치 | 공개 점수의 티어와 이름을 같은 원장 데이터에서 생성한다. 내부 MMR 변화는 일반 응답에 포함하지 않는다. [services/goatArenaProductionMatchReadService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/goatArenaProductionMatchReadService.js>) | audit/verifyArenaAuditRatingInterleaveDb.js |
| F25 | 주간 MMR 덮어쓰기 | 경쟁전과 주간 정산을 최신 프로필 상태·공유 적용 함수·트랜잭션으로 직렬화한다. 공개 점수 기대값의 시작 스냅샷 정책은 유지한다. 동일 주간 재생의 수치·활동시각 드리프트도 막는다. [services/arenaRatingStateService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaRatingStateService.js>) | audit/verifyArenaAuditRatingInterleaveDb.js: weekly-first, match-first, concurrent, replay |
| F26 | 진행 중 참조 원본 삭제 | 예약/경기 생성과 원본 보존 참조를 함께 확정한다. 활성 및 결과 보존 참조가 있는 원본을 삭제하지 않으며 기존 참조도 검사한다. [services/arenaEvidenceRetentionService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/arenaEvidenceRetentionService.js>) | audit/verifyArenaAuditReferenceDb.js; historical semantics; guest overlap; account purge source graph |

## 확인한 동작

- 주간 정산 → 경쟁전: 내부 MMR 1500 → 1553.7901208758865 → 1615.3258910581799. 공개 점수 1000 → 1016, 코드 GOLD/이름 골드. 주간 효과를 지우던 기존 1578.801716729907 결과를 재현하지 않는다.
- 경쟁전 → 주간 정산: 주간 정산의 before가 경쟁전 이후 1578.801716729907이며 최종 MMR은 1623.5305510293688. 두 처리 순서가 같은 값을 내야 한다고 가정하지 않는다. 각 순서에서 두 효과가 모두 남아야 한다.
- 경쟁전/주간 동시 트랜잭션과 반복 재생: 원장 각 1개, 프로필 MMR/RD/변동성·공개 점수·활동시각 유지.
- 120초 풀이 + 20초 전송은 공식 120초. 시간 만료 후 전송은 서버 문항 마감으로 제한한다. 사진 제출형 잠금과 서버 자동 시간 만료가 겹쳐도 원래 완료 키로 복구한다.
- 풀이 준비 중 진행, 그리고 풀이 트랜잭션 읽기 후 진행 커밋을 각각 겹쳐 늦은 저장 거절을 확인했다. 실제 물리 기기 두 대의 HTTP 시험은 별도다.
- 삭제 실패는 원본 식별자를 남긴다. 두 파일 중 한 파일 성공·한 파일 실패를 주입하고, 재시도 시 미완료 파일만 삭제하는 것을 확인했다. 계정 정리의 별도 영속 삭제 작업도 확인했다.
- 이전 게스트 쿠키로 가입 후 풀이 읽기가 거절되고, 로그인한 소유자는 복구할 수 있다.
- 고아 보존 참조 방지: 도전장 저장 실패를 주입한 뒤 기존 참조는 유지되고 새 참조는 롤백된다.
- 최근 문항을 제외해 가장 가까운 7문항 풀에 2개만 남는 경우 다음 적격 풀에서 5문항을 선택한다. 실제로 모두 소진되면 안전하게 거절한다.

## 검증 결과

- Node.js v24.13.0 / MongoDB 8.2.6의 새 로컬 단일 replica set. 각 DB 검증 뒤 감사 DB를 삭제하고 서버를 종료했다.
- 원본의 config.env와 provider credentials는 검증 checkout에서 제외했다. SMTP·Cloudinary 업로드·S3 동작은 막거나 대체 구현을 사용했다. 실제 금융 거래·메일 발송·클라우드 삭제를 수행하지 않았다.
- 수정한 JavaScript 61개 문법 검사: 오류 0개.
- 최종 서버 검증 13개: 모두 성공. 각 명령 안의 세부 테스트도 성공.

| 최종 명령 | 결과 |
|---|---|
| `npm run arena-audit-fixes:verify` | PASS |
| `npm run arena-audit-fixes:verify-db` | PASS |
| `npm run weekly-mock-mmr:verify-db` | PASS |
| `npm run arena-v21:verify-db` | PASS |
| `npm run arena-v2:verify-db` | PASS |
| `npm run account-deletion:verify-db` | PASS |
| `npm run admin-arena-current:verify-db` | PASS |
| `npm run ipad-placement-http:verify` | PASS |
| `npm run ipad-arena-command-http:verify` | PASS |
| `npm run ipad-arena-action-http:verify` | PASS |
| `npm run arena-v22:verify-rulebook` | PASS |
| `npm run ui:verify` | PASS |
| `npm run contrast:verify` | PASS |

그 밖에 account-plans, active-commerce, arena-v2 정적 검증, scoring, baseline, cheating-modes, ranking, logic-parity, launch-views, private-mock, iPad weekly evidence, admin, upload/request security, malformed IDs, 별도 native command/action HTTP 검증, private-mock integrity/submission, 두 시뮬레이션 및 읽기 전용 데이터 검사도 격리된 환경에서 실행했다. 중간 실패 중 잘못된 URL·폐기 모델·새 헤더/잠금/인덱스의 이전 기대값은 수정했고, 신규 fixture의 누락 필드와 테스트 import 오류도 고쳐 최종 검증을 통과했다.

### 앱 프로젝트

경로: `/Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-ipad-web/Matths-dev/ipad`

- ServerAPI: 사진형 완료 잠금 API, 완료 상태 복구 DTO, 내부 위험 신호가 없는 evidence 응답 디코딩.
- NativeMutationKeyStore: 동일 계정·본문·버전의 재시도 키 유지, 성공 뒤 정리, 같은 요청의 동시 키 생성 직렬화.
- GoatArenaMatchPlayScreen: 잠금 전에 답안을 고정하고 잠금 뒤 로컬 검토 내용을 캡처한다. 재시도/재실행은 서버 완료 키와 답안을 사용한다.

통과한 앱 계약 검사:

1. run-arena-audit-fixes-contract.sh — 실제 API DTO 선언을 추출하여 디코딩; 키 저장소의 계정 분리·버전/재시작·동시 생성.
2. run-goat-arena-local-review-contract.sh
3. run-goat-arena-public-route-contract.sh
4. run-server-token-ownership-contract.sh
5. run-server-authentication-ownership-contract.sh

전체 Debug build 명령은 기존 llama.xcframework 누락 때문에 exit 65였다. 이 실패를 통과로 계산하지 않았다. 실제 시뮬레이터 화면과 iPhone/iPad의 설치·사진/펜·접근성 확인은 남아 있다.

### 반응형 규칙 화면

현재 소스의 loopback 미리보기를 IAB에서 열었다. 일반전은 클릭, 경쟁전은 Enter로 난이도 표를 펼친 뒤 각 폭을 측정했다.

| 화면 폭 | 일반전 document.scrollWidth | 경쟁전 document.scrollWidth |
|---|---|---|
| 320 | 320 | 320 |
| 375 | 375 | 375 |
| 390 | 390 | 390 |
| 430 | 430 | 430 |
| 768 | 768 | 768 |
| 820 | 820 | 820 |
| 834 | 834 | 834 |
| 1024 | 1024 | 1024 |
| 1280 | 1280 | 1280 |
| 1440 | 1440 | 1440 |
| 1920 | 1920 | 1920 |

## 검수 자료

63문항 capture JSON/Markdown, 63장 PNG, contact sheet와 ZIP을 재생성했다. 필수 도형을 실제 웹 도형 renderer로 포함한다. PNG는 손풀이를 작성할 빈 격자 템플릿이며 승인된 사람의 풀이 원본이 아니다. 초안 activationAllowed=false를 유지한다.

[audit/GOAT_ARENA_NORMAL_BASELINE_CAPTURE_PLAN.json](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/GOAT_ARENA_NORMAL_BASELINE_CAPTURE_PLAN.json>) · [audit/GOAT_ARENA_NORMAL_BASELINE_GRID_IMAGES.zip](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/GOAT_ARENA_NORMAL_BASELINE_GRID_IMAGES.zip>)

![수정한 필수 도형 검수 템플릿](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/GOAT_ARENA_NORMAL_BASELINE_GRID_IMAGES/NORMAL-U9-Q03.png>)

## 운영 적용 전 남은 확인

- 앱의 실제 llama.xcframework 경로를 복구하여 전체 Debug build 및 기기 시험을 완료한다. 이번 작업에서 서명·Release 게이트를 우회하지 않았다.
- 새 이메일/명령 응답/파일 삭제 원장 및 참조 조회 인덱스를 별도 staging에서 검사한다. prepareGoatArenaV2Indexes의 운영 DB 쓰기 차단과 staging 적용 검증은 로컬 감사 DB에서 통과했다. 실제 staging/운영의 인덱스 준비 완료는 확인하지 않았다.
- 실제 Cloudinary/R2에서 5분 URL 만료, 실패/재시도 삭제와 기존에 발급한 긴 수명 링크를 확인한다. 실제 SMTP에서 전달 결과·결과 불명 작업의 운영 복구를 확인한다.
- [scripts/inspectArenaAuditRepairState.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/scripts/inspectArenaAuditRepairState.js>) 또는 `npm run arena-audit-fixes:inspect`로 대상 DB의 기존 오류 문제·참조 경기·기준 문항을 읽기 전용으로 목록화한다. 봉인된 과거 문제·점수·MMR을 자동으로 덮어쓰지 않는다. 영향을 검토하고 수정/재채점 정책을 적용해야 한다.
- 기준 풀은 허용 MMR 범위에서 최근 5경기 제외 뒤에도 5문항을 제공할 수 있어야 한다. 최악의 단순 수량 기준은 30개이며, 난도·정답률·손풀이·실제 풀 상태도 검수해야 한다. 63장 템플릿을 생성했다는 이유로 부족한 풀을 승인하거나 출제 반복 제외를 풀지 않았다.
- 기존 전체 감사의 실기기·VoiceOver·결제 sandbox·현실 분포/부하·전체 생성 변형 검수 등 수동 항목은 이번 코드 회귀 결과로 대체하지 않는다.

## 재실행

```sh
npm run arena-audit-fixes:verify
npm run arena-audit-fixes:verify-db
```

변경은 두 로컬 저장소에만 반영했다. commit/push/배포/운영 DB migration과 실제 provider 작업은 수행하지 않았다. 기존 경쟁전 기본 비활성 상태를 유지한다.

검증 로그·초기 백업 경로: `/var/folders/3f/kylh43ys451fqhbtmb50gn980000gn/T/matths-fix26-gbvl2hps`

# GOAT Arena 2.1 경쟁전 구현 보고서

작성일: 2026-10-09  
상태: 로컬 구현 및 격리 검증 완료, 운영 배포 금지

## 범위와 디자인 롤백

- 2.1 문서가 대체하는 경쟁전 매칭, 문제 선택, 점수 비교, 단방향 MMR 정산, 결과 공개만 구현했다.
- 일반전, 친선전, 친구, XP 규칙, 풀이 업로드·저장, 부정행위 감지 알고리즘은 2.1 변경 대상으로 삼지 않았다.
- 이전 작업에서 바뀌었던 홈페이지, 가격, 약관, FAQ, 대시보드, 기존 Arena 내비게이션과 전역 `goat-arena.css`, 로컬 프리뷰 라우트는 Git 기준 원본으로 복구했다.
- 2.1 UI 변경은 기존 Ranked 화면의 시작/동의 컨트롤과 기존 경기 결과 화면의 필수 데이터 표시뿐이다. 새 경쟁전 CSS는 추가하지 않았다.
- 2.0에서 이미 존재하던 친구 화면/자산은 이번 작업에서 변경하지 않았다.

## 재사용한 기존 구성

- 기존 Skeleton + 숫자 매개변수 생성기와 sealed `ArenaProblemPack`.
- 기존 교육청 출처 메타데이터의 정확한 `correctRatePercent`. 누락, 구간값, 0 또는 1은 공식 경쟁전에서 거부한다.
- 기존 서버 채점과 `ArenaMatchAttempt` 시간 기록.
- 기존 evidence 업로드, 저장소 메타데이터, 이상 신호 탐지 코드.
- 기존 Glicko-2 계산기, 티어 컷오프, 경기 결과 화면과 스타일 컴포넌트.

## 구현 내용

### 비동기 과거 기록 매칭

- 경쟁전은 실시간 큐 대신 `ArenaCompetitiveRecord`에서 도전자 MMR과 가장 가까운 사용 가능 기록을 찾는다.
- 자기 기록, 이전 상대 기록 소유자, 테스트/실사용 코호트 불일치를 제외한다.
- CAS 예약 후 트랜잭션에서 기록과 경기를 연결한다. 취소, 타임아웃, 무효 시 예약을 해제한다.
- 과거 기록 소유자에게 새 attempt나 participant lock을 만들지 않는다.
- 검증 기록이 없으면 409로 거부하며 가짜 기록을 만들지 않는다.
- 정상 종료, 원본 풀이 존재, 무결성 CLEAR인 도전자 결과만 새 1회용 기록이 된다. 원본은 삭제하지 않고 `CONSUMED`로 보존한다.

### 서로 다른 다섯 문제

- 도전자용 다섯 문제를 기존 생성기로 별도 생성한다.
- 실제 문항 인스턴스 해시를 저장하고 과거 상대 세트와 완전히 같은 인스턴스를 거부한다.
- 도전자가 이전에 받았거나 비동기 결과로 열람 가능했던 실제 인스턴스도 노출 이력에서 제외한다. Skeleton 자체 재사용은 허용한다.
- 실제 prompt, choices, visualization, source ID와 출제 당시의 정확한 원문 정답률을 저장한다.

### 점수와 승패

각자 실제 다섯 문항에 대해 다음 후보 공식을 서버에서 계산한다.

`Z = (sum(x_i) - sum(p_i)) / sqrt(sum(p_i * (1 - p_i)))`

- Z 차이가 승인된 `close_score_threshold`보다 크면 Z가 높은 쪽이 승리한다.
- 차이가 근소 범위 안일 때만 답안 제출까지의 유효 풀이 시간을 보조 기준으로 쓴다. 촬영/업로드 시간은 제외한다.
- 같은 시간은 무승부다. 필수 시간 또는 정확한 정답률이 유효하지 않으면 MMR을 정산하지 않고 `INVALID`로 남긴다.
- `x_i`, `p_i`, 기대 정답 수, 분산, Z, 시간, 알고리즘 버전, 임계값, 판정 이유를 감사 스냅샷으로 저장한다.
- 임계값은 `ARENA_ASYNC_CLOSE_SCORE_THRESHOLD`이며 기본값이 없다. 승인 전에는 경쟁전 시작을 503으로 차단한다.

### 단방향 Glicko-2 정산

- 기본값은 Rating 1500, RD 350, Volatility 0.06, Tau 0.5이며 모두 설정 가능하다.
- 배치 RD 초기 가설은 `350 / sqrt(유효 표본 수)`이며 설정 가능하다.
- 과거 기록 생성 당시 Rating/RD/Volatility를 상대 입력으로 사용한다.
- 경기당 한 번만 현재 도전자 프로필을 갱신한다. 과거 소유자의 MMR, 티어, 전적, XP는 변경하지 않는다.
- 정상 검증 경기만 XP와 새 기록을 만든다. 업로드 전 자발적 포기는 도전자 패배로 정산하되 XP와 새 기록은 만들지 않는다.
- 업로드 후 포기는 금지한다. 과거 기록 소유자가 현재 도전자의 경기를 포기 처리하는 것도 403으로 차단한다.
- 업로드 직후 일시 실패 시 공용 정산 재시도 경로가 `SUBMITTED + PENDING` 경기의 기존 스크리닝부터 재개한다.

### 무결성 검토

- 기존 `detectEvidenceAnomalies`를 그대로 사용한다.
- 이상 신호가 있으면 도전자만 HELD/검토 대상으로 보낸다.
- 비동기 경기의 운영 결정은 NOTE, CLEAR, CHALLENGER_CHEATING만 허용한다. 과거 기록 소유자를 이번 경기 제재 대상으로 삼지 않는다.
- CLEAR는 단방향 정산을 재개한다. 도전자 부정행위 확정은 무효/예약 해제/도전자 제한으로 처리하며 양쪽 MMR을 변경하지 않는다.

### 결과 및 권한

- 기존 경기 화면 안에서 `내 문제`/`상대 문제` 탭을 제공한다.
- 양쪽 실제 다섯 문제, 문항별 원문 정답률, 정오답, 총 정답 수, 유효 시간, Z, 전체 업로드 파일 링크, 판정 설명을 제공한다.
- 공식 정답, answer key, model solution, 시스템 solution은 응답 whitelist에 포함하지 않는다.
- 업로드 완료 전 결과를 열지 않는다. 현재 도전자와 과거 기록 소유자만 결과/API/파일 리디렉션에 접근할 수 있다.
- 파일은 권한 확인 뒤 기존 저장소의 단기 서명 URL을 만든다. 저장 키/추측 가능한 정적 URL을 공개하지 않는다.
- 경기 전 현재 버전의 풀이 원본 상호 공개 동의를 요구하고, 오래된 동의 버전 기록은 매칭하지 않는다.

## 데이터베이스 변경

새 컬렉션:

- `arenacompetitiverecords`: 소유자, 원본 경기/attempt/evidence/problem-pack, 불변 레이팅/성과/문항 해시, 동의 버전, AVAILABLE/RESERVED/CONSUMED/INVALID, 예약·소비 이력.

기존 문서 확장:

- `arenamatches.competitiveAsync`: 과거 기록, 소유자, 도전자 경기 전 레이팅, 원문 정답률, 문항 해시, 비교 감사 자료.
- `arenamatchattempts.variantCode`: `INDIVIDUAL`.
- `arenacompetitiveprofiles`: 풀이 공개 동의 버전/시각.
- `arenamatches.matchOrigin`: `ARENA_2_ASYNC_RECORD`.

필수 인덱스는 staging 전용 도구에 포함했다. 로컬 격리 DB에서 12개 모델 인덱스 세트 생성/재실행/검증과 무관 인덱스 보존을 확인했다. 실제 staging에는 아직 적용하지 않았다.

## 2.1 주요 변경 파일

- `models/goatArenaModel.js`
- `services/goatArenaV2Config.js`
- `services/arenaCompetitiveScoringService.js`
- `services/arenaAsyncCompetitiveService.js`
- `services/arenaV2MatchmakingService.js`
- `services/arenaV2SettlementService.js`
- `services/arenaV2IntegrityReviewAdapter.js`
- `services/arenaMatchService.js`
- `services/arenaMatchAttemptService.js`
- `services/arenaMatchSettlementService.js`
- `controllers/goatArenaController.js`
- `controllers/goatArenaV2Controller.js`
- `routes/goat-arena-routes.js`
- `routes/api-routes.js`
- `views/goat-arena-division.ejs`
- `views/goat-arena-match.ejs`
- `scripts/prepareGoatArenaV2Indexes.js`
- `scripts/simulateArenaAsyncRatings.js`
- `scripts/verifyArenaCompetitiveScoring.js`
- `audit/verifyArenaAsyncCompetitiveDb.js`
- `audit/verifyArenaV2IndexesDb.js`
- `audit/GOAT_ARENA_ASYNC_SIMULATION_RESULTS.json`
- `package.json`

기존 업로드·저장·부정행위 감지 파일에는 diff가 없다.

## 검증 결과

- PASS `arena-v21:verify-scoring`: 서로 다른 세트, Z 우선, 명시적 임계값, 시간 보조, 무승부/무효, 비정상 p 거부, 감사 스냅샷.
- PASS `arena-v21:verify-db`: 실제 비동기 생성, 1 attempt/1 lock, 예약/해제/소비, 노출 회피, 도전자 단독 MMR/XP, 과거 소유자 불변, 포기 권한, 인증 결과, 외부인 403, 동시 exact-once 정산, HELD 후 CLEAR.
- PASS `arena-v2:verify-db`: 제품 결정, 기존 2.0 회귀, iPad 경계, 인덱스 등 5개 격리 MongoDB replica-set 감사.
- PASS `arena-v2:verify`, `arena-match:verify`, `arena-match-attempt:verify`.
- PASS `ui:verify`: 153개 EJS 컴파일/스타일 감사.
- PASS JavaScript syntax, `git diff --check`.
- FAIL(기존 무관) `contrast:verify`: `academy.css` 1건, `admin.css` 2건. 이번 작업에서 해당 CSS는 수정하지 않았다.
- 브라우저 자동화는 보안 정책이 `127.0.0.1` 탭 제어를 차단해 클릭/모바일 플레이 QA를 완료하지 못했다.

## 시뮬레이션 결과와 위험

10개 seed, seed당 10,000 경기, 90명 합성 플레이어와 기존 정확한 원문 정답률 168개를 사용했다. 사람 데이터 검증은 아니다.

- 같은 분포/능력, 서로 다른 세트 50,000쌍: 한쪽 승률 50.08%.
- hard/easy 사분위 스트레스 50,000쌍: 더 어려운 세트를 받은 쪽 45.67%. 평균 Z가 0에 가까워도 5문항 분포가 결과 분산을 왜곡할 수 있다.
- 정산 후 레이팅 스냅샷, threshold 0: 평균 drift +0.5552, seed별 -26.8668~+26.9999.
- threshold 0.1: +3.5504, -35.7011~+39.4421.
- threshold 0.2: +1.0322, -27.4959~+28.2415.
- 코호트 +0.3: +20.6417. 코호트 -0.3: -11.9571.
- 불법 best-of-3 선택 스트레스: +71.4559.

`productionValidated`는 false다. 합성 수치는 임계값 승인이나 생산 공정성 보증이 아니다.

## 생산 배포 차단 항목

1. 실제 경기 데이터로 `close_score_threshold`를 승인해야 한다. 현재 기본값은 비어 있어 경쟁전이 fail-closed 된다.
2. 변형 문항 난이도와 응시 집단별 원문 정답률을 사람 데이터로 검증해야 한다. hard/easy 스트레스 45.67%를 해소하지 않은 채 공정성을 선언할 수 없다.
3. 운영자/테스터의 실제 검증 기록과 현재 동의를 MMR 구간별로 공급하고 풀 고갈/검증 지연/반복 소유자 제외를 staging에서 검증해야 한다.
4. 실제 staging DB에 인덱스를 적용하고 실데이터 규모 트랜잭션, 동시 정산, 예약 회수, 정산 재시도를 시험해야 한다.
5. 실제 저장소 업로드/서명 URL/보존/권한 우회와 문제 visualization 복원을 검증해야 한다.
6. 인증된 데스크톱·모바일 브라우저에서 시작, 타임아웃, 재접속, 업로드, HELD, 포기, 결과 탭을 끝까지 QA해야 한다.
7. 이관 전 미종료 경기와 금융 의무를 다시 감사해야 한다. 이전 inventory의 orphan HELD payback review 2건은 운영자가 근거 자료로 정리해야 한다.
8. 디자인 롤백으로 기존 FAQ/약관의 일요일 잠금·구 Arena 경제 문구도 원본으로 돌아갔다. 로직은 24/7이므로 디자인을 바꾸지 않는 별도 승인 카피 정합성 작업이 필요하다.
9. 관련 없는 기존 contrast 실패 3건의 출시 수용 여부를 별도로 결정해야 한다.

운영 DB/스토리지에는 쓰지 않았고 production 배포나 migration을 실행하지 않았다.

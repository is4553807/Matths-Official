# Full-Codebase Performance Audit & Optimization

작성일: 2026-09-04. 원본: `bc2a2a26fe706ecc0371cff7830f011a6ed514cd` (`admin page academy`).

## A. Executive Summary

이번 수정은 운영 코드 4개 서비스에 한정했다. UI, API 스키마, 인증·권한 정책, 채점·숙달도 공식, 출석·정산 규칙은 변경하지 않았다.

핵심 발견은 `findOne`이라는 함수 이름이 아니라 **반별 집계의 반복 DB 왕복, Math Map의 큰 중간 데이터와 반복 탐색, 날짜 포맷터의 반복 생성**이었다. 이메일 조회를 실제 `explain("executionStats")`으로 확인한 결과 `email_1` 인덱스로 키 1개·문서 1개를 읽었다. 이 조회를 별도 “search function”으로 대체할 근거는 없었다.

최종 동일 조건 비교:

- 웹 오답노트: p50 **17.8→13.2ms, 25.8% 감소**.
- 선생님 학원 대시보드: **280.3→267.9ms, 4.4% 감소**. DB 명령 **68→31**, Node CPU **235.4→193.5ms**.
- 선생님 학원 분석 API: **277.9→257.6ms, 7.3% 감소**.
- 운영자 학원 상세 API: **294.0→274.1ms, 6.8% 감소**. DB 명령 **71→34**.
- 날짜 키 1,000회 계산: **30.9→4.3ms, 86.1% 감소**.
- Math Map 96명: p50 **255.6→235.8ms, 7.7% 감소**, Node CPU **202.7→180.0ms**.
- 운영자 웹 학원 분석 p50은 **276.0→264.0ms**로 줄었지만 p95는 **291.9→414.0ms**로 악화했다. 주간 모의고사 집계 단독 호출도 **15.5→20.0ms**로 느려졌지만, 명령 수는 **42→5**, Node CPU는 **12.6→8.9ms**로 감소했다.
- 반면 주간 집계 8개 동시 호출은 round p50 **108.2→80.4ms, 25.7% 감소**, p50 round에서 계산한 처리율은 **74.0→99.6 req/s, 34.6% 증가**했다. 이것은 localhost 서비스 부하 결과이며 운영 처리량 보장은 아니다.

따라서 “모든 페이지가 빨라졌다”거나 “전체 서비스가 몇 % 개선됐다”고 결론 내리지 않는다. 트래픽 가중치와 운영 부하를 측정하지 않았다. 특히 학원 분석의 큰 지연은 아직 남아 있다. 변경하지 않은 페이지의 작은 증감도 이 수정의 효과로 해석하지 않는다.

검증: 기존 등록 검증 명령 중 **149개 통과, 10개 원본에서도 재현되는 실패, 8개 제외/중복**. 별도 원본·수정본 동등성 테스트 통과. “전체 테스트 통과” 상태는 아니다.

## B. Page-by-Page Analysis

### 범위와 읽기 방식

`server.js`, routes, middleware, controllers, services, models, constants, dataAnalysis, 이메일 콘텐츠, `public/js`, EJS 템플릿에서 import/DB 호출/네트워크/타이머/파일 I/O/렌더링/배열 순회 지점을 목록화했다. 이후 주요 진입점에서 실제 서비스와 데이터 소비자를 따라가며 읽고, 느린 경로는 HTTP 및 서비스 단위로 측정했다.

정적 목록은 **531개 JS/EJS 파일, 253,004줄, 라우트 등록 731건, DB 호출 구문 1,944개, 직접 네트워크 호출 구문 22개**다. 이것은 정적 검색 범위이지 모든 줄을 동일한 깊이로 수동 검증했다는 뜻이 아니며, 정규식 기반 집계는 간접 호출을 전부 셀 수 없다. 라우트 등록에는 mount/use도 포함된다.

실제 시간 측정은 **웹 중심 HTTP 45개 사례, API 18개 사례, 서비스 5개**다. 매출 API는 두 표에 중복 포함된다. 모든 731개 등록 경로의 모든 입력/권한/데이터 상태를 부하 테스트한 것은 아니다.

### 주요 요청 흐름과 판정

공통 웹 흐름: HTTP → 압축/세션 → 계정·tokenVersion·역할 확인 → controller → service/DB → EJS/자산 URL 처리 → 압축 응답 → 브라우저 초기화.

공통 API 흐름: HTTP → 실제 JWT/API 인증·현재 계정 확인 → controller → service/DB → 기존 JSON 직렬화 계약. 웹 페이지와 iPad API는 항상 같은 서비스 구현을 공유하지 않는다.

| 페이지/경로군 | 실제 작업·병목·대략적 비용 | 수정 또는 유지 이유 |
|---|---|---|
| 공개 홈, 소개, 교육과정, FAQ | 홈 데이터/공통 세션, 교육과정 로드, EJS; 내용 크기에 비례하는 렌더링 | 교육과정 캐시·자산 버전 캐시·압축이 이미 있음. 추가 데이터 캐시 없음 |
| 요금 안내, 스토어 | 정책·상품·이용 권한 조회 후 SSR | 독립 조회는 이미 병렬인 곳이 많음. 가격/권한 stale cache 금지 |
| 커뮤니티 | 게시글/공지/권한/카운트, 페이지 정렬 | 기존 필터·페이지 범위 유지. 빈 게시글 fixture이므로 큰 커뮤니티 성능을 증명하지 않음 |
| 학생 `/main` | 정책·Arena·랭킹 병렬 호출, 세션/학원 이용권 확인, SSR | 날짜 formatter 간접 영향만 있음. 랭킹 전역 데이터와 필요한 권한 확인 유지 |
| `/my-learning`, `/log-curriculum` | 진도/평가 → 교육과정 view model → SSR. 개념 수 C 및 평가 수 E에 비례, 필요한 정렬 포함 | 기존 Map/교육과정 캐시 유지. 진도 필터와 assessment gate 변경 없음 |
| 웹 `/wrong-notes` | quick-practice 오답 동기화 → 최근 최대 500건+populate → 문제별 최신 항목 Map → 필터/정렬 → 10건 페이지 | 반복 Intl 생성을 제거. 전체 후보 통계·선택지 때문에 page 전에 필요한 변환은 유지. O(N log N), N≤500 |
| `/assessments`, 프로필, 알림 | 평가/사용자/학원/알림 및 페이지 데이터 | 정렬·페이지·표시 규칙 유지. 인증·라이프사이클 formatter만 공유 |
| 학생 학원/주간 과제 | membership 및 수업/주차/제출/출석 서비스 | 조회 중 출석 세션 생성·마감 처리가 있을 수 있어 무조건 캐시/생략하지 않음 |
| 선생님 `/academy` 대시보드 | context → portal → 월간 통계, Math Map, 주간 모의고사 병렬 → SSR/academy.js 차트 | Math Map 탐색·projection, 반별 주간 집계 batching. 무거운 서비스는 여전히 존재 |
| 학원 students/classes/attendance 탭 | portal 뒤 선택된 탭의 학생 페이지/반/출석 roster | 원본이 이미 탭별 로딩. 분석을 새로 실행하거나 탭 구조를 변경하지 않음 |
| 반 상세 | 반 권한·명단 → 월간 통계/Math Map/주간 과제·출석 | Math Map 공통 개선. 권한 확인의 순서를 바꾸지 않음 |
| 학원 학생 상세 | membership → 학생 통계·개인 Math Map·학습 데이터 | 개인 Math Map 공통 개선. 내용/숙달도 계산 동일 |
| 학부모 대시보드 | parent family/선택 자녀 → dashboard+ranking 병렬 | 전역 랭킹/다수 집계·권한 I/O. 날짜 formatter만 공유 |
| 학부모 알림 설정 | parent family → getDashboardData → 설정 SSR | 통계만 필요해 보여도 dashboard 내부 attendance 쓰기 효과가 있어 호출 제거 금지 |
| 학부모 요금·결제 | family/자녀 권한 → 상품·결제·환불 상태 | 외부 결제 호출/금액·순서 변경 없음 |
| 운영자 홈/사용자 목록·상세 | 요약 counts, 사용자·이력·원장/관련 문서, SSR | 사용자 상세는 38명령. 감사·권한·현재 상태를 읽는 작업 유지 |
| 운영자 학원 목록 및 overview/members/classes/attendance | 페이지 section별 선택 로딩 | 원본의 분리 구조 유지. 분석을 모든 section에 합치지 않음 |
| 운영자 학원 analytics | 학원 권한/context → 월간/Math Map/반별 주간 통계 | 공통 두 통계 서비스 개선. 61→24명령이지만 최종 wall time 개선 불확실 |
| 모의고사 목록·운영 관리 | 최근 시험/응시·이용 가능 여부 및 통계 | 학원별 multi-scope만 batching. 단일 전체 통계 API는 기존 두 aggregate 유지 |
| War of Masters/랭킹 | 정책·현재 season·응시·standing·사용자 매핑, 전역 정렬 | O(응시 이력 + 사용자/standing + 랭킹 정렬), 큰 코호트 미측정. 무작정 pagination/캐시하면 순위 의미 변경 |
| GOAT Arena | 계정/이용권·매치·랭킹/spotlight SSR → 영상 시작 → 시간에 따른 UI 공개 | HTTP는 빠르더라도 실제 체감 로딩은 대형 영상 영향 가능. 영상/공개 타이밍 유지 |
| 운영자 문제은행·정책·Arena audit | catalog/정책/원장·outbox/정합성 조회 | 문항 생성·검산·정산 알고리즘과 순서 유지 |
| 데이터 분석·매출 API | 기간 필터·정책/원장/수익 집계 | 금액/취소 포함 조건 그대로. 실결제·대규모 원장 미측정 |
| iPad 학습/알림/평가/보관함/독서실 API | API auth → 해당 서비스 → 명시적 serializer | 응답 필드·증분 동기화 cursor 유지 |
| iPad 오답 API | updatedAt+_id cursor → 제한된 조회+populate → entries/nextCursor | 웹 wrongNoteService와 별도 경로. 웹 오답 개선을 API에도 적용됐다고 주장하지 않음 |
| iPad 학원 분석/운영자 상세 API | API 권한 → 월간/Math Map 및 운영자 상세 통계 → serializer | 공통 Math Map/학원 주간 통계 개선; 실제 API에서도 측정 |

대표 추적 근거: [controllers/academyController.js:136](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/controllers/academyController.js:136>), [controllers/matthsController.js:504](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/controllers/matthsController.js:504>), [controllers/parentController.js:186](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/controllers/parentController.js:186>), [controllers/ipadAcademyController.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/controllers/ipadAcademyController.js>), [controllers/ipadLearningSyncController.js:907](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/controllers/ipadLearningSyncController.js:907>), [services/dashboardService.js:866](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/dashboardService.js:866>), [middleware/authMiddleware.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/middleware/authMiddleware.js>).

### 프런트엔드·간접 작업

- `main.js`, `my-learning.js`, `academy.js` 및 템플릿 초기 데이터 소비 경로를 점검했다. 학원 차트는 SSR에 포함된 데이터를 사용한다. 관찰한 주요 초기화 경로에 대해 근거 없는 “중복 fetch 제거” 변경은 하지 않았다.
- 내비게이션 prefetch는 최대 3개, hover 지연, 절약 모드/느린 연결 제한이 이미 있다. 이를 제거하면 탐색 동작이 바뀐다.
- session heartbeat는 사용 시간·활동 기록 의미가 있어 주기/빈도를 변경하지 않았다.
- Math rendering 대기열, 수식 검산, 응시 저장/확정 흐름은 순서·상태 의존성을 유지했다.
- static fingerprint 파일 읽기는 기동 시 계산이고 매 요청 재계산이 아니다. 교육과정/공지 캐시 등 원래의 캐시를 새 최적화 성과로 세지 않는다.
- 출석/과제 마감, scheduler lease, outbox claim→처리→ack, 환불·정산은 순서/원장/실시간 자격 판정 의존성을 확인해 무분별하게 병렬화하지 않았다.
- 개인화 PDF는 권한 → 파일 materialize → 워터마크/발급 이력 → 다운로드/임시 파일 정리 경로다. 캐시로 사용자별 추적 정보나 발급 로그를 생략하지 않았다. 외부 storage/SMTP/OAuth/결제 지연은 본 측정에 포함하지 않았다.

### 웹 중심 HTTP 결과

양수 감소율은 빨라짐, 음수는 느려짐이다. 모든 행을 포함하며 느려진 결과를 제외하지 않았다. `:id`는 동일 고정 fixture ID의 축약이다. HTTP 응답은 모두 200이었다. 첫 호출은 아래 F의 제한된 cold 정의를 따른다.

| 역할·경로 | 첫 호출 ms 전→후 | warm p50 ms 전→후 | warm p95 ms 전→후 | p50 감소율 | DB 명령 전→후 |
|---|---:|---:|---:|---:|---:|
| public / | 8.2→8.2 | 1.1→1.0 | 1.9→1.8 | 3.5% | 1→1 |
| public /intro | 2.6→2.6 | 0.8→0.8 | 1.2→1.0 | -2.4% | 0→0 |
| public /pricing | 13.3→12.2 | 8.3→8.7 | 9.8→10.6 | -5.4% | 5→5 |
| public /curriculum | 4.1→3.6 | 2.0→2.5 | 2.6→3.2 | -22.7% | 0→0 |
| public /faq | 3.3→3.1 | 1.2→1.4 | 1.4→1.6 | -12.7% | 0→0 |
| public /community | 12.8→18.5 | 2.7→2.4 | 11.6→3.5 | 12.2% | 4→4 |
| student /main | 31.7→27.0 | 15.1→14.7 | 18.3→16.8 | 2.6% | 24→24 |
| student /my-learning | 14.5→14.0 | 11.9→11.5 | 13.5→13.6 | 3.5% | 7→7 |
| student /log-curriculum | 15.6→13.1 | 14.7→13.4 | 22.4→18.0 | 8.7% | 7→7 |
| student /wrong-notes | 33.7→21.4 | 17.8→13.2 | 23.1→16.0 | 25.8% | 7→7 |
| student /assessments | 18.8→14.6 | 10.9→10.7 | 13.0→14.8 | 1.7% | 8→8 |
| student /profile | 39.5→36.5 | 14.8→13.9 | 17.9→17.6 | 6.1% | 11→11 |
| student /notifications | 13.5→11.7 | 11.1→10.1 | 12.9→12.4 | 9.2% | 9→9 |
| student /my-academy | 12.3→12.3 | 10.1→9.9 | 11.2→11.2 | 1.5% | 9→9 |
| student /private-mock-exams | 19.0→14.8 | 10.7→11.5 | 12.2→16.9 | -7.8% | 12→12 |
| student /war-of-masters | 14.3→14.7 | 12.2→12.1 | 14.0→14.9 | 0.5% | 20→20 |
| student /war-of-masters/rankings | 14.6→11.8 | 10.4→9.9 | 18.3→12.1 | 5.3% | 12→12 |
| student /goat-arena | 18.0→14.1 | 12.0→11.7 | 14.2→15.4 | 2.7% | 21→21 |
| student /store | 11.1→11.0 | 10.9→9.9 | 13.5→13.2 | 9.5% | 7→7 |
| teacher /academy | 437.1→412.1 | 280.3→267.9 | 320.5→311.2 | 4.4% | 68→31 |
| teacher /academy?tab=students | 15.8→16.1 | 12.6→14.9 | 15.1→21.8 | -18.5% | 21→21 |
| teacher /academy?tab=classes | 12.5→12.4 | 12.1→15.0 | 13.4→20.0 | -24.1% | 18→18 |
| teacher /academy?tab=attendance | 13.3→13.8 | 12.7→13.6 | 15.9→20.9 | -7.0% | 23→23 |
| teacher /academy/classes/:classId | 82.8→53.5 | 45.5→46.3 | 48.3→49.5 | -1.9% | 28→28 |
| teacher /academy/students/:membershipId | 25.9→38.3 | 17.2→17.8 | 22.8→23.1 | -3.3% | 16→16 |
| parent /parent | 22.6→25.6 | 19.9→20.3 | 22.6→36.8 | -1.7% | 33→33 |
| parent /parent/notifications | 25.4→18.7 | 18.8→19.4 | 22.7→46.8 | -3.4% | 26→26 |
| parent /parent/pricing | 17.9→20.5 | 15.8→16.4 | 17.3→18.4 | -3.7% | 17→17 |
| parent /parent/payments | 16.1→17.4 | 15.2→15.0 | 19.0→16.9 | 1.0% | 8→8 |
| admin /admin | 28.3→32.4 | 23.5→23.3 | 26.9→26.4 | 0.7% | 23→23 |
| admin /admin/academies | 15.0→16.1 | 10.3→10.8 | 52.9→12.2 | -4.5% | 13→13 |
| admin /admin/academies/:academyId/overview | 16.9→19.4 | 12.6→13.6 | 14.6→16.6 | -8.1% | 17→17 |
| admin /admin/academies/:academyId/analytics | 313.7→271.5 | 276.0→264.0 | 291.9→414.0 | 4.3% | 61→24 |
| admin /admin/academies/:academyId/members | 30.6→48.3 | 25.2→25.4 | 27.9→31.3 | -0.7% | 17→17 |
| admin /admin/academies/:academyId/classes | 14.2→19.5 | 14.2→15.1 | 19.3→19.9 | -6.8% | 17→17 |
| admin /admin/academies/:academyId/attendance | 11.0→14.4 | 9.4→9.4 | 11.1→11.1 | 0.1% | 11→11 |
| admin /admin/users | 15.1→15.5 | 11.2→11.2 | 13.8→13.5 | -0.7% | 12→12 |
| admin /admin/users/:userId | 20.2→19.8 | 12.8→13.4 | 14.9→16.4 | -4.3% | 38→38 |
| admin /admin/private-mock-exams | 40.9→41.9 | 19.1→19.3 | 22.3→21.3 | -1.3% | 24→24 |
| admin /admin/community | 12.5→13.7 | 10.2→10.2 | 12.1→11.6 | -0.2% | 11→11 |
| admin /admin/arena-policies | 26.3→29.8 | 16.8→17.2 | 19.8→23.2 | -2.3% | 17→17 |
| admin /admin/problem-banks | 52.3→53.1 | 12.7→12.5 | 15.0→15.8 | 1.3% | 13→13 |
| admin /admin/arena-audit | 14.2→14.2 | 11.2→11.1 | 14.2→12.4 | 1.4% | 26→26 |
| admin /admin/data-analysis | 68.3→68.0 | 9.3→9.1 | 10.7→15.3 | 1.7% | 5→5 |
| admin /api/admin/revenue | 25.0→21.8 | 21.8→21.0 | 24.3→27.2 | 3.9% | 13→13 |

### API 결과

정상 경로 18개 모두 200. 실제 로그인으로 발급된 token과 현재 계정/역할 검사를 사용했다. 비로그인 접근 401 및 학생의 운영자 API 접근 403도 원본·수정본에서 확인했다.

| 역할·경로 | 첫 호출 ms 전→후 | warm p50 ms 전→후 | warm p95 ms 전→후 | p50 감소율 | DB 명령 전→후 |
|---|---:|---:|---:|---:|---:|
| student /api/v1/me | 14.3→13.3 | 9.7→9.1 | 12.1→10.3 | 6.4% | 7→7 |
| student /api/v1/curriculum | 11.4→11.4 | 12.0→11.9 | 15.5→14.9 | 0.6% | 5→5 |
| student /api/v1/learning | 17.0→17.3 | 20.0→13.4 | 33.0→19.1 | 33.0% | 7→7 |
| student /api/v1/dashboard/activity | 14.9→13.4 | 14.6→9.6 | 20.7→11.3 | 34.4% | 9→9 |
| student /api/v1/notifications | 13.9→10.1 | 10.2→9.1 | 13.1→10.3 | 10.5% | 9→9 |
| student /api/v1/assessments | 10.0→8.8 | 9.6→9.1 | 14.2→10.6 | 5.9% | 6→6 |
| student /api/v1/wrong-notes | 16.8→16.2 | 11.5→10.7 | 13.1→11.3 | 7.0% | 7→7 |
| student /api/v1/academy/student | 14.9→11.3 | 10.7→10.2 | 12.3→11.3 | 4.3% | 16→16 |
| student /api/v1/weekly-mock-exams | 11.2→11.4 | 10.2→10.0 | 11.6→11.8 | 2.0% | 12→12 |
| student /api/v1/goat-arena | 12.6→11.9 | 10.0→9.5 | 12.3→11.4 | 5.7% | 12→12 |
| student /api/v1/archive | 11.7→11.6 | 10.3→10.2 | 11.3→24.6 | 0.8% | 13→13 |
| student /api/v1/study-hall | 10.0→10.5 | 9.1→9.0 | 9.8→11.1 | 0.6% | 7→7 |
| teacher /api/v1/academy/teacher | 14.8→13.2 | 13.1→12.2 | 15.6→14.1 | 6.5% | 18→18 |
| teacher /api/v1/academy/teacher/analytics | 473.6→395.4 | 277.9→257.6 | 319.6→298.1 | 7.3% | 26→26 |
| teacher /api/v1/academy/teacher/students | 14.0→13.8 | 12.4→11.6 | 15.6→15.0 | 6.7% | 21→21 |
| admin /api/v1/academy/admin/list | 12.0→11.8 | 10.2→10.2 | 11.7→13.3 | 0.3% | 13→13 |
| admin /api/v1/academy/admin/:academyId | 294.5→271.8 | 294.0→274.1 | 426.9→287.4 | 6.8% | 71→34 |
| admin /api/admin/revenue | 35.2→27.8 | 21.9→21.1 | 28.1→23.3 | 3.9% | 13→13 |

## C. Backend / Database Analysis

### 1. Math Map: 필요한 자료만 읽고, 반복 검색을 인덱싱

위치: [services/mathMapService.js:277](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/mathMapService.js:277>)의 `loadAttemptGroups`, `buildStudentRecommendation`, `buildStudentMap`, `getClassMathMap`.

원본은 최근 유효 풀이를 구성할 때 전체 problemSnapshot 및 불필요한 course/unit 값을 MongoDB에서 Node로 가져왔다. 실제 숙달도 계산이 읽는 snapshot 값은 typeId/difficulty다. 변경 후 이 두 필드만 집계하고, 문제 문서의 projection도 실제 소비 필드로 제한했다. 반복되는 problemId의 `$in` 배열도 중복 제거했다.

반 전체 통계는 각 개념×학생 조합마다 학생의 개념 배열을 `find`로 다시 검색했다. 학생별 conceptId Map을 한 번 만들고 재사용한다. 중복 개념 ID에서는 첫 항목을 유지해 기존 `find` 의미를 보존한다. 교육과정에서 파생되는 읽기 전용 그래프도 교육과정 객체 identity를 기준으로 재사용하며, 교육과정 캐시가 명시적으로 갱신되면 새 그래프를 만든다.

강점/우선순위와 추천은 정렬 후 첫 결과만 사용하므로 동일 comparator를 쓰는 단일 선택 순회로 바꿨다. strict 비교로 동점의 최초 항목을 유지한다.

정확성: 최근 20건 window, submittedAt/_id 내림차순, primaryConceptId 불일치 필터 적용 위치, 복습 연결/회복 여부, 난이도 가중치, 최근성, confidence, 소수점 반올림, 추천 문구, 반환 필드를 유지한다. 출력 크기를 줄인 것이 아니라 **DB→Node 중간 전달**을 줄였다.

측정: 96명 전체 Math Map의 p50은 255.6→235.8ms, CPU는 202.7→180.0ms, p95는 318.1→296.6ms였다. 동일 localhost fixture에서 각각 7.7%, 11.2%, 6.7% 감소했지만 운영 부하의 개선율로 일반화하지 않는다.

### 2. 학원 주간 모의고사: 반별 반복 aggregate를 제한된 batch로

위치: [services/weeklyMockInsightService.js:217](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/weeklyMockInsightService.js:217>)의 `getScopeInsights`, `getAcademyWeeklyMockInsights`.

원본은 전체+각 반마다 문항 통계/응시 요약 두 aggregate를 병렬 실행했다. 즉 12반에서 26개 aggregate와 13개 getMore, 메타데이터 조회 3개가 발생했다.

변경은 scope를 최대 8개씩 묶어 공통 indexed match와 projection 뒤 `$facet`을 실행한다. 각 branch는 **기존 MongoDB unwind/group/avg/cond**를 그대로 쓴다. 13개 scope는 두 aggregate가 되고 총 명령 수는 42→5다. 반 membership도 한 번 분류해서 반복 filter를 없앴다.

정확성: 승인된 membership 범위, 반 순서/활성 상태/빈 반, 중복 membership의 studentCount 의미, 미배정 학생의 전체 포함, 제출 확정/무효 처리, 시험 선택/기간, MongoDB truthiness와 null/missing 평균 처리 유지. JS 평균으로 옮기지 않았다.

한계: facet은 메모리와 결과 BSON 크기 제한이 있다. 최대 8 scope batching에 더해 관련 한도 오류 코드 10334/146/292/4031700에서 기존 scope별 집계로 fallback한다. 다른 오류는 전파하며 결과를 자르지 않는다. 이 제한은 [MongoDB $facet 문서](https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/)를 확인했다.

측정상 trade-off가 있다. 단일 서비스 요청 p50은 15.5→20.0ms로 **29.2% 느려졌다**. Node CPU는 12.6→8.9ms, DB 명령 시간 합은 178→25ms다. 후자는 병렬 명령 시간의 합이지 요청 wall time이 아니다. 이 단일 호출만으로 query pool 압력과 동시 처리 성능을 판단할 수 없어 아래의 동시 서비스 workload를 추가했다.

추가로 같은 fixture에서 한 round에 8개 서비스를 동시에 호출하고, 1회 warm-up 뒤 10 round(버전당 80요청)를 측정했다. round p50은 108.2→80.4ms(25.7% 감소), p95는 124.1→100.0ms(19.4% 감소), Node CPU p50/round는 141.9→81.9ms(42.3% 감소), 요청당 DB 명령은 42→5였다. p50 round로 단순 계산한 처리율은 74.0→99.6 req/s였다. 이 결과는 batching 유지의 근거지만, 실제 HTTP 인증·Mongo 서버 CPU·장시간 포화 상태는 포함하지 않는다.

### 3. 불변 날짜 formatter 재사용

위치: [services/userLifecycleService.js:10](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/userLifecycleService.js:10>), [services/wrongNoteService.js:17](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/wrongNoteService.js:17>).

동일 locale/timeZone/options의 `Intl.DateTimeFormat`을 호출마다 생성하던 것을 모듈 단위로 한 번 생성한다. 날짜, “오늘”, 사용자, 권한, 조회 결과를 캐시하지 않는다. 한국 시간대 자정·윤년·연도 변경·invalid-date 오류 의미를 유지한다.

호출 수 N의 Big-O는 O(N)이지만, 비싼 ICU formatter 생성은 N회→1회다. 날짜 키 1,000회 p50 30.9→4.3ms, 웹 오답노트 p50 17.8→13.2ms였다.

### 4. 인덱스 및 auth 판단

새 인덱스는 **추가하지 않았다**. User email/_id와 ProblemAttempt의 기존 복합 인덱스 및 reviewSourceAttemptId 단일 인덱스를 확인했다.

Math Map의 정렬용 후보 `{ userId:1, reviewSourceAttemptId:1, attemptNumber:1, submittedAt:-1, _id:-1 }`는 별도 local DB에서만 실험했다. 실제 planner가 기존 SORT 대신 후보 인덱스의 SORT_MERGE를 사용했다. 하지만 서비스 p50은 기존 **202.7ms**, 후보 **200.4ms**, 후보 제거 후 **210.4ms**로 차이가 작았다. 양쪽 모두 28,800문서·키를 읽었다. 큰 추가 write/storage 비용을 정당화할 안정적인 latency 이득이 확인되지 않아 적용하지 않았다. 단일 explain execution 시간 차이를 반복 요청의 개선율로 쓰지 않았다.

Auth 문서를 무조건 `lean()`으로 바꾸거나 이전 결과를 재사용하지 않았다. `synchronizeAccountAccess`는 정지 해제 등의 저장과 tokenVersion 확인에 참여한다. 학원·자녀 관계 재확인 역시 실시간 권한 경계다. 필수 검사를 제거해서 줄인 쿼리는 없다.

## D. Complexity Changes

기호: U=학생 수, C=관찰 개념 수, B=반 수, M=membership 수, K≤20=최종 풀이 window, A=전체 matching 풀이 이력, S=전체 snapshot 크기, R=필요한 작은 필드 크기.

| 작업 | 원본 | 변경 후 | 제한/보존 |
|---|---|---|---|
| 반 통계의 학생별 개념 조회 | O(U·C²) | 평균 O(U·C), 추가 Map 공간 O(U·C) | 최종 studentResults 자체도 O(U·C)이므로 제거하지 않음 |
| Math Map 파생 그래프 구축 | 요청 안에서 2회 이상 O(교육과정+edge) | 교육과정 identity당 1회 | 교육과정 cache clear/reload 시 다시 구축 |
| 학생 추천 후보 선택 | 여러 filter + O(C log C) sort | O(C) 한 순회 | comparator/동점 순서 동일 |
| topStrength/topPriority | 두 O(C log C) sort | O(C) | 전체 concepts/bottlenecks의 필요한 정렬은 유지 |
| 반별 membership 분류 | O(B·M) | O(B+M) | membership 순서·중복 count 유지 |
| 학원 주간 집계 명령 | 2(B+1) aggregate + cursor | 약 ceil(비어 있지 않은 scope/8) aggregate + cursor | 메타 조회 별도. 실제 문항 집계 전체가 O(1)이 되는 것은 아님 |
| problemId 조건 준비 | 중복 포함 O(U·C·K) 원소 전송 | 같은 순회 비용, unique ID만 전송 | Mongo 내부 중복 처리도 있으므로 DB 명령 감소로 세지 않음 |
| snapshot 처리/전달 | 보관 window에서 O(U·C·K·S) 크기 | O(U·C·K·R) | group 이전 전체 이력 A 읽기/정렬 비용은 여전히 남음 |
| 날짜 포맷 | O(N), formatter 생성 N회 | O(N), 생성 1회 | 결과/현재 시각은 매번 계산 |

전체 Math Map은 여전히 전체 이력 처리, 개념 정렬, 결과 구성 비용을 가진다. “전체 시간복잡도 O(N²)→O(N)”라고 일반화하지 않는다. 원본의 `$push` 후 `$slice`는 유지되어 Mongo 내부 보관량이 이력 A에 비례할 수 있다.

## E. Files Modified

### 운영 코드

| 파일 | 변경 이유 |
|---|---|
| [services/mathMapService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/mathMapService.js>) | 파생 그래프 재사용, 중간 projection, 중복 ID 축소, Map 조회, 불필요한 전체 sort 제거 |
| [services/weeklyMockInsightService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/weeklyMockInsightService.js>) | 동일 집계 branch의 scope batching, memory fallback, membership pre-index |
| [services/userLifecycleService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/userLifecycleService.js>) | 불변 KST formatter 재사용 |
| [services/wrongNoteService.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/services/wrongNoteService.js>) | 표시 날짜·오늘 판정 formatter 재사용 |

그 외 운영 controller/model/route/template/CSS/클라이언트 JS/package.json 변경 없음. 의존성 추가, 데이터 마이그레이션, 운영 DB 인덱스 생성, 배포, 커밋은 하지 않았다.

### 재현·감사 전용 파일

- [audit/performance/benchmark.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/benchmark.js>): 같은 fixture/실제 HTTP 로그인/DB monitoring/p50·p95·CPU·payload 수집.
- [audit/performance/verifyEquivalence.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/verifyEquivalence.js>): git 원본과 수정본을 같은 fixture에서 직접 비교.
- [audit/performance/inventory.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/inventory.js>): 정적 요청·쿼리·렌더링·클라이언트 경로 목록.
- [audit/performance/runTests.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/runTests.js>), [audit/performance/testIsolation.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/testIsolation.js>), [audit/performance/runWithFixtures.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/runWithFixtures.js>): 기존 명령 격리 실행과 필요한 fixture 준비.
- [audit/performance/checkMathMapIndex.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/checkMathMapIndex.js>): 채택하지 않은 인덱스 후보의 local 실험.
- [audit/performance/benchmarkConcurrentWeekly.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/benchmarkConcurrentWeekly.js>): 주간 학원 통계의 동일 동시 요청 비교.
- [audit/performance/results.json](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/results.json>): 최종 요약 수치, 테스트 결과, 환경 및 원본 baseline 참조.
- 이 보고서. 운영 요청 경로에 profiling/debug hook을 남기지 않았다.

## F. Before vs After Benchmark

### 측정 조건

- 동일 기기: Apple arm64 Mac16,1, RAM 24GiB, logical CPU 10. Node v24.13.0, MongoDB 8.2.6, 동일 node_modules.
- 원본 detached worktree: `/tmp/matths-performance-before.bZ3Q7T`. 원본 코드 변경 없이 주 workspace의 같은 harness로 실행.
- 운영 수정 **전에** v1 fixture로 15 warm 반복 원본 baseline과 CPU profile을 확보했다. 최종 fixture에서는 시험 상태를 실제 schema의 archived로 보정하고 고정 question-concept ID를 사용했다. 이 때문에 최종 표는 **v2끼리만** 비교하고 v1→v2 숫자를 섞지 않았다.
- v2: 학생 96명, 반 12개, 교육과정 개념 60개, 문제 300개, 풀이 28,800건, 주간 시험 12개/응시 1,152건. 선생님·운영자·연결 학부모도 생성.
- 사용자/학원은 실제 모델 생성, 시험은 모델 validation. 풀이 이력은 측정 필드가 동일한 synthetic raw 문서다. 실제 운영 데이터 복제본은 아니다.
- fresh localhost replica set을 실행마다 생성하고 스키마 index init 및 seed를 양쪽 동일하게 완료했다. 환경변수의 실서비스 credential은 제거했다. 운영 DB URI를 입력받지 않는다.
- bcrypt 로그인, MongoDB session store, 계정/권한 middleware 포함. 로그인/fixture 준비 시간은 요청 통계에서 제외한다. API도 실제 로그인 token 사용.
- 테스트 환경에서 운영과 동일한 EJS view cache를 명시적으로 켰다. 압축 포함. 스케줄러와 외부 provider는 양쪽 모두 제외한다. 따라서 운영의 백그라운드 부하까지 포함한 결과는 아니다.
- 각 경로 첫 호출 1회 + warm 25회. 원본 웹 → 수정본 웹 → 원본 API → 수정본 API 순서로 순차 실행했다. 다른 테스트/프로파일을 동시에 돌리지 않았다.
- 동시 주간 통계는 각 버전별 fresh DB에서 1회 warm-up 후 8개 동시 호출×10 round로 별도 측정했다. 서비스 직접 호출이므로 HTTP·인증 비용은 포함하지 않는다.
- “첫 호출/cold”는 **해당 프로세스에서 해당 경로의 첫 실행**이다. 이전 경로가 공유 module/DB cache를 데웠을 수 있고 프로세스 기동·완전 cold DB를 매 경로마다 재현하지 않는다.
- HTTP 시간은 local client 요청 시작부터 전체 응답 수신/디코딩까지다. SSR/직렬화/압축/세션 작업을 포함한다. TTFB는 헤더 도착 시각이지 브라우저의 첫 유효 렌더가 아니다.
- 서비스 시간은 함수 자체 실행만 포함한다. 결과 payload 크기 산출을 위한 추가 JSON.stringify 시간은 제외했다.
- CPU는 Node process.cpuUsage이며 같은 프로세스의 local HTTP client/driver도 포함한다. MongoDB 프로세스 CPU는 미측정.
- DB 명령 수는 find/aggregate/count/distinct/getMore 및 실제 쓰기를 포함한다. 서로 병렬인 명령의 duration 합은 wall time에서 뺄 수 없다.
- 각 실행의 평균/min/max/p50/p95, TTFB, 압축 전/후 bytes는 raw JSON에 보존했고, 검토용 results.json에는 cold·p50·p95와 주요 p50 지표를 요약했다.
- 25표본 p95는 불안정하고 GC/기기 부하/실행 순서 영향이 있다. 단일 비교를 통계적 인과 증명으로 취급하지 않는다.

### 서비스별 결과

| 역할·경로 | 첫 호출 ms 전→후 | warm p50 ms 전→후 | warm p95 ms 전→후 | p50 감소율 | DB 명령 전→후 |
|---|---:|---:|---:|---:|---:|
| weekly-academy | 15.8→22.3 | 15.5→20.0 | 19.0→21.1 | -29.2% | 42→5 |
| math-map-class | 266.2→280.5 | 255.6→235.8 | 318.1→296.6 | 7.7% | 5→5 |
| math-map-student | 5.8→5.0 | 4.8→4.2 | 5.6→5.6 | 13.1% | 4→4 |
| monthly-academy | 79.9→74.4 | 70.4→69.8 | 75.7→71.5 | 0.8% | 3→3 |
| date-keys-1000 | 33.2→5.0 | 30.9→4.3 | 32.9→4.7 | 86.1% | 0→0 |

### CPU·DB 시간 합·결과 크기

| 경로/작업 | Node CPU p50 ms 전→후 | DB 명령 시간 합 p50 ms 전→후 | 응답/결과 bytes 전→후 |
|---|---:|---:|---:|
| teacher /academy | 235.4→193.5 | 503.0→310.0 | 26716→26716 |
| admin /admin/academies/:academyId/analytics | 237.0→190.3 | 491.0→294.0 | 100313→100313 |
| student /wrong-notes | 12.2→6.9 | 10.0→8.0 | 60240→60240 |
| math-map-class | 202.7→180.0 | 174.0→165.0 | 8741378→8741378 |
| weekly-academy | 12.6→8.9 | 178.0→25.0 | 86054→86054 |
| date-keys-1000 | 30.6→4.6 | 0.0→0.0 | 13001→13001 |

### 동시 주간 집계

| 지표 | 원본 | 수정본 | 변화 |
|---|---:|---:|---:|
| 8개 동시 호출 round p50 | 108.2ms | 80.4ms | -25.7% |
| round p95 | 124.1ms | 100.0ms | -19.4% |
| Node CPU p50/round | 141.9ms | 81.9ms | -42.3% |
| 요청당 DB 명령 | 42 | 5 | -88.1% |
| p50 round 기반 처리율 | 74.0 req/s | 99.6 req/s | +34.6% |

Math Map의 **8,741,378 bytes는 서비스 전체 결과를 JSON으로 기록한 크기**다. 학원 HTML의 전송량과 다르다. 반환 필드를 삭제하지 않았으므로 결과 크기는 그대로다. snapshot 본문을 크게 넣은 edge fixture에서도 동등성을 확인했지만, 그 큰 snapshot에 대한 별도 latency 개선율은 측정하지 않았으므로 제시하지 않는다.

첫 v1 측정에서는 선생님 대시보드 337.6ms, 운영자 학원 분석 312.5ms였고 초기 수정 측정은 각각 약 254.1ms, 269.5ms였다. 더 큰 개선처럼 보이지만, 최종 v2에서 그 폭이 재현되지 않았으므로 초기 수치를 대표 개선율로 채택하지 않는다.

### 재현 명령

외부 운영 서비스는 연결하지 않는다. 아래 harness는 전용 memory DB만 생성한다. 처음 실행할 때 MongoDB binary download가 필요할 수 있다. 원본 worktree는 위 경로에 보존돼 있다.

```sh
node audit/performance/inventory.js
node audit/performance/benchmark.js --root=/tmp/matths-performance-before.bZ3Q7T --label=before-reproduced --runs=25
node audit/performance/benchmark.js --label=after-reproduced --runs=25
node audit/performance/benchmark.js --root=/tmp/matths-performance-before.bZ3Q7T --label=api-before-reproduced --surface=api --runs=25
node audit/performance/benchmark.js --label=api-after-reproduced --surface=api --runs=25
node audit/performance/verifyEquivalence.js
node audit/performance/runTests.js --label=tests-reproduced --prepare
node audit/performance/checkMathMapIndex.js
node audit/performance/benchmarkConcurrentWeekly.js --root=/tmp/matths-performance-before.bZ3Q7T --label=weekly-concurrent-before --concurrency=8 --rounds=10
node audit/performance/benchmarkConcurrentWeekly.js --label=weekly-concurrent-after --concurrency=8 --rounds=10
```

Raw 실행 결과/첫 응답 snapshot/테스트 로그는 `outputs/performance/`에 있으며 .gitignore 대상이다. 공유 가능한 요약은 추적 대상인 results.json에 남겼다. 원본 비교는 baseline commit이 로컬 git에 존재해야 한다.

## G. Remaining Bottlenecks

1. **Math Map 전체 이력과 큰 반환 객체.** projection/Map 적용 후에도 전체 matching 이력의 sort/group, BSON 역직렬화, 96명별 분석 결과 구성이 남았다. profile에서 BSON deserialize/객체 처리와 GC가 두드러졌다. 프로파일은 기동·seed도 포함하므로 함수별 총 sample을 요청별 CPU ms로 오인하지 않는다. UI가 현재 일부만 소비하더라도 공개 서비스 결과를 줄이면 계약 변경이므로 하지 않았다.
2. **최근 20건 전에 전체 이력을 push하는 집계.** MongoDB 5.2+의 bounded accumulator를 검토할 여지는 있지만 배포 MongoDB 버전을 확인하지 못했다. 로컬 8.2.6만 보고 최소 지원 버전을 올리지 않았다. [$firstN/$topN 계열](https://www.mongodb.com/docs/manual/reference/operator/aggregation/topN/) 적용 전 운영 버전 및 동점/window/필터 순서 검증 필요.
3. **학원 통계 facet의 trade-off.** 명령 수·Node CPU와 8개 동시 요청 round 시간은 줄었지만 격리한 단일 weekly-academy 호출은 느려졌고, 운영자 웹 analytics의 p95도 악화했다. Mongo CPU, 메모리, connection pool 대기, 장시간 동시 사용자 throughput과 운영 DB RTT를 측정해야 한다. 이 부분을 “모든 부하에서 최대 효율이 증명됐다”고 보지 않는다.
4. **월간 통계 약 70ms.** 이미 세 개의 병렬 aggregate와 facet/Map을 사용한다. 선택 기간의 풀이·활동 집계는 필요 작업이다. materialized summary는 정정/재채점/실시간 반영 보장을 추가 설계해야 하므로 미적용.
5. **랭킹 전역 코호트.** 최신 평가 선택, 현재 standing, 사용자/효과/프로필을 합치고 전역 순위를 계산한다. 전체 평가 이력 조회를 DB latest-per-user로 바꾸려면 동일 시각 동점 및 순위 tie 계약 검증이 필요하다. 현재 fixture에는 큰 active-ranking/결제 cohort가 없어 운영 성장 시 비용은 미측정.
6. **인증/가족/학원 관계 재조회.** 운영자 권한 변경·정지·탈퇴·자녀 연결 해제를 즉시 반영해야 한다. 요청 캐시라도 write/재확인 경계를 분석하지 않고 적용하지 않았다. 사용자 데이터 TTL cache는 별도 consistency 변경이다.
7. **GOAT Arena 영상.** 현재 desktop 파일 약 29MiB, mobile 약 7.6MiB이며 preload=auto, 재생 시간에 따른 화면 공개 흐름이 있다. 실제 모바일 대역폭/FCP/LCP/INP는 측정하지 못했다. 무손실 대체/전송 계층 개선은 후속 검토할 수 있으나 화질·영상·공개 타이밍 변경은 본 요청의 동일 UX 조건에 맞지 않아 하지 않았다.
8. **외부 서비스.** SMTP/Cloudinary/R2/OAuth/결제, 실제 PDF 원본 다운로드·운영 background 처리 지연은 측정 범위 밖이다. 개인별 PDF 발급·재무 원장·outbox idempotency를 건너뛰지 않았다.
9. **큰 데이터의 목록/API.** 사용자/게시글/원장/증분 오답 sync는 실제 production 분포와 cursor 사용 패턴을 더 측정해야 한다. 페이지 크기/반환 필드/순위 결과를 임의로 제한하지 않았다.

즉 안전한 구현 수준의 여러 낭비는 제거했지만, repository 전체가 전역적으로 최적이라는 증명이나 모든 운영 병목의 해소는 아니다. 운영 데이터/브라우저/외부 연동 없이 그 주장을 하지 않는다.

## H. Verification

### 원본·수정본 직접 비교

[audit/performance/verifyEquivalence.js](</Users/sangyoonlee/Desktop/SangYoon Lee/SINGAPORE 2025-/Personal Projects/Matths-Official/audit/performance/verifyEquivalence.js>)는 git 원본 서비스와 수정 서비스를 별도로 로드해 고정 시각 및 동일 Mongo fixture에서 deep equality를 검사한다. 실제 운영에는 test hook이나 고정 시각을 주입하지 않는다.

- Math Map: 빈 입력, 한 명/96명, 중복 ID, invalid ID, 교육과정 cache reload, 동점 submittedAt/_id, 20건 초과 window.
- snapshot 누락/큰 본문, 난이도/type fallback, primaryConcept 불일치, 재시도 존재 및 성공/실패 연결.
- 추천: 200개 결정적 입력의 후보 우선순위·동점 순서.
- 웹 오답노트: 실제 결과 구조, 정렬/페이지/상태 필터 및 formatter 오류.
- 주간 통계: 전체+12반, 빈/보관 반, 미배정 학생, 무효/확정 대기/누락 field, null/missing score, MongoDB boolean truthiness.
- facet 한도 오류 fallback의 원본과 동일 결과, 관련 없는 DB 오류 전파.
- KST 자정, 윤년, 연도 전환, null/invalid-date 처리.
- 기존 auth/session/rate-limit, 학원 포털, iPad academy HTTP, ranking, wrong-note review, 결제 권한/학부모 결제 등 해당 검증 명령도 통과.

HTTP/API 200 smoke와 일부 auth 거절을 확인했지만, 모든 HTML/JSON의 모든 분기를 byte-for-byte 동등하다고 주장하지 않는다. 실시간 timestamp/세션/생성 ID가 있는 전체 snapshot hash는 자동 동등성 판정으로 사용하지 않았다.

### 기존 검증 명령 결과

package.json의 verify/validate 명령을 수집해 독립 실행했다. 첫 실행은 145 pass / 14 fail / 1 timeout / 7 skip이었다. 부족한 fixture를 명시적으로 준비하고 원본·수정본에서 다시 실행했다.

- pricing-entitlements DB 및 private-mock restriction: 제공된 test-account seed와 전용 테스트 비밀번호로 준비 후 양쪽 통과.
- problem-type catalog: 로컬 카탈로그 sync 후 양쪽 통과.
- study-hall DB: 로컬 관리자 fixture 준비 후 양쪽 통과. 최초 실행 timeout은 fixture 부재 후 연결이 닫히지 않은 경로에서 발생했다.
- 최종 결과: **149 pass / 10 fail / 8 skip**. 추가 동등성 테스트와 syntax/diff 검사 별도 통과.

남은 10개 실패는 baseline에서 같은 원인으로 재현됐다:

| 검증 명령 | 재현 원인 |
|---|---|
| arena-tier-catalog:verify | 격리 DB에 적용 중인 T1~T9 카탈로그 없음 |
| arena-tier-catalog:verify-file | 검사 대상 JSON 경로 인자 없음 |
| arena-match-settlement:verify-db | 기존 테스트 문항 pack이 현재 validation에서 INVALID_ARENA_PROBLEM_PACK |
| arena-revenge:verify-db | 동일한 문제 pack validation 실패 |
| arena-main-settlement:verify-db | 동일한 문제 pack validation 실패 |
| contrast:verify | 기존 저대비 CSS selector 검증 실패 |
| navigation-performance:verify | 기존 Arena preload=auto가 테스트의 metadata 기대와 불일치; 자산 크기도 기준 초과 |
| arena-test:verify-db | ARENA_TEST_ACTOR_USERNAME 및 해당 데이터셋 필요 |
| arena-main-rulebook:verify-db | 기존 렌더 문구와 테스트 기대 불일치 |
| pdf-watermark:verify-db | 테스트가 지정한 원본 PDF 파일 부재. 별도 로컬 PDF 검증은 통과 |

8개 제외는 live SMTP 2개, Cloudinary, R2, R2 storage-lifecycle, 운영 서버 검증, 중복 catalog alias, composite launch 명령이다. composite의 개별 구성 검증은 별도 실행했다. storage-lifecycle은 첫 offline 실행에서 관리자 fixture 부재로 실패했고, 소스 확인상 실제 R2 upload/delete를 요구하므로 추가 seed로 진행하지 않고 외부 연동 제외로 분류했다.

이 실패들을 숨기거나 테스트 기대값을 바꿔 통과시키지 않았다. 원본에서도 재현됐다는 것은 이번 수정의 신규 회귀가 아니라는 근거이지, 현재 제품에 결함이 없다는 뜻은 아니다.

### 최종 변경 검토

- 수학 공식/상수/채점/권한/DB 필터/분모/정렬 계약 유지.
- user/date/result cache 추가 없음. formatter 구성만 재사용.
- 모델/인덱스/운영 데이터/외부 서비스 변경 없음.
- 대상 서비스와 도구의 Node syntax 검사, git diff whitespace 검사 수행.
- 실사용량에 대한 성능 보장 및 모든 기존 테스트 green 상태는 **아직 확인되지 않음**.

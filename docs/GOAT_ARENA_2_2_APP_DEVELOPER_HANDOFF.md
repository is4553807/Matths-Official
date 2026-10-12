# Matths / GOAT Arena 2.2 앱 개발 인수인계

- 기준일: 2026-10-11 (KST)
- 대상: iOS/iPadOS 및 이후 모바일 클라이언트 개발자
- 서버 저장소: `Matths-Official`
- 현재 상태: 로컬 구현 및 자동 검증 완료, 프로덕션 미배포, 경쟁전 기본 비활성
- 제품 규칙 버전: `GOAT_ARENA_2_2`

이 문서는 지금까지 확정된 제품 결정과 현재 서버 구현을 앱 개발자가 이어받을 수 있도록 정리한 인수 기준서다. 앱은 아래 규칙을 별도로 재구현하지 않고 `/api/v1` 계약과 서버가 반환하는 상태를 표시해야 한다. 세부 필드나 문구가 이 문서와 실제 응답 사이에서 다르면 임의로 추정하지 말고 서버 컨트롤러·서비스·모델을 함께 대조한다.

## 1. 가장 중요한 구현 원칙

1. MongoDB와 서버 서비스가 계정, 경기, 타이머, 채점, MMR, 공개 점수, 증거, 결제와 운영 상태의 정본이다.
2. 웹과 앱은 같은 경기 서비스와 같은 DB 문서를 사용한다. 앱 전용 채점식, MMR 계산식, 난도 계산식 또는 별도 경기 상태를 만들지 않는다.
3. 앱의 상태 변경 요청은 Bearer 인증, `Idempotency-Key`, 경기 명령의 `X-Matths-Client-Version` 계약을 지킨다.
4. 서버가 반환한 `code`, HTTP 상태, 현재 revision과 경기 상태를 기준으로 충돌·재시도 UI를 만든다. 성공으로 추정하거나 클라이언트에서 강제 상태 전환하지 않는다.
5. 경쟁전은 `ARENA_COMPETITIVE_ENABLED=false`가 기본이다. 앱이 자체 플래그로 활성화하거나 비활성 상태를 사용자 규정 문구에 노출하지 않는다.
6. 기존 GOAT Arena의 어두운 네이비·보라·청록 계열 디자인을 유지한다. 기능 구현을 이유로 전체 디자인을 재설계하지 않는다.
7. 사용자용 화면에는 `비동기`, `과거 기록`, `방어`, `Z-score`, Glicko 공식 같은 내부 구현 용어를 설명하지 않는다. 상대는 “비슷한 실력의 유저”, 계산값은 “난도 보정 성취지표” 정도로 표현한다.
8. 공식 정답지나 모범 풀이를 별도 화면으로 제공하지 않는다. 결과에는 사용자가 실제 제출한 답과 정오답, 실제 풀이과정만 표시한다.

## 2. 현재 제품 전체 변경 요약

### 2.1 계정과 플랜

- 학생 플랜은 `FREE`와 `PRO` 두 가지다.
- 무료 플랜은 0원, 만료 없음이다.
- Pro 기본값은 30일 5,500원이다.
- 운영값은 `MATTHS_PRO_PRICE_KRW`, `MATTHS_PRO_BILLING_PERIOD_DAYS`로 조정한다.
- 관리자는 `SUPER_ADMIN`으로 해석하며 만료 없는 관리자 권한을 유지한다.
- 일반 학생의 과거 상품·패스·페이백 권한을 앱에서 표시하거나 권한 판정에 사용하지 않는다.
- 웹 Pro 결제는 KG Inicis, 네이티브 Pro 구매는 `APPLE_PRO_PRODUCT_ID`와 Apple 거래 검증을 사용한다.
- 네이티브 Pro 판매를 실제로 열기 전 Apple 상품, Sandbox 구매·복원·갱신·환불을 별도로 검증해야 한다.
- 플랜 정본 서비스는 `services/accountPlanService.js`다.
- 기존 사용자를 무료 플랜으로 바꾸는 운영 스크립트는 `scripts/migrateUsersToFreePlan.js`다. 현재 제품 전제는 보존해야 할 기존 사용자·재무·진행 중 구형 경기 0건이다.

### 2.2 제거된 구형 개념

- 페이백, Arena 상점, 구형 유료 경기 경제, 자동 방어 배정, 방어 의무, 복수 상품 패스, 기존 Arena Standing을 활성 제품에서 사용하지 않는다.
- “방어해야 할 경기가 배정되었습니다” 같은 메일을 보내지 않는다.
- 일반전 이상 감지 검토 이메일도 보내지 않는다.
- 과거 랭크업 영상·오버레이와 구형 랭킹·페이백 화면은 활성 사용자 흐름에서 제거했다.
- `ArenaStanding` 또는 `LiveFinalRankingProfile`을 현재 Arena/랭킹 정본으로 사용하지 않는다.
- 전체·고등학교·대학교·N수생·직장인 랭킹은 모두 경쟁전 공개 점수의 랭킹이다.

## 3. 공통 경기 계약

| 항목 | 확정 규칙 |
| --- | --- |
| 문항 수 | 5문항 |
| 제한 시간 | 문항당 10분 |
| 답안 | 서버 형식에 맞는 답안 필수 |
| 풀이과정 | 5문항 모두 필수 |
| 데스크톱 | 문제별 또는 최종 파일 업로드 흐름 |
| iPad/휴대폰 | 각 문제 아래 격자 풀이판 |
| 유효 풀이 시간 | 촬영·업로드 시간 제외 |
| 문항 이동 | 이동 시 현재 답안과 풀이과정을 잠그고 다음 문항으로 이동 |
| 최종 제출 | 답안과 5개 풀이과정이 모두 준비돼야 가능 |
| 포기 | 최종 풀이 증거 제출 이후 자발적 포기 불가 |
| 이용 가능 시간 | 요일 제한 없이 24/7, 일요일 포함 |

앱은 타이머가 화면을 닫았다고 멈춘다고 가정하면 안 된다. 서버가 제공하는 시작 시각, 문항 마감, 현재 문항, attempt 상태를 사용해 복원한다. 네트워크 단절 후 재접속할 때도 서버 상태를 다시 읽고 로컬 상태를 덮어쓴다.

### 3.1 결과 공통 표시

일반전과 경쟁전 결과에는 양쪽 참가자에 대해 아래를 표시한다.

- 실제 출제된 5문항
- 각 문항의 출처 정답률
- 각 참가자가 제출한 답안
- 문항별 정답/오답
- 총 정답 수
- 유효 풀이 시간
- 난도 보정 성취지표
- 제출한 전체 풀이과정
- 승리·패배·무승부 이유를 설명하는 서버 문구

상대 풀이 파일은 결과 공개 상태와 조회 권한을 서버가 승인한 경우에만 불러온다. 저장소 키를 직접 조합하거나 공개 URL로 캐시하지 않는다.

## 4. 일반전

### 4.1 목적과 진입

- 로그인한 학생이 무료로 이용한다.
- 일반전 공개 순위표와 일반전 티어는 없다.
- 최초 숨은 MMR은 1000이다.
- 일반전 완료는 기존 XP 규칙을 따른다.
- 유효한 일반전 3경기는 경쟁전 배치고사 해금 조건에 포함된다.

### 4.2 상대와 문제 선택

- 서버는 사용자의 숨은 MMR과 가까운 승인된 실제 일반전 완료 기록을 우선 찾는다.
- 실제 기록이 부족한 초기에는 운영자가 검수하고 `ACTIVE`로 전환한 기준 문항 기록을 조합한다.
- 기준 데이터는 고정 5문항 세트가 아니라 문제별 레코드다. 같은 난도에서 5개를 조합하므로 세트 수를 미리 고정하지 않는다.
- 사용자와 상대 기록은 서로 다른 5문항일 수 있다.
- 사용자가 본 문제 인스턴스는 일반전과 경쟁전을 합친 다음 10경기 동안 같은 사용자에게 다시 주지 않는다.
- 상대 기록 자체는 적격한 다른 사용자에게 즉시 재사용할 수 있다. 과거에 논의했던 20경기 기록 재사용 금지는 현재 규칙이 아니다.
- 문항 구성은 대수 2, 미적분 I 2, 확률과 통계 1을 기본으로 한다.
- 일반전 난도 코드는 U1~U9다.

### 4.3 승패와 숨은 MMR

- 단순 정답 수만으로 승패를 정하지 않는다.
- 각 문제의 서버 정오답과 출처 정답률로 5문항의 난도 보정 성취지표를 계산한다.
- 두 성취지표 차이가 설정된 근소 범위보다 크면 높은 쪽이 이긴다.
- 차이가 근소할 때만 유효 풀이 시간이 짧은 쪽이 이긴다.
- 성취지표도 근소하고 시간도 같으면 무승부다.
- 결과 확정 시 현재 사용자만 숨은 MMR, RD, volatility, 전적과 streak를 한 번 갱신한다.
- 상대 기록 소유자의 현재 값은 바꾸지 않는다.
- 연승 뒤 첫 패배, 연패 뒤 첫 승리에는 직전 흐름 길이에 따른 설정 가능한 완충 배율을 적용한다.

### 4.4 일반전 무결성 처리

- 자동 이상 감지는 실행한다.
- 이상 신호가 있어도 사용자 결과, XP, 이용 권한을 지연하거나 벌점 처리하지 않는다.
- 이메일을 보내지 않는다.
- 신호가 없는 기록은 자동으로 상대 기록 풀의 `AVAILABLE`이 된다.
- 신호가 있는 기록은 `REVIEW_REQUIRED`로 보류한다.
- 운영자 승인 시 `AVAILABLE`, 거부 시 `INVALID`다.

### 4.5 앱 사용자 흐름

1. `GET /api/v1/goat-arena`에서 읽기 모델과 활성 경기 상태를 읽는다.
2. 일반전 시작 요청을 보낸다.
3. 서버가 만든 경기 ID로 상세와 문항을 읽는다.
4. 시작 명령 후 문항별 답안과 격자 풀이판을 저장한다.
5. 문제 이동 전에 현재 보드 revision 저장 성공을 확인한다.
6. 다섯 번째 문항 이후 5개 보드를 finalize한다.
7. 서버 정산 상태를 다시 조회한다.
8. 일반전 결과 API로 양쪽 문제·답안·풀이와 설명을 표시한다.
9. 완료 결과에서 단체 도전장 생성 기능을 제공한다.

## 5. 경쟁전

### 5.1 현재 릴리스 상태

- 코드는 구현돼 있지만 `ARENA_COMPETITIVE_ENABLED` 기본값은 `false`다.
- 앱은 서버 `available`, `eligible`, `releaseStatus`를 그대로 따른다.
- 서버가 비활성인데 앱만 경쟁전 시작 버튼을 강제로 작동시키면 안 된다.
- 사용자용 규정에는 “아직 열려 있지 않다”는 운영 상태 문구를 넣지 않는다. 규정은 경기 규칙만 설명한다.

### 5.2 해금과 배치고사

- 유효한 일반전 3경기를 완료해야 배치고사를 시작할 수 있다.
- 배치고사는 1회부터 최대 5회까지 유효 표본을 모은 뒤 사용자가 확정한다.
- 서버 오류는 배치 시도를 소비하지 않는다.
- 사용자 자발적 중단은 자동 복원하지 않는다.
- 5회 소진 후 유효 결과가 없으면 운영자 승인 초기화가 필요하다.
- 기존 티어를 새 MMR로 자동 변환하지 않는다.

### 5.3 내부 MMR과 공개 경쟁전 점수

경쟁전에는 서로 다른 두 값이 있다.

| 값 | 용도 | 사용자 공개 |
| --- | --- | --- |
| 내부 Glicko-2 MMR | 상대 선택, 기대 승률, 공개 점수 증감 폭 계산 | 원칙적으로 내부 지표 |
| 공개 경쟁전 점수 | 티어와 모든 경쟁전 랭킹 | 표시 |

후속 앱 구현에서 두 값을 하나의 `rating`으로 합치면 안 된다.

초기 운영 가설은 다음과 같다.

| 항목 | 값 |
| --- | ---: |
| 기본 Rating | 1500 |
| 기본 RD | 350 |
| 기본 Volatility | 0.06 |
| Tau | 0.5 |
| 배치 RD | `350 / sqrt(유효 배치 표본 수)` |
| 배치 1~5회 Volatility | 0.10, 0.09, 0.08, 0.07, 0.06 |

이 값들은 영구 보정값이 아니라 환경설정 가능한 초기 가설이다. 표본이 적은 사용자는 큰 RD와 volatility로 시작해 초기 경기에서 더 크게 움직이고, 이후 매 경기 Glicko-2가 연속적으로 수렴한다. 5번째와 6번째 경쟁전 사이에 인위적인 단계 전환은 없다.

### 5.4 경기·정산

- 서버는 내부 MMR이 가까운 사용자의 승인된 경쟁전 완료 기록 하나를 선택한다.
- 상대 기록의 당시 MMR, RD, volatility, 문제, 정답률, 정오답, 유효 시간과 풀이를 경기 스냅샷으로 고정한다.
- 서로 다른 5문항을 받을 수 있다.
- 승패 평가는 일반전과 같은 난도 보정 성취지표 계약이다.
- 확정된 한 경기당 현재 도전자의 내부 MMR을 정확히 한 번 갱신한다.
- 그 결과와 양쪽 내부 MMR의 기대 승률을 사용해 공개 경쟁전 점수를 별도로 증감한다.
- 상대 기록 소유자의 현재 MMR, 공개 점수, 전적, XP는 절대 소급 변경하지 않는다.
- 경기별 고유 정산 원장과 트랜잭션으로 중복 반영을 막는다.
- 경쟁전에는 기존 자동 무결성 감지, 보류, 추가 소명과 운영자 판정 흐름이 적용된다.

### 5.5 공개 점수와 티어

기본 공개 점수 후보 계산은 내부 MMR 기대 승률과 실제 결과를 사용하는 Elo 형태이며 `K=32`, scale `400`, 최소점수 `0`이 모두 설정 가능하다. 앱은 계산하지 않고 서버가 반환한 이전 점수, delta와 이후 점수를 표시한다.

현재 티어 컷오프는 다음과 같다.

| 티어 | 공개 경쟁전 점수 |
| --- | ---: |
| 브론즈 | 0–799 |
| 실버 | 800–924 |
| 골드 | 925–1024 |
| 플래티넘 | 1025–1119 |
| 에메랄드 | 1120–1209 |
| 다이아몬드 | 1210–1329 |
| 마스터 | 1330–1439 |
| 그랜드마스터 | 1440–1519 |
| 챌린저 | 1520 이상 |

현재 공개 티어는 공개 경쟁전 점수 컷오프로 결정된다. 인구수 기반 상한 함수는 현재 경기·랭킹 경로에서 사용하지 않는다. 앱은 서버가 반환한 공개 점수 기준 최종 티어를 사용한다.

## 6. 회원 친선전

- 친구 관계인 로그인 회원끼리 초대하고 수락한다.
- 각 참가자의 유효 MMR은 경쟁전 내부 MMR을 우선하고, 없으면 일반전 숨은 MMR, 둘 다 없으면 1000이다.
- 문제 난도는 두 참가자 유효 MMR의 평균으로 정한다.
- 친선전은 MMR, 공개 경쟁전 점수, 티어, XP를 바꾸지 않는다.
- 자동 부정행위 감지를 실행하지 않는다.
- 친선전 초대·수락·취소 상태는 서버 상태를 따른다.

## 7. 단체 도전장

도전장은 1대1 게스트 경기가 아니라, 한 회원이 자신이 완료한 5문항을 단체 채팅방 등에 공유하고 여러 참가자가 같은 문제를 풀어 순위를 만드는 기능이다.

### 7.1 생성

- 로그인 회원이 완료한 일반전 또는 경쟁전 결과에서 생성한다.
- 계정에 연결된 완료 게스트 기록에서도 역도전장을 만들 수 있다.
- 링크는 생성 시점부터 정확히 3일 동안 신규 참가를 받는다.
- 참가 인원 제한은 현재 없다.
- 생성 버튼 성공 시 링크를 클립보드에 자동 복사한다.
- 같은 화면 아래에 링크를 직접 표시하고 오른쪽에 별도 `링크 복사` 버튼을 둔다.
- 생성자의 해당 경기와 풀이 파일에는 도전장 보존 hold를 설정한다.

### 7.2 게스트 진입

- 로그인·회원가입 없이 공개 링크에 들어온다.
- 닉네임과 생년월일을 입력한다.
- 별도 중복확인 버튼은 두지 않는다. 입력 중 서버에 자동 확인하고 `사용 가능/불가능` 문구를 표시한다.
- 회원과 게스트는 정규화된 하나의 닉네임 네임스페이스를 공유한다.
- 생년월일 원문을 일반 응답이나 클라이언트 영구 저장소에 보관하지 않는다.
- 같은 링크의 같은 닉네임+생년월일 조합은 한 번만 시도할 수 있다.
- 같은 조합으로 다시 접속하면 진행 중 시도를 이어가거나, 완료했다면 바로 순위표를 연다.
- 다른 닉네임+생년월일 조합은 별도 참가자로 처리한다.
- 생성자 자신은 게스트로 중복 참가할 수 없다.

### 7.3 경기와 순위

- 모든 게스트는 생성자가 풀었던 정확히 같은 5문항을 푼다.
- 풀이과정은 일반전처럼 필수다.
- 앱/모바일 웹은 문제별 격자 풀이판을 사용한다.
- 자동 부정행위 검사를 실행하지 않는다.
- 도전장은 어떤 MMR, 공개 경쟁전 점수, 티어 또는 XP도 바꾸지 않는다.
- 순위는 정답 수 내림차순, 동점이면 유효 풀이 시간 오름차순이다.
- 정답 수와 시간까지 같으면 공동 순위다.
- 난도 보정 성취지표는 결과 정보로 저장·표시하지만 도전장 순위의 1차 기준은 아니다.

### 7.4 결과 공개

- 발신자 점수와 풀이과정은 현재 참가한 사람이 모두 완료한 순간 공개한다.
- 한 번 공개된 뒤 새 참가자가 들어와도 다시 숨기지 않는다.
- 순위표의 각 참가자에는 상세 탭이 있다.
- 상세 탭은 실제 문제, 제출 답, 정오답, 정답률, 시간, 난도 보정 성취지표와 전체 풀이과정을 보여준다.
- 권한이 없는 브라우저가 게스트 풀이 파일 URL을 직접 조회할 수 없어야 한다.

### 7.5 가입·기록 연결·역도전장

- 완료한 게스트는 순위 화면에서 `역도전장 제안하기`를 누를 수 있다.
- 먼저 회원가입을 완료해야 한다.
- 기존 게스트 기록은 닉네임만으로 연결하지 않는다.
- 동일 닉네임, 생년월일 digest, 브라우저 ownership proof, 최초 참가일 확인과 사용자의 명시적 동의가 모두 필요하다.
- 연결된 뒤 회원은 그 게스트 기록을 자신의 기록으로 열고 같은 문제로 새 도전장을 만들 수 있다.

## 8. 주간 모의고사와 랭킹

- 주간 모의고사는 배치가 완료된 응시자의 경쟁전 내부 MMR, RD와 volatility에만 영향을 준다.
- 공개 경쟁전 점수와 티어를 직접 바꾸지 않는다.
- 응시하지 않은 사람은 내부 MMR도 공개 점수도 변하지 않는다.
- 동일 사용자·주차는 `ArenaWeeklyMockRatingSettlement` 고유 원장으로 한 번만 반영한다.
- 정답 정정으로 대표 결과가 바뀌면 기존 정산과 새 정산의 차이만 현재 내부 MMR에 보정한다.
- 구형 주간 공개 GP, 승급, `RankingProfile` 기반 전체 랭킹을 앱에 표시하지 않는다.
- 최종 종합, 고등학교, 대학교, N수생, 직장인 랭킹은 배치 완료 `ArenaCompetitiveProfile.competitiveScore`만 사용한다.

## 9. 내부 평가식: 서버 참고용, 앱에서 재계산 금지

### 9.1 경기 성취지표

각 문제의 정오답을 `x`(0 또는 1), 원본 정답률을 `p`(0보다 크고 1보다 작은 소수)라고 할 때 서버는 다섯 문제에 대해 다음 값을 만든다.

```text
correctCount = Σx
expectedCorrect = Σp
variance = Σp(1-p)
z = (correctCount - expectedCorrect) / sqrt(variance)
```

- 정확히 5문항이 아니거나 정답률이 없거나 0/1 극단값이면 공식 비교를 만들지 않는다.
- 일반전·경쟁전의 현재 비교 정책은 `DIFFICULTY_CORRECTNESS_TIME_V1`이다.
- 도전장 순위 비교 정책은 `CORRECT_COUNT_THEN_SOLVE_TIME_V1`이다.
- 앱은 서버가 반환한 결과와 설명을 표시하고 위 식으로 승패를 재계산하지 않는다.

### 9.2 Glicko와 공개 점수

- 내부 Glicko 정산: `services/glicko2Service.js`
- 연승·연패 반전 완충: `services/arenaAdaptiveRatingService.js`
- 공개 경쟁전 점수: `services/arenaCompetitivePointService.js`
- 일반전 정산: `services/arenaAsyncNormalService.js`
- 경쟁전 정산: `services/arenaAsyncCompetitiveService.js`
- 경기별 원장: `ArenaRatingSettlement`
- 주간 원장: `ArenaWeeklyMockRatingSettlement`

## 10. 문항·기준 데이터

### 10.1 문항 생성

- 기존 문제 skeleton과 유형 카탈로그를 재사용한다.
- 생성된 문항 본문, 선택지/입력 형식, 서버 정답, 출처 정답률, 난도 코드와 생성 버전을 경기 시점에 봉인한다.
- 그래프 skeleton이 있는 문제는 그래프 asset과 함께 정상 렌더링해야 한다.
- 일반전 U1~U9, 경쟁전 R1~R9 난도 체계를 사용한다.
- 앱은 raw skeleton을 자체 변형하지 않고 서버가 전달한 렌더링 가능한 문제 payload를 사용한다.

### 10.2 일반전 초기 기준 문항

- 9개 난도 × 난도별 7개 = 63개 초안과 격자 풀이 이미지 작업 자료가 있다.
- 기준 문항은 문제별로 저장하고 경기 시작 시 같은 난도 5개를 조합한다.
- `DRAFT/READY_FOR_REVIEW/ACTIVE/RETIRED`와 같은 운영 상태에서 `ACTIVE`만 실제 매칭에 사용해야 한다.
- 정답, 정답률, 기준 풀이 시간과 손풀이 원본이 모두 검수되기 전 활성화하면 안 된다.
- 과거 초안에서 `NORMAL-U1-Q02` 답안 오류가 발견된 전례가 있으므로 생성 파일의 자동 검증 통과만으로 수학적 정답 검수를 대체하지 않는다.
- 현재 기준 자료: `audit/GOAT_ARENA_NORMAL_BASELINE_63_QUESTIONS.md`, `audit/GOAT_ARENA_NORMAL_BASELINE_CAPTURE_PLAN.json`, `audit/GOAT_ARENA_NORMAL_BASELINE_GRID_IMAGES/`.

## 11. 풀이판과 파일 업로드

### 11.1 모바일 격자 풀이판

- 각 문항 아래에 iPad 앱과 같은 격자형 쓰기 영역을 표시한다.
- 문항별 board는 revision 기반 compare-and-set으로 저장한다.
- 오래된 revision, 중복 요청, 역순 쓰기는 충돌로 처리한다.
- 5개 board finalize가 끝나면 원본 경기 증거로 승격한다.
- 사용자가 다음 문제로 이동하기 전에 현재 board 저장 성공을 확인한다.
- 회전, background/foreground, 앱 강제 종료, 네트워크 재연결 뒤 서버 revision을 읽어 복원한다.

### 11.2 파일 검증과 보관

- 업로드는 파일 개수, 총 용량, MIME, 실제 이미지 signature를 서버가 검증한다.
- DB에는 provider, key, size, MIME, hash, retention 상태를 보관한다.
- 실제 파일은 `fileStorageService`가 목적별 Cloudinary/R2 설정으로 보낸다.
- 앱은 storage key를 공개 식별자로 사용하지 않고 권한 확인 API를 통해서만 조회한다.
- 풀이 촬영·업로드 시간은 유효 풀이 시간에서 제외한다.

## 12. 네이티브 API 인수 계약

기본 prefix는 `/api/v1`이다. 모든 앱 API는 JSON을 사용하며 Bearer 인증이 필요한 경로는 기존 API 인증 미들웨어를 거친다.

### 12.1 읽기·매칭·결과

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/goat-arena` | Arena 홈 읽기 모델, 모드 가용성, 프로필, 활성 경기 |
| GET | `/goat-arena/rulebook` | 규정 데이터 |
| POST | `/goat-arena/matchmaking/:mode` | 일반전 또는 경쟁전 시작 |
| DELETE | `/goat-arena/matchmaking` | 대기 취소 |
| GET | `/goat-arena/matchmaking` | 현재 매칭 상태 |
| POST | `/goat-arena/competitive/solution-sharing-consent` | 경쟁전 풀이 공개 동의 |
| GET | `/goat-arena/matches` | 경기 목록 |
| GET | `/goat-arena/matches/:matchId` | 경기 상세 |
| GET | `/goat-arena/matches/:matchId/normal-result` | 일반전 결과 |
| GET | `/goat-arena/matches/:matchId/competitive-result` | 경쟁전 결과 |
| GET | `/goat-arena/matches/:matchId/*-result/evidence/:side/:fileIndex` | 권한 확인된 결과 풀이 파일 |
| POST | `/goat-arena/matches/:matchId/forfeit` | 허용 상태에서 포기 |

`mode`는 현재 `normal` 또는 `competitive` 계약을 사용한다. 친선전은 별도 친구 초대 흐름을 사용한다.

### 12.2 친구와 친선전

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `/goat-arena/friends` | 친구, 요청, 초대 상태 |
| POST | `/goat-arena/friends/requests` | 친구 요청 |
| POST | `/goat-arena/friends/requests/:requestId/respond` | 요청 수락/거절 |
| POST | `/goat-arena/friends/invitations` | 친선전 초대 |
| POST | `/goat-arena/friends/invitations/:invitationId/respond` | 초대 수락/거절 |
| DELETE | `/goat-arena/friends/invitations/:invitationId` | 초대 취소 |

### 12.3 경기 명령

| Method | Path | 용도 |
| --- | --- | --- |
| POST | `/goat-arena/matches/:matchId/start` | 경기 시작 |
| GET | `/goat-arena/matches/:matchId/questions` | 권한 확인된 문항 |
| POST | `/goat-arena/matches/:matchId/answers` | 답안 저장 |
| POST | `/goat-arena/matches/:matchId/advance` | 현재 문항 확정 및 이동 |
| POST | `/goat-arena/matches/:matchId/heartbeat` | 진행 heartbeat |
| POST | `/goat-arena/matches/:matchId/focus` | 문항 focus 이벤트 |
| POST | `/goat-arena/matches/:matchId/network-state` | 네트워크 상태 이벤트 |
| POST | `/goat-arena/matches/:matchId/submit` | attempt 제출 |
| GET | `/goat-arena/matches/:matchId/solution-boards` | 저장된 보드 목록/revision |
| PUT | `/goat-arena/matches/:matchId/solution-boards/current` | 현재 문항 보드 업로드 |
| POST | `/goat-arena/matches/:matchId/solution-boards/finalize` | 5개 보드를 경기 증거로 확정 |
| POST | `/goat-arena/matches/:matchId/evidence` | 파일 증거 업로드 |
| POST | `/goat-arena/matches/:matchId/evidence/client-review` | 클라이언트 증거 검토 응답 |
| GET/POST | `/goat-arena/matches/:matchId/supplemental-evidence` | 추가 소명 조회/업로드 |

명령 endpoint는 진행 상태만 바꾸는 것과 정산을 일으키는 것을 구분한다. 답안 저장이나 heartbeat가 직접 MMR 정산을 호출하면 안 된다. 정산은 필수 증거와 완료 조건을 서버가 확인한 뒤 한 번만 일어난다.

### 12.4 앱에서 반드시 처리할 오류 유형

- 인증 만료/권한 없음: 로그인 복원 후 원래 상태를 다시 조회한다.
- `409` revision·advance·settlement 충돌: 같은 명령을 다른 식별자로 반복하지 말고 최신 상태를 GET한 뒤 UI를 복원한다.
- `410` 만료: 도전장 신규 시작/제출을 막고 완료된 결과가 있으면 결과로 이동한다.
- 증거 미완료: 빠진 문항의 board 또는 파일을 명확히 표시한다.
- 경쟁전 미활성/해금 전: 서버가 반환한 code와 안내 문구를 표시하고 앱 자체 우회 흐름을 만들지 않는다.
- 저장소 URL 발급 실패: 파일이 없다고 단정하지 말고 재시도 가능한 오류로 처리한다.

## 13. 웹 공개 도전장 계약

게스트 도전장은 현재 웹 공개 route로 제공되며 앱 개발자가 공유 링크를 열 때 Universal Link/외부 브라우저 정책을 결정해야 한다.

주요 공개 경로는 다음과 같다.

- `GET /arena-invite/:token`
- `POST /api/arena-invite/:token/nickname-availability`
- `POST /arena-invite/:token/start`
- `POST /api/arena-invite/:token/lock-question`
- `POST /api/arena-invite/:token/advance`
- `GET/PUT /api/arena-invite/:token/solution-board(s)`
- `POST /api/arena-invite/:token/solution-boards/finalize`
- `POST /arena-invite/:token/evidence`
- `POST /arena-invite/:token/claim`
- `POST /arena-invite/:token/reverse-challenge`

공개 경로는 로그인 없이 동작하지만 IP hard/soft rate limit, opaque token hash, guest browser proof와 파일 권한 검사를 적용한다. 앱이 token만으로 다른 참가자의 증거를 직접 조회할 수 있다고 가정하면 안 된다.

## 14. 운영자 기능

운영자 웹과 iPad 운영 화면은 같은 원본 DB 지표를 사용해야 한다.

### 14.1 Arena 운영 지표

- 최근 30일 단방향 경쟁전 MMR 정산 수
- 평균·누적·절대 MMR 변화
- 정산 전후 평균 MMR
- 승/패/무별 내부 MMR 변화와 공개 점수 변화
- 설정된 평균 drift 경고 기준 초과 여부
- 경기별 MMR/공개 점수 settlement 원장
- 배치 상태와 운영자 reset 이력
- 일반전 `REVIEW_REQUIRED` 기록 큐
- 일반전 기록 승인(`AVAILABLE`) 또는 제외(`INVALID`)
- 경쟁전 무결성 case, 추가 소명과 판정
- 도전장/게스트 기록의 권한 기반 조회

### 14.2 제거해야 하는 운영 항목

- 페이백 정산·계좌·출금 운영
- Arena 상점과 구형 경기 경제
- 자동 방어 배정·방어 상태
- 구형 Arena Standing 및 별도 최종 랭킹
- 삭제된 상품/패스의 활성 운영 카드

일반전 이상 감지 승인/거부는 사용자에게 이메일을 보내지 않는다. 경쟁전의 기존 검토 알림은 실제 현재 notification service와 outbox 정책을 따르되 자동 방어 이메일은 금지한다.

## 15. UI·CSS·반응형 인수 사항

### 15.1 내비게이션과 페이지 구조

- Arena navbar: `홈 / 일반전 / 경쟁전 / 친구 / 경기 규정`.
- 일반전과 경쟁전 규정은 한 페이지에 합치지 않고 별도 상세 페이지를 둔다.
- 규정 첫 화면은 간결한 overview다.
- 각 상세 페이지에는 난도·티어 표와 추가 내용을 expand/collapse로 제공한다.
- 사용자 문구에서 페이백, 방어, 과거 기록, 비동기 매칭, 내부 수식, Z-score를 제거한다.

### 15.2 현재 웹 시각 언어

- 어두운 네이비 배경, 보라/청록 accent, 반투명 카드와 얇은 border를 사용한다.
- 주요 CTA는 보라에서 파랑/청록으로 이어지는 gradient를 사용한다.
- 결과의 승/패 상태는 색상만이 아니라 텍스트와 아이콘/레이블로도 구분한다.
- keyboard focus, `aria-current`, `aria-expanded`, tablist/tabpanel 관계를 유지한다.
- `prefers-reduced-motion`에서 불필요한 animation을 줄인다.
- 모바일에서는 카드와 scoreboard를 단일 column으로, 표는 `data-label` 기반 카드형 행으로 바꾼다.
- 격자 풀이판은 touch 환경에서 문제 아래 충분한 쓰기 높이와 저장 상태를 제공한다.
- 도전장 순위 상세 tab, 풀이 미리보기, 역도전장 CTA는 작은 화면에서도 가로 overflow 없이 보여야 한다.
- 도전장 공유 영역은 생성 버튼, 읽기 전용 URL field, 자동 복사 상태, 별도 복사 버튼을 모두 제공한다.
- 경기 포기 버튼은 실제 허용 상태에서만 활성화하고 최종 증거 제출 뒤에는 숨기거나 비활성화한다.

주요 웹 스타일 정본은 `public/css/goat-arena.css`, 전역 대비 보완은 `public/css/contrast.css`, 운영 화면은 `public/css/admin.css`다. 앱은 픽셀 단위로 CSS를 옮기기보다 위 정보 구조·상태·대비·반응형 의도를 유지한다.

### 15.3 현재 대비 검증

- `npm run contrast:verify`는 현재 123개 selector와 115개 view 계약을 검사한다.
- 마지막 실행 기준 기존 3건의 실패를 포함한 과거 상태가 아니라 현재 검증 통과 상태를 기준으로 한다.
- 앱은 iOS Dynamic Type, VoiceOver, Reduce Motion, light/dark 대비를 별도로 실제 기기에서 검증해야 한다.

## 16. 보안·개인정보·권한

- 웹은 세션 쿠키, 앱은 Bearer token을 사용한다.
- 상태 변경은 동일 출처/인증/속도 제한/입력 whitelist를 적용한다.
- 게스트 생년월일은 secret-key digest로 비교하며 일반 API 응답에 원문을 포함하지 않는다.
- 닉네임 예약은 회원과 게스트 공용 namespace에서 원자적으로 처리한다.
- 경기 풀이 조회는 참가자, 도전장 참가 증명 또는 운영자 권한을 서버에서 다시 확인한다.
- 결제 ID, Apple transaction ID, 저장소 key, 생년월일과 내부 위험 신호를 일반 응답이나 로그에 노출하지 않는다.
- 앱 로그와 analytics에 답안·풀이 이미지·생년월일·token을 남기지 않는다.
- 링크 token과 browser proof를 crash report breadcrumb에 원문으로 보내지 않는다.
- 계정 삭제 시 개인정보와 사용자 파일은 정책대로 삭제하고 법적·회계 기록만 접근 제한 상태로 보존한다.

## 17. 상태, 동시성, 멱등성

### 17.1 주요 상태

- 매칭 entry: `WAITING`, `MATCHING`, `MATCHED`, `CANCELLED`, `EXPIRED`.
- 역사/기준 record: `AVAILABLE`, `RESERVED`, `REVIEW_REQUIRED`, `INVALID`.
- 배치: 미시작, 1~5회 표본 수집, 사용자 확정, 운영자 reset 필요 상태.
- 게스트 attempt: 서버가 반환한 active/completed 상태와 현재 question slot을 따른다.
- 풀이판: 문항별 revision, finalized 여부를 따른다.

### 17.2 반드시 지켜야 하는 원자성

- 한 사용자는 동시에 충돌하는 활성 Arena 경기를 두 개 가질 수 없다.
- 상대 기록 예약은 TTL과 소유자를 검증한다.
- 동일 match settlement는 고유 원장으로 한 번만 실행한다.
- 동일 weekly mock user/week settlement는 한 번만 실행한다.
- 동일 guest challenge + guest identity 조합은 한 attempt만 생성한다.
- 동일 attempt + question slot의 board는 한 문서만 존재한다.
- 같은 nickname은 공용 namespace에서 동시 요청 중 한 요청만 성공한다.
- 앱은 timeout을 실패 확정으로 간주하지 말고 idempotency key로 재조회/재시도한다.

## 18. 핵심 Mongo 모델과 인덱스 목적

| 모델 | 역할 |
| --- | --- |
| `ArenaCompetitiveProfile` | 일반전 숨은 MMR, 경쟁전 내부 MMR, 공개 점수, 배치, 전적, streak |
| `ArenaMatch` | 경기 정본과 상대 스냅샷, 결과 |
| `ArenaMatchAttempt` | 실제 풀이 진행, 답안, 타이머 |
| `ArenaMatchEvidence` | 파일 증거와 보존/검토 상태 |
| `ArenaInlineSolutionBoard` | 회원 모바일 격자 풀이판 |
| `ArenaCompetitiveRecord` | 일반전/경쟁전 재사용 가능한 완료 기록 |
| `ArenaNormalBaselineQuestion` | 검수된 일반전 초기 문제별 기준 기록 |
| `ArenaNormalBaselineAssignment` | 사용자에게 조합된 기준 문항 배정과 최근 노출 |
| `ArenaRatingSettlement` | 경기별 내부 MMR/공개 점수 멱등 원장 |
| `ArenaWeeklyMockRatingSettlement` | 사용자·주차별 주간 모의고사 MMR 원장 |
| `ArenaFriendRequest` / `ArenaFriendship` | 친구 관계 |
| `ArenaFriendlyInvitationV2` | 친선전 초대 |
| `ArenaGuestIdentity` | 닉네임·생년월일 digest·ownership |
| `ArenaGuestChallenge` | 공유 링크와 공개 조건 |
| `ArenaGuestChallengeAttempt` | 게스트 참가·답안·순위 데이터 |
| `ArenaGuestSolutionBoard` | 게스트 문항별 격자 풀이판 |
| `ArenaPlacementAttemptAdjustment` | 서버 오류 복원/운영자 reset 감사 이력 |
| `NicknameNamespace` | 회원·게스트 닉네임 원자 예약 |

스테이징에 실제 인덱스를 적용하기 전 앱/서버를 프로덕션에 열면 안 된다. 준비 도구는 `scripts/prepareGoatArenaV2Indexes.js`이며 외부 DB 변경은 staging 명시와 apply flag가 함께 있어야 한다.

## 19. 설정값

현재 주요 환경 변수는 다음과 같다.

```text
ARENA_COMPETITIVE_ENABLED
ARENA_GLICKO_DEFAULT_RATING=1500
ARENA_GLICKO_INITIAL_RD=350
ARENA_GLICKO_DEFAULT_VOLATILITY=0.06
ARENA_GLICKO_TAU=0.5
ARENA_GLICKO_EPSILON=0.000001
ARENA_GLICKO_PLACEMENT_RD_BY_COUNT
ARENA_GLICKO_PLACEMENT_VOLATILITY_BY_COUNT=0.10,0.09,0.08,0.07,0.06
ARENA_NORMAL_HIDDEN_MMR_DEFAULT=1000
ARENA_NORMAL_HIDDEN_RD_DEFAULT=350
ARENA_NORMAL_HIDDEN_VOLATILITY_DEFAULT=0.06
ARENA_NORMAL_BASELINE_RD=156.524758
ARENA_NORMAL_BASELINE_VOLATILITY=0.06
# Question exposure cooldown: fixed at 10 started normal/competitive matches.
ARENA_ASYNC_NORMAL_CLOSE_SCORE_THRESHOLD=0.1
ARENA_ASYNC_CLOSE_SCORE_THRESHOLD=0.1
ARENA_COMPETITIVE_SCORE_K_FACTOR=32
ARENA_COMPETITIVE_SCORE_RATING_SCALE=400
ARENA_COMPETITIVE_SCORE_MINIMUM=0
ARENA_ONE_SIDED_MMR_DRIFT_WARNING_AVERAGE=2
ARENA_RATING_REVERSAL_MINIMUM_STREAK=2
ARENA_RATING_REVERSAL_DELTA_STEP=0.15
ARENA_RATING_REVERSAL_MINIMUM_MULTIPLIER=0.55
ARENA_GUEST_LINK_TTL_SECONDS=259200
MATTHS_PRO_PRICE_KRW=5500
MATTHS_PRO_BILLING_PERIOD_DAYS=30
APPLE_PRO_PRODUCT_ID
```

3일 링크 TTL은 현재 제품 정책상 고정 검증된다. 앱이 로컬 상수로 만료 시각을 만들지 말고 서버가 준 날짜를 표시한다.

## 20. 핵심 서버 파일 지도

### 20.1 Arena

- 설정: `services/goatArenaV2Config.js`
- 읽기 모델: `services/goatArenaV2ReadService.js`
- 규정: `services/goatArenaV22RulebookService.js`
- 프로필/배치: `services/arenaV2ProfileService.js`, `services/arenaPlacementPolicyService.js`
- 활성 경기: `services/arenaActiveMatchService.js`
- 난도: `services/arenaV2DifficultyService.js`
- 일반전: `services/arenaAsyncNormalService.js`
- 경쟁전: `services/arenaAsyncCompetitiveService.js`
- 기록 선택: `services/arenaHistoricalRecordSelectionService.js`
- 기준 문제: `services/arenaNormalBaselineQuestionService.js`
- 성취 평가: `services/arenaCompetitiveScoringService.js`
- Glicko: `services/glicko2Service.js`
- 적응형 완충: `services/arenaAdaptiveRatingService.js`
- 공개 점수: `services/arenaCompetitivePointService.js`
- 정산: `services/arenaV2SettlementService.js`, `services/arenaEvidenceSettlementService.js`
- 친구/친선전: `services/arenaFriendService.js`
- 도전장: `services/arenaGuestChallengeService.js`
- 웹/앱 격자: `services/arenaWebInlineSolutionService.js`, `services/arenaInlineSolutionBoardService.js`
- 무결성: `services/arenaV2IntegrityReviewAdapter.js`, `services/arenaIntegrityRiskService.js`
- 운영: `services/adminArenaV2Service.js`, `services/adminCurrentMetricsService.js`
- 주간 MMR: `services/mmrService.js`

### 20.2 HTTP와 화면

- 웹 route: `routes/goat-arena-routes.js`
- 네이티브 route: `routes/api-routes.js`
- 웹 controller: `controllers/goatArenaController.js`, `controllers/goatArenaV2Controller.js`, `controllers/arenaGuestChallengeController.js`
- 앱 controller: `controllers/ipadGoatArenaActionController.js`, `controllers/ipadGoatArenaCommandController.js`
- 앱 운영자: `controllers/ipadAdminArenaPolicyController.js`
- 앱 주간 모의고사: `controllers/ipadWeeklyMockController.js`
- 모델: `models/goatArenaModel.js`, `models/matthsModel.js`, `models/nicknameNamespaceModel.js`
- Arena 화면: `views/goat-arena*.ejs`, `views/arena-guest-challenge.ejs`
- Arena 브라우저 JS: `public/js/goat-arena-v2.js`, `public/js/goat-arena-match.js`, `public/js/goat-arena-web-board.js`, `public/js/arena-guest-challenge.js`
- 스타일: `public/css/goat-arena.css`, `public/css/contrast.css`, `public/css/admin.css`

## 21. 자동 검증 현황

다음 검증은 마지막 통합 작업에서 통과했다.

```bash
npm run arena-v2:verify
npm run arena-v21:verify-scoring
npm run arena-v22:verify-rulebook
npm run ranking:verify
npm run logic-parity:verify
npm run arena-cheating-modes:verify
npm run launch-views:verify
npm run ui:verify
npm run contrast:verify
npm run private-mock:verify
npm run ipad-weekly-mock-evidence:verify
npm run admin:verify
node audit/verifyPrivateMockIntegrityRecovery.js
node audit/verifyPrivateMockSubmissionContract.js
npm run weekly-mock-mmr:verify-db
npm run admin-arena-current:verify-db
npm run arena-async-historical-semantics:verify-db
npm run arena-v21:verify-db
npm run arena-v2:verify-db
```

격리 경쟁전 무결성 테스트에서 SMTP가 설정되지 않았다는 경고는 테스트가 의도적으로 처리한 외부 전달 경고이며 실패가 아니다. 일반전 검토 흐름은 이메일을 생성하지 않아야 한다.

시뮬레이션 명령은 다음과 같다.

```bash
npm run arena-v2:simulate
npm run arena-normal-baseline:simulate
```

마지막 기록된 결과:

- 동일 실력 합성 승률: 50.08%
- 어려운 세트 대 쉬운 세트 stress에서 어려운 세트 승률: 45.67%
- 제품 결정상 45.67%는 현재 허용하며 추가 튜닝하지 않는다.
- 단방향 정산 평균 MMR drift 근사: -1.0419
- 허용하지 않는 best-of-3 선택 편향 drift: +30.9270

시뮬레이션은 운영 보정 완료를 의미하지 않는다. 실제 분포와 실제 기록 풀로 재검증해야 한다.

## 22. 프로덕션 차단 항목

현재 어떤 코드도 프로덕션에 배포하지 않았다. 다음이 끝나기 전 배포하거나 경쟁전을 활성화하지 않는다.

1. 스테이징 MongoDB에 Arena 인덱스를 실제 적용하고 쿼리 계획 대조
2. 실제 스테이징 트랜잭션, 동시 예약·정산·검토 승인 race 검증
3. 실제 Cloudinary/R2에서 데스크톱 업로드, 모바일 board 승격, 서명 조회와 삭제 검증
4. Chrome/Safari 데스크톱 전체 경기 QA
5. iPad/iPhone 격자 입력, 회전, background/foreground, 재연결, finalize QA
6. 실제 일반전 기준 문제의 수학적 정답, 정답률, 난도, 손풀이 전수 검수
7. 공개 도전장 participant/storage 상한과 대규모 leaderboard pagination 결정
8. 미가입 게스트 보존 만료와 외부 파일 삭제 재시도 검증
9. 실제 사용자 분포로 단방향 MMR drift와 공개 점수 분포 관찰
10. 경쟁전 beta 중단 기준과 운영자 drift 경고 기준 확정
11. 네이티브 Pro를 함께 열 경우 Apple 상품과 Sandbox 전 흐름 검증

기존 사용자·재무·진행 중 구형 경기 데이터는 0건이라는 제품 전제를 사용한다. 이 전제가 실제 배포 DB와 다르면 배포를 즉시 중단하고 별도 이관·정산 계획을 세워야 한다.

## 23. 앱 개발 완료 기준

- 웹과 앱이 동일 계정에서 같은 프로필, 배치, 활성 경기, 답안, board, 결과를 본다.
- 일반전 첫 진입이 숨은 MMR 1000 기준으로 시작한다.
- 일반전/경쟁전의 문제·답안·풀이·시간·결과가 서버와 일치한다.
- 앱에서 5개 격자 board가 revision 충돌 없이 저장·복원·finalize된다.
- 포기 버튼이 허용 상태에서만 동작하고 최종 증거 뒤에는 동작하지 않는다.
- 친선전과 도전장이 어떤 MMR/점수/XP도 바꾸지 않는다.
- 도전장 공유 링크가 자동 복사되고 URL 및 수동 복사 버튼이 보인다.
- 게스트가 동일 identity로 재접속했을 때 새 attempt가 아니라 기존 진행/순위로 간다.
- 결과 권한이 없는 사용자가 상대 풀이 파일을 열 수 없다.
- 주간 모의고사가 참가자 내부 MMR만 바꾸고 공개 점수와 미참가자를 바꾸지 않는다.
- 모든 공개 랭킹이 경쟁전 공개 점수만 사용한다.
- 무료/Pro/관리자 권한 표시가 웹과 앱에서 같다.
- VoiceOver, Dynamic Type, Reduce Motion, 회전과 작은 화면을 실제 기기에서 확인한다.
- 앱이 내부 MMR·Z-score·과거 기록·비동기 방식을 사용자 문구로 노출하지 않는다.

## 24. 관련 문서

- 최상위 시스템 요약: `README.md`
- 한국어 현행 로직: `docs/logic/01_...13_*.md`
- 영어 현행 로직: `docs/logic_en/01_...13_*.md`
- 구현·출시 준비 보고서: `audit/GOAT_ARENA_2_2_GAP_REPORT.md`
- 레이팅 결과: `audit/GOAT_ARENA_ASYNC_SIMULATION_RESULTS.json`
- 일반전 기준 데이터 결과: `audit/GOAT_ARENA_NORMAL_BASELINE_SIMULATION_RESULTS.json`
- 현재 변경 파일 전체 목록: `docs/GOAT_ARENA_2_2_CHANGED_FILES.md`
- 독립 전수 검토용 프롬프트: `docs/GOAT_ARENA_2_2_FULL_AUDIT_PROMPT_EN.md`



## 2026-10-11 감사 수정에 따른 앱 반영 사항

이 절은 기존 설명보다 우선하는 현재 서버 계약이다. 앱 소스는 별도 `Matths-ipad-web/Matths-dev/ipad` 프로젝트에 있으며, 이번 작업에서 사진 제출형 경기의 완료 잠금·재시도 헤더·증거 응답 디코딩도 함께 수정했다. 실기기 확인은 별도 단계다.

### 풀이 완료 및 파일 전송

1. 완료 버튼 또는 문항 시간 만료 시 답안과 현재 PKDrawing/풀이 데이터의 바이트를 기기에 고정한다. 고정한 바이트의 SHA-256을 계산한다. 이후 수정·지우기·새 스트로크 입력을 막는다.
2. 이미지 캡처와 업로드 전에 `POST /api/v1/goat-arena/matches/:matchId/lock-question`을 호출한다. Bearer 인증, `Idempotency-Key`, `X-Matths-Client-Version`이 필요하다. 본문은 다음과 같다. 큰 풀이 파일은 이 요청에 포함하지 않는다.

```json
{
  "questionSlot": 1,
  "answer": "23",
  "boardRevision": 1,
  "strokeCount": 12,
  "drawingSha256": "64자리 소문자 SHA-256",
  "submissionMode": "MANUAL"
}
```

3. 서버가 잠금 요청을 받은 시각으로 풀이 시간을 고정한다. 응답 성공 후 고정한 풀이를 이미지로 캡처하고 기존 `solution-boards/current`에 업로드한다. 업로드의 `drawingDataBase64`는 잠근 바이트와 일치해야 한다. 같은 버전에 다른 이미지·풀이를 보내면 409다. 재시도용 PNG 바이트도 보관한다.
4. 업로드 응답의 `revision`과 `sha256`으로 기존 `advance`를 호출한다. 한 문항의 lock/advance는 같은 문항 완료 키를 사용한다. 다른 문항과 다른 일반 변경 작업에는 새 키를 사용한다. 일반 변경 API의 동일 키·다른 요청은 409다.
5. 연결 끊김 시 같은 내용·키로 재시도한다. lock 응답의 `advanced: true`는 해당 문항이 이미 완료됐다는 뜻이다. 추가 캡처·업로드 없이 기존 advance 키로 현재 상태를 복구한다. board 조회의 `completionLocked`, `drawingSha256`, `completionRequestId`, `lockedAnswer`, `lockedSubmissionMode`도 복구에 사용한다. 잠근 원본 파일이 없는 기기에서는 새 풀이를 작성해 대체할 수 없다.
6. 시간 만료 잠금은 `submissionMode: "TIME_LIMIT"`이고 키는 `QUESTION_TIME_LIMIT:<attemptId>:<deadlineEpochMilliseconds>`다. 서버 마감 전에는 거절되며, 공식 완료 시각은 서버 마감 시각이다. 캡처·전송 지연을 공식 풀이 시간에 더하지 않는다.
7. 마지막 문항의 진행과 증거 확정 뒤에는 서버가 반환한 상태로 결과 열람 여부를 결정한다. 클라이언트가 자체적으로 정산·승패·공개 여부를 추정하지 않는다.

사진 제출형 앱은 `evidenceMode: "PHOTO_UPLOAD_V1"`로 답안·시각만 먼저 잠근다. drawingSha256/boardRevision은 보내지 않는다. 이후 기존 advance와 경기 종료 후 사진 제출을 사용한다. 시작/복구 응답의 `attempt.completionLock`에서 완료 키·답안·모드를 복구하고, 잠근 답안은 수정하지 않는다. 서버 시간 만료 처리와 앱 재시도가 겹쳐도 원래 완료 키를 통해 적용된 진행 결과를 확인할 수 있다.

### 응답 및 재시도 계약

- 일반·경쟁전 결과의 evidence href는 `/api/v1/goat-arena/...`이며 Bearer로 요청한다.
- 일반 앱 evidence 응답은 허용된 수신 정보만 제공한다. `status`는 `RECEIVED`이고 내부 `anomalyFlags`는 제공하지 않는다. `retentionUntil`은 유지한다.
- 일반 경기 조회의 `ratingChange`는 `kind: "PUBLIC_COMPETITIVE_POINTS"`와 공개 점수의 before/delta/after 및 공개 티어 코드·이름을 제공한다. 내부 MMR·RD·변동성은 공개하지 않는다. 공개 점수 원장이 없는 과거 결과는 null일 수 있다.
- 매칭·포기·동의·친구·초대·취소 및 배치 변경 API는 두 명령 헤더를 요구한다. 같은 키·같은 요청의 완료 응답을 재생한다. `COMMAND_OUTCOME_PENDING`은 성공 여부가 아직 확인되지 않은 요청이다. 새 쓰기를 반복하기 전에 현재 경기·친구·배치 상태를 조회한다.
- 풀이 미리보기 링크는 5분 만료 링크다. 만료 시 로그인 권한으로 새 링크를 요청한다.
- 가입으로 계정에 연결된 게스트 기록은 해당 회원의 로그인으로 복구한다. 가입 전 게스트 쿠키나 닉네임·생년월일만으로 계정 연결 기록을 열 수 없다.

### 운영 적용

새 이메일 발송 원장·네이티브 명령 응답 원장·파일 삭제 작업 원장의 고유 인덱스는 기존 `arena-v2:indexes` 도구의 별도 staging 사전 검사/적용 대상에 포함됐다. 이번 수정에서는 운영 DB와 외부 결제·이메일·저장소를 변경하지 않는다. 기존 문제·채점 영향은 `arena-audit-fixes:inspect`의 읽기 전용 목록으로 확인하고, 봉인된 문제와 과거 점수를 덮어쓰기 전에 독립 검토한다. 기준 63문항은 수정된 검수 초안이며, 충분한 손풀이·운영 풀 검수 없이 활성화하지 않는다.

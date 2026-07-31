# GOAT Arena 구현 계획

> 기준 정책:
>
> - Sub Division v2.9
> - Final Ranking v1.4

---

# Phase 0 — 정책 확정

- [x] 무료 Arena 제거
- [x] 학습권 0이면 Arena·주간 모의고사 제한
- [x] 학습권이 남으면 패키지 추가 구매 불가
- [x] Main 사용자는 학습권 만료 즉시 Sub로 강등
- [x] 강등 후 새 결제주기를 Sub에서 시작
- [x] 72시간 내 Main-to-Sub 변환
- [x] 72시간 초과 `재구독 랭크 결정전`
- [x] 늦은 갱신 최고 배치 상한
- [x] 20:00 결제일 cutoff
- [x] 일요일 15:00 동결·00:00 일괄 공개

---

# Phase 1 — 구매 자격과 첫날 차감

- [ ] `packagePurchaseEligible`
- [ ] available 0 검사
- [ ] locked 0 검사
- [ ] pending settlement 검사
- [ ] 결제 승인 KST 변환
- [ ] 20:00 이전 즉시 첫날 소비
- [ ] 20:00 이후 다음 00:00 첫날 소비
- [ ] 첫날 소비 멱등 키
- [ ] 경계값 19:59:59·20:00:00 테스트

---

# Phase 2 — 만료 잠금

- [ ] `ACCESS_EXPIRED_LOCKED`
- [ ] Arena 공격·방어 차단
- [ ] 주간 모의고사 차단
- [ ] Weekly Mock Bonus 0
- [ ] Final Ranking 비활성
- [ ] 마지막 상태 snapshot
- [ ] 결제창 즉시 노출
- [ ] 방어 후보 제거

---

# Phase 3 — Main 만료·Sub 강등·72시간 유예

- [ ] `expiredAt`
- [ ] `renewalGraceDeadline`
- [ ] `MAIN_DEMOTED_TO_SUB`
- [ ] 현재 경쟁 Division Sub 변경
- [ ] Main 달성 이력 배지 보존
- [ ] Main snapshot
- [ ] 72시간 서버 판정
- [ ] Main-to-Sub conversion policy
- [ ] 변환 결과 저장
- [ ] Sub profile 생성
- [ ] 새 결제주기 29일·29점

검증:

- 71:59:59는 시험 없음
- 72:00:00부터 시험 필요
- 같은 Main snapshot 중복 변환 불가

---

# Phase 4 — 재구독 랭크 결정전

- [ ] UI 명칭 `랭크 복귀전`
- [ ] 내부 키 `RENEWAL_RANK_ASSESSMENT`
- [ ] 시험 문제 팩
- [ ] 무결성 검사
- [ ] 시험 기반 Sub Seed
- [ ] referenceSubPlacement
- [ ] one-tier-below ceiling
- [ ] 최종 worse-of 계산
- [ ] Skill MMR 비초기화
- [ ] 완료 전 Arena·주간 모의고사 차단

---

# Phase 5 — Final Ranking 보호

- [ ] 72시간 내 변환자의 시즌 Sub 시작 백분위
- [ ] 늦은 재구독자의 reference baseline
- [ ] 실제 페널티 배치와 성장 기준 분리
- [ ] Final Rating 실시간 재계산
- [ ] Weekly Mock Bonus 정상 +30 / 미응시·만료 0
- [ ] 동점 처리 유지

검증:

- 늦은 갱신이 성장점수 파밍에 유리하지 않음
- 만료 사용자가 active leaderboard에 남지 않음
- 같은 Bonus가 중복 누적되지 않음

---

# Phase 6 — 페이백·새 결제주기

- [ ] 새 cycle 29일·29점
- [ ] 기존 cycle 평가 독립성
- [ ] dailyPaybackReviewJob
- [ ] 새 주기 유료 공격 2회 조건
- [ ] 새 주기 streak
- [ ] 50·80·100% 구간
- [ ] Main 재진입

---

# Phase 7 — 일요일 잠금

- [ ] 15:00 Arena write lock
- [ ] 공개 Final Ranking freeze
- [ ] eligible mock users only
- [ ] MMR·Bonus staging
- [ ] Final Rank staging
- [ ] 00:00 atomic publish
- [ ] Arena unlock

---

# Phase 8 — 사용자 설명·CS

- [ ] 학습권 만료 모달
- [ ] Main 72시간 countdown
- [ ] 변환 예상 Sub 랭크 미리보기
- [ ] 랭크 복귀전 안내
- [ ] 20:00 첫날 안내
- [ ] 패키지 중복 구매 차단 안내
- [ ] 페이백 새 주기 설명
- [ ] 약관·FAQ·상세 PDF 링크

---

# 완료 정의

1. 학습권이 남으면 새 패키지를 구매할 수 없다.
2. 학습권 0 사용자는 Arena와 주간 시험에 접근할 수 없다.
3. Main 사용자는 학습권 만료 시 Sub로 강등된다.
4. Main 72시간 내 갱신은 시험 없이 변환된 Sub 랭크에서 재개한다.
5. 72시간 초과 갱신은 랭크 복귀전을 완료해야 한다.
6. 최고점이어도 정상 변환 기준보다 높은 배치를 받지 않는다.
7. 20:00 cutoff가 서버 시각으로 정확히 적용된다.
8. 새 결제주기의 페이백 심사가 독립적으로 작동한다.
9. 일요일 공개 전환이 원자적이다.

---

# 2026-08-01 밑작업 반영 현황

- [x] `SubscriptionPolicyVersion` 정책 버전 스키마
- [x] `AccessCycle`과 주기별 정책 snapshot
- [x] `ArenaAccessState` 권한 원본
- [x] MMR과 분리된 `ArenaStanding` (`arenaRank`, `arenaPosition`, `arenaGp`)
- [x] `ArenaLearningDayLedger` 불변 증감 원장
- [x] 첫 달 필수 실측 지표·시뮬레이션 가정 `dataAnalysis` 카탈로그
- [x] 가격·페이백 변경의 비소급 구조와 재결제 고지 필드
- [x] DB·TTL 캐시 경계 문서화 및 활성 정책 TTL 캐시
- [x] 이메일·닉네임 통합 로그인
- [x] 생년월일·실명·고등학교 조합 해시·관리자 중복 검토 알림·비교 계정 전체 표시·기존 계정 백필 골격
- [x] N수생 가입·학교 선택 처리·전용 게시판 권한
- [x] 고3 학사연도 전환 시 졸업 상태와 기존 학교 보존

다음 구현은 Phase 1의 순위 권위 전환과 AccessCycle 생성/차감 서비스를 먼저 진행한다. 아직 1대1 매치 정산은 연결하지 않는다.

## 2026-08-01 문서 정합성 skeleton 보강

- [x] `ArenaStanding`을 `arenaRank + arenaPosition + arenaGp` tuple로 정규화
- [x] MMR 설정과 분리된 Arena GP 티어 표시 정책
- [x] 합성 랭킹 응답에서 Skill `tier/division`과 `arenaRank/arenaDivision/arenaPosition/gp` 필드 분리
- [x] `FinalRankingPolicyVersion`, `LiveFinalRankingProfile`
- [x] Main snapshot·Main-to-Sub conversion·랭크 복귀전 모델
- [x] 매치 생명주기·참가자 잠금·Arena tuple 변경 원장
- [x] 페이백 평가 멱등 문서와 outbox 이벤트
- [x] 구매·공식 Arena·주간 모의고사 자격의 순수 판정 함수
- [x] `PAID_ACTIVE`·학습권·계정 상태·시즌 배치를 함께 확인하는 Division 버튼 권한 골격
- [x] 화면·FAQ·약관에서 폐기된 무료 Arena, 별도 보너스 학습권, Main 상점·Shield 규칙 제거

이 항목들은 스키마·불변식·표시 골격만 만든 상태다. 결제 트랜잭션, 1대1 채점·정산, Main 내부 경기 규칙과 실제 페이백 송금은 아직 연결하지 않는다.

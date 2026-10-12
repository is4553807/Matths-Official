const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const {
  getGoatArenaV22Rulebook,
} = require("../services/goatArenaV22RulebookService");
const {
  goatArenaV2Rulebook,
} = require("../services/goatArenaV2ReadService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const render = (relativePath, rulebook) => ejs.render(
  read(relativePath),
  {
    rulebook,
    activeArenaPage: "rules",
    arenaUser: { nickname: "검증사용자" },
  },
  { filename: path.join(root, relativePath) }
);

const generatedAt = new Date("2026-10-09T12:00:00+09:00");
const overview = getGoatArenaV22Rulebook(generatedAt);
const normal = getGoatArenaV22Rulebook(generatedAt, "SUB");
const competitive = getGoatArenaV22Rulebook(generatedAt, "MAIN");

assert.equal(overview.schemaVersion, "GOAT_ARENA_RULEBOOK_2_2");
assert.equal(overview.revision, "2.2");
assert.equal(overview.view, "OVERVIEW");
assert.equal(overview.questionCount, 5);
assert.equal(overview.timeLimitSecondsPerQuestion, 600);
assert.equal(overview.timeLimitScope, "PER_QUESTION");
assert.equal(overview.publicModes[0].mode, "일반전");
assert.equal(overview.publicModes[1].mode, "경쟁전");
assert.equal(overview.publicModes.length, 2);

assert.equal(normal.view, "DETAIL");
assert.equal(normal.division, "SUB");
assert.equal(normal.mode.mode, "일반전");
assert.equal(normal.difficulty.rows.length, 9);
assert.deepEqual(normal.difficulty.rows[0].slots.map((slot) => slot.label), [
  "기초 일반", "기초 일반", "기초 일반", "기초 일반", "일반 하",
]);
assert.equal(normal.difficulty.rows[8].tierLabel, "챌린저");

assert.equal(competitive.view, "DETAIL");
assert.equal(competitive.division, "MAIN");
assert.equal(competitive.mode.mode, "경쟁전");
assert.equal(competitive.difficulty.rows.length, 9);
assert.deepEqual(competitive.difficulty.rows[8].slots.map((slot) => slot.label), [
  "준킬러 하", "준킬러 상", "준킬러 상", "준킬러 상", "킬러 상",
]);

const serialized = JSON.stringify({ overview, normal, competitive });
for (const requiredCopy of [
  "비슷한 실력의 유저",
  "각 문항의 제한 시간은 10분",
  "정오답, 문제 난도와 풀이 시간을 함께 반영",
  "내부 성취 지표가 근소하면 풀이 시간이 짧은 쪽",
  "유효한 일반전 3경기",
  "최대 5회",
  "경쟁전 점수와 티어",
  "같은 상대가 지나치게 반복되지 않도록",
  "초반 경기 결과에 빠르게 반응",
  "특정 경기 수 경계 없이",
  "티어별 문제 난이도",
]) {
  assert.ok(serialized.includes(requiredCopy), `2.2 규정 문구가 없습니다: ${requiredCopy}`);
}
for (const privateOrLegacyCopy of [
  "Z-score",
  "Glicko",
  "비활성",
  "검증 완료 전",
  "페이백",
  "학습일수 예치",
  "minimumCorrectRatePercent",
  "observedReferenceMeanPercent",
  "Σp",
  "과거 경기 기록",
  "비동기",
]) {
  assert.ok(!serialized.includes(privateOrLegacyCopy), `공개 규정에 내부·레거시 정보가 있습니다: ${privateOrLegacyCopy}`);
}

const apiOverview = goatArenaV2Rulebook(generatedAt);
const apiNormal = goatArenaV2Rulebook(generatedAt, "SUB");
assert.equal(apiOverview.schemaVersion, overview.schemaVersion);
assert.equal(apiOverview.generatedAt, overview.generatedAt);
assert.equal(apiNormal.division, "SUB");

const renderedOverview = render("views/goat-arena-rules-index.ejs", overview);
for (const visibleCopy of [
  "GOAT Arena 경기 규정",
  "공통 경기 방식",
  "일반전 규정 자세히 보기",
  "경쟁전 규정 자세히 보기",
  "최근 수정일",
]) {
  assert.ok(renderedOverview.includes(visibleCopy), `규정 허브 문구가 없습니다: ${visibleCopy}`);
}
assert.ok(!renderedOverview.includes("티어별 5문항 구성을 확인하세요"));

const renderedNormal = render("views/goat-arena-rules.ejs", normal);
const renderedCompetitive = render("views/goat-arena-rules.ejs", competitive);
for (const [rendered, title, codeRange] of [
  [renderedNormal, "일반전 경기 규정", "U1~U9"],
  [renderedCompetitive, "경쟁전 경기 규정", "R1~R9"],
]) {
  for (const visibleCopy of [
    title,
    "티어별 문제 난이도",
    "티어별 5문항 구성을 확인하세요",
    "브론즈",
    "챌린저",
    codeRange,
    "<details>",
  ]) {
    assert.ok(rendered.includes(visibleCopy), `${title} 화면 문구가 없습니다: ${visibleCopy}`);
  }
  assert.ok(rendered.includes('data-current-rulebook-version="2.2"'));
  assert.ok(rendered.includes('class="arena-difficulty-plan-table"'));
}
assert.ok(renderedNormal.includes("승패 결정 방식"));
assert.ok(!renderedNormal.includes("참가 조건과 배치고사"));
assert.ok(renderedCompetitive.includes("참가 조건과 배치고사"));
assert.ok(!renderedCompetitive.includes("기존 XP 규칙"));

for (const rendered of [renderedOverview, renderedNormal, renderedCompetitive]) {
  assert.ok(rendered.includes('href="/css/goat-arena.css"'));
  for (const hiddenCopy of ["Z-score", "Glicko", "비활성", "페이백", "UNRANKED", "RANKED"]) {
    assert.ok(!rendered.includes(hiddenCopy), `공개 규정 화면에 숨겨야 할 문구가 있습니다: ${hiddenCopy}`);
  }
}

const home = read("views/goat-arena.ejs");
for (const hiddenCopy of ["Z-score", "Glicko", "비활성", "페이백", "UNRANKED", "RANKED"]) {
  assert.ok(!home.includes(hiddenCopy), `GOAT Arena 메인 화면에 숨겨야 할 문구가 있습니다: ${hiddenCopy}`);
}
const navigation = read("views/partials/goat-arena-navigation.ejs");
assert.ok(navigation.includes('label: "일반전"'));
assert.ok(navigation.includes('label: "경쟁전"'));
assert.ok(!navigation.includes('label: "UNRANKED"'));
assert.ok(!navigation.includes('label: "RANKED"'));
assert.ok(!navigation.includes('key: "shop"'));
assert.ok(!navigation.includes('href: "/goat-arena/main/shop"'));
assert.ok(!navigation.includes('key: "rankings"'));
assert.ok(!navigation.includes('href: "/goat-arena/rankings"'));
assert.ok(home.includes('href="/goat-arena/rules/sub">일반전 규정 보기'));
assert.ok(home.includes('href="/goat-arena/rules/main">경쟁전 규정 보기'));
assert.ok(!home.includes("/goat-arena/rules#normal-rules"));
assert.ok(!home.includes("/goat-arena/rules#competitive-rules"));

const division = read("views/goat-arena-division.ejs");
for (const visibleCopy of ["경기 방식", "비슷한 실력의 유저", "내부 평가"]) {
  assert.ok(division.includes(visibleCopy), `경기 진입 화면 문구가 없습니다: ${visibleCopy}`);
}
for (const hiddenCopy of ["페이백", "예치", "비활성", "NOT RELEASED", "Unranked", "Ranked", "과거 경기 기록", "비동기"]) {
  assert.ok(!division.includes(hiddenCopy), `경기 진입 화면에 레거시 문구가 있습니다: ${hiddenCopy}`);
}
assert.ok(division.includes('href="/goat-arena/rules/sub">일반전 규정 보기'));
assert.ok(division.includes('href="/goat-arena/rules/main">경쟁전 규정 보기'));
assert.ok(!division.includes("/goat-arena/rules#normal-rules"));
assert.ok(!division.includes("/goat-arena/rules#competitive-rules"));

const tutorial = read("public/js/arena-tutorial.js");
assert.ok(tutorial.includes('normal: "일반전"'));
assert.ok(tutorial.includes('competitive: "경쟁전"'));
for (const hiddenCopy of ["페이백", "예치", "Unranked", "Ranked"]) {
  assert.ok(!tutorial.includes(hiddenCopy), `튜토리얼에 레거시 문구가 있습니다: ${hiddenCopy}`);
}

const matchResult = read("views/goat-arena-match.ejs");
const matchClient = read("public/js/goat-arena-v2.js");
const settlementService = read("services/arenaV2SettlementService.js");
const asyncNormalService = read("services/arenaAsyncNormalService.js");
const asyncCompetitiveService = read("services/arenaAsyncCompetitiveService.js");
assert.match(
  asyncNormalService,
  /compareCompetitivePerformance\(current\.performance, opponentPerformance/
);
assert.ok(matchResult.includes('data-arena-forfeit-mode="<%= forfeitMode %>"'));
assert.ok(matchResult.includes(">경기 포기</button>"));
assert.ok(!matchResult.includes("경기 포기 · 패배 처리"));
assert.match(matchClient, /mode === "competitive"/);
assert.match(matchClient, /다음 경기 난이도 조정에 반영되며 XP는 지급되지 않습니다/);
assert.match(settlementService, /ARENA_FORFEIT_NOT_ALLOWED/);
assert.match(asyncNormalService, /ARENA_FORFEIT_AFTER_SUBMISSION/);
assert.match(settlementService, /automaticReason: "VOLUNTARY_FORFEIT"/);
for (const retiredSundayLockCopy of [
  "일요일 공식 경기 잠금",
  "월요일 00:00까지 경기 진행을 멈춥니다.",
  "일요일 경기 시작 마감",
  "일요일 15:00부터",
]) {
  assert.ok(!matchResult.includes(retiredSundayLockCopy), `24/7 정책과 충돌하는 경기 문구가 있습니다: ${retiredSundayLockCopy}`);
}
const guestResult = read("views/arena-guest-challenge.ejs");
const guestChallengeScript = read("public/js/arena-guest-challenge.js");
const guestChallengeStyles = read("public/css/goat-arena.css");
const adminArenaPolicies = read("views/admin-arena-policies.ejs");
const registration = read("views/register.ejs");
const registrationScript = read("public/js/auth.js");
const guestChallengeController = read("controllers/arenaGuestChallengeController.js");
const guestChallengeService = read("services/arenaGuestChallengeService.js");
const arenaV2Config = read("services/goatArenaV2Config.js");
const requestSecurity = read("middleware/requestSecurity.js");
const fileStorage = read("services/fileStorageService.js");
const arenaEvidenceService = read("services/arenaMatchEvidenceService.js");
const goatArenaModel = read("models/goatArenaModel.js");
const privacy = read("views/privacy.ejs");
const arenaProfile = read("views/goat-arena-profile.ejs");
const arenaController = read("controllers/goatArenaController.js");
const profilePageSource = arenaController.match(
  /exports\.profilePage\s*=\s*async[\s\S]*?exports\.updateArenaTutorial/
)?.[0] || "";
assert.ok(profilePageSource, "Arena 프로필 컨트롤러를 찾을 수 없습니다.");
for (const retiredProfileRead of [
  "getPaybackAccountSummary",
  "paybackPayoutStatus",
  "payoutEligible",
]) {
  assert.ok(!profilePageSource.includes(retiredProfileRead), `Arena 프로필이 구형 페이백 데이터를 조회합니다: ${retiredProfileRead}`);
}
for (const retiredProfileCopy of [
  "페이백",
  "학습일수",
  ">GP<",
  "자동 방어",
  "payback-account",
]) {
  assert.ok(!arenaProfile.includes(retiredProfileCopy), `Arena 프로필에 구형 운영 문구가 있습니다: ${retiredProfileCopy}`);
}
for (const privateCopy of ["Z-score", "원문 정답률", "Glicko-2 MMR"]) {
  assert.ok(!matchResult.includes(privateCopy), `경기 결과 화면에 내부 지표가 있습니다: ${privateCopy}`);
}
for (const resultDetailContract of [
  "기준 정답률",
  "난이도 보정 성취지표",
  "competitor.difficultyAdjustedScore",
  "question.sourceAccuracyRate",
  "question.submittedAnswer",
  "내 제출 답안",
  "상대 제출 답안",
]) {
  assert.ok(matchResult.includes(resultDetailContract), `경기 결과 상세 계약이 없습니다: ${resultDetailContract}`);
}
for (const resultService of [asyncNormalService, asyncCompetitiveService]) {
  assert.ok(resultService.includes("sourceAccuracyRate"), "결과 DTO에 문항 기준 정답률이 없습니다.");
  assert.ok(resultService.includes("difficultyAdjustedScore"), "결과 DTO에 난이도 보정 성취지표가 없습니다.");
  assert.ok(resultService.includes("submittedAnswer"), "결과 DTO에 실제 제출 답안이 없습니다.");
}
for (const privateCopy of [
  "Z <%=",
  "record.z",
  "performanceScoreZ",
  "sourceCorrectRate",
  "문항 정답률",
  "비교 계산식",
]) {
  assert.ok(!guestResult.includes(privateCopy), `게스트 결과 화면에 내부 지표가 있습니다: ${privateCopy}`);
  assert.ok(!arenaProfile.includes(privateCopy), `연결된 게스트 기록에 내부 지표가 있습니다: ${privateCopy}`);
}

// 도전장은 단일 게스트와의 1:1 경기가 아니라, 같은 5문제를 푸는
// 여러 참가자의 순위표다. 생성 진입점과 게스트 결과가 두 번 다시 1:1로
// 되돌아가지 않도록 사용자 문구와 마크업 계약을 함께 고정한다.
for (const groupChallengeCopy of [
  "친선전 · 단체 도전장",
  "같은 5문제로 단톡방 순위전",
  "여러 명이 로그인 없이 참여",
  "도전장 뿌리기",
]) {
  assert.ok(matchResult.includes(groupChallengeCopy), `도전장 생성 화면에 단체 참가 문구가 없습니다: ${groupChallengeCopy}`);
}
for (const retiredOneGuestCopy of [
  "한 명의 게스트만 참여",
  "한 링크에는 지금 이 닉네임만 참여",
  "게스트 친선 링크 만들기",
]) {
  assert.ok(!matchResult.includes(retiredOneGuestCopy), `도전장 생성 화면에 1인 전용 문구가 남아 있습니다: ${retiredOneGuestCopy}`);
  assert.ok(!guestResult.includes(retiredOneGuestCopy), `게스트 도전장에 1인 전용 문구가 남아 있습니다: ${retiredOneGuestCopy}`);
}
for (const shareUiContract of [
  "data-guest-share-form",
  "data-guest-share-link",
  "data-guest-share-copy",
  "링크 복사",
]) {
  assert.ok(matchResult.includes(shareUiContract), `도전장 링크 생성·복사 UI 계약이 없습니다: ${shareUiContract}`);
}
assert.ok(matchClient.includes('headers: { Accept: "application/json" }'));
assert.ok(matchClient.includes("navigator.clipboard.writeText"));
assert.ok(matchClient.includes("data-guest-share-panel"));
assert.ok(guestChallengeController.includes("inviteUrl: absoluteGuestInviteUrl"));
assert.ok(guestChallengeController.includes('res.status(201).json'));

// 공개 화면의 도전장 유효기간은 생성 시점부터 3일이다. 결제 등 다른
// 기능의 30분 제한과 혼동하지 않도록 도전장 관련 활성 화면만 검사한다.
for (const [source, screen] of [
  [home, "GOAT Arena 메인"],
  [matchResult, "경기 결과"],
  [adminArenaPolicies, "운영자 Arena 정책"],
]) {
  assert.ok(source.includes("3일"), `${screen} 화면에 도전장 3일 유효기간 안내가 없습니다.`);
  assert.ok(!source.includes("30분"), `${screen} 화면에 폐기된 도전장 30분 안내가 남아 있습니다.`);
}
assert.ok(guestResult.includes("linkTtlDays"), "게스트 도전장 화면이 서버의 확정 유효기간을 사용하지 않습니다.");
assert.ok(!guestResult.includes("30분"), "게스트 도전장 화면에 폐기된 도전장 30분 안내가 남아 있습니다.");

// 닉네임은 별도의 '중복 확인' 버튼 없이 입력 중 서버에서 확인한다.
for (const nicknameHook of [
  "data-guest-nickname-form",
  "data-guest-nickname-input",
  "data-guest-nickname-status",
  "data-guest-nickname-submit",
  'aria-live="polite"',
]) {
  assert.ok(guestResult.includes(nicknameHook), `게스트 닉네임 자동 확인 훅이 없습니다: ${nicknameHook}`);
}
assert.match(guestResult, /data-guest-nickname-submit[^>]*disabled/);
assert.doesNotMatch(guestResult, />\s*중복 확인\s*</);
assert.ok(!guestResult.includes("닉네임 확인하고 참여"));
assert.match(guestResult, /<script src="\/js\/arena-guest-challenge\.js(?:\?noteGrid=1)?" defer><\/script>/);

assert.ok(
  guestChallengeScript.includes("/nickname-availability"),
  "게스트 닉네임 자동 확인 API 호출이 없습니다."
);
assert.ok(guestChallengeScript.includes('method: "POST"'));
assert.ok(guestChallengeScript.includes("JSON.stringify({ nickname, birthDate })"));
assert.match(guestChallengeScript, /new AbortController\(\)/);
assert.match(guestChallengeScript, /activeController\?\.abort\(\)/);
assert.match(guestChallengeScript, /setTimeout\(checkAvailability,\s*\d+\)/);
assert.match(guestChallengeScript, /input\.addEventListener\("input"/);

// 게스트 식별은 닉네임과 생년월일 조합으로 확인한다. 생년월일 원문은
// 보내되 서버에는 단방향 해시만 저장하고 두 값이 모두 유효해야 제출된다.
for (const identityHook of [
  "data-guest-birth-date",
  'name="birthDate"',
  'autocomplete="bday"',
  "생년월일 원문은 저장하지 않고",
  "같은 조합으로 순위표에 바로 돌아갑니다",
  "다른 참가자로 참여",
  "개인정보처리방침",
]) {
  assert.ok(guestResult.includes(identityHook), `게스트 신원 입력 계약이 없습니다: ${identityHook}`);
}
for (const identityScriptHook of [
  "birthDateInput",
  "identityKey",
  '"Content-Type": "application/json"',
  "updateSubmitState",
]) {
  assert.ok(guestChallengeScript.includes(identityScriptHook), `게스트 신원 UI 로직이 없습니다: ${identityScriptHook}`);
}
assert.ok(
  !guestChallengeScript.includes("birthDate="),
  "생년월일 원문을 URL 쿼리에 포함하면 안 됩니다."
);
assert.ok(
  guestChallengeScript.includes('submit.disabled = identityState !== "available";'),
  "닉네임과 생년월일이 모두 서버에서 확인된 때만 참가 폼을 제출해야 합니다."
);
assert.ok(!guestResult.includes("다시 도전"));
assert.ok(!guestResult.includes("가장 좋은 완료 기록"));

for (const leaderboardMarkup of [
  "arena-challenge-leaderboard",
  "arena-challenge-leaderboard-table",
  "도전장 순위",
  "joinedGuestCount",
  "completedGuestCount",
  "leaderboard.rows",
]) {
  assert.ok(guestResult.includes(leaderboardMarkup), `단체 도전장 순위표 마크업이 없습니다: ${leaderboardMarkup}`);
}

// 여러 참가자의 상세 기록은 접근 가능한 탭으로 전환하며, 각 탭에서
// 다섯 문제의 정오답과 전체 풀이과정을 확인할 수 있어야 한다.
for (const participantDetailMarkup of [
  'role="tablist"',
  'role="tab"',
  'role="tabpanel"',
  "aria-selected=",
  "aria-controls=",
  "data-participant-tab",
  "data-participant-panel",
  "data-participant-tab-shortcut",
  "entry.questions",
  'question.correct ? "정답" : "오답"',
  "전체 풀이과정",
  "난이도 보정 성취지표",
  "entry.solutions",
  "data-guest-solution-preview",
  "발신자 기록은",
  "현재 참가자가 모두 완료한 순간 공개합니다.",
]) {
  assert.ok(guestResult.includes(participantDetailMarkup), `참가자 상세 탭 계약이 없습니다: ${participantDetailMarkup}`);
}
for (const tabScriptHook of [
  "ArrowRight",
  "ArrowLeft",
  "Home",
  "End",
  "hydrateSolutionPreviews",
]) {
  assert.ok(guestChallengeScript.includes(tabScriptHook), `참가자 상세 탭 동작이 없습니다: ${tabScriptHook}`);
}
for (const styleHook of [
  ".arena-challenge-participant-tablist",
  ".arena-challenge-solution-preview",
  ".arena-reverse-challenge-card",
]) {
  assert.ok(guestChallengeStyles.includes(styleHook), `기존 디자인 범위의 도전장 UI 스타일이 없습니다: ${styleHook}`);
}

// 완료한 게스트는 회원가입으로 이동해 기록을 연결한 뒤, 그 완료 기록을
// 소스로 새 도전장을 생성하고 생성된 공유 링크를 확인한다.
for (const reverseChallengeHook of [
  "reverseChallengeRequestPath",
  "data-reverse-challenge-request",
  "역도전장 제안하기",
  "reverseCreatePath",
  "data-reverse-challenge-create",
  "역도전장 만들기",
  "reverseInvitePath",
  "data-reverse-invite-link",
]) {
  assert.ok(guestResult.includes(reverseChallengeHook), `역도전장 UI 계약이 없습니다: ${reverseChallengeHook}`);
}
assert.ok(guestResult.includes("로그인된 내 완료 기록으로 같은 5문제의 새 단체 도전장을 바로 만듭니다."));
assert.ok(guestResult.includes("회원가입 후 내 완료 기록으로 새 단체 도전장을 만들 수 있습니다."));
assert.ok(guestResult.includes("const linkTtlDays = Number(challenge.linkTtlDays) || 3;"));
assert.ok(arenaV2Config.includes("const guestChallengeLinkTtlDays = 3;"));
assert.ok(arenaV2Config.includes("fixedProductSeconds("));
assert.ok(arenaV2Config.includes("minimumCompletionGraceMs"));
assert.ok(guestChallengeService.includes("ArenaGuestChallengeAttempt.findOneAndUpdate("));
assert.ok(guestChallengeService.includes('status: "READY"'));
assert.ok(guestChallengeService.includes('status: { $in: ["IN_PROGRESS", "EVIDENCE_REQUIRED", "SETTLED"] }'));
for (const registrationHook of [
  "arenaGuestRegistrationClaim",
  "arenaGuestClaim.acceptedDateLabel",
  "data-arena-guest-registration-claim",
  "data-claim-nickname",
  "data-arena-guest-claim-confirmation",
  "도전장을 받은 분이 맞나요?",
  "이전 도전장 참가 기록을 불러옵니다",
]) {
  assert.ok(registration.includes(registrationHook), `회원가입 기록 연결 계약이 없습니다: ${registrationHook}`);
}
assert.ok(registrationScript.includes("updateClaimConfirmation"));
assert.ok(registrationScript.includes("data-arena-guest-claim-confirmation"));
const registrationClaimScript = registrationScript.slice(
  registrationScript.indexOf("function initArenaGuestRegistrationClaim"),
  registrationScript.indexOf("function init()", registrationScript.indexOf("function initArenaGuestRegistrationClaim"))
);
assert.ok(registrationClaimScript.includes("nicknameMatches"));
assert.ok(registrationClaimScript.includes("birthDateIsPresent"));
assert.ok(registrationClaimScript.includes("birthDateInput"));
assert.ok(!registrationClaimScript.includes("schoolSelect"));
assert.ok(guestChallengeController.includes('req.session.returnTo = `/goat-arena/guest-records/'));
assert.ok(guestChallengeController.includes('res.redirect("/student/register?arenaReverse=1")'));
assert.ok(guestChallengeController.includes("challenge.reverseCreatePath"));
assert.ok(guestChallengeController.includes("challenge.reverseInvitePath"));

const routes = read("routes/goat-arena-routes.js");
assert.match(
  routes,
  /router\.post\(\s*"\/api\/arena-invite\/:token\/nickname-availability",\s*arenaGuestPlayIpHardRateLimit,\s*arenaGuestPlayIpRateLimit,\s*arenaGuestChallengeController\.nicknameAvailability/
);
assert.match(
  routes,
  /"\/api\/arena-invite\/:token\/lock-question",\s*arenaGuestPlayIpHardRateLimit,\s*arenaGuestPlayIpRateLimit,\s*arenaGuestChallengeController\.lockQuestionCompletion/
);
assert.match(
  routes,
  /"\/arena-invite\/:token\/reverse-challenge",\s*arenaGuestClaimIpRateLimit,\s*arenaGuestChallengeController\.beginReverseChallengeRegistration/
);
assert.match(
  routes,
  /"\/goat-arena\/guest-records\/:attemptId\/guest-invitations",\s*authMiddleware\.isLoggedIn,\s*arenaGuestChallengeController\.createReverseChallenge/
);
assert.match(
  routes,
  /"\/goat-arena\/rules",\s*authMiddleware\.isLoggedIn,\s*goatArenaController\.rulesPage/
);
assert.doesNotMatch(routes, /"\/goat-arena\/rankings"/);
assert.ok(routes.includes('"/goat-arena/rules/sub"'));
assert.ok(routes.includes('"/goat-arena/rules/main"'));
assert.ok(navigation.includes('href: "/goat-arena/rules"'));
assert.match(
  routes,
  /"\/api\/arena-invite\/:token\/solution-board",\s*arenaGuestEvidenceIpHardRateLimit,\s*arenaGuestEvidenceIpRateLimit,\s*arenaGuestChallengeController\.authorizeBoardUpload,\s*arenaEvidenceUpload\.single/
);
assert.match(
  routes,
  /"\/arena-invite\/:token\/evidence",\s*arenaGuestEvidenceIpHardRateLimit,\s*arenaGuestEvidenceIpRateLimit,\s*arenaGuestChallengeController\.authorizeEvidenceUpload,\s*arenaEvidenceUpload\.array/
);
for (const securityHook of [
  "ARENA_GUEST_PLAY_IP_HARD_LIMIT_PER_15_MIN",
  "ARENA_GUEST_EVIDENCE_IP_HARD_LIMIT_PER_HOUR",
  "arenaGuestPlayIpHardRateLimit",
  "arenaGuestEvidenceIpHardRateLimit",
]) {
  assert.ok(requestSecurity.includes(securityHook), `게스트 공개 경로 IP 상한이 없습니다: ${securityHook}`);
}
assert.ok(guestChallengeService.includes("assertGuestBoardUploadAuthorized"));
assert.ok(guestChallengeService.includes("assertGuestEvidenceUploadAuthorized"));
assert.ok(guestChallengeService.includes("lockGuestQuestionCompletion"));
assert.ok(guestChallengeService.includes("guestChallengeResultsReleaseState"));
assert.ok(guestChallengeService.includes("ARENA_GUEST_CREATOR_RESULT_PENDING"));
assert.ok(guestChallengeService.includes("expiresIn: 5 * 60"));
assert.ok(guestChallengeService.includes("GUEST_CHALLENGE_EVIDENCE_HOLD"));
assert.ok(arenaEvidenceService.includes("EVIDENCE_PURGE_IN_PROGRESS"));
assert.ok(arenaEvidenceService.includes("sourceEvidenceId: claim._id"));
assert.ok(arenaEvidenceService.includes("hasLegacyArenaEvidenceReference"));
assert.ok(!guestResult.includes("file.originalName"));
assert.ok(guestResult.includes("file.displayName"));
assert.ok(guestChallengeScript.includes("/lock-question"));
assert.ok(guestChallengeScript.includes('window.MatthsNoteGrid.isTouchBoardDevice()'));
assert.ok(read("public/js/matths-note-grid.js").includes("maxTouchPoints"));
assert.ok(guestChallengeStyles.includes(".arena-touch-board-enabled .arena-inline-solution"));
assert.ok(guestChallengeScript.includes("attemptId}:${slot}"));
assert.ok(guestChallengeScript.includes("boardStorageTtlMs"));
assert.ok(guestChallengeScript.includes("savedAt: Date.now()"));
assert.ok(guestChallengeScript.includes("clearAttemptBoardStorage"));
assert.ok(fileStorage.includes("useExpiringDelivery"));
assert.ok(fileStorage.includes("private_download_url"));
assert.match(goatArenaModel, /enum:\s*\["CLOUDINARY",\s*"R2",\s*"PURGED"\]/);
assert.ok(goatArenaModel.includes("r2ObjectKey"));
assert.ok(goatArenaModel.includes("r2Sha256"));
assert.ok(goatArenaModel.includes("r2ETag"));
assert.ok(privacy.includes("도전장 격자 풀이 초안"));
assert.ok(privacy.includes("최대 4일"));

const controller = read("controllers/goatArenaController.js");
assert.ok(controller.includes('res.render(division ? "goat-arena-rules" : "goat-arena-rules-index"'));
assert.ok(controller.includes('exports.subRulesPage = rulesPage("SUB")'));
assert.ok(controller.includes('exports.mainRulesPage = rulesPage("MAIN")'));
assert.ok(guestChallengeController.includes("arenaGuestMatchInviteFlash"));
assert.ok(guestChallengeController.includes("arenaGuestReverseInviteFlash"));
assert.ok(guestChallengeController.includes("disablePageAnalytics: true"));
assert.ok(guestChallengeController.includes('res.set("Referrer-Policy", "no-referrer")'));
assert.ok(guestChallengeController.includes("viewerUserId: viewerUserId(req)"));
assert.ok(guestChallengeService.includes("claimedByUserId: viewerUserId"));
assert.ok(!guestChallengeController.includes("?guestInvite="));
assert.ok(!guestChallengeController.includes("?reverseInvite="));
assert.ok(controller.includes("arenaGuestMatchInviteFlash"));
assert.ok(!controller.includes("req.query.guestInvite"));

console.log("GOAT Arena 2.2 split rulebook verification passed");

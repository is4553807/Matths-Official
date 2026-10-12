const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getAccountPlanConfig, PLAN_CODES } = require("../services/accountPlanService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");
const {
  SCORING_VERSION,
  calculateCompetitivePerformance,
  compareCompetitivePerformance,
} = require("../services/arenaCompetitiveScoringService");

const root = path.resolve(__dirname, "..");
const koreanDirectory = path.join(root, "docs", "logic");
const englishDirectory = path.join(root, "docs", "logic_en");
const expectedFiles = [
  "01_MATTHS_CURRENT_SYSTEM.md",
  "02_GOAT_ARENA_COMMON_MATCH_RULES.md",
  "03_NORMAL_MATCH.md",
  "04_COMPETITIVE_MATCH.md",
  "05_FRIENDLY_AND_GUEST_CHALLENGE.md",
  "06_RATING_AND_SCORING.md",
  "07_QUESTION_AND_EVIDENCE.md",
  "08_ACCOUNTS_PLANS_AND_ENTITLEMENTS.md",
  "09_WEEKLY_MOCK_AND_RANKING.md",
  "10_ADMIN_OPERATIONS.md",
  "11_DATA_STORAGE_AND_SECURITY.md",
  "12_API_AND_BACKGROUND_JOBS.md",
  "13_RELEASE_AND_VALIDATION.md",
];

function markdownFiles(directory) {
  return fs.readdirSync(directory)
    .filter((filename) => filename.endsWith(".md"))
    .sort();
}

function combinedText(directory) {
  return expectedFiles
    .map((filename) => fs.readFileSync(path.join(directory, filename), "utf8"))
    .join("\n");
}

assert.deepEqual(markdownFiles(koreanDirectory), expectedFiles);
assert.deepEqual(markdownFiles(englishDirectory), expectedFiles);

const korean = combinedText(koreanDirectory);
const english = combinedText(englishDirectory);
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

for (const term of [
  "숨은 MMR",
  "문항당 10분",
  "3일",
  "유효한 일반전 3경기",
  "350 / sqrt",
  "5,500원",
  "부정행위",
]) {
  assert.ok(korean.includes(term), `한국어 현행 문서에 필수 내용이 없습니다: ${term}`);
}

for (const term of [
  "hidden MMR",
  "ten minutes per question",
  "three days",
  "three valid normal matches",
  "350 / sqrt",
  "KRW 5,500",
  "cheating detection",
]) {
  assert.ok(
    english.toLowerCase().includes(term.toLowerCase()),
    `English current-state documentation is missing: ${term}`
  );
}

for (const obsoleteTerm of [
  "페이백",
  "학습일수 예치",
  "복수전",
  "Ranked 상점",
  "payback",
  "learning-day deposit",
  "revenge match",
  "retired",
]) {
  assert.ok(!`${korean}\n${english}\n${readme}`.toLowerCase().includes(obsoleteTerm.toLowerCase()),
    `현재 문서에 사용하지 않는 정책이 남아 있습니다: ${obsoleteTerm}`);
}

assert.deepEqual(PLAN_CODES, { FREE: "FREE", PRO: "PRO" });
const plan = getAccountPlanConfig({});
assert.equal(plan.proPriceAmount, 5500);
assert.equal(plan.proBillingPeriodDays, 30);

const config = GOAT_ARENA_V2_CONFIG;
assert.equal(config.glicko2.defaultRating, 1500);
assert.equal(config.glicko2.defaultRatingDeviation, 350);
assert.equal(config.glicko2.defaultVolatility, 0.06);
assert.equal(config.glicko2.systemConstant, 0.5);
assert.equal(config.asyncNormal.defaultRating, 1000);
assert.equal(config.asyncNormal.questionRepeatWindowMatches, 10);
assert.equal(config.requiredNormalMatches, 3);
assert.equal(config.placement.minimumAttempts, 1);
assert.equal(config.placement.maximumAttempts, 5);
assert.equal(config.competitiveScore.kFactor, 32);
assert.equal(config.guestChallenge.linkTtlDays, 3);
assert.equal(config.guestChallenge.participantLimit, null);

const sample = calculateCompetitivePerformance({
  questions: Array.from({ length: 5 }, (_, index) => ({
    questionKey: `Q${index + 1}`,
    correct: index < 3,
    sourceAccuracyRate: 0.5,
  })),
  totalSolveTimeMs: 300000,
});
assert.equal(sample.scoringVersion, SCORING_VERSION);
assert.equal(
  compareCompetitivePerformance(sample, sample, {
    closeScoreThreshold: config.asyncNormal.closeScoreThreshold,
  }).reason,
  "DRAW"
);

console.log("현재 코드와 한·영 로직 문서 13개 정합성 검증 완료");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_LEARNING_PACKAGE_DAYS,
  DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT,
  defaultLearningPackagePolicyDefinition,
} = require("../services/arenaPolicyService");
const {
  DEFAULT_CALIBRATION_WEEKLY_EXAMS,
  DEFAULT_MONTHLY_PRICE_AMOUNT,
  MOCK_EXAM_PRODUCT_NAME,
} = require("../services/mockExamPackageService");
const {
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
  ARENA_ONE_ON_ONE_PACKS_PER_PAIR,
  ARENA_ONE_ON_ONE_QUESTION_COUNT,
  ARENA_ONE_ON_ONE_START_LIMIT_MS,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  SUB_TIER_PAIR_CONFIG,
} = require("../services/arenaOneOnOneProblemBank");
const {
  SUB_NORMAL_STAKE_DAYS,
  SUB_REVENGE_STAKE_DAYS,
} = require("../services/arenaDivisionRuleService");
const {
  SOFT_RESET_RETENTION,
} = require("../services/arenaSeasonService");

const root = path.resolve(__dirname, "..");
const logicDirectory = path.join(root, "docs", "logic");
const logicFiles = fs
  .readdirSync(logicDirectory)
  .filter((filename) => /^\d{2}_.+\.md$/.test(filename))
  .sort();
assert.deepEqual(
  logicFiles.map((filename) => filename.slice(0, 2)),
  Array.from({ length: 13 }, (_, index) => String(index + 1).padStart(2, "0")),
  "권위 규칙 문서는 01~13이 빠짐없이 한 번씩 존재해야 합니다."
);

const logicText = logicFiles
  .map((filename) => fs.readFileSync(path.join(logicDirectory, filename), "utf8"))
  .join("\n");
const userFacingText = ["views", "controllers", "services", "routes"]
  .flatMap((directory) => {
    const walk = (current) => fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(current, entry.name);
      return entry.isDirectory()
        ? walk(absolute)
        : /\.(?:js|ejs)$/.test(entry.name)
          ? [fs.readFileSync(absolute, "utf8")]
          : [];
    });
    return walk(path.join(root, directory));
  })
  .join("\n");

for (const retiredName of ["모의고사 전용 패키지", "Sub Ranking", "Main Ranking"]) {
  assert.ok(!logicText.includes(retiredName), `규칙 문서에 폐기한 명칭이 남아 있습니다: ${retiredName}`);
  assert.ok(!userFacingText.includes(retiredName), `웹 코드에 폐기한 명칭이 남아 있습니다: ${retiredName}`);
}
assert.ok(logicText.includes(MOCK_EXAM_PRODUCT_NAME));
assert.equal(DEFAULT_MONTHLY_PRICE_AMOUNT, 5000);
assert.equal(DEFAULT_CALIBRATION_WEEKLY_EXAMS, 4);
assert.equal(DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT, 29000);
assert.equal(DEFAULT_LEARNING_PACKAGE_DAYS, 29);

const learningPolicy = defaultLearningPackagePolicyDefinition();
assert.equal(learningPolicy.initialPaybackScoreDays, 29);
assert.equal(learningPolicy.payback.minimumAttackParticipationDays, 15);
assert.deepEqual(
  learningPolicy.payback.bands.map((band) => [band.minScoreDays, band.maxScoreDays, band.ratePercent]),
  [[0, 29, 0], [30, 34, 50], [35, 39, 80], [40, null, 100]]
);

assert.equal(ARENA_ONE_ON_ONE_QUESTION_COUNT, 5);
assert.equal(ARENA_ONE_ON_ONE_TIME_LIMIT_MS, 10 * 60 * 1000);
assert.equal(ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS, 60 * 1000);
assert.equal(ARENA_ONE_ON_ONE_START_LIMIT_MS, 24 * 60 * 60 * 1000);
assert.equal(ARENA_ONE_ON_ONE_PACKS_PER_PAIR, 30);
assert.equal(SUB_TIER_PAIR_CONFIG.length, 17);
assert.ok(
  SUB_TIER_PAIR_CONFIG.every(
    (pair) => pair.packSlots.length === 30 && pair.packSlots.every((pack) => pack.questionSlots.length === 5)
  )
);
assert.equal(SUB_NORMAL_STAKE_DAYS, 1);
assert.equal(SUB_REVENGE_STAKE_DAYS, 2);
assert.equal(SOFT_RESET_RETENTION, 0.6);

for (const retiredDormancyRule of [
  "미활동 1~19일차",
  "20일차 추가 차감 없음",
  "RANKED_ASSESSMENT_REQUIRED",
  "Ranked 휴면 평가",
  "휴면 강등 예치분",
]) {
  assert.ok(
    !logicText.includes(retiredDormancyRule),
    `권위 문서에 폐기한 Ranked 휴면 규칙이 남아 있습니다: ${retiredDormancyRule}`
  );
}

for (const requiredRule of [
  "일요일 14:00",
  "일요일 15:00",
  "점수 높은 순 → 정답 수 많은 순 → 정답 문항 풀이시간 짧은 순 → 전체 풀이시간 짧은 순",
  "정기권 학습 가능 일수",
  "학습권 패키지",
  "페이백 점수",
  "공격 출석",
  "최종 종합 랭킹",
]) {
  assert.ok(logicText.includes(requiredRule), `권위 문서에서 핵심 규칙을 찾을 수 없습니다: ${requiredRule}`);
}

console.log(
  `규칙 문서 13개·상품·페이백·1대1·시즌 핵심 상수와 웹 용어 정합성 검증 완료`
);

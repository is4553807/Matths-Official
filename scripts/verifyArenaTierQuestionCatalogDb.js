const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const {
  ArenaTierQuestionCatalogVersion,
} = require("../models/goatArenaModel");
const {
  reloadActiveProblemTypeControls,
} = require("../services/problemTypeCatalogService");
const {
  generateSubOneOnOneQuestionsFromActiveData,
  generateMainOneOnOneQuestionsFromActiveData,
} = require("../services/arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  PACK_COURSE_SLOTS,
  isNaturalNumberMaxThreeDigits,
} = require("../services/arenaOneOnOneDifficultyPolicy");

function verifyGeneration(generation, active) {
  assert.equal(String(generation.tierCatalogVersionId), String(active._id));
  assert.equal(generation.contentSourceVersion, active.code);
  assert.equal(generation.questions.length, 5);
  assert.deepEqual(
    generation.questions.map((item) => item.definition.courseId),
    PACK_COURSE_SLOTS
  );
  assert.equal(new Set(generation.questions.map((item) => item.typeId)).size, 5);
  assert.equal(
    generation.questions.every((item) => isNaturalNumberMaxThreeDigits(item.problem.answer)),
    true
  );
}

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);
  await reloadActiveProblemTypeControls();

  const [active, activeCount] = await Promise.all([
    ArenaTierQuestionCatalogVersion.findOne({ status: "ACTIVE" }).lean(),
    ArenaTierQuestionCatalogVersion.countDocuments({ status: "ACTIVE" }),
  ]);
  assert.ok(active, "적용 중인 Arena T1~T9 문제 유형 카탈로그가 없습니다.");
  assert.equal(activeCount, 1, "적용 중인 Arena 티어 카탈로그는 정확히 하나여야 합니다.");
  assert.equal(active.validationReport?.passed, true);
  assert.equal(active.typeDefinitions?.length, 30);
  assert.equal(active.tierConfigurations?.length, 9);
  assert.equal(active.referenceQuestions?.length, 270);
  assert.equal(active.validationReport?.mappedEngineCount, 67);
  assert.equal(active.validationReport?.answeredReferenceQuestionCount, 270);
  assert.equal(active.validationReport?.solutionProcessReferenceCount, 270);
  assert.equal(active.validationReport?.multipleChoiceReferenceCount, 168);
  assert.equal(active.validationReport?.naturalNumberReferenceCount, 102);
  assert.equal(active.validationReport?.liveEligibleReferenceCount, 0);
  assert.equal(active.referenceQuestions.every((item) => item.liveQuestionEligible === false), true);
  assert.equal(
    active.referenceQuestions.every(
      (item) =>
        item.answerStructureValidated === true &&
        String(item.answer || "").trim() &&
        String(item.normalizedAnswer || "").trim() &&
        Array.isArray(item.solutionProcess) &&
        item.solutionProcess.length === 5 &&
        item.solutionProcess.every(
          (step) => Number(step.step) >= 1 && String(step.explanation || "").trim()
        )
    ),
    true
  );
  assert.equal(
    active.referenceQuestions.filter((item) => item.answerFormat === "MULTIPLE_CHOICE").length,
    168
  );
  assert.equal(
    active.referenceQuestions.filter((item) => item.answerFormat === "NATURAL_NUMBER").length,
    102
  );

  const sub = await generateSubOneOnOneQuestionsFromActiveData({
    challengerTier: "BRONZE",
    defenderTier: "SILVER",
    matchKey: "db-verify-sub-tier-catalog",
  });
  verifyGeneration(sub, active);
  const subDraft = buildGeneratedArenaProblemPackDraft({
    generation: sub,
    matchKey: "db-verify-sub-tier-catalog",
    division: "SUB",
  });
  assert.equal(String(subDraft.tierCatalogVersionId), String(active._id));

  const main = await generateMainOneOnOneQuestionsFromActiveData({
    lowerTier: "GOLD",
    upperTier: "DIAMOND",
    matchKey: "db-verify-main-tier-catalog",
  });
  verifyGeneration(main, active);
  const mainDraft = buildGeneratedArenaProblemPackDraft({
    generation: main,
    matchKey: "db-verify-main-tier-catalog",
    division: "MAIN",
  });
  assert.equal(String(mainDraft.tierCatalogVersionId), String(active._id));

  console.log(
    `Arena tier catalog DB verification passed: code=${active.code} types=30 tiers=9 references=270 answers=270 solutions=270 choices=168 naturals=102`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

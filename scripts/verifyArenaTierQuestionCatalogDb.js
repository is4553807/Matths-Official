const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const {
  ArenaTierQuestionCatalogVersion,
} = require("../models/goatArenaModel");
const {
  buildDifficultyVariantTypes,
} = require("../services/arenaTierQuestionCatalogService");
const {
  reloadActiveProblemTypeControls,
} = require("../services/problemTypeCatalogService");
const {
  MAIN_TIER_PAIR_CONFIG,
  SUB_TIER_PAIR_CONFIG,
  generateSubOneOnOneQuestionsFromActiveData,
  generateMainOneOnOneQuestionsFromActiveData,
} = require("../services/arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  PACK_RULES,
  isNaturalNumberMaxThreeDigits,
} = require("../services/arenaOneOnOneDifficultyPolicy");

function assertRenderableMathPrompt(prompt, label = "문항") {
  const source = String(prompt || "");
  assert.ok(source.trim(), `${label}: 문제 본문이 비어 있습니다.`);
  assert.equal(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(source),
    false,
    `${label}: TeX 이스케이프가 제어문자로 변환되었습니다.`
  );
  const dollarCount = (source.match(/(?<!\\)\$/g) || []).length;
  assert.equal(dollarCount % 2, 0, `${label}: $ 수식 구분자가 닫히지 않았습니다.`);
  assert.equal(
    (source.match(/\\\(/g) || []).length,
    (source.match(/\\\)/g) || []).length,
    `${label}: \\( \\) 수식 구분자가 맞지 않습니다.`
  );
  assert.equal(
    (source.match(/\\\[/g) || []).length,
    (source.match(/\\\]/g) || []).length,
    `${label}: \\[ \\] 수식 구분자가 맞지 않습니다.`
  );
}

function verifyGeneration(generation, active, division) {
  assert.equal(String(generation.tierCatalogVersionId), String(active._id));
  assert.equal(generation.contentSourceVersion, active.code);
  assert.equal(generation.questions.length, 5);
  const counts = generation.questions.reduce((result, item) => {
    result[item.definition.courseId] = Number(result[item.definition.courseId] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, PACK_RULES.unitMix);
  const ranked = division === "MAIN";
  assert.equal(generation.questions[4].design.slotRole, ranked ? "FINAL_29_30" : "REGULAR");
  assert.equal(generation.questions[4].difficultyClass, ranked ? "KILLER" : "SEMI_KILLER");
  const regularItems = ranked ? generation.questions.slice(0, 4) : generation.questions;
  assert.equal(
    regularItems.every(
      (item) =>
        item.difficultyClass === "SEMI_KILLER" &&
        /^ASSESSMENT_CENTER:advanced:/.test(item.generatorEngineKey) &&
        /^advanced:/.test(item.generatorTypeId) &&
        item.validation?.catalogTypeMatched === true
    ),
    true,
    `${generation.pairKey}: 일반 슬롯은 표시된 공식 유형과 직접 결속된 독립 검산 생성기를 사용해야 합니다.`
  );
  if (ranked) {
    assert.equal(generation.questions[4].design.sourcePositionBand, "Q29_30_KILLER");
    assert.match(generation.questions[4].generatorEngineKey, /^ARENA_FINAL_KILLER:/);
    assert.ok(
      generation.questions[4].definition.skillTags.includes("29·30번형"),
      "Ranked 5번은 독립 생성·검산한 29·30번형 킬러여야 합니다."
    );
  }
  assert.ok(generation.questions.every((item) => item.typeId.startsWith(`${ranked ? "R" : "U"}`)));
  assert.equal(new Set(generation.questions.map((item) => item.typeId)).size, 5);
  assert.equal(
    new Set(generation.questions.map((item) => item.sourceTypeId)).size,
    5,
    `${generation.pairKey}: 한 경기 안에서 공식 기본 유형이 중복되었습니다.`
  );
  assert.equal(
    new Set(generation.questions.map((item) => item.generatorEngineKey)).size,
    5,
    `${generation.pairKey}: 한 경기 안에서 생성기가 중복되었습니다.`
  );
  assert.equal(
    generation.questions.every((item) => isNaturalNumberMaxThreeDigits(item.problem.answer)),
    true
  );
  generation.questions.forEach((item, index) => {
    assertRenderableMathPrompt(
      item.problem?.prompt,
      `${generation.pairKey} ${index + 1}번`
    );
  });
  assert.equal(
    generation.questions.every(
      (item) =>
        item.validation?.passed === true &&
        item.validation?.solvable === true &&
        item.validation?.uniqueAnswer === true &&
        item.validation?.calculatorFree === true &&
        item.validation?.answerMatches === true &&
        item.validation?.validationMode === "TYPE_SPECIFIC"
    ),
    true,
    `${generation.pairKey}: 다섯 문항 중 생성·독립 검산을 통과하지 않은 문항이 있습니다.`
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
  for (const difficultyPrefix of ["U", "R"]) {
    for (let difficultyIndex = 1; difficultyIndex <= 9; difficultyIndex += 1) {
      const code = `${difficultyPrefix}${difficultyIndex}`;
      const variants = buildDifficultyVariantTypes(active, code);
      assert.equal(variants.length, 30, `${code}: 유형 수`);
      assert.equal(new Set(variants.map((item) => item.variantTypeId)).size, 30);
    }
  }
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

  let verifiedPackCount = 0;
  let renderedVisualizationCount = 0;
  for (const pair of SUB_TIER_PAIR_CONFIG) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const matchKey = `db-verify-sub-${pair.key}-${sample}`;
      const generation = await generateSubOneOnOneQuestionsFromActiveData({
        challengerTier: pair.challengerTier,
        defenderTier: pair.defenderTier,
        matchKey,
      });
      verifyGeneration(generation, active, "SUB");
      renderedVisualizationCount += generation.questions.filter(
        (item) => item.design?.graphItem === true && item.problem?.visualization
      ).length;
      const draft = buildGeneratedArenaProblemPackDraft({
        generation,
        matchKey,
        division: "SUB",
      });
      assert.equal(String(draft.tierCatalogVersionId), String(active._id));
      verifiedPackCount += 1;
    }
  }

  for (const pair of MAIN_TIER_PAIR_CONFIG) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const matchKey = `db-verify-main-${pair.key}-${sample}`;
      const generation = await generateMainOneOnOneQuestionsFromActiveData({
        lowerTier: pair.challengerTier,
        upperTier: pair.defenderTier,
        matchKey,
      });
      verifyGeneration(generation, active, "MAIN");
      renderedVisualizationCount += generation.questions.filter(
        (item) => item.design?.graphItem === true && item.problem?.visualization
      ).length;
      const draft = buildGeneratedArenaProblemPackDraft({
        generation,
        matchKey,
        division: "MAIN",
      });
      assert.equal(String(draft.tierCatalogVersionId), String(active._id));
      verifiedPackCount += 1;
    }
  }

  assert.ok(verifiedPackCount >= 100, "전체 티어 조합 반복 검증 수가 부족합니다.");
  assert.equal(
    renderedVisualizationCount,
    0,
    "문제 본문에 제시됐다는 명시가 없는 풀이용 그래프는 경기 화면에 노출하면 안 됩니다."
  );

  console.log(
    `Arena tier catalog DB verification passed: code=${active.code} publicDifficulties=18 variantsPerDifficulty=30 types=30 tiers=9 references=270 answers=270 solutions=270 choices=168 naturals=102 packs=${verifiedPackCount} visualizations=${renderedVisualizationCount}`
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

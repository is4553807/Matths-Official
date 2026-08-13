const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const {
  ArenaProblemPack,
  ArenaTierQuestionCatalogVersion,
} = require("../models/goatArenaModel");
const {
  buildDifficultyVariantTypes,
  generateQuestionsFromTierCatalog,
} = require("../services/arenaTierQuestionCatalogService");
const {
  reloadActiveProblemTypeControls,
} = require("../services/problemTypeCatalogService");
const {
  MAIN_TIER_PAIR_CONFIG,
  SUB_TIER_PAIR_CONFIG,
} = require("../services/arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  PACK_RULES,
  difficultyClassForDifficultyCodeSlot,
  difficultyGateForQuestion,
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
  const expectedClasses = generation.questions.map((_item, index) =>
    difficultyClassForDifficultyCodeSlot(generation.difficultyCode, index)
  );
  const expectedKillerCount = expectedClasses.filter(
    (difficultyClass) => difficultyClass === "KILLER"
  ).length;
  assert.equal(
    generation.questions.filter((item) => item.design.slotRole === "FINAL_29_30").length,
    expectedKillerCount
  );
  assert.equal(
    generation.questions.filter((item) => item.difficultyClass === "KILLER").length,
    expectedKillerCount
  );
  const regularItems = generation.questions.filter(
    (item) => item.design.slotRole === "REGULAR"
  );
  assert.equal(
    regularItems.every(
      (item) =>
        ["BASIC_GENERAL", "GENERAL", "UPPER_GENERAL", "SEMI_KILLER"].includes(
          item.difficultyClass
        ) &&
        /^ASSESSMENT_CENTER:/.test(item.generatorEngineKey) &&
        item.validation?.accuracyClassCertified === true
    ),
    true,
    `${generation.pairKey}: 일반 슬롯은 객관 난이도와 같은 검산 생성기를 사용해야 합니다.`
  );
  if (expectedKillerCount > 0) {
    const killerItems = generation.questions.filter(
      (item) => item.design.slotRole === "FINAL_29_30"
    );
    assert.equal(
      killerItems.every((item) => item.design.sourcePositionBand === "ACCURACY_KILLER"),
      true
    );
    assert.equal(
      killerItems.every((item) => /^ARENA_FINAL_KILLER:/.test(item.generatorEngineKey)),
      true
    );
    assert.ok(
      killerItems.every((item) => item.definition.skillTags.includes("29·30번형")),
      "킬러 슬롯은 독립 생성·검산한 29·30번형이어야 합니다."
    );
  }
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
  assert.equal(
    generation.questions.every(
      (item, index) => {
        const gate = difficultyGateForQuestion({
          difficultyCode: generation.difficultyCode,
          order: index + 1,
        });
        return (
        item.validation?.structuralDifficultyPassed === true &&
        item.validation?.accuracyClassCertified === true &&
        Number(item.design?.reasoningStepCount) >= gate.minimumReasoningSteps &&
        Number(item.design?.generatorDifficulty) >= gate.minimumGeneratorDifficulty &&
        Array.isArray(item.design?.targetAccuracy) &&
        item.design.targetAccuracy.length === 2
        );
      }
    ),
    true,
    `${generation.pairKey}: 구조 난이도와 예상 정답률 검증값이 누락되었습니다.`
  );
}

async function generateCatalogVerificationPack({ active, pair, matchKey, division }) {
  const questions = await generateQuestionsFromTierCatalog({
    version: active,
    difficultyTier: pair.difficultyTier,
    difficultyCode: pair.difficultyCode,
    challengerTier: pair.challengerTier,
    defenderTier: pair.defenderTier,
    matchKey,
    division,
  });
  return {
    pairKey: pair.key,
    pairLabel: pair.label,
    difficultyTier: pair.difficultyTier,
    difficultyCode: pair.difficultyCode,
    tierCatalogVersionId: active._id,
    contentSourceVersion: active.code,
    questions,
  };
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
      const generation = await generateCatalogVerificationPack({
        active,
        pair,
        matchKey,
        division: "SUB",
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
      await new ArenaProblemPack(draft).validate();
      verifiedPackCount += 1;
    }
  }

  for (const pair of MAIN_TIER_PAIR_CONFIG) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const matchKey = `db-verify-main-${pair.key}-${sample}`;
      const generation = await generateCatalogVerificationPack({
        active,
        pair,
        matchKey,
        division: "MAIN",
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
      await new ArenaProblemPack(draft).validate();
      verifiedPackCount += 1;
    }
  }

  assert.ok(verifiedPackCount >= 100, "전체 티어 조합 반복 검증 수가 부족합니다.");
  assert.equal(
    renderedVisualizationCount,
    0,
    "문제 본문에 제시됐다는 명시가 없는 풀이용 그래프는 경기 화면에 노출하면 안 됩니다."
  );

  // Ranked 공식 상향 쟁탈전은 최소 한 티어 위 방어자를 사용하므로
  // 실제 조합이 존재하는 가장 낮은 공개 난이도는 R2(실버)다.
  for (const difficultyCode of ["U1", "U7", "R2", "R7"]) {
    const pairSource = difficultyCode.startsWith("U")
      ? SUB_TIER_PAIR_CONFIG
      : MAIN_TIER_PAIR_CONFIG;
    const pair = pairSource.find((item) => item.difficultyCode === difficultyCode);
    assert.ok(pair, `${difficultyCode}: 반복 회피 검증용 티어 조합이 없습니다.`);
    const first = await generateQuestionsFromTierCatalog({
      version: active,
      difficultyTier: pair.difficultyTier,
      difficultyCode,
      challengerTier: pair.challengerTier,
      defenderTier: pair.defenderTier,
      matchKey: `db-repeat-baseline-${difficultyCode}`,
      division: difficultyCode.startsWith("U") ? "SUB" : "MAIN",
    });
    const recentTypeIds = first.flatMap((item) => [item.typeId, item.sourceTypeId]);
    const next = await generateQuestionsFromTierCatalog({
      version: active,
      difficultyTier: pair.difficultyTier,
      difficultyCode,
      challengerTier: pair.challengerTier,
      defenderTier: pair.defenderTier,
      matchKey: `db-repeat-next-${difficultyCode}`,
      division: difficultyCode.startsWith("U") ? "SUB" : "MAIN",
      recentTypeIds,
    });
    assert.equal(
      next.some((item) => first.some((previous) => previous.typeId === item.typeId)),
      false,
      `${difficultyCode}: 최근 경기의 공개 유형이 바로 재등장했습니다.`
    );
  }

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

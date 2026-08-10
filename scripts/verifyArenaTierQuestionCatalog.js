const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ArenaTierQuestionCatalogVersion,
} = require("../models/goatArenaModel");
const {
  buildArenaTierCatalogDefinition,
  buildDifficultyVariantTypes,
  generateQuestionsFromTierCatalog,
  selectTierCatalogTypes,
} = require("../services/arenaTierQuestionCatalogService");
const {
  PACK_RULES,
  isNaturalNumberMaxThreeDigits,
} = require("../services/arenaOneOnOneDifficultyPolicy");

function assertCourseMix(questions) {
  const counts = questions.reduce((result, item) => {
    const courseId = item.curriculumUnit || item.definition?.courseId;
    result[courseId] = Number(result[courseId] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, PACK_RULES.unitMix);
}

async function main() {
  const sourcePath = path.resolve(process.argv[2] || "");
  assert.ok(process.argv[2], "검사할 T1~T9 JSON 파일 경로가 필요합니다.");
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  const raw = JSON.parse(sourceText);
  const definition = await buildArenaTierCatalogDefinition(
    raw,
    { sourceText, sourceFileName: path.basename(sourcePath) }
  );

  assert.equal(definition.typeDefinitions.length, 30);
  assert.equal(definition.tierConfigurations.length, 9);
  assert.equal(definition.referenceQuestions.length, 270);
  assert.equal(definition.referenceQuestions.every((item) => item.liveQuestionEligible === false), true);
  assert.equal(definition.validationReport.passed, true);
  assert.equal(definition.validationReport.answeredReferenceQuestionCount, 270);
  assert.equal(definition.validationReport.solutionProcessReferenceCount, 270);
  assert.equal(definition.validationReport.multipleChoiceReferenceCount, 168);
  assert.equal(definition.validationReport.naturalNumberReferenceCount, 102);
  assert.equal(definition.validationReport.liveEligibleReferenceCount, 0);
  assert.ok(definition.validationReport.mappedEngineCount >= 60);

  const sourceQuestionById = new Map(
    raw.tiers.flatMap((tier) => tier.questions).map((question) => [question.id, question])
  );
  for (const reference of definition.referenceQuestions) {
    const source = sourceQuestionById.get(reference.questionId);
    assert.ok(source, `${reference.questionId}: 원본 문항을 찾을 수 없습니다.`);
    assert.equal(reference.problemText, source.problem.text.trim());
    assert.deepEqual(
      reference.solutionProcess,
      source.solution.process.map((step) => ({
        step: Number(step.step),
        explanation: step.explanation.trim(),
      })),
      `${reference.questionId}: 풀이과정이 원본과 달라졌습니다.`
    );
    assert.equal(reference.finalCheck, source.solution.final_check.trim());
    assert.equal(reference.answer, source.solution.answer.trim());
    assert.equal(reference.answerStructureValidated, true);
    if (reference.answerFormat === "MULTIPLE_CHOICE") {
      assert.match(reference.answer, /^[①②③④⑤]$/);
      assert.match(reference.normalizedAnswer, /^[1-5]$/);
    } else {
      assert.equal(reference.answerFormat, "NATURAL_NUMBER");
      assert.match(reference.normalizedAnswer, /^\d{1,3}$/);
      assert.ok(Number(reference.normalizedAnswer) >= 1);
      assert.ok(Number(reference.normalizedAnswer) <= 999);
    }
  }

  const document = new ArenaTierQuestionCatalogVersion({
    ...definition,
    status: "ACTIVE",
    activatedAt: new Date(),
  });
  await document.validate();

  for (let difficultyIndex = 1; difficultyIndex <= 9; difficultyIndex += 1) {
    const difficultyTier = `T${difficultyIndex}`;
    for (const division of ["SUB", "MAIN"]) {
      const difficultyCode = `${division === "MAIN" ? "R" : "U"}${difficultyIndex}`;
      const variants = buildDifficultyVariantTypes(definition, difficultyCode);
      assert.equal(variants.length, 30);
      assert.equal(new Set(variants.map((item) => item.variantTypeId)).size, 30);
      assert.ok(variants.every((item) => item.variantTypeId.startsWith(`${difficultyCode}-`)));
      assert.equal(
        variants.filter((item) => item.difficultyClass === "KILLER").length,
        difficultyIndex >= 7 ? 30 : division === "MAIN" ? 5 : 0
      );

      const selectedTypes = selectTierCatalogTypes(
        definition,
        difficultyTier,
        `offline-verify:${difficultyCode}`,
        difficultyCode,
        { division }
      );
      assertCourseMix(selectedTypes);
      assert.equal(new Set(selectedTypes.map((item) => item.publicVariantTypeId)).size, 5);

      const questions = await generateQuestionsFromTierCatalog({
        version: definition,
        difficultyTier,
        difficultyCode,
        challengerTier: difficultyIndex === 1 ? "BRONZE" : "SILVER",
        defenderTier: difficultyIndex === 1 ? "BRONZE" : "GOLD",
        matchKey: `offline-verify:${difficultyCode}`,
        division,
      });
      assert.equal(questions.length, 5);
      assertCourseMix(questions);
      const allKiller = difficultyIndex >= 7;
      const killerCount = questions.filter(
        (item) => item.design.slotRole === "FINAL_29_30"
      ).length;
      assert.equal(killerCount, allKiller ? 5 : division === "MAIN" ? 1 : 0);
      assert.equal(
        questions.filter((item) => item.difficultyClass === "KILLER").length,
        allKiller ? 5 : division === "MAIN" ? 1 : 0
      );
      assert.ok(questions.every((item) => item.typeId.startsWith(`${difficultyCode}-`)));
      assert.equal(new Set(questions.map((item) => item.typeId)).size, 5);
      assert.equal(new Set(questions.map((item) => item.generatorEngineKey)).size, 5);
      const regularItems = questions.filter(
        (item) => item.design.slotRole === "REGULAR"
      );
      assert.equal(
        regularItems.every(
          (item) =>
            item.difficultyClass === "SEMI_KILLER" &&
            /^ARENA_SEMI_KILLER:/.test(item.generatorEngineKey) &&
            /^semi-/.test(item.generatorTypeId)
        ),
        true
      );
      assert.equal(
        questions.every((item) => isNaturalNumberMaxThreeDigits(item.problem.answer)),
        true
      );
      assert.equal(
        questions.every((item) => item.validation.validationMode === "TYPE_SPECIFIC"),
        true
      );
    }
  }

  console.log(
    `Arena tier catalog offline verification passed: types=30 tiers=9 references=270 answers=270 solutions=270 choices=168 naturals=102 engines=${definition.validationReport.mappedEngineCount} hash=${definition.contentHash}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

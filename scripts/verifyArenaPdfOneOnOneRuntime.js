"use strict";

const assert = require("node:assert/strict");

const {
  MAIN_TIER_PAIR_CONFIG,
  SUB_TIER_PAIR_CONFIG,
} = require("../services/arenaOneOnOneProblemBank");
const {
  PACK_COURSE_SLOTS,
  difficultyClassForSourceDifficultyCode,
  sourceDifficultyPack,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  ARENA_MATCH_QUESTION_ROLLOUT,
} = require("../services/arenaMatchDifficultyPlan");
const {
  POOL_ENTRIES,
  arenaPdfSourceMetadataForReferenceId,
  arenaPdfOneOnOnePoolStats,
  courseIdForGeneratorFamily,
  generateArenaPdfOneOnOneQuestions,
} = require("../services/arenaPdfOneOnOneQuestionPool");
const {
  assessmentSurfaceIssues,
  extractMathFragments,
  normalizedTranscriptionProblem,
} = require("../services/arenaPdfTranscriptionGenerators");
const {
  buildGeneratedArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  publicCategoryLabelForQuestion,
  publicQuestionsForAttempt,
  publicSourceAccuracyForQuestion,
} = require("../services/arenaMatchAttemptService");

const EXPECTED_POOL_COUNTS = Object.freeze({
  D1: 36,
  D2: 18,
  D3: 18,
  D4: 18,
  D5: 17,
  D6: 12,
  D7: 24,
  D8: 26,
  D9: 31,
});
const DISPLAY_OPERATOR =
  /\\(?:sum|prod|coprod|lim(?:sup|inf)?|sup|inf|max|min|int|iint|iiint|oint|bigcup|bigcap)(?![A-Za-z])/;
const SAMPLE_PACKS_PER_DIFFICULTY = Math.max(
  1,
  Number(process.env.ARENA_PDF_RUNTIME_SAMPLE_PACKS || 20)
);

assert.equal(ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected, true);
assert.deepEqual(arenaPdfOneOnOnePoolStats().byDifficulty, EXPECTED_POOL_COUNTS);
assert.equal(arenaPdfOneOnOnePoolStats().total, 200);

const CATEGORY_BY_CLASS = Object.freeze({
  BASIC_GENERAL: "basic-general",
  GENERAL: "general",
  UPPER_GENERAL: "upper-general",
  SEMI_KILLER: "semi-killer",
  KILLER: "killer",
});
const LABEL_BY_CLASS = Object.freeze({
  BASIC_GENERAL: "기초 일반",
  GENERAL: "일반",
  UPPER_GENERAL: "상위 일반",
  SEMI_KILLER: "준킬러",
  KILLER: "킬러",
});

for (const entry of POOL_ENTRIES) {
  const sourceId = entry.definition.sourceReferenceId;
  const metadata = arenaPdfSourceMetadataForReferenceId(sourceId);
  assert.ok(metadata, `${sourceId} 화면 메타데이터 누락`);
  assert.equal(metadata.sourceDifficultyCode, entry.sourceDifficultyCode);
  assert.equal(
    metadata.courseId,
    courseIdForGeneratorFamily(entry.definition.familyId),
    `${sourceId} 과목 라벨 불일치`
  );
  const sourceAccuracy = publicSourceAccuracyForQuestion({ sourceTypeId: sourceId });
  assert.ok(sourceAccuracy?.label, `${sourceId} 원문 정답률 표시 누락`);
  assert.equal(sourceAccuracy.sourceDifficultyCode, entry.sourceDifficultyCode);
  assert.match(sourceAccuracy.basisLabel, /^원문 정답률/);
  const difficultyClass = difficultyClassForSourceDifficultyCode(
    entry.sourceDifficultyCode
  );
  assert.equal(
    publicCategoryLabelForQuestion({ category: CATEGORY_BY_CLASS[difficultyClass] }),
    LABEL_BY_CLASS[difficultyClass]
  );
}

let verifiedPacks = 0;
let verifiedQuestions = 0;
for (const prefix of ["U", "R"]) {
  for (let level = 1; level <= 9; level += 1) {
    const difficultyCode = `${prefix}${level}`;
    const expectedSourcePack = sourceDifficultyPack(difficultyCode);
    for (let sample = 0; sample < SAMPLE_PACKS_PER_DIFFICULTY; sample += 1) {
      const matchKey = `runtime-verify:${difficultyCode}:${sample}`;
      const input = {
        difficultyCode,
        matchKey,
        packCurve: ["LOW", "MID", "MID", "MID_HIGH", "HIGH"],
      };
      const questions = generateArenaPdfOneOnOneQuestions(input);
      const repeated = generateArenaPdfOneOnOneQuestions(input);
      assert.equal(questions.length, 5);
      assert.equal(new Set(questions.map((question) => question.typeId)).size, 5);
      assert.equal(new Set(questions.map((question) => question.referenceFamily)).size, 5);
      assert.equal(
        normalizedTranscriptionProblem(questions),
        normalizedTranscriptionProblem(repeated),
        `${difficultyCode}/${sample} 비결정적 생성`
      );
      questions.forEach((question, index) => {
        assert.equal(question.design.sourceDifficultyCode, expectedSourcePack[index]);
        assert.equal(question.courseId, PACK_COURSE_SLOTS[index]);
        assert.equal(
          question.design.difficultyClass,
          difficultyClassForSourceDifficultyCode(expectedSourcePack[index])
        );
        assert.equal(question.validation.productionConnected, true);
        assert.deepEqual(assessmentSurfaceIssues(question.problem), []);
        for (const math of [
          ...extractMathFragments(question.problem.prompt),
          ...extractMathFragments(question.problem.solution),
        ]) {
          if (DISPLAY_OPERATOR.test(math)) {
            assert.match(math, /^\s*\\displaystyle(?![A-Za-z])/);
          }
        }
      });
      verifiedPacks += 1;
      verifiedQuestions += questions.length;
    }
  }
}

for (const [division, pairs] of [
  ["SUB", SUB_TIER_PAIR_CONFIG],
  ["MAIN", MAIN_TIER_PAIR_CONFIG],
]) {
  for (const pair of pairs) {
    const matchKey = `pack-contract:${division}:${pair.key}`;
    const questions = generateArenaPdfOneOnOneQuestions({
      difficultyCode: pair.difficultyCode,
      matchKey,
      packCurve: pair.packCurve,
    });
    const draft = buildGeneratedArenaProblemPackDraft({
      division,
      matchKey,
      generation: {
        pairKey: pair.key,
        pairLabel: pair.label,
        difficultyTier: pair.difficultyTier,
        difficultyCode: pair.difficultyCode,
        designPolicyVersion: pair.designPolicyVersion,
        contentSourceVersion: ARENA_MATCH_QUESTION_ROLLOUT.preparedPoolId,
        designCompliance: "ACTIVE",
        packCurve: pair.packCurve,
        questions,
      },
    });
    questions.forEach((question, index) => {
      const publicQuestion = publicQuestionsForAttempt(draft, {
        currentQuestionIndex: index,
        answers: [],
      })[0];
      assert.equal(
        publicQuestion.sourceDifficultyCode,
        question.design.sourceDifficultyCode
      );
      assert.equal(
        publicQuestion.categoryLabel,
        LABEL_BY_CLASS[question.design.difficultyClass]
      );
      assert.equal(publicQuestion.courseId, question.courseId);
      assert.match(publicQuestion.targetAccuracy.basisLabel, /^원문 정답률/);
      assert.ok(publicQuestion.targetAccuracy.label.endsWith("%") ||
        publicQuestion.targetAccuracy.label.endsWith("% 이상"));
    });
  }
}

console.log(
  `Arena PDF 운영 풀 검증 완료: 200문항, ${verifiedPacks}팩/${verifiedQuestions}문항 생성, U1~U9·R1~R9, 실제 ${SUB_TIER_PAIR_CONFIG.length + MAIN_TIER_PAIR_CONFIG.length}개 티어 조합 팩 계약 통과`
);

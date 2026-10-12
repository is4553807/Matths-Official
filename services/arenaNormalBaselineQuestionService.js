"use strict";
const { arenaQuestionReleaseIssue } = require("./arenaQuestionReleaseService");

const { createHash } = require("node:crypto");
const {
  ArenaNormalBaselineAssignment,
  ArenaNormalBaselineQuestion,
} = require("../models/goatArenaModel");
const {
  generateArenaPdfOneOnOneQuestions,
} = require("./arenaPdfOneOnOneQuestionPool");
const {
  buildGeneratedArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const {
  publicSourceAccuracyForQuestion,
} = require("./arenaMatchAttemptService");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { SCORING_VERSION } = require("./arenaCompetitiveScoringService");

const NORMAL_BASELINE_SCHEMA_VERSION =
  "GOAT_ARENA_NORMAL_BASELINE_CAPTURE_MANIFEST_V1";
const NORMAL_BASELINE_QUESTION_SCHEMA_VERSION =
  "GOAT_ARENA_NORMAL_BASELINE_QUESTION_V1";
const NORMAL_BASELINE_BATCH_KEY = "NORMAL-BASELINE-2026-10-V1";
const QUESTIONS_PER_TIER = 7;
const QUESTIONS_PER_MATCH = 5;
const EXACT_COMBINATION_COOLDOWN_MATCHES = 5;

const NORMAL_BASELINE_TIERS = Object.freeze([
  Object.freeze({ tier: "BRONZE", label: "브론즈", targetMmr: 600, difficultyCode: "U1", difficultyTier: "T1", baselineCorrectQuestionCount: 6 }),
  Object.freeze({ tier: "SILVER", label: "실버", targetMmr: 862, difficultyCode: "U2", difficultyTier: "T2", baselineCorrectQuestionCount: 6 }),
  Object.freeze({ tier: "GOLD", label: "골드", targetMmr: 975, difficultyCode: "U3", difficultyTier: "T3", baselineCorrectQuestionCount: 5 }),
  Object.freeze({ tier: "PLATINUM", label: "플래티넘", targetMmr: 1072, difficultyCode: "U4", difficultyTier: "T4", baselineCorrectQuestionCount: 4 }),
  Object.freeze({ tier: "EMERALD", label: "에메랄드", targetMmr: 1165, difficultyCode: "U5", difficultyTier: "T5", baselineCorrectQuestionCount: 4 }),
  Object.freeze({ tier: "DIAMOND", label: "다이아몬드", targetMmr: 1270, difficultyCode: "U6", difficultyTier: "T6", baselineCorrectQuestionCount: 3 }),
  Object.freeze({ tier: "MASTER", label: "마스터", targetMmr: 1385, difficultyCode: "U7", difficultyTier: "T7", baselineCorrectQuestionCount: 3 }),
  Object.freeze({ tier: "GRANDMASTER", label: "그랜드마스터", targetMmr: 1480, difficultyCode: "U8", difficultyTier: "T8", baselineCorrectQuestionCount: 3 }),
  Object.freeze({ tier: "CHALLENGER", label: "챌린저", targetMmr: 1610, difficultyCode: "U9", difficultyTier: "T9", baselineCorrectQuestionCount: 3 }),
]);

function statusError(status, message, code = "") {
  return Object.assign(new Error(message), { status, code });
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

const { questionInstanceHash, questionInstanceHashAliases } = require("./arenaQuestionIdentityService");

function wrongNaturalNumberAnswer(answer) {
  const parsed = Number(String(answer || "").trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
    throw statusError(
      422,
      "기준 문항의 정답은 3자리 이하 자연수여야 합니다.",
      "ARENA_BASELINE_ANSWER_INVALID"
    );
  }
  return String(parsed === 999 ? 998 : parsed + 1);
}

function assumedSolveTimeMs(question, baselineCorrect, seed) {
  const expected = Math.max(45_000, Number(question?.expectedTimeMs) || 120_000);
  const seedNumber = Number.parseInt(sha256(seed).slice(0, 8), 16);
  const jitter = 0.9 + (seedNumber % 21) / 100;
  const correctnessFactor = baselineCorrect ? 1 : 1.35;
  return Math.min(
    9.5 * 60 * 1000,
    Math.max(45_000, Math.round((expected * correctnessFactor * jitter) / 1000) * 1000)
  );
}

function normalizedPackForGeneratedQuestions({ tier, questions, seed, generatedAt }) {
  return buildGeneratedArenaProblemPackDraft({
    generation: {
      pairKey: `BASELINE_${tier.difficultyCode}`,
      pairLabel: `${tier.label} 일반전 기준 문항`,
      questions,
      difficultyTier: tier.difficultyTier,
      difficultyCode: tier.difficultyCode,
      designCompliance: "ACTIVE",
      designPolicyVersion: questions[0]?.design?.policyVersion,
      contentSourceVersion: "ARENA-PDF-POOL-V1",
    },
    matchKey: seed,
    generatedAt,
    scoringVersion: SCORING_VERSION,
    pairOverride: {
      key: `BASELINE_${tier.difficultyCode}`,
      label: `${tier.label} 일반전 기준 문항`,
    },
  });
}

function buildTierQuestionDrafts({ tier, batchKey, generatedAt }) {
  const selected = [];
  const usedTypeIds = new Set();
  const usedHashes = new Set();
  const correctnessPatterns = {
    6: [true, true, true, true, true, false, true],
    5: [true, true, false, true, true, false, true],
    4: [true, false, true, false, true, false, true],
    3: [true, false, true, false, true, false, false],
  };
  const correctPattern = correctnessPatterns[tier.baselineCorrectQuestionCount];
  if (!correctPattern) {
    throw statusError(
      500,
      `${tier.difficultyCode} 기준 정답 가정을 확인해주세요.`,
      "ARENA_BASELINE_CORRECTNESS_HYPOTHESIS_INVALID"
    );
  }

  for (let generationIndex = 0; generationIndex < 500; generationIndex += 1) {
    const seed = `${batchKey}:${tier.difficultyCode}:${generationIndex}`;
    const rawQuestions = generateArenaPdfOneOnOneQuestions({
      difficultyCode: tier.difficultyCode,
      matchKey: seed,
    });
    const normalizedPack = normalizedPackForGeneratedQuestions({
      tier,
      questions: rawQuestions,
      seed,
      generatedAt,
    });

    for (let index = 0; index < normalizedPack.questions.length; index += 1) {
      const question = normalizedPack.questions[index];
      const rawQuestion = rawQuestions[index];
      const sourceAccuracy = publicSourceAccuracyForQuestion(question);
      const hash = questionInstanceHash(question);
      if (
        sourceAccuracy?.evidenceKind !== "EXACT" ||
        !Number.isFinite(Number(sourceAccuracy.min)) ||
        Number(sourceAccuracy.min) <= 0 ||
        Number(sourceAccuracy.min) >= 1 ||
        usedTypeIds.has(question.typeId) ||
        usedHashes.has(hash)
      ) {
        continue;
      }

      const order = selected.length + 1;
      const baselineKey = `NORMAL-${tier.difficultyCode}-Q${String(order).padStart(2, "0")}`;
      const baselineCorrect = correctPattern[order - 1];
      const baselineSubmittedAnswer = baselineCorrect
        ? String(question.answer)
        : wrongNaturalNumberAnswer(question.answer);
      const expectedSolutionFileName = `${baselineKey}.png`;
      const storedQuestion = {
        ...question,
        questionKey: baselineKey,
      };
      selected.push({
        schemaVersion: NORMAL_BASELINE_QUESTION_SCHEMA_VERSION,
        batchKey,
        baselineKey,
        mode: "NORMAL",
        tier: tier.tier,
        tierLabel: tier.label,
        difficultyCode: tier.difficultyCode,
        difficultyTier: tier.difficultyTier,
        targetMmr: tier.targetMmr,
        question: storedQuestion,
        questionInstanceHash: hash,
        sourceReferenceId: String(question.sourceTypeId || rawQuestion?.sourceReferenceId || ""),
        sourceAccuracyRate: Number(sourceAccuracy.min),
        sourceAccuracyEvidenceKind: "EXACT",
        sourceAccuracyEvidence: {
          ...(rawQuestion?.sourceAccuracyEvidence || {}),
          publicLabel: sourceAccuracy.label,
          rangeLabel: sourceAccuracy.rangeLabel,
        },
        baselineSubmittedAnswer,
        baselineCorrect,
        baselineSolveTimeMs: assumedSolveTimeMs(
          storedQuestion,
          baselineCorrect,
          baselineKey
        ),
        expectedSolutionFileName,
        status: "EVIDENCE_PENDING",
        calibrationStatus: "UNVALIDATED_HYPOTHESIS",
        activationAllowed: false,
        activationBlockers: [
          "HANDWRITTEN_SOLUTION_FILE_REQUIRED",
          "OPERATOR_REVIEW_REQUIRED",
          "FAIRNESS_SIMULATION_APPROVAL_REQUIRED",
        ],
      });
      usedTypeIds.add(question.typeId);
      usedHashes.add(hash);
      if (selected.length === QUESTIONS_PER_TIER) return selected;
    }
  }

  throw statusError(
    422,
    `${tier.difficultyCode}에서 원문 정답률이 정확한 서로 다른 문항 ${QUESTIONS_PER_TIER}개를 만들지 못했습니다.`,
    "ARENA_BASELINE_POOL_GENERATION_FAILED"
  );
}

function buildNormalBaselineCaptureManifest({
  batchKey = NORMAL_BASELINE_BATCH_KEY,
  generatedAt = new Date("2026-10-11T00:00:00.000Z"),
} = {}) {
  const safeBatchKey = String(batchKey || "").trim().toUpperCase();
  const generatedDate = new Date(generatedAt);
  if (
    !/^[A-Z0-9][A-Z0-9._-]{2,119}$/.test(safeBatchKey) ||
    Number.isNaN(generatedDate.getTime())
  ) {
    throw statusError(400, "기준 문항 배치 정보를 확인해주세요.", "ARENA_BASELINE_BATCH_INVALID");
  }

  const questions = NORMAL_BASELINE_TIERS.flatMap((tier) =>
    buildTierQuestionDrafts({
      tier,
      batchKey: safeBatchKey,
      generatedAt: generatedDate,
    })
  );
  return {
    schemaVersion: NORMAL_BASELINE_SCHEMA_VERSION,
    auditCorrectionVersion: "2026-10-11-F02-F04",
    questionHashVersion: 2,
    generatedAt: generatedDate.toISOString(),
    batchKey: safeBatchKey,
    mode: "NORMAL",
    status: "DRAFT_AWAITING_HANDWRITTEN_EVIDENCE",
    activationAllowed: false,
    questionStorageStrategy: "INDEPENDENT_QUESTION_RECORDS",
    questionCount: questions.length,
    questionCountPerTier: QUESTIONS_PER_TIER,
    questionsPerMatch: QUESTIONS_PER_MATCH,
    combinationCountPerTier: 21,
    exactCombinationCooldownMatches: EXACT_COMBINATION_COOLDOWN_MATCHES,
    baselinePerformanceHypothesis: {
      status: "UNVALIDATED_HYPOTHESIS",
      basis: "Existing tier difficulty target ranges; discrete seven-question draft approximation.",
      correctQuestionsByDifficulty: Object.fromEntries(
        NORMAL_BASELINE_TIERS.map((tier) => [
          tier.difficultyCode,
          tier.baselineCorrectQuestionCount,
        ])
      ),
      solveTimePolicy:
        "Generator expected time with deterministic jitter; incorrect drafts use a 1.35 multiplier; capped below the ten-minute per-question limit.",
      warning:
        "These answer and solve-time values are capture targets, not calibrated production constants.",
    },
    activationRequirements: [
      "all 63 expected handwritten solution files are uploaded",
      "every file hash and file name is verified",
      "an operator approves answer/evidence integrity",
      "fairness and inflation simulations approve the baseline hypothesis",
      "staging matching, result, authorization, and cooldown tests pass",
    ],
    questions,
  };
}

function combinations(values, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= values.length - (size - prefix.length); index += 1) {
    combinations(values, size, index + 1, [...prefix, values[index]], output);
  }
  return output;
}

function baselineCombinationHash(records) {
  return sha256(
    records
      .map((record) => String(record.questionInstanceHash || ""))
      .sort()
      .join(":")
  );
}

function chooseAvailableBaselineCombination({
  records,
  recentCombinationHashes = [],
  recentQuestionIds = [],
  recentQuestionHashes = [],
  challengerUserId,
  sequence,
}) {
  const unique = [...new Map(
    (records || []).map((record) => [String(record.questionInstanceHash || ""), record])
  ).values()];
  if (unique.length < QUESTIONS_PER_TIER) {
    throw statusError(
      409,
      `활성화된 일반전 기준 문항이 ${QUESTIONS_PER_TIER}개 이상 필요합니다.`,
      "ARENA_BASELINE_QUESTION_POOL_INCOMPLETE"
    );
  }
  const excluded = new Set((recentCombinationHashes || []).map(String));
  const excludedQuestionIds = new Set((recentQuestionIds || []).map(String));
  const excludedQuestionHashes = new Set((recentQuestionHashes || []).map(String));
  const available = unique.filter((question) =>
    !excludedQuestionIds.has(String(question._id)) &&
    !excludedQuestionHashes.has(String(question.questionInstanceHash || "")) &&
    (!question.question || !questionInstanceHashAliases(question.question).some((hash) => excludedQuestionHashes.has(hash)))
  ).sort((left, right) =>
    sha256(`${challengerUserId}:${sequence}:${left.baselineKey}`).localeCompare(
      sha256(`${challengerUserId}:${sequence}:${right.baselineKey}`)));
  function* subsets(start = 0, prefix = []) {
    if (prefix.length === QUESTIONS_PER_MATCH) { yield prefix; return; }
    for (let index = start; index <= available.length - (QUESTIONS_PER_MATCH - prefix.length); index += 1) {
      yield* subsets(index + 1, [...prefix, available[index]]);
    }
  }
  // At most excluded.size + 1 unique combinations need to be visited; do not
  // materialize n-choose-5 arrays as the approved catalog grows.
  for (const questions of subsets()) {
    const combinationHash = baselineCombinationHash(questions);
    if (!excluded.has(combinationHash)) return { questions, combinationHash };
  }
  throw statusError(409, "최근에 노출된 문항과 겹치지 않는 일반전 기준 문제 조합이 없습니다.", "ARENA_BASELINE_COMBINATION_COOLDOWN");

}

async function selectActiveNormalBaselineQuestionSet({
  challengerUserId,
  rating,
  sequence,
  excludedQuestionHashes = [],
}) {
  const normalizedRating = Number(rating);
  const normalizedSequence = Number(sequence || 0);
  if (!challengerUserId || !Number.isFinite(normalizedRating) || normalizedRating < 0) {
    throw statusError(400, "일반전 기준 문제 매칭 정보를 확인해주세요.", "ARENA_BASELINE_MATCH_INPUT_INVALID");
  }
  const maximumGap = Math.max(
    ...GOAT_ARENA_V2_CONFIG.matchmaking.windows.map((window) => Number(window.ratingGap))
  );
  const records = await ArenaNormalBaselineQuestion.find({
    mode: "NORMAL",
    status: "ACTIVE",
    calibrationStatus: "SIMULATION_APPROVED",
    targetMmr: {
      $gte: Math.max(0, normalizedRating - maximumGap),
      $lte: normalizedRating + maximumGap,
    },
  }).select("+question").lean();

  const grouped = new Map();
  for (const record of records) {
    if (arenaQuestionReleaseIssue(record.question)) continue;
    const key = `${record.batchKey}:${record.difficultyCode}:${record.targetMmr}:${record.createdByUserId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }
  const eligibleGroups = [...grouped.values()]
    .filter((group) => group.length >= QUESTIONS_PER_TIER)
    .sort((left, right) =>
      Math.abs(Number(left[0].targetMmr) - normalizedRating) -
      Math.abs(Number(right[0].targetMmr) - normalizedRating)
    );
  if (!eligibleGroups.length) {
    throw statusError(
      409,
      "현재 MMR 범위에 검수 완료된 일반전 기준 문항이 없습니다.",
      "ARENA_BASELINE_QUESTION_POOL_UNAVAILABLE"
    );
  }

  const recentAssignments = await ArenaNormalBaselineAssignment.find({
    challengerUserId,
    sequence: {
      $gt: normalizedSequence - EXACT_COMBINATION_COOLDOWN_MATCHES,
    },
  }).select("combinationHash baselineQuestionIds").lean();
  let selectedGroup;
  let selected;
  for (const group of eligibleGroups) {
    try {
      selected = chooseAvailableBaselineCombination({
        records: group,
        recentCombinationHashes: recentAssignments.map((assignment) => assignment.combinationHash),
        recentQuestionIds: recentAssignments.flatMap((assignment) => assignment.baselineQuestionIds || []),
        recentQuestionHashes: excludedQuestionHashes,
        challengerUserId,
        sequence: normalizedSequence,
      });
      selectedGroup = group;
      break;
    } catch (error) {
      if (!["ARENA_BASELINE_COMBINATION_COOLDOWN", "ARENA_BASELINE_QUESTION_POOL_INCOMPLETE"].includes(error.code)) throw error;
    }
  }
  if (!selected) throw statusError(409, "허용 MMR 범위에 반복 제외 조건을 충족하는 기준 문항이 부족합니다.", "ARENA_BASELINE_COMBINATION_COOLDOWN");
  const gap = Math.abs(Number(selectedGroup[0].targetMmr) - normalizedRating);
  const allowedRatingGap = GOAT_ARENA_V2_CONFIG.matchmaking.windows
    .map((window) => Number(window.ratingGap))
    .sort((left, right) => left - right)
    .find((ratingGap) => gap <= ratingGap) || maximumGap;
  return {
    ...selected,
    batchKey: selectedGroup[0].batchKey,
    difficultyCode: selectedGroup[0].difficultyCode,
    targetMmr: Number(selectedGroup[0].targetMmr),
    allowedRatingGap,
  };
}

module.exports = {
  EXACT_COMBINATION_COOLDOWN_MATCHES,
  NORMAL_BASELINE_BATCH_KEY,
  NORMAL_BASELINE_QUESTION_SCHEMA_VERSION,
  NORMAL_BASELINE_SCHEMA_VERSION,
  NORMAL_BASELINE_TIERS,
  QUESTIONS_PER_MATCH,
  QUESTIONS_PER_TIER,
  baselineCombinationHash,
  buildNormalBaselineCaptureManifest,
  chooseAvailableBaselineCombination,
  questionInstanceHash,
  selectActiveNormalBaselineQuestionSet,
};

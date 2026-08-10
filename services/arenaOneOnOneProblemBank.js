const { createHash } = require("node:crypto");
const {
  ARENA_ONE_ON_ONE_PROBLEM_TYPES,
  generateValidatedArenaOneOnOneQuestion,
} = require("./arenaOneOnOneProblemTypes");
const {
  ARENA_LEGACY_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  PUBLIC_DIFFICULTY_SPECS,
  TIER_SPECS,
  isNaturalNumberMaxThreeDigits,
  packCurveForPair,
  plannedPackSlots,
  resolveArenaDifficultyCode,
  resolveArenaDifficultyTier,
} = require("./arenaOneOnOneDifficultyPolicy");
const {
  getActiveArenaProblemDataVersion,
  problemTypeSetting,
  weightedTypeIdsForPack,
} = require("./arenaProblemDataService");
const {
  generateQuestionsFromTierCatalog,
  getActiveArenaTierCatalogVersion,
} = require("./arenaTierQuestionCatalogService");
const {
  ArenaMatch,
  ArenaProblemPack,
} = require("../models/goatArenaModel");

/*
 * Unranked·Ranked 1대1 전용 문제 은행.
 *
 * 배치고사와 분리된 Arena 전용 생성기 arenaOneOnOneProblemTypes.js를 사용한다.
 * 문제 유형·수치·검산 규칙은 운영 DB의 U/R 카탈로그와 결합해 독립적으로 교체한다.
 * U1~U6은 서로 다른 주관식 준킬러 5문항, R1~R6은 서로 다른
 * 준킬러 4문항과 29·30번형 킬러 1문항으로 구성한다. 마스터 이상에
 * 대응하는 U7~U9·R7~R9는 5문항 모두 29·30번형 킬러로 구성한다.
 */
const ARENA_ONE_ON_ONE_QUESTION_COUNT = 5;
const ARENA_ONE_ON_ONE_PACKS_PER_PAIR = 30;
const ARENA_ONE_ON_ONE_TIME_LIMIT_MS =
  10 * 60 * 1000;
const ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS =
  60 * 1000;
const ARENA_ONE_ON_ONE_START_LIMIT_MS =
  24 * 60 * 60 * 1000;

const ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS = Object.entries(
  ARENA_ONE_ON_ONE_PROBLEM_TYPES
)
  .filter(
    ([, definition]) =>
      definition.category === "semi-killer" &&
      definition.arenaNaturalAnswerEligible === true
  )
  .map(([typeId]) => typeId);

const ARENA_ONE_ON_ONE_FINAL_TYPE_IDS = Object.entries(
  ARENA_ONE_ON_ONE_PROBLEM_TYPES
)
  .filter(
    ([, definition]) =>
      definition.category === "killer" &&
      ["algebra", "calculus-1", "probability-statistics"].includes(
        definition.courseId
      )
  )
  .map(([typeId]) => typeId);

if (ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS.length < ARENA_ONE_ON_ONE_QUESTION_COUNT) {
  throw new Error(
    "GOAT Arena 1대1 경기에 필요한 서로 다른 준킬러 유형 5개가 준비되지 않았습니다."
  );
}

if (ARENA_ONE_ON_ONE_FINAL_TYPE_IDS.length < ARENA_ONE_ON_ONE_QUESTION_COUNT) {
  throw new Error("상위 티어 5문항에 사용할 서로 다른 29·30번형 킬러 유형이 부족합니다.");
}

async function recentArenaTypeIdsForParticipants(
  participantUserIds = [],
  { matchesPerParticipant = 5 } = {}
) {
  const userIds = [...new Set(
    (participantUserIds || [])
      .filter(Boolean)
      .map((value) => String(value))
  )];
  if (!userIds.length) return [];

  const recentMatches = (
    await Promise.all(
      userIds.map((userId) =>
        ArenaMatch.find({
          $or: [
            { "challenger.userId": userId },
            { "defender.userId": userId },
          ],
          problemPackId: { $ne: null },
          matchType: { $ne: "FRIENDLY" },
          status: { $nin: ["CANCELLED", "INVALID"] },
        })
          .sort({ createdAt: -1, _id: -1 })
          .limit(Math.max(1, Number(matchesPerParticipant) || 5))
          .select("problemPackId")
          .lean()
      )
    )
  ).flat();
  const packIds = [...new Set(
    recentMatches
      .map((match) => match?.problemPackId)
      .filter(Boolean)
      .map((value) => String(value))
  )];
  if (!packIds.length) return [];

  const packs = await ArenaProblemPack.find({ _id: { $in: packIds } })
    .select("questions.typeId questions.sourceTypeId")
    .lean();
  return [...new Set(
    packs.flatMap((pack) =>
      (pack.questions || []).flatMap((question) => [
        question.sourceTypeId,
        question.typeId,
      ])
    ).filter(Boolean).map(String)
  )];
}

function configuredQuestionSlots(
  packIndex,
  challengerTier,
  defenderTier,
  eligibleTypeIds = ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
  { division = "SUB" } = {}
) {
  const designSlots = plannedPackSlots(challengerTier, defenderTier, { division });
  const selectedTypeIds = new Set();
  return Array.from(
    { length: ARENA_ONE_ON_ONE_QUESTION_COUNT },
    (_unused, questionIndex) => {
      const isFinalKiller =
        String(designSlots[questionIndex]?.slotRole || "REGULAR").toUpperCase() ===
        "FINAL_29_30";
      const finalCandidates = eligibleTypeIds.filter((typeId) =>
        ARENA_ONE_ON_ONE_FINAL_TYPE_IDS.includes(typeId)
      );
      const baseCandidates = isFinalKiller
        ? (finalCandidates.length ? finalCandidates : ARENA_ONE_ON_ONE_FINAL_TYPE_IDS)
        : eligibleTypeIds;
      const slotCandidates = baseCandidates.filter(
        (typeId) => !selectedTypeIds.has(typeId)
      );
      if (!slotCandidates.length) {
        const error = new Error(
          isFinalKiller
            ? "해당 슬롯에 배정할 중복 없는 29·30번형 킬러 유형이 없습니다."
            : "한 경기 안에 서로 다른 준킬러 유형 5개를 배정할 수 없습니다."
        );
        error.status = 409;
        error.code = isFinalKiller
          ? "ARENA_FINAL_SLOT_TYPE_NOT_CONFIGURED"
          : "ARENA_DISTINCT_TYPE_NOT_CONFIGURED";
        throw error;
      }
      const typeKey =
        slotCandidates[
          (packIndex * ARENA_ONE_ON_ONE_QUESTION_COUNT + questionIndex) %
            slotCandidates.length
        ];
      selectedTypeIds.add(typeKey);
      return {
        order: questionIndex + 1,
        typeKey,
        design: designSlots[questionIndex],
        generator: () =>
          generateValidatedArenaOneOnOneQuestion({
            typeId: typeKey,
            allowedCategory: isFinalKiller
              ? "killer"
              : "semi-killer",
          }),
      };
    }
  );
}

function generateLegacyNaturalQuestion(
  preferredTypeId,
  excludedTypeIds,
  eligibleTypeIds = ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
  problemDataVersion = null,
  slotRole = "REGULAR"
) {
  const slotEligibleTypeIds = slotRole === "FINAL_29_30"
    ? eligibleTypeIds.filter((typeId) => ARENA_ONE_ON_ONE_FINAL_TYPE_IDS.includes(typeId))
    : eligibleTypeIds;
  const fallbackTypeIds = slotRole === "FINAL_29_30" && !slotEligibleTypeIds.length
    ? ARENA_ONE_ON_ONE_FINAL_TYPE_IDS
    : slotEligibleTypeIds;
  const orderedTypeIds = [
    preferredTypeId,
    ...fallbackTypeIds.filter(
      (typeId) => typeId !== preferredTypeId
    ),
  ];
  for (const typeId of orderedTypeIds) {
    if (excludedTypeIds.has(typeId)) continue;
    for (let retry = 0; retry < 40; retry += 1) {
      const generated = generateValidatedArenaOneOnOneQuestion({
        typeId,
        allowedCategory: slotRole === "FINAL_29_30" ? "killer" : "semi-killer",
      });
      const setting = problemDataVersion
        ? problemTypeSetting(problemDataVersion, generated.typeId)
        : { answerMin: 1, answerMax: 999 };
      const numericAnswer = Number(generated?.problem?.answer);
      if (
        isNaturalNumberMaxThreeDigits(generated?.problem?.answer) &&
        numericAnswer >= Number(setting.answerMin ?? 1) &&
        numericAnswer <= Number(setting.answerMax ?? 999)
      ) {
        return generated;
      }
    }
  }
  const error = new Error(
    "3자리 이하 자연수 정답을 가진 서로 다른 준킬러 4문항과 29·30번형 킬러 1문항을 생성하지 못했습니다."
  );
  error.status = 422;
  error.code = "ARENA_NATURAL_ANSWER_GENERATION_FAILED";
  throw error;
}

function generateQuestionsFromPackSlot({
  pair,
  packSlot,
  matchKey,
  eligibleTypeIds = ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
  problemDataVersion = null,
}) {
  const excludedTypeIds = new Set();
  const questions = packSlot.questionSlots.map((slot) => {
    const generated = generateLegacyNaturalQuestion(
      slot.typeKey,
      excludedTypeIds,
      eligibleTypeIds,
      problemDataVersion,
      slot.design?.slotRole || "REGULAR"
    );
    excludedTypeIds.add(generated.typeId);
    return {
      ...generated,
      design: {
        ...slot.design,
        policyVersion: pair.designPolicyVersion,
        generatedFor: `${matchKey}:${pair.key}:${packSlot.slot}:${slot.order}`,
      },
    };
  });
  const compositionValid = questions.every((question, index) =>
    String(question?.design?.slotRole || "").toUpperCase() ===
      String(packSlot.questionSlots[index]?.design?.slotRole || "REGULAR").toUpperCase()
  );
  const valid =
    questions.length === ARENA_ONE_ON_ONE_QUESTION_COUNT &&
    new Set(questions.map((question) => question.typeId)).size ===
      ARENA_ONE_ON_ONE_QUESTION_COUNT &&
    questions.every(
      (question) =>
        question.validation?.passed === true &&
        question.validation.solvable === true &&
        question.validation.uniqueAnswer === true &&
        question.validation.calculatorFree === true &&
        question.validation.answerMatches === true &&
        isNaturalNumberMaxThreeDigits(question.problem?.answer)
    ) && compositionValid;
  if (!valid) {
    const error = new Error(
      "생성된 5문항이 유형 중복 금지·독립 검산·자연수 정답·Division별 최종 문항 기준을 통과하지 못했습니다."
    );
    error.status = 422;
    error.code = "ARENA_GENERATED_PACK_VALIDATION_FAILED";
    throw error;
  }
  return questions;
}

const ARENA_TIER_CODES = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const ARENA_TIER_LABELS = {
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

/*
 * Unranked는 먼저 같은 티어의 더 높은 순위를 찾고, 후보가 없을 때만
 * 정확히 한 티어 위로 올라간다. 두 경로 모두 같은 문제 생성기를 쓰므로
 * 실제로 성립 가능한 17개 조합을 문제 은행에도 빠짐없이 등록한다.
 */
const SUB_TIER_PAIR_CONFIG = ARENA_TIER_CODES.flatMap(
  (challengerTier, challengerIndex) =>
    [challengerTier, ARENA_TIER_CODES[challengerIndex + 1]]
      .filter(Boolean)
      .map((defenderTier) => [
        challengerTier,
        defenderTier,
        `${ARENA_TIER_LABELS[challengerTier]}-${ARENA_TIER_LABELS[defenderTier]}`,
      ])
).map(([challengerTier, defenderTier, label]) => {
  const difficultyTier = resolveArenaDifficultyTier(
    challengerTier,
    defenderTier,
    { division: "SUB" }
  );
  return {
    key: `${challengerTier}_${defenderTier}`,
    label,
    challengerTier,
    defenderTier,
    difficultyAnchor: "DEFENDER",
    difficultyTier,
    difficultyCode: resolveArenaDifficultyCode(challengerTier, defenderTier, { division: "SUB" }),
    designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    contentSourceVersion: ARENA_LEGACY_CONTENT_VERSION,
    designCompliance: "PENDING_FINAL_GENERATORS",
    targetAccuracy:
      PUBLIC_DIFFICULTY_SPECS[
        resolveArenaDifficultyCode(challengerTier, defenderTier, { division: "SUB" })
      ] || TIER_SPECS[difficultyTier],
    packCurve: packCurveForPair(challengerTier, defenderTier),
    packSlots: Array.from(
      { length: ARENA_ONE_ON_ONE_PACKS_PER_PAIR },
      (_, index) => ({
        slot: index + 1,
        code: `${challengerTier}_${defenderTier}_${String(index + 1).padStart(2, "0")}`,
        questionSlots: configuredQuestionSlots(
          index,
          challengerTier,
          defenderTier,
          ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
          { division: "SUB" }
        ),
      })
    ),
  };
});

const MAIN_TIER_CODES = ARENA_TIER_CODES;
const MAIN_TIER_LABELS = ARENA_TIER_LABELS;

/*
 * Ranked는 최대 3티어 차이까지 열 수 있다. 현재는 Unranked와 같은
 * Arena 전용 준킬러·킬러 생성기를 사용하고, 운영 DB의 U/R 유형표가 바뀌면
 * 이 파일의 슬롯 배정만 교체한다.
 */
const MAIN_TIER_PAIR_CONFIG = MAIN_TIER_CODES.flatMap(
  (lowerTier, lowerIndex) =>
    [1, 2, 3]
      .map((gap) => {
        const upperTier = MAIN_TIER_CODES[lowerIndex + gap];
        if (!upperTier) return null;
        const difficultyTier = resolveArenaDifficultyTier(
          lowerTier,
          upperTier,
          { division: "MAIN" }
        );
        return {
          key: `${lowerTier}_${upperTier}`,
          label: `${MAIN_TIER_LABELS[lowerTier]}-${MAIN_TIER_LABELS[upperTier]}`,
          challengerTier: lowerTier,
          defenderTier: upperTier,
          tierGap: gap,
          difficultyAnchor: "DEFENDER",
          difficultyTier,
          difficultyCode: resolveArenaDifficultyCode(lowerTier, upperTier, { division: "MAIN" }),
          designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
          contentSourceVersion: ARENA_LEGACY_CONTENT_VERSION,
          designCompliance: "PENDING_FINAL_GENERATORS",
          targetAccuracy:
            PUBLIC_DIFFICULTY_SPECS[
              resolveArenaDifficultyCode(lowerTier, upperTier, { division: "MAIN" })
            ] || TIER_SPECS[difficultyTier],
          packCurve: packCurveForPair(lowerTier, upperTier),
          packSlots: Array.from(
            { length: ARENA_ONE_ON_ONE_PACKS_PER_PAIR },
            (_unused, index) => ({
              slot: index + 1,
              code: `MAIN_${lowerTier}_${upperTier}_${String(index + 1).padStart(2, "0")}`,
              questionSlots: configuredQuestionSlots(
                index,
                lowerTier,
                upperTier,
                ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
                { division: "MAIN" }
              ),
            })
          ),
        };
      })
      .filter(Boolean)
);

const PAIR_BY_KEY = new Map(
  SUB_TIER_PAIR_CONFIG.map((pair) => [pair.key, pair])
);
const MAIN_PAIR_BY_KEY = new Map(
  MAIN_TIER_PAIR_CONFIG.map((pair) => [pair.key, pair])
);

function tierCode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  const aliases = {
    브론즈: "BRONZE",
    실버: "SILVER",
    골드: "GOLD",
    플래티넘: "PLATINUM",
    에메랄드: "EMERALD",
    다이아몬드: "DIAMOND",
    마스터: "MASTER",
    그랜드마스터: "GRANDMASTER",
    챌린저: "CHALLENGER",
  };
  return aliases[normalized] || normalized;
}

function subTierPairKey(challengerTier, defenderTier) {
  return `${tierCode(challengerTier)}_${tierCode(defenderTier)}`;
}

function getSubTierPair(challengerTier, defenderTier) {
  return (
    PAIR_BY_KEY.get(
      subTierPairKey(challengerTier, defenderTier)
    ) || null
  );
}

function isAllowedSubTierChallenge(challengerTier, defenderTier) {
  return Boolean(getSubTierPair(challengerTier, defenderTier));
}

function deterministicPackSlot({ pairKey, matchKey }) {
  const digest = createHash("sha256")
    .update(`${pairKey}:${matchKey}`, "utf8")
    .digest();
  return (
    digest.readUInt32BE(0) % ARENA_ONE_ON_ONE_PACKS_PER_PAIR
  );
}

function assertConfiguredPackSlot(packSlot) {
  const slots = Array.isArray(packSlot?.questionSlots)
    ? packSlot.questionSlots
    : [];
  const typeKeys = slots.map((slot) => String(slot.typeKey || ""));
  const configured =
    slots.length === ARENA_ONE_ON_ONE_QUESTION_COUNT &&
    typeKeys.every(Boolean) &&
    new Set(typeKeys).size === ARENA_ONE_ON_ONE_QUESTION_COUNT &&
    slots.every((slot) => typeof slot.generator === "function");

  if (!configured) {
    const error = new Error(
      "해당 티어 조합의 1대1 문제 유형이 아직 연결되지 않았습니다."
    );
    error.status = 409;
    error.code = "ARENA_TIER_PROBLEM_TYPES_NOT_CONFIGURED";
    throw error;
  }
  return true;
}

function configuredPackSlotForMatch({
  challengerTier,
  defenderTier,
  matchKey,
  problemDataVersion = null,
}) {
  const pair = getSubTierPair(challengerTier, defenderTier);
  if (!pair) {
    const error = new Error(
      "Unranked 일반 쟁탈전은 같은 티어 또는 바로 위 티어 조합에서만 만들 수 있습니다."
    );
    error.status = 409;
    error.code = "SUB_TIER_PAIR_NOT_ALLOWED";
    throw error;
  }
  const slotIndex = deterministicPackSlot({
    pairKey: pair.key,
    matchKey,
  });
  const eligibleTypeIds = problemDataVersion
    ? weightedTypeIdsForPack(problemDataVersion, pair.difficultyTier, slotIndex)
    : ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS;
  const packSlot = problemDataVersion
    ? {
        slot: slotIndex + 1,
        code: `${pair.key}_${String(slotIndex + 1).padStart(2, "0")}`,
        questionSlots: configuredQuestionSlots(
          0,
          pair.challengerTier,
          pair.defenderTier,
          eligibleTypeIds,
          { division: "SUB" }
        ),
      }
    : pair.packSlots[slotIndex];
  assertConfiguredPackSlot(packSlot);
  return { pair, packSlot, eligibleTypeIds };
}

function generateSubOneOnOneQuestions({
  challengerTier,
  defenderTier,
  matchKey,
  problemDataVersion = null,
}) {
  const { pair, packSlot, eligibleTypeIds } = configuredPackSlotForMatch({
    challengerTier,
    defenderTier,
    matchKey,
    problemDataVersion,
  });

  const questions = generateQuestionsFromPackSlot({
    pair,
    packSlot,
    matchKey,
    eligibleTypeIds,
    problemDataVersion,
  });
  return {
    pairKey: pair.key,
    pairLabel: pair.label,
    packSlot: packSlot.slot,
    difficultyAnchor: pair.difficultyAnchor,
    difficultyTier: pair.difficultyTier,
    difficultyCode: pair.difficultyCode,
    designPolicyVersion: pair.designPolicyVersion,
    contentSourceVersion:
      problemDataVersion?.code || pair.contentSourceVersion,
    problemDataVersionId: problemDataVersion?._id || null,
    designCompliance: pair.designCompliance,
    targetAccuracy: pair.targetAccuracy,
    packCurve: pair.packCurve,
    questions,
  };
}

async function generateSubOneOnOneQuestionsFromActiveData(input) {
  const [problemDataVersion, tierCatalogVersion] = await Promise.all([
    getActiveArenaProblemDataVersion(),
    getActiveArenaTierCatalogVersion(),
  ]);
  if (tierCatalogVersion) {
    const pair = getSubTierPair(input.challengerTier, input.defenderTier);
    if (!pair) {
      const error = new Error(
        "Unranked 일반 쟁탈전은 같은 티어 또는 바로 위 티어 조합에서만 만들 수 있습니다."
      );
      error.status = 409;
      error.code = "SUB_TIER_PAIR_NOT_ALLOWED";
      throw error;
    }
    const slotIndex = deterministicPackSlot({ pairKey: pair.key, matchKey: input.matchKey });
    const recentTypeIds = await recentArenaTypeIdsForParticipants(
      input.participantUserIds
    );
    const questions = await generateQuestionsFromTierCatalog({
      version: tierCatalogVersion,
      difficultyTier: pair.difficultyTier,
      difficultyCode: pair.difficultyCode,
      challengerTier: pair.challengerTier,
      defenderTier: pair.defenderTier,
      matchKey: input.matchKey,
      division: "SUB",
      recentTypeIds,
    });
    return {
      pairKey: pair.key,
      pairLabel: pair.label,
      packSlot: slotIndex + 1,
      difficultyAnchor: pair.difficultyAnchor,
      difficultyTier: pair.difficultyTier,
      difficultyCode: pair.difficultyCode,
      designPolicyVersion: pair.designPolicyVersion,
      contentSourceVersion: tierCatalogVersion.code,
      problemDataVersionId: problemDataVersion?._id || null,
      tierCatalogVersionId: tierCatalogVersion._id,
      designCompliance: "ACTIVE",
      targetAccuracy: pair.targetAccuracy,
      packCurve: pair.packCurve,
      questions,
    };
  }
  return generateSubOneOnOneQuestions({ ...input, problemDataVersion });
}

function getMainTierPair(lowerTier, upperTier) {
  return (
    MAIN_PAIR_BY_KEY.get(`${tierCode(lowerTier)}_${tierCode(upperTier)}`) ||
    null
  );
}

function generateMainOneOnOneQuestions({
  lowerTier,
  upperTier,
  matchKey,
  problemDataVersion = null,
}) {
  const pair = getMainTierPair(lowerTier, upperTier);
  if (!pair) {
    const error = new Error(
      "Ranked 경기는 최대 3단계 차이의 상위·하위 티어 사이에서만 만들 수 있습니다."
    );
    error.status = 409;
    error.code = "MAIN_TIER_PAIR_NOT_ALLOWED";
    throw error;
  }
  const slotIndex = deterministicPackSlot({ pairKey: pair.key, matchKey });
  const eligibleTypeIds = problemDataVersion
    ? weightedTypeIdsForPack(problemDataVersion, pair.difficultyTier, slotIndex)
    : ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS;
  const packSlot = problemDataVersion
    ? {
        slot: slotIndex + 1,
        code: `MAIN_${pair.key}_${String(slotIndex + 1).padStart(2, "0")}`,
        questionSlots: configuredQuestionSlots(
          0,
          pair.challengerTier,
          pair.defenderTier,
          eligibleTypeIds,
          { division: "MAIN" }
        ),
      }
    : pair.packSlots[slotIndex];
  assertConfiguredPackSlot(packSlot);
  return {
    pairKey: pair.key,
    pairLabel: pair.label,
    packSlot: packSlot.slot,
    difficultyAnchor: pair.difficultyAnchor,
    difficultyTier: pair.difficultyTier,
    difficultyCode: pair.difficultyCode,
    designPolicyVersion: pair.designPolicyVersion,
    contentSourceVersion:
      problemDataVersion?.code || pair.contentSourceVersion,
    problemDataVersionId: problemDataVersion?._id || null,
    designCompliance: pair.designCompliance,
    targetAccuracy: pair.targetAccuracy,
    packCurve: pair.packCurve,
    questions: generateQuestionsFromPackSlot({
      pair,
      packSlot,
      matchKey,
      eligibleTypeIds,
      problemDataVersion,
    }),
  };
}

async function generateMainOneOnOneQuestionsFromActiveData(input) {
  const [problemDataVersion, tierCatalogVersion] = await Promise.all([
    getActiveArenaProblemDataVersion(),
    getActiveArenaTierCatalogVersion(),
  ]);
  if (tierCatalogVersion) {
    const pair = getMainTierPair(input.lowerTier, input.upperTier);
    if (!pair) {
      const error = new Error(
        "Ranked 경기는 최대 3단계 차이의 상위·하위 티어 사이에서만 만들 수 있습니다."
      );
      error.status = 409;
      error.code = "MAIN_TIER_PAIR_NOT_ALLOWED";
      throw error;
    }
    const slotIndex = deterministicPackSlot({ pairKey: pair.key, matchKey: input.matchKey });
    const recentTypeIds = await recentArenaTypeIdsForParticipants(
      input.participantUserIds
    );
    const questions = await generateQuestionsFromTierCatalog({
      version: tierCatalogVersion,
      difficultyTier: pair.difficultyTier,
      difficultyCode: pair.difficultyCode,
      challengerTier: pair.challengerTier,
      defenderTier: pair.defenderTier,
      matchKey: input.matchKey,
      division: "MAIN",
      recentTypeIds,
    });
    return {
      pairKey: pair.key,
      pairLabel: pair.label,
      packSlot: slotIndex + 1,
      difficultyAnchor: pair.difficultyAnchor,
      difficultyTier: pair.difficultyTier,
      difficultyCode: pair.difficultyCode,
      designPolicyVersion: pair.designPolicyVersion,
      contentSourceVersion: tierCatalogVersion.code,
      problemDataVersionId: problemDataVersion?._id || null,
      tierCatalogVersionId: tierCatalogVersion._id,
      designCompliance: "ACTIVE",
      targetAccuracy: pair.targetAccuracy,
      packCurve: pair.packCurve,
      questions,
    };
  }
  return generateMainOneOnOneQuestions({ ...input, problemDataVersion });
}

function friendlyDifficultyPlan({
  inviterTier,
  inviterDivision,
  inviteeTier,
  inviteeDivision,
}) {
  const participants = [
    { tier: tierCode(inviterTier), division: String(inviterDivision || "SUB").toUpperCase() },
    { tier: tierCode(inviteeTier), division: String(inviteeDivision || "SUB").toUpperCase() },
  ].map((participant) => ({
    ...participant,
    difficultyTier: resolveArenaDifficultyTier(
      participant.tier,
      participant.tier,
      { division: participant.division }
    ),
  }));
  const difficultyTier = participants
    .map((participant) => participant.difficultyTier)
    .sort((left, right) => Number(right.slice(1)) - Number(left.slice(1)))[0];
  const anchorTier = TIER_SPECS[difficultyTier]?.anchor;
  if (!anchorTier) {
    const error = new Error("친선 경기 참가자에게 맞는 문제 난이도를 찾을 수 없습니다.");
    error.status = 409;
    error.code = "FRIENDLY_DIFFICULTY_NOT_CONFIGURED";
    throw error;
  }
  return {
    difficultyTier,
    anchorTier,
    pairKey: `FRIENDLY_${participants[0].division}_${participants[0].tier}_${participants[1].division}_${participants[1].tier}_${difficultyTier}`,
    pairLabel: `${ARENA_TIER_LABELS[participants[0].tier] || participants[0].tier}-${ARENA_TIER_LABELS[participants[1].tier] || participants[1].tier} 친선 경기`,
  };
}

async function generateFriendlyOneOnOneQuestionsFromActiveData(input) {
  const plan = friendlyDifficultyPlan(input);
  const [problemDataVersion, tierCatalogVersion] = await Promise.all([
    getActiveArenaProblemDataVersion(),
    getActiveArenaTierCatalogVersion(),
  ]);
  const slotIndex = deterministicPackSlot({
    pairKey: plan.pairKey,
    matchKey: input.matchKey,
  });
  if (tierCatalogVersion) {
    const difficultyCode = resolveArenaDifficultyCode(
      plan.anchorTier,
      plan.anchorTier,
      { division: "MAIN" }
    );
    const recentTypeIds = await recentArenaTypeIdsForParticipants(
      input.participantUserIds
    );
    const questions = await generateQuestionsFromTierCatalog({
      version: tierCatalogVersion,
      difficultyTier: plan.difficultyTier,
      difficultyCode,
      challengerTier: plan.anchorTier,
      defenderTier: plan.anchorTier,
      matchKey: input.matchKey,
      division: "MAIN",
      recentTypeIds,
    });
    return {
      pairKey: plan.pairKey,
      pairLabel: plan.pairLabel,
      packSlot: slotIndex + 1,
      difficultyAnchor: "HIGHER_ABSOLUTE_DIFFICULTY",
      difficultyTier: plan.difficultyTier,
      difficultyCode,
      designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
      contentSourceVersion: tierCatalogVersion.code,
      problemDataVersionId: problemDataVersion?._id || null,
      tierCatalogVersionId: tierCatalogVersion._id,
      designCompliance: "ACTIVE",
      targetAccuracy: PUBLIC_DIFFICULTY_SPECS[difficultyCode] || TIER_SPECS[plan.difficultyTier],
      questionTargetAccuracy: plannedPackSlots(plan.anchorTier, plan.anchorTier, {
        division: "MAIN",
      }).map((slot) => slot.targetAccuracy),
      packCurve: packCurveForPair(plan.anchorTier, plan.anchorTier),
      questions,
    };
  }
  const difficultyCode = resolveArenaDifficultyCode(
    plan.anchorTier,
    plan.anchorTier,
    { division: "MAIN" }
  );
  const eligibleTypeIds = problemDataVersion
    ? weightedTypeIdsForPack(problemDataVersion, plan.difficultyTier, slotIndex)
    : ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS;
  const legacyPair = {
    key: plan.pairKey,
    label: plan.pairLabel,
    challengerTier: plan.anchorTier,
    defenderTier: plan.anchorTier,
    difficultyTier: plan.difficultyTier,
    difficultyCode,
    designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    contentSourceVersion: problemDataVersion?.code || ARENA_LEGACY_CONTENT_VERSION,
  };
  const packSlot = {
    slot: slotIndex + 1,
    code: `${plan.pairKey}_${String(slotIndex + 1).padStart(2, "0")}`,
    questionSlots: configuredQuestionSlots(
      slotIndex,
      plan.anchorTier,
      plan.anchorTier,
      eligibleTypeIds,
      { division: "MAIN" }
    ),
  };
  const legacy = {
    pairKey: plan.pairKey,
    pairLabel: plan.pairLabel,
    packSlot: packSlot.slot,
    difficultyAnchor: "HIGHER_ABSOLUTE_DIFFICULTY",
    difficultyTier: plan.difficultyTier,
    difficultyCode,
    designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    contentSourceVersion: legacyPair.contentSourceVersion,
    problemDataVersionId: problemDataVersion?._id || null,
    designCompliance: "PENDING_FINAL_GENERATORS",
    targetAccuracy: PUBLIC_DIFFICULTY_SPECS[difficultyCode] || TIER_SPECS[plan.difficultyTier],
    questionTargetAccuracy: plannedPackSlots(plan.anchorTier, plan.anchorTier, {
      division: "MAIN",
    }).map((slot) => slot.targetAccuracy),
    packCurve: packCurveForPair(plan.anchorTier, plan.anchorTier),
    questions: generateQuestionsFromPackSlot({
      pair: legacyPair,
      packSlot,
      matchKey: input.matchKey,
      eligibleTypeIds,
      problemDataVersion,
    }),
  };
  return {
    ...legacy,
  };
}

module.exports = {
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
  ARENA_ONE_ON_ONE_PACKS_PER_PAIR,
  ARENA_ONE_ON_ONE_QUESTION_COUNT,
  ARENA_ONE_ON_ONE_START_LIMIT_MS,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
  ARENA_ONE_ON_ONE_FINAL_TYPE_IDS,
  SUB_TIER_PAIR_CONFIG,
  MAIN_TIER_PAIR_CONFIG,
  assertConfiguredPackSlot,
  configuredPackSlotForMatch,
  deterministicPackSlot,
  generateSubOneOnOneQuestions,
  generateSubOneOnOneQuestionsFromActiveData,
  generateMainOneOnOneQuestions,
  generateMainOneOnOneQuestionsFromActiveData,
  generateFriendlyOneOnOneQuestionsFromActiveData,
  friendlyDifficultyPlan,
  getMainTierPair,
  getSubTierPair,
  isAllowedSubTierChallenge,
  subTierPairKey,
  tierCode,
};

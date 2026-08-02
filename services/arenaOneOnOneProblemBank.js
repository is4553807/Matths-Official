const { createHash } = require("node:crypto");
const {
  ARENA_ONE_ON_ONE_PROBLEM_TYPES,
  generateValidatedArenaOneOnOneQuestion,
} = require("./arenaOneOnOneProblemTypes");

/*
 * Sub·Main Division 1대1 전용 문제 은행.
 *
 * 현재는 배치고사 심화 유형을 복사한 arenaOneOnOneProblemTypes.js를 사용한다.
 * 배치고사 파일을 직접 import하지 않으므로 이후 Arena 유형만 독립 교체할 수 있다.
 * 한 문제 묶음은 서로 다른 주관식 준킬러 유형 5개로 구성한다.
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
  .filter(([, definition]) => definition.category === "semi-killer")
  .map(([typeId]) => typeId);

if (ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS.length < ARENA_ONE_ON_ONE_QUESTION_COUNT) {
  throw new Error(
    "GOAT Arena 1대1 경기에 필요한 서로 다른 준킬러 유형 5개가 준비되지 않았습니다."
  );
}

function configuredQuestionSlots(packIndex) {
  return Array.from(
    { length: ARENA_ONE_ON_ONE_QUESTION_COUNT },
    (_unused, questionIndex) => {
      const typeKey =
        ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS[
          (packIndex * ARENA_ONE_ON_ONE_QUESTION_COUNT + questionIndex) %
            ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS.length
        ];
      return {
        order: questionIndex + 1,
        typeKey,
        generator: () =>
          generateValidatedArenaOneOnOneQuestion({ typeId: typeKey }),
      };
    }
  );
}

const SUB_TIER_PAIR_CONFIG = [
  ["BRONZE", "BRONZE", "브론즈-브론즈"],
  ["BRONZE", "SILVER", "브론즈-실버"],
  ["SILVER", "GOLD", "실버-골드"],
  ["GOLD", "PLATINUM", "골드-플래티넘"],
  ["PLATINUM", "EMERALD", "플래티넘-에메랄드"],
  ["EMERALD", "DIAMOND", "에메랄드-다이아몬드"],
  ["DIAMOND", "MASTER", "다이아몬드-마스터"],
  ["MASTER", "GRANDMASTER", "마스터-그랜드마스터"],
  ["GRANDMASTER", "CHALLENGER", "그랜드마스터-챌린저"],
  ["CHALLENGER", "CHALLENGER", "챌린저-챌린저"],
].map(([challengerTier, defenderTier, label]) => ({
  key: `${challengerTier}_${defenderTier}`,
  label,
  challengerTier,
  defenderTier,
  difficultyAnchor: "DEFENDER_LEANING",
  packSlots: Array.from(
    { length: ARENA_ONE_ON_ONE_PACKS_PER_PAIR },
    (_, index) => ({
      slot: index + 1,
      code: `${challengerTier}_${defenderTier}_${String(index + 1).padStart(2, "0")}`,
      questionSlots: configuredQuestionSlots(index),
    })
  ),
}));

const MAIN_TIER_CODES = [
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
const MAIN_TIER_LABELS = {
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
 * Main Division은 최대 3티어 차이까지 열 수 있다. 현재는 Sub와 같은
 * Arena 전용 준킬러 유형 복사본을 사용하고, 이후 티어별 유형표가 확정되면
 * 이 파일의 슬롯 배정만 교체한다.
 */
const MAIN_TIER_PAIR_CONFIG = MAIN_TIER_CODES.flatMap(
  (lowerTier, lowerIndex) =>
    [1, 2, 3]
      .map((gap) => {
        const upperTier = MAIN_TIER_CODES[lowerIndex + gap];
        if (!upperTier) return null;
        return {
          key: `${lowerTier}_${upperTier}`,
          label: `${MAIN_TIER_LABELS[lowerTier]}-${MAIN_TIER_LABELS[upperTier]}`,
          challengerTier: lowerTier,
          defenderTier: upperTier,
          tierGap: gap,
          difficultyAnchor: "DEFENDER_LEANING",
          packSlots: Array.from(
            { length: ARENA_ONE_ON_ONE_PACKS_PER_PAIR },
            (_unused, index) => ({
              slot: index + 1,
              code: `MAIN_${lowerTier}_${upperTier}_${String(index + 1).padStart(2, "0")}`,
              questionSlots: configuredQuestionSlots(index),
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
}) {
  const pair = getSubTierPair(challengerTier, defenderTier);
  if (!pair) {
    const error = new Error(
      "Sub Division에서는 바로 위 티어에게만 일반 쟁탈전을 신청할 수 있습니다."
    );
    error.status = 409;
    error.code = "SUB_TIER_PAIR_NOT_ALLOWED";
    throw error;
  }
  const slotIndex = deterministicPackSlot({
    pairKey: pair.key,
    matchKey,
  });
  const packSlot = pair.packSlots[slotIndex];
  assertConfiguredPackSlot(packSlot);
  return { pair, packSlot };
}

function generateSubOneOnOneQuestions({
  challengerTier,
  defenderTier,
  matchKey,
}) {
  const { pair, packSlot } = configuredPackSlotForMatch({
    challengerTier,
    defenderTier,
    matchKey,
  });

  const questions = packSlot.questionSlots.map((slot) =>
    slot.generator({
      seed: `${matchKey}:${pair.key}:${packSlot.slot}:${slot.order}`,
      challengerTier: pair.challengerTier,
      defenderTier: pair.defenderTier,
      difficultyAnchor: pair.difficultyAnchor,
    })
  );
  return {
    pairKey: pair.key,
    pairLabel: pair.label,
    packSlot: packSlot.slot,
    difficultyAnchor: pair.difficultyAnchor,
    questions,
  };
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
}) {
  const pair = getMainTierPair(lowerTier, upperTier);
  if (!pair) {
    const error = new Error(
      "Main Division 경기는 최대 3단계 차이의 상위·하위 티어 사이에서만 만들 수 있습니다."
    );
    error.status = 409;
    error.code = "MAIN_TIER_PAIR_NOT_ALLOWED";
    throw error;
  }
  const slotIndex = deterministicPackSlot({ pairKey: pair.key, matchKey });
  const packSlot = pair.packSlots[slotIndex];
  assertConfiguredPackSlot(packSlot);
  return {
    pairKey: pair.key,
    pairLabel: pair.label,
    packSlot: packSlot.slot,
    difficultyAnchor: pair.difficultyAnchor,
    questions: packSlot.questionSlots.map((slot) =>
      slot.generator({
        seed: `${matchKey}:${pair.key}:${packSlot.slot}:${slot.order}`,
        challengerTier: pair.challengerTier,
        defenderTier: pair.defenderTier,
        difficultyAnchor: pair.difficultyAnchor,
      })
    ),
  };
}

module.exports = {
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
  ARENA_ONE_ON_ONE_PACKS_PER_PAIR,
  ARENA_ONE_ON_ONE_QUESTION_COUNT,
  ARENA_ONE_ON_ONE_START_LIMIT_MS,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
  SUB_TIER_PAIR_CONFIG,
  MAIN_TIER_PAIR_CONFIG,
  assertConfiguredPackSlot,
  configuredPackSlotForMatch,
  deterministicPackSlot,
  generateSubOneOnOneQuestions,
  generateMainOneOnOneQuestions,
  getMainTierPair,
  getSubTierPair,
  isAllowedSubTierChallenge,
  subTierPairKey,
  tierCode,
};

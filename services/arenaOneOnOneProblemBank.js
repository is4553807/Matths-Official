const { createHash } = require("node:crypto");

/*
 * Sub Division 1대1 전용 문제 은행 골격.
 *
 * 한 문제 묶음은 서로 다른 준킬러 유형 5개로 구성하고, 각 유형 생성기는
 * 숫자 seed를 받아 매 경기 새로운 문항을 만들어야 한다. 실제 유형과 생성기는
 * 운영자가 유형표를 확정한 뒤 questionSlots에 연결한다. generator는
 * typeId/courseId/prompt/answer/solution/difficultyScore/expectedTimeMs와
 * 자동 검산 결과(validation)를 반환해야 한다.
 */
const ARENA_ONE_ON_ONE_QUESTION_COUNT = 5;
const ARENA_ONE_ON_ONE_PACKS_PER_PAIR = 30;
const ARENA_ONE_ON_ONE_TIME_LIMIT_MS =
  10 * 60 * 1000;
const ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS =
  60 * 1000;
const ARENA_ONE_ON_ONE_START_LIMIT_MS =
  24 * 60 * 60 * 1000;

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
      questionSlots: Array.from(
        { length: ARENA_ONE_ON_ONE_QUESTION_COUNT },
        (_unused, questionIndex) => ({
          order: questionIndex + 1,
          typeKey: null,
          generator: null,
        })
      ),
    })
  ),
}));

const PAIR_BY_KEY = new Map(
  SUB_TIER_PAIR_CONFIG.map((pair) => [pair.key, pair])
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

module.exports = {
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
  ARENA_ONE_ON_ONE_PACKS_PER_PAIR,
  ARENA_ONE_ON_ONE_QUESTION_COUNT,
  ARENA_ONE_ON_ONE_START_LIMIT_MS,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  SUB_TIER_PAIR_CONFIG,
  assertConfiguredPackSlot,
  configuredPackSlotForMatch,
  deterministicPackSlot,
  generateSubOneOnOneQuestions,
  getSubTierPair,
  isAllowedSubTierChallenge,
  subTierPairKey,
  tierCode,
};

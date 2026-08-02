const {
  ArenaStanding,
  MainToSubConversionResult,
} = require("../models/goatArenaModel");

const MAIN_TO_SUB_CONVERSION_VERSION =
  "MAIN_TO_SUB_CONVERSION_V1";

const SUB_PERCENTILE_BANDS = Object.freeze([
  { code: "BRONZE", lower: 0, upper: 0.2 },
  { code: "SILVER", lower: 0.2, upper: 0.4 },
  { code: "GOLD", lower: 0.4, upper: 0.58 },
  { code: "PLATINUM", lower: 0.58, upper: 0.73 },
  { code: "EMERALD", lower: 0.73, upper: 0.83 },
  { code: "DIAMOND", lower: 0.83, upper: 0.91 },
  { code: "MASTER", lower: 0.91, upper: 0.96 },
  { code: "GRANDMASTER", lower: 0.96, upper: 0.99 },
  { code: "CHALLENGER", lower: 0.99, upper: 1 },
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundedPercentile(value) {
  return Math.round(clamp(Number(value), 0, 1) * 1_000_000) / 1_000_000;
}

function mainPercentileFromSnapshot({
  mainPosition,
  mainParticipantCount,
}) {
  const participantCount = Number(mainParticipantCount);
  const position = Number(mainPosition);
  if (
    !Number.isInteger(participantCount) ||
    participantCount < 1 ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > participantCount
  ) {
    const error = new Error(
      "Main Division 만료 순위와 참가자 수를 확인해주세요."
    );
    error.status = 409;
    error.code = "INVALID_MAIN_DEMOTION_SNAPSHOT";
    throw error;
  }
  if (participantCount === 1) return 1;
  return roundedPercentile(
    1 - (position - 1) / (participantCount - 1)
  );
}

function resolveSubPercentileBand(percentile) {
  const value = roundedPercentile(percentile);
  const band = SUB_PERCENTILE_BANDS.find(
    (candidate, index) =>
      value >= candidate.lower &&
      (index === SUB_PERCENTILE_BANDS.length - 1
        ? value <= candidate.upper
        : value < candidate.upper)
  );
  if (!band) {
    throw new Error("Sub Division 환산 티어 구간을 찾을 수 없습니다.");
  }
  return band;
}

function calculateMainToSubReference({
  mainPosition,
  mainParticipantCount,
  currentSubParticipantCount,
}) {
  const mainPercentile = mainPercentileFromSnapshot({
    mainPosition,
    mainParticipantCount,
  });
  const referenceSubPercentile = roundedPercentile(
    0.58 + 0.42 * mainPercentile
  );
  const band = resolveSubPercentileBand(referenceSubPercentile);
  const width = band.upper - band.lower;
  const rawGp =
    referenceSubPercentile === 1
      ? 99
      : Math.floor(
          (100 * (referenceSubPercentile - band.lower)) / width
        );
  const referenceSubGp = clamp(rawGp, 0, 99);
  const subParticipantCount = Math.max(
    0,
    Math.floor(Number(currentSubParticipantCount) || 0)
  );
  const referenceSubOverallPosition = clamp(
    1 +
      Math.floor(
        (1 - referenceSubPercentile) * subParticipantCount
      ),
    1,
    subParticipantCount + 1
  );
  return {
    policyVersion: MAIN_TO_SUB_CONVERSION_VERSION,
    mainPercentile,
    referenceSubPercentile,
    referenceSubRank: band.code,
    referenceSubPositionBand: `${band.lower.toFixed(2)}-${band.upper.toFixed(2)}`,
    referenceSubGp,
    referenceSubOverallPosition,
    subParticipantCountAtConversion: subParticipantCount,
  };
}

async function createMainToSubConversionResult({
  snapshot,
  renewalGraceDeadline,
  session,
}) {
  if (!snapshot?._id || snapshot.division !== "MAIN") {
    const error = new Error(
      "Main Division 만료 스냅샷을 확인해주세요."
    );
    error.status = 409;
    error.code = "MAIN_DEMOTION_SNAPSHOT_REQUIRED";
    throw error;
  }
  const existing = await MainToSubConversionResult.findOne({
    sourceMainSnapshotId: snapshot._id,
  })
    .session(session)
    .lean();
  if (existing) return existing;

  const currentSubParticipantCount = await ArenaStanding.countDocuments({
    division: "SUB",
    seasonKey: snapshot.seasonKey,
    status: "ACTIVE",
  }).session(session);
  const calculated = calculateMainToSubReference({
    mainPosition:
      snapshot.overallPosition || snapshot.arenaTuple?.arenaPosition,
    mainParticipantCount: snapshot.participantCount,
    currentSubParticipantCount,
  });
  const [created] = await MainToSubConversionResult.create(
    [
      {
        userId: snapshot.userId,
        sourceMainSnapshotId: snapshot._id,
        ...calculated,
        renewalGraceDeadline,
        snapshotValid: true,
        integrityStatus: "CLEAR",
      },
    ],
    { session }
  );
  return created.toObject();
}

function compareSimultaneousReentries(left, right) {
  const descending = [
    "referenceSubPercentile",
    "mainGpSnapshot",
  ];
  for (const key of descending) {
    const difference = Number(right[key] || 0) - Number(left[key] || 0);
    if (difference !== 0) return difference;
  }
  const mainPositionDifference =
    Number(left.mainPositionSnapshot || Infinity) -
    Number(right.mainPositionSnapshot || Infinity);
  if (mainPositionDifference !== 0) return mainPositionDifference;
  for (const key of ["mainPositionReachedAt", "paymentApprovedAt"]) {
    const difference =
      new Date(left[key] || 0).getTime() -
      new Date(right[key] || 0).getTime();
    if (difference !== 0) return difference;
  }
  return String(left.userId || "").localeCompare(String(right.userId || ""));
}

module.exports = {
  MAIN_TO_SUB_CONVERSION_VERSION,
  SUB_PERCENTILE_BANDS,
  calculateMainToSubReference,
  compareSimultaneousReentries,
  createMainToSubConversionResult,
  mainPercentileFromSnapshot,
  resolveSubPercentileBand,
};

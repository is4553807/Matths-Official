const {
  minimumMainStakeDaysForTierGap,
} = require("./arenaPolicyService");
const {
  isSundayMatchRequestLocked,
  nextSundayMatchCutoff,
} = require("./arenaMatchService");

const HOURS_24_MS = 24 * 60 * 60 * 1000;
const SUB_NORMAL_STAKE_DAYS = 1;
const SUB_REVENGE_STAKE_DAYS = 2;
const SUB_REVENGE_NO_SHOW_RETURN_DAYS = 1;
const SUB_REVENGE_NO_SHOW_BURN_DAYS = 1;
const REVENGE_OUTCOMES = Object.freeze({
  ATTACKER_WIN: "ATTACKER_WIN",
  DEFENDER_WIN: "DEFENDER_WIN",
  DEFENDER_NO_SHOW: "DEFENDER_NO_SHOW",
  ATTACKER_NO_SHOW: "ATTACKER_NO_SHOW",
  BOTH_NO_SHOW: "BOTH_NO_SHOW",
});

function ruleError(message, code) {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  return error;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ruleError(
      `${label}은 1일 이상의 정수여야 합니다.`,
      "INVALID_ARENA_LEARNING_DAYS"
    );
  }
  return parsed;
}

function assertMainStakeSelection({
  policy,
  tierGap,
  stakeDays,
  availableLearningDays,
}) {
  const minimumStakeDays =
    minimumMainStakeDaysForTierGap(
      policy,
      tierGap
    );
  const selectedStakeDays = positiveInteger(
    stakeDays,
    "배팅 학습일수"
  );
  const availableDays = Math.max(
    0,
    Number(availableLearningDays) || 0
  );
  if (selectedStakeDays < minimumStakeDays) {
    throw ruleError(
      `해당 티어 차이의 최소 배팅 학습일수는 ${minimumStakeDays}일입니다.`,
      "MAIN_STAKE_BELOW_MINIMUM"
    );
  }
  if (availableDays <= selectedStakeDays) {
    throw ruleError(
      "Main Division 경기를 만들려면 배팅 후에도 사용 가능한 학습일수가 남아야 합니다.",
      "MAIN_STAKE_REQUIRES_REMAINING_DAY"
    );
  }
  return {
    tierGap: Number(tierGap),
    minimumStakeDays,
    stakeDays: selectedStakeDays,
  };
}

function buildRevengeEconomySnapshot({
  division,
  originalStakeDays,
  mainPolicy = null,
}) {
  const normalizedDivision = String(
    division || ""
  ).toUpperCase();
  if (normalizedDivision === "SUB") {
    return {
      division: "SUB",
      originalStakeDays:
        SUB_NORMAL_STAKE_DAYS,
      revengeStakeMultiplier: 2,
      revengeStakeDays:
        SUB_REVENGE_STAKE_DAYS,
      feeDays: 0,
      recipientNoShowReturnDays:
        SUB_REVENGE_NO_SHOW_RETURN_DAYS,
      recipientNoShowBurnDays:
        SUB_REVENGE_NO_SHOW_BURN_DAYS,
    };
  }
  if (normalizedDivision !== "MAIN") {
    throw ruleError(
      "복수전 Division을 확인해주세요.",
      "INVALID_REVENGE_DIVISION"
    );
  }
  const originalStake = positiveInteger(
    originalStakeDays,
    "원경기 배팅 학습일수"
  );
  const multiplier = Math.max(
    1,
    Number(
      mainPolicy?.revengeStakeMultiplier ?? 2
    ) || 2
  );
  const revengeStakeDays =
    originalStake * multiplier;
  const feeDays = Math.min(
    revengeStakeDays,
    Math.max(
      0,
      Number(mainPolicy?.revengeFeeDays ?? 1) || 0
    )
  );
  return {
    division: "MAIN",
    originalStakeDays: originalStake,
    revengeStakeMultiplier: multiplier,
    revengeStakeDays,
    feeDays,
    recipientNoShowReturnDays:
      revengeStakeDays - feeDays,
    recipientNoShowBurnDays:
      feeDays,
  };
}

function resolveRevengeSettlement({
  division,
  outcome,
  revengeStakeDays,
  feeDays = 1,
}) {
  const normalizedDivision = String(division || "").toUpperCase();
  const normalizedOutcome = String(outcome || "").toUpperCase();
  if (!Object.values(REVENGE_OUTCOMES).includes(normalizedOutcome)) {
    throw ruleError(
      "복수전 정산 결과를 확인해주세요.",
      "INVALID_REVENGE_OUTCOME"
    );
  }
  const stakeDays = positiveInteger(
    revengeStakeDays,
    "복수전 잠금 학습일수"
  );
  let settlement;

  if (normalizedDivision === "SUB") {
    if (stakeDays !== SUB_REVENGE_STAKE_DAYS) {
      throw ruleError(
        "Sub Division 복수전 잠금 학습일수는 2일입니다.",
        "INVALID_SUB_REVENGE_STAKE"
      );
    }
    const subTable = {
      [REVENGE_OUTCOMES.ATTACKER_WIN]: {
        tupleAction: "SWAP",
        returnToAttackerDays: 0,
        transferToDefenderDays: 0,
        burnDays: 2,
      },
      [REVENGE_OUTCOMES.DEFENDER_WIN]: {
        tupleAction: "KEEP",
        returnToAttackerDays: 0,
        transferToDefenderDays: 1,
        burnDays: 1,
      },
      [REVENGE_OUTCOMES.DEFENDER_NO_SHOW]: {
        tupleAction: "SWAP",
        returnToAttackerDays: 1,
        transferToDefenderDays: 0,
        burnDays: 1,
      },
      [REVENGE_OUTCOMES.ATTACKER_NO_SHOW]: {
        tupleAction: "KEEP",
        returnToAttackerDays: 0,
        transferToDefenderDays: 1,
        burnDays: 1,
      },
    };
    settlement = subTable[normalizedOutcome];
    if (!settlement) {
      throw ruleError(
        "Sub Division 양측 No-show 정산 정책은 별도 확정이 필요합니다.",
        "SUB_BOTH_NO_SHOW_POLICY_REQUIRED"
      );
    }
  } else if (normalizedDivision === "MAIN") {
    const burnedFeeDays = Math.min(
      stakeDays,
      Math.max(0, Number(feeDays) || 0)
    );
    const netDays = stakeDays - burnedFeeDays;
    const mainTable = {
      [REVENGE_OUTCOMES.ATTACKER_WIN]: {
        tupleAction: "SWAP",
        returnToAttackerDays: 0,
        transferToDefenderDays: 0,
        burnDays: stakeDays,
      },
      [REVENGE_OUTCOMES.DEFENDER_WIN]: {
        tupleAction: "KEEP",
        returnToAttackerDays: 0,
        transferToDefenderDays: netDays,
        burnDays: burnedFeeDays,
      },
      [REVENGE_OUTCOMES.DEFENDER_NO_SHOW]: {
        tupleAction: "SWAP",
        returnToAttackerDays: netDays,
        transferToDefenderDays: 0,
        burnDays: burnedFeeDays,
      },
      [REVENGE_OUTCOMES.ATTACKER_NO_SHOW]: {
        tupleAction: "KEEP",
        returnToAttackerDays: 0,
        transferToDefenderDays: netDays,
        burnDays: burnedFeeDays,
      },
      [REVENGE_OUTCOMES.BOTH_NO_SHOW]: {
        tupleAction: "KEEP",
        returnToAttackerDays: 0,
        transferToDefenderDays: 0,
        burnDays: stakeDays,
      },
    };
    settlement = mainTable[normalizedOutcome];
  } else {
    throw ruleError(
      "복수전 Division을 확인해주세요.",
      "INVALID_REVENGE_DIVISION"
    );
  }

  const accountedDays =
    settlement.returnToAttackerDays +
    settlement.transferToDefenderDays +
    settlement.burnDays;
  if (accountedDays !== stakeDays) {
    throw ruleError(
      "복수전 반환·이전·소각 합계가 잠금 학습일수와 일치하지 않습니다.",
      "REVENGE_SETTLEMENT_NOT_BALANCED"
    );
  }
  return {
    division: normalizedDivision,
    outcome: normalizedOutcome,
    revengeStakeDays: stakeDays,
    ...settlement,
  };
}

function calculateInvitationCancellation({
  reservedLearningDays,
  cancellationFeeDays = 1,
  cancellationType = "AUTOMATIC",
  manualCancellationAllowed = true,
  manualCancellationFeeDays = 0,
  availableLearningDays = 0,
}) {
  const reservedDays = positiveInteger(
    reservedLearningDays,
    "예약 학습일수"
  );
  const normalizedType = String(cancellationType || "").toUpperCase();
  if (normalizedType === "MANUAL" && !manualCancellationAllowed) {
    throw ruleError(
      "이 정책에서는 초대 예약을 직접 취소할 수 없습니다.",
      "MANUAL_INVITATION_CANCELLATION_DISABLED"
    );
  }
  if (!["MANUAL", "AUTOMATIC"].includes(normalizedType)) {
    throw ruleError(
      "초대 취소 유형을 확인해주세요.",
      "INVALID_INVITATION_CANCELLATION_TYPE"
    );
  }
  const requestedFee = Math.max(
    0,
    Number(
      normalizedType === "MANUAL"
        ? manualCancellationFeeDays
        : cancellationFeeDays
    ) || 0
  );
  const burnedLearningDays = Math.min(
    reservedDays,
    requestedFee
  );
  const releasedLearningDays =
    reservedDays - burnedLearningDays;
  const availableDays = Math.max(
    0,
    Number(availableLearningDays) || 0
  );
  return {
    releasedLearningDays,
    burnedLearningDays,
    shouldDemoteToSub:
      availableDays + releasedLearningDays === 0,
  };
}

function isRecentOpponentExcluded({
  lastMatchedAt,
  now = new Date(),
  exclusionDays = 7,
}) {
  if (!lastMatchedAt) return false;
  const matchedAt = new Date(lastMatchedAt);
  const currentTime = new Date(now);
  if (
    Number.isNaN(matchedAt.getTime()) ||
    Number.isNaN(currentTime.getTime()) ||
    matchedAt > currentTime
  ) {
    return false;
  }
  const durationMs =
    Math.max(0, Number(exclusionDays) || 0) * 24 * 60 * 60 * 1000;
  return currentTime.getTime() - matchedAt.getTime() <= durationMs;
}

function resolveInvitationOfferCount({
  eligibleCandidateCount,
  invitationOfferBatchSize,
}) {
  const eligibleCount = Math.max(
    0,
    Number(eligibleCandidateCount) || 0
  );
  if (
    invitationOfferBatchSize === null ||
    invitationOfferBatchSize === undefined ||
    invitationOfferBatchSize === ""
  ) {
    return eligibleCount;
  }
  return Math.min(
    eligibleCount,
    positiveInteger(
      invitationOfferBatchSize,
      "초대 동시 발송 인원"
    )
  );
}

function officialMatchStartDeadline({
  now = new Date(),
  division = "SUB",
}) {
  const requestedAt = new Date(now);
  const regularDeadline = new Date(
    requestedAt.getTime() + HOURS_24_MS
  );
  const sundayCutoff = nextSundayMatchCutoff(
    requestedAt,
    division
  );
  return sundayCutoff && sundayCutoff < regularDeadline
    ? sundayCutoff
    : regularDeadline;
}

function invitationMatchingPaused(now = new Date()) {
  return isSundayMatchRequestLocked(now, "MAIN");
}

function revengeCompletionDeadline({
  now = new Date(),
  division = "SUB",
}) {
  return officialMatchStartDeadline({
    now,
    division,
  });
}

module.exports = {
  HOURS_24_MS,
  SUB_NORMAL_STAKE_DAYS,
  SUB_REVENGE_NO_SHOW_BURN_DAYS,
  SUB_REVENGE_NO_SHOW_RETURN_DAYS,
  SUB_REVENGE_STAKE_DAYS,
  REVENGE_OUTCOMES,
  assertMainStakeSelection,
  buildRevengeEconomySnapshot,
  calculateInvitationCancellation,
  invitationMatchingPaused,
  isRecentOpponentExcluded,
  officialMatchStartDeadline,
  revengeCompletionDeadline,
  resolveInvitationOfferCount,
  resolveRevengeSettlement,
};

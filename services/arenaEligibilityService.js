const ACTIVE_ACCESS_STATE =
  "PAID_ACTIVE";

function packagePurchaseEligibility({
  availableLearningDays,
  reservedLearningDays = 0,
  lockedLearningDays,
  hasPendingSettlement,
}) {
  const reasons = [];
  if (Number(availableLearningDays) !== 0) {
    reasons.push("AVAILABLE_BALANCE_REMAINS");
  }
  if (Number(lockedLearningDays) !== 0) {
    reasons.push("LOCKED_BALANCE_REMAINS");
  }
  if (Number(reservedLearningDays) !== 0) {
    reasons.push("RESERVED_BALANCE_REMAINS");
  }
  if (hasPendingSettlement === true) {
    reasons.push("PENDING_SETTLEMENT");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function officialArenaEligibility({
  accountStatus,
  accessState,
  availableLearningDays,
  currentSeasonPlacementCompleted,
  sundayDivisionLock,
}) {
  const reasons = [];
  if (accountStatus !== "active") {
    reasons.push("ACCOUNT_NOT_ACTIVE");
  }
  if (accessState !== ACTIVE_ACCESS_STATE) {
    reasons.push("ACCESS_NOT_PAID_ACTIVE");
  }
  if (Number(availableLearningDays) <= 0) {
    reasons.push("LEARNING_DAYS_DEPLETED");
  }
  if (currentSeasonPlacementCompleted !== true) {
    reasons.push("SEASON_PLACEMENT_REQUIRED");
  }
  if (sundayDivisionLock === true) {
    reasons.push("SUNDAY_DIVISION_LOCK");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function mainStakeEligibility({
  availableLearningDays,
  stakeDays,
}) {
  const reasons = [];
  const normalizedStake = Number(stakeDays);
  const normalizedAvailable = Number(
    availableLearningDays
  );
  if (
    !Number.isInteger(normalizedStake) ||
    normalizedStake <= 0
  ) {
    reasons.push("MAIN_STAKE_POLICY_INCOMPLETE");
  } else if (
    !Number.isFinite(normalizedAvailable) ||
    normalizedAvailable <= normalizedStake
  ) {
    reasons.push(
      "MAIN_STAKE_BALANCE_BUFFER_REQUIRED"
    );
  }
  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function weeklyMockEligibility(input) {
  const arena = officialArenaEligibility({
    ...input,
    sundayDivisionLock: false,
  });
  return {
    eligible: arena.eligible,
    weeklyMockBonus: arena.eligible
      ? null
      : 0,
    reasons: arena.reasons,
  };
}

module.exports = {
  ACTIVE_ACCESS_STATE,
  mainStakeEligibility,
  officialArenaEligibility,
  packagePurchaseEligibility,
  weeklyMockEligibility,
};

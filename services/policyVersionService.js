function asPlain(policy) {
  if (!policy) {
    return {};
  }
  return typeof policy.toObject ===
    "function"
    ? policy.toObject()
    : policy;
}

function hasText(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function isPositiveInteger(value) {
  return (
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isNonNegativeInteger(
  value
) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isFiniteAtLeast(
  value,
  minimum
) {
  return (
    Number.isFinite(value) &&
    value >= minimum
  );
}

function validTierMapping(
  value
) {
  return (
    Array.isArray(value) &&
    value.length === 9 &&
    value.every(
      (ceiling, index) =>
        isPositiveInteger(
          ceiling
        ) &&
        (index === 0 ||
          ceiling >
            value[index - 1])
    )
  );
}

function unique(values) {
  return [...new Set(values)];
}

function policyReadiness(
  input
) {
  const policy =
    asPlain(input);
  const completion =
    policy.completionPass ||
    {};
  const unresolved = [];

  if (
    Number(
      policy
        .subNormalTakeoverCostDays
    ) !== 1
  ) {
    unresolved.push(
      "subNormalTakeoverCostDays"
    );
  }
  if (
    Number(
      policy
        .subRevengeCostDays
    ) !== 2
  ) {
    unresolved.push(
      "subRevengeCostDays"
    );
  }
  if (
    Number(
      policy
        .minCompletedSubChallenges
    ) < 2
  ) {
    unresolved.push(
      "minCompletedSubChallenges"
    );
  }

  const paybackBlockers = [];
  if (
    !completion.opensAtKst
  ) {
    paybackBlockers.push(
      "completionPass.opensAtKst"
    );
  }
  if (
    !completion.deadlineAtKst
  ) {
    paybackBlockers.push(
      "completionPass.deadlineAtKst"
    );
  }
  if (
    !Array.isArray(
      completion
        .allowedActivityTypes
    ) ||
    !completion
      .allowedActivityTypes
      .length
  ) {
    paybackBlockers.push(
      "completionPass.allowedActivityTypes"
    );
  }
  if (
    !Number.isSafeInteger(
      policy
        .minRecognizedProblemsPerDay
    )
  ) {
    paybackBlockers.push(
      "minRecognizedProblemsPerDay"
    );
  }
  if (
    !Number.isSafeInteger(
      policy
        .minValidStudySecondsPerDay
    )
  ) {
    paybackBlockers.push(
      "minValidStudySecondsPerDay"
    );
  }
  if (
    policy
      .noShowCountsAsCompletedChallenge ===
    null ||
    policy
      .noShowCountsAsCompletedChallenge ===
      undefined
  ) {
    paybackBlockers.push(
      "noShowCountsAsCompletedChallenge"
    );
  }

  const mainBlockers = [];
  if (
    !policy
      .arenaTierStepMappingVersion
  ) {
    mainBlockers.push(
      "arenaTierStepMappingVersion"
    );
  }
  if (
    policy
      .revengeBypassesShield ===
      null ||
    policy
      .revengeBypassesShield ===
      undefined
  ) {
    mainBlockers.push(
      "revengeBypassesShield"
    );
  }

  const publicationBlockers = [];
  if (
    !policy.publishedAt ||
    Number.isNaN(
      new Date(
        policy.publishedAt
      ).getTime()
    )
  ) {
    publicationBlockers.push(
      "publishedAt"
    );
  }

  const activityBlockers = [];
  if (
    !isPositiveInteger(
      policy
        .recentActivityLookbackMinutes
    )
  ) {
    activityBlockers.push(
      "recentActivityLookbackMinutes"
    );
  }
  if (
    !isPositiveInteger(
      policy
        .recentActivityMinEventCount
    )
  ) {
    activityBlockers.push(
      "recentActivityMinEventCount"
    );
  }
  if (
    policy
      .recentActivityWeightVersion !==
    "EVENT_COUNT_RATIO_V1"
  ) {
    activityBlockers.push(
      "recentActivityWeightVersion"
    );
  }

  const subAssignmentBlockers =
    [];
  if (
    !isPositiveInteger(
      policy
        .subDefenderMinHigherPositionGap
    )
  ) {
    subAssignmentBlockers.push(
      "subDefenderMinHigherPositionGap"
    );
  }
  if (
    !isPositiveInteger(
      policy
        .subDefenderMaxHigherPositionGap
    ) ||
    (isPositiveInteger(
      policy
        .subDefenderMinHigherPositionGap
    ) &&
      policy
        .subDefenderMaxHigherPositionGap <
        policy
          .subDefenderMinHigherPositionGap)
  ) {
    subAssignmentBlockers.push(
      "subDefenderMaxHigherPositionGap"
    );
  }
  for (const field of [
    "subRankRangePolicyVersion",
    "settlementPolicyVersion",
    "strongRelationPolicyVersion",
    "integrityPolicyVersion",
  ]) {
    if (!hasText(policy[field])) {
      subAssignmentBlockers.push(
        field
      );
    }
  }
  if (
    !isFiniteAtLeast(
      policy
        .defenseAssignmentAlpha,
      0
    )
  ) {
    subAssignmentBlockers.push(
      "defenseAssignmentAlpha"
    );
  }
  if (
    !isFiniteAtLeast(
      policy
        .targetDefenseGapHours,
      1
    )
  ) {
    subAssignmentBlockers.push(
      "targetDefenseGapHours"
    );
  }
  if (
    !isFiniteAtLeast(
      policy
        .deterministicAuditJitterMin,
      0
    )
  ) {
    subAssignmentBlockers.push(
      "deterministicAuditJitterMin"
    );
  }
  if (
    !isFiniteAtLeast(
      policy
        .deterministicAuditJitterMax,
      0
    ) ||
    (Number.isFinite(
      policy
        .deterministicAuditJitterMin
    ) &&
      policy
        .deterministicAuditJitterMax <
        policy
          .deterministicAuditJitterMin)
  ) {
    subAssignmentBlockers.push(
      "deterministicAuditJitterMax"
    );
  }
  if (
    !isNonNegativeInteger(
      policy
        .defenseAssignmentCapOffset
    )
  ) {
    subAssignmentBlockers.push(
      "defenseAssignmentCapOffset"
    );
  }
  if (
    !isPositiveInteger(
      policy
        .maxDefenseAssignmentsPerDay
    )
  ) {
    subAssignmentBlockers.push(
      "maxDefenseAssignmentsPerDay"
    );
  }
  if (
    !isNonNegativeInteger(
      policy
        .sameOpponentCooldownDays
    )
  ) {
    subAssignmentBlockers.push(
      "sameOpponentCooldownDays"
    );
  }
  subAssignmentBlockers.push(
    ...activityBlockers
  );

  const matchDeadlineBlockers =
    [];
  if (
    !hasText(
      policy
        .deadlinePolicyVersion
    )
  ) {
    matchDeadlineBlockers.push(
      "deadlinePolicyVersion"
    );
  }
  if (
    !isNonNegativeInteger(
      policy
        .startDeadlineMinutes
    )
  ) {
    matchDeadlineBlockers.push(
      "startDeadlineMinutes"
    );
  }
  if (
    !isPositiveInteger(
      policy
        .submissionDeadlineMinutes
    ) ||
    (isNonNegativeInteger(
      policy
        .startDeadlineMinutes
    ) &&
      policy
        .submissionDeadlineMinutes <
        policy
          .startDeadlineMinutes)
  ) {
    matchDeadlineBlockers.push(
      "submissionDeadlineMinutes"
    );
  }
  if (
    !hasText(
      policy
        .questionPolicyVersion
    )
  ) {
    matchDeadlineBlockers.push(
      "questionPolicyVersion"
    );
  }

  const mainArenaOperationalBlockers =
    [];
  if (
    !hasText(
      policy
        .arenaTierStepMappingVersion
    )
  ) {
    mainArenaOperationalBlockers.push(
      "arenaTierStepMappingVersion"
    );
  }
  if (
    !validTierMapping(
      policy
        .arenaTierStepPositionCeilings
    )
  ) {
    mainArenaOperationalBlockers.push(
      "arenaTierStepPositionCeilings"
    );
  }

  const attemptTimingBlockers =
    [];
  if (
    !hasText(
      policy
        .attemptHeartbeatPolicyVersion
    )
  ) {
    attemptTimingBlockers.push(
      "attemptHeartbeatPolicyVersion"
    );
  }
  if (
    !hasText(
      policy
        .activeSolveTimePolicyVersion
    )
  ) {
    attemptTimingBlockers.push(
      "activeSolveTimePolicyVersion"
    );
  }
  if (
    !isPositiveInteger(
      policy
        .maxRecognizedHeartbeatIntervalMs
    )
  ) {
    attemptTimingBlockers.push(
      "maxRecognizedHeartbeatIntervalMs"
    );
  }
  if (
    !isNonNegativeInteger(
      policy
        .networkReconnectGraceMs
    )
  ) {
    attemptTimingBlockers.push(
      "networkReconnectGraceMs"
    );
  }

  const arenaOperationalBlockers =
    unique([
      ...publicationBlockers,
      ...subAssignmentBlockers,
      ...matchDeadlineBlockers,
      ...mainArenaOperationalBlockers,
      ...attemptTimingBlockers,
    ]);

  return {
    coreConstantsValid:
      unresolved.length === 0,
    canCreateSandboxCycle:
      unresolved.length === 0,
    canExposePayback:
      unresolved.length === 0 &&
      paybackBlockers.length === 0,
    canExposeMainArena:
      unresolved.length === 0 &&
      mainBlockers.length === 0,
    unresolvedCore:
      unresolved,
    paybackBlockers,
    mainArenaBlockers:
      mainBlockers,
    publicationBlockers,
    activityBlockers:
      unique(
        activityBlockers
      ),
    subAssignmentBlockers:
      unique(
        subAssignmentBlockers
      ),
    matchDeadlineBlockers:
      unique(
        matchDeadlineBlockers
      ),
    mainArenaOperationalBlockers:
      unique(
        mainArenaOperationalBlockers
      ),
    attemptTimingBlockers:
      unique(
        attemptTimingBlockers
      ),
    arenaOperationalBlockers,
    canOperateSubArena:
      unresolved.length === 0 &&
      publicationBlockers
        .length === 0 &&
      subAssignmentBlockers
        .length === 0 &&
      matchDeadlineBlockers
        .length === 0 &&
      attemptTimingBlockers
        .length === 0,
    canOperateMainArena:
      publicationBlockers
        .length === 0 &&
      matchDeadlineBlockers
        .length === 0 &&
      mainArenaOperationalBlockers
        .length === 0 &&
      attemptTimingBlockers
        .length === 0,
    canOperateArena:
      unresolved.length === 0 &&
      arenaOperationalBlockers
        .length === 0,
  };
}

module.exports = {
  policyReadiness,
};

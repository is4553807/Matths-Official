const MAIN_NORMAL_STAKE_MODES = Object.freeze({
  INITIATOR_ONLY: "INITIATOR_ONLY",
  BILATERAL_ACCEPTED_INVITATION: "BILATERAL_ACCEPTED_INVITATION",
  LEGACY_BILATERAL: "LEGACY_BILATERAL",
});

/**
 * Ranked 일반 경기는 참가 방식에 따라 예치 구조가 다르다.
 *
 * - 상향 쟁탈전: 상위 티어 사용자는 서버 배정으로 의무 참가하므로
 *   신청자(하위 티어)만 예치한다.
 * - 하위 티어 초대전: 하위 티어 사용자가 초대를 수락해 참가하므로
 *   양측이 같은 학습일수를 예치한다.
 *
 * 기존 데이터는 스냅샷에 mode가 없으므로, 저장된 방어자 예치값으로
 * 종전 양측 예치 경기임을 보존해 재정산 규칙이 바뀌지 않게 한다.
 */
function mainNormalStakeModeForOrigin(matchOrigin) {
  return String(matchOrigin || "") === "MAIN_LOWER_INVITATION"
    ? MAIN_NORMAL_STAKE_MODES.BILATERAL_ACCEPTED_INVITATION
    : MAIN_NORMAL_STAKE_MODES.INITIATOR_ONLY;
}

function mainNormalStakeModeForMatch(match = {}) {
  const stored = String(match?.economySnapshot?.normalStakeMode || "").trim();
  if (Object.values(MAIN_NORMAL_STAKE_MODES).includes(stored)) return stored;

  const legacyDefenderStake = Number(
    match?.economySnapshot?.defenderStakeDays ?? match?.defender?.stakeDays ?? 0
  );
  return legacyDefenderStake > 0
    ? MAIN_NORMAL_STAKE_MODES.LEGACY_BILATERAL
    : mainNormalStakeModeForOrigin(match?.matchOrigin);
}

function mainNormalStakeSnapshot({ matchOrigin, stakeDays }) {
  const normalizedStake = Number(stakeDays || 0);
  const normalStakeMode = mainNormalStakeModeForOrigin(matchOrigin);
  return {
    normalStakeMode,
    challengerStakeDays: normalizedStake,
    defenderStakeDays:
      normalStakeMode === MAIN_NORMAL_STAKE_MODES.INITIATOR_ONLY
        ? 0
        : normalizedStake,
  };
}

function mainNormalMatchStakes(match = {}) {
  const normalStakeMode = mainNormalStakeModeForMatch(match);
  const challengerStakeDays = Number(
    match?.economySnapshot?.challengerStakeDays ??
      match?.economySnapshot?.originalStakeDays ??
      match?.challenger?.stakeDays ??
      0
  );
  const defenderStakeDays =
    normalStakeMode === MAIN_NORMAL_STAKE_MODES.INITIATOR_ONLY
      ? 0
      : Number(
          match?.economySnapshot?.defenderStakeDays ??
            match?.defender?.stakeDays ??
            challengerStakeDays
        );
  return {
    normalStakeMode,
    challengerStakeDays,
    defenderStakeDays,
    isInitiatorOnly:
      normalStakeMode === MAIN_NORMAL_STAKE_MODES.INITIATOR_ONLY,
    isBilateral:
      normalStakeMode ===
        MAIN_NORMAL_STAKE_MODES.BILATERAL_ACCEPTED_INVITATION ||
      normalStakeMode === MAIN_NORMAL_STAKE_MODES.LEGACY_BILATERAL,
  };
}

module.exports = {
  MAIN_NORMAL_STAKE_MODES,
  mainNormalMatchStakes,
  mainNormalStakeModeForMatch,
  mainNormalStakeModeForOrigin,
  mainNormalStakeSnapshot,
};

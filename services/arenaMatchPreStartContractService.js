function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : 0;
}

function participantStake(match, role) {
  const normalizedRole = String(role || "").toUpperCase();
  const participant = normalizedRole === "CHALLENGER"
    ? match?.challenger
    : match?.defender;
  const snapshotKey = normalizedRole === "CHALLENGER"
    ? "challengerStakeDays"
    : "defenderStakeDays";
  return nonNegativeInteger(
    match?.economySnapshot?.[snapshotKey] ?? participant?.stakeDays
  );
}

function assetCopy(division) {
  return String(division || "").toUpperCase() === "MAIN"
    ? { label: "학습일수", unit: "일" }
    : { label: "페이백 점수", unit: "점" };
}

function amountLabel(asset, amount) {
  return `${asset.label} ${nonNegativeInteger(amount)}${asset.unit}`;
}

function normalOutcomeCopy({ role, asset, myStake, opponentStake }) {
  const isChallenger = role === "CHALLENGER";
  const myStakeCopy = amountLabel(asset, myStake);
  const opponentStakeCopy = amountLabel(asset, opponentStake);

  if (isChallenger) {
    return {
      stake: myStake > 0
        ? `${myStakeCopy} · 매치 성립 시 예치 완료`
        : "없음",
      win: [
        myStake > 0 ? `${myStakeCopy} 반환` : "예치 변동 없음",
        opponentStake > 0 ? `${opponentStakeCopy} 획득` : "",
        "상대 Arena 자리 획득",
      ].filter(Boolean).join(" · "),
      loss: myStake > 0
        ? `${myStakeCopy} 상대에게 이전 · 현재 Arena 자리 유지`
        : "예치 변동 없음 · 현재 Arena 자리 유지",
    };
  }

  return {
    stake: myStake > 0
      ? `${myStakeCopy} · 매치 성립 시 예치 완료`
      : "없음 · 자동 배정으로 별도 예치하지 않음",
    win: [
      myStake > 0 ? `${myStakeCopy} 반환` : "",
      opponentStake > 0 ? `${opponentStakeCopy} 획득` : "예치 변동 없음",
      "현재 Arena 자리 유지",
    ].filter(Boolean).join(" · "),
    loss: [
      myStake > 0 ? `${myStakeCopy} 상대에게 이전` : "예치 변동 없음",
      "상대와 Arena 자리 교환",
    ].join(" · "),
  };
}

function revengeOutcomeCopy({ role, asset, myStake, opponentStake, fee }) {
  const isChallenger = role === "CHALLENGER";
  const myStakeCopy = amountLabel(asset, myStake);
  const feeCopy = amountLabel(asset, fee);
  const returnAmount = Math.max(0, myStake - fee);
  const opponentReturnAmount = Math.max(0, opponentStake - fee);

  if (isChallenger) {
    return {
      stake: `${myStakeCopy} · 복수전 신청 시 예치 완료`,
      win: `${amountLabel(asset, returnAmount)} 반환 · ${feeCopy} 수수료 · 상대 Arena 자리 획득`,
      loss: `${amountLabel(asset, returnAmount)} 상대에게 이전 · ${feeCopy} 수수료 · 현재 Arena 자리 유지`,
    };
  }

  return {
    stake: myStake > 0
      ? `${myStakeCopy} · 복수전 성립 시 예치 완료`
      : "없음 · 복수전 상대는 별도 예치하지 않음",
    win: opponentStake > 0
      ? `${amountLabel(asset, opponentReturnAmount)} 획득 · ${feeCopy} 수수료 · 현재 Arena 자리 유지`
      : "예치 변동 없음 · 현재 Arena 자리 유지",
    loss: [
      myStake > 0
        ? `${amountLabel(asset, Math.max(0, myStake - fee))} 상대에게 이전`
        : "예치 변동 없음",
      "상대와 Arena 자리 교환",
    ].join(" · "),
  };
}

function friendlyOutcomeCopy(match) {
  const fee = nonNegativeInteger(match?.economySnapshot?.feeDays);
  return {
    stake: fee > 0
      ? `수락 시 학습일수 ${fee}일 이용 수수료 차감 완료`
      : "별도 예치 없음",
    win: "추가 학습일수 변동 없음 · Arena 자리 유지",
    loss: "추가 학습일수 변동 없음 · Arena 자리 유지",
  };
}

function buildArenaMatchPreStartContract(match, role) {
  const normalizedRole = String(role || "").toUpperCase();
  if (!["CHALLENGER", "DEFENDER"].includes(normalizedRole)) {
    throw new TypeError("Arena 경기 역할을 확인할 수 없습니다.");
  }

  const matchType = String(match?.matchType || "NORMAL").toUpperCase();
  const asset = assetCopy(match?.division);
  const myStake = participantStake(match, normalizedRole);
  const opponentStake = participantStake(
    match,
    normalizedRole === "CHALLENGER" ? "DEFENDER" : "CHALLENGER"
  );
  const fee = nonNegativeInteger(match?.economySnapshot?.feeDays);
  const outcome = matchType === "FRIENDLY"
    ? friendlyOutcomeCopy(match)
    : matchType === "REVENGE"
      ? revengeOutcomeCopy({
          role: normalizedRole,
          asset,
          myStake,
          opponentStake,
          fee,
        })
      : normalOutcomeCopy({
          role: normalizedRole,
          asset,
          myStake,
          opponentStake,
        });
  const isCompletionDeadline = matchType === "REVENGE";

  return Object.freeze({
    title: "이번 경기에서 달라지는 것",
    description:
      "매치가 성립할 때 확정된 조건입니다. 공격자와 방어자에게 각자의 역할에 맞는 결과를 표시합니다.",
    stake: outcome.stake,
    win: outcome.win,
    loss: outcome.loss,
    deadlineLabel: isCompletionDeadline
      ? "경기 완료 기한"
      : "경기 시작 기한",
    deadlineAt: isCompletionDeadline
      ? match?.completionDeadlineAt || match?.startDeadlineAt || null
      : match?.startDeadlineAt || null,
    deadlineNotice: isCompletionDeadline
      ? "기한 안에 완료하지 않으면 복수전 미완료 기준으로 정산됩니다."
      : "기한 안에 나만 시작하지 않으면 자동 패배할 수 있습니다. 양쪽 모두 미시작이면 경기 종류에 따른 취소·반환 기준을 적용합니다.",
    rulesHref: match?.division === "MAIN"
      ? "/goat-arena/rules/main"
      : "/goat-arena/rules/sub",
  });
}

module.exports = {
  buildArenaMatchPreStartContract,
};

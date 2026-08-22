const {
  ArenaMatch,
  ArenaMatchAttempt,
  MainShopEffect,
} = require("../models/goatArenaModel");
const {
  MAIN_SHOP_ITEMS,
  MAIN_SHOP_POLICY_VERSION,
  cosmeticEffectEndsAt,
  getActiveMainShopPolicy,
  getMainShopAnalysisResult,
  getMainShopPageData,
  purchaseMainShopItem,
  seasonBoundaries,
} = require("./arenaShopPolicyService");

const MAIN_SHOP_ITEM_PRESENTATION = Object.freeze({
  MATCH_ANALYSIS: Object.freeze({
    eyebrow: "경기 복습",
    description:
      "정산이 끝난 내 경기의 문항별 결과·풀이시간·취약 개념을 분석하고 맞춤 복습 순서를 제공합니다.",
    targetType: "MATCH",
    durationLabel: "경기 한 건 분석",
    refundCondition:
      "5분 안에 두 번 재시도한 뒤에도 생성하지 못하면 구매를 자동 취소하고 1일을 반환합니다.",
  }),
  DEFENSE_REST: Object.freeze({
    eyebrow: "일정 관리",
    description:
      "24시간 동안 앞으로 배정될 일반 상향 공격의 의무 방어 후보에서 제외됩니다.",
    targetType: "NONE",
    durationLabel: "24시간",
    refundCondition:
      "방어 편의 기능은 공통 7일에 한 번만 사용할 수 있으며 정상 적용 뒤에는 임의 취소할 수 없습니다.",
  }),
  DEFENSE_SCHEDULE_PROTECTION: Object.freeze({
    eyebrow: "일정 보호",
    description:
      "조건을 충족한 의무 방어 경기를 승패 없이 종료하고 공격자에게 1일을 보상합니다.",
    targetType: "MATCH",
    durationLabel: "경기 배정 후 3시간 이내",
    refundCondition:
      "적용 즉시 경기 종료·공격자 보상·학습일수 차감이 확정되므로 사용 뒤에는 취소할 수 없습니다.",
  }),
  INVITATION_ACCELERATION: Object.freeze({
    eyebrow: "초대 경기",
    description:
      "대기 중인 Ranked 초대 요청 한 건의 매칭 우선순위를 48시간 동안 높입니다.",
    targetType: "INVITATION",
    durationLabel: "48시간 또는 경기 성립 시까지",
    refundCondition:
      "매칭 성립을 보장하지 않으며 정상 적용 뒤에는 임의 취소할 수 없습니다.",
  }),
  MAIN_PROFILE_BORDER: Object.freeze({
    eyebrow: "시즌 장식",
    description:
      "현재 시즌 동안 Ranked 프로필·랭킹·경기 결과에 전용 테두리를 적용합니다.",
    targetType: "NONE",
    durationLabel: "현재 시즌 종료까지",
    refundCondition:
      "시즌 종료 뒤 자동 만료되며 환불하거나 다른 사용자에게 이전할 수 없습니다.",
  }),
  STYLE_ENTRANCE: Object.freeze({
    eyebrow: "시즌 장식",
    description:
      "구매형 스타일 칭호와 경기 입장 연출을 적용하며 승패 판정에는 영향을 주지 않습니다.",
    targetType: "NONE",
    durationLabel: "현재 시즌 종료까지",
    refundCondition:
      "정상 적용 뒤에는 임의 취소할 수 없으며 시즌 마지막 10일 구매분만 다음 시즌까지 한 번 이월됩니다.",
  }),
});

function isoString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function demotionRisk(afterAvailableDays) {
  return Number(afterAvailableDays) <= 1 ? "FINAL_DAY" : "NORMAL";
}

function purchaseDto(purchase) {
  const row =
    typeof purchase?.toObject === "function"
      ? purchase.toObject()
      : purchase || {};
  return {
    id: String(row._id || row.purchaseId || ""),
    itemCode: String(row.itemCode || ""),
    displayName:
      row.itemDisplayName ||
      MAIN_SHOP_ITEMS[row.itemCode]?.displayName ||
      "Ranked 기능",
    policyVersionCode: String(row.policyVersionCode || ""),
    priceDays: Number(row.priceDays || 0),
    beforeAvailableDays: Number(row.beforeAvailableDays || 0),
    afterAvailableDays: Number(row.afterAvailableDays || 0),
    status:
      row.status === "COMPLETED" ? "APPLIED" : String(row.status || ""),
    purchasedAt: isoString(row.purchasedAt),
    reversedAt: isoString(row.reversedAt),
    reversalReason: String(row.reversalReason || ""),
    relatedMatchId: row.relatedMatchId ? String(row.relatedMatchId) : null,
    relatedInvitationId: row.relatedInvitationId
      ? String(row.relatedInvitationId)
      : null,
  };
}

function effectDto(effect) {
  if (!effect) return null;
  const row =
    typeof effect.toObject === "function" ? effect.toObject() : effect;
  const analysisState = String(row.metadata?.analysisState || "NONE");
  return {
    id: String(row._id || row.effectId || ""),
    itemCode: String(row.itemCode || ""),
    status:
      row.itemCode === "MATCH_ANALYSIS" &&
      row.status === "APPLIED" &&
      analysisState === "READY"
        ? "ANALYSIS_READY"
        : String(row.status || ""),
    startsAt: isoString(row.startsAt),
    endsAt: isoString(row.endsAt),
    appliedAt: isoString(row.appliedAt),
    analysisState,
    relatedMatchId: row.relatedMatchId ? String(row.relatedMatchId) : null,
    relatedInvitationId: row.relatedInvitationId
      ? String(row.relatedInvitationId)
      : null,
  };
}

function matchTypeLabel(matchType) {
  switch (String(matchType || "NORMAL").toUpperCase()) {
    case "FRIENDLY":
      return "친선 경기";
    case "INVITATION":
      return "초대 경기";
    case "REVENGE":
      return "재대결";
    default:
      return "공식 경기";
  }
}

function matchTargetDto(match) {
  return {
    id: String(match._id || match.id || ""),
    divisionLabel: match.division === "MAIN" ? "Ranked" : "Unranked",
    matchTypeLabel: matchTypeLabel(match.matchType),
    occurredAt: isoString(
      match.settledAt || match.readyAt || match.updatedAt || match.createdAt
    ),
  };
}

async function listAnalysisTargets(userId) {
  const matches = await ArenaMatch.find({
    status: "SETTLED",
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  })
    .sort({ settledAt: -1, updatedAt: -1 })
    .limit(12)
    .lean();
  return matches.map(matchTargetDto);
}

async function listDefenseProtectionTargets(userId, now) {
  const cutoff = new Date(new Date(now).getTime() - 3 * 60 * 60 * 1000);
  const matches = await ArenaMatch.find({
    division: "MAIN",
    matchType: "NORMAL",
    matchOrigin: "MAIN_UPWARD_AUTO_MATCH",
    status: "READY",
    "defender.userId": userId,
    $or: [
      { readyAt: { $gte: cutoff } },
      { readyAt: null, createdAt: { $gte: cutoff } },
    ],
  })
    .sort({ readyAt: -1, createdAt: -1 })
    .limit(12)
    .lean();
  if (!matches.length) return [];

  const attempts = await ArenaMatchAttempt.find({
    matchId: { $in: matches.map((match) => match._id) },
  }).lean();
  const attemptsByMatch = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.matchId);
    const rows = attemptsByMatch.get(key) || [];
    rows.push(attempt);
    attemptsByMatch.set(key, rows);
  }
  return matches
    .filter((match) => {
      const rows = attemptsByMatch.get(String(match._id)) || [];
      return (
        rows.length === 2 &&
        rows.every(
          (attempt) => attempt.status === "READY" && !attempt.startedAt
        )
      );
    })
    .map(matchTargetDto);
}

async function getArenaShopDto({ userId, now = new Date() }) {
  const observedAt = new Date(now);
  const [policy, page, analysisTargets, defenseProtectionTargets] =
    await Promise.all([
      getActiveMainShopPolicy(observedAt),
      getMainShopPageData({ userId, now: observedAt }),
      listAnalysisTargets(userId),
      listDefenseProtectionTargets(userId, observedAt),
    ]);
  const availableLearningDays = Number(page.availableLearningDays || 0);
  const items = (policy.items || []).map((item) => {
    const presentation = MAIN_SHOP_ITEM_PRESENTATION[item.itemCode] || {
      eyebrow: "Ranked 기능",
      description: "Ranked 학습을 보조하는 기능입니다.",
      targetType: "NONE",
      durationLabel: "정책에 따름",
      refundCondition: "정상 적용 뒤에는 임의 취소할 수 없습니다.",
    };
    const priceDays = Number(item.priceDays || 0);
    const afterAvailableDays = Math.max(
      0,
      availableLearningDays - priceDays
    );
    const purchaseEligible =
      item.enabled === true &&
      !page.sundayLocked &&
      availableLearningDays > priceDays;
    let expectedEffectEndsAt = null;
    if (purchaseEligible && item.itemCode === "DEFENSE_REST") {
      expectedEffectEndsAt = isoString(
        new Date(observedAt.getTime() + 24 * 60 * 60 * 1000)
      );
    } else if (
      purchaseEligible &&
      ["MAIN_PROFILE_BORDER", "STYLE_ENTRANCE"].includes(item.itemCode)
    ) {
      expectedEffectEndsAt = isoString(
        cosmeticEffectEndsAt({
          purchasedAt: observedAt,
          ...seasonBoundaries(observedAt),
        })
      );
    }
    return {
      itemCode: String(item.itemCode || ""),
      displayName:
        item.displayName ||
        MAIN_SHOP_ITEMS[item.itemCode]?.displayName ||
        String(item.itemCode || ""),
      priceDays,
      releasePhase: Number(item.releasePhase || 1),
      ...presentation,
      purchasePreview: {
        beforeAvailableDays: availableLearningDays,
        afterAvailableDays,
        purchaseEligible,
        expectedEffectEndsAt,
        daysUntilAvailableBalanceExhaustion: afterAvailableDays,
        demotionRisk: demotionRisk(afterAvailableDays),
      },
    };
  });

  return {
    generatedAt: observedAt.toISOString(),
    wallet: {
      availableLearningDays,
      minimumBalanceAfterPurchase: 1,
    },
    policy: {
      versionCode: String(policy.code || MAIN_SHOP_POLICY_VERSION),
      displayName: String(
        policy.displayName || "Ranked 상점 운영 정책"
      ),
      effectiveFrom: isoString(policy.effectiveFrom),
      sundayLocked: Boolean(page.sundayLocked),
      sundayLockMessage:
        "일요일 15:00부터 월요일 00:00까지 Arena 정산 중에는 새 상점 기능을 적용할 수 없습니다.",
      demotionMessage:
        "구매 뒤 최소 1일의 학습일을 남겨야 하며, 모든 잔액이 소진되고 정산이 끝나면 Unranked로 전환됩니다.",
      nonRefundableMessage:
        "효과가 정상 적용된 뒤에는 임의 취소할 수 없습니다. 서버 처리 실패 시에는 정책에 따라 자동 반환합니다.",
    },
    items,
    effects: (page.effects || []).map(effectDto),
    purchases: (page.purchases || []).map(purchaseDto),
    analysisTargets,
    defenseProtectionTargets,
    invitations: (page.invitations || []).map((invitation) => ({
      id: String(invitation._id || invitation.invitationId || ""),
      targetTier: String(invitation.targetTier || ""),
      stakeDays: Number(
        invitation.stakeDays || invitation.reservedDays || 0
      ),
      status: String(invitation.status || ""),
      createdAt: isoString(invitation.createdAt),
      acceleratedAt: isoString(invitation.acceleratedAt),
      accelerationEndsAt: isoString(invitation.accelerationEndsAt),
    })),
  };
}

async function purchaseArenaShopDto({
  userId,
  itemCode,
  purchaseId,
  relatedMatchId = null,
  relatedInvitationId = null,
  now = new Date(),
}) {
  const result = await purchaseMainShopItem({
    userId,
    itemCode,
    requestId: purchaseId,
    relatedMatchId,
    relatedInvitationId,
    now,
  });
  const purchase =
    typeof result.purchase?.toObject === "function"
      ? result.purchase.toObject()
      : result.purchase;
  const effect = purchase?._id
    ? await MainShopEffect.findOne({ purchaseId: purchase._id }).lean()
    : null;
  const receiptPurchase = purchaseDto(purchase);
  const receiptEffect = effectDto(effect);
  return {
    receipt: {
      replayed: result.replayed === true,
      purchase: receiptPurchase,
      effect: receiptEffect,
      matchId: result.matchId
        ? String(result.matchId)
        : receiptPurchase.relatedMatchId,
      beforeAvailableDays: receiptPurchase.beforeAvailableDays,
      afterAvailableDays: receiptPurchase.afterAvailableDays,
      expectedEffectEndsAt: receiptEffect?.endsAt || null,
      demotionRisk: demotionRisk(receiptPurchase.afterAvailableDays),
    },
    shop: await getArenaShopDto({ userId, now }),
  };
}

module.exports = {
  getArenaShopAnalysis: getMainShopAnalysisResult,
  getArenaShopDto,
  purchaseArenaShopDto,
  _testing: {
    demotionRisk,
    effectDto,
    matchTargetDto,
    purchaseDto,
  },
};

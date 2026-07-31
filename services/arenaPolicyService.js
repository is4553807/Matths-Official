const {
  SubscriptionPolicyVersion,
} = require("../models/goatArenaModel");
const {
  TtlCache,
} = require("./ttlCacheService");

const policyCache = new TtlCache({
  maxEntries: 5,
});
const ACTIVE_POLICY_CACHE_KEY =
  "arena-policy:active";
const ACTIVE_POLICY_TTL_MS =
  30 * 1000;

function policySnapshot(policy) {
  if (!policy) return null;
  const source = typeof policy.toObject === "function"
    ? policy.toObject()
    : policy;

  return {
    code: source.code,
    currency: source.currency,
    priceAmount: source.priceAmount,
    timezone:
      source.timezone || "Asia/Seoul",
    initialLearningDays:
      source.initialLearningDays,
    initialPaybackScoreDays:
      source.initialPaybackScoreDays,
    paymentDayCutoffKst:
      source.paymentDayCutoffKst,
    renewalGraceHours:
      source.renewalGraceHours,
    packagePurchaseRequiresZeroBalance:
      source.packagePurchaseRequiresZeroBalance,
    packagePurchaseRequiresZeroLockedBalance:
      source.packagePurchaseRequiresZeroLockedBalance,
    lateRenewalTierPenalty:
      source.lateRenewalTierPenalty,
    payback: JSON.parse(
      JSON.stringify(source.payback || {})
    ),
    effectiveFrom:
      source.effectiveFrom,
  };
}

async function getActiveArenaPolicy(
  now = new Date()
) {
  const cached = policyCache.get(
    ACTIVE_POLICY_CACHE_KEY
  );
  if (
    cached &&
    new Date(cached.effectiveFrom) <= now &&
    (!cached.effectiveUntil ||
      new Date(cached.effectiveUntil) > now)
  ) {
    return cached;
  }

  const policy = await SubscriptionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: now } },
    ],
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  if (policy) {
    policyCache.set(
      ACTIVE_POLICY_CACHE_KEY,
      policy,
      ACTIVE_POLICY_TTL_MS
    );
  }
  return policy;
}

function hasMaterialRenewalChange(
  previousSnapshot,
  nextPolicy
) {
  if (!previousSnapshot || !nextPolicy) {
    return false;
  }
  const nextSnapshot = policySnapshot(nextPolicy);
  return (
    Number(previousSnapshot.priceAmount) !==
      Number(nextSnapshot.priceAmount) ||
    JSON.stringify(previousSnapshot.payback || {}) !==
      JSON.stringify(nextSnapshot.payback || {})
  );
}

function invalidateArenaPolicyCache() {
  policyCache.delete(ACTIVE_POLICY_CACHE_KEY);
}

module.exports = {
  getActiveArenaPolicy,
  hasMaterialRenewalChange,
  invalidateArenaPolicyCache,
  policySnapshot,
};

/*
 * 과거 "30일 후 적용" 방식으로 남은 Ranked 상점 정책 예약을 제거한다.
 * 기본 실행은 대상만 출력한다. 실제 삭제는 아래 명령으로만 가능하다.
 * npm run arena-main-shop-schedule:cleanup
 */
require("dotenv").config({ path: "config.env" });

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ArenaOutboxEvent,
  MainShopPolicyVersion,
  PolicyChangeDelivery,
} = require("../models/goatArenaModel");
const {
  AdminActionLog,
  UserNotification,
} = require("../models/matthsModel");

const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes("--confirm=REMOVE_SCHEDULED_MAIN_SHOP_POLICIES");

function toStrings(values) {
  return values.map((value) => String(value));
}

async function buildPlan(now) {
  const scheduledPolicies = await MainShopPolicyVersion.find({
    effectiveFrom: { $gt: now },
  }).select("_id code displayName status effectiveFrom").lean();
  const policyIds = scheduledPolicies.map((policy) => policy._id);
  const policyIdStrings = toStrings(policyIds);
  const reopenPolicies = await MainShopPolicyVersion.find({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    effectiveUntil: { $gt: now },
  }).select("_id code effectiveUntil").lean();

  if (!policyIds.length) {
    return { scheduledPolicies, reopenPolicies: [], counts: {} };
  }

  const [deliveries, notifications, outboxEvents, adminLogs] = await Promise.all([
    PolicyChangeDelivery.countDocuments({
      policyType: "MAIN_SHOP",
      policyId: { $in: policyIds },
    }),
    UserNotification.countDocuments({
      sourceType: "POLICY_CHANGE",
      sourceId: { $in: policyIds },
    }),
    ArenaOutboxEvent.countDocuments({
      eventType: "PolicyChangeScheduled",
      $or: [
        { aggregateId: { $in: policyIds } },
        { "payload.policy._id": { $in: policyIds } },
      ],
    }),
    AdminActionLog.countDocuments({
      action: "arena.main-shop-policy-update",
      "metadata.policyId": { $in: policyIdStrings },
    }),
  ]);

  return {
    scheduledPolicies,
    reopenPolicies,
    counts: { deliveries, notifications, outboxEvents, adminLogs },
  };
}

async function applyPlan(plan, now) {
  const policyIds = plan.scheduledPolicies.map((policy) => policy._id);
  if (!policyIds.length) return;
  const policyIdStrings = toStrings(policyIds);
  const reopenPolicyIds = plan.reopenPolicies.map((policy) => policy._id);

  await Promise.all([
    PolicyChangeDelivery.deleteMany({
      policyType: "MAIN_SHOP",
      policyId: { $in: policyIds },
    }),
    UserNotification.deleteMany({
      sourceType: "POLICY_CHANGE",
      sourceId: { $in: policyIds },
    }),
    ArenaOutboxEvent.deleteMany({
      eventType: "PolicyChangeScheduled",
      $or: [
        { aggregateId: { $in: policyIds } },
        { "payload.policy._id": { $in: policyIds } },
      ],
    }),
    AdminActionLog.deleteMany({
      action: "arena.main-shop-policy-update",
      "metadata.policyId": { $in: policyIdStrings },
    }),
  ]);

  if (reopenPolicyIds.length) {
    await MainShopPolicyVersion.updateMany(
      { _id: { $in: reopenPolicyIds } },
      { $set: { effectiveUntil: null, updatedAt: now } }
    );
  }
  await MainShopPolicyVersion.deleteMany({ _id: { $in: policyIds } });
}

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  if (APPLY) {
    assert.ok(CONFIRMED, "실행 확인값이 필요합니다: --confirm=REMOVE_SCHEDULED_MAIN_SHOP_POLICIES");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  const now = new Date();
  try {
    const plan = await buildPlan(now);
    console.log(JSON.stringify({
      mode: APPLY ? "APPLY" : "DRY_RUN",
      now: now.toISOString(),
      scheduledPolicies: plan.scheduledPolicies.map((policy) => ({
        id: String(policy._id),
        code: policy.code,
        status: policy.status,
        effectiveFrom: policy.effectiveFrom,
      })),
      reopenPolicies: plan.reopenPolicies.map((policy) => ({
        id: String(policy._id),
        code: policy.code,
        effectiveUntil: policy.effectiveUntil,
      })),
      relatedRecords: plan.counts,
    }, null, 2));
    if (!APPLY) return;

    await applyPlan(plan, now);
    const remaining = await MainShopPolicyVersion.countDocuments({
      effectiveFrom: { $gt: now },
    });
    assert.equal(remaining, 0, "미래 적용 Ranked 상점 정책이 남아 있습니다.");
    console.log("30일 예약 Ranked 상점 정책 및 연결된 공지 기록을 정리했습니다.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

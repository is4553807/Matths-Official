const { ArenaOutboxEvent } = require("../models/goatArenaModel");

function policyNoticeSnapshot(policy) {
  const source = typeof policy?.toObject === "function" ? policy.toObject() : policy;
  return {
    _id: source?._id,
    code: String(source?.code || ""),
    effectiveFrom: source?.effectiveFrom,
    changeSummary: String(source?.changeSummary || "").trim().slice(0, 1000),
  };
}

async function recordPolicyChangeScheduled({ policyType, policy, session = null }) {
  const snapshot = policyNoticeSnapshot(policy);
  if (!snapshot._id || !snapshot.effectiveFrom) {
    throw new Error("정책 변경 공지 이벤트에 필요한 정책 정보가 없습니다.");
  }
  const options = { upsert: true, setDefaultsOnInsert: true };
  if (session) options.session = session;
  return ArenaOutboxEvent.updateOne(
    { idempotencyKey: `${snapshot._id}:PolicyChangeScheduled` },
    {
      $setOnInsert: {
        eventType: "PolicyChangeScheduled",
        aggregateType: "PolicyVersion",
        aggregateId: snapshot._id,
        idempotencyKey: `${snapshot._id}:PolicyChangeScheduled`,
        payload: { policyType, policy: snapshot },
      },
    },
    options
  );
}

module.exports = {
  policyNoticeSnapshot,
  recordPolicyChangeScheduled,
};

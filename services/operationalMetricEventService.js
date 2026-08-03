const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const { OperationalMetricEvent } = require("../models/operationModel");

function clean(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizedUserId(value) {
  return mongoose.isValidObjectId(value) ? value : null;
}

async function recordOperationalMetricEvent({
  eventKey,
  eventType,
  userId = null,
  result,
  division = "",
  sourceTier = "",
  targetTier = "",
  rankBucket = "",
  reasonCode = "",
  metadata = {},
  occurredAt = new Date(),
}) {
  const rawKey = clean(eventKey, 1000);
  if (!rawKey) return null;
  const normalizedKey = `metric:${createHash("sha256").update(rawKey).digest("hex")}`;
  try {
    return await OperationalMetricEvent.findOneAndUpdate(
      { eventKey: normalizedKey },
      {
        $setOnInsert: {
          eventKey: normalizedKey,
          eventType,
          userId: normalizedUserId(userId),
          result,
          division: clean(division, 10).toUpperCase(),
          sourceTier: clean(sourceTier, 40).toUpperCase(),
          targetTier: clean(targetTier, 40).toUpperCase(),
          rankBucket: clean(rankBucket, 40),
          reasonCode: clean(reasonCode, 120).toUpperCase(),
          metadata,
          occurredAt: new Date(occurredAt),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    // 분석용 이벤트가 사용자 기능을 중단시키면 안 된다.
    console.error("운영 지표 이벤트 저장 실패:", error.message);
    return null;
  }
}

module.exports = { recordOperationalMetricEvent };

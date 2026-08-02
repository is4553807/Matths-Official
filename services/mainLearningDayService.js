const SOURCE_ORDER = [
  "SUB_CARRYOVER",
  "MAIN_ENTRY_BONUS",
  "MAIN_MATCH_TRANSFER",
];

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBuckets(cycle) {
  const bySource = new Map(
    (cycle?.learningDayBuckets || []).map((bucket) => [
      bucket.sourceType,
      {
        sourceType: bucket.sourceType,
        availableDays: Math.max(0, numberValue(bucket.availableDays)),
        reservedDays: Math.max(0, numberValue(bucket.reservedDays)),
        lockedDays: Math.max(0, numberValue(bucket.lockedDays)),
      },
    ])
  );
  SOURCE_ORDER.forEach((sourceType) => {
    if (!bySource.has(sourceType)) {
      bySource.set(sourceType, {
        sourceType,
        availableDays: 0,
        reservedDays: 0,
        lockedDays: 0,
      });
    }
  });
  const buckets = SOURCE_ORDER.map((sourceType) => bySource.get(sourceType));
  const currentTotals = totals(buckets);
  const fallbackBucket = buckets.find(
    (bucket) => bucket.sourceType === "MAIN_MATCH_TRANSFER"
  );
  fallbackBucket.availableDays += Math.max(
    0,
    numberValue(cycle?.availableLearningDays) -
      currentTotals.availableLearningDays
  );
  fallbackBucket.reservedDays += Math.max(
    0,
    numberValue(cycle?.reservedLearningDays) -
      currentTotals.reservedLearningDays
  );
  fallbackBucket.lockedDays += Math.max(
    0,
    numberValue(cycle?.lockedLearningDays) -
      currentTotals.lockedLearningDays
  );
  return buckets;
}

function totals(buckets) {
  return buckets.reduce(
    (sum, bucket) => ({
      availableLearningDays:
        sum.availableLearningDays + bucket.availableDays,
      reservedLearningDays:
        sum.reservedLearningDays + bucket.reservedDays,
      lockedLearningDays:
        sum.lockedLearningDays + bucket.lockedDays,
    }),
    {
      availableLearningDays: 0,
      reservedLearningDays: 0,
      lockedLearningDays: 0,
    }
  );
}

function assertDays(days) {
  const parsed = Number(days);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    const error = new Error("Main Division 학습일수는 0 이상의 정수여야 합니다.");
    error.status = 409;
    error.code = "INVALID_MAIN_LEARNING_DAYS";
    throw error;
  }
  return parsed;
}

function moveAvailable(cycle, days, destination) {
  const amount = assertDays(days);
  if (!["reservedDays", "lockedDays"].includes(destination)) {
    throw new Error("Main Division 학습일수 이동 대상을 확인해주세요.");
  }
  const buckets = normalizeBuckets(cycle);
  let remaining = amount;
  for (const bucket of buckets) {
    const moved = Math.min(bucket.availableDays, remaining);
    bucket.availableDays -= moved;
    bucket[destination] += moved;
    remaining -= moved;
    if (remaining === 0) break;
  }
  if (remaining > 0) {
    const error = new Error("사용 가능한 Main Division 학습일수가 부족합니다.");
    error.status = 409;
    error.code = "MAIN_AVAILABLE_DAYS_INSUFFICIENT";
    throw error;
  }
  return { buckets, ...totals(buckets) };
}

function moveReservedToLocked(cycle, days) {
  const amount = assertDays(days);
  const buckets = normalizeBuckets(cycle);
  let remaining = amount;
  for (const bucket of buckets) {
    const moved = Math.min(bucket.reservedDays, remaining);
    bucket.reservedDays -= moved;
    bucket.lockedDays += moved;
    remaining -= moved;
    if (remaining === 0) break;
  }
  if (remaining > 0) {
    const error = new Error("예약된 Main Division 학습일수가 부족합니다.");
    error.status = 409;
    error.code = "MAIN_RESERVED_DAYS_INSUFFICIENT";
    throw error;
  }
  return { buckets, ...totals(buckets) };
}

function releaseReserved(cycle, { returnDays, burnDays = 0 }) {
  const returned = assertDays(returnDays);
  const burned = assertDays(burnDays);
  const total = returned + burned;
  const buckets = normalizeBuckets(cycle);
  let remaining = total;
  let returnRemaining = returned;
  for (const bucket of buckets) {
    const removed = Math.min(bucket.reservedDays, remaining);
    bucket.reservedDays -= removed;
    const restored = Math.min(removed, returnRemaining);
    bucket.availableDays += restored;
    returnRemaining -= restored;
    remaining -= removed;
    if (remaining === 0) break;
  }
  if (remaining > 0) {
    const error = new Error("정산할 예약 학습일수가 부족합니다.");
    error.status = 409;
    error.code = "MAIN_RESERVED_SETTLEMENT_UNBALANCED";
    throw error;
  }
  return { buckets, ...totals(buckets) };
}

function settleLocked(cycle, { returnDays = 0, removeDays }) {
  const returned = assertDays(returnDays);
  const removedTotal = assertDays(removeDays);
  if (returned > removedTotal) {
    throw new Error("반환 학습일수가 정산 대상보다 많습니다.");
  }
  const buckets = normalizeBuckets(cycle);
  let remaining = removedTotal;
  let returnRemaining = returned;
  for (const bucket of buckets) {
    const removed = Math.min(bucket.lockedDays, remaining);
    bucket.lockedDays -= removed;
    const restored = Math.min(removed, returnRemaining);
    bucket.availableDays += restored;
    returnRemaining -= restored;
    remaining -= removed;
    if (remaining === 0) break;
  }
  if (remaining > 0) {
    const error = new Error("정산할 경기 예치 학습일수가 부족합니다.");
    error.status = 409;
    error.code = "MAIN_LOCKED_SETTLEMENT_UNBALANCED";
    throw error;
  }
  return { buckets, ...totals(buckets) };
}

function addMatchTransfer(cycleOrState, days) {
  const amount = assertDays(days);
  const buckets = normalizeBuckets(cycleOrState);
  const transfer = buckets.find(
    (bucket) => bucket.sourceType === "MAIN_MATCH_TRANSFER"
  );
  transfer.availableDays += amount;
  return { buckets, ...totals(buckets) };
}

function consumeAvailableDay(cycle) {
  const moved = moveAvailable(cycle, 1, "lockedDays");
  return settleLocked(
    { learningDayBuckets: moved.buckets },
    { returnDays: 0, removeDays: 1 }
  );
}

module.exports = {
  SOURCE_ORDER,
  addMatchTransfer,
  consumeAvailableDay,
  moveAvailable,
  moveReservedToLocked,
  normalizeBuckets,
  releaseReserved,
  settleLocked,
  totals,
};

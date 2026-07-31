const {
  hasMaterialRenewalChange,
  policySnapshot,
} = require("./arenaPolicyService");

const DAY_MS = 24 * 60 * 60 * 1000;

function kstDateParts(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }
  ).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) =>
        part.type !== "literal"
      )
      .map((part) => [
        part.type,
        Number(part.value),
      ])
  );
}

function dateKeyFromUtcDay(dayNumber) {
  return new Date(dayNumber * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function dateKeyToUtcDay(dateKey) {
  const [year, month, day] = dateKey
    .split("-")
    .map(Number);
  return Math.floor(
    Date.UTC(year, month - 1, day) /
      DAY_MS
  );
}

function kstMidnight(dateKey) {
  return new Date(
    `${dateKey}T00:00:00.000+09:00`
  );
}

function computeAccessCycleWindow({
  purchasedAt,
  policy,
}) {
  const purchaseDate = new Date(purchasedAt);
  if (
    Number.isNaN(purchaseDate.getTime())
  ) {
    throw new Error(
      "결제 시각을 확인할 수 없습니다."
    );
  }
  const snapshot = policySnapshot(policy);
  if (!snapshot) {
    throw new Error(
      "적용할 Arena 정책이 없습니다."
    );
  }
  const parts = kstDateParts(purchaseDate);
  const purchaseDateKey = [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
  const [cutoffHour, cutoffMinute] = String(
    snapshot.paymentDayCutoffKst || "20:00"
  )
    .split(":")
    .map(Number);
  const purchaseMinuteOfDay =
    parts.hour * 60 +
    Number(parts.minute || 0);
  const cutoffMinuteOfDay =
    cutoffHour * 60 +
    cutoffMinute;
  const isNextDay =
    purchaseMinuteOfDay >=
    cutoffMinuteOfDay;
  const firstDayNumber =
    dateKeyToUtcDay(purchaseDateKey) +
    (isNextDay ? 1 : 0);
  const firstConsumptionDateKey =
    dateKeyFromUtcDay(firstDayNumber);
  const expiresDateKey = dateKeyFromUtcDay(
    firstDayNumber +
      Number(snapshot.initialLearningDays)
  );
  const evaluationDateKey =
    dateKeyFromUtcDay(
      firstDayNumber + 30
    );

  return {
    startsAt: purchaseDate,
    firstConsumptionDateKst:
      firstConsumptionDateKey,
    firstDayMode: isNextDay
      ? "NEXT_DAY"
      : "SAME_DAY",
    baseExpiresAt:
      kstMidnight(expiresDateKey),
    expiresAt:
      kstMidnight(expiresDateKey),
    evaluationAt:
      kstMidnight(evaluationDateKey),
  };
}

function buildRenewalPolicyNotice({
  previousCycle,
  nextPolicy,
}) {
  const previousSnapshot =
    previousCycle?.policySnapshot;
  const changed =
    hasMaterialRenewalChange(
      previousSnapshot,
      nextPolicy
    );
  const previousPaybackReceived =
    previousCycle?.status ===
      "PAYBACK_COMPLETED" ||
    previousCycle?.cashbackQualified ===
      true;

  if (!changed || previousPaybackReceived) {
    return {
      required: false,
      previousPolicyVersionCode:
        previousCycle
          ?.policyVersionCode || "",
      nextPolicyVersionCode:
        nextPolicy?.code || "",
      message: "",
      acknowledgedAt: null,
    };
  }

  return {
    required: true,
    previousPolicyVersionCode:
      previousCycle
        ?.policyVersionCode || "",
    nextPolicyVersionCode:
      nextPolicy?.code || "",
    message:
      "이전 이용 주기와 비교해 가격 또는 페이백 구간이 변경되었습니다. 새 결제 주기에 적용될 조건을 확인해주세요.",
    acknowledgedAt: null,
  };
}

function buildAccessCycleDraft({
  userId,
  division = "SUB",
  policy,
  purchasedAt = new Date(),
  purchaseReference,
  previousCycle = null,
}) {
  const snapshot = policySnapshot(policy);
  const window = computeAccessCycleWindow({
    purchasedAt,
    policy,
  });

  return {
    userId,
    division,
    status: "PENDING",
    policyVersionId:
      policy._id,
    policyVersionCode:
      policy.code,
    policySnapshot: snapshot,
    currency: policy.currency || "KRW",
    pricePaid:
      Number(policy.priceAmount) || 0,
    purchaseReference,
    paidAt:
      new Date(purchasedAt),
    ...window,
    availableLearningDays:
      Number(
        snapshot.initialLearningDays
      ),
    paybackScoreDays:
      Number(
        snapshot.initialPaybackScoreDays
      ),
    lockedLearningDays: 0,
    firstDayConsumedAt: null,
    paidNormalAttacksCompleted: 0,
    streakDays: 0,
    cashbackQualified: false,
    paybackRate: 0,
    paybackAmount: 0,
    evaluatedAt: null,
    renewalPolicyNotice:
      buildRenewalPolicyNotice({
        previousCycle,
        nextPolicy: policy,
      }),
  };
}

module.exports = {
  buildAccessCycleDraft,
  buildRenewalPolicyNotice,
  computeAccessCycleWindow,
};

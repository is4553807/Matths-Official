const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {
  PaybackDailyLearning,
} = require("../models/paybackDailyLearningModel");
const {
  buildApprovedCycleState,
  buildAccessCycleDraft,
  computeAccessCycleWindow,
  _testing: {
    activePaybackAttackWindow,
  },
} = require("../services/accessCycleService");
const {
  officialArenaEligibility,
  packagePurchaseEligibility,
} = require("../services/arenaEligibilityService");
const {
  subOfficialMatchCycleAvailability,
} = require("../services/arenaMatchService");
const {
  holdSubAccessForPaybackWindow,
} = require("../services/accessCycleDailyService");
const {
  calculatePaybackDecision,
} = require("../services/arenaPaybackReviewService");
const {
  currentConsecutiveDays,
  evaluateAttackSubmission,
  kstDateKey,
  nextKstDateKey,
  requiredAnswersSubmitted,
} = require("../services/paybackDailyLearningService");

async function run() {
const root = path.resolve(__dirname, "..");
const userId = new mongoose.Types.ObjectId();
const defenderId = new mongoose.Types.ObjectId();
const cycleId = new mongoose.Types.ObjectId();
const matchId = new mongoose.Types.ObjectId();
const attemptId = new mongoose.Types.ObjectId();
const evidenceId = new mongoose.Types.ObjectId();
const submittedAt = new Date(
  "2026-08-02T09:15:00+09:00"
);
const answers = Array.from(
  { length: 5 },
  (_, index) => ({
    questionKey: `Q${index + 1}`,
    value: String(index + 1),
  })
);
const match = {
  _id: matchId,
  division: "SUB",
  matchType: "NORMAL",
  challenger: {
    userId,
    accessCycleId: cycleId,
  },
  defender: {
    userId: defenderId,
  },
  winnerRole: "DEFENDER",
};
const attempt = {
  _id: attemptId,
  matchId,
  userId,
  role: "CHALLENGER",
  status: "SUBMITTED",
  answers,
  submittedAt:
    new Date("2026-08-02T09:14:00+09:00"),
  evidenceSubmittedAt: submittedAt,
};
const evidence = {
  _id: evidenceId,
  attemptId,
  matchId,
  userId,
  submittedAt,
  files: [
    {
      storedName: "evidence.png",
      sizeBytes: 8192,
      sha256: "a".repeat(64),
    },
  ],
};

assert.equal(
  kstDateKey(
    new Date("2026-08-01T14:59:59.999Z")
  ),
  "2026-08-01"
);
assert.equal(
  kstDateKey(
    new Date("2026-08-01T15:00:00.000Z")
  ),
  "2026-08-02"
);
assert.equal(
  nextKstDateKey(
    new Date("2026-12-31T13:00:00.000Z")
  ),
  "2027-01-01"
);
assert.equal(
  nextKstDateKey(
    new Date("2028-02-28T12:00:00.000Z")
  ),
  "2028-02-29"
);

const policy = {
  _id: new mongoose.Types.ObjectId(),
  code: "PAYBACK-DAILY-ATTACK-TEST",
  displayName: "29일 공식 공격 테스트",
  currency: "KRW",
  priceAmount: 29000,
  initialLearningDays: 29,
  initialPaybackScoreDays: 29,
  paymentDayCutoffKst: "00:00",
  renewalGraceHours: 72,
  packagePurchaseRequiresZeroBalance: true,
  packagePurchaseRequiresZeroLockedBalance: true,
  lateRenewalTierPenalty: 1,
  matchStakeDays: {
    normal: 1,
    revenge: 2,
  },
  dailyMatchLimitsByTier: [],
  payback: {
    minimumStreakDays: 29,
    minimumScoreDays: 30,
    bands: [
      {
        minScoreDays: 0,
        maxScoreDays: 29,
        ratePercent: 0,
      },
      {
        minScoreDays: 30,
        maxScoreDays: null,
        ratePercent: 100,
      },
    ],
  },
};

for (const purchasedAt of [
  new Date("2026-08-01T00:00:00+09:00"),
  new Date("2026-08-01T19:59:59+09:00"),
  new Date("2026-08-01T23:59:59.999+09:00"),
]) {
  const window = computeAccessCycleWindow({
    purchasedAt,
    policy,
  });
  assert.equal(
    window.firstDayMode,
    "NEXT_DAY"
  );
  assert.equal(
    window.firstConsumptionDateKst,
    "2026-08-02"
  );
  assert.equal(
    window.evaluationAt.toISOString(),
    "2026-08-30T15:00:00.000Z"
  );
}

const draft = buildAccessCycleDraft({
  userId,
  policy,
  purchasedAt:
    new Date("2026-08-01T09:00:00+09:00"),
  purchaseReference:
    "PAYBACK-DAILY-ATTACK-ORDER",
});
const approved = buildApprovedCycleState({
  cycleDraft: draft,
  cycleId,
  paymentId: new mongoose.Types.ObjectId(),
  approvedAt:
    new Date("2026-08-01T09:00:00+09:00"),
});
assert.equal(approved.immediateConsumption, false);
assert.equal(
  approved.cycle.availableLearningDays,
  29
);
assert.equal(
  approved.cycle.firstDayConsumedAt,
  null
);
assert.deepEqual(
  approved.ledgerEntries.map(
    (entry) => entry.eventType
  ),
  ["PURCHASE_GRANTED"]
);

assert.equal(
  requiredAnswersSubmitted(attempt),
  true
);
assert.equal(
  requiredAnswersSubmitted({
    ...attempt,
    answers: answers.slice(0, 4),
  }),
  false
);
assert.equal(
  requiredAnswersSubmitted({
    ...attempt,
    answers: answers.map((answer, index) => ({
      ...answer,
      value: index === 2 ? "" : answer.value,
    })),
  }),
  false
);

assert.deepEqual(
  evaluateAttackSubmission({
    match,
    attempt,
    evidence,
    userId,
  }),
  { eligible: true, reason: "ELIGIBLE" },
  "패배한 공격자도 답안과 증거를 정상 제출하면 인정되어야 합니다."
);
assert.equal(
  evaluateAttackSubmission({
    match: {
      ...match,
      matchType: "REVENGE",
    },
    attempt,
    evidence,
    userId,
  }).eligible,
  true,
  "공식 복수전 공격도 학습으로 인정되어야 합니다."
);
for (const [label, input, reason] of [
  [
    "친선전",
    { match: { ...match, matchType: "FRIENDLY" }, attempt, evidence, userId },
    "OFFICIAL_SUB_ATTACK_REQUIRED",
  ],
  [
    "Ranked 경기",
    { match: { ...match, division: "MAIN" }, attempt, evidence, userId },
    "OFFICIAL_SUB_ATTACK_REQUIRED",
  ],
  [
    "방어자",
    {
      match,
      attempt: { ...attempt, role: "DEFENDER" },
      evidence,
      userId,
    },
    "CHALLENGER_SUBMISSION_REQUIRED",
  ],
  [
    "답안 누락",
    {
      match,
      attempt: { ...attempt, answers: answers.slice(0, 4) },
      evidence,
      userId,
    },
    "ALL_REQUIRED_ANSWERS_REQUIRED",
  ],
  [
    "증거 누락",
    { match, attempt, evidence: { ...evidence, files: [] }, userId },
    "VALID_EVIDENCE_REQUIRED",
  ],
  [
    "답안만 제출",
    {
      match,
      attempt: { ...attempt, status: "EVIDENCE_REQUIRED" },
      evidence,
      userId,
    },
    "ATTACK_NOT_FULLY_SUBMITTED",
  ],
]) {
  assert.equal(
    evaluateAttackSubmission(input).reason,
    reason,
    `${label}이 일일 공격 학습으로 잘못 인정됩니다.`
  );
}

assert.deepEqual(
  currentConsecutiveDays([
    "2026-08-02",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
  ]),
  {
    streakDays: 3,
    lastDateKeyKst: "2026-08-04",
  }
);
assert.deepEqual(
  currentConsecutiveDays([
    "2026-08-02",
    "2026-08-03",
    "2026-08-05",
    "2026-08-06",
  ]),
  {
    streakDays: 2,
    lastDateKeyKst: "2026-08-06",
  },
  "하루를 빠뜨리면 현재 연속 공격일은 다시 계산되어야 합니다."
);
const allDates = Array.from(
  { length: 29 },
  (_, index) => {
    const day = String(index + 2).padStart(2, "0");
    return index < 29
      ? `2026-08-${day}`
      : "";
  }
);
assert.equal(
  currentConsecutiveDays(allDates).streakDays,
  29
);

assert.equal(
  officialArenaEligibility({
    accountStatus: "active",
    accessState: "PAID_ACTIVE",
    availableLearningDays: 0,
    currentSeasonPlacementCompleted: true,
    sundayDivisionLock: false,
    allowDepletedLearningDays: true,
  }).eligible,
  true,
  "마지막 페이백 공격일에는 잔액 0이어도 Unranked 공식 공격이 가능해야 합니다."
);
assert.equal(
  officialArenaEligibility({
    accountStatus: "active",
    accessState: "PAID_ACTIVE",
    availableLearningDays: 0,
    currentSeasonPlacementCompleted: true,
    sundayDivisionLock: false,
  }).eligible,
  false
);
assert.equal(
  holdSubAccessForPaybackWindow(
    {
      division: "SUB",
      evaluationAt:
        new Date("2026-08-31T00:00:00+09:00"),
    },
    new Date("2026-08-30T23:59:59.999+09:00")
  ),
  true
);
assert.equal(
  activePaybackAttackWindow(
    {
      division: "SUB",
      status: "ACTIVE",
      availableLearningDays: 0,
      evaluationAt:
        new Date("2026-08-31T00:00:00+09:00"),
    },
    new Date("2026-08-30T23:59:59.999+09:00")
  ),
  true
);
assert.deepEqual(
  packagePurchaseEligibility({
    availableLearningDays: 0,
    reservedLearningDays: 0,
    lockedPaybackScoreDays: 0,
    lockedLearningDays: 0,
    hasPendingSettlement: false,
    activePaybackAttackWindow: true,
  }).reasons,
  ["PAYBACK_ATTACK_WINDOW_ACTIVE"],
  "마지막 공식 공격 제출 기간에는 새 학습권으로 현재 주기를 덮어쓰면 안 됩니다."
);
assert.deepEqual(
  subOfficialMatchCycleAvailability(
    new Date("2026-08-30T12:00:00+09:00")
  ),
  {
    $or: [
      {
        availableLearningDays: {
          $gt: 0,
        },
      },
      {
        availableLearningDays: 0,
        evaluationAt: {
          $gt: new Date("2026-08-30T12:00:00+09:00"),
        },
      },
    ],
  },
  "마지막 날 잔액이 0인 Unranked 사용자도 공식 공격의 방어 후보로 조회되어야 합니다."
);
assert.equal(
  holdSubAccessForPaybackWindow(
    {
      division: "SUB",
      evaluationAt:
        new Date("2026-08-31T00:00:00+09:00"),
    },
    new Date("2026-08-31T00:00:00+09:00")
  ),
  false
);

assert.equal(
  calculatePaybackDecision({
    policySnapshot: policy,
    pricePaid: 29000,
    paybackScoreDays: 30,
    streakDays: 29,
  }).qualified,
  true
);
assert.equal(
  calculatePaybackDecision({
    policySnapshot: policy,
    pricePaid: 29000,
    paybackScoreDays: 30,
    streakDays: 28,
  }).qualified,
  false
);

const learningRecord = new PaybackDailyLearning({
  accessCycleId: cycleId,
  userId,
  dateKeyKst: "2026-08-02",
  matchId,
  attemptId,
  evidenceId,
  matchType: "NORMAL",
  role: "CHALLENGER",
  submittedAt,
});
await assert.doesNotReject(() =>
  learningRecord.validate()
);
const uniqueIndexes =
  PaybackDailyLearning.schema.indexes();
assert.ok(
  uniqueIndexes.some(
    ([fields, options]) =>
      fields.accessCycleId === 1 &&
      fields.dateKeyKst === 1 &&
      options.unique === true
  )
);

const userLifecycleSource = fs.readFileSync(
  path.join(root, "services/userLifecycleService.js"),
  "utf8"
);
const evidenceSource = fs.readFileSync(
  path.join(root, "services/arenaMatchEvidenceService.js"),
  "utf8"
);
assert.doesNotMatch(
  userLifecycleSource,
  /recordAccessCycleStudyStreak/,
  "일반 학습 이벤트가 페이백 공격 연속일을 올리면 안 됩니다."
);
assert.match(
  evidenceSource,
  /recordPaybackAttackLearningDay/,
  "풀이 증거 정상 제출 경로가 페이백 일일 공격 장부에 연결되지 않았습니다."
);
const accountDeletionSource = fs.readFileSync(
  path.join(root, "services/accountDeletionService.js"),
  "utf8"
);
assert.match(
  accountDeletionSource,
  /PaybackDailyLearning\.deleteMany/,
  "회원 데이터 완전 삭제에 페이백 일별 공격 기록이 포함되어야 합니다."
);
const serverSource = fs.readFileSync(
  path.join(root, "server.js"),
  "utf8"
);
assert.match(
  serverSource,
  /ensurePaybackDailyLearningIndexes/,
  "운영 서버 시작 시 일별 공격 기록의 고유 인덱스를 보장해야 합니다."
);
assert.match(
  serverSource,
  /reconcileOpenPaybackDailyLearningStreaks/,
  "운영 서버 시작 시 과거 일반 학습 streak를 공식 공격 제출 장부 기준으로 교정해야 합니다."
);
const reviewSource = fs.readFileSync(
  path.join(root, "services/arenaPaybackReviewService.js"),
  "utf8"
);
assert.match(
  reviewSource,
  /PaybackDailyLearning\.find/,
  "최종 페이백 심사는 비정규화된 과거 학습값이 아니라 공식 공격 제출 장부를 다시 조회해야 합니다."
);

console.log(
  "Payback daily GOAT Arena attack contract verified: next-day KST start, full answers and evidence, challenger-only official matches, one-day semantics, last-day access, and 29-day decision."
);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  AccessCycle,
} = require("../models/goatArenaModel");
const {
  PaybackDailyLearning,
} = require("../models/paybackDailyLearningModel");
const {
  buildAccessCycleDraft,
  buildApprovedCycleState,
} = require("../services/accessCycleService");
const {
  ensurePaybackDailyLearningIndexes,
  reconcileOpenPaybackDailyLearningStreaks,
  recordPaybackAttackLearningDay,
} = require("../services/paybackDailyLearningService");

const ids = {
  userId: new mongoose.Types.ObjectId(),
  defenderId: new mongoose.Types.ObjectId(),
  cycleId: new mongoose.Types.ObjectId(),
  policyId: new mongoose.Types.ObjectId(),
};

const policy = {
  _id: ids.policyId,
  code: `PAYBACK-DAILY-DB-${String(ids.cycleId)}`,
  displayName: "페이백 일일 공격 DB 검증",
  currency: "KRW",
  priceAmount: 29000,
  initialLearningDays: 29,
  initialPaybackScoreDays: 29,
  paymentDayCutoffKst: "00:00",
  renewalGraceHours: 72,
  packagePurchaseRequiresZeroBalance: true,
  packagePurchaseRequiresZeroLockedBalance: true,
  lateRenewalTierPenalty: 1,
  matchStakeDays: { normal: 1, revenge: 2 },
  dailyMatchLimitsByTier: [],
  payback: {
    minimumStreakDays: 29,
    minimumScoreDays: 30,
    bands: [
      { minScoreDays: 0, maxScoreDays: 29, ratePercent: 0 },
      { minScoreDays: 30, maxScoreDays: null, ratePercent: 100 },
    ],
  },
};

function validSubmission({
  date,
  matchType = "NORMAL",
} = {}) {
  const matchId = new mongoose.Types.ObjectId();
  const attemptId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const submittedAt = new Date(
    `${date}T12:00:00+09:00`
  );
  return {
    match: {
      _id: matchId,
      division: "SUB",
      matchType,
      challenger: {
        userId: ids.userId,
        accessCycleId: ids.cycleId,
      },
      defender: {
        userId: ids.defenderId,
      },
    },
    attempt: {
      _id: attemptId,
      matchId,
      userId: ids.userId,
      role: "CHALLENGER",
      status: "SUBMITTED",
      answers: Array.from(
        { length: 5 },
        (_, index) => ({
          questionKey: `Q${index + 1}`,
          value: String(index + 1),
        })
      ),
      submittedAt:
        new Date(submittedAt.getTime() - 60000),
      evidenceSubmittedAt: submittedAt,
    },
    evidence: {
      _id: evidenceId,
      attemptId,
      matchId,
      userId: ids.userId,
      submittedAt,
      files: [
        {
          storedName: `${evidenceId}.png`,
          sizeBytes: 8192,
          sha256: "b".repeat(64),
        },
      ],
    },
    userId: ids.userId,
    submittedAt,
  };
}

async function cleanup() {
  await PaybackDailyLearning.deleteMany({
    accessCycleId: ids.cycleId,
  });
  await AccessCycle.deleteOne({
    _id: ids.cycleId,
  });
}

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);
  await ensurePaybackDailyLearningIndexes();
  try {
    await cleanup();
    await PaybackDailyLearning.init();

    const purchasedAt = new Date(
      "2026-08-01T21:45:00+09:00"
    );
    const draft = buildAccessCycleDraft({
      userId: ids.userId,
      policy,
      purchasedAt,
      purchaseReference:
        `PAYBACK-DAILY-DB-${ids.cycleId}`,
    });
    const approved = buildApprovedCycleState({
      cycleDraft: draft,
      cycleId: ids.cycleId,
      paymentId:
        new mongoose.Types.ObjectId(),
      approvedAt: purchasedAt,
    });
    await AccessCycle.create(
      approved.cycle
    );

    const beforeWindow =
      await recordPaybackAttackLearningDay(
        validSubmission({
          date: "2026-08-01",
        })
      );
    assert.equal(
      beforeWindow.reason,
      "BEFORE_DAILY_ATTACK_WINDOW"
    );

    const first =
      await recordPaybackAttackLearningDay(
        validSubmission({
          date: "2026-08-02",
        })
      );
    assert.equal(first.credited, true);
    assert.equal(first.streakDays, 1);

    const sameDayResults = await Promise.all([
      recordPaybackAttackLearningDay(
        validSubmission({
          date: "2026-08-02",
          matchType: "REVENGE",
        })
      ),
      recordPaybackAttackLearningDay(
        validSubmission({
          date: "2026-08-02",
        })
      ),
    ]);
    assert.ok(
      sameDayResults.every(
        (entry) =>
          entry.credited === false &&
          entry.reason ===
            "DAILY_ATTACK_ALREADY_CREDITED"
      )
    );
    assert.equal(
      await PaybackDailyLearning.countDocuments({
        accessCycleId: ids.cycleId,
        dateKeyKst: "2026-08-02",
      }),
      1
    );

    for (let day = 3; day <= 30; day += 1) {
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      const result =
        await recordPaybackAttackLearningDay(
          validSubmission({ date })
        );
      assert.equal(
        result.credited,
        true,
        `${date} 공격 제출이 인정되지 않았습니다: ${result.reason}`
      );
      assert.equal(
        result.streakDays,
        day - 1
      );
    }

    let cycle = await AccessCycle.findById(
      ids.cycleId
    ).lean();
    assert.equal(cycle.streakDays, 29);
    assert.equal(
      cycle.lastStreakDateKst,
      "2026-08-30"
    );
    assert.equal(
      await PaybackDailyLearning.countDocuments({
        accessCycleId: ids.cycleId,
      }),
      29
    );
    await AccessCycle.updateOne(
      { _id: ids.cycleId },
      { $set: { streakDays: 99 } }
    );
    await reconcileOpenPaybackDailyLearningStreaks({
      cycleIds: [ids.cycleId],
    });
    cycle = await AccessCycle.findById(
      ids.cycleId
    ).lean();
    assert.equal(
      cycle.streakDays,
      29,
      "운영 재시작 시 과거 일반 학습 streak 값은 공식 공격 제출 장부 기준으로 복구되어야 합니다."
    );

    const atEvaluation =
      validSubmission({
        date: "2026-08-31",
      });
    atEvaluation.submittedAt =
      new Date(cycle.evaluationAt);
    atEvaluation.evidence.submittedAt =
      new Date(cycle.evaluationAt);
    atEvaluation.attempt.evidenceSubmittedAt =
      new Date(cycle.evaluationAt);
    const afterWindow =
      await recordPaybackAttackLearningDay(
        atEvaluation
      );
    assert.equal(
      afterWindow.reason,
      "AFTER_DAILY_ATTACK_WINDOW"
    );

    console.log(
      "Isolated DB payback daily attack verification passed: next-day boundary, concurrent same-day idempotency, 29 distinct KST days, streak persistence, and evaluation cutoff."
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  AccessCycle,
  ArenaLearningDayLedger,
} = require("../models/goatArenaModel");
const {
  burnAvailable,
} = require("../services/mainLearningDayService");

function value(input) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

async function loadPlan(cycleId) {
  const cycle = await AccessCycle.findById(cycleId).lean();
  if (!cycle) throw new Error("이용 주기를 찾을 수 없습니다.");
  if (cycle.division !== "MAIN") {
    throw new Error("Ranked 이용 주기만 보정할 수 있습니다.");
  }
  const entries = await ArenaLearningDayLedger.find({
    accessCycleId: cycle._id,
  })
    .sort({ occurredAt: 1, _id: 1 })
    .lean();
  const ledgerAvailableDays = entries.reduce(
    (sum, entry) => sum + value(entry.availableLearningDaysDelta),
    0
  );
  const storedAvailableDays = value(cycle.availableLearningDays);
  const missingBurnDays = storedAvailableDays - ledgerAvailableDays;
  if (missingBurnDays < 0) {
    throw new Error(
      "장부 합계가 현재 잔액보다 큽니다. 자동으로 보정하지 않고 운영자 검토가 필요합니다."
    );
  }
  const state = missingBurnDays
    ? burnAvailable(cycle, missingBurnDays)
    : {
        buckets: cycle.learningDayBuckets || [],
        availableLearningDays: storedAvailableDays,
        reservedLearningDays: value(cycle.reservedLearningDays),
        lockedLearningDays: value(cycle.lockedLearningDays),
      };
  if (value(state.availableLearningDays) !== ledgerAvailableDays) {
    throw new Error("학습일수 출처 묶음을 장부 합계와 일치시킬 수 없습니다.");
  }
  return {
    cycle,
    entries,
    ledgerAvailableDays,
    storedAvailableDays,
    missingBurnDays,
    state,
  };
}

async function main() {
  const cycleId = option("cycle");
  const apply = process.argv.includes("--apply");
  const syncLatestFriendlyFeeBalance = process.argv.includes(
    "--sync-latest-friendly-fee-balance"
  );
  if (!cycleId) {
    throw new Error("--cycle=<AccessCycle ID>를 지정해주세요.");
  }
  if (!mongoose.isValidObjectId(cycleId)) {
    throw new Error("유효한 AccessCycle ID를 지정해주세요.");
  }
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const plan = await loadPlan(cycleId);
    const report = {
      apply,
      cycleId: String(plan.cycle._id),
      userId: String(plan.cycle.userId),
      storedAvailableDays: plan.storedAvailableDays,
      ledgerAvailableDays: plan.ledgerAvailableDays,
      missingBurnDays: plan.missingBurnDays,
      syncLatestFriendlyFeeBalance,
      ledgerEvents: plan.entries.map((entry) => ({
        eventType: entry.eventType,
        availableLearningDaysDelta: value(entry.availableLearningDaysDelta),
        occurredAt: entry.occurredAt,
      })),
    };
    console.log(JSON.stringify(report, null, 2));
    if (
      !apply ||
      (!plan.missingBurnDays && !syncLatestFriendlyFeeBalance)
    ) return;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (plan.missingBurnDays) {
          const updated = await AccessCycle.updateOne(
            {
              _id: plan.cycle._id,
              status: plan.cycle.status,
              availableLearningDays: plan.storedAvailableDays,
            },
            {
              $set: {
                availableLearningDays: plan.state.availableLearningDays,
                reservedLearningDays: plan.state.reservedLearningDays,
                lockedLearningDays: plan.state.lockedLearningDays,
                learningDayBuckets: plan.state.buckets,
              },
            },
            { session }
          );
          if (!updated.modifiedCount) {
            throw new Error("이용 주기 잔액이 변경되어 보정을 중단했습니다.");
          }
        }
        if (syncLatestFriendlyFeeBalance) {
          const latestFriendlyFee = plan.entries
            .filter(
              (entry) =>
                entry.eventType === "FRIENDLY_MATCH_FEE_BURN"
            )
            .at(-1);
          if (latestFriendlyFee) {
            await ArenaLearningDayLedger.updateOne(
              { _id: latestFriendlyFee._id },
              {
                $set: {
                  "balanceAfter.availableLearningDays":
                    plan.ledgerAvailableDays,
                },
              },
              { session }
            );
          }
        }

        // 첫날 차감은 한국 시간 자정으로 기록되므로, 실제 결제 시각보다
        // 앞선 것처럼 정렬될 수 있다. 이 보정은 잔액 필드·출처 묶음만
        // 바로잡고, 이미 확정된 장부 행의 당시 잔액 표시는 건드리지 않는다.
        // 장부의 변화량 자체는 처음부터 정확히 기록되어 있다.
      });
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify({ ok: true, repairedDays: plan.missingBurnDays }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});

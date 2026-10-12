const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  AdminActionLog,
  AdminTodo,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaMatch,
  ArenaMatchParticipantLock,
} = require("../models/goatArenaModel");
const {
  cancelArenaV2Match,
} = require("../services/arenaV2SettlementService");

const APPLY = process.argv.includes("--apply");

async function counts() {
  return {
    pendingAdminTodos: await AdminTodo.countDocuments({ status: "pending" }),
    completedAdminTodos: await AdminTodo.countDocuments({ status: "completed" }),
    heldOrSuspiciousMatches: await ArenaMatch.countDocuments({
      status: {
        $nin: ["SETTLED", "INVALID", "CANCELLED"],
      },
      $or: [{ status: "HELD" }, { integrityStatus: "SUSPICIOUS" }],
    }),
    openRiskCases: await ArenaIntegrityRiskCase.countDocuments({ status: "OPEN" }),
    riskProfiles: await ArenaIntegrityRiskProfile.countDocuments({}),
    integrityLinkSignals: await ArenaIntegrityLinkSignal.countDocuments({}),
    restrictedAccessStates: await ArenaAccessState.countDocuments({
      integrityStatus: { $ne: "CLEAR" },
    }),
    integrityActionLogs: await AdminActionLog.countDocuments({
      action: /^arena\.integrity\./,
    }),
  };
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 15000 });
  const before = await counts();
  if (!APPLY) {
    process.stdout.write(
      `${JSON.stringify({ mode: "DRY_RUN", before, policyCollectionsTouched: [] }, null, 2)}\n`
    );
    await mongoose.disconnect();
    return;
  }

  const heldMatches = await ArenaMatch.find({
    status: {
      $nin: ["SETTLED", "INVALID", "CANCELLED"],
    },
    $or: [{ status: "HELD" }, { integrityStatus: "SUSPICIOUS" }],
  })
    .select("_id")
    .lean();
  const cancelled = [];
  for (const match of heldMatches) {
    const result = await cancelArenaV2Match({
      matchId: match._id,
      reason: "ADMIN_OPERATIONAL_STATE_RESET",
    });
    if (result?.cancelled) cancelled.push(String(match._id));
  }

  const affectedAccessStates = await ArenaAccessState.find({
    integrityStatus: { $ne: "CLEAR" },
  })
    .select("_id")
    .lean();
  const affectedAccessIds = affectedAccessStates.map((entry) => entry._id);
  if (affectedAccessIds.length) {
    await ArenaAccessState.collection.updateMany(
      { _id: { $in: affectedAccessIds } },
      [
        {
          $set: {
            integrityStatus: "CLEAR",
            integrityCaseId: null,
            matchmakingRestrictedUntil: null,
            integrityPenaltyStartedAt: null,
            integrityPenaltyReason: "",
            reasonCode: "ADMIN_RESET",
            updatedAt: "$$NOW",
          },
        },
      ]
    );
  }

  await Promise.all([
    AdminTodo.deleteMany({}),
    AdminActionLog.deleteMany({ action: /^arena\.integrity\./ }),
    ArenaIntegrityRiskCase.deleteMany({}),
    ArenaIntegrityRiskProfile.deleteMany({}),
    ArenaIntegrityLinkSignal.deleteMany({}),
    ArenaMatchParticipantLock.deleteMany({ matchId: { $in: heldMatches.map((match) => match._id) } }),
  ]);

  const after = await counts();
  process.stdout.write(
    `${JSON.stringify({
      mode: "APPLIED",
      cancelledMatchIds: cancelled,
      before,
      after,
      policyCollectionsTouched: [],
    }, null, 2)}\n`
  );
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

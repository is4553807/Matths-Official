const mongoose = require("mongoose");

const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaMatch,
  ArenaStanding,
  MainFriendlyInvitation,
  MainInvitationRequest,
  MainShopPurchase,
} = require("../models/goatArenaModel");

async function run() {
  if (!String(process.env.DB || "").includes("matths_audit_zero_assumption_20260815")) {
    throw new Error("Arena 감사 상태 조회는 격리 감사 DB에서만 실행할 수 있습니다.");
  }

  await mongoose.connect(process.env.DB);
  try {
    const names = String(
      process.env.AUDIT_QUERY_USERS || "launchrankeda,launchrankedb"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const users = await User.find({ name: { $in: names } }).select("_id name").lean();
    const userIds = users.map((user) => user._id);
    const [standings, cycles, friendlyInvitations, officialInvitations, matches, purchases] =
      await Promise.all([
        ArenaStanding.find({ userId: { $in: userIds } })
          .select("userId division arenaRank rankPoint gp status")
          .lean(),
        AccessCycle.find({ userId: { $in: userIds } })
          .select(
            "userId status availableLearningDays reservedLearningDays lockedLearningDays paybackScoreDays"
          )
          .lean(),
        MainFriendlyInvitation.find({
          $or: [
            { inviterUserId: { $in: userIds } },
            { inviteeUserId: { $in: userIds } },
          ],
        })
          .select("requestId inviterUserId inviteeUserId status feeDays matchId createdAt respondedAt")
          .sort({ createdAt: 1 })
          .lean(),
        MainInvitationRequest.find({ initiatorUserId: { $in: userIds } })
          .select("requestId initiatorUserId targetTier stakeDays status matchId createdAt")
          .sort({ createdAt: 1 })
          .lean(),
        ArenaMatch.find({
          $or: [
            { "challenger.userId": { $in: userIds } },
            { "defender.userId": { $in: userIds } },
          ],
        })
          .select(
            "division matchType status targetTier challenger.userId challenger.stakeDays defender.userId defender.stakeDays createdAt settledAt"
          )
          .sort({ createdAt: 1 })
          .lean(),
        MainShopPurchase.find({ userId: { $in: userIds } })
          .select("userId itemCode gpCost status createdAt")
          .sort({ createdAt: 1 })
          .lean(),
      ]);

    const nameById = new Map(users.map((user) => [String(user._id), user.name]));
    const label = (value) => nameById.get(String(value || "")) || String(value || "");
    const relabel = (document, fields) => ({
      ...document,
      ...Object.fromEntries(fields.map((field) => [field, label(document[field])])),
    });

    console.log(
      JSON.stringify(
        {
          database: mongoose.connection.name,
          users,
          standings: standings.map((entry) => relabel(entry, ["userId"])),
          cycles: cycles.map((entry) => relabel(entry, ["userId"])),
          friendlyInvitations: friendlyInvitations.map((entry) =>
            relabel(entry, ["inviterUserId", "inviteeUserId"])
          ),
          officialInvitations: officialInvitations.map((entry) =>
            relabel(entry, ["initiatorUserId"])
          ),
          matches,
          purchases: purchases.map((entry) => relabel(entry, ["userId"])),
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

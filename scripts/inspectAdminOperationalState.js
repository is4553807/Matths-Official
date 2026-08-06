const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  AdminActionLog,
  AdminTodo,
  User,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
} = require("../models/goatArenaModel");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({
    $or: [
      { username: /^REMOVED_FROM_HISTORY$/i },
      { name: /^REMOVED_FROM_HISTORY$/i },
    ],
  })
    .select("_id username name email")
    .lean();
  const heldMatches = await ArenaMatch.find({
    status: { $nin: ["SETTLED", "INVALID", "CANCELLED", "INSURED_CANCELLED"] },
    $or: [{ status: "HELD" }, { integrityStatus: "SUSPICIOUS" }],
  })
    .select(
      "_id division status integrityStatus challenger.userId defender.userId economySnapshot createdAt"
    )
    .lean();
  const heldMatchIds = heldMatches.map((match) => match._id);
  const [attempts, evidence, locks, todoGroups, actionCount] = await Promise.all([
    ArenaMatchAttempt.find({ matchId: { $in: heldMatchIds } })
      .select("matchId userId role status currentQuestionIndex evidenceDeadlineAt")
      .lean(),
    ArenaMatchEvidence.find({ matchId: { $in: heldMatchIds } })
      .select("matchId attemptId userId status anomalyFlags")
      .lean(),
    ArenaMatchParticipantLock.find({ matchId: { $in: heldMatchIds } })
      .select("matchId userId")
      .lean(),
    AdminTodo.aggregate([
      {
        $group: {
          _id: {
            status: "$status",
            category: "$category",
            sourceType: "$sourceType",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    AdminActionLog.countDocuments({ action: /^arena\.integrity\./ }),
  ]);
  const participantUserIds = [
    ...new Set(
      heldMatches
        .flatMap((match) => [match.challenger?.userId, match.defender?.userId])
        .filter(Boolean)
        .map(String)
    ),
  ];
  const participantUsers = participantUserIds.length
    ? await User.find({ _id: { $in: participantUserIds } })
        .select("_id username name email role remark")
        .lean()
    : [];
  const participantUserById = new Map(
    participantUsers.map((entry) => [String(entry._id), entry])
  );

  const summary = {
    targetUser: user
      ? {
          id: String(user._id),
          username: user.username || user.name,
          email: user.email,
        }
      : null,
    heldMatches: heldMatches.map((match) => ({
      id: String(match._id),
      division: match.division,
      status: match.status,
      integrityStatus: match.integrityStatus,
      challengerUserId: String(match.challenger?.userId || ""),
      defenderUserId: String(match.defender?.userId || ""),
      challengerUser: participantUserById.get(String(match.challenger?.userId || "")) || null,
      defenderUser: participantUserById.get(String(match.defender?.userId || "")) || null,
      challengerStake: Number(match.economySnapshot?.challengerStakeDays || 0),
      defenderStake: Number(match.economySnapshot?.defenderStakeDays || 0),
      attempts: attempts
        .filter((attempt) => String(attempt.matchId) === String(match._id))
        .map((attempt) => ({
          role: attempt.role,
          status: attempt.status,
          currentQuestionIndex: attempt.currentQuestionIndex,
          evidenceDeadlineAt: attempt.evidenceDeadlineAt,
          evidence: evidence.some(
            (entry) => String(entry.attemptId) === String(attempt._id)
          ),
        })),
      lockCount: locks.filter(
        (lock) => String(lock.matchId) === String(match._id)
      ).length,
    })),
    adminTodos: todoGroups,
    arenaIntegrityActionCount: actionCount,
    openRiskCaseCount: await ArenaIntegrityRiskCase.countDocuments({ status: "OPEN" }),
    riskProfileCount: await ArenaIntegrityRiskProfile.countDocuments({}),
    integritySignalCount: await ArenaIntegrityLinkSignal.countDocuments({}),
    restrictedAccessCount: await ArenaAccessState.countDocuments({
      integrityStatus: { $ne: "CLEAR" },
    }),
    targetUserCurrentMatchCount: user
      ? await ArenaMatch.countDocuments({
          status: {
            $nin: ["SETTLED", "INVALID", "CANCELLED", "INSURED_CANCELLED"],
          },
          $or: [
            { "challenger.userId": user._id },
            { "defender.userId": user._id },
          ],
        })
      : 0,
    targetUserParticipantLockCount: user
      ? await ArenaMatchParticipantLock.countDocuments({ userId: user._id })
      : 0,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

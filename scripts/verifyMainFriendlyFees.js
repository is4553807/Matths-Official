const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  MainFriendlyInvitation,
} = require("../models/goatArenaModel");

function id(value) {
  return value ? String(value) : "";
}

async function userLabel(userId) {
  const user = await User.findById(userId).select("name username").lean();
  return {
    id: id(userId),
    nickname: user?.name || user?.username || "(삭제된 사용자)",
  };
}

async function participantSummary(userId) {
  const [user, accessState, feeRows, ledgerRows] = await Promise.all([
    userLabel(userId),
    ArenaAccessState.findOne({ userId })
      .select("accessCycleId currentCompetitiveDivision state")
      .lean(),
    ArenaLearningDayLedger.find({
      userId,
      eventType: "FRIENDLY_MATCH_FEE_BURN",
    })
      .sort({ occurredAt: -1 })
      .limit(10)
      .select("sourceId availableLearningDaysDelta occurredAt metadata")
      .lean(),
    ArenaLearningDayLedger.find({ userId })
      .sort({ occurredAt: -1 })
      .limit(12)
      .select("accessCycleId eventType availableLearningDaysDelta balanceAfter occurredAt sourceId")
      .lean(),
  ]);
  const cycle = accessState?.accessCycleId
    ? await AccessCycle.findById(accessState.accessCycleId)
        .select("availableLearningDays reservedLearningDays lockedLearningDays learningDayBuckets updatedAt")
        .lean()
    : null;
  return {
    ...user,
    linkedAccessCycleId: id(accessState?.accessCycleId),
    accessState: accessState
      ? {
          division: accessState.currentCompetitiveDivision,
          state: accessState.state,
        }
      : null,
    cycle: cycle
      ? {
          availableLearningDays: Number(cycle.availableLearningDays || 0),
          reservedLearningDays: Number(cycle.reservedLearningDays || 0),
          lockedLearningDays: Number(cycle.lockedLearningDays || 0),
          updatedAt: cycle.updatedAt,
        }
      : null,
    recentFriendlyFeeRows: feeRows.map((row) => ({
      invitationId: id(row.sourceId),
      delta: Number(row.availableLearningDaysDelta || 0),
      occurredAt: row.occurredAt,
      feeDays: Number(row.metadata?.feeDays || 0),
    })),
    recentLedgerRows: ledgerRows.map((row) => ({
      accessCycleId: id(row.accessCycleId),
      eventType: row.eventType,
      delta: Number(row.availableLearningDaysDelta || 0),
      balanceAfter: Number(row.balanceAfter?.availableLearningDays ?? 0),
      occurredAt: row.occurredAt,
    })),
  };
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const invitations = await MainFriendlyInvitation.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const reports = [];
    for (const invitation of invitations) {
      const [inviter, invitee, match, feeRows] = await Promise.all([
        participantSummary(invitation.inviterUserId),
        participantSummary(invitation.inviteeUserId),
        invitation.matchId
          ? ArenaMatch.findById(invitation.matchId)
              .select("_id status matchType requestedAt readyAt")
              .lean()
          : null,
        ArenaLearningDayLedger.find({
          sourceId: invitation._id,
          eventType: "FRIENDLY_MATCH_FEE_BURN",
        })
          .select("userId availableLearningDaysDelta occurredAt")
          .lean(),
      ]);
      reports.push({
        invitationId: id(invitation._id),
        status: invitation.status,
        feeDays: Number(invitation.feeDays || 0),
        createdAt: invitation.createdAt,
        respondedAt: invitation.respondedAt || null,
        match: match
          ? { id: id(match._id), status: match.status, type: match.matchType }
          : null,
        feeLedgerCount: feeRows.length,
        feeLedgerTotal: feeRows.reduce(
          (sum, row) => sum + Number(row.availableLearningDaysDelta || 0),
          0
        ),
        inviter,
        invitee,
      });
    }
    console.log(JSON.stringify({ ok: true, invitations: reports }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});

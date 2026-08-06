const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaOutboxEvent,
} = require("../models/goatArenaModel");

const AUTOMATIC_DEFENSE_NO_SHOW_LIMIT = 5;
const AUTOMATIC_DEFENSE_MATCH_ORIGINS = Object.freeze([
  "SUB_UPWARD_AUTO_MATCH",
  "MAIN_UPWARD_AUTO_MATCH",
]);
const AUTO_DEFENSE_SUSPENSION_REASON = "AUTO_DEFENSE_NO_SHOW_LIMIT";

function queryWithSession(query, session) {
  return session ? query.session(session) : query;
}

function isAutomaticDefenseMatch(match) {
  return (
    match?.matchType === "NORMAL" &&
    AUTOMATIC_DEFENSE_MATCH_ORIGINS.includes(String(match?.matchOrigin || ""))
  );
}

async function reactivateAutomaticDefenseAfterAttack({
  userId,
  now = new Date(),
  session = null,
}) {
  if (!mongoose.isValidObjectId(userId)) return { reactivated: false };
  const state = await queryWithSession(
    ArenaAccessState.findOne({
      userId,
      state: "PAID_ACTIVE",
      currentSeasonPlacementCompleted: true,
      integrityStatus: { $in: ["CLEAR", null] },
      automaticDefenseNoShowCount: { $gt: 0 },
      $or: [
        { defensePoolEligible: true },
        { reasonCode: AUTO_DEFENSE_SUSPENSION_REASON },
      ],
    }),
    session
  );
  if (!state) return { reactivated: false };

  state.automaticDefenseNoShowCount = 0;
  state.automaticDefenseSuspendedAt = null;
  state.defensePoolEligible = true;
  if (state.reasonCode === AUTO_DEFENSE_SUSPENSION_REASON) {
    state.reasonCode = "";
  }
  state.updatedAt = now;
  await state.save({ session: session || undefined });
  return { reactivated: true };
}

async function recordAutomaticDefenseNoShow({
  matchId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId)) return { recorded: false };
  const session = await mongoose.startSession();
  let result = { recorded: false };
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findOne({
        _id: matchId,
        status: "SETTLED",
        matchType: "NORMAL",
        matchOrigin: { $in: AUTOMATIC_DEFENSE_MATCH_ORIGINS },
        automaticDefenseNoShowRecordedAt: null,
        "resultSnapshot.settlementSummary.automaticReason":
          "START_DEADLINE_NO_SHOW",
      }).session(session);
      if (!match || !isAutomaticDefenseMatch(match)) return;

      const defenderAttempt = await ArenaMatchAttempt.findOne({
        matchId: match._id,
        role: "DEFENDER",
        status: "READY",
      })
        .select("_id")
        .session(session)
        .lean();
      if (!defenderAttempt) return;

      const accessState = await ArenaAccessState.findOne({
        userId: match.defender.userId,
        state: "PAID_ACTIVE",
        currentSeasonPlacementCompleted: true,
      }).session(session);
      if (!accessState) return;

      const nextCount = Number(accessState.automaticDefenseNoShowCount || 0) + 1;
      const suspended = nextCount >= AUTOMATIC_DEFENSE_NO_SHOW_LIMIT;
      const newlySuspended = suspended && !(
        accessState.reasonCode === AUTO_DEFENSE_SUSPENSION_REASON &&
        accessState.defensePoolEligible === false
      );
      accessState.automaticDefenseNoShowCount = nextCount;
      if (newlySuspended) {
        accessState.automaticDefenseSuspendedAt =
          accessState.automaticDefenseSuspendedAt || now;
        accessState.defensePoolEligible = false;
        accessState.reasonCode = AUTO_DEFENSE_SUSPENSION_REASON;
      }
      await accessState.save({ session });

      match.noShowRole = "DEFENDER";
      match.automaticDefenseNoShowRecordedAt = now;
      await match.save({ session });

      if (newlySuspended) {
        await ArenaOutboxEvent.create(
          [
            {
              eventType: "ArenaAutomaticDefenseSuspended",
              aggregateType: "ArenaAccessState",
              aggregateId: accessState._id,
              idempotencyKey: `${match._id}:ArenaAutomaticDefenseSuspended`,
              payload: {
                userId: match.defender.userId,
                matchId: match._id,
                noShowCount: nextCount,
                reactivationAction: "COMPLETE_ATTACK_REQUEST",
              },
            },
          ],
          { session, ordered: true }
        );
      }
      result = {
        recorded: true,
        suspended,
        newlySuspended,
        noShowCount: nextCount,
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function reconcileAutomaticDefenseNoShows({
  now = new Date(),
  limit = 100,
} = {}) {
  const matches = await ArenaMatch.find({
    status: "SETTLED",
    matchType: "NORMAL",
    matchOrigin: { $in: AUTOMATIC_DEFENSE_MATCH_ORIGINS },
    automaticDefenseNoShowRecordedAt: null,
    "resultSnapshot.settlementSummary.automaticReason":
      "START_DEADLINE_NO_SHOW",
  })
    .select("_id")
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let recorded = 0;
  for (const match of matches) {
    const result = await recordAutomaticDefenseNoShow({ matchId: match._id, now });
    if (result.recorded) recorded += 1;
  }
  return { scanned: matches.length, recorded };
}

module.exports = {
  AUTOMATIC_DEFENSE_MATCH_ORIGINS,
  AUTOMATIC_DEFENSE_NO_SHOW_LIMIT,
  AUTO_DEFENSE_SUSPENSION_REASON,
  isAutomaticDefenseMatch,
  reactivateAutomaticDefenseAfterAttack,
  reconcileAutomaticDefenseNoShows,
  recordAutomaticDefenseNoShow,
};

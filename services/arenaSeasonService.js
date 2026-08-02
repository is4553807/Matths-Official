const mongoose = require("mongoose");
const { RankingProfile } = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaOutboxEvent,
  ArenaStanding,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const { awardMainSeasonBadge } = require("./arenaBadgeService");

const SOFT_RESET_CENTER = 1500;
const SOFT_RESET_RETENTION = 0.6;

function kstDateParts(now = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(now))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function softResetMmr(previousMmr) {
  return Math.max(
    0,
    Math.round(
      SOFT_RESET_CENTER +
        SOFT_RESET_RETENTION * (Number(previousMmr || 0) - SOFT_RESET_CENTER)
    )
  );
}

async function openAnnualArenaSeason({ now = new Date(), force = false } = {}) {
  const parts = kstDateParts(now);
  if (!force && !(parts.month === 1 && parts.day === 1)) {
    return { opened: false, reason: "NOT_SEASON_OPEN_DATE", processed: 0 };
  }
  const currentSeason = String(parts.year);
  const previousSeason = String(parts.year - 1);
  const [profiles, activeAccessStates] = await Promise.all([
    LiveFinalRankingProfile.find({ seasonId: previousSeason })
      .sort({ finalRank: 1 })
      .lean(),
    ArenaAccessState.find({
      state: "PAID_ACTIVE",
      currentCompetitiveDivision: { $in: ["SUB", "MAIN"] },
    }).lean(),
  ]);
  const profileByUserId = new Map(
    profiles.map((profile) => [String(profile.userId), profile])
  );
  let processed = 0;
  for (const accessState of activeAccessStates) {
    const userId = accessState.userId;
    const profile = profileByUserId.get(String(userId)) || null;
    const markerKey = `arena-season:${currentSeason}:${userId}:opened`;
    if (await ArenaOutboxEvent.exists({ idempotencyKey: markerKey })) continue;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (await ArenaOutboxEvent.exists({ idempotencyKey: markerKey }).session(session)) return;
        const rankingProfile = await RankingProfile.findOne({ userId }).session(session);
        if (rankingProfile) {
          const previousMmr = Number(rankingProfile.mmr || 0);
          const newMmr = softResetMmr(previousMmr);
          rankingProfile.mmr = newMmr;
          rankingProfile.seasonId = currentSeason;
          rankingProfile.status = "PROVISIONAL";
          rankingProfile.reachedCurrentMmrAt = now;
          rankingProfile.mmrHistory.push({
            eventType: "season-reset",
            previousMmr,
            newMmr,
            deltaMmr: newMmr - previousMmr,
            createdAt: now,
          });
          await rankingProfile.save({ session });
        }
        await ArenaAccessState.updateOne(
          { userId, state: "PAID_ACTIVE" },
          {
            $set: {
              state: "SEASON_PLACEMENT_REQUIRED",
              currentSeasonPlacementCompleted: false,
              defensePoolEligible: false,
              weeklyMockEligible: false,
              finalRankingActive: false,
              reasonCode: "ANNUAL_SEASON_PLACEMENT_REQUIRED",
            },
          },
          { session, ordered: true }
        );
        await ArenaStanding.updateMany(
          { userId, seasonKey: previousSeason, status: { $ne: "ARCHIVED" } },
          { $set: { status: "ARCHIVED" } },
          { session }
        );
        if (profile) {
          await LiveFinalRankingProfile.updateOne(
            { _id: profile._id },
            { $set: { status: "INACTIVE_PLACEMENT_REQUIRED" } },
            { session }
          );
        }
        if (accessState.currentCompetitiveDivision === "MAIN") {
          await awardMainSeasonBadge({
            userId,
            seasonKey: previousSeason,
            badgeCode: `MAIN-${previousSeason}-FINAL-${profile?.finalRank || "PARTICIPANT"}`,
            displayName: `${previousSeason} Main Division 시즌 배지`,
            description: `시즌 최종 종합 랭킹 ${profile?.finalRank || "참가"} 기록`,
            metadata: {
              finalRank: profile?.finalRank || null,
              finalRating: profile?.finalRating || null,
            },
            awardedAt: now,
            session,
          });
        }
        await ArenaOutboxEvent.create(
          [
            ...(profile ? [{
              eventType: "ArenaSeasonArchived",
              aggregateType: "LiveFinalRankingProfile",
              aggregateId: profile._id,
              idempotencyKey: `arena-season:${previousSeason}:${userId}:archived`,
              payload: { userId, seasonId: previousSeason },
            }] : []),
            {
              eventType: "ArenaSeasonOpened",
              aggregateType: "ArenaAccessState",
              aggregateId: userId,
              idempotencyKey: markerKey,
              payload: {
                userId,
                seasonId: currentSeason,
                previousSeasonId: previousSeason,
                placementRequired: true,
              },
            },
          ],
          { session, ordered: true }
        );
        processed += 1;
      });
    } finally {
      await session.endSession();
    }
  }
  return { opened: true, seasonId: currentSeason, previousSeasonId: previousSeason, processed };
}

module.exports = {
  SOFT_RESET_CENTER,
  SOFT_RESET_RETENTION,
  openAnnualArenaSeason,
  softResetMmr,
  _testing: { kstDateParts },
};

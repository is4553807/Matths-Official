const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { RankingProfile } = require("../models/matthsModel");
const { SchedulerLease } = require("../models/operationModel");
const {
  ArenaAccessState,
  ArenaOutboxEvent,
  ArenaStanding,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const { awardMainSeasonBadge } = require("./arenaBadgeService");

const SOFT_RESET_CENTER = 1500;
const SOFT_RESET_RETENTION = 0.6;
const SEASON_LEASE_MS = 30 * 60 * 1000;

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

async function acquireSeasonLease({ seasonId, now }) {
  const name = `ARENA_SEASON_OPEN:${seasonId}`;
  const token = randomUUID();
  const expiresAt = new Date(new Date(now).getTime() + SEASON_LEASE_MS);
  const updated = await SchedulerLease.findOneAndUpdate(
    { name, expiresAt: { $lte: now } },
    { $set: { token, expiresAt } },
    { returnDocument: "after" }
  ).lean();
  if (updated) return { name, token };
  try {
    await SchedulerLease.create({ name, token, expiresAt });
    return { name, token };
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function releaseSeasonLease({ lease, now, result }) {
  if (!lease) return;
  await SchedulerLease.updateOne(
    { name: lease.name, token: lease.token },
    {
      $set: {
        expiresAt: now,
        lastCompletedAt: now,
        lastResult: result,
      },
    }
  );
}

async function openAnnualArenaSeason({ now = new Date() } = {}) {
  const parts = kstDateParts(now);
  const currentSeason = String(parts.year);
  const previousSeason = String(parts.year - 1);
  const lease = await acquireSeasonLease({ seasonId: currentSeason, now });
  if (!lease) {
    return { opened: false, reason: "SEASON_OPEN_RUNNING_ON_ANOTHER_SERVER", processed: 0 };
  }
  let result = null;
  try {
    const [profiles, activeAccessStates] = await Promise.all([
    LiveFinalRankingProfile.find({ seasonId: previousSeason })
      .sort({ finalRank: 1 })
      .lean(),
    ArenaAccessState.find({
      state: "PAID_ACTIVE",
      currentCompetitiveDivision: { $in: ["SUB", "MAIN"] },
    })
      .populate("standingId", "seasonKey")
      .lean(),
    ]);
    const profileByUserId = new Map(
      profiles.map((profile) => [String(profile.userId), profile])
    );
    let processed = 0;
    for (const accessState of activeAccessStates) {
      if (String(accessState.standingId?.seasonKey || "") !== previousSeason) {
        continue;
      }
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
    result = { opened: true, seasonId: currentSeason, previousSeasonId: previousSeason, processed };
    return result;
  } finally {
    await releaseSeasonLease({
      lease,
      now: new Date(),
      result: result || { opened: false, reason: "SEASON_OPEN_FAILED" },
    });
  }
}

module.exports = {
  SOFT_RESET_CENTER,
  SOFT_RESET_RETENTION,
  openAnnualArenaSeason,
  softResetMmr,
  _testing: { kstDateParts, SEASON_LEASE_MS },
};

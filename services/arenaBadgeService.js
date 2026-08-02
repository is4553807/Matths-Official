const {
  ArenaAchievementBadge,
} = require("../models/goatArenaModel");

async function awardMainSeasonBadge({
  userId,
  seasonKey,
  badgeCode,
  displayName,
  description = "",
  metadata = {},
  awardedAt = new Date(),
  session = null,
}) {
  return ArenaAchievementBadge.findOneAndUpdate(
    { userId, badgeCode, seasonKey },
    {
      $setOnInsert: {
        userId,
        seasonKey,
        badgeCode,
        displayName,
        description,
        sourceType: "MAIN_SEASON_REWARD",
        awardedAt,
        metadata,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      session,
    }
  );
}

async function getUserArenaBadges(userId) {
  return ArenaAchievementBadge.find({
    userId,
    revokedAt: null,
  })
    .sort({ seasonKey: -1, awardedAt: -1 })
    .lean();
}

module.exports = {
  awardMainSeasonBadge,
  getUserArenaBadges,
};

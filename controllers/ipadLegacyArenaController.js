const {
  RankingProfile,
} = require("../models/matthsModel");
const {
  TIER_CONFIG,
  rankingProfileView,
} = require("../services/mmrService");
const {
  getRankingData,
} = require("../services/rankingService");
const {
  getRankingDisplayName,
} = require("../services/userIdentityService");

function tierForEntry(entry) {
  const value = String(entry?.tier || "");
  return (
    TIER_CONFIG.find(
      (tier) => tier.name === value || tier.label === value
    ) || null
  );
}

function arenaRow(entry, currentUserId) {
  if (!entry) return null;
  const tier = tierForEntry(entry);
  const division = Number(entry.division);
  return {
    userId: String(entry.userId),
    name: String(entry.displayName || "학생"),
    rank: Number(entry.overallRank ?? entry.rank) || 0,
    mmr: Number(entry.rating) || 0,
    rating: Number(entry.rating) || 0,
    tier: tier?.name || null,
    tierLabel: tier?.label || String(entry.tier || "") || null,
    rankPoint: Number(entry.rankPoint) || 0,
    division:
      Number.isInteger(division) && division >= 1 && division <= 4
        ? division
        : null,
    status: String(entry.rankingStatus || "PROVISIONAL").toUpperCase(),
    isMe: String(entry.userId) === String(currentUserId),
  };
}

exports.getArena = async (req, res, next) => {
  try {
    const user = req.apiUser;
    const profile = await RankingProfile.findOne({
      userId: user._id,
      datasetOnly: { $ne: true },
    }).lean();
    const view = rankingProfileView(profile);

    return res.json({
      arena: view
        ? { locked: false, ...view }
        : {
            locked: true,
            mmr: null,
            rating: null,
            tier: null,
            tierLabel: null,
            rankPoint: 0,
            division: null,
            status: "PROVISIONAL",
            weeklyExamsUntilConfirmed: null,
            overallRank: null,
            percentile: null,
            recentPerformances: [],
          },
      ladder: TIER_CONFIG.map((tier) => ({
        name: tier.name,
        label: tier.label,
        minMmr: tier.minMmr,
        maxMmr: Number.isFinite(tier.maxMmr) ? tier.maxMmr : null,
        minRating: tier.minMmr,
        maxRating: Number.isFinite(tier.maxMmr) ? tier.maxMmr : null,
        maxTopPercentile: tier.maxTopPercentile ?? null,
      })),
      identity: {
        displayName: getRankingDisplayName(user),
        schoolName: String(user.school?.name || "학교 미설정"),
        displayMode: "닉네임",
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getArenaLeaderboard = async (req, res, next) => {
  try {
    const currentUserId = req.apiUser._id;
    const rankingData = await getRankingData(currentUserId);
    const top = (rankingData?.overall || [])
      .slice(0, 20)
      .map((entry) => arenaRow(entry, currentUserId));
    return res.json({
      total: Number(rankingData?.cohortSize) || 0,
      top,
      me: arenaRow(rankingData?.current, currentUserId),
    });
  } catch (error) {
    return next(error);
  }
};

exports._testing = {
  arenaRow,
};

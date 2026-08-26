const {
  ArenaAccessState,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  getRankingDisplayName,
} = require("./userIdentityService");

function emptyArenaLandingSpotlight() {
  return {
    available: false,
    seasonLabel: null,
    activeCount: null,
    topEntries: [],
    currentEntry: null,
  };
}

async function getArenaLandingSpotlight(user) {
  const userId = user?._id || user?.id || null;
  if (!userId) return emptyArenaLandingSpotlight();

  const accessState = await ArenaAccessState.findOne({ userId })
    .select("currentCompetitiveDivision")
    .lean();
  const division = String(
    accessState?.currentCompetitiveDivision || ""
  ).toUpperCase();
  if (!["SUB", "MAIN"].includes(division)) {
    return emptyArenaLandingSpotlight();
  }

  const standing = await ArenaStanding.findOne({
    userId,
    division,
    status: "ACTIVE",
  })
    .sort({ updatedAt: -1 })
    .select("division seasonKey arenaRank arenaPosition arenaGp")
    .lean();
  if (!standing?.arenaRank) {
    return emptyArenaLandingSpotlight();
  }

  return {
    available: true,
    seasonLabel: standing.seasonKey || null,
    activeCount: null,
    topEntries: [],
    currentEntry: {
      displayName: getRankingDisplayName(user),
      division,
      divisionLabel: division === "MAIN" ? "Ranked" : "Unranked",
      tierLabel: standing.arenaRank,
      tierPosition: Number.isSafeInteger(standing.arenaPosition)
        ? standing.arenaPosition
        : null,
      rankPoint: Number.isFinite(standing.arenaGp)
        ? standing.arenaGp
        : null,
    },
  };
}

module.exports = {
  emptyArenaLandingSpotlight,
  getArenaLandingSpotlight,
};

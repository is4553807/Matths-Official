"use strict";

const { User } = require("../models/matthsModel");
const { ArenaCompetitiveProfile } = require("../models/goatArenaModel");
const { getRankingDisplayName } = require("./userIdentityService");
const { resolveArenaProfileAvatar } = require("./arenaProfileAvatarService");

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ranked(entries = []) {
  const sorted = [...entries].sort((left, right) =>
    numberValue(right.finalRating ?? right.rating) - numberValue(left.finalRating ?? left.rating) ||
    new Date(left.lastScoreChangedAt || left.updatedAt || 0) - new Date(right.lastScoreChangedAt || right.updatedAt || 0) ||
    String(left.userId || "").localeCompare(String(right.userId || ""))
  );
  let previousScore = null;
  let previousRank = 0;
  return sorted.map((entry, index) => {
    const score = numberValue(entry.finalRating ?? entry.rating);
    if (previousScore === null || score !== previousScore) previousRank = index + 1;
    previousScore = score;
    return { ...entry, rank: previousRank, finalRank: previousRank };
  });
}

function affiliationName(user) {
  const grade = Number(user?.schoolGrade);
  if (grade === 14) return String(user?.university?.name || "대학교 미설정");
  if (grade === 15) return "직장인";
  if (grade === 13) return "N수생";
  return String(user?.school?.name || "고등학교 미설정");
}

function aggregateRankings(entries = [], keyForEntry, detailsForEntry = () => ({})) {
  const groups = new Map();
  for (const entry of entries) {
    const key = String(keyForEntry(entry) || "");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { id: key, students: [], ...detailsForEntry(entry) });
    groups.get(key).students.push(entry);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      students: [...group.students].sort((a, b) => a.finalRank - b.finalRank),
      participantCount: group.students.length,
      averageFinalRank: Math.round(
        (group.students.reduce((sum, entry) => sum + entry.finalRank, 0) / group.students.length) * 10
      ) / 10,
      averageCompetitiveScore: Math.round(
        (group.students.reduce((sum, entry) => sum + entry.finalRating, 0) / group.students.length) * 10
      ) / 10,
    }))
    .sort((left, right) =>
      right.averageCompetitiveScore - left.averageCompetitiveScore ||
      left.averageFinalRank - right.averageFinalRank ||
      String(left.name || left.id).localeCompare(String(right.name || right.id), "ko-KR")
    )
    .map((group, index) => ({ ...group, rank: index + 1 }));
}

function buildSchoolAndRetakerRankings(finalEntries = []) {
  const schools = aggregateRankings(
    finalEntries.filter((entry) =>
      ![13, 14, 15].includes(entry.grade) && entry.educationStatus !== "graduated"
    ),
    (entry) => entry.schoolCode || entry.schoolName,
    (entry) => ({ name: entry.schoolName || "고등학교 미설정", region: entry.region || "" })
  );
  const universities = aggregateRankings(
    finalEntries.filter((entry) => entry.grade === 14),
    (entry) => entry.universityCode || entry.universityName,
    (entry) => ({
      name: entry.universityName || "대학교 미설정",
      campus: entry.universityCampus || "",
      region: entry.universityRegion || "",
    })
  );
  const retakers = finalEntries
    .filter((entry) => entry.grade === 13)
    .map((entry, index) => ({ ...entry, retakerRank: index + 1 }));
  const workers = finalEntries
    .filter((entry) => entry.grade === 15)
    .map((entry, index) => ({ ...entry, workerRank: index + 1 }));
  return { schools, universities, retakers, workers };
}

function buildTierRankingPool(entries = [], currentUserId, options = {}) {
  const byTier = new Map();
  for (const entry of entries) {
    const tier = String(entry.arenaRank || entry.tier || "UNPLACED");
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(entry);
  }
  for (const values of byTier.values()) {
    values.sort((left, right) =>
      numberValue(right.arenaGp ?? right.finalRating ?? right.rating) -
      numberValue(left.arenaGp ?? left.finalRating ?? left.rating)
    );
    values.forEach((entry, index) => {
      entry.tier = entry.tier || entry.arenaRank;
      entry.tierRank = index + 1;
    });
  }
  const current = entries.find((entry) => entry.userId === String(currentUserId)) || null;
  return {
    key: options.key || "MAIN",
    label: options.label || "경쟁전",
    dataState: entries.length ? "competitive-score" : "awaiting-placement",
    cohortSize: entries.length,
    entries,
    current,
    tiers: [...byTier.entries()].map(([tier, values]) => ({ tier, entries: values })),
    tierBoards: [...byTier.entries()].map(([tier, values]) => ({
      tier,
      tierKey: tier.toLowerCase(),
      memberCount: values.length,
      entries: values,
    })),
    defaultTierKey: String(current?.arenaRank || current?.tier || "").toLowerCase(),
  };
}

async function getRankingData(currentUserId) {
  const profiles = await ArenaCompetitiveProfile.find({
    placementFinalizedAt: { $ne: null },
    competitiveScore: { $ne: null },
  })
    .select("userId competitiveScore tier wins losses draws lastScoreChangedAt updatedAt")
    .lean();
  const users = await User.find({
    _id: { $in: profiles.map((profile) => profile.userId) },
    isActive: true,
    accountStatus: "active",
  })
    .select("name username realName school university schoolGrade educationStatus accountStatus warningCount preferences")
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const entries = profiles.map((profile) => {
    const user = userById.get(String(profile.userId));
    if (!user) return null;
    const score = Math.round(numberValue(profile.competitiveScore));
    return {
      userId: String(user._id),
      profileAvatar: resolveArenaProfileAvatar(user.preferences),
      displayName: getRankingDisplayName(user),
      schoolCode: String(user.school?.code || ""),
      schoolName: String(user.school?.name || ""),
      region: String(user.school?.region || ""),
      universityCode: String(user.university?.code || ""),
      universityName: String(user.university?.name || ""),
      universityCampus: String(user.university?.campus || ""),
      universityRegion: String(user.university?.region || ""),
      affiliationName: affiliationName(user),
      grade: numberValue(user.schoolGrade),
      educationStatus: String(user.educationStatus || "enrolled"),
      finalRating: score,
      rating: score,
      gp: score,
      arenaGp: score,
      tier: String(profile.tier || "UNPLACED"),
      arenaRank: String(profile.tier || "UNPLACED"),
      division: "MAIN",
      arenaDivision: "MAIN",
      wins: numberValue(profile.wins),
      losses: numberValue(profile.losses),
      draws: numberValue(profile.draws),
      lastScoreChangedAt: profile.lastScoreChangedAt || profile.updatedAt || null,
      updatedAt: profile.updatedAt || null,
      rankingDecoration: null,
      previousFinalRank: null,
      rankDelta: 0,
    };
  }).filter(Boolean);
  const finalOverall = ranked(entries).map((entry) => ({
    ...entry,
    arenaPosition: entry.finalRank,
    lastPublishedAt: entry.updatedAt,
  }));
  const groups = buildSchoolAndRetakerRankings(finalOverall);
  const mainPool = buildTierRankingPool(finalOverall, currentUserId, { key: "MAIN", label: "경쟁전" });
  const currentFinal = finalOverall.find((entry) => entry.userId === String(currentUserId)) || null;
  const sameSchool = currentFinal?.schoolCode
    ? finalOverall.filter((entry) => entry.schoolCode === currentFinal.schoolCode)
    : [];
  const schools = groups.schools;
  const cities = aggregateRankings(
    finalOverall.filter((entry) => entry.region),
    (entry) => entry.region,
    (entry) => ({ name: entry.region, region: entry.region })
  );
  const sameSchoolIndex = sameSchool.findIndex((entry) => entry.userId === String(currentUserId));
  const current = currentFinal ? {
    ...currentFinal,
    tierRank: mainPool.current?.tierRank || null,
    overallRank: currentFinal.finalRank,
    schoolStudentRank: sameSchoolIndex >= 0 ? sameSchoolIndex + 1 : null,
    schoolRank: schools.find((group) => group.id === currentFinal.schoolCode)?.rank || null,
    cityRank: cities.find((group) => group.id === currentFinal.region)?.rank || null,
  } : null;
  const latestCalculatedAt = profiles.reduce((latest, profile) =>
    new Date(profile.updatedAt || 0) > new Date(latest || 0) ? profile.updatedAt : latest,
  null);
  return {
    current,
    cohortSize: finalOverall.length,
    overall: finalOverall.slice(0, 100),
    sameSchool: sameSchool.slice(0, 100),
    schools: schools.slice(0, 100),
    cities: cities.slice(0, 100),
    finalOverall: finalOverall.slice(0, 100),
    latestPublishedAt: latestCalculatedAt,
    latestCalculatedAt,
    schoolRankings: groups.schools,
    universityRankings: groups.universities,
    retakerRankings: groups.retakers,
    workerRankings: groups.workers,
    currentFinal,
    pools: {
      sub: buildTierRankingPool([], currentUserId, { key: "SUB", label: "배치 전" }),
      main: mainPool,
    },
  };
}

module.exports = {
  getRankingData,
  _testing: {
    ranked,
    aggregateRankings,
    buildSchoolAndRetakerRankings,
    buildTierRankingPool,
  },
};

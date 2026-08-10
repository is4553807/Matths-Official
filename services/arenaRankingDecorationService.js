const {
  AdminActionLog,
  PrivateMockIntegrityCase,
} = require("../models/matthsModel");
const {
  ArenaIntegrityRiskCase,
  ArenaMatch,
} = require("../models/goatArenaModel");
const {
  normalizeTierCode,
  TIER_ORDER,
} = require("./arenaOneOnOneDifficultyPolicy");

const FAST_MATCH_MIN_MATCHES = 5;
const FAST_MATCH_PERCENTILE = 0.1;
// 5승 이상은 더 높은 우선순위의 "연승" 장식을 받으므로,
// 언더독 킬러가 실제로 배정될 수 있도록 상위 티어 상대 3승을 기준으로 삼는다.
const UNDERDOG_WIN_MINIMUM = 3;
const OFFICIAL_WIN_MINIMUM = 5;
const CHALLENGER_MATCH_MINIMUM = 100;

const PERMANENT_EXCLUSION_ACTIONS = Object.freeze([
  "community.post-warning",
  "community.comment-warning",
  "arena.integrity.match.challenger_cheating",
  "arena.integrity.match.defender_cheating",
  "arena.integrity.match.both_cheating",
]);

function id(value) {
  return String(value || "");
}

function numberValue(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function tierIndex(value) {
  return TIER_ORDER.indexOf(normalizeTierCode(value));
}

function participantFor(match, role) {
  return role === "CHALLENGER" ? match.challenger : match.defender;
}

function opponentFor(match, role) {
  return role === "CHALLENGER" ? match.defender : match.challenger;
}

function winnerUserId(match) {
  if (!match?.winnerRole) return "";
  return id(participantFor(match, match.winnerRole)?.userId);
}

function durationFor(match, role) {
  return numberValue(
    role === "CHALLENGER"
      ? match.resultSnapshot?.challenger?.totalSolveTimeMs
      : match.resultSnapshot?.defender?.totalSolveTimeMs,
    0
  );
}

function percentile(values, ratio) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  );
  return sorted[index];
}

function createStats(userId, division, arenaRank) {
  return {
    userId,
    division,
    arenaRank,
    matches: 0,
    wins: 0,
    totalSolveTimeMs: 0,
    timedMatches: 0,
    underdogWins: 0,
  };
}

function computeOfficialMatchStats({ arenaEntries = [], matches = [] }) {
  const statsByUserId = new Map();
  const activeByUserId = new Map(
    arenaEntries.map((entry) => [
      id(entry.userId),
      {
        division: String(entry.division || ""),
        arenaRank: normalizeTierCode(entry.arenaRank || entry.tier),
      },
    ])
  );

  for (const entry of arenaEntries) {
    const userId = id(entry.userId);
    statsByUserId.set(
      userId,
      createStats(
        userId,
        String(entry.division || ""),
        normalizeTierCode(entry.arenaRank || entry.tier)
      )
    );
  }

  for (const match of matches) {
    if (match.matchType === "FRIENDLY" || match.status !== "SETTLED") continue;
    for (const role of ["CHALLENGER", "DEFENDER"]) {
      const participant = participantFor(match, role);
      const userId = id(participant?.userId);
      const active = activeByUserId.get(userId);
      if (!active || active.division !== match.division) continue;

      const stats = statsByUserId.get(userId);
      stats.matches += 1;
      if (winnerUserId(match) === userId) {
        stats.wins += 1;
        const ownTier = tierIndex(participant?.tupleBefore?.arenaRank);
        const opponentTier = tierIndex(opponentFor(match, role)?.tupleBefore?.arenaRank);
        if (match.division === "MAIN" && ownTier >= 0 && opponentTier > ownTier) {
          stats.underdogWins += 1;
        }
      }

      const duration = durationFor(match, role);
      if (duration > 0) {
        stats.totalSolveTimeMs += duration;
        stats.timedMatches += 1;
      }
    }
  }

  for (const stats of statsByUserId.values()) {
    stats.winRate = stats.matches ? stats.wins / stats.matches : 0;
    stats.averageSolveTimeMs = stats.timedMatches
      ? stats.totalSolveTimeMs / stats.timedMatches
      : null;
  }
  return statsByUserId;
}

function crownWinners(arenaEntries = [], excludedUserIds = new Set()) {
  const winners = new Map();
  for (const division of ["SUB", "MAIN"]) {
    const winner = arenaEntries
      .filter(
        (entry) =>
          entry.division === division && !excludedUserIds.has(id(entry.userId))
      )
      .sort((left, right) => {
        const tierDifference =
          tierIndex(right.arenaRank || right.tier) -
          tierIndex(left.arenaRank || left.tier);
        if (tierDifference) return tierDifference;
        const positionDifference =
          numberValue(left.arenaPosition, Number.MAX_SAFE_INTEGER) -
          numberValue(right.arenaPosition, Number.MAX_SAFE_INTEGER);
        if (positionDifference) return positionDifference;
        const gpDifference = numberValue(right.arenaGp) - numberValue(left.arenaGp);
        if (gpDifference) return gpDifference;
        return id(left.userId).localeCompare(id(right.userId));
      })[0];
    if (winner) winners.set(division, id(winner.userId));
  }
  return winners;
}

function mvpWinners({
  arenaEntries = [],
  statsByUserId,
  excludedUserIds,
  higherPriorityUserIds = new Set(),
}) {
  const grouped = new Map();
  for (const entry of arenaEntries) {
    const userId = id(entry.userId);
    const stats = statsByUserId.get(userId);
    if (
      !stats?.matches ||
      excludedUserIds.has(userId) ||
      higherPriorityUserIds.has(userId)
    ) continue;
    const tier = normalizeTierCode(entry.arenaRank || entry.tier);
    if (!tier) continue;
    const key = `${entry.division}:${tier}`;
    const candidates = grouped.get(key) || [];
    candidates.push(stats);
    grouped.set(key, candidates);
  }

  const winners = new Set();
  for (const candidates of grouped.values()) {
    candidates.sort((left, right) => {
      if (right.winRate !== left.winRate) return right.winRate - left.winRate;
      if (right.wins !== left.wins) return right.wins - left.wins;
      if (right.matches !== left.matches) return right.matches - left.matches;
      const leftTime = left.averageSolveTimeMs ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.averageSolveTimeMs ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.userId.localeCompare(right.userId);
    });
    if (candidates[0]) winners.add(candidates[0].userId);
  }
  return winners;
}

function fastWinners(statsByUserId, excludedUserIds) {
  const thresholds = new Map();
  for (const division of ["SUB", "MAIN"]) {
    const durations = [...statsByUserId.values()]
      .filter(
        (stats) =>
          stats.division === division &&
          stats.timedMatches >= FAST_MATCH_MIN_MATCHES &&
          !excludedUserIds.has(stats.userId)
      )
      .map((stats) => stats.averageSolveTimeMs);
    thresholds.set(division, percentile(durations, FAST_MATCH_PERCENTILE));
  }
  return new Set(
    [...statsByUserId.values()]
      .filter((stats) => {
        const threshold = thresholds.get(stats.division);
        return (
          threshold !== null &&
          stats.timedMatches >= FAST_MATCH_MIN_MATCHES &&
          stats.averageSolveTimeMs <= threshold &&
          !excludedUserIds.has(stats.userId)
        );
      })
      .map((stats) => stats.userId)
  );
}

function assignDecorations({ arenaEntries, statsByUserId, excludedUserIds }) {
  const decorations = new Map();
  const crowns = crownWinners(arenaEntries, excludedUserIds);
  const crownUserIds = new Set(crowns.values());
  // 1위가 해당 티어 최고 승률까지 동시에 차지해도 한 사람에게 장식은
  // 하나만 보인다. MVP는 그 티어의 다음 적격자에게 넘겨 가능한 한
  // Division별 9개씩 유지한다.
  const mvps = mvpWinners({
    arenaEntries,
    statsByUserId,
    excludedUserIds,
    higherPriorityUserIds: crownUserIds,
  });
  const fast = fastWinners(statsByUserId, excludedUserIds);

  for (const entry of arenaEntries) {
    const userId = id(entry.userId);
    if (excludedUserIds.has(userId)) continue;
    const stats = statsByUserId.get(userId) || createStats(userId, entry.division, entry.arenaRank);
    let decoration = null;

    if (crowns.get(entry.division) === userId) {
      decoration = entry.division === "MAIN"
        ? {
            code: "RANKED_CROWN",
            priority: 1,
            icon: "♛",
            label: "RANKED 1위",
            tone: "gold",
            title: "Ranked Division 현재 1위",
          }
        : {
            code: "UNRANKED_CROWN",
            priority: 1,
            icon: "♕",
            label: "UNRANKED 1위",
            tone: "silver",
            title: "Unranked Division 현재 1위",
          };
    } else if (mvps.has(userId)) {
      decoration = {
        code: "TIER_MVP",
        priority: 2,
        icon: "★",
        label: "MVP",
        tone: "violet",
        title: "현재 Division·티어 최고 승률",
      };
    } else if (stats.wins >= OFFICIAL_WIN_MINIMUM) {
      decoration = {
        code: "WIN_STREAK",
        priority: 3,
        icon: "⚡",
        label: "연승",
        tone: "cyan",
        title: "공식 1대1 경기 5승 이상",
      };
    } else if (fast.has(userId)) {
      decoration = {
        code: "QUICK_FINISH",
        priority: 4,
        icon: "◷",
        label: "속전속결",
        tone: "blue",
        title: "평균 풀이 시간이 매우 짧은 이용자",
      };
    } else if (
      entry.division === "MAIN" &&
      stats.underdogWins >= UNDERDOG_WIN_MINIMUM
    ) {
      decoration = {
        code: "UNDERDOG_KILLER",
        priority: 5,
        icon: "◆",
        label: "언더독 킬러",
        tone: "red",
        title: "Ranked에서 상위 티어 상대에게 3승 이상",
      };
    } else if (stats.matches >= CHALLENGER_MATCH_MINIMUM) {
      decoration = {
        code: "CHALLENGER_100",
        priority: 6,
        icon: "⚔",
        label: "도전자",
        tone: "steel",
        title: "공식 1대1 경기 100회 이상",
      };
    }

    if (decoration) decorations.set(userId, decoration);
  }
  return decorations;
}

async function permanentlyExcludedUserIds({ userIds = [], currentWarningCounts = new Map() }) {
  const normalizedUserIds = [...new Set(userIds.map(id).filter(Boolean))];
  const excluded = new Set(
    normalizedUserIds.filter((userId) => numberValue(currentWarningCounts.get(userId)) > 0)
  );
  if (!normalizedUserIds.length) return excluded;

  const [actionLogs, confirmedArenaCases, privateMockWarnings] = await Promise.all([
    AdminActionLog.find({
      targetUserId: { $in: normalizedUserIds },
      action: { $in: [...PERMANENT_EXCLUSION_ACTIONS, "user.warning-count"] },
    })
      .select("targetUserId action metadata")
      .lean(),
    ArenaIntegrityRiskCase.find({
      userId: { $in: normalizedUserIds },
      status: "CONFIRMED",
    })
      .select("userId")
      .lean(),
    PrivateMockIntegrityCase.find({
      userId: { $in: normalizedUserIds },
      warningAppliedAt: { $ne: null },
    })
      .select("userId")
      .lean(),
  ]);

  for (const log of actionLogs) {
    if (
      log.action !== "user.warning-count" ||
      numberValue(log.metadata?.nextCount) > numberValue(log.metadata?.previousCount)
    ) {
      excluded.add(id(log.targetUserId));
    }
  }
  confirmedArenaCases.forEach((entry) => excluded.add(id(entry.userId)));
  privateMockWarnings.forEach((entry) => excluded.add(id(entry.userId)));
  return excluded;
}

async function buildArenaRankingDecorations({ arenaEntries = [], currentWarningCounts = new Map() }) {
  const userIds = [...new Set(arenaEntries.map((entry) => id(entry.userId)).filter(Boolean))];
  if (!userIds.length) return new Map();
  const [matches, excludedUserIds] = await Promise.all([
    ArenaMatch.find({
      status: "SETTLED",
      matchType: { $in: ["NORMAL", "REVENGE"] },
      $or: [
        { "challenger.userId": { $in: userIds } },
        { "defender.userId": { $in: userIds } },
      ],
    })
      .select(
        "division matchType status winnerRole challenger.userId challenger.tupleBefore defender.userId defender.tupleBefore resultSnapshot settledAt"
      )
      .sort({ settledAt: 1, _id: 1 })
      .lean(),
    permanentlyExcludedUserIds({ userIds, currentWarningCounts }),
  ]);
  const statsByUserId = computeOfficialMatchStats({ arenaEntries, matches });
  return assignDecorations({ arenaEntries, statsByUserId, excludedUserIds });
}

module.exports = {
  buildArenaRankingDecorations,
  _testing: {
    assignDecorations,
    computeOfficialMatchStats,
    crownWinners,
    mvpWinners,
    fastWinners,
    percentile,
  },
};

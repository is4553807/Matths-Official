const mongoose = require("mongoose");
const {
  ArenaMatch,
  ArenaMatchAttempt,
} = require("../models/goatArenaModel");
const { User } = require("../models/matthsModel");

const HISTORY_MATCH_STATUSES = Object.freeze([
  "SUBMITTED",
  "RESOLVED",
  "HELD",
  "INVALID",
  "SETTLED",
  "CANCELLED",
  "INSURED_CANCELLED",
]);
const HISTORY_PAGE_SIZE = 30;
const HISTORY_MAX_PAGE_SIZE = 60;
const HISTORY_USER_SEARCH_LIMIT = 200;

function id(value) {
  return String(value?._id || value || "");
}

function uniqueIds(values) {
  return [...new Set(values.map(id).filter(Boolean))];
}

function cleanSingleLine(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safePositiveInteger(value, fallback = 1) {
  return Math.max(1, Number.parseInt(value, 10) || fallback);
}

function safePageSize(value) {
  return Math.min(
    HISTORY_MAX_PAGE_SIZE,
    safePositiveInteger(value, HISTORY_PAGE_SIZE)
  );
}

function normalizeDateInput(value) {
  const normalized = cleanSingleLine(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function kstBoundary(dateKey, endOfDay = false) {
  if (!dateKey) return null;
  const suffix = endOfDay ? "T23:59:59.999+09:00" : "T00:00:00.000+09:00";
  const parsed = new Date(`${dateKey}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeHistoryFilters(input = {}) {
  const status = cleanSingleLine(input.status, 30).toUpperCase();
  const division = cleanSingleLine(input.division, 10).toUpperCase();
  const matchType = cleanSingleLine(input.matchType, 20).toUpperCase();
  const integrityStatus = cleanSingleLine(
    input.integrityStatus,
    20
  ).toUpperCase();
  const participantId = cleanSingleLine(input.participantId, 40);
  return {
    query: cleanSingleLine(input.query, 120),
    dateFrom: normalizeDateInput(input.dateFrom),
    dateTo: normalizeDateInput(input.dateTo),
    status: HISTORY_MATCH_STATUSES.includes(status) ? status : "",
    division: ["SUB", "MAIN"].includes(division) ? division : "",
    matchType: ["NORMAL", "REVENGE", "FRIENDLY"].includes(matchType)
      ? matchType
      : "",
    integrityStatus: [
      "PENDING",
      "CLEAR",
      "SUSPICIOUS",
      "CONFIRMED",
      "INVALID",
    ].includes(integrityStatus)
      ? integrityStatus
      : "",
    participantId: mongoose.isValidObjectId(participantId)
      ? participantId
      : "",
  };
}

function participantClause(userIds) {
  const normalizedIds = uniqueIds(userIds).filter((value) =>
    mongoose.isValidObjectId(value)
  );
  if (!normalizedIds.length) return null;
  return {
    $or: [
      { "challenger.userId": { $in: normalizedIds } },
      { "defender.userId": { $in: normalizedIds } },
    ],
  };
}

function buildHistoryMatchFilter(filters, matchingUserIds = []) {
  const clauses = [
    {
      status: {
        $in: filters.status ? [filters.status] : HISTORY_MATCH_STATUSES,
      },
    },
  ];

  if (filters.division) clauses.push({ division: filters.division });
  if (filters.matchType) clauses.push({ matchType: filters.matchType });
  if (filters.integrityStatus) {
    clauses.push({ integrityStatus: filters.integrityStatus });
  }

  const createdAt = {};
  const from = kstBoundary(filters.dateFrom, false);
  const to = kstBoundary(filters.dateTo, true);
  if (from) createdAt.$gte = from;
  if (to) createdAt.$lte = to;
  if (Object.keys(createdAt).length) clauses.push({ createdAt });

  const fixedParticipant = participantClause([filters.participantId]);
  if (fixedParticipant) clauses.push(fixedParticipant);

  if (filters.query) {
    const queryRegex = new RegExp(escapeRegex(filters.query), "i");
    const queryClauses = [{ matchKey: queryRegex }];
    const matchedParticipants = participantClause(matchingUserIds);
    if (matchedParticipants) queryClauses.push(...matchedParticipants.$or);
    if (mongoose.isValidObjectId(filters.query)) {
      queryClauses.push(
        { _id: filters.query },
        { "challenger.userId": filters.query },
        { "defender.userId": filters.query }
      );
    }
    clauses.push({ $or: queryClauses });
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function userSummary(user, fallbackId) {
  return {
    id: id(user?._id || fallbackId),
    nickname: cleanSingleLine(user?.name || user?.username, 80),
    realName: cleanSingleLine(user?.realName, 80),
    email: cleanSingleLine(user?.email, 160),
  };
}

function participantSummary({
  role,
  match,
  attempt,
  user,
  winnerRole,
}) {
  const participant = role === "CHALLENGER" ? match.challenger : match.defender;
  const resultSnapshot =
    role === "CHALLENGER"
      ? match.resultSnapshot?.challenger
      : match.resultSnapshot?.defender;
  const score = numeric(resultSnapshot?.score ?? attempt?.score);
  const correctCount = numeric(
    resultSnapshot?.correctCount ?? attempt?.correctCount
  );
  const terminalWithWinner = ["RESOLVED", "SETTLED"].includes(
    String(match.status || "")
  );
  return {
    ...userSummary(user, participant?.userId),
    role,
    stakeDays: numeric(participant?.stakeDays) || 0,
    attemptStatus: cleanSingleLine(attempt?.status, 30) || "NOT_CREATED",
    score,
    correctCount,
    result:
      winnerRole === role
        ? "WIN"
        : winnerRole
          ? "LOSE"
          : terminalWithWinner
            ? "DRAW"
            : "NO_RESULT",
  };
}

function buildMatchSummary({ match, attemptsByRole, usersById, focusUserId = "" }) {
  const matchId = id(match._id);
  const winnerRole = cleanSingleLine(
    match.winnerRole || match.resultSnapshot?.winnerRole,
    20
  );
  const challenger = participantSummary({
    role: "CHALLENGER",
    match,
    attempt: attemptsByRole.get(`${matchId}:CHALLENGER`),
    user: usersById.get(id(match.challenger?.userId)),
    winnerRole,
  });
  const defender = participantSummary({
    role: "DEFENDER",
    match,
    attempt: attemptsByRole.get(`${matchId}:DEFENDER`),
    user: usersById.get(id(match.defender?.userId)),
    winnerRole,
  });
  const focusedRole =
    focusUserId && challenger.id === id(focusUserId)
      ? "CHALLENGER"
      : focusUserId && defender.id === id(focusUserId)
        ? "DEFENDER"
        : "";
  const focusedParticipant =
    focusedRole === "CHALLENGER"
      ? challenger
      : focusedRole === "DEFENDER"
        ? defender
        : null;
  const opponent =
    focusedRole === "CHALLENGER"
      ? defender
      : focusedRole === "DEFENDER"
        ? challenger
        : null;

  return {
    id: matchId,
    matchKey: cleanSingleLine(match.matchKey, 200),
    seasonKey: cleanSingleLine(match.seasonKey, 80),
    division: cleanSingleLine(match.division, 10),
    matchType: cleanSingleLine(match.matchType, 20),
    matchOrigin: cleanSingleLine(match.matchOrigin, 60),
    tierPairLabel: cleanSingleLine(match.tierPairLabel, 80),
    status: cleanSingleLine(match.status, 30),
    integrityStatus: cleanSingleLine(match.integrityStatus, 30) || "PENDING",
    winnerRole,
    challenger,
    defender,
    focusedRole,
    focusedParticipant,
    opponent,
    requestedAt: match.requestedAt || match.createdAt || null,
    startedAt: match.startedAt || null,
    completedAt:
      match.settledAt || match.resolvedAt || match.updatedAt || match.createdAt || null,
    createdAt: match.createdAt || null,
  };
}

function buildAdminArenaMatchHistoryData({
  matches = [],
  attempts = [],
  users = [],
  total = matches.length,
  page = 1,
  pageSize = HISTORY_PAGE_SIZE,
  filters = normalizeHistoryFilters(),
  focusUserId = "",
} = {}) {
  const usersById = new Map(users.map((user) => [id(user._id), user]));
  const attemptsByRole = new Map(
    attempts.map((attempt) => [
      `${id(attempt.matchId)}:${cleanSingleLine(attempt.role, 20)}`,
      attempt,
    ])
  );
  const normalizedPage = safePositiveInteger(page, 1);
  const normalizedPageSize = safePageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  return {
    filters,
    total,
    page: Math.min(normalizedPage, totalPages),
    pageSize: normalizedPageSize,
    totalPages,
    records: matches.map((match) =>
      buildMatchSummary({
        match,
        attemptsByRole,
        usersById,
        focusUserId,
      })
    ),
    filterParticipant: filters.participantId
      ? userSummary(usersById.get(filters.participantId), filters.participantId)
      : null,
  };
}

async function findMatchingUserIds(query) {
  if (!query) return [];
  const regex = new RegExp(escapeRegex(query), "i");
  const users = await User.find({
    $or: [
      { name: regex },
      { username: regex },
      { realName: regex },
      { email: regex },
    ],
  })
    .select("_id")
    .limit(HISTORY_USER_SEARCH_LIMIT)
    .lean();
  return users.map((user) => user._id);
}

async function hydrateHistoryMatches(matches, options = {}) {
  const matchIds = matches.map((match) => match._id);
  const attempts = matchIds.length
    ? await ArenaMatchAttempt.find({ matchId: { $in: matchIds } })
        .select(
          "matchId userId role status score correctCount submittedAt activeSolveTimeMs"
        )
        .lean()
    : [];
  const userIds = uniqueIds(
    matches.flatMap((match) => [
      match.challenger?.userId,
      match.defender?.userId,
    ])
  );
  if (options.participantId) userIds.push(options.participantId);
  const users = userIds.length
    ? await User.find({ _id: { $in: uniqueIds(userIds) } })
        .select("name username realName email")
        .lean()
    : [];
  return { attempts, users };
}

async function getAdminArenaMatchHistoryData(input = {}) {
  const filters = normalizeHistoryFilters(input);
  const requestedPage = safePositiveInteger(input.page, 1);
  const pageSize = safePageSize(input.pageSize);
  const matchingUserIds = await findMatchingUserIds(filters.query);
  const matchFilter = buildHistoryMatchFilter(filters, matchingUserIds);
  const total = await ArenaMatch.countDocuments(matchFilter);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const matches = await ArenaMatch.find(matchFilter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  const { attempts, users } = await hydrateHistoryMatches(matches, {
    participantId: filters.participantId,
  });
  return buildAdminArenaMatchHistoryData({
    matches,
    attempts,
    users,
    total,
    page,
    pageSize,
    filters,
  });
}

async function getAdminUserRecentArenaMatches(userId, limit = 5) {
  if (!mongoose.isValidObjectId(userId)) return [];
  const safeLimit = Math.min(20, safePositiveInteger(limit, 5));
  const matches = await ArenaMatch.find({
    status: { $in: HISTORY_MATCH_STATUSES },
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit)
    .lean();
  const { attempts, users } = await hydrateHistoryMatches(matches, {
    participantId: userId,
  });
  return buildAdminArenaMatchHistoryData({
    matches,
    attempts,
    users,
    total: matches.length,
    page: 1,
    pageSize: safeLimit,
    focusUserId: userId,
  }).records;
}

module.exports = {
  HISTORY_MATCH_STATUSES,
  HISTORY_PAGE_SIZE,
  buildAdminArenaMatchHistoryData,
  buildHistoryMatchFilter,
  getAdminArenaMatchHistoryData,
  getAdminUserRecentArenaMatches,
  normalizeHistoryFilters,
};

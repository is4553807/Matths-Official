const mongoose = require("mongoose");

const {
  ArenaMatch,
  ArenaMatchAttempt,
  MainInvitationOffer,
} = require("../models/goatArenaModel");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const ACTIVE_MATCH_STATUSES = Object.freeze([
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "HELD",
]);

class GoatArenaProductionReadError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "GoatArenaProductionReadError";
    this.code = code;
    this.status = statusCode;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode) {
  throw new GoatArenaProductionReadError(code, message, statusCode);
}

function objectId(value, label) {
  const normalized = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    fail("INVALID_MATCH_QUERY", `${label} is invalid`, 400);
  }
  return new mongoose.Types.ObjectId(normalized);
}

function asPlain(value) {
  return value && typeof value.toObject === "function"
    ? value.toObject()
    : value;
}

function isoString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function participantFilter(userId) {
  return {
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  };
}

function participantRole(match, userId) {
  if (String(match?.challenger?.userId) === String(userId)) {
    return "CHALLENGER";
  }
  if (String(match?.defender?.userId) === String(userId)) {
    return "DEFENDER";
  }
  fail("MATCH_NOT_FOUND", "GOAT Arena match was not found", 404);
}

function participantSnapshot(match, role) {
  return role === "CHALLENGER" ? match.challenger : match.defender;
}

function opponentSnapshot(match, role) {
  return role === "CHALLENGER" ? match.defender : match.challenger;
}

function publicIntegrityState(match) {
  return match.integrityStatus || "PENDING";
}

function outcomeFor(match, role) {
  if (!match.winnerRole) return null;
  return match.winnerRole === role ? "WON" : "LOST";
}

function availableActions(match, attempt) {
  if (match.status === "HELD") return [];
  if (
    ["MATCHED", "READY"].includes(match.status) &&
    !attempt
  ) {
    return ["START"];
  }
  if (attempt?.status === "READY") return ["START"];
  if (attempt?.status === "IN_PROGRESS") {
    return ["SAVE_ANSWER", "ADVANCE", "SUBMIT"];
  }
  if (attempt?.status === "EVIDENCE_REQUIRED") {
    return ["SUBMIT_EVIDENCE"];
  }
  return [];
}

function serializeParticipantMatch(source, userId, participantAttempt = null) {
  const match = asPlain(source);
  const attempt = asPlain(participantAttempt);
  if (!match) return null;
  const role = participantRole(match, userId);
  const mine = participantSnapshot(match, role) || {};
  const opponent = opponentSnapshot(match, role) || {};
  const settlement = match.resultSnapshot?.settlementSummary || {};

  if (
    attempt &&
    (
      String(attempt.matchId) !== String(match._id) ||
      String(attempt.userId) !== String(userId) ||
      attempt.role !== role
    )
  ) {
    fail(
      "MATCH_ATTEMPT_READ_CONFLICT",
      "participant attempt does not match the requested Arena match",
      500
    );
  }

  return {
    id: String(match._id),
    revision: 0,
    status: match.status,
    role,
    activeRanking: match.division,
    matchType: match.matchType,
    myPositionBefore: mine.tupleBefore?.arenaPosition ?? null,
    opponentPositionBefore: opponent.tupleBefore?.arenaPosition ?? null,
    myPositionAfter:
      settlement[
        role === "CHALLENGER"
          ? "challengerPositionAfter"
          : "defenderPositionAfter"
      ] ?? null,
    opponentPositionAfter:
      settlement[
        role === "CHALLENGER"
          ? "defenderPositionAfter"
          : "challengerPositionAfter"
      ] ?? null,
    stake: {
      assetType:
        match.division === "MAIN"
          ? "LEARNING_DAY"
          : "PAYBACK_SCORE_DAY",
      days: Number.isSafeInteger(mine.stakeDays) ? mine.stakeDays : null,
    },
    outcome: outcomeFor(match, role),
    settlementReason:
      match.resultSnapshot?.tieBreakStep ||
      (match.status === "SETTLED" ? "SCORED_RESULT" : null),
    positionOutcome: settlement.outcome || null,
    integrityState: publicIntegrityState(match),
    timeLimitSeconds: Number.isSafeInteger(match.timeLimitMs)
      ? Math.round(match.timeLimitMs / 1000)
      : null,
    timeline: {
      matchedAt: isoString(match.requestedAt || match.createdAt),
      startsBy: isoString(match.startDeadlineAt),
      startedAt: isoString(attempt?.startedAt),
      endsAt: isoString(attempt?.deadlineAt),
      submittedAt: isoString(attempt?.submittedAt),
      submitsBy: isoString(attempt?.deadlineAt),
      hardDeadlineAt: isoString(match.completionDeadlineAt),
      resolvedAt: isoString(match.resolvedAt),
      settledAt: isoString(match.settledAt),
      updatedAt: isoString(match.updatedAt),
    },
    attempt: attempt
      ? {
          id: String(attempt._id),
          status: attempt.status,
          startedAt: isoString(attempt.startedAt),
          endsAt: isoString(attempt.deadlineAt),
          submittedAt: isoString(attempt.submittedAt),
          evidenceDeadlineAt: isoString(attempt.evidenceDeadlineAt),
          evidenceRequired: attempt.status === "EVIDENCE_REQUIRED",
          currentQuestionIndex: Number(attempt.currentQuestionIndex || 0),
        }
      : null,
    capabilities: {
      mutations: "ARENA_MATCH_V1",
      availableActions: availableActions(match, attempt),
    },
  };
}

function pageSize(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    fail(
      "INVALID_MATCH_PAGE_SIZE",
      `limit must be between 1 and ${MAX_PAGE_SIZE}`,
      400
    );
  }
  return parsed;
}

function encodeMatchCursor(match) {
  const updatedAt = isoString(match?.updatedAt);
  const id = String(match?._id || "");
  if (!updatedAt || !mongoose.Types.ObjectId.isValid(id)) {
    fail("INVALID_MATCH_CURSOR_SOURCE", "match cursor source is invalid", 500);
  }
  return Buffer.from(JSON.stringify({ updatedAt, id }), "utf8").toString(
    "base64url"
  );
}

function decodeMatchCursor(value) {
  if (value === null || value === undefined || value === "") return null;
  const encoded = String(value).trim();
  if (!encoded || encoded.length > 300 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    fail("INVALID_MATCH_CURSOR", "match cursor is invalid", 400);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    fail("INVALID_MATCH_CURSOR", "match cursor is invalid", 400);
  }
  const updatedAt = new Date(parsed?.updatedAt);
  if (
    Number.isNaN(updatedAt.getTime()) ||
    !mongoose.Types.ObjectId.isValid(String(parsed?.id || ""))
  ) {
    fail("INVALID_MATCH_CURSOR", "match cursor is invalid", 400);
  }
  return {
    updatedAt,
    id: new mongoose.Types.ObjectId(parsed.id),
  };
}

async function attemptsFor(matches, userId, AttemptModel) {
  if (!matches.length) return new Map();
  const rows = await AttemptModel.find({
    matchId: { $in: matches.map((match) => match._id) },
    userId,
  }).lean();
  return new Map(rows.map((attempt) => [String(attempt.matchId), attempt]));
}

async function listParticipantMatches(
  { userId, cursor = null, limit = null },
  { MatchModel = ArenaMatch, AttemptModel = ArenaMatchAttempt } = {}
) {
  const participantUserId = objectId(userId, "user id");
  const resolvedLimit = pageSize(limit);
  const decodedCursor = decodeMatchCursor(cursor);
  const query = participantFilter(participantUserId);
  if (decodedCursor) {
    query.$and = [
      {
        $or: [
          { updatedAt: { $lt: decodedCursor.updatedAt } },
          { updatedAt: decodedCursor.updatedAt, _id: { $lt: decodedCursor.id } },
        ],
      },
    ];
  }
  const rows = await MatchModel.find(query)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(resolvedLimit + 1)
    .lean();
  const hasMore = rows.length > resolvedLimit;
  const page = hasMore ? rows.slice(0, resolvedLimit) : rows;
  const attemptByMatchId = await attemptsFor(
    page,
    participantUserId,
    AttemptModel
  );
  return {
    matches: page.map((row) =>
      serializeParticipantMatch(
        row,
        participantUserId,
        attemptByMatchId.get(String(row._id)) || null
      )
    ),
    nextCursor:
      hasMore && page.length ? encodeMatchCursor(page[page.length - 1]) : null,
  };
}

async function getParticipantMatch(
  { userId, id },
  { MatchModel = ArenaMatch, AttemptModel = ArenaMatchAttempt } = {}
) {
  const participantUserId = objectId(userId, "user id");
  const requestedMatchId = objectId(id, "match id");
  const row = await MatchModel.findOne({
    _id: requestedMatchId,
    ...participantFilter(participantUserId),
  }).lean();
  if (!row) {
    fail("MATCH_NOT_FOUND", "GOAT Arena match was not found", 404);
  }
  const attempt = await AttemptModel.findOne({
    matchId: row._id,
    userId: participantUserId,
  }).lean();
  return serializeParticipantMatch(row, participantUserId, attempt);
}

async function getActiveParticipantMatch(
  { userId },
  { MatchModel = ArenaMatch, AttemptModel = ArenaMatchAttempt } = {}
) {
  const participantUserId = objectId(userId, "user id");
  const match = await MatchModel.findOne({
    ...participantFilter(participantUserId),
    status: { $in: ACTIVE_MATCH_STATUSES },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!match) return null;
  const attempt = await AttemptModel.findOne({
    matchId: match._id,
    userId: participantUserId,
  }).lean();
  return { match, attempt };
}

async function getPendingParticipantInvitation(
  { userId },
  { InvitationOfferModel = MainInvitationOffer } = {}
) {
  const participantUserId = objectId(userId, "user id");
  const offer = await InvitationOfferModel.findOne({
    candidateUserId: participantUserId,
    status: "OFFERED",
  })
    .populate("invitationRequestId")
    .sort({ offeredAt: -1 })
    .lean();
  if (!offer || !offer.invitationRequestId) return null;
  const invitation = offer.invitationRequestId;
  return {
    id: String(offer._id),
    status: offer.status,
    activeRanking: "MAIN",
    targetTier: invitation.targetTier,
    initiatorTier: invitation.initiatorArenaTier,
    stakeDays: Number(invitation.stakeDays || 0),
    offeredAt: isoString(offer.offeredAt),
    policyVersionCode: invitation.policyVersionCode || null,
  };
}

module.exports = {
  ACTIVE_MATCH_STATUSES,
  DEFAULT_PAGE_SIZE,
  GoatArenaProductionReadError,
  MAX_PAGE_SIZE,
  decodeMatchCursor,
  encodeMatchCursor,
  getActiveParticipantMatch,
  getParticipantMatch,
  getPendingParticipantInvitation,
  listParticipantMatches,
  participantFilter,
  serializeParticipantMatch,
};

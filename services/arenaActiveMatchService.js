"use strict";

const {
  ArenaMatch,
  ArenaMatchParticipantLock,
} = require("../models/goatArenaModel");

const ACTIVE_MATCH_STATUSES = Object.freeze([
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
]);

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function sameTestAccountCohort(left, right) {
  const leftIsTest = Boolean(left?.isTestAccount);
  const rightIsTest = Boolean(right?.isTestAccount);
  if (leftIsTest === rightIsTest) return true;
  return Boolean(left?.arenaTestMatchEnabled && rightIsTest) ||
    Boolean(right?.arenaTestMatchEnabled && leftIsTest);
}

async function findActiveMatchForUser({ userId, session = null }) {
  const lock = await withSession(
    ArenaMatchParticipantLock.findOne({ userId }),
    session
  ).lean();
  let match = lock
    ? await withSession(ArenaMatch.findById(lock.matchId), session).lean()
    : null;
  if (!match || !ACTIVE_MATCH_STATUSES.includes(match.status)) {
    match = await withSession(
      ArenaMatch.findOne({
        status: { $in: ACTIVE_MATCH_STATUSES },
        $or: [
          { "challenger.userId": userId },
          {
            $and: [
              { "defender.userId": userId },
              { "competitiveAsync.enabled": { $ne: true } },
              { "normalAsync.enabled": { $ne: true } },
            ],
          },
        ],
      }).sort({ requestedAt: -1 }),
      session
    ).lean();
  }
  return match || null;
}

module.exports = {
  ACTIVE_MATCH_STATUSES,
  findActiveMatchForUser,
  sameTestAccountCohort,
};

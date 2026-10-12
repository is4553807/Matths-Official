"use strict";

const {
  ArenaInlineSolutionBoard,
  ArenaMatchAttempt,
} = require("../models/goatArenaModel");
const { submitArenaMatchEvidence } = require("./arenaMatchEvidenceService");
const {
  finalizeArenaMatchAfterEvidence,
} = require("./arenaEvidenceSettlementService");

function statusError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

async function finalizeWebInlineSolutionBoards({ matchId, userId, now = new Date() }) {
  const attempt = await ArenaMatchAttempt.findOne({ matchId, userId });
  if (!attempt) throw statusError(404, "GOAT Arena 경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
  if (attempt.status === "SUBMITTED") {
    const settlement = await finalizeArenaMatchAfterEvidence({
      matchId,
      userId,
      evidenceResult: null,
      now,
    });
    return { replayed: true, settlement };
  }
  if (attempt.status !== "EVIDENCE_REQUIRED") {
    throw statusError(409, "문항 제출이 모두 끝난 뒤 풀이판을 확정할 수 있습니다.", "ARENA_INLINE_EVIDENCE_NOT_READY");
  }
  const boards = await ArenaInlineSolutionBoard.find({ attemptId: attempt._id }).sort({ questionSlot: 1 }).lean();
  if (boards.length !== 5 || boards.some((board, index) => board.questionSlot !== index + 1)) {
    throw statusError(409, "다섯 문항의 풀이판이 모두 저장되어야 경기를 제출할 수 있습니다.", "ARENA_INLINE_EVIDENCE_INCOMPLETE");
  }
  const evidence = await submitArenaMatchEvidence({
    matchId,
    userId,
    preparedEvidenceFiles: boards.map((board) => ({
      ...board.file,
      questionSlot: board.questionSlot,
      revision: board.revision,
      strokeCount: board.strokeCount,
      firstSavedAt: board.createdAt,
      lastSavedAt: board.updatedAt,
    })),
    preparedEvidenceRiskFlags: boards.some((board) => board.strokeCount === 0)
      ? ["INSUFFICIENT_INLINE_EVIDENCE"]
      : [],
    receivedAt: now,
    now,
  });
  await ArenaInlineSolutionBoard.updateMany(
    { attemptId: attempt._id, finalizedAt: null },
    { $set: { finalizedAt: now } }
  );
  const settlement = await finalizeArenaMatchAfterEvidence({
    matchId,
    userId,
    evidenceResult: evidence,
    now,
  });
  return { evidence, settlement, replayed: evidence.replayed === true };
}

module.exports = { finalizeWebInlineSolutionBoards };

"use strict";
const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const { ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS } = require("./arenaOneOnOneProblemBank");
const { ArenaMatch, ArenaMatchAttempt, ArenaMatchAttemptEvent, ArenaInlineSolutionBoard } = require("../models/goatArenaModel");

const drawingHash = (data) => createHash("sha256").update(data).digest("hex");
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, statusCode: status, code }); };

async function lockArenaQuestionCompletion({ matchId, userId, questionSlot, requestId, answer, boardRevision, strokeCount, drawingSha256, drawingDataBase64, evidenceMode = "INLINE_BOARD_V1", submissionMode = "MANUAL", now = new Date() }) {
  const slot = Number(questionSlot), revision = Number(boardRevision), count = Number(strokeCount);
  const value = String(answer ?? "").trim();
  const drawing = Buffer.from(String(drawingDataBase64 || ""), "base64");
  const hash = String(drawingSha256 || (drawing.length ? drawingHash(drawing) : ""));
  const timedOut = submissionMode === "TIME_LIMIT";
  const inline = evidenceMode === "INLINE_BOARD_V1";
  if (!mongoose.isObjectIdOrHexString(matchId) || !mongoose.isObjectIdOrHexString(userId)) fail(404, "ARENA_MATCH_NOT_FOUND", "경기를 찾을 수 없습니다.");
  if (!Number.isSafeInteger(slot) || slot < 1 || slot > 5 || !["INLINE_BOARD_V1", "PHOTO_UPLOAD_V1"].includes(evidenceMode) ||
      (inline && (!Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(count) || count < 0 ||
        !/^[a-f0-9]{64}$/.test(hash) || drawing.length > 750 * 1024 || (drawing.length && drawingHash(drawing) !== hash))) ||
      !["MANUAL", "TIME_LIMIT"].includes(submissionMode) || !/^[A-Za-z0-9._:-]{16,160}$/.test(String(requestId || "")) || (value && !/^[1-9][0-9]{0,2}$/.test(value))) {
    fail(400, "ARENA_QUESTION_LOCK_INVALID", "문항 완료 정보를 확인해주세요.");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const attempt = await ArenaMatchAttempt.findOne({ matchId, userId }).session(session);
      if (!attempt) fail(404, "ARENA_MATCH_NOT_FOUND", "경기를 찾을 수 없습니다.");
      const event = await ArenaMatchAttemptEvent.findOne({ attemptId: attempt._id,
        eventType: "QUESTION_ADVANCED", $or: [
          { idempotencyKey: `ARENA_ADVANCE:${attempt._id}:${requestId}` }, { "metadata.completionRequestId": requestId },
        ] }).session(session).lean();
      if (event && Number(event.metadata?.completedQuestionNumber) !== slot) fail(409, "ARENA_QUESTION_LOCK_CONFLICT", "다른 문항에 사용한 완료 번호입니다.");
      if (event && Number(event.metadata?.completedQuestionNumber) === slot) {
        if (String(event.answerChanges?.[0]?.value || "") !== value || event.metadata?.evidenceMode !== evidenceMode) fail(409, "ARENA_QUESTION_LOCK_CONFLICT", "이미 완료한 문항의 요청과 일치하지 않습니다.");
        let board = null;
        if (inline) {
          board = await ArenaInlineSolutionBoard.findOne({ attemptId: attempt._id, questionSlot: slot }).select("+drawingData").session(session);
          if (!board || board.revision !== revision || drawingHash(Buffer.from(board.drawingData)) !== hash) fail(409, "ARENA_QUESTION_LOCK_CONFLICT", "이미 완료한 풀이판과 일치하지 않습니다.");
        }
        result = { advanced: true, boardSha256: board?.file.sha256 || null, drawingSha256: inline ? hash : null,
          lockedAt: event.metadata?.completionLockedAt || event.serverAt, evidenceMode, submissionMode: event.metadata?.submissionMode || "MANUAL", replayed: true };
        return;
      }
      if (attempt.status !== "IN_PROGRESS" || Number(attempt.currentQuestionIndex) + 1 !== slot) fail(409, "ARENA_QUESTION_LOCK_SEQUENCE", "현재 문항만 완료할 수 있습니다.");
      const existing = attempt.questionCompletionLock;
      if (existing) {
        if (existing.requestId !== requestId || existing.answer !== value || existing.evidenceMode !== evidenceMode || existing.submissionMode !== submissionMode ||
            (inline && (existing.boardRevision !== revision || existing.drawingSha256 !== hash || existing.strokeCount !== count))) fail(409, "ARENA_QUESTION_LOCK_CONFLICT", "이미 확정한 문항의 내용은 변경할 수 없습니다.");
        result = { lockedAt: existing.lockedAt, drawingSha256: inline ? hash : null, evidenceMode, submissionMode, replayed: true };
        return;
      }
      const timing = attempt.questionTimings?.[Number(attempt.currentQuestionIndex)];
      if (!timing || new Date(timing.startedAt) > now || !attempt.deadlineAt ||
          (!timedOut && new Date(attempt.deadlineAt) < now) || (timedOut && new Date(attempt.deadlineAt) > now)) fail(409, "ARENA_QUESTION_LOCK_EXPIRED", "현재 문항의 완료 시간을 확인해주세요.");
      if (timedOut && requestId !== `QUESTION_TIME_LIMIT:${attempt._id}:${new Date(attempt.deadlineAt).getTime()}`) fail(409, "ARENA_TIMEOUT_OPERATION_MISMATCH", "현재 문항의 시간 만료 번호가 일치하지 않습니다.");
      if (timedOut && now.getTime() - new Date(attempt.deadlineAt).getTime() > ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS) fail(409, "ARENA_QUESTION_LOCK_EXPIRED", "문항 완료 확인 기한이 끝났습니다.");
      const matchFence = await ArenaMatch.updateOne({ _id: matchId, status: { $in: ["READY", "IN_PROGRESS"] } },
        { $inc: { inlineBoardWriteVersion: 1 } }, { session });
      if (matchFence.matchedCount !== 1) fail(409, "ARENA_MATCH_TERMINAL", "현재 경기에서는 풀이를 완료할 수 없습니다.");
      attempt.questionCompletionLock = { questionSlot: slot, requestId, answer: value, evidenceMode, boardRevision: inline ? revision : null,
        strokeCount: inline ? count : null, drawingSha256: inline ? hash : null, drawingDataBase64: inline ? drawingDataBase64 || null : null,
        submissionMode, lockedAt: timedOut ? new Date(attempt.deadlineAt) : now };
      await attempt.save({ session });
      result = { lockedAt: attempt.questionCompletionLock.lockedAt, drawingSha256: inline ? hash : null, evidenceMode, submissionMode, replayed: false };
    });
  } finally { await session.endSession(); }
  return result;
}

module.exports = { drawingHash, lockArenaQuestionCompletion };

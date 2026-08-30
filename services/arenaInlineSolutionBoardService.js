const mongoose = require("mongoose");
const {
  ArenaInlineSolutionBoard,
  ArenaMatchAttempt,
} = require("../models/goatArenaModel");
const {
  buildEvidenceFiles,
  discardArenaEvidenceFiles,
  submitArenaMatchEvidence,
} = require("./arenaMatchEvidenceService");
const {
  destroyStoredAsset,
  signedCloudinaryUrl,
} = require("./fileStorageService");
const {
  settleArenaMatch,
} = require("./arenaMatchSettlementService");

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  return error;
}

function validSlot(value) {
  const slot = Number(value);
  return Number.isSafeInteger(slot) && slot >= 1 && slot <= 5 ? slot : null;
}

function validRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : null;
}

function serializeBoard(board) {
  return {
    questionSlot: board.questionSlot,
    revision: board.revision,
    strokeCount: board.strokeCount,
    sha256: board.file.sha256,
    previewURL: signedCloudinaryUrl(board.file),
    savedAt: board.updatedAt || board.createdAt,
    acceptedRevision: board.revision,
    contentHash: `sha256:${board.file.sha256}`,
    serverReceivedAt: board.updatedAt || board.createdAt,
    finalized: Boolean(board.finalizedAt),
    finalizedAt: board.finalizedAt || null,
    drawingDataBase64: board.drawingData
      ? Buffer.from(board.drawingData).toString("base64")
      : null,
  };
}

async function participantAttempt({ matchId, userId }) {
  if (
    !mongoose.isValidObjectId(matchId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    throw statusError(404, "GOAT Arena 경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
  }
  const attempt = await ArenaMatchAttempt.findOne({ matchId, userId });
  if (!attempt) {
    throw statusError(404, "GOAT Arena 경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
  }
  return attempt;
}

async function saveInlineSolutionBoard({
  matchId,
  userId,
  questionSlot,
  revision,
  strokeCount,
  drawingDataBase64,
  file,
}) {
  const slot = validSlot(questionSlot);
  const nextRevision = validRevision(revision);
  const nextStrokeCount = Number(strokeCount);
  let drawingData = null;
  try {
    drawingData = Buffer.from(String(drawingDataBase64 || ""), "base64");
  } catch (_error) {
    drawingData = null;
  }
  if (
    !slot || !nextRevision || !Number.isSafeInteger(nextStrokeCount) ||
    nextStrokeCount < 0 || !file || !drawingData?.length ||
    drawingData.length > 750 * 1024
  ) {
    await discardArenaEvidenceFiles(file ? [file] : []);
    throw statusError(400, "풀이판 저장 정보를 확인해주세요.", "ARENA_INLINE_BOARD_INVALID");
  }
  const attempt = await participantAttempt({ matchId, userId });
  const currentSlot = Number(attempt.currentQuestionIndex || 0) + 1;
  if (attempt.status !== "IN_PROGRESS" || slot !== currentSlot) {
    await discardArenaEvidenceFiles([file]);
    throw statusError(
      409,
      "현재 문항의 풀이판만 저장할 수 있습니다.",
      "ARENA_INLINE_BOARD_SLOT_CONFLICT"
    );
  }

  const existing = await ArenaInlineSolutionBoard.findOne({
    attemptId: attempt._id,
    questionSlot: slot,
  }).select("+drawingData");
  if (existing && nextRevision <= existing.revision) {
    await discardArenaEvidenceFiles([file]);
    if (nextRevision === existing.revision) return serializeBoard(existing);
    throw statusError(
      409,
      "더 최신 풀이판이 이미 저장되어 있습니다.",
      "ARENA_INLINE_BOARD_REVISION_CONFLICT"
    );
  }

  const [preparedFile] = await buildEvidenceFiles([file]);
  preparedFile.originalName = `arena-question-${slot}.png`;
  try {
    const board = await ArenaInlineSolutionBoard.findOneAndUpdate(
      {
        attemptId: attempt._id,
        questionSlot: slot,
        ...(existing ? { revision: existing.revision } : {}),
      },
      {
        $set: {
          matchId: attempt.matchId,
          userId: attempt.userId,
          revision: nextRevision,
          strokeCount: nextStrokeCount,
          drawingData,
          file: preparedFile,
        },
        $setOnInsert: {
          attemptId: attempt._id,
          questionSlot: slot,
        },
      },
      { new: true, upsert: !existing, runValidators: true }
    );
    if (!board) {
      throw statusError(
        409,
        "풀이판이 다른 기기에서 갱신되었습니다.",
        "ARENA_INLINE_BOARD_REVISION_CONFLICT"
      );
    }
    if (existing?.file) await destroyStoredAsset(existing.file).catch(() => {});
    return serializeBoard(board);
  } catch (error) {
    await destroyStoredAsset(preparedFile).catch(() => {});
    if (Number(error?.code) === 11000) {
      throw statusError(
        409,
        "풀이판이 다른 기기에서 먼저 저장되었습니다.",
        "ARENA_INLINE_BOARD_REVISION_CONFLICT"
      );
    }
    throw error;
  }
}

async function getInlineSolutionBoards({ matchId, userId }) {
  const attempt = await participantAttempt({ matchId, userId });
  const boards = await ArenaInlineSolutionBoard.find({ attemptId: attempt._id })
    .select("+drawingData")
    .sort({ questionSlot: 1 })
    .lean();
  return boards.map(serializeBoard);
}

async function assertInlineSolutionBoard({
  matchId,
  userId,
  questionSlot,
  expectedRevision,
  expectedSha256,
}) {
  const slot = validSlot(questionSlot);
  const revision = validRevision(expectedRevision);
  const sha256 = String(expectedSha256 || "").toLowerCase();
  const attempt = await participantAttempt({ matchId, userId });
  const board = slot
    ? await ArenaInlineSolutionBoard.findOne({
        attemptId: attempt._id,
        questionSlot: slot,
      }).select("+drawingData").lean()
    : null;
  if (!board || !revision || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw statusError(
      409,
      "현재 문항의 풀이판 저장이 끝난 뒤 다음 문항으로 이동할 수 있습니다.",
      "ARENA_INLINE_BOARD_REQUIRED"
    );
  }
  if (board.revision !== revision || board.file.sha256 !== sha256) {
    throw statusError(
      409,
      "서버에 저장된 최신 풀이판과 문항 이동 정보가 일치하지 않습니다.",
      "ARENA_INLINE_BOARD_VERSION_CONFLICT"
    );
  }
  return board;
}

async function promoteInlineSolutionBoards({ matchId, userId, now = new Date() }) {
  const attempt = await participantAttempt({ matchId, userId });
  if (attempt.status === "SUBMITTED") {
    return { attempt, replayed: true };
  }
  if (attempt.status !== "EVIDENCE_REQUIRED") {
    throw statusError(
      409,
      "문항 제출이 모두 끝난 뒤 풀이판을 확정할 수 있습니다.",
      "ARENA_INLINE_EVIDENCE_NOT_READY"
    );
  }
  const boards = await ArenaInlineSolutionBoard.find({ attemptId: attempt._id })
    .sort({ questionSlot: 1 })
    .lean();
  if (
    boards.length !== 5 ||
    boards.some((board, index) => board.questionSlot !== index + 1)
  ) {
    throw statusError(
      409,
      "다섯 문항의 풀이판이 모두 저장되어야 경기를 제출할 수 있습니다.",
      "ARENA_INLINE_EVIDENCE_INCOMPLETE"
    );
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
  const settlement = evidence.matchStatus === "SUBMITTED"
    ? await settleArenaMatch({ matchId, now })
    : null;
  return { evidence, settlement, replayed: evidence.replayed };
}

module.exports = {
  assertInlineSolutionBoard,
  getInlineSolutionBoards,
  promoteInlineSolutionBoards,
  saveInlineSolutionBoard,
};

"use strict";

const { ArenaInlineSolutionBoard, ArenaGuestSolutionBoard } = require("../models/goatArenaModel");

function assetKey(file) {
  return JSON.stringify([file.storageProvider, file.cloudPublicId || file.r2ObjectKey || file.storedName, file.sha256]);
}

async function appendSavedBoards(files, query) {
  const result = [...(files || [])];
  const seen = new Set(result.map(assetKey));
  const boards = await query.select("questionSlot revision strokeCount createdAt updatedAt file").sort({ questionSlot: 1 }).lean();
  for (const board of boards) {
    if (!board.file || board.file.storageProvider === "PURGED" || seen.has(assetKey(board.file))) continue;
    result.push({ ...board.file, questionSlot: board.questionSlot, revision: board.revision,
      strokeCount: board.strokeCount, firstSavedAt: board.createdAt, lastSavedAt: board.updatedAt });
    seen.add(assetKey(board.file));
  }
  return result;
}

async function memberEvidenceWithSavedBoards(evidence, attempt) {
  // Saved drafts alone never unlock a result, and purged evidence never returns.
  if (!evidence?.files?.length || evidence.contentPurgedAt || attempt?.status !== "SUBMITTED") return evidence;
  const files = await appendSavedBoards(evidence.files, ArenaInlineSolutionBoard.find({
    attemptId: attempt._id, matchId: attempt.matchId, userId: attempt.userId,
  }));
  return { ...evidence, files };
}

async function guestFilesWithSavedBoards(attempt) {
  if (attempt?.status !== "SETTLED" || !attempt.evidenceFiles?.length) return attempt?.evidenceFiles || [];
  return appendSavedBoards(attempt.evidenceFiles, ArenaGuestSolutionBoard.find({ attemptId: attempt._id, guestIdentityId: attempt.guestIdentityId }));
}

module.exports = { memberEvidenceWithSavedBoards, guestFilesWithSavedBoards };

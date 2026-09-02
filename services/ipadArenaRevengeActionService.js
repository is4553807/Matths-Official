const mongoose = require("mongoose");
const { ArenaRevengeRight } = require("../models/goatArenaModel");
const { createSubRevengeMatch, forfeitSubRevengeRight } = require("./arenaRevengeService");
const { createMainRevengeMatch, forfeitMainRevengeRight } = require("./mainArenaRevengeService");

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getPendingArenaRevengeRight({ userId }) {
  const right = await ArenaRevengeRight.findOne({
    eligibleUserId: userId,
    status: "AVAILABLE",
  }).sort({ createdAt: -1 }).lean();
  if (!right) return null;
  return {
    id: String(right._id),
    division: String(right.division || ""),
    stakeDays: Number(right.revengeStakeDays || 0),
    feeDays: Number(right.feeDays || 0),
    expiresAt: right.expiresAt || null,
    createdAt: right.createdAt || null,
  };
}

async function loadOwnedRight({ revengeRightId, userId }) {
  if (!mongoose.isValidObjectId(revengeRightId)) {
    throw statusError(404, "사용할 수 있는 복수권을 찾을 수 없습니다.", "REVENGE_RIGHT_NOT_FOUND");
  }
  const right = await ArenaRevengeRight.findOne({
    _id: revengeRightId,
    eligibleUserId: userId,
  }).select("division").lean();
  if (!right) {
    throw statusError(404, "이 계정에서 사용할 수 있는 복수권을 찾을 수 없습니다.", "REVENGE_RIGHT_NOT_FOUND");
  }
  return right;
}

async function claimArenaRevengeRight({ revengeRightId, userId, requestId }) {
  const right = await loadOwnedRight({ revengeRightId, userId });
  const create = right.division === "MAIN" ? createMainRevengeMatch : createSubRevengeMatch;
  return create({ revengeRightId, userId, requestId });
}

async function forfeitArenaRevengeRight({ revengeRightId, userId, requestId }) {
  const right = await loadOwnedRight({ revengeRightId, userId });
  const forfeit = right.division === "MAIN" ? forfeitMainRevengeRight : forfeitSubRevengeRight;
  return forfeit({ revengeRightId, userId, requestId });
}

module.exports = {
  claimArenaRevengeRight,
  forfeitArenaRevengeRight,
  getPendingArenaRevengeRight,
};

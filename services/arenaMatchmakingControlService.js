const mongoose = require("mongoose");
const { PlatformControl } = require("../models/operationModel");

const MATCHMAKING_CONTROL_KEY = "GOAT_ARENA_MATCHMAKING";

function pausedError(control = {}) {
  const error = new Error(
    control.reason
      ? `운영자에 의해 신규 매치메이킹이 일시정지되었습니다. 진행 중인 경기는 계속 완료할 수 있습니다. 사유: ${control.reason}`
      : "운영자에 의해 신규 매치메이킹이 일시정지되었습니다. 진행 중인 경기는 계속 완료할 수 있습니다."
  );
  error.status = 423;
  error.code = "ARENA_MATCHMAKING_GLOBALLY_PAUSED";
  error.pausedAt = control.pausedAt || null;
  return error;
}

async function ensureMatchmakingControl() {
  return PlatformControl.findOneAndUpdate(
    { key: MATCHMAKING_CONTROL_KEY },
    {
      $setOnInsert: {
        key: MATCHMAKING_CONTROL_KEY,
        isPaused: false,
        reason: "",
        admissionSequence: 0,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
}

async function getMatchmakingControl() {
  return ensureMatchmakingControl();
}

async function assertMatchmakingOpen({ session = null, claim = false, now = new Date() } = {}) {
  if (!claim) {
    const query = PlatformControl.findOne({ key: MATCHMAKING_CONTROL_KEY });
    if (session) query.session(session);
    const control = await query.lean();
    if (!control) return ensureMatchmakingControl();
    if (control.isPaused) throw pausedError(control);
    return control;
  }

  const control = await PlatformControl.findOneAndUpdate(
    { key: MATCHMAKING_CONTROL_KEY, isPaused: false },
    { $inc: { admissionSequence: 1 }, $set: { lastAdmissionAt: now } },
    { returnDocument: "after", session }
  ).lean();
  if (control) return control;
  const currentQuery = PlatformControl.findOne({ key: MATCHMAKING_CONTROL_KEY });
  if (session) currentQuery.session(session);
  const current = await currentQuery.lean();
  throw pausedError(current || {});
}

async function setMatchmakingPaused({ adminUserId, paused, reason = "", now = new Date() }) {
  if (!mongoose.isValidObjectId(adminUserId)) {
    const error = new Error("운영자 정보를 확인할 수 없습니다.");
    error.status = 403;
    throw error;
  }
  const cleanReason = String(reason || "").replace(/\s+/g, " ").trim().slice(0, 500);
  return PlatformControl.findOneAndUpdate(
    { key: MATCHMAKING_CONTROL_KEY },
    {
      $set: {
        isPaused: Boolean(paused),
        reason: paused ? cleanReason : "",
        pausedAt: paused ? now : null,
        resumedAt: paused ? null : now,
        changedBy: adminUserId,
      },
      $setOnInsert: { key: MATCHMAKING_CONTROL_KEY, admissionSequence: 0 },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
}

async function isMatchmakingPaused() {
  const control = await getMatchmakingControl();
  return Boolean(control?.isPaused);
}

module.exports = {
  MATCHMAKING_CONTROL_KEY,
  assertMatchmakingOpen,
  ensureMatchmakingControl,
  getMatchmakingControl,
  isMatchmakingPaused,
  setMatchmakingPaused,
};

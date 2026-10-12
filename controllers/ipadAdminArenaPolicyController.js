"use strict";

const {
  getAdminArenaV2Overview,
  reviewNormalRecordIntegrity,
} = require("../services/adminArenaV2Service");
const { setMatchmakingPaused } = require("../services/arenaMatchmakingControlService");
const { resetExhaustedArenaPlacements } = require("../services/arenaPlacementPolicyService");

const SCHEMA_VERSION = "ADMIN_ARENA_POLICY_NATIVE_V2";

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    throw statusError(403, "관리자만 Arena 운영 설정을 사용할 수 있습니다.");
  }
  return req.apiUser;
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

async function respond(res, extra = {}) {
  noStore(res);
  return res.json({
    schemaVersion: SCHEMA_VERSION,
    ...extra,
    dashboard: await getAdminArenaV2Overview(),
  });
}

exports.dashboard = async (req, res, next) => {
  try {
    requireAdmin(req);
    return respond(res);
  } catch (error) {
    return next(error);
  }
};

exports.matchmaking = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const action = String(req.body?.action || "").trim().toUpperCase();
    if (!["PAUSE", "RESUME"].includes(action)) {
      throw statusError(400, "매치메이킹 제어 명령을 확인해주세요.");
    }
    await setMatchmakingPaused({
      adminUserId: admin._id || admin.id,
      paused: action === "PAUSE",
      reason: req.body?.reason,
    });
    return respond(res, { ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.placementReset = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const result = await resetExhaustedArenaPlacements({
      userId: req.params.userId,
      adminUserId: admin._id || admin.id,
      requestId: req.body?.requestId,
      reason: req.body?.reason,
    });
    return respond(res, { ok: true, placementReset: result });
  } catch (error) {
    return next(error);
  }
};

exports.normalRecordReview = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const result = await reviewNormalRecordIntegrity({
      recordId: req.params.recordId,
      adminUserId: admin._id || admin.id,
      decision: req.body?.decision,
      note: req.body?.note,
    });
    return respond(res, { ok: true, normalRecordReview: result });
  } catch (error) {
    return next(error);
  }
};

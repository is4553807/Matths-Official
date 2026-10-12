"use strict";
const { createHash } = require("node:crypto");
const { ArenaNativeCommandReceipt } = require("../models/arenaDeliveryModel");
const { canonicalValue } = require("../services/arenaQuestionIdentityService");

function requiredNativeMutationHeaders(req) {
  const get = (name) => typeof req.get === "function" ? req.get(name) : req.headers?.[name.toLowerCase()];
  const key = get("Idempotency-Key"), version = get("X-Matths-Client-Version");
  if (typeof key !== "string" || !key.trim() || key.length > 180 ||
      typeof version !== "string" || !version.trim() || version.length > 100) {
    throw Object.assign(new Error("명령 헤더를 확인해주세요."), { status: 400, code: "COMMAND_HEADER_REQUIRED" });
  }
  return { key: key.trim(), version: version.trim() };
}

function arenaNativeMutation(operation, handler) {
  return async (req, res, next) => {
    let receipt, committed = false;
    const originalJson = res.json;
    try {
      if (!req.apiUser?._id) throw Object.assign(new Error("다시 로그인해주세요."), { status: 401 });
      const { key, version } = requiredNativeMutationHeaders(req);
      req.arenaNativeIdempotencyKey = key;
      const fingerprint = createHash("sha256").update(JSON.stringify(canonicalValue({ operation, version, params: req.params || {}, body: req.body || {} }))).digest("hex");
      try {
        receipt = await ArenaNativeCommandReceipt.create({ userId: req.apiUser._id, key, fingerprint, status: "PROCESSING", startedAt: new Date() });
      } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await ArenaNativeCommandReceipt.findOne({ userId: req.apiUser._id, key }).select("+response").lean();
        if (!existing || existing.fingerprint !== fingerprint) throw Object.assign(new Error("같은 명령 키에 다른 요청을 보낼 수 없습니다."), { status: 409, code: "COMMAND_KEY_CONFLICT" });
        if (existing.status === "COMPLETE") return res.status(existing.responseStatus).json(existing.response);
        throw Object.assign(new Error("이 명령의 처리 상태를 먼저 확인해주세요."), { status: 409, code: "COMMAND_OUTCOME_PENDING" });
      }
      res.json = async function (body) {
        committed = true;
        const response = JSON.parse(JSON.stringify(body));
        await ArenaNativeCommandReceipt.updateOne({ _id: receipt._id, status: "PROCESSING" }, {
          $set: { status: "COMPLETE", response, responseStatus: res.statusCode || 200 },
        });
        return originalJson.call(res, body);
      };
      let capturedError;
      const result = await handler(req, res, (error) => { capturedError = error; });
      if (capturedError) throw capturedError;
      return result;
    } catch (error) {
      if (receipt) {
        if (committed) await ArenaNativeCommandReceipt.updateOne({ _id: receipt._id }, { $set: { status: "UNKNOWN" } });
        else await ArenaNativeCommandReceipt.deleteOne({ _id: receipt._id, status: "PROCESSING" });
      }
      return next(error);
    } finally { res.json = originalJson; }
  };
}

module.exports = { requiredNativeMutationHeaders, arenaNativeMutation };

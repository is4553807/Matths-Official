"use strict";

const {
  getDataAnalysisDashboard,
  getKstMonthKey,
  runMonthlyDataAnalysisAggregation,
} = require("../services/dataAnalysisAggregationService");

const SCHEMA_VERSION = "ADMIN_DATA_ANALYSIS_NATIVE_V1";

function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    const error = new Error("관리자만 운영 지표를 조회할 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return req.apiUser;
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

exports.dashboard = async (req, res, next) => {
  try {
    requireAdmin(req);
    noStore(res);
    const periodKey = String(req.query?.period || getKstMonthKey());
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      analysis: await getDataAnalysisDashboard({ periodKey }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.rebuild = async (req, res, next) => {
  try {
    requireAdmin(req);
    const periodKey = String(req.body?.periodKey || getKstMonthKey());
    const result = await runMonthlyDataAnalysisAggregation({ periodKey });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, result });
  } catch (error) {
    return next(error);
  }
};

"use strict";
const { getAdminOperationsGuideData } = require("../services/adminOperationsGuideService");
const SCHEMA_VERSION = "ADMIN_OPERATIONS_GUIDE_NATIVE_V1";
exports.dashboard = async (req, res, next) => { try { if (String(req.apiUser?.role || "").toLowerCase() !== "admin") { const error = new Error("관리자만 운영 매뉴얼을 조회할 수 있습니다."); error.status = 403; throw error; } res.set("Cache-Control", "private, no-store"); return res.json({ schemaVersion: SCHEMA_VERSION, guide: getAdminOperationsGuideData() }); } catch (error) { return next(error); } };

"use strict";

const fs = require("node:fs");
const { analyzeForensicUpload } = require("../services/pdfWatermarkService");

const SCHEMA_VERSION = "ADMIN_PDF_FORENSICS_NATIVE_V1";
function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    const error = new Error("관리자만 전역 발급 추적 도구를 사용할 수 있습니다.");
    error.status = 403;
    throw error;
  }
}
function noStore(res) { res.set("Cache-Control", "private, no-store"); }

exports.analyze = async (req, res, next) => {
  const uploadedPath = req.file?.path || "";
  try {
    requireAdmin(req);
    if (req.academyForensicsUploadError) throw req.academyForensicsUploadError;
    if (!uploadedPath) {
      const error = new Error("분석할 PDF 또는 스크린샷 파일을 선택해주세요.");
      error.status = 400;
      throw error;
    }
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, analysis: await analyzeForensicUpload(uploadedPath) });
  } catch (error) {
    return next(error);
  } finally {
    if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
  }
};

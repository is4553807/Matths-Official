"use strict";
const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { assertSuperAdmin } = require("../services/adminAcademyService");
const resources = Object.freeze({
  skeleton: { file: "matths-answer-key-skeleton.json", type: "application/json; charset=utf-8" },
  catalog: { file: "matths-ai-concept-catalog.md", type: "text/markdown; charset=utf-8" },
});
function failure(status, message) { const error = new Error(message); error.status = status; return error; }
exports.download = async (req, res, next) => {
  try {
    if (!req.apiUser?._id) throw failure(401, "로그인이 필요합니다.");
    await assertSuperAdmin(req.apiUser._id);
    const key = req.params.resource;
    const resource = Object.prototype.hasOwnProperty.call(resources, key) ? resources[key] : null;
    if (!resource) throw failure(404, "답지 작성 자료를 찾을 수 없습니다.");
    const source = path.join(__dirname, "../public/templates", resource.file);
    const metadata = await fs.lstat(source);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 2 * 1024 * 1024) {
      throw failure(503, "서버 원본 자료를 확인한 뒤 다시 시도해 주세요.");
    }
    const bytes = await fs.readFile(source);
    if (bytes.length !== metadata.size) throw failure(503, "자료가 갱신 중입니다. 다시 내려받아 주세요.");
    await assertSuperAdmin(req.apiUser._id);
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Type", resource.type);
    res.set("Content-Disposition", `attachment; filename="${resource.file}"`);
    res.set("X-Content-SHA256", createHash("sha256").update(bytes).digest("hex"));
    return res.send(bytes);
  } catch (error) { return next(error); }
};

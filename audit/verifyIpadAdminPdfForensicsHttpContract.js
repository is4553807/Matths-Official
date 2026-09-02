"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminPdfForensicsController.js"), "utf8");
function install(filename, value) { const resolved = require.resolve(filename); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value }; }
install("../services/pdfWatermarkService", { analyzeForensicUpload: async (value) => ({ inputType: "PDF", pathSeen: value, pageCount: 1, imageCount: 0, traceCodes: [], validPayloads: [], pageTraceCount: 0, ocrCandidateCount: 0, matches: [] }) });
assert(routes.includes('"/admin/pdf-forensics/analyze"'));
assert(routes.includes("handleAcademyForensicsUpload"));
assert(source.includes("req.apiUser")); assert(!source.includes("req.session")); assert(source.includes("unlink"));
const controller = require("../controllers/ipadAdminPdfForensicsController");
async function invoke({ role = "admin", file, uploadError } = {}) { let payload; let error; const headers = new Map(); const req = { apiUser: { role }, file, academyForensicsUploadError: uploadError }; const res = { set(k, v) { headers.set(k, v); return res; }, json(v) { payload = v; return res; } }; await controller.analyze(req, res, (v) => { error = v; }); return { payload, error, headers }; }
(async () => {
  assert.equal((await invoke({ role: "student" })).error?.status, 403);
  assert.equal((await invoke()).error?.status, 400);
  const temp = path.join(os.tmpdir(), `matths-admin-forensics-contract-${process.pid}.pdf`); fs.writeFileSync(temp, "%PDF-test");
  const value = await invoke({ file: { path: temp } });
  assert.equal(value.payload.schemaVersion, "ADMIN_PDF_FORENSICS_NATIVE_V1"); assert.equal(value.payload.analysis.pageCount, 1); assert.equal(value.headers.get("Cache-Control"), "private, no-store"); assert.equal(fs.existsSync(temp), false);
  console.log("iPad native admin PDF forensics HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminDataAnalysisController.js"), "utf8");
const calls = [];
function install(filename, value) { const resolved = require.resolve(filename); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value }; }
install("../services/dataAnalysisAggregationService", {
  getKstMonthKey: () => "2026-09",
  getDataAnalysisDashboard: async (value) => { calls.push(["dashboard", value]); return { period: { periodKey: value.periodKey, label: "2026년 9월" }, periodOptions: [], generatedAt: null, periodClosed: false, summary: { catalogMetricCount: 1, observedMetricCount: 1, waitingMetricCount: 0, reliableMetricCount: 0, observationRowCount: 1 }, categories: [], assumptions: [] }; },
  runMonthlyDataAnalysisAggregation: async (value) => { calls.push(["rebuild", value]); return { observationCount: 1 }; },
});
async function invoke(handler, { role = "admin", query = {}, body = {} } = {}) {
  let payload; let error; const headers = new Map();
  const req = { apiUser: { _id: "507f1f77bcf86cd799439011", role }, query, body };
  const res = { set(key, value) { headers.set(key, value); return res; }, json(value) { payload = value; return res; } };
  await handler(req, res, (value) => { error = value; }); return { payload, error, headers };
}
assert(routes.includes('router.get("/admin/data-analysis"'));
assert(routes.includes('router.post("/admin/data-analysis/rebuild"'));
assert(source.includes("req.apiUser")); assert(!source.includes("req.session"));
const controller = require("../controllers/ipadAdminDataAnalysisController");
(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.dashboard, { query: { period: "2026-09" } });
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_DATA_ANALYSIS_NATIVE_V1");
  assert.equal(dashboard.payload.analysis.period.periodKey, "2026-09");
  assert.equal(dashboard.headers.get("Cache-Control"), "private, no-store");
  const rebuilt = await invoke(controller.rebuild, { body: { periodKey: "2026-08" } });
  assert.equal(rebuilt.payload.result.observationCount, 1);
  assert.deepEqual(calls, [["dashboard", { periodKey: "2026-09" }], ["rebuild", { periodKey: "2026-08" }]]);
  console.log("iPad native admin data analysis HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

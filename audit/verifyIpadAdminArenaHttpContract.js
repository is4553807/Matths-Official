"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminArenaController.js"), "utf8");
const calls = [];

function install(filename, value) {
  const resolved = require.resolve(filename);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value };
}

install("../services/adminActiveArenaMatchesService", {
  getAdminActiveArenaMatchesData: async () => ({ generatedAt: new Date(), refreshIntervalSeconds: 15, stats: { live: 1 }, matches: [{ _id: "m1", status: "ACTIVE", challenger: { _id: "u1", name: "A" } }] }),
});
install("../services/adminArenaMatchHistoryService", {
  getAdminArenaMatchHistoryData: async (value) => { calls.push(["history", value]); return { filters: value, total: 1, page: 1, pageSize: 30, totalPages: 1, records: [{ _id: "m1", matchKey: "M-1" }] }; },
});
install("../services/arenaMatchEvidenceService", {
  getAdminArenaEvidenceData: async () => [{ _id: "e1", user: { _id: "u1", name: "A" }, files: [] }],
  getAdminEvidenceFile: async () => ({ mimeType: "application/pdf", absolutePath: "/tmp/evidence.pdf" }),
});
install("../services/arenaIntegrityRiskService", {
  getAdminArenaIntegrityData: async () => ({ heldMatches: [], cases: [], completedReviews: [] }),
  requestArenaSupplementalEvidence: async (value) => calls.push(["evidence", value]),
  reviewArenaIntegrityCase: async (value) => calls.push(["case", value]),
  reviewHeldArenaMatch: async (value) => calls.push(["match", value]),
});
install("../services/arenaReconciliationService", {
  getArenaReconciliationAudit: async () => ({ health: "HEALTHY", summary: { checkedMatches: 1 }, issues: [] }),
});
install("../services/rankingOperationsService", {
  exportFinalRankingCsv: async (value) => { calls.push(["csv", value]); return "rank,name\n1,A\n"; },
  getRankingOperationsDashboard: async () => ({ health: { status: "HEALTHY" }, history: [], operations: { emailConfigured: true } }),
  rebuildFinalRankingByAdmin: async (value) => calls.push(["rebuild", value]),
  runRankingMaintenanceTask: async (value) => { calls.push(["maintenance", value]); return { processed: 1 }; },
});

async function invoke(handler, { role = "admin", params = {}, body = {}, query = {} } = {}) {
  let payload; let error; let sent; const headers = new Map();
  const req = { apiUser: { _id: "507f1f77bcf86cd799439011", role }, params, body, query };
  const res = {
    set(key, value) { headers.set(key, value); return res; },
    json(value) { payload = value; return res; },
    send(value) { sent = value; return res; },
    type(value) { headers.set("Content-Type", value); return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers, sent };
}

for (const route of [
  'router.get("/admin/arena"',
  '"/admin/arena/matches/:matchId/review"',
  '"/admin/arena/matches/:matchId/supplemental-evidence/:role/request"',
  '"/admin/arena/integrity/:caseId/review"',
  '"/admin/arena/ranking/rebuild"',
  '"/admin/arena/maintenance"',
  'router.get("/admin/arena/ranking.csv"',
  '"/admin/arena/evidence/:evidenceId/:storedName"',
]) assert(routes.includes(route), `missing native admin Arena route ${route}`);
assert(source.includes("req.apiUser"));
assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminArenaController");
(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.dashboard, { query: { query: "A", division: "MAIN" } });
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_ARENA_NATIVE_V1");
  assert.equal(dashboard.payload.dashboard.live.matches[0].id, "m1");
  assert.equal(dashboard.payload.dashboard.history.records[0].matchKey, "M-1");
  assert.equal(dashboard.headers.get("Cache-Control"), "private, no-store");
  await invoke(controller.reviewMatch, { params: { matchId: "m1" }, body: { decision: "clear", note: "checked" } });
  await invoke(controller.requestEvidence, { params: { matchId: "m1", role: "CHALLENGER" }, body: { requestMessage: "steps" } });
  await invoke(controller.reviewCase, { params: { caseId: "c1" }, body: { decision: "restrict", note: "risk" } });
  await invoke(controller.rebuildRanking);
  const maintenance = await invoke(controller.maintenance, { body: { task: "SETTLEMENT_RETRY" } });
  assert.equal(maintenance.payload.result.processed, 1);
  const csv = await invoke(controller.rankingCsv);
  assert.equal(csv.sent, "rank,name\n1,A\n");
  assert.equal(csv.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.deepEqual(calls.map(([name]) => name), ["history", "match", "evidence", "case", "rebuild", "maintenance", "csv"]);
  console.log("iPad native admin Arena HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

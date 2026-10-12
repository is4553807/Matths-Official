"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(
  path.join(root, "controllers/ipadAdminProblemBankController.js"),
  "utf8"
);
const calls = [];

function install(filename, value) {
  const resolved = require.resolve(filename);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value };
}

install("../services/problemBankCatalogService", {
  getAdminProblemBankCatalog: () => ({
    arenaRuntime: { questionCount: 5, minutesPerQuestion: 10 },
    items: [{ name: "GOAT Arena 2.x 문제 팩 생성", file: "service.js", purpose: "current", status: "현행 런타임" }],
  }),
});
install("../services/problemTypeCatalogService", {
  getAdminProblemTypeCatalog: async () => ({
    categories: [{ key: "CONCEPT_PRACTICE", label: "Concept", count: 1 }],
    selectedCategory: "CONCEPT_PRACTICE",
    entries: [{ _id: "t1", category: "CONCEPT_PRACTICE", engineKey: "A", displayName: "A", validationReport: { passed: true } }],
    inspected: null,
    history: [],
  }),
  reviseProblemTypeVersion: async (value) => calls.push(["revise", value]),
  syncProblemTypeRegistry: async (value) => {
    calls.push(["sync", value]);
    return { inserted: [], updated: [], retired: [], total: 1 };
  },
});

for (const value of [
  '"/admin/problem-banks"',
  '"/admin/problem-banks/types/sync"',
  '"/admin/problem-banks/types/:versionId/revise"',
]) {
  assert(routes.includes(value), `missing ${value}`);
}
for (const retired of [
  '"/admin/problem-banks/arena/types"',
  '"/admin/problem-banks/arena/data"',
  '"/admin/problem-banks/arena/data/:versionId/activate"',
]) {
  assert(!routes.includes(retired), `retired route remains ${retired}`);
}
assert(source.includes("req.apiUser"));
assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminProblemBankController");

async function invoke(handler, { role = "admin", params = {}, body = {}, query = {} } = {}) {
  let payload;
  let error;
  const req = { apiUser: { _id: "507f1f77bcf86cd799439011", role }, params, body, query };
  const res = {
    set() { return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error };
}

(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.dashboard);
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_PROBLEM_BANK_NATIVE_V2");
  assert.equal(dashboard.payload.dashboard.arenaRuntime.questionCount, 5);
  assert.equal(dashboard.payload.dashboard.arenaComponents.length, 1);
  await invoke(controller.syncTypes);
  await invoke(controller.reviseType, { params: { versionId: "t1" } });
  assert.deepEqual(calls.map(([name]) => name), ["sync", "revise"]);
  console.log("iPad native admin current problem bank HTTP contract passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

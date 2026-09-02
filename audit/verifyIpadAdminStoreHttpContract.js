"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminStoreController.js"), "utf8");
const calls = [];
function install(filename, value) { const resolved = require.resolve(filename); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value }; }

const hall = { tabs: [{ code: "NJE", label: "자체제작 N제", summary: "" }], activeTab: "", items: [], editing: null };
const store = { products: [], editing: null, categories: [{ id: "c1", name: "N제", slug: "nje", sortOrder: 0, isVisible: true, productCount: 0 }] };
install("../services/studyHallService", {
  archiveStudyHallContent: async (...value) => calls.push(["archiveHall", value]),
  discardStudyHallUploads: async () => {},
  listAdminStudyHall: async () => hall,
  saveStudyHallContent: async (value) => { calls.push(["saveHall", value]); return { id: "h1" }; },
});
install("../services/storeService", {
  createStoreCategory: async (value) => calls.push(["createCategory", value]),
  deleteProduct: async (value) => calls.push(["deleteProduct", value]),
  deleteStoreCategory: async (value) => calls.push(["deleteCategory", value]),
  discardUploadedFiles: async () => {},
  getAdminStoreData: async () => store,
  reorderStoreCategories: async (value) => calls.push(["reorder", value]),
  saveProduct: async (value) => { calls.push(["saveProduct", value]); return { id: "p1" }; },
  updateStoreCategory: async (value) => calls.push(["updateCategory", value]),
});

async function invoke(handler, { role = "admin", params = {}, body = {}, files = {} } = {}) {
  let payload; let error; const headers = new Map();
  const req = { apiUser: { _id: "507f1f77bcf86cd799439011", role }, params, body, files };
  const res = { set(key, value) { headers.set(key, value); return res; }, json(value) { payload = value; return res; } };
  await handler(req, res, (value) => { error = value; }); return { payload, error, headers };
}

for (const route of [
  'router.get("/admin/store"', '"/admin/store/study-hall"', '"/admin/store/products"',
  'router.post("/admin/store/categories"', 'router.post("/admin/store/categories/reorder"',
]) assert(routes.includes(route), `missing native admin store route ${route}`);
assert(source.includes("req.apiUser")); assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminStoreController");
(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.dashboard);
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_STORE_NATIVE_V1");
  assert.equal(dashboard.payload.dashboard.store.categories[0].name, "N제");
  assert.equal(dashboard.headers.get("Cache-Control"), "private, no-store");
  const savedHall = await invoke(controller.saveStudyHall, { body: { title: "N제" }, files: { questionPdf: [{}] } }); assert.equal(savedHall.payload.contentId, "h1");
  await invoke(controller.archiveStudyHall, { params: { contentId: "h1" } });
  const savedProduct = await invoke(controller.saveProduct, { body: { name: "패키지" }, files: { thumbnail: [{}] } }); assert.equal(savedProduct.payload.productId, "p1");
  await invoke(controller.deleteProduct, { params: { productId: "p1" } });
  await invoke(controller.createCategory, { body: { name: "파이널" } });
  await invoke(controller.updateCategory, { params: { categoryId: "c1" }, body: { name: "N제", isVisible: true } });
  await invoke(controller.reorderCategories, { body: { categoryIds: ["c1"] } });
  await invoke(controller.deleteCategory, { params: { categoryId: "c1" } });
  assert.deepEqual(calls.map(([name]) => name), ["saveHall", "archiveHall", "saveProduct", "deleteProduct", "createCategory", "updateCategory", "reorder", "deleteCategory"]);
  console.log("iPad native admin store HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

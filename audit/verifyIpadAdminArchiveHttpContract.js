"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminArchiveController.js"), "utf8");
const calls = [];

function install(filename, value) {
  const resolved = require.resolve(filename);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value };
}

const dashboard = {
  isAdmin: true,
  categories: ["문제지", "해설", "개념 자료", "기타"],
  folders: [{ id: "f1", parentFolderId: null, name: "고3 수학", description: "", slug: "math", isPublished: true, accessLevel: "AUTHENTICATED", requiredAccessLevel: "AUTHENTICATED", isPinned: false, pinnedAt: null, itemCount: 1, isLocked: false, createdAt: new Date() }],
  folderOptions: [], breadcrumbs: [], selectedFolder: null,
  items: [{ id: "i1", title: "문제지", originalName: "sheet.pdf" }], trashItems: [],
};

install("../services/archiveService", {
  createArchiveFolder: async (value) => { calls.push(["createFolder", value]); return { id: "f1" }; },
  createArchiveItems: async (value) => { calls.push(["upload", value]); return [{ id: "i2" }]; },
  deleteArchiveFolder: async (value) => { calls.push(["deleteFolder", value]); return { parentFolderId: null }; },
  deleteArchiveItem: async (value) => calls.push(["deleteItem", value]),
  deleteArchiveItems: async (value) => { calls.push(["bulkDelete", value]); return { deletedCount: 2 }; },
  discardArchiveUpload: async (value) => calls.push(["discard", value]),
  getArchiveData: async (_user, options) => ({ ...dashboard, requestedFolderId: options.folderId || "" }),
  moveArchiveItems: async (value) => { calls.push(["move", value]); return { movedCount: 2 }; },
  purgeArchiveItem: async (value) => calls.push(["purge", value]),
  restoreArchiveItem: async (value) => calls.push(["restore", value]),
  setArchiveFolderPinned: async (value) => { calls.push(["pin", value]); return { id: value.folderId }; },
  updateArchiveFolder: async (value) => { calls.push(["updateFolder", value]); return { id: value.folderId }; },
});
install("../services/adminService", {
  createAnnouncement: async (value) => calls.push(["announce", value]),
});

async function invoke(handler, { role = "admin", params = {}, body = {}, query = {}, files = [] } = {}) {
  let payload; let error; const headers = new Map();
  const req = { apiUser: { _id: "admin-1", id: "admin-1", role }, params, body, query, files };
  const res = { set(key, value) { headers.set(key, value); return res; }, json(value) { payload = value; return res; } };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers };
}

for (const route of [
  'router.get("/admin/archive"',
  'router.post("/admin/archive/folders"',
  '"/admin/archive/upload"',
  'router.post("/admin/archive/items/bulk-delete"',
  'router.post("/admin/archive/items/bulk-move"',
  'router.post("/admin/archive/trash/:itemId/restore"',
  'router.post("/admin/archive/trash/:itemId/purge"',
]) assert(routes.includes(route), `missing admin archive route ${route}`);
assert(source.includes("req.apiUser"));
assert(!source.includes("req.session"));
assert(source.includes('"Cache-Control", "private, no-store"'));

const controller = require("../controllers/ipadAdminArchiveController");
(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const first = await invoke(controller.dashboard, { query: { folderId: "f1" } });
  assert.equal(first.payload.schemaVersion, "ADMIN_ARCHIVE_NATIVE_V1");
  assert.equal(first.payload.archive.requestedFolderId, "f1");
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");

  await invoke(controller.createFolder, { body: { name: "새 폴더", accessLevel: "LEARNING_PACKAGE" } });
  await invoke(controller.updateFolder, { params: { folderId: "f1" }, body: { name: "수정 폴더" } });
  await invoke(controller.pinFolder, { params: { folderId: "f1" }, body: { pinned: "true" } });
  await invoke(controller.deleteFolder, { params: { folderId: "f1" } });
  const uploaded = await invoke(controller.upload, { body: { category: "문제지", notifyUsers: "true" }, files: [{ path: "/tmp/sheet.pdf" }] });
  assert.equal(uploaded.payload.uploadedCount, 1); assert.equal(uploaded.payload.notified, true);
  const deleted = await invoke(controller.bulkDelete, { body: { itemIds: ["i1", "i2"] } });
  assert.equal(deleted.payload.affectedCount, 2);
  const moved = await invoke(controller.moveItems, { body: { itemIds: ["i1", "i2"], destinationFolderId: "f2" } });
  assert.equal(moved.payload.affectedCount, 2);
  await invoke(controller.deleteItem, { params: { itemId: "i1" } });
  await invoke(controller.restoreItem, { params: { itemId: "i1" } });
  await invoke(controller.purgeItem, { params: { itemId: "i1" } });
  assert.deepEqual(calls.map(([name]) => name), ["createFolder", "updateFolder", "pin", "deleteFolder", "upload", "announce", "bulkDelete", "move", "deleteItem", "restore", "purge"]);
  console.log("iPad native admin archive HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

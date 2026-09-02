"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(
  path.join(root, "controllers/ipadAdminOperationsController.js"),
  "utf8"
);

const ADMIN_ID = "0123456789abcdef01234567";

function installStubs() {
  const adminFilename = require.resolve("../services/adminService");
  require.cache[adminFilename] = {
    id: adminFilename,
    filename: adminFilename,
    loaded: true,
    exports: {
      getAdminDashboardData: async () => ({
        stats: { activeUsers: 10, pendingInquiries: 2 },
        inquiries: [{ _id: "i1", subject: "결제 문의", content: "확인해주세요" }],
      }),
      createAnnouncement: async ({ title, content, publishNow }) => ({
        _id: "a1", title, content, isPublished: Boolean(publishNow), boardCategory: "notice",
      }),
      getAdminInquiryData: async ({ status, page }) => ({
        inquiries: [{ _id: "i1", subject: "결제 문의", status }],
        status,
        page: Number(page) || 1,
        total: 1,
        totalPages: 1,
      }),
      replyToInquiry: async ({ message }) => ({ delivered: message.length >= 5 }),
      toggleAnnouncement: async () => undefined,
      updateInquiryStatus: async () => undefined,
    },
  };
  const todoFilename = require.resolve("../services/adminTodoService");
  require.cache[todoFilename] = {
    id: todoFilename,
    filename: todoFilename,
    loaded: true,
    exports: {
      getAdminTodoSummary: async () => ({
        pendingCount: 1,
        items: [{ _id: "t1", category: "inquiry", title: "문의 확인" }],
      }),
      getAdminTodoData: async ({ category, status }) => ({
        items: [{ _id: "t1", category, status, title: "문의 확인" }],
        filter: { category, status },
        pagination: { page: 1, total: 1, totalPages: 1, hasPrevious: false, hasNext: false },
      }),
      completeAdminTodo: async () => undefined,
      reopenAdminTodo: async () => undefined,
    },
  };
  const modelFilename = require.resolve("../models/matthsModel");
  require.cache[modelFilename] = {
    id: modelFilename,
    filename: modelFilename,
    loaded: true,
    exports: {
      Announcement: {
        find: () => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [{ _id: "a1", title: "운영 공지", content: "점검 안내", isPublished: true }],
            }),
          }),
        }),
      },
    },
  };
}

async function invoke(handler, { role = "admin", query = {}, params = {}, body = {} } = {}) {
  let payload;
  let error;
  let statusCode = 200;
  const headers = new Map();
  const req = { apiUser: { _id: ADMIN_ID, role }, query, params, body };
  const res = {
    set(name, value) { headers.set(name, value); return res; },
    status(value) { statusCode = value; return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers, statusCode };
}

for (const route of [
  'router.get("/admin/operations"',
  'router.get("/admin/todos"',
  '"/admin/todos/:todoId/complete"',
  '"/admin/todos/:todoId/reopen"',
  'router.get("/admin/inquiries"',
  '"/admin/inquiries/:inquiryId/reply"',
  '"/admin/inquiries/:inquiryId/status"',
  'router.get("/admin/announcements"',
  'router.post("/admin/announcements"',
  '"/admin/announcements/:announcementId/status"',
]) assert.ok(routes.includes(route), `missing route: ${route}`);

const authBoundary = routes.indexOf("router.use(requireApiAuth)");
assert.ok(routes.indexOf('router.get("/admin/operations"') > authBoundary, "admin API escaped auth");
assert.ok(source.includes('SCHEMA_VERSION = "ADMIN_OPERATIONS_NATIVE_V1"'));
assert.ok(source.includes("requireAdmin(req)"), "controller must enforce admin role itself");
assert.ok(!source.includes("req.session"), "native admin API must not depend on a web session");

async function main() {
  installStubs();
  const controller = require("../controllers/ipadAdminOperationsController");

  const forbidden = await invoke(controller.dashboard, { role: "teacher" });
  assert.equal(forbidden.payload, undefined);
  assert.equal(forbidden.error?.status, 403);

  const dashboard = await invoke(controller.dashboard);
  assert.ifError(dashboard.error);
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_OPERATIONS_NATIVE_V1");
  assert.equal(dashboard.payload.operations.pendingTodoCount, 1);
  assert.equal(dashboard.payload.operations.priorityTodos[0].id, "t1");
  assert.equal(dashboard.headers.get("Cache-Control"), "private, no-store");

  const todos = await invoke(controller.todos, {
    query: { category: "inquiry", status: "pending" },
  });
  assert.ifError(todos.error);
  assert.equal(todos.payload.todos.items[0].category, "inquiry");

  const inquiries = await invoke(controller.inquiries, {
    query: { status: "in_review", page: "1" },
  });
  assert.ifError(inquiries.error);
  assert.equal(inquiries.payload.inquiries.items[0].status, "in_review");

  const reply = await invoke(controller.replyToInquiry, {
    params: { inquiryId: "i1" },
    body: { message: "확인 후 처리했습니다." },
  });
  assert.ifError(reply.error);
  assert.equal(reply.payload.delivered, true);

  const announcements = await invoke(controller.announcements, {
    query: { status: "published" },
  });
  assert.ifError(announcements.error);
  assert.equal(announcements.payload.announcements.items[0].id, "a1");

  const created = await invoke(controller.createAnnouncement, {
    body: { title: "운영 공지", content: "점검 내용을 안내합니다.", publishNow: true },
  });
  assert.ifError(created.error);
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.announcement.isPublished, true);

  console.log("iPad native admin operations HTTP contract passed");
}

Promise.resolve().then(main).then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});

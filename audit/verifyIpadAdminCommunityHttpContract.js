"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminCommunityController.js"), "utf8");
const calls = [];
const serviceFile = require.resolve("../services/communityService");
const dashboard = {
  posts: [{ _id: "post1", title: "글", content: "내용", authorId: { _id: "u1", name: "학생", warningCount: 1 } }],
  notices: [{ _id: "notice1", title: "공지", content: "내용", isPinned: true }],
  comments: [{ _id: "comment1", content: "댓글", postId: { _id: "post1", title: "글" } }],
  reports: [{ _id: "report1", reason: "신고", postId: { _id: "post1", title: "글", authorId: { _id: "u1", name: "학생" } } }],
  boardLabels: { "high-school": "통합 게시판" }, filters: { board: "", status: "", search: "" },
  stats: { total: 1, published: 1, hidden: 0, deleted: 0 },
  pagination: { page: 1, totalPages: 1, total: 1, hasPrevious: false, hasNext: false },
};
const names = [
  "createCommunityNotice", "moderateCommunityComment", "moderateCommunityNotice",
  "moderateCommunityPost", "reviewCommunityReport", "setCommunityNoticePinned",
  "setCommunityPostPinned", "updateCommunityNotice", "updateCommunityPostByAdmin",
  "warnCommunityComment", "warnCommunityPost",
];
const stubs = { getAdminCommunityData: async () => dashboard };
for (const name of names) stubs[name] = async (input) => { calls.push([name, input]); return {}; };
require.cache[serviceFile] = { id: serviceFile, filename: serviceFile, loaded: true, exports: stubs };

async function invoke(handler, { role = "admin", query = {}, params = {}, body = {} } = {}) {
  let payload; let error; const headers = new Map();
  const req = { apiUser: { _id: "admin1", role }, query, params, body };
  const res = { set(k, v) { headers.set(k, v); return res; }, json(value) { payload = value; return res; } };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers };
}

for (const route of [
  'router.get("/admin/community"', '"/admin/community/notices"',
  '"/admin/community/reports/:reportId/review"', '"/admin/community/posts/:postId/status"',
  '"/admin/community/posts/:postId/warn"', '"/admin/community/comments/:commentId/status"',
  '"/admin/community/comments/:commentId/warn"',
]) assert(routes.includes(route), `missing admin community route ${route}`);
assert(routes.indexOf("router.use(requireApiAuth)") < routes.indexOf('router.get("/admin/community"'));
assert(source.includes("req.apiUser")); assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminCommunityController");
(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const result = await invoke(controller.dashboard);
  assert.equal(result.payload.schemaVersion, "ADMIN_COMMUNITY_NATIVE_V1");
  assert.equal(result.payload.community.reports[0].post.author.name, "학생");
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  await invoke(controller.createNotice, { body: { board: "high-school", title: "공지", content: "내용" } });
  await invoke(controller.updateNotice, { params: { noticeId: "notice1" }, body: { title: "수정", content: "내용" } });
  await invoke(controller.pinNotice, { params: { noticeId: "notice1" }, body: { pinned: true } });
  await invoke(controller.moderateNotice, { params: { noticeId: "notice1" }, body: { action: "hide" } });
  await invoke(controller.reviewReport, { params: { reportId: "report1" }, body: { status: "rejected", resolution: "위반 아님" } });
  await invoke(controller.editPost, { params: { postId: "post1" }, body: { title: "수정", content: "내용", reason: "개인정보 제거" } });
  await invoke(controller.pinPost, { params: { postId: "post1" }, body: { pinned: true } });
  await invoke(controller.moderatePost, { params: { postId: "post1" }, body: { action: "hide", reason: "규칙 위반", reportId: "report1" } });
  await invoke(controller.warnPost, { params: { postId: "post1" }, body: { reason: "반복 위반", reportId: "report1" } });
  await invoke(controller.moderateComment, { params: { commentId: "comment1" }, body: { action: "delete", reason: "욕설" } });
  await invoke(controller.warnComment, { params: { commentId: "comment1" }, body: { reason: "욕설" } });
  assert(calls.some(([name]) => name === "reviewCommunityReport"));
  assert(calls.some(([name]) => name === "warnCommunityPost"));
  console.log("iPad native admin community HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

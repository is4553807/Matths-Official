const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createUserAppliedAdminAuditFilter,
  isUserAppliedAdminAction,
} = require("../services/adminAuditPolicyService");

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

assert.equal(isUserAppliedAdminAction("user.warning-count"), true);
assert.equal(isUserAppliedAdminAction("user.email"), true);
assert.equal(isUserAppliedAdminAction("finance.payback-completed"), true);
assert.equal(isUserAppliedAdminAction("community.post-warning"), true);
assert.equal(isUserAppliedAdminAction("arena.integrity.match.cleared"), true);
assert.equal(isUserAppliedAdminAction("private-mock.integrity-penalty"), true);

assert.equal(isUserAppliedAdminAction("admin.request.get"), false);
assert.equal(isUserAppliedAdminAction("admin.request.post"), false);
assert.equal(isUserAppliedAdminAction("community.post-pin"), false);
assert.equal(isUserAppliedAdminAction("community.report-resolved"), false);
assert.equal(isUserAppliedAdminAction("arena.integrity.match.note"), false);
assert.equal(isUserAppliedAdminAction("finance.business-withdrawal"), false);
assert.equal(isUserAppliedAdminAction("problem-types.registry-sync"), false);
assert.equal(isUserAppliedAdminAction("test-control.clock-set"), false);

const filter = createUserAppliedAdminAuditFilter([{ adminUserId: "admin-id" }]);
assert.equal(Array.isArray(filter.$and), true);
assert.equal(filter.$and.length, 3);
assert.deepEqual(filter.$and[2], { adminUserId: "admin-id" });

const server = source("server.js");
const adminService = source("services/adminService.js");
const model = source("models/matthsModel.js");
const view = source("views/admin-audit-log.ejs");

assert.doesNotMatch(server, /trackAdminActivity/);
assert.match(adminService, /createUserAppliedAdminAuditFilter/);
assert.match(model, /preserveAdminActorSnapshot/);
assert.match(model, /lastLoginAt/);
assert.match(view, /관리자 로그인/);
assert.doesNotMatch(view, /HTTP <%=|durationMs|metadata\?\.path/);

console.log("User-targeted admin audit policy verification passed");

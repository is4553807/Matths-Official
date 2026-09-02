"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(
  path.join(root, "controllers/ipadAdminUsersController.js"),
  "utf8"
);
const ADMIN_ID = "0123456789abcdef01234567";
const USER_ID = "abcdef0123456789abcdef01";
const calls = [];

function detail() {
  return {
    user: {
      _id: USER_ID,
      name: "학생",
      realName: "김학생",
      email: "student@example.com",
      role: "student",
      isActive: true,
      accountStatus: "active",
      schoolGrade: 11,
      warningCount: 1,
      totalStudySeconds: 600,
    },
    streak: { current: 3, longest: 7 },
    learning: {
      currentConcept: { _id: "p1", conceptTitle: "함수", completionPercent: 40 },
      progressCount: 2,
      completedCount: 1,
      totalAttempts: 10,
      correctAttempts: 8,
      correctRate: 80,
      progress: [],
    },
    assessments: [],
    inquiries: [],
    notifications: [],
    actionLogs: [],
    communityPosts: [],
    identityMatches: [],
    packageAccess: { packageType: "FREE", label: "기본학습 패키지" },
    arenaActivityLevel: { level: 2, totalMatches: 5, matchesToNext: 3 },
  };
}

function installStubs() {
  const adminFilename = require.resolve("../services/adminService");
  require.cache[adminFilename] = {
    id: adminFilename,
    filename: adminFilename,
    loaded: true,
    exports: {
      getAdminUsersData: async (input) => ({
        users: [detail().user],
        schools: [{ code: "S1", name: "매쓰고" }],
        filters: input,
        page: 1,
        total: 1,
        totalPages: 1,
        perPage: 20,
      }),
      getAdminUserDetail: async () => detail(),
      getAdminUserActivityData: async () => ({
        user: detail().user, kind: "assessments",
        items: [{ _id: "attempt1", title: "배치고사", status: "submitted", scorePercent: 88 }],
        pagination: { page: 1, total: 1, totalPages: 1, perPage: 20 },
      }),
      getAdminAssessmentDetail: async () => ({
        user: detail().user,
        attempt: {
          _id: "attempt1", title: "배치고사", scopeType: "placement", displayStatus: "submitted",
          scorePercent: 88, hasFinalScore: true, answeredCount: 1,
          questions: [{ prompt: "1+1?", submittedAnswer: "2", answer: "2", isCorrect: true, points: 5 }],
        },
      }),
      getAdminParentDetail: async () => ({
        parent: { _id: "parent1", username: "학부모", email: "parent@example.com", isActive: true },
        children: [], links: [], checkoutIntents: [], alertDeliveries: [], actionLogs: [],
      }),
      getAdminSanctionHistory: async () => ({
        rows: [{ _id: "s1", action: "user.warning-count", actionLabel: "경고 횟수 변경" }],
        pagination: { page: 1, total: 1, totalPages: 1, perPage: 20 },
      }),
      getAdminAuditHistory: async () => ({
        rows: [{ _id: "a1", action: "user.role", actionLabel: "회원 역할 변경" }],
        admins: [{ _id: ADMIN_ID, realName: "운영자", email: "admin@example.com" }],
        filters: { query: "" },
        pagination: { page: 1, total: 1, totalPages: 1, perPage: 20 },
      }),
      createDirectNotification: async (input) => calls.push(["notification", input]),
      sendDirectUserEmail: async (input) => {
        calls.push(["email", input]);
        return { delivered: true };
      },
      sendUserPasswordReset: async (input) => calls.push(["password-reset", input]),
      updateUserNickname: async (input) => calls.push(["nickname", input]),
      updateUserRole: async (input) => calls.push(["role", input]),
      updateUserAccountStatus: async (input) => calls.push(["status", input]),
      updateUserWarningCount: async (input) => calls.push(["warnings", input]),
      updateAdminParentStatus: async (input) => calls.push(["parent-status", input]),
      updateAdminParentChildNotifications: async (input) => calls.push(["parent-notifications", input]),
      revokeAdminParentChildLink: async (input) => calls.push(["parent-unlink", input]),
    },
  };
  const packageFilename = require.resolve("../services/adminPackageAccessService");
  require.cache[packageFilename] = {
    id: packageFilename,
    filename: packageFilename,
    loaded: true,
    exports: {
      updateAdminPackageAccess: async (input) => calls.push(["package", input]),
    },
  };
}

async function invoke(handler, {
  role = "admin", query = {}, params = {}, body = {}, protocol = "https",
} = {}) {
  let payload;
  let error;
  let statusCode = 200;
  const headers = new Map();
  const req = {
    apiUser: { _id: ADMIN_ID, role },
    query,
    params,
    body,
    protocol,
    get: () => "matths.kr",
  };
  const res = {
    set(name, value) { headers.set(name, value); return res; },
    status(value) { statusCode = value; return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers, statusCode };
}

for (const route of [
  'router.get("/admin/users"',
  'router.get("/admin/users/:userId"',
  'router.get("/admin/users/:userId/activity"',
  '"/admin/users/:userId/assessments/:attemptId"',
  'router.get("/admin/parents/:parentId"',
  'router.get("/admin/sanctions"',
  'router.get("/admin/audit-log"',
  '"/admin/users/:userId/nickname-request"',
  '"/admin/users/:userId/notification"',
  '"/admin/users/:userId/password-reset"',
  '"/admin/users/:userId/account-status"',
  '"/admin/users/:userId/package-access"',
  '"/admin/parents/:parentId/account-status"',
  '"/admin/parents/:parentId/children/:childUserId/notifications"',
  '"/admin/parents/:parentId/children/:childUserId/unlink"',
]) {
  assert(routes.includes(route), `missing native admin user route: ${route}`);
}
assert(routes.indexOf("router.use(requireApiAuth)") < routes.indexOf('router.get("/admin/users"'));
assert(source.includes("req.apiUser"));
assert(!source.includes("req.session"));

installStubs();
const controller = require("../controllers/ipadAdminUsersController");

(async () => {
  const forbidden = await invoke(controller.users, { role: "student" });
  assert.equal(forbidden.error?.status, 403);

  const users = await invoke(controller.users, { query: { role: "student" } });
  assert.equal(users.payload.schemaVersion, "ADMIN_USERS_NATIVE_V1");
  assert.equal(users.payload.users.items[0].realName, "김학생");
  assert.equal(users.payload.users.pagination.total, 1);
  assert.equal(users.headers.get("Cache-Control"), "private, no-store");

  const user = await invoke(controller.user, { params: { userId: USER_ID } });
  assert.equal(user.payload.detail.learning.correctRate, 80);
  assert.equal(user.payload.detail.packageAccess.packageType, "FREE");
  const activity = await invoke(controller.activity, {
    params: { userId: USER_ID }, query: { kind: "assessments" },
  });
  assert.equal(activity.payload.activity.items[0].attemptId, "attempt1");
  const assessment = await invoke(controller.assessment, {
    params: { userId: USER_ID, attemptId: "attempt1" },
  });
  assert.equal(assessment.payload.assessment.attempt.questions[0].answer, "2");
  const parent = await invoke(controller.parent, { params: { parentId: "parent1" } });
  assert.equal(parent.payload.detail.user.entityType, "PARENT");

  const sanctions = await invoke(controller.sanctions);
  assert.equal(sanctions.payload.sanctions.items[0].actionLabel, "경고 횟수 변경");
  const audit = await invoke(controller.audit);
  assert.equal(audit.payload.audit.admins[0].email, "admin@example.com");

  await invoke(controller.notification, {
    params: { userId: USER_ID }, body: { title: "안내", message: "내용", href: "/main" },
  });
  const email = await invoke(controller.email, {
    params: { userId: USER_ID }, body: { subject: "안내", message: "이메일 내용" },
  });
  assert.equal(email.payload.delivered, true);
  await invoke(controller.passwordReset, { params: { userId: USER_ID } });
  await invoke(controller.nicknameRequest, {
    params: { userId: USER_ID }, body: { reason: "부적절한 닉네임" },
  });
  await invoke(controller.role, {
    params: { userId: USER_ID }, body: { role: "teacher", reason: "승인" },
  });
  await invoke(controller.accountStatus, {
    params: { userId: USER_ID }, body: { status: "suspended", reason: "운영 정책" },
  });
  await invoke(controller.warnings, {
    params: { userId: USER_ID }, body: { warningCount: 2, reason: "검토" },
  });
  await invoke(controller.packageAccess, {
    params: { userId: USER_ID }, body: { packageType: "LEARNING_PACKAGE", reason: "보상" },
  });
  assert.deepEqual(
    calls.map(([name]) => name),
    ["notification", "email", "password-reset", "nickname", "role", "status", "warnings", "package"]
  );

  const badDelete = await invoke(controller.withdraw, {
    params: { userId: USER_ID }, body: { confirmation: "삭제", reason: "요청" },
  });
  assert.equal(badDelete.error?.status, 400);
  const deleteResult = await invoke(controller.withdraw, {
    params: { userId: USER_ID },
    body: { confirmation: "계정삭제", reason: "요청", dataRetention: "anonymous" },
  });
  assert.equal(deleteResult.payload.ok, true);
  assert.equal(deleteResult.payload.purged, false);

  await invoke(controller.parentStatus, {
    params: { parentId: "parent1" }, body: { isActive: false, reason: "요청" },
  });
  await invoke(controller.parentChildNotifications, {
    params: { parentId: "parent1", childUserId: USER_ID }, body: { emailEnabled: true },
  });
  await invoke(controller.parentChildUnlink, {
    params: { parentId: "parent1", childUserId: USER_ID }, body: { reason: "요청" },
  });
  assert.deepEqual(calls.slice(-3).map(([name]) => name), [
    "parent-status", "parent-notifications", "parent-unlink",
  ]);

  console.log("iPad native admin users HTTP contract passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

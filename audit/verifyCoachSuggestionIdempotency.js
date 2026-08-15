const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const modelExports = require("../models/matthsModel");
const adminTodoService = require("../services/adminTodoService");
const moderationNoticeService = require("../services/moderationNoticeService");

const servicePath = require.resolve(
  "../services/coachSuggestionService"
);

const pendingSuggestion = {
  _id: "64b000000000000000000101",
  userId: "64b000000000000000000001",
  authorName: "감사 학생",
  mode: "spicy",
  situation: "incorrect",
  message: "같은 요청은 한 번만 저장되어야 합니다.",
  requestId: "audit-request-00000001",
  status: "pending",
  rejectionReason: "",
  createdAt: new Date("2026-08-15T00:00:00.000Z"),
  moderatedAt: null,
};

function loadServiceWithMocks({
  findOne,
  countDocuments,
  create,
  createAdminTodo,
  quotaFindOneAndUpdate = () => ({
    lean: async () => ({ count: 1 }),
  }),
  quotaCreate = async () => ({}),
  quotaUpdateOne = async () => ({}),
  suggestionFind = modelExports.CoachMessageSuggestion.find,
  suggestionFindOneAndUpdate =
    modelExports.CoachMessageSuggestion.findOneAndUpdate,
  userFindById = modelExports.User.findById,
  createAdminActionLog = modelExports.AdminActionLog.create,
  completeAdminTodoBySource =
    adminTodoService.completeAdminTodoBySource,
  deliverModerationNotice =
    moderationNoticeService.deliverModerationNotice,
}) {
  modelExports.CoachMessageSuggestion.findOne =
    findOne;
  modelExports.CoachMessageSuggestion.countDocuments =
    countDocuments;
  modelExports.CoachMessageSuggestion.create =
    create;
  modelExports.CoachMessageSuggestion.find =
    suggestionFind;
  modelExports.CoachMessageSuggestion.findOneAndUpdate =
    suggestionFindOneAndUpdate;
  modelExports.CoachSuggestionQuota.findOneAndUpdate =
    quotaFindOneAndUpdate;
  modelExports.CoachSuggestionQuota.create =
    quotaCreate;
  modelExports.CoachSuggestionQuota.updateOne =
    quotaUpdateOne;
  modelExports.User.findById =
    userFindById;
  modelExports.AdminActionLog.create =
    createAdminActionLog;
  adminTodoService.createAdminTodo =
    createAdminTodo;
  adminTodoService.completeAdminTodoBySource =
    completeAdminTodoBySource;
  moderationNoticeService.deliverModerationNotice =
    deliverModerationNotice;
  delete require.cache[servicePath];
  return require(servicePath);
}

function leanQuery(value) {
  return {
    select() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function approvedSuggestionQuery(items = []) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    async lean() {
      return items;
    },
  };
}

async function renderForm() {
  const requestId =
    "5a8ebeb1-0b55-4d70-a200-8a1d58c85b2e";
  const html = await ejs.renderFile(
    path.join(
      __dirname,
      "..",
      "views",
      "coach-suggestions.ejs"
    ),
    {
      user: {
        id: pendingSuggestion.userId,
        name: "감사 학생",
        email: "audit@example.com",
        role: "student",
      },
      board: {
        isAdmin: false,
        approved: [],
        mine: [],
        pending: [],
      },
      submitted: false,
      moderated: false,
      suggestionRequestId:
        requestId,
    }
  );
  assert.match(
    html,
    new RegExp(
      `name="requestId" value="${requestId}"`
    )
  );
}

function verifyUniqueIndex() {
  const matching =
    modelExports.CoachMessageSuggestion.schema
      .indexes()
      .find(
        ([fields]) =>
          fields.userId === 1 &&
          fields.requestId === 1
      );
  assert.ok(
    matching,
    "사용자와 요청 ID 복합 인덱스가 필요합니다."
  );
  assert.equal(
    matching[1].unique,
    true
  );
  assert.deepEqual(
    matching[1]
      .partialFilterExpression,
    {
      requestId: {
        $type: "string",
      },
    }
  );
}

async function verifyExistingReplayRepairsTodo() {
  let createCalls = 0;
  let todoCalls = 0;
  const service = loadServiceWithMocks({
    findOne: async () =>
      pendingSuggestion,
    countDocuments: async () => {
      throw new Error(
        "멱등 재요청은 일일 한도 검사까지 진행하면 안 됩니다."
      );
    },
    create: async () => {
      createCalls += 1;
      return pendingSuggestion;
    },
    createAdminTodo: async (
      input
    ) => {
      todoCalls += 1;
      assert.equal(
        input.sourceId,
        pendingSuggestion._id
      );
      return input;
    },
  });

  const result =
    await service.createSuggestion({
      user: {
        id: pendingSuggestion.userId,
        name: "감사 학생",
      },
      mode: "spicy",
      situation: "incorrect",
      message:
        pendingSuggestion.message,
      requestId:
        pendingSuggestion.requestId,
    });

  assert.equal(
    result.id,
    pendingSuggestion._id
  );
  assert.equal(createCalls, 0);
  assert.equal(todoCalls, 1);
}

async function verifyModeratedReplayDoesNotReopenTodo() {
  let todoCalls = 0;
  const approvedSuggestion = {
    ...pendingSuggestion,
    status: "approved",
  };
  const service = loadServiceWithMocks({
    findOne: async () =>
      approvedSuggestion,
    countDocuments: async () => 0,
    create: async () => {
      throw new Error(
        "승인된 재요청은 새로 저장하면 안 됩니다."
      );
    },
    createAdminTodo: async () => {
      todoCalls += 1;
    },
  });

  const result =
    await service.createSuggestion({
      user: {
        id: pendingSuggestion.userId,
      },
      mode: "spicy",
      situation: "incorrect",
      message:
        pendingSuggestion.message,
      requestId:
        pendingSuggestion.requestId,
    });
  assert.equal(
    result.status,
    "approved"
  );
  assert.equal(todoCalls, 0);
}

async function verifyConcurrentDuplicateRecovery() {
  let findCalls = 0;
  let todoCalls = 0;
  const service = loadServiceWithMocks({
    findOne: async () => {
      findCalls += 1;
      return findCalls === 1
        ? null
        : pendingSuggestion;
    },
    countDocuments: async () => 0,
    create: async () => {
      const error = new Error(
        "duplicate key"
      );
      error.code = 11000;
      throw error;
    },
    createAdminTodo: async () => {
      todoCalls += 1;
    },
  });

  const result =
    await service.createSuggestion({
      user: {
        id: pendingSuggestion.userId,
        name: "감사 학생",
      },
      mode: "spicy",
      situation: "incorrect",
      message:
        pendingSuggestion.message,
      requestId:
        pendingSuggestion.requestId,
    });
  assert.equal(
    result.id,
    pendingSuggestion._id
  );
  assert.equal(findCalls, 2);
  assert.equal(todoCalls, 1);
}

async function verifyConcurrentDailyQuota() {
  const suggestions = [];
  let quota = null;
  let nextId = 200;
  const service = loadServiceWithMocks({
    findOne: async (query) =>
      suggestions.find(
        (item) =>
          item.userId === query.userId &&
          item.requestId === query.requestId
      ) || null,
    countDocuments: async () =>
      suggestions.length,
    create: async (input) => {
      const item = {
        _id: `64b000000000000000000${nextId++}`,
        ...input,
        status: "pending",
        rejectionReason: "",
        createdAt: new Date(),
        moderatedAt: null,
      };
      suggestions.push(item);
      return item;
    },
    createAdminTodo: async (input) =>
      input,
    quotaFindOneAndUpdate: (
      query,
      update
    ) => ({
      lean: async () => {
        if (
          !quota ||
          quota.userId !== query.userId ||
          quota.dayKey !== query.dayKey ||
          quota.count >= 10
        ) {
          return null;
        }
        quota.count +=
          update.$inc.count;
        return { ...quota };
      },
    }),
    quotaCreate: async (input) => {
      if (quota) {
        const error = new Error(
          "duplicate quota"
        );
        error.code = 11000;
        throw error;
      }
      quota = { ...input };
      return quota;
    },
    quotaUpdateOne: async () => {
      if (quota?.count > 0) {
        quota.count -= 1;
      }
    },
  });

  const attempts = await Promise.allSettled(
    Array.from(
      { length: 12 },
      (_, index) =>
        service.createSuggestion({
          user: {
            id: pendingSuggestion.userId,
            name: "감사 학생",
          },
          mode: "spicy",
          situation: "incorrect",
          message: `동시 한도 검증 문구 ${index + 1}`,
          requestId:
            `audit-daily-request-${String(index + 1).padStart(3, "0")}`,
        })
    )
  );
  const fulfilled = attempts.filter(
    (item) => item.status === "fulfilled"
  );
  const rejected = attempts.filter(
    (item) => item.status === "rejected"
  );
  assert.equal(fulfilled.length, 10);
  assert.equal(rejected.length, 2);
  assert.ok(
    rejected.every(
      (item) =>
        item.reason.status === 429
    )
  );
  assert.equal(suggestions.length, 10);
  assert.equal(quota.count, 10);
}

async function verifySubmissionDoesNotSendEmail() {
  let todoCalls = 0;
  let moderationNoticeCalls = 0;
  const service = loadServiceWithMocks({
    findOne: async () => null,
    countDocuments: async () => 0,
    create: async (input) => ({
      ...pendingSuggestion,
      ...input,
      _id: "64b000000000000000000301",
      status: "pending",
    }),
    createAdminTodo: async () => {
      todoCalls += 1;
      return {};
    },
    deliverModerationNotice: async () => {
      moderationNoticeCalls += 1;
      throw new Error(
        "제안 등록 단계에서는 이메일·알림을 보내면 안 됩니다."
      );
    },
  });

  const result =
    await service.createSuggestion({
      user: {
        id: pendingSuggestion.userId,
        name: "감사 학생",
        email: "audit@example.com",
      },
      mode: pendingSuggestion.mode,
      situation:
        pendingSuggestion.situation,
      message:
        pendingSuggestion.message,
      requestId:
        "audit-no-email-request-001",
    });

  assert.equal(result.status, "pending");
  assert.equal(todoCalls, 1);
  assert.equal(
    moderationNoticeCalls,
    0
  );
}

async function verifyModerationDeliveryAndAudit({
  action,
  delivered,
}) {
  const adminUserId =
    "64b000000000000000000010";
  const notificationId =
    "64b000000000000000000020";
  const moderationStatus =
    action === "approve"
      ? "approved"
      : "rejected";
  const moderatedSuggestion = {
    ...pendingSuggestion,
    status: moderationStatus,
    rejectionReason:
      action === "reject"
        ? "서비스 기준에 맞지 않습니다."
        : "",
    moderatedBy: adminUserId,
    moderatedAt: new Date(),
  };
  const targetUser = {
    _id: pendingSuggestion.userId,
    name: "감사 학생",
    email: "audit@example.com",
  };
  const noticeCalls = [];
  const auditCalls = [];
  const completedTodos = [];

  const service = loadServiceWithMocks({
    findOne: async () => null,
    countDocuments: async () => 0,
    create: async () => {
      throw new Error(
        "검수 테스트에서 제안을 생성하면 안 됩니다."
      );
    },
    createAdminTodo: async () => ({}),
    suggestionFindOneAndUpdate: async (
      query,
      update
    ) => {
      assert.equal(
        query.status,
        "pending"
      );
      assert.equal(
        update.$set.status,
        moderationStatus
      );
      return moderatedSuggestion;
    },
    suggestionFind: (query) => {
      assert.equal(
        query.status,
        "approved"
      );
      return approvedSuggestionQuery(
        action === "approve"
          ? [moderatedSuggestion]
          : []
      );
    },
    userFindById: (userId) => {
      assert.equal(
        String(userId),
        pendingSuggestion.userId
      );
      return leanQuery(targetUser);
    },
    deliverModerationNotice: async (
      input
    ) => {
      noticeCalls.push(input);
      return {
        notification: {
          _id: notificationId,
        },
        delivery: delivered
          ? {
              delivered: true,
              providerMessageId:
                "smtp-message-id",
            }
          : {
              delivered: false,
              error:
                "SMTP 테스트 실패",
            },
      };
    },
    createAdminActionLog: async (
      input
    ) => {
      auditCalls.push(input);
      return input;
    },
    completeAdminTodoBySource: async (
      input
    ) => {
      completedTodos.push(input);
      return input;
    },
  });

  const rejectionReason =
    "서비스 기준에 맞지 않습니다.";
  const result =
    await service.moderateSuggestion({
      adminUser: {
        id: adminUserId,
        role: "admin",
      },
      suggestionId:
        pendingSuggestion._id,
      action,
      rejectionReason,
    });

  assert.equal(
    result.status,
    moderationStatus
  );
  assert.equal(noticeCalls.length, 1);
  assert.equal(
    noticeCalls[0].user.email,
    targetUser.email
  );
  assert.equal(
    noticeCalls[0].href,
    "/coach-suggestions"
  );
  assert.match(
    noticeCalls[0].title,
    action === "approve"
      ? /승인/
      : /반려/
  );
  assert.match(
    noticeCalls[0].message,
    action === "approve"
      ? /코치 문구에 반영/
      : new RegExp(
          rejectionReason
        )
  );
  assert.equal(auditCalls.length, 1);
  assert.equal(
    auditCalls[0].action,
    `coach-suggestion.${action}`
  );
  assert.equal(
    auditCalls[0].targetUserId,
    pendingSuggestion.userId
  );
  assert.equal(
    auditCalls[0].metadata
      .siteNotificationId,
    notificationId
  );
  assert.equal(
    auditCalls[0].metadata
      .emailStatus,
    delivered ? "SENT" : "FAILED"
  );
  assert.equal(
    auditCalls[0].metadata
      .rejectionReason,
    action === "approve"
      ? ""
      : rejectionReason
  );
  assert.equal(completedTodos.length, 1);
}

async function run() {
  verifyUniqueIndex();
  await renderForm();
  await verifyExistingReplayRepairsTodo();
  await verifyModeratedReplayDoesNotReopenTodo();
  await verifyConcurrentDuplicateRecovery();
  await verifyConcurrentDailyQuota();
  await verifySubmissionDoesNotSendEmail();
  await verifyModerationDeliveryAndAudit({
    action: "approve",
    delivered: true,
  });
  await verifyModerationDeliveryAndAudit({
    action: "reject",
    delivered: false,
  });
  const serverSource =
    fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "server.js"
      ),
      "utf8"
    );
  assert.match(
    serverSource,
    /await ensureCoachSuggestionIndexes\(\)/
  );
  const adminTodoSource =
    fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "services",
        "adminTodoService.js"
      ),
      "utf8"
    );
  assert.doesNotMatch(
    adminTodoSource,
    /emailService|send[A-Za-z]*Email/
  );
  console.log(
    "Coach suggestion workflow verified: submission sends no user/admin email, while approve/reject notification-email-audit delivery, request idempotency, quota, and admin-todo behavior all pass."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

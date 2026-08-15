const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const modelExports = require("../models/matthsModel");
const adminTodoService = require("../services/adminTodoService");

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
}) {
  modelExports.CoachMessageSuggestion.findOne =
    findOne;
  modelExports.CoachMessageSuggestion.countDocuments =
    countDocuments;
  modelExports.CoachMessageSuggestion.create =
    create;
  modelExports.CoachSuggestionQuota.findOneAndUpdate =
    quotaFindOneAndUpdate;
  modelExports.CoachSuggestionQuota.create =
    quotaCreate;
  modelExports.CoachSuggestionQuota.updateOne =
    quotaUpdateOne;
  adminTodoService.createAdminTodo =
    createAdminTodo;
  delete require.cache[servicePath];
  return require(servicePath);
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

async function run() {
  verifyUniqueIndex();
  await renderForm();
  await verifyExistingReplayRepairsTodo();
  await verifyModeratedReplayDoesNotReopenTodo();
  await verifyConcurrentDuplicateRecovery();
  await verifyConcurrentDailyQuota();
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
  console.log(
    "Coach suggestion idempotency verified: rendered request keys, unique storage, concurrent duplicate recovery, atomic 10-per-KST-day quota, and admin-todo repair all pass."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

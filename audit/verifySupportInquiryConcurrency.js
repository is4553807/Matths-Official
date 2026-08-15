const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const mongoose = require("mongoose");

const modelExports = require("../models/matthsModel");
const adminTodoService = require("../services/adminTodoService");
const emailService = require("../services/emailService");
const refundService = require("../services/refundService");

const servicePath = require.resolve(
  "../services/supportInquiryService"
);
const root = path.resolve(__dirname, "..");
const userId = "64b000000000000000000001";
const requestId =
  "5a8ebeb1-0b55-4d70-a200-8a1d58c85b2e";

function verifySchemas() {
  assert.ok(
    modelExports.SupportInquiry.schema.path(
      "requestId"
    )
  );
  const uniqueRequestIndex =
    modelExports.SupportInquiry.schema
      .indexes()
      .find(
        ([fields]) =>
          fields.userId === 1 &&
          fields.submittedByType === 1 &&
          fields.parentAccountId === 1 &&
          fields.requestId === 1
      );
  assert.ok(uniqueRequestIndex);
  assert.equal(
    uniqueRequestIndex[1].unique,
    true
  );

  const ttlIndex =
    modelExports.SupportInquirySubmissionGuard.schema
      .indexes()
      .find(
        ([fields]) =>
          fields.nextAllowedAt === 1
      );
  assert.ok(ttlIndex);
  assert.equal(
    ttlIndex[1].expireAfterSeconds,
    0
  );
}

async function verifyRenderedRequestKeys() {
  const contactHtml = await ejs.renderFile(
    path.join(root, "views", "contact.ejs"),
    {
      user: {
        id: userId,
        name: "감사 학생",
        role: "student",
      },
      contactData: {
        user: {
          id: userId,
          nickname: "감사 학생",
          realName: "감사 학생",
          email: "audit@example.com",
          schoolName: "감사고등학교",
          schoolGrade: 3,
        },
        inquiries: [],
        refundableOrders: [],
      },
      feedback: null,
      inquiryRequestId: requestId,
      oldInput: {
        inquiryType: "GENERAL",
        paymentId: "",
        refundReasonType: "SIMPLE_CHANGE",
        subject: "",
        content: "",
      },
    }
  );
  assert.match(
    contactHtml,
    new RegExp(
      `name="requestId" value="${requestId}"`
    )
  );

  const parentHtml = await ejs.renderFile(
    path.join(
      root,
      "views",
      "parent-inquiries.ejs"
    ),
    {
      parent: {
        _id: "64b000000000000000000002",
        username: "감사 학부모",
      },
      child: {
        _id: userId,
        name: "감사 학생",
        realName: "감사 학생",
      },
      familyChildren: [],
      selectedChildId: userId,
      inquiryData: {
        contactEmail: "parent@example.com",
        inquiries: [],
      },
      inquiryRequestId: requestId,
      feedback: "",
      error: "",
      oldInput: {
        subject: "",
        content: "",
      },
    }
  );
  assert.match(
    parentHtml,
    new RegExp(
      `name="requestId" value="${requestId}"`
    )
  );
}

function buildDocument(data) {
  return {
    _id: data._id,
    ...data,
    status: data.status || "pending",
    emailNotification:
      data.emailNotification || {
        status: "pending",
      },
    createdAt:
      data.createdAt || new Date(),
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  };
}

async function verifyAtomicSubmission() {
  const records = [];
  const guards = new Map();
  let createCount = 0;
  let emailCount = 0;
  let todoCount = 0;
  let nextId = 100;

  modelExports.User.findOne = () => ({
    lean: async () => ({
      _id: userId,
      name: "감사 학생",
      realName: "감사 학생",
      email: "audit@example.com",
      school: { name: "감사고등학교" },
      isActive: true,
    }),
  });
  modelExports.SupportInquiry.findOne =
    async (query) =>
      records.find(
        (item) =>
          String(item.userId) ===
            String(query.userId) &&
          item.requestId === query.requestId
      ) || null;
  modelExports.SupportInquiry.create =
    async ([input]) => {
      if (
        records.some(
          (item) =>
            String(item.userId) ===
              String(input.userId) &&
            item.requestId === input.requestId
        )
      ) {
        const error = new Error(
          "SupportInquiry duplicate request"
        );
        error.code = 11000;
        error.keyPattern = {
          userId: 1,
          requestId: 1,
        };
        throw error;
      }
      createCount += 1;
      const record = buildDocument({
        ...input,
        _id: `64b000000000000000000${nextId++}`,
      });
      records.push(record);
      return [record];
    };
  modelExports.SupportInquiry.updateOne =
    async (query, update) => {
      const record = records.find(
        (item) =>
          String(item._id) ===
          String(query._id)
      );
      if (record) {
        record.emailNotification = {
          status:
            update.$set[
              "emailNotification.status"
            ],
          attemptedAt:
            update.$set[
              "emailNotification.attemptedAt"
            ],
          providerMessageId:
            update.$set[
              "emailNotification.providerMessageId"
            ],
          errorMessage:
            update.$set[
              "emailNotification.errorMessage"
            ],
        };
      }
    };
  modelExports.SupportInquirySubmissionGuard.findOneAndUpdate =
    async (query, update) => {
      const current = guards.get(query._id);
      const now = query.$or[0].nextAllowedAt.$lte;
      const sameRequest =
        current?.requestId ===
        query.$or[1].requestId;
      const expired =
        !current ||
        current.nextAllowedAt <= now;
      if (!expired && !sameRequest) {
        const error = new Error(
          "SupportInquirySubmissionGuard duplicate _id"
        );
        error.code = 11000;
        error.keyPattern = { _id: 1 };
        throw error;
      }
      const next = {
        _id: query._id,
        ...update.$setOnInsert,
        ...update.$set,
      };
      guards.set(query._id, next);
      return next;
    };

  mongoose.startSession = async () => ({
    withTransaction: async (operation) =>
      operation(),
    endSession: async () => {},
  });
  adminTodoService.createAdminTodo =
    async (input) => {
      todoCount += 1;
      return input;
    };
  emailService.sendSupportInquiryNotification =
    async () => {
      emailCount += 1;
      return {
        delivered: true,
        providerMessageId: "audit-message",
      };
    };
  refundService.createRefundRequest =
    async () => {
      throw new Error(
        "일반 문의에서 환불 요청을 만들면 안 됩니다."
      );
    };

  delete require.cache[servicePath];
  const service = require(servicePath);
  const input = {
    userId,
    requestId,
    subject: "동시 제출 감사",
    content:
      "같은 문의는 동시에 제출해도 한 번만 저장되어야 합니다.",
  };

  const results = await Promise.all([
    service.createSupportInquiry(input),
    service.createSupportInquiry(input),
  ]);
  assert.equal(results.length, 2);
  assert.equal(createCount, 1);
  assert.equal(records.length, 1);
  assert.equal(emailCount, 1);
  assert.ok(todoCount >= 1);

  await assert.rejects(
    service.createSupportInquiry({
      ...input,
      requestId:
        "6b9fcfc2-1c66-5e81-b311-9b2e69d96c3f",
    }),
    (error) =>
      error.status === 429
  );
  assert.equal(createCount, 1);

  const guard = guards.get(
    `STUDENT:${userId}`
  );
  guard.nextAllowedAt = new Date(0);
  const afterCooldown =
    await service.createSupportInquiry({
      ...input,
      requestId:
        "7ca0d0d3-2d77-6f92-c422-ac3f70ea7d40",
    });
  assert.equal(afterCooldown.emailStatus, "sent");
  assert.equal(createCount, 2);
  assert.equal(emailCount, 2);

  await assert.rejects(
    service.createSupportInquiry({
      ...input,
      requestId: "bad",
    }),
    (error) =>
      error.status === 400
  );
}

async function run() {
  verifySchemas();
  await verifyRenderedRequestKeys();
  await verifyAtomicSubmission();

  const serverSource = fs.readFileSync(
    path.join(root, "server.js"),
    "utf8"
  );
  assert.match(
    serverSource,
    /await ensureSupportInquiryIndexes\(\)/
  );
  console.log(
    "Support inquiry concurrency verified: student and parent forms carry request keys, simultaneous retries create one record/email, cooldown is atomic, indexes are explicit, and invalid keys are rejected."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

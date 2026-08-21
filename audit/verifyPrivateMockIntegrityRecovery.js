"use strict";

/*
 * Crash-recovery contract for integrity evidence requests.  This stays
 * database-free, but uses the same model calls as production and deliberately
 * interrupts each durable side effect in turn.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const resolveFromRoot = (relativePath) =>
  require.resolve(path.join(repoRoot, relativePath));
const stub = (relativePath, exports) => {
  const filename = resolveFromRoot(relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  };
};
const clone = (value) => (value == null ? value : structuredClone(value));
const query = (value) => ({
  lean: async () => clone(value),
  then(resolve, reject) {
    return Promise.resolve(clone(value)).then(resolve, reject);
  },
});

const realModels = require(resolveFromRoot("models/matthsModel.js"));
const integritySchema = realModels.PrivateMockIntegrityCase.schema;
const integrityIndex =
  realModels.PRIVATE_MOCK_INTEGRITY_CASE_ATTEMPT_INDEX;

assert.ok(integritySchema.path("attemptId"));
assert.equal(integritySchema.path("attemptId").options.unique, true);
assert.deepEqual(integrityIndex, {
  key: { attemptId: 1 },
  name: "attemptId_1",
});

const USER_ID = "64d000000000000000000051";
const ADMIN_ID = "64d000000000000000000052";
const EXAM_ID = "64d000000000000000000053";
const ATTEMPT_ID = "64d000000000000000000054";
const CASE_ID = "64d000000000000000000055";
const NOW = new Date("2026-08-22T03:00:00.000Z");

const exam = {
  _id: EXAM_ID,
  weekKey: "2026-08-23",
  releaseAt: new Date("2026-08-22T01:00:00.000Z"),
};
const attempt = {
  _id: ATTEMPT_ID,
  userId: USER_ID,
  weekKey: "2026-08-23",
};
const requestedBy = {
  _id: ADMIN_ID,
  email: "admin@example.com",
};

let caseState;
let attemptState;
let events;
let notifications;
let failStep;
let integrityIndexEnsureCount;
let eventIndexEnsureCount;
let emailSendCount;

function reset({ existingCase = false } = {}) {
  caseState = existingCase
    ? {
        _id: CASE_ID,
        userId: USER_ID,
        examId: EXAM_ID,
        attemptId: ATTEMPT_ID,
        weekKey: "2026-08-23",
        requestedQuestionNumbers: [28, 30],
        evidenceRequest: {
          requestedAt: NOW,
          requestedBy: ADMIN_ID,
          deadlineAt: new Date("2026-08-24T03:00:00.000Z"),
          instructions: "전체 풀이과정을 제출해주세요.",
        },
        notificationId: null,
      }
    : null;
  attemptState = {
    _id: ATTEMPT_ID,
    integrityStatus: "NOT_REVIEWED",
    integrityCaseId: null,
    usedForWeeklyRanking: true,
    usedForMmrStability: true,
  };
  events = [];
  notifications = [];
  failStep = "";
  integrityIndexEnsureCount = 0;
  eventIndexEnsureCount = 0;
  emailSendCount = 0;
}

const PrivateMockIntegrityCase = {
  collection: {
    async createIndex() {
      integrityIndexEnsureCount += 1;
      return "attemptId_1";
    },
  },
  findOne(filter) {
    return query(
      caseState && String(caseState.attemptId) === String(filter.attemptId)
        ? caseState
        : null
    );
  },
  async create(payload) {
    assert.ok(
      integrityIndexEnsureCount > 0,
      "runtime case index must be ensured before create"
    );
    if (caseState) {
      const error = new Error("duplicate attempt case");
      error.code = 11000;
      throw error;
    }
    caseState = {
      _id: CASE_ID,
      notificationId: null,
      ...clone(payload),
    };
    return clone(caseState);
  },
  async findOneAndUpdate(filter, update) {
    if (!caseState || String(filter._id) !== String(caseState._id)) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(filter, "notificationId")) {
      if (String(caseState.notificationId || "") !== String(filter.notificationId || "")) {
        return null;
      }
    }
    if (failStep === "case-link") {
      failStep = "";
      throw new Error("simulated crash before notification link");
    }
    Object.assign(caseState, clone(update.$set || {}));
    return clone(caseState);
  },
  findById(id) {
    return query(caseState && String(caseState._id) === String(id) ? caseState : null);
  },
};

const PrivateMockExamAttempt = {
  async updateOne(filter, update) {
    assert.equal(String(filter._id), ATTEMPT_ID);
    Object.assign(attemptState, clone(update.$set || {}));
    return { acknowledged: true, modifiedCount: 1 };
  },
};

const PrivateMockExamEvent = {
  findOne(filter) {
    return query(
      events.find(
        (event) =>
          String(event.attemptId) === String(filter.attemptId) &&
          event.eventType === filter.eventType
      ) || null
    );
  },
  async updateOne(filter, update, options) {
    assert.ok(options?.upsert);
    assert.ok(eventIndexEnsureCount > 0, "event receipt index must be ensured before upsert");
    if (failStep === "event") {
      failStep = "";
      throw new Error("simulated crash before integrity event");
    }
    const existing = events.find(
      (event) =>
        String(event.attemptId) === String(filter.attemptId) &&
        event.submissionRequestId === filter.submissionRequestId &&
        event.submissionEventIndex === filter.submissionEventIndex
    );
    if (!existing) events.push(clone(update.$setOnInsert));
    return { acknowledged: true, upsertedCount: existing ? 0 : 1 };
  },
};

const User = {
  findById(id) {
    return query(
      String(id) === USER_ID
        ? { _id: USER_ID, email: "student@example.com" }
        : null
    );
  },
};

const UserNotification = {
  findOne(filter) {
    return query(
      notifications.find((notice) => notice.dedupeKey === filter.dedupeKey) || null
    );
  },
  findById(id) {
    return query(
      notifications.find((notice) => String(notice._id) === String(id)) || null
    );
  },
  async create(payload) {
    if (failStep === "notice") {
      failStep = "";
      throw new Error("simulated crash before integrity notice");
    }
    if (notifications.some((notice) => notice.dedupeKey === payload.dedupeKey)) {
      const error = new Error("duplicate notice");
      error.code = 11000;
      throw error;
    }
    if (notifications.some((notice) => String(notice._id) === String(payload._id))) {
      const error = new Error("duplicate notification id");
      error.code = 11000;
      throw error;
    }
    const notification = clone(payload);
    notifications.push(notification);
    return clone(notification);
  },
};

reset();

stub("models/matthsModel.js", {
  AdminActionLog: {},
  Announcement: {},
  ArchiveFolder: {},
  ArchiveItem: {},
  AssessmentAttempt: {},
  PrivateMockExam: {},
  PrivateMockExamAttempt,
  PrivateMockExamEvent,
  async ensurePrivateMockSubmissionEventIndex(model) {
    assert.equal(model, PrivateMockExamEvent);
    eventIndexEnsureCount += 1;
  },
  PrivateMockAnswerCorrection: {},
  PrivateMockIntegrityCase,
  async ensurePrivateMockIntegrityCaseAttemptIndex(model) {
    assert.equal(model, PrivateMockIntegrityCase);
    integrityIndexEnsureCount += 1;
  },
  PrivateMockObjection: {},
  PrivateMockResource: {},
  PrivateMockWeeklyResult: {},
  PrivateMockUploadReminder: {},
  RankingProfile: {},
  User,
  UserNotification,
});
stub("models/goatArenaModel.js", { AccessCycle: {}, ArenaAccessState: {} });
stub("services/archiveService.js", {});
stub("services/adminService.js", {});
stub("services/mmrService.js", {});
stub("services/emailService.js", {
  async sendAdminUserEmail() {
    emailSendCount += 1;
    return { delivered: true };
  },
});
stub("services/userIdentityService.js", {});
stub("services/moderationNoticeService.js", {});
stub("services/adminIdentityService.js", {
  async getActiveAdminSender() {
    return { email: "admin@example.com" };
  },
});
stub("services/adminTodoService.js", {});
stub("services/paidFeatureAccessService.js", {});
stub("services/operationalMetricEventService.js", {});
stub("services/fileStorageService.js", { STORAGE_PURPOSES: {} });
stub("content/email/privateMock.js", {
  evidenceRequest() {
    return {
      title: "evidence request",
      inboxMessage: "submit evidence",
      emailSubject: "evidence request",
      emailMessage: "submit evidence",
    };
  },
});

const servicePath = resolveFromRoot("services/privateMockExamService.js");
delete require.cache[servicePath];
const { createPrivateMockIntegrityRequest } = require(servicePath);

const request = () =>
  createPrivateMockIntegrityRequest({
    exam,
    attempt,
    requestedBy,
    requestedQuestionNumbers: [28, 30],
    instructions: "전체 풀이과정을 제출해주세요.",
    source: "automatic",
    now: NOW,
  });

async function expectCrash(step) {
  reset();
  failStep = step;
  await assert.rejects(request());
  assert.ok(caseState, `${step}: case must survive its creation`);
  const recovered = await request();
  assert.equal(recovered.created, false, `${step}: retry must reuse the case`);
  assert.equal(attemptState.integrityStatus, "PENDING_INTEGRITY_REVIEW");
  assert.equal(String(attemptState.integrityCaseId), CASE_ID);
  assert.equal(events.length, 1, `${step}: only one event may remain`);
  assert.equal(notifications.length, 1, `${step}: only one notice may remain`);
  assert.equal(emailSendCount, 1, `${step}: recovery must issue one notice email`);
  assert.equal(
    String(caseState.notificationId),
    String(notifications[0]._id),
    `${step}: case must retain the durable notification id`
  );
  assert.equal(events[0].submissionEventIndex, 0);
  assert.match(events[0].submissionRequestId, /^integrity-evidence-request:/);
}

async function verifyRuntimeIndexEnsure() {
  const calls = [];
  const model = {
    collection: {
      async createIndex(key, options) {
        calls.push({ key, options });
      },
    },
  };
  await Promise.all([
    realModels.ensurePrivateMockIntegrityCaseAttemptIndex(model),
    realModels.ensurePrivateMockIntegrityCaseAttemptIndex(model),
  ]);
  assert.deepEqual(calls, [
    {
      key: { attemptId: 1 },
      options: { name: "attemptId_1", unique: true },
    },
  ]);
}

async function verifyConcurrentExistingRecovery() {
  reset({ existingCase: true });
  const results = await Promise.all([request(), request()]);
  assert.deepEqual(
    results.map((result) => result.created),
    [false, false]
  );
  assert.equal(events.length, 1, "concurrent recovery must retain one event");
  assert.equal(notifications.length, 1, "concurrent recovery must retain one notice");
  assert.equal(emailSendCount, 1, "concurrent recovery must issue one notice email");
  assert.equal(
    String(caseState.notificationId),
    String(notifications[0]._id)
  );
}

(async () => {
  await verifyRuntimeIndexEnsure();
  await expectCrash("event");
  await expectCrash("notice");
  await expectCrash("case-link");
  await verifyConcurrentExistingRecovery();
  console.log("Private mock integrity crash-recovery contract verified.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

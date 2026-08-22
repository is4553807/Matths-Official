"use strict";

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

const realModels = require(resolveFromRoot("models/matthsModel.js"));
const examSchema = realModels.PrivateMockExam.schema;
const attemptSchema = realModels.PrivateMockExamAttempt.schema;
const eventSchema = realModels.PrivateMockExamEvent.schema;
const userSchema = realModels.User.schema;
const submissionIndex =
  realModels.PRIVATE_MOCK_SUBMISSION_EVENT_INDEX;

assert.ok(examSchema.path("settlementCompletedAt"));
assert.ok(attemptSchema.path("expiredAt"));
assert.ok(attemptSchema.path("submissionReceipt.requestId"));
assert.ok(attemptSchema.path("submissionReceipt.payloadHash"));
assert.ok(attemptSchema.path("submissionReceipt.acceptedAt"));
assert.ok(attemptSchema.path("submissionReceipt.clientCapturedAt"));
assert.ok(attemptSchema.path("submissionClaim.requestId"));
assert.ok(attemptSchema.path("submissionClaim.payloadHash"));
assert.ok(attemptSchema.path("submissionClaim.receivedAt"));
assert.ok(attemptSchema.path("submissionClaim.expiresAt"));
assert.ok(attemptSchema.path("submissionFinalization.status"));
assert.ok(attemptSchema.path("submissionFinalization.requestId"));
assert.ok(attemptSchema.path("submissionFinalization.normalizedEvents"));
assert.ok(attemptSchema.path("submissionFinalization.processingToken"));
assert.ok(attemptSchema.path("submissionFinalization.leaseExpiresAt"));
assert.ok(eventSchema.path("submissionRequestId"));
assert.ok(eventSchema.path("submissionEventIndex"));
assert.ok(userSchema.path("studyActivityReceiptIds"));
assert.deepEqual(submissionIndex.key, {
  attemptId: 1,
  submissionRequestId: 1,
  submissionEventIndex: 1,
});
assert.equal(
  submissionIndex.name,
  "private_mock_submission_event_receipt_unique"
);
const submissionEventIndex = eventSchema.indexes().find(
  ([fields]) =>
    fields.attemptId === 1 &&
    fields.submissionRequestId === 1 &&
    fields.submissionEventIndex === 1
);
assert.ok(submissionEventIndex);
assert.equal(submissionEventIndex[1].unique, true);

const USER_ID = "64d000000000000000000051";
const EXAM_ID = "64d000000000000000000052";
const ATTEMPT_ID = "64d000000000000000000053";
const RELEASE_AT = new Date("2026-08-22T01:00:00.000Z");
const CLOSE_AT = new Date("2026-08-22T02:40:00.000Z");
const STARTED_AT = new Date("2026-08-22T01:00:00.000Z");
const REQUEST_ID = "private-mock-submit-contract-0001";

const exam = {
  _id: EXAM_ID,
  status: "open",
  releaseAt: RELEASE_AT,
  closeAt: CLOSE_AT,
  durationMinutes: 100,
  questionCount: 2,
  answerKey: ["1", "2"],
  points: [50, 50],
  weekKey: "2026-08-23",
  attemptNumber: 1,
  formCode: "A",
  isTest: true,
  aggregationStartsAt: CLOSE_AT,
  settlementCompletedAt: null,
};

let attempt;
let storedEvents;
let draftUpdateBarrier = null;
let throwDuplicateBulkWriteOnce = false;
let throwFinalizeFailureOnce = false;
let adminAllowed = true;
let userState;
let ensureIndexCallCount = 0;
let throwAfterActivityCommitOnce = false;
let ensureIndexBarrier = null;
let schedulerDue = false;
let standardMetricWriteCount = 0;
let weeklySyncCount = 0;
let initialAttemptReadBarrier = null;
let aggregationQuerySawSubmitted = false;
let aggregationQuerySawCompletedOutbox = false;
let allowAggregationCandidate = false;
let rankingWriteCount = 0;
let expiryUpdateBarrier = null;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function query(value) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    async lean() {
      return clone(value);
    },
    then(resolve, reject) {
      return Promise.resolve(clone(value)).then(resolve, reject);
    },
  };
}

function resetAttempt(overrides = {}) {
  exam.status = "open";
  exam.isTest = true;
  exam.settlementCompletedAt = null;
  attempt = {
    _id: ATTEMPT_ID,
    examId: EXAM_ID,
    userId: USER_ID,
    weekKey: exam.weekKey,
    attemptNumber: exam.attemptNumber,
    formCode: exam.formCode,
    answers: ["", ""],
    answeredCount: 0,
    score: 0,
    correctCount: 0,
    correctByQuestion: [],
    scoreBreakdown: {},
    elapsedMs: 0,
    status: "in_progress",
    startedAt: STARTED_AT,
    lastSavedAt: null,
    submittedAt: null,
    expiredAt: null,
    submissionReceipt: {
      requestId: "",
      payloadHash: "",
      acceptedAt: null,
      clientCapturedAt: null,
    },
    submissionClaim: {
      requestId: "",
      payloadHash: "",
      receivedAt: null,
      expiresAt: null,
    },
    submissionFinalization: {
      status: "",
      requestId: "",
      normalizedEvents: [],
      clientCapturedAt: null,
      processingToken: "",
      leaseExpiresAt: null,
      lastAttemptAt: null,
      completedAt: null,
      lastError: "",
    },
    usedForIntegrityAnalysis: true,
    ...overrides,
  };
  storedEvents = new Map();
  draftUpdateBarrier = null;
  throwDuplicateBulkWriteOnce = false;
  throwFinalizeFailureOnce = false;
  adminAllowed = true;
  ensureIndexCallCount = 0;
  ensureIndexBarrier = null;
  schedulerDue = false;
  standardMetricWriteCount = 0;
  weeklySyncCount = 0;
  initialAttemptReadBarrier = null;
  aggregationQuerySawSubmitted = false;
  aggregationQuerySawCompletedOutbox = false;
  allowAggregationCandidate = false;
  rankingWriteCount = 0;
  expiryUpdateBarrier = null;
}

function resetUserActivity() {
  userState = {
    _id: USER_ID,
    role: "admin",
    email: "audit@example.com",
    privateMockRestriction: { active: false },
    totalStudySeconds: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    studyActivityReceiptIds: [],
  };
  throwAfterActivityCommitOnce = false;
}

function pauseNextDraftUpdate() {
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  draftUpdateBarrier = {
    entered,
    releasePromise,
  };
  return {
    entered: enteredPromise,
    release,
  };
}

function pauseNextIndexEnsure() {
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  ensureIndexBarrier = {
    entered,
    releasePromise,
  };
  return {
    entered: enteredPromise,
    release,
  };
}

function pauseNextInitialAttemptRead() {
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  initialAttemptReadBarrier = {
    entered,
    releasePromise,
  };
  return {
    entered: enteredPromise,
    release,
  };
}

function pauseNextExpiryUpdate() {
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  expiryUpdateBarrier = {
    entered,
    releasePromise,
  };
  return {
    entered: enteredPromise,
    release,
  };
}

function attemptPath(path) {
  return String(path)
    .split(".")
    .reduce(
      (value, key) => value?.[key],
      attempt
    );
}

function sameValue(left, right) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  return String(left) === String(right);
}

function matchesValue(actual, expected) {
  if (
    expected &&
    typeof expected === "object" &&
    !Array.isArray(expected) &&
    !(expected instanceof Date)
  ) {
    if (expected.$not) return !matchesValue(actual, expected.$not);
    if (expected.$exists !== undefined) {
      if ((actual !== undefined) !== expected.$exists) return false;
    }
    if (expected.$in && !expected.$in.some((value) => sameValue(actual, value))) {
      return false;
    }
    if (expected.$nin && expected.$nin.some((value) => sameValue(actual, value))) {
      return false;
    }
    if (expected.$ne !== undefined && sameValue(actual, expected.$ne)) {
      return false;
    }
    if (expected.$gt !== undefined && !(actual > expected.$gt)) return false;
    if (expected.$gte !== undefined && !(actual >= expected.$gte)) return false;
    if (expected.$lt !== undefined && !(actual < expected.$lt)) return false;
    if (expected.$lte !== undefined && !(actual <= expected.$lte)) return false;
    return true;
  }
  return sameValue(actual, expected);
}

function matchesAttemptFilter(filter) {
  for (const [path, expected] of Object.entries(filter)) {
    if (path === "$or") continue;
    if (!matchesValue(attemptPath(path), expected)) return false;
  }
  return (
    !filter.$or ||
    filter.$or.some((condition) => matchesAttemptFilter(condition))
  );
}

function setAttemptPath(path, value) {
  const keys = String(path).split(".");
  let target = attempt;
  for (const key of keys.slice(0, -1)) {
    target[key] ||= {};
    target = target[key];
  }
  target[keys.at(-1)] = clone(value);
}

function applySet(update) {
  for (const [path, value] of Object.entries(update.$set || {})) {
    setAttemptPath(path, value);
  }
  for (const path of Object.keys(update.$unset || {})) {
    if (path === "submissionClaim") {
      attempt.submissionClaim = {
        requestId: "",
        payloadHash: "",
        receivedAt: null,
        expiresAt: null,
      };
    }
  }
}

const PrivateMockExam = {
  findOne(filter) {
    const found = String(filter._id) === EXAM_ID ? exam : null;
    return query(found);
  },
  find(filter) {
    if (
      filter.status === "locked" &&
      filter.closeAt?.$lte &&
      Array.isArray(filter.$or)
    ) {
      const isUnsettled =
        exam.settlementCompletedAt == null;
      const isDue =
        exam.status === "locked" &&
        new Date(exam.closeAt) <=
          new Date(filter.closeAt.$lte) &&
        isUnsettled;
      return query(isDue ? [exam] : []);
    }
    if (
      filter.status === "locked" &&
      filter.aggregationStartsAt?.$lte
    ) {
      assert.deepEqual(
        filter.settlementCompletedAt,
        { $ne: null },
        "aggregation candidates must require the durable settlement marker"
      );
      aggregationQuerySawSubmitted =
        attempt.status === "submitted" &&
        standardMetricWriteCount > 0 &&
        exam.settlementCompletedAt != null;
      aggregationQuerySawCompletedOutbox =
        attempt.submissionFinalization?.status === "completed" &&
        exam.settlementCompletedAt != null;
      return query(
        allowAggregationCandidate ? [exam] : []
      );
    }
    const statuses =
      filter.status?.$in || [];
    const closeCutoff =
      filter.closeAt?.$lte;
    const isDue =
      schedulerDue &&
      closeCutoff &&
      statuses.includes(exam.status) &&
      new Date(exam.closeAt) <= new Date(closeCutoff);
    return query(isDue ? [exam] : []);
  },
  findOneAndUpdate(filter, update) {
    const allowedStatuses =
      filter.status?.$in || [filter.status];
    if (
      String(filter._id) !== EXAM_ID ||
      !allowedStatuses.includes(exam.status)
    ) {
      return query(null);
    }
    if (
      filter.settlementCompletedAt &&
      !matchesValue(
        exam.settlementCompletedAt,
        filter.settlementCompletedAt
      )
    ) {
      return query(null);
    }
    Object.assign(exam, clone(update.$set || {}));
    return query(exam);
  },
  async updateOne(filter, update) {
    if (String(filter._id) !== EXAM_ID) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }
    if (filter.status && filter.status !== exam.status) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }
    Object.assign(exam, clone(update.$set || {}));
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  },
  async updateMany() {
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  },
  async distinct() {
    return [1, 2, 3];
  },
};

const PrivateMockExamAttempt = {
  findOne(filter) {
    if (
      initialAttemptReadBarrier &&
      filter.examId &&
      filter.userId
    ) {
      const barrier = initialAttemptReadBarrier;
      initialAttemptReadBarrier = null;
      return {
        select() {
          return this;
        },
        async lean() {
          barrier.entered();
          await barrier.releasePromise;
          return clone(attempt);
        },
        then(resolve, reject) {
          barrier.entered();
          return barrier.releasePromise
            .then(() => clone(attempt))
            .then(resolve, reject);
        },
      };
    }
    if (!matchesAttemptFilter(filter)) return query(null);
    return query(attempt);
  },
  async findOneAndUpdate(filter, update) {
    if (update.$set?.submissionReceipt) {
      assert.ok(
        ensureIndexCallCount > 0,
        "production submission-event index ensure must run before submit CAS"
      );
    }
    if (!matchesAttemptFilter(filter)) return null;
    applySet(update);
    return clone(attempt);
  },
  async updateOne(filter, update) {
    if (
      expiryUpdateBarrier &&
      update.$set?.status === "expired"
    ) {
      const barrier = expiryUpdateBarrier;
      expiryUpdateBarrier = null;
      barrier.entered();
      await barrier.releasePromise;
    }
    if (
      draftUpdateBarrier &&
      Array.isArray(update.$set?.answers) &&
      !update.$set?.submissionReceipt
    ) {
      const barrier = draftUpdateBarrier;
      draftUpdateBarrier = null;
      barrier.entered();
      await barrier.releasePromise;
    }
    if (!matchesAttemptFilter(filter)) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }
    applySet(update);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  },
  find(filter = {}) {
    return query(
      matchesAttemptFilter(filter)
        ? [attempt]
        : []
    );
  },
  async updateMany(filter, update) {
    if (
      filter.status === "in_progress" &&
      attempt.status === "in_progress"
    ) {
      const activeClaim =
        attempt.submissionClaim?.requestId &&
        attempt.submissionClaim?.expiresAt &&
        new Date(attempt.submissionClaim.expiresAt) >=
          new Date(update.$set.expiredAt);
      if (!activeClaim) {
        applySet(update);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  },
  async countDocuments(filter) {
    return Number(
      matchesAttemptFilter(filter)
    );
  },
  async distinct(field, filter) {
    if (
      field === "userId" &&
      filter.status === "submitted" &&
      attempt.status === "submitted"
    ) {
      return [USER_ID];
    }
    return [];
  },
  async bulkWrite(operations) {
    for (const operation of operations) {
      if (operation.updateOne.update.$set?.standardMetrics) {
        standardMetricWriteCount += 1;
      }
      if (operation.updateOne.update.$set?.rank) {
        rankingWriteCount += 1;
      }
      Object.assign(
        attempt,
        clone(operation.updateOne.update.$set || {})
      );
    }
    return { acknowledged: true, modifiedCount: operations.length };
  },
};

const PrivateMockExamEvent = {
  async bulkWrite(operations) {
    assert.ok(
      ensureIndexCallCount > 0,
      "production submission-event index ensure must run before upsert"
    );
    let upsertedCount = 0;
    if (throwFinalizeFailureOnce) {
      throwFinalizeFailureOnce = false;
      const error = new Error("transient submission finalization failure");
      error.code = 91;
      throw error;
    }
    if (
      throwDuplicateBulkWriteOnce &&
      operations.some(({ updateOne }) => {
        const { filter } = updateOne;
        const key = [
          String(filter.attemptId),
          filter.submissionRequestId,
          filter.submissionEventIndex,
        ].join(":");
        return storedEvents.has(key);
      })
    ) {
      throwDuplicateBulkWriteOnce = false;
      const error = new Error("duplicate submission event upsert");
      error.code = 11000;
      throw error;
    }
    for (const operation of operations) {
      const { filter, update } = operation.updateOne;
      const key = [
        String(filter.attemptId),
        filter.submissionRequestId,
        filter.submissionEventIndex,
      ].join(":");
      if (!storedEvents.has(key)) {
        storedEvents.set(key, clone(update.$setOnInsert));
        upsertedCount += 1;
      }
    }
    return { acknowledged: true, upsertedCount };
  },
  async insertMany(events) {
    for (const [index, event] of events.entries()) {
      storedEvents.set(`draft:${storedEvents.size}:${index}`, clone(event));
    }
    return events;
  },
  find() {
    return query([]);
  },
};

const User = {
  findById() {
    return query(userState);
  },
  async findOneAndUpdate(filter, update) {
    if (String(filter._id) !== USER_ID) return null;
    if (
      Object.prototype.hasOwnProperty.call(
        filter,
        "lastStudyDate"
      ) &&
      String(filter.lastStudyDate || "") !==
        String(userState.lastStudyDate || "")
    ) {
      return null;
    }
    const receiptFilter = filter.studyActivityReceiptIds;
    if (
      receiptFilter?.$ne &&
      userState.studyActivityReceiptIds.includes(receiptFilter.$ne)
    ) {
      return null;
    }
    Object.assign(userState, clone(update.$set || {}));
    if (update.$inc?.totalStudySeconds) {
      userState.totalStudySeconds += update.$inc.totalStudySeconds;
    }
    if (
      update.$addToSet?.studyActivityReceiptIds &&
      !userState.studyActivityReceiptIds.includes(
        update.$addToSet.studyActivityReceiptIds
      )
    ) {
      userState.studyActivityReceiptIds.push(
        update.$addToSet.studyActivityReceiptIds
      );
    }
    if (throwAfterActivityCommitOnce) {
      throwAfterActivityCommitOnce = false;
      throw new Error(
        "activity commit response lost"
      );
    }
    return clone(userState);
  },
  findOne(filter) {
    const receiptId = filter.studyActivityReceiptIds;
    return query(
      String(filter._id) === USER_ID &&
        userState.studyActivityReceiptIds.includes(receiptId)
        ? userState
        : null
    );
  },
};

resetUserActivity();

stub("models/matthsModel.js", {
  AdminActionLog: {},
  Announcement: {},
  ArchiveFolder: {},
  ArchiveItem: {},
  AssessmentAttempt: {},
  PrivateMockExam,
  PrivateMockExamAttempt,
  PrivateMockExamEvent,
  async ensurePrivateMockSubmissionEventIndex(model) {
    assert.equal(model, PrivateMockExamEvent);
    ensureIndexCallCount += 1;
    if (ensureIndexBarrier) {
      const barrier = ensureIndexBarrier;
      ensureIndexBarrier = null;
      barrier.entered();
      await barrier.releasePromise;
    }
  },
  PrivateMockAnswerCorrection: {},
  PrivateMockIntegrityCase: {},
  PrivateMockObjection: {},
  PrivateMockResource: {},
  PrivateMockWeeklyResult: {
    async findOneAndUpdate() {
      weeklySyncCount += 1;
      return {
        attemptCount: 1,
      };
    },
    async updateMany() {
      return { acknowledged: true, modifiedCount: 0 };
    },
  },
  PrivateMockUploadReminder: {},
  RankingProfile: {},
  User,
  UserNotification: {},
});
stub("models/goatArenaModel.js", {
  AccessCycle: {
    find() {
      return query([]);
    },
  },
  ArenaAccessState: {
    find() {
      return query([]);
    },
  },
});
stub("services/archiveService.js", {
  isArchiveAdmin: () => adminAllowed,
});
stub("services/adminService.js", {});
stub("services/mmrService.js", {
  metricForAttempt(attempt) {
    return {
      attempt,
      score: Number(attempt.score) || 0,
      advancedRaw: Number(attempt.score) || 0,
      consistencyScore: 1,
    };
  },
  percentileForValue() {
    return 1;
  },
  calculateActualPerformance() {
    return 1;
  },
});
stub("services/emailService.js", {});
stub("services/userIdentityService.js", {});
stub("services/moderationNoticeService.js", {});
stub("services/adminIdentityService.js", {});
stub("services/adminTodoService.js", {});
stub("services/paidFeatureAccessService.js", {});
stub("services/operationalMetricEventService.js", {});
stub("services/fileStorageService.js", {
  STORAGE_PURPOSES: {},
});
stub("content/email/privateMock.js", {});

const servicePath = resolveFromRoot("services/privateMockExamService.js");
delete require.cache[servicePath];
const privateMockExamService = require(servicePath);
const lifecycleServicePath = resolveFromRoot(
  "services/userLifecycleService.js"
);
delete require.cache[lifecycleServicePath];
const {
  recordStudyActivity,
} = require(lifecycleServicePath);

function submissionInput(overrides = {}) {
  return {
    userId: USER_ID,
    examId: EXAM_ID,
    answers: ["1", "2"],
    telemetryEvents: [
      {
        eventType: "ANSWER_CHANGED",
        questionNumber: 2,
        answerLength: 1,
        clientAt: "2026-08-22T02:39:58.500Z",
      },
    ],
    requestId: REQUEST_ID,
    capturedAt: "2026-08-22T02:39:59.000Z",
    now: new Date("2026-08-22T02:39:59.500Z"),
    ...overrides,
  };
}

async function expectStatus(promise, status) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    return true;
  });
}

async function verifyProductionIndexEnsureContract() {
  const calls = [];
  const model = {
    collection: {
      async createIndex(key, options) {
        calls.push({ key, options });
        return options.name;
      },
    },
  };
  await Promise.all([
    realModels.ensurePrivateMockSubmissionEventIndex(model),
    realModels.ensurePrivateMockSubmissionEventIndex(model),
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    key: {
      attemptId: 1,
      submissionRequestId: 1,
      submissionEventIndex: 1,
    },
    options: {
      name: "private_mock_submission_event_receipt_unique",
      unique: true,
      partialFilterExpression: {
        submissionRequestId: {
          $type: "string",
        },
      },
    },
  });
}

async function verifyConcurrentIdempotency() {
  resetAttempt();
  throwDuplicateBulkWriteOnce = true;
  const results = await Promise.all([
    privateMockExamService.submitPrivateMockAttempt(submissionInput()),
    privateMockExamService.submitPrivateMockAttempt(submissionInput()),
  ]);

  assert.deepEqual(
    results.map((result) => result.replayed).sort(),
    [false, true]
  );
  assert.equal(results[0].receiptId, results[1].receiptId);
  assert.equal(attempt.status, "submitted");
  assert.deepEqual(attempt.answers, ["1", "2"]);
  assert.equal(attempt.score, 100);
  assert.equal(attempt.submissionReceipt.requestId, REQUEST_ID);
  assert.equal(attempt.submissionFinalization.status, "completed");
  assert.equal(userState.totalStudySeconds, attempt.elapsedMs / 1000);
  assert.equal(userState.studyActivityReceiptIds.length, 1);
  assert.equal(storedEvents.size, 2);
  assert.deepEqual(
    [...storedEvents.values()].map((event) => event.eventType).sort(),
    ["ANSWER_CHANGED", "EXAM_SUBMITTED"]
  );
}

async function verifyConcurrentSameKeyDifferentPayloadConflict() {
  resetAttempt();
  resetUserActivity();
  const indexBarrier = pauseNextIndexEnsure();
  const winner =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput()
    );
  await indexBarrier.entered;

  const winningClaim = clone(attempt.submissionClaim);
  await expectStatus(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        answers: ["1", "1"],
      })
    ),
    409
  );
  assert.equal(attempt.status, "in_progress");
  assert.deepEqual(attempt.submissionClaim, winningClaim);
  assert.deepEqual(attempt.answers, ["", ""]);

  indexBarrier.release();
  const result = await winner;
  assert.equal(result.replayed, false);
  assert.equal(attempt.status, "submitted");
  assert.deepEqual(attempt.answers, ["1", "2"]);
  assert.equal(
    attempt.submissionReceipt.requestId,
    REQUEST_ID
  );
  assert.equal(
    attempt.submissionReceipt.payloadHash,
    winningClaim.payloadHash
  );
  assert.equal(storedEvents.size, 2);
}

async function verifyConcurrentDifferentKeyConflict() {
  resetAttempt();
  resetUserActivity();
  const indexBarrier = pauseNextIndexEnsure();
  const winner =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput()
    );
  await indexBarrier.entered;

  const winningClaim = clone(attempt.submissionClaim);
  await expectStatus(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        requestId:
          "private-mock-submit-contract-loser-0002",
      })
    ),
    409
  );
  assert.equal(attempt.status, "in_progress");
  assert.deepEqual(attempt.submissionClaim, winningClaim);
  assert.deepEqual(attempt.answers, ["", ""]);

  indexBarrier.release();
  const result = await winner;
  assert.equal(result.replayed, false);
  assert.equal(attempt.status, "submitted");
  assert.deepEqual(attempt.answers, ["1", "2"]);
  assert.equal(
    attempt.submissionReceipt.requestId,
    REQUEST_ID
  );
  assert.equal(
    attempt.submissionReceipt.payloadHash,
    winningClaim.payloadHash
  );
  assert.equal(storedEvents.size, 2);
}

async function verifyDeadlineReceiptReplay() {
  resetAttempt();
  const first = await privateMockExamService.submitPrivateMockAttempt(
    submissionInput({
      now: new Date("2026-08-22T02:39:59.999Z"),
    })
  );
  adminAllowed = false;
  const replay = await privateMockExamService.submitPrivateMockAttempt(
    submissionInput({
      now: new Date("2026-08-22T02:40:05.000Z"),
    })
  );
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, first.receiptId);
  assert.equal(replay.acceptedAt, "2026-08-22T02:39:59.999Z");
  assert.deepEqual(attempt.answers, ["1", "2"]);
  assert.equal(storedEvents.size, 2);
}

async function verifyFinalizeFailureConvergesOnReplay() {
  resetAttempt();
  throwFinalizeFailureOnce = true;
  await assert.rejects(
    privateMockExamService.submitPrivateMockAttempt(submissionInput()),
    /finalization failure/
  );
  assert.equal(
    attempt.status,
    "submitted",
    "the durable receipt must survive a post-CAS finalization failure"
  );
  assert.equal(attempt.submissionFinalization.status, "pending");
  assert.equal(storedEvents.size, 0);
  const replay = await privateMockExamService.submitPrivateMockAttempt(
    submissionInput({
      now: new Date("2026-08-22T02:40:05.000Z"),
    })
  );
  assert.equal(replay.replayed, true);
  assert.equal(storedEvents.size, 2);
  assert.equal(attempt.submissionFinalization.status, "completed");
}

async function verifyOnlyOpenExamAcceptsANewSubmission() {
  resetAttempt();
  exam.status = "aggregating";
  await expectStatus(
    privateMockExamService.submitPrivateMockAttempt(submissionInput()),
    409
  );
  assert.equal(attempt.status, "in_progress");

  exam.status = "open";
  const first = await privateMockExamService.submitPrivateMockAttempt(
    submissionInput()
  );
  exam.status = "finalized";
  const replay = await privateMockExamService.submitPrivateMockAttempt(
    submissionInput({
      now: new Date("2026-08-22T02:40:05.000Z"),
    })
  );
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, first.receiptId);
}

async function verifyLateUnreceiptedSubmissionIsRejected() {
  resetAttempt();
  await expectStatus(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        now: new Date("2026-08-22T02:40:00.000Z"),
        capturedAt: "2026-08-22T02:39:59.000Z",
      })
    ),
    410
  );
  assert.equal(attempt.status, "expired");
  assert.equal(
    new Date(attempt.expiredAt).toISOString(),
    "2026-08-22T02:40:00.000Z"
  );
  assert.equal(storedEvents.size, 0);
}

async function verifyReceivedBeforeExpiryWinsTheRace() {
  resetAttempt({
    status: "expired",
    expiredAt: new Date("2026-08-22T02:40:00.000Z"),
  });
  const result = await privateMockExamService.submitPrivateMockAttempt(
    submissionInput({
      now: new Date("2026-08-22T02:39:59.999Z"),
    })
  );
  assert.equal(result.replayed, false);
  assert.equal(attempt.status, "submitted");
  assert.equal(attempt.expiredAt, null);
}

async function verifyRequestKeyCannotChangePayload() {
  resetAttempt();
  await privateMockExamService.submitPrivateMockAttempt(submissionInput());
  await expectStatus(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        answers: ["1", "1"],
        now: new Date("2026-08-22T02:40:02.000Z"),
      })
    ),
    409
  );
  assert.deepEqual(attempt.answers, ["1", "2"]);
  assert.equal(storedEvents.size, 2);
}

async function verifyNoKeyExactReplayForNativeClient() {
  resetAttempt();
  const first =
    await privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        requestId: "",
        capturedAt: null,
      })
    );
  const replay =
    await privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        requestId: "",
        capturedAt: null,
        now: new Date(
          "2026-08-22T02:40:05.000Z"
        ),
      })
    );
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, first.receiptId);
  assert.match(
    first.receiptId,
    /^legacy-[a-f0-9]{64}$/
  );
}

async function verifySchedulerDefersStatisticsForActiveClaim() {
  resetAttempt();
  exam.isTest = false;
  schedulerDue = true;
  const indexBarrier =
    pauseNextIndexEnsure();
  const submission =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        now: new Date(
          "2026-08-22T02:39:59.999Z"
        ),
      })
    );
  await indexBarrier.entered;
  assert.equal(
    attempt.submissionClaim.requestId,
    REQUEST_ID,
    "the trusted pre-deadline server receipt must be durable before index/finalization waits"
  );

  await privateMockExamService.processPrivateMockSchedule(
    new Date(
      "2026-08-22T02:42:00.000Z"
    )
  );
  assert.equal(exam.status, "open");
  assert.equal(attempt.status, "in_progress");
  assert.equal(standardMetricWriteCount, 0);
  assert.equal(weeklySyncCount, 0);

  indexBarrier.release();
  const result = await submission;
  assert.equal(result.replayed, false);
  assert.equal(attempt.status, "submitted");

  await privateMockExamService.processPrivateMockSchedule(
    new Date(
      "2026-08-22T02:42:00.001Z"
    )
  );
  assert.equal(exam.status, "locked");
  assert.equal(standardMetricWriteCount, 1);
  assert.equal(weeklySyncCount, 1);
  assert.equal(attempt.standardMetrics.cohortSize, 1);
  assert.equal(
    aggregationQuerySawSubmitted,
    true,
    "the same scheduler pass must reach aggregation only after the recovered submission joins metrics and weekly sync"
  );
}

async function verifyPreclaimDelayCannotReviveAfterSettlement() {
  resetAttempt();
  schedulerDue = true;
  const readBarrier =
    pauseNextInitialAttemptRead();
  const delayedSubmission =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        now: new Date(
          "2026-08-22T02:39:59.999Z"
        ),
      })
    );
  await readBarrier.entered;

  await privateMockExamService.processPrivateMockSchedule(
    new Date(
      "2026-08-22T02:42:00.001Z"
    )
  );
  assert.equal(exam.status, "locked");
  assert.equal(attempt.status, "expired");
  assert.equal(
    new Date(attempt.expiredAt).toISOString(),
    "2026-08-22T02:42:00.001Z"
  );

  readBarrier.release();
  await expectStatus(delayedSubmission, 410);
  assert.equal(attempt.status, "expired");
  assert.equal(attempt.submissionReceipt.requestId, "");
  assert.equal(standardMetricWriteCount, 0);
}

async function verifyClockExpiryCannotEraseActiveClaim() {
  resetAttempt();
  resetUserActivity();
  const indexBarrier =
    pauseNextIndexEnsure();
  const submission =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        now: new Date(
          "2026-08-22T02:39:59.999Z"
        ),
      })
    );
  await indexBarrier.entered;

  await expectStatus(
    privateMockExamService.getPrivateMockAttemptData({
      userId: USER_ID,
      examId: EXAM_ID,
      now: new Date(
        "2026-08-22T02:40:00.000Z"
      ),
    }),
    410
  );
  assert.equal(attempt.status, "in_progress");
  assert.equal(attempt.submissionClaim.requestId, REQUEST_ID);

  indexBarrier.release();
  const result = await submission;
  assert.equal(result.replayed, false);
  assert.equal(attempt.status, "submitted");
}

async function verifyStaleLateSubmitCannotEraseActiveClaim() {
  resetAttempt();
  resetUserActivity();
  const expiryBarrier =
    pauseNextExpiryUpdate();
  const staleSubmission =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        requestId:
          "private-mock-submit-stale-deadline-0002",
        now: new Date(
          "2026-08-22T02:40:00.000Z"
        ),
      })
    );
  await expiryBarrier.entered;

  const indexBarrier =
    pauseNextIndexEnsure();
  const acceptedSubmission =
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput({
        now: new Date(
          "2026-08-22T02:39:59.999Z"
        ),
      })
    );
  await indexBarrier.entered;
  expiryBarrier.release();
  await expectStatus(staleSubmission, 410);
  assert.equal(attempt.status, "in_progress");
  assert.equal(attempt.submissionClaim.requestId, REQUEST_ID);

  indexBarrier.release();
  const result = await acceptedSubmission;
  assert.equal(result.replayed, false);
  assert.equal(attempt.status, "submitted");
}

async function verifySchedulerRecoversOutboxWithoutClientRetry() {
  resetAttempt();
  resetUserActivity();
  exam.isTest = false;
  schedulerDue = true;
  throwFinalizeFailureOnce = true;
  await assert.rejects(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput()
    ),
    /finalization failure/
  );
  assert.equal(attempt.status, "submitted");
  assert.equal(attempt.submissionFinalization.status, "pending");
  assert.equal(attempt.submissionFinalization.normalizedEvents.length, 1);
  assert.equal(storedEvents.size, 0);
  assert.equal(userState.totalStudySeconds, 0);

  await privateMockExamService.processPrivateMockSchedule(
    new Date(
      "2026-08-22T02:42:00.001Z"
    )
  );
  assert.equal(attempt.submissionFinalization.status, "completed");
  assert.equal(storedEvents.size, 2);
  assert.equal(
    userState.totalStudySeconds,
    attempt.elapsedMs / 1000
  );
  assert.equal(userState.studyActivityReceiptIds.length, 1);
  assert.equal(standardMetricWriteCount, 1);
  assert.equal(weeklySyncCount, 1);
  assert.equal(aggregationQuerySawSubmitted, true);
}

async function verifyLockedCrashRecoveryPrecedesAggregation() {
  resetAttempt();
  resetUserActivity();
  exam.isTest = false;
  throwFinalizeFailureOnce = true;
  await assert.rejects(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput()
    ),
    /finalization failure/
  );
  assert.equal(attempt.status, "submitted");
  assert.equal(attempt.submissionFinalization.status, "pending");
  assert.equal(userState.totalStudySeconds, 0);

  // This is the durable state left by a hard crash immediately after the
  // scheduler's open -> locked CAS, before its settlement preflight starts.
  exam.status = "locked";
  exam.settlementCompletedAt = null;
  allowAggregationCandidate = true;
  const recoveryNow = new Date(
    "2026-08-22T02:42:00.001Z"
  );
  await privateMockExamService.processPrivateMockSchedule(
    recoveryNow
  );

  assert.equal(attempt.submissionFinalization.status, "completed");
  assert.equal(storedEvents.size, 2);
  assert.equal(
    userState.totalStudySeconds,
    attempt.elapsedMs / 1000
  );
  assert.equal(userState.studyActivityReceiptIds.length, 1);
  assert.equal(standardMetricWriteCount, 1);
  assert.equal(weeklySyncCount, 1);
  assert.equal(attempt.standardMetrics.cohortSize, 1);
  assert.equal(attempt.rank, 1);
  assert.equal(rankingWriteCount, 1);
  assert.equal(exam.status, "aggregating");
  assert.equal(
    new Date(exam.aggregationCompletedAt).toISOString(),
    recoveryNow.toISOString()
  );
  assert.equal(
    new Date(exam.settlementCompletedAt).toISOString(),
    recoveryNow.toISOString()
  );
  assert.equal(
    aggregationQuerySawCompletedOutbox,
    true,
    "a recovered locked exam must finish its durable outbox before it becomes aggregation-eligible"
  );
  assert.equal(
    aggregationQuerySawSubmitted,
    true,
    "a recovered locked exam must include the accepted submission in cohort metrics before aggregation"
  );
}

async function verifyLegacyLockedCrashRecoveryWithoutMarkerField() {
  resetAttempt();
  resetUserActivity();
  exam.isTest = false;
  throwFinalizeFailureOnce = true;
  await assert.rejects(
    privateMockExamService.submitPrivateMockAttempt(
      submissionInput()
    ),
    /finalization failure/
  );

  exam.status = "locked";
  delete exam.settlementCompletedAt;
  const recoveryNow = new Date(
    "2026-08-22T02:42:00.001Z"
  );
  await privateMockExamService.processPrivateMockSchedule(
    recoveryNow
  );

  assert.equal(attempt.submissionFinalization.status, "completed");
  assert.equal(standardMetricWriteCount, 1);
  assert.equal(weeklySyncCount, 1);
  assert.equal(attempt.standardMetrics.cohortSize, 1);
  assert.equal(
    new Date(exam.settlementCompletedAt).toISOString(),
    recoveryNow.toISOString()
  );
  assert.equal(aggregationQuerySawCompletedOutbox, true);
  assert.equal(aggregationQuerySawSubmitted, true);
}

async function verifySubmittedDraftCannotOverwriteAnswers() {
  resetAttempt();
  const barrier = pauseNextDraftUpdate();
  const staleDraft = privateMockExamService.savePrivateMockDraft({
      userId: USER_ID,
      examId: EXAM_ID,
      answers: ["2", "1"],
      telemetryEvents: [],
      now: new Date("2026-08-22T02:39:59.700Z"),
    });
  await barrier.entered;
  await privateMockExamService.submitPrivateMockAttempt(submissionInput());
  barrier.release();
  await expectStatus(staleDraft, 409);
  assert.deepEqual(attempt.answers, ["1", "2"]);
}

async function verifyConcurrentActivityReceipt() {
  resetUserActivity();
  const activityReceiptId =
    "private-mock:concurrent-activity-receipt";
  await Promise.all([
    recordStudyActivity(
      USER_ID,
      new Date("2026-08-22T02:40:01.000Z"),
      42_000,
      { idempotencyKey: activityReceiptId }
    ),
    recordStudyActivity(
      USER_ID,
      new Date("2026-08-22T02:40:01.000Z"),
      42_000,
      { idempotencyKey: activityReceiptId }
    ),
  ]);
  assert.equal(userState.totalStudySeconds, 42);
  assert.deepEqual(userState.studyActivityReceiptIds, [activityReceiptId]);
}

async function verifyHistoricalReceiptCannotRewindStreakDate() {
  resetUserActivity();
  const latestStudyAt =
    new Date(
      "2026-08-22T15:00:00.000Z"
    );
  userState.lastStudyDate =
    latestStudyAt;
  userState.currentStreak = 7;
  userState.longestStreak = 9;
  userState.totalStudySeconds = 10;
  const activityReceiptId =
    "private-mock:historical-activity-receipt";
  const acceptedAt =
    new Date(
      "2026-08-21T14:59:59.900Z"
    );

  await recordStudyActivity(
    USER_ID,
    acceptedAt,
    42_000,
    { idempotencyKey: activityReceiptId }
  );
  await recordStudyActivity(
    USER_ID,
    acceptedAt,
    42_000,
    { idempotencyKey: activityReceiptId }
  );

  assert.equal(userState.totalStudySeconds, 52);
  assert.equal(
    new Date(userState.lastStudyDate).toISOString(),
    latestStudyAt.toISOString()
  );
  assert.equal(userState.currentStreak, 7);
  assert.equal(userState.longestStreak, 9);
  assert.deepEqual(
    userState.studyActivityReceiptIds,
    [activityReceiptId]
  );
}

async function verifyIpadControllerSideEffectGuard() {
  const controllerPath = resolveFromRoot(
    "controllers/ipadWeeklyMockController.js"
  );
  delete require.cache[controllerPath];
  const { createIpadWeeklyMockController } = require(controllerPath);
  let callCount = 0;
  let activityInvocationCount = 0;
  const capturedInputs = [];
  const activityReceiptId =
    "private-mock:activity-contract-receipt";
  const acceptedAt =
    "2026-08-21T14:59:59.900Z";
  const activityDates = [];
  resetUserActivity();
  const controller = createIpadWeeklyMockController({
    service: {
      async submitPrivateMockAttempt(input) {
        capturedInputs.push(input);
        callCount += 1;
        if (callCount === 1) {
          throw new Error(
            "post-CAS finalization failed before controller activity"
          );
        }
        return {
          replayed: true,
          receiptId: REQUEST_ID,
          acceptedAt,
          activityReceiptId,
          elapsedMs: 42_000,
        };
      },
      async getPrivateMockAttemptData() {
        return {
          submitted: true,
          serverNow: "2026-08-22T02:40:01.000Z",
          exam: { id: EXAM_ID },
          result: {},
        };
      },
    },
    async recordActivity(...args) {
      activityInvocationCount += 1;
      activityDates.push(args[1]);
      return recordStudyActivity(...args);
    },
  });
  const responses = [];
  const req = {
    apiUser: { _id: USER_ID },
    params: { examId: EXAM_ID },
    body: {
      answers: ["1", "2"],
      telemetryEvents: [],
      capturedAt: "2026-08-22T02:39:59.000Z",
    },
    get(name) {
      return name === "idempotency-key" ? REQUEST_ID : "";
    },
  };
  const res = {
    json(payload) {
      responses.push(payload);
      return payload;
    },
  };
  const next = (error) => {
    throw error;
  };
  await assert.rejects(
    controller.submit(req, res, next),
    /post-CAS finalization failed/
  );
  assert.equal(userState.totalStudySeconds, 0);
  throwAfterActivityCommitOnce = true;
  await assert.rejects(
    controller.submit(req, res, next),
    /activity commit response lost/
  );
  await controller.submit(req, res, next);
  await controller.submit(req, res, next);
  assert.equal(activityInvocationCount, 3);
  assert.equal(userState.totalStudySeconds, 42);
  assert.deepEqual(userState.studyActivityReceiptIds, [activityReceiptId]);
  assert.deepEqual(
    activityDates.map((date) => date.toISOString()),
    [acceptedAt, acceptedAt, acceptedAt],
    "activity and streak attribution must use the durable acceptance time across a KST-midnight replay"
  );
  assert.equal(
    new Date(userState.lastStudyDate).toISOString(),
    acceptedAt
  );
  assert.deepEqual(
    responses.map((response) => response.replayed),
    [true, true]
  );
  assert.equal(capturedInputs[0].requestId, REQUEST_ID);
  assert.equal(
    capturedInputs[0].capturedAt,
    "2026-08-22T02:39:59.000Z"
  );
}

async function main() {
  await verifyProductionIndexEnsureContract();
  await verifyConcurrentIdempotency();
  await verifyConcurrentSameKeyDifferentPayloadConflict();
  await verifyConcurrentDifferentKeyConflict();
  await verifyDeadlineReceiptReplay();
  await verifyFinalizeFailureConvergesOnReplay();
  await verifyOnlyOpenExamAcceptsANewSubmission();
  await verifyLateUnreceiptedSubmissionIsRejected();
  await verifyReceivedBeforeExpiryWinsTheRace();
  await verifyRequestKeyCannotChangePayload();
  await verifyNoKeyExactReplayForNativeClient();
  await verifySchedulerDefersStatisticsForActiveClaim();
  await verifyPreclaimDelayCannotReviveAfterSettlement();
  await verifyClockExpiryCannotEraseActiveClaim();
  await verifyStaleLateSubmitCannotEraseActiveClaim();
  await verifySchedulerRecoversOutboxWithoutClientRetry();
  await verifyLockedCrashRecoveryPrecedesAggregation();
  await verifyLegacyLockedCrashRecoveryWithoutMarkerField();
  await verifySubmittedDraftCannotOverwriteAnswers();
  await verifyConcurrentActivityReceipt();
  await verifyHistoricalReceiptCannotRewindStreakDate();
  await verifyIpadControllerSideEffectGuard();
  console.log(
    "Private mock submission contract verified: open-only durable claim, concurrent conflict barriers, expiry-race protection, bounded scheduler settlement, locked-crash preflight recovery, autonomous finalization outbox with cohort/weekly inclusion, no-key exact replay, payload binding, event dedupe, stale-draft protection, accepted-time KST attribution, and exactly-once activity receipt."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

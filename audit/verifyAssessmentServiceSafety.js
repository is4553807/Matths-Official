"use strict";

const assert = require("node:assert/strict");

const {
  ASSESSMENT_CLIENT_START_INDEX,
  AssessmentAttempt,
  ensureAssessmentClientStartIndex,
} = require("../models/matthsModel");
const {
  assessmentAttemptView,
} = require("../controllers/ipadAssessmentController");
const {
  _testing: {
    IPAD_ASSESSMENT_LIST_LIMIT,
    IPAD_ASSESSMENT_LIST_PROJECTION,
    createAssessmentRecordIdempotently,
    listAssessmentAttemptsWithModel,
  },
} = require("../services/assessmentService");

const tick = () =>
  new Promise((resolve) => setImmediate(resolve));

function concurrentStartModel() {
  const records = new Map();
  const observed = {
    createCalls: 0,
    createIndexCalls: 0,
    indexReady: false,
  };
  let sequence = 0;

  const keyFor = (value) =>
    `${String(value.userId)}:${String(value.clientStartId)}`;

  return {
    observed,
    records,
    model: {
      collection: {
        async createIndex(key, options) {
          observed.createIndexCalls += 1;
          assert.deepEqual(
            key,
            ASSESSMENT_CLIENT_START_INDEX.key
          );
          assert.equal(
            options.name,
            ASSESSMENT_CLIENT_START_INDEX.name
          );
          assert.equal(options.unique, true);
          assert.deepEqual(
            options.partialFilterExpression,
            ASSESSMENT_CLIENT_START_INDEX.partialFilterExpression
          );
          await tick();
          observed.indexReady = true;
          return options.name;
        },
      },
      async findOne(filter) {
        return records.get(keyFor(filter)) || null;
      },
      async create(value) {
        observed.createCalls += 1;
        assert.equal(
          observed.indexReady,
          true,
          "assessment create ran before the unique index was ready"
        );
        // Let both requests observe an empty replay lookup before either insert.
        await tick();
        const key = keyFor(value);
        if (records.has(key)) {
          const error = new Error("duplicate assessment start");
          error.code = 11000;
          throw error;
        }
        sequence += 1;
        const created = {
          ...value,
          _id: `assessment-${sequence}`,
        };
        records.set(key, created);
        return created;
      },
    },
  };
}

async function verifyConcurrentStart() {
  const declaredIndex =
    AssessmentAttempt.schema.indexes().find(
      ([, options]) =>
        options.name ===
        ASSESSMENT_CLIENT_START_INDEX.name
    );
  assert.deepEqual(
    declaredIndex,
    [
      ASSESSMENT_CLIENT_START_INDEX.key,
      {
        name: ASSESSMENT_CLIENT_START_INDEX.name,
        unique: true,
        partialFilterExpression:
          ASSESSMENT_CLIENT_START_INDEX.partialFilterExpression,
      },
    ]
  );

  const fake = concurrentStartModel();
  const input = {
    model: fake.model,
    ensureClientStartIndex:
      ensureAssessmentClientStartIndex,
    userId: "student-a",
    clientStartId: "same-client-start",
    paper: {
      paperId: "paper-generated-before-race",
      scopeType: "course",
    },
  };

  const [left, right] = await Promise.all([
    createAssessmentRecordIdempotently(input),
    createAssessmentRecordIdempotently(input),
  ]);

  assert.equal(left._id, right._id);
  assert.equal(fake.records.size, 1);
  assert.equal(
    fake.observed.createIndexCalls,
    1,
    "concurrent starts must share one index-readiness promise"
  );
  assert.equal(
    fake.observed.createCalls,
    2,
    "the contract must exercise the duplicate-key winner path"
  );

  let retryCalls = 0;
  const retryModel = {
    collection: {
      async createIndex() {
        retryCalls += 1;
        if (retryCalls === 1) {
          throw new Error("temporary index build failure");
        }
        return ASSESSMENT_CLIENT_START_INDEX.name;
      },
    },
  };
  await assert.rejects(
    ensureAssessmentClientStartIndex(
      retryModel
    ),
    /temporary index build failure/
  );
  await ensureAssessmentClientStartIndex(
    retryModel
  );
  assert.equal(
    retryCalls,
    2,
    "a failed cold-start index build must be retryable"
  );
}

function assessmentDocument(index) {
  const updatedAt = new Date(
    Date.UTC(2026, 7, 18, 0, 0, 0) -
      index * 60_000
  );
  return {
    _id: `assessment-${String(index).padStart(3, "0")}`,
    scopeType: "course",
    courseId: "common-math-1",
    unitId: null,
    subunitId: null,
    title: `평가 ${index}`,
    status: "submitted",
    questions: [
      {
        questionId: `question-${index}`,
        prompt: "x+1=2",
        choices: [{ text: "1" }, { text: "2" }],
        answer: "1",
        solution: "양변에서 1을 뺍니다.",
        submittedAnswer: "1",
        points: 100,
        isCorrect: true,
      },
    ],
    startedAt: new Date("2026-08-17T00:00:00.000Z"),
    submittedAt: updatedAt,
    scorePercent: 100,
    passed: true,
    timeLimitMs: 60 * 60 * 1000,
    updatedAt,
    createdAt: new Date("2026-08-17T00:00:00.000Z"),
  };
}

async function verifyBoundedList() {
  const documents = Array.from(
    { length: IPAD_ASSESSMENT_LIST_LIMIT + 25 },
    (_, index) => assessmentDocument(index)
  );
  const observed = {
    findCalls: 0,
    limit: null,
    projection: null,
    sort: null,
  };
  const model = {
    find(filter) {
      observed.findCalls += 1;
      assert.equal(filter.userId, "student-a");
      return {
        sort(value) {
          observed.sort = value;
          return this;
        },
        limit(value) {
          observed.limit = value;
          return this;
        },
        async select(value) {
          observed.projection = value;
          return documents.slice(0, observed.limit);
        },
      };
    },
  };

  const attempts =
    await listAssessmentAttemptsWithModel({
      model,
      userId: "student-a",
    });

  assert.equal(observed.findCalls, 1);
  assert.deepEqual(observed.sort, {
    updatedAt: -1,
    _id: -1,
  });
  assert.equal(
    observed.limit,
    IPAD_ASSESSMENT_LIST_LIMIT
  );
  assert.equal(
    observed.projection,
    IPAD_ASSESSMENT_LIST_PROJECTION
  );
  assert.equal(
    attempts.length,
    IPAD_ASSESSMENT_LIST_LIMIT
  );
  assert.equal(
    attempts[0]._id,
    `assessment-${String(
      IPAD_ASSESSMENT_LIST_LIMIT - 1
    ).padStart(3, "0")}`,
    "the bounded latest window must retain the existing oldest-to-newest DTO order"
  );
  assert.equal(attempts.at(-1)._id, "assessment-000");

  const dto = assessmentAttemptView(
    attempts.at(-1)
  );
  assert.deepEqual(Object.keys(dto), [
    "id",
    "scope",
    "courseId",
    "unitId",
    "subunitId",
    "title",
    "status",
    "questions",
    "answers",
    "startedAt",
    "deadlineAt",
    "submittedAt",
    "scorePercent",
    "passed",
    "timeLimitMs",
    "disqualified",
    "updatedAt",
  ]);
  assert.equal(dto.questions[0].answer, "1");
  assert.equal(
    dto.questions[0].solution,
    "양변에서 1을 뺍니다."
  );
}

async function main() {
  await verifyConcurrentStart();
  await verifyBoundedList();
  console.log(
    "Assessment service safety verified: cold-start index gate, concurrent idempotent start, and bounded single-query iPad list."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const controllerPath = path.join(ROOT, "controllers", "ipadLearningSyncController.js");
const routesPath = path.join(ROOT, "routes", "api-routes.js");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const routeSource = fs.readFileSync(routesPath, "utf8");
const controller = require(controllerPath);
const { LearningEvent, ProblemAttempt, User } = require(path.join(ROOT, "models", "matthsModel.js"));

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const expectedExports = [
  "patchMastery",
  "updateTopic",
  "patchSnapshot",
  "resetLearningProgress",
  "postEvents",
  "postWrongNotesBulk",
  "getWrongNotes",
  "postReviewResult",
  "postStuckPoint",
  "getStuckPoints",
];

for (const name of expectedExports) {
  assert.strictEqual(typeof controller[name], "function", `controller export missing: ${name}`);
}

const expectedRoutes = [
  ["post", "/learning/progress/reset", "resetLearningProgress"],
  ["post", "/events", "postEvents"],
  ["post", "/wrong-notes/bulk", "postWrongNotesBulk"],
  ["get", "/wrong-notes/stuck-points", "getStuckPoints"],
  ["post", "/wrong-notes/stuck-points", "postStuckPoint"],
  ["post", "/wrong-notes/:attemptId/review-result", "postReviewResult"],
  ["get", "/wrong-notes", "getWrongNotes"],
  ["patch", "/learning/:courseId/:unitId/:conceptId/topics/:topicIndex", "updateTopic"],
  ["patch", "/learning/:courseId/:unitId/:conceptId/mastery", "patchMastery"],
  ["patch", "/learning/:courseId/:unitId/:conceptId/snapshot", "patchSnapshot"],
];

const authBoundary = routeSource.indexOf("router.use(requireApiAuth)");
assert(authBoundary >= 0, "Bearer auth boundary is missing");
for (const [method, route, handler] of expectedRoutes) {
  const registration = new RegExp(
    `router\\.${method}\\s*\\(\\s*[\"']${escapeRegExp(route)}[\"']\\s*,\\s*` +
      `ipadLearningSyncController\\.${handler}\\s*\\)`,
    "m"
  );
  const match = registration.exec(routeSource);
  assert(match, `${method.toUpperCase()} ${route} is not wired to ${handler}`);
  assert(
    match.index > authBoundary,
    `${method.toUpperCase()} ${route} is not behind Bearer auth`
  );
}

assert.strictEqual(
  (routeSource.match(/learning\/:courseId\/:unitId\/:conceptId\/topics\/:topicIndex/g) || [])
    .length,
  1,
  "topic sync route must have one owner"
);
assert(
  routeSource.indexOf('"/wrong-notes/stuck-points"') <
    routeSource.indexOf('"/wrong-notes/:attemptId/review-result"'),
  "static wrong-note routes must precede the dynamic review route"
);

for (const forbidden of [
  "ipadSyncController",
  "rankingApiAdapter",
  "RankingProfile",
  "arenaService",
  "cycleAttendance",
  "seedrandom",
]) {
  assert(!controllerSource.includes(forbidden), `forbidden dependency/reference: ${forbidden}`);
}

const privateApi = controller._private;
const userA = "64b000000000000000000001";
const userB = "64b000000000000000000002";
const clientAttemptId = "B8306C53-F0A9-41ED-8A03-47A770400001";
const externalA = privateApi.wrongNoteExternalId(userA, clientAttemptId);
assert.strictEqual(externalA, privateApi.wrongNoteExternalId(userA, clientAttemptId));
assert.notStrictEqual(externalA, privateApi.wrongNoteExternalId(userB, clientAttemptId));
assert(!externalA.includes(clientAttemptId), "externalId must not expose the client UUID");

const encodedClientId = Buffer.from(clientAttemptId).toString("base64url");
const mockProblem = {
  tags: [
    `ipad-sync:client-attempt:${encodedClientId}`,
    `ipad-sync:srs-stage:${Buffer.from("2").toString("base64url")}`,
    `ipad-sync:wrong-count:${Buffer.from("3").toString("base64url")}`,
    `ipad-sync:is-tex:${Buffer.from("1").toString("base64url")}`,
  ],
  correctAnswer: "42",
  solutionSteps: [{ explanation: "첫 단계" }, { explanation: "둘째 단계" }],
};
assert.deepStrictEqual(privateApi.wrongNoteState(mockProblem), {
  clientAttemptId,
  srsStage: 2,
  wrongCount: 3,
  divergenceStep: null,
  isTex: true,
});

assert.deepStrictEqual(privateApi.wrongNoteState({ tags: [] }), {
  clientAttemptId: null,
  srsStage: 0,
  wrongCount: 1,
  divergenceStep: null,
  isTex: false,
});
assert.strictEqual(privateApi.boundedInteger(null, 0, 10, 7), 7);
assert.strictEqual(privateApi.integerInRange(-1, 0, 4), null);
assert.strictEqual(privateApi.integerInRange(999, 0, 4), null);
assert.strictEqual(privateApi.integerInRange(0, 0, 4), 0);

const canonicalExpression = privateApi.canonicalTypeIdsExpression(["polynomial-add"]);
const canonicalExpressionSource = JSON.stringify(canonicalExpression);
assert(canonicalExpressionSource.includes('"$setUnion"'));
assert(canonicalExpressionSource.includes('"$map"'));
assert(canonicalExpressionSource.includes('"web-"'));
assert(canonicalExpressionSource.includes('"polynomial-add"'));

const zeroDivergenceProblem = {
  tags: [`ipad-sync:divergence-step:${Buffer.from("0").toString("base64url")}`],
};
assert.strictEqual(privateApi.wrongNoteState(zeroDivergenceProblem).divergenceStep, 0);

const serializedWrongNote = privateApi.serializeWrongNote({
  _id: "64b000000000000000000010",
  problemId: mockProblem,
  problemSnapshot: {
    typeId: "polynomial-add",
    stem: "문제",
    choices: [{ text: "1" }, { text: "2" }],
  },
  submittedAnswer: "41",
  stoppedAtStep: 2,
  errorAnalysis: { errorType: "calculation-error" },
  review: { status: "scheduled", scheduledAt: new Date("2026-08-20T00:00:00Z") },
  submittedAt: new Date("2026-08-18T00:00:00Z"),
  updatedAt: new Date("2026-08-19T00:00:00Z"),
});
assert.strictEqual(serializedWrongNote.clientAttemptId, clientAttemptId);
assert.strictEqual(serializedWrongNote.answer, "42");
assert.deepStrictEqual(serializedWrongNote.choices, ["1", "2"]);
assert.deepStrictEqual(serializedWrongNote.steps, ["첫 단계", "둘째 단계"]);
assert.strictEqual(serializedWrongNote.reviewStatus, "scheduled");

const webChoiceFallback = privateApi.serializeWrongNote({
  _id: "64b000000000000000000011",
  problemId: {
    tags: [],
    choices: [{ text: "웹 선택지 1" }, { text: "웹 선택지 2" }],
  },
  problemSnapshot: { typeId: "legacy-web", stem: "문제", choices: [] },
  submittedAnswer: "웹 선택지 1",
  review: { status: "pending" },
  submittedAt: new Date("2026-08-18T00:00:00Z"),
});
assert.deepStrictEqual(webChoiceFallback.choices, ["웹 선택지 1", "웹 선택지 2"]);

const regularEvent = privateApi.normalizeEvent(
  {
    clientEventId: "event-1",
    eventType: "problem-correct",
    conceptId: "polynomial-operations",
    correct: true,
    durationMs: 1234,
    occurredAt: "2026-08-18T00:00:00.000Z",
  },
  { userId: userA, sessionId: "ipad" }
);
assert.strictEqual(regularEvent.eventType, "problem-correct");
assert.strictEqual(regularEvent.correct, true);
assert.strictEqual(regularEvent.durationMs, 1234);

const protectedEvent = privateApi.normalizeEvent(
  {
    clientEventId: "event-2",
    eventType: "protected-screen-screenshot",
    integritySessionCode: "A1B2C3D4",
    protectedSurface: "assessment-paper",
  },
  { userId: userA, sessionId: "ipad" }
);
assert.strictEqual(protectedEvent.eventType, "concept-closed");
assert.strictEqual(protectedEvent.metadata.sourceEventType, "protected-screen-screenshot");
assert.strictEqual(protectedEvent.metadata.analyticsExcluded, true);
assert.strictEqual(
  privateApi.normalizeEvent(
    { clientEventId: "event-3", eventType: "made-up-event" },
    { userId: userA, sessionId: "ipad" }
  ),
  null
);

const stuckPoint = privateApi.serializeStuckPoint({
  metadata: { id: "point-1", text: "여기서 막힘", createdAt: "2026-08-18T01:00:00Z" },
  occurredAt: new Date("2026-08-18T01:00:00Z"),
});
assert.deepStrictEqual(stuckPoint, {
  id: "point-1",
  text: "여기서 막힘",
  createdAt: "2026-08-18T01:00:00Z",
});

const resetSource = controllerSource.slice(
  controllerSource.indexOf("exports.resetLearningProgress"),
  controllerSource.indexOf("function serializeStuckPoint")
);
assert(
  resetSource.indexOf("insertEventOnce(event)") < resetSource.indexOf("ConceptProgress.deleteMany"),
  "reset tombstone must be claimed before progress deletion"
);
for (const handlerName of ["patchMastery", "updateTopic", "patchSnapshot"]) {
  const handlerStart = controllerSource.indexOf(`exports.${handlerName}`);
  const handlerEnd = controllerSource.indexOf("\nexports.", handlerStart + 1);
  const handlerSource = controllerSource.slice(
    handlerStart,
    handlerEnd === -1 ? controllerSource.length : handlerEnd
  );
  assert(handlerSource.includes("latestProgressResetCutoff"), `${handlerName} misses reset cutoff`);
  assert(handlerSource.includes("BEFORE_PROGRESS_RESET"), `${handlerName} can resurrect reset data`);
}
const topicHandler = controllerSource.slice(
  controllerSource.indexOf("exports.updateTopic"),
  controllerSource.indexOf("exports.patchSnapshot")
);
assert(topicHandler.includes("$max: { lastStudiedAt: occurredAt }"));
assert(!controllerSource.includes("events.slice(0, MAX_EVENTS)"));
assert(!controllerSource.includes("entries.slice(0, MAX_WRONG_NOTES)"));
assert(controllerSource.includes(".limit(WRONG_NOTE_PAGE_SIZE + 1)"));
assert(controllerSource.includes(".sort({ occurredAt: -1, _id: -1 })"));

async function capture(handler, req) {
  let payload;
  let error;
  await handler(
    req,
    {
      json(value) {
        payload = value;
        return value;
      },
    },
    (value) => {
      error = value;
    }
  );
  return { error, payload };
}

async function verifyNegativeResponses() {
  const baseRequest = { apiUser: { _id: userA }, body: {} };
  const invalidEvent = await capture(controller.postEvents, {
    ...baseRequest,
    body: {
      sessionId: "ipad",
      events: [{ clientEventId: "bad-event", eventType: "not-supported" }],
    },
  });
  assert.strictEqual(invalidEvent.error?.status, 422);
  assert.strictEqual(invalidEvent.error?.code, "INVALID_EVENT");
  assert.strictEqual(invalidEvent.payload, undefined);

  const oversizedEvents = await capture(controller.postEvents, {
    ...baseRequest,
    body: { events: Array.from({ length: 501 }, () => ({})) },
  });
  assert.strictEqual(oversizedEvents.error?.status, 413);
  assert.strictEqual(oversizedEvents.error?.code, "EVENT_BATCH_TOO_LARGE");

  const invalidWrongNote = await capture(controller.postWrongNotesBulk, {
    ...baseRequest,
    body: { entries: [{}] },
  });
  assert.strictEqual(invalidWrongNote.error?.status, 400);
  assert.strictEqual(invalidWrongNote.error?.code, "INVALID_REQUEST");
  assert.strictEqual(invalidWrongNote.payload, undefined);
}

function objectIdAt(index) {
  return (BigInt("0x64b000000000000000000000") + BigInt(index))
    .toString(16)
    .padStart(24, "0");
}

function fakeWrongNoteAttempt(index, updatedAt) {
  return {
    _id: objectIdAt(index),
    problemId: {
      tags: [],
      correctAnswer: String(index),
      solutionSteps: [],
      choices: [],
    },
    problemSnapshot: { typeId: "pagination-proof", stem: `문제 ${index}`, choices: [] },
    submittedAnswer: String(index - 1),
    errorAnalysis: { errorType: "unknown" },
    review: { status: "pending", scheduledAt: null },
    submittedAt: new Date("2026-08-17T00:00:00.000Z"),
    updatedAt,
  };
}

function matchesWrongNoteQuery(row, query) {
  if (query.updatedAt?.$gt && !(row.updatedAt > query.updatedAt.$gt)) return false;
  if (!query.$or) return true;
  return query.$or.some((clause) => {
    if (clause.updatedAt?.$gt) return row.updatedAt > clause.updatedAt.$gt;
    return (
      row.updatedAt.getTime() === new Date(clause.updatedAt).getTime() &&
      String(row._id) > String(clause._id?.$gt)
    );
  });
}

async function verifyWrongNoteCompositeCursor() {
  const originalFind = ProblemAttempt.find;
  const tiedAt = new Date("2026-08-18T09:30:00.000Z");
  const rows = Array.from({ length: 301 }, (_, index) =>
    fakeWrongNoteAttempt(index + 1, tiedAt)
  );
  try {
    ProblemAttempt.find = (query) => {
      let limit = Infinity;
      return {
        sort() {
          return this;
        },
        limit(value) {
          limit = value;
          return this;
        },
        populate() {
          return this;
        },
        async lean() {
          return rows.filter((row) => matchesWrongNoteQuery(row, query)).slice(0, limit);
        },
      };
    };

    const first = await capture(controller.getWrongNotes, {
      apiUser: { _id: userA },
      query: {},
    });
    assert.ifError(first.error);
    assert.strictEqual(first.payload.entries.length, 300);
    assert.strictEqual(first.payload.hasMore, true);
    assert.strictEqual(typeof first.payload.nextCursor, "string");
    const decoded = privateApi.decodeWrongNoteCursor(first.payload.nextCursor);
    assert.strictEqual(decoded.updatedAt.toISOString(), tiedAt.toISOString());
    assert.strictEqual(decoded.id, rows[299]._id);

    const second = await capture(controller.getWrongNotes, {
      apiUser: { _id: userA },
      query: { cursor: first.payload.nextCursor },
    });
    assert.ifError(second.error);
    assert.strictEqual(second.payload.entries.length, 1);
    assert.strictEqual(second.payload.entries[0].attemptId, rows[300]._id);
    assert.strictEqual(second.payload.hasMore, false);
    assert.strictEqual(second.payload.nextCursor, null);
    assert.strictEqual(
      new Set([...first.payload.entries, ...second.payload.entries].map((row) => row.attemptId))
        .size,
      301,
      "301 rows sharing updatedAt must be retrieved exactly once across cursor pages"
    );

    const invalid = await capture(controller.getWrongNotes, {
      apiUser: { _id: userA },
      query: { cursor: "not-a-cursor" },
    });
    assert.strictEqual(invalid.error?.status, 400);
    assert.strictEqual(invalid.error?.code, "INVALID_WRONG_NOTE_CURSOR");
  } finally {
    ProblemAttempt.find = originalFind;
  }
}

async function verifyReviewRetryKeepsLatestClaim() {
  const originalAttemptFindOne = ProblemAttempt.findOne;
  const originalEventUpdateOne = LearningEvent.updateOne;
  const originalEventFindOne = LearningEvent.findOne;
  const originalUserFindById = User.findById;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalUserFindOne = User.findOne;
  const attemptId = objectIdAt(900);
  const clientIdTag = Buffer.from(clientAttemptId).toString("base64url");
  const problem = {
    tags: [
      `ipad-sync:client-attempt:${clientIdTag}`,
      `ipad-sync:srs-stage:${Buffer.from("0").toString("base64url")}`,
      `ipad-sync:wrong-count:${Buffer.from("1").toString("base64url")}`,
    ],
    async save() {},
  };
  const attempt = {
    _id: attemptId,
    curriculumId: "kr-2022",
    courseId: "course",
    unitId: "unit",
    conceptId: "concept",
    problemId: problem,
    review: {
      status: "pending",
      scheduledAt: null,
      reviewedAt: null,
      correctedAfterReview: false,
    },
    async save() {},
  };
  const claims = [];
  const userState = {
    _id: userA,
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    totalStudySeconds: 0,
    studyActivityReceiptIds: [],
  };
  try {
    ProblemAttempt.findOne = () => ({
      async populate() {
        return attempt;
      },
    });
    LearningEvent.updateOne = async (filter, update) => {
      if (claims.some((event) => event.clientEventId === filter.clientEventId)) {
        return { upsertedCount: 0 };
      }
      const sequence = claims.length + 1;
      const source = update.$setOnInsert;
      claims.push({
        ...source,
        metadata: { ...source.metadata },
        _id: objectIdAt(1000 + sequence),
        occurredAt: new Date(Date.UTC(2026, 7, 18, 10, 0, sequence)),
      });
      return { upsertedCount: 1 };
    };
    LearningEvent.findOne = (filter) => {
      let sortSpec = null;
      return {
        sort(value) {
          sortSpec = value;
          return this;
        },
        async lean() {
          let matches = claims.filter((event) => {
            if (filter.clientEventId && event.clientEventId !== filter.clientEventId) return false;
            if (filter.attemptId && String(event.attemptId) !== String(filter.attemptId)) return false;
            if (
              filter["metadata.syncKind"] &&
              event.metadata?.syncKind !== filter["metadata.syncKind"]
            ) {
              return false;
            }
            return true;
          });
          if (sortSpec) {
            matches = matches.sort((left, right) => {
              const timeOrder = right.occurredAt - left.occurredAt;
              return timeOrder || String(right._id).localeCompare(String(left._id));
            });
          }
          return matches[0] || null;
        },
      };
    };
    User.findById = () => ({
      select() {
        return this;
      },
      async lean() {
        return { ...userState };
      },
    });
    User.findOneAndUpdate = async (_filter, update) => {
      if (update.$set) Object.assign(userState, update.$set);
      if (update.$inc?.totalStudySeconds) {
        userState.totalStudySeconds += Number(update.$inc.totalStudySeconds) || 0;
      }
      return { ...userState };
    };
    User.findOne = async () => ({ ...userState });

    const request = (clientEventId, values) =>
      capture(controller.postReviewResult, {
        apiUser: { _id: userA },
        params: { attemptId },
        body: { clientEventId, ...values },
      });
    const a = {
      correct: true,
      srsStage: 1,
      wrongCount: 1,
      nextReviewAt: "2026-08-20T00:00:00.000Z",
    };
    const b = {
      correct: false,
      srsStage: 3,
      wrongCount: 2,
      nextReviewAt: "2026-08-22T00:00:00.000Z",
    };
    assert.ifError((await request("A", a)).error);
    assert.ifError((await request("B", b)).error);
    const retryA = await request("A", a);
    assert.ifError(retryA.error);
    assert.strictEqual(retryA.payload.review.duplicate, true);
    assert.strictEqual(retryA.payload.review.srsStage, 3);
    assert.strictEqual(retryA.payload.review.wrongCount, 2);
    assert.strictEqual(
      retryA.payload.review.nextReviewAt.toISOString(),
      "2026-08-22T00:00:00.000Z"
    );
    assert.strictEqual(privateApi.wrongNoteState(problem).srsStage, 3);
    assert.strictEqual(privateApi.wrongNoteState(problem).wrongCount, 2);
    assert.strictEqual(attempt.review.correctedAfterReview, false);
    assert.strictEqual(claims.length, 2, "A retry must not create a third review claim");
    assert.strictEqual(userState.currentStreak, 1, "iPad review must record the general study streak");
  } finally {
    ProblemAttempt.findOne = originalAttemptFindOne;
    LearningEvent.updateOne = originalEventUpdateOne;
    LearningEvent.findOne = originalEventFindOne;
    User.findById = originalUserFindById;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    User.findOne = originalUserFindOne;
  }
}

Promise.all([
  verifyNegativeResponses(),
  verifyWrongNoteCompositeCursor(),
])
  .then(() => verifyReviewRetryKeepsLatestClaim())
  .then(() => {
    console.log(
      JSON.stringify(
        {
          ok: true,
          authBoundary: "/api/v1 Bearer",
          routes: expectedRoutes.map(([method, route]) => `${method.toUpperCase()} ${route}`),
          verified: [
            "exact HTTP method, route ownership, and Bearer boundary",
            "forbidden dependency absence",
            "zero-step and default wrong-note state",
            "web Problem choice fallback",
            "invalid-index rejection helpers",
            "canonical web-/native type union",
            "monotonic topic timestamp",
            "non-2xx rejection for invalid and oversized batches",
            "reset tombstone ordering and stale-write guards",
            "standard and protected event normalization",
            "stuck-point response shape",
            "301 identical-timestamp wrong notes across composite-cursor pages",
            "A to B to A retry preserves the latest SRS claim",
            "iPad learning and wrong-note review record the general study streak",
          ],
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

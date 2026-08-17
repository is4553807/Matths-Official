"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

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

const ACCOUNT_A = "64d000000000000000000001";
const ACCOUNT_B = "64d000000000000000000002";
const users = new Map([
  [ACCOUNT_A, user(ACCOUNT_A)],
  [ACCOUNT_B, user(ACCOUNT_B)],
]);

function user(id) {
  return {
    _id: id,
    tokenVersion: 3,
    toObject() {
      return { _id: this._id, tokenVersion: this.tokenVersion };
    },
  };
}

stub("services/mobileAuthService.js", {
  verifyAccessToken(token) {
    if (token === "assessment-a") return { sub: ACCOUNT_A, ver: 3 };
    if (token === "assessment-b") return { sub: ACCOUNT_B, ver: 3 };
    if (token === "assessment-revoked") return { sub: ACCOUNT_A, ver: 2 };
    return null;
  },
});
stub("services/accountAccessService.js", {
  async synchronizeAccountAccess(id) {
    const account = users.get(String(id));
    return { allowed: Boolean(account), user: account || null };
  },
});
stub("services/userLifecycleService.js", {
  async synchronizeUserLifecycle(id) {
    return users.get(String(id));
  },
});

const attempts = new Map();
const startKeys = new Map();
const calls = [];
let sequence = 0;

function notFound() {
  const error = new Error("평가 시도를 찾을 수 없습니다.");
  error.status = 404;
  error.code = "ASSESSMENT_NOT_FOUND";
  return error;
}

function ownedAttempt({ userId, attemptId }) {
  const attempt = attempts.get(String(attemptId));
  if (!attempt || String(attempt.userId) !== String(userId)) throw notFound();
  return attempt;
}

function createQuestion() {
  return {
    questionId: "question-authority-1",
    typeId: "type-1",
    prompt: "x+1=2",
    choices: [],
    answer: "1",
    solution: "양변에서 1을 뺍니다.",
    points: 100,
    submittedAnswer: "",
    isCorrect: null,
  };
}

const assessmentService = {
  async listAssessmentAttempts({ userId }) {
    calls.push(["list", { userId: String(userId) }]);
    return [...attempts.values()].filter(
      (attempt) => String(attempt.userId) === String(userId)
    );
  },

  async createAssessmentAttempt(input) {
    calls.push(["start", { ...input, userId: String(input.userId) }]);
    const key = `${input.userId}:${input.clientStartId}`;
    const existingId = startKeys.get(key);
    if (existingId) return attempts.get(existingId);

    // Force simultaneous HTTP requests to overlap before the atomic winner
    // check, rather than accidentally proving only sequential replay.
    await new Promise((resolve) => setImmediate(resolve));
    const concurrentWinnerId = startKeys.get(key);
    if (concurrentWinnerId) return attempts.get(concurrentWinnerId);

    sequence += 1;
    const id = `assessment-${sequence}`;
    const attempt = {
      _id: id,
      userId: String(input.userId),
      scopeType: input.scopeType,
      courseId: input.courseId,
      unitId: input.unitId,
      subunitId: input.subunitId,
      title: "수학 I 과목 종합평가",
      status: "in-progress",
      startedAt: new Date("2026-08-12T00:00:00.000Z"),
      updatedAt: new Date("2026-08-12T00:01:00.000Z"),
      timeLimitMs: 3_600_000,
      questions: [createQuestion()],
    };
    startKeys.set(key, id);
    attempts.set(id, attempt);
    return attempt;
  },

  async getAssessmentAttempt(input) {
    calls.push(["get", { ...input, userId: String(input.userId) }]);
    return ownedAttempt(input);
  },

  async saveAssessmentDraft(input) {
    calls.push(["draft", { ...input, userId: String(input.userId) }]);
    const attempt = ownedAttempt(input);
    attempt.questions[0].submittedAnswer = String(
      input.answers[attempt.questions[0].questionId] || ""
    );
    attempt.updatedAt = new Date("2026-08-12T00:02:00.000Z");
    return {
      savedAt: attempt.updatedAt,
      elapsedTimeMs: 10_000,
      answeredCount: attempt.questions[0].submittedAnswer ? 1 : 0,
    };
  },

  async submitAssessmentAttempt(input) {
    calls.push(["submit", { ...input, userId: String(input.userId) }]);
    const attempt = ownedAttempt(input);
    attempt.status = "submitted";
    attempt.submittedAt = new Date("2026-08-12T00:05:00.000Z");
    attempt.scorePercent = 100;
    attempt.passed = true;
    attempt.questions[0].submittedAnswer = String(
      input.answers[attempt.questions[0].questionId] || ""
    );
    attempt.questions[0].isCorrect = true;
    return attempt;
  },

  async expireAssessmentAttempt(input) {
    calls.push(["expire", { ...input, userId: String(input.userId) }]);
    const attempt = ownedAttempt(input);
    attempt.status = "disqualified";
    attempt.submittedAt = new Date("2026-08-12T00:06:00.000Z");
    attempt.scorePercent = 0;
    attempt.passed = false;
    attempt.questions[0].submittedAnswer = String(
      input.answers[attempt.questions[0].questionId] || ""
    );
    attempt.questions[0].isCorrect = false;
    return attempt;
  },
};

stub("services/assessmentService.js", assessmentService);
delete require.cache[resolveFromRoot("middleware/apiAuthMiddleware.js")];
delete require.cache[resolveFromRoot("controllers/ipadAssessmentController.js")];

const { requireApiAuth } = require(resolveFromRoot(
  "middleware/apiAuthMiddleware.js"
));
const controller = require(resolveFromRoot(
  "controllers/ipadAssessmentController.js"
));

function assertRegisteredRoutes() {
  const source = fs.readFileSync(
    path.join(repoRoot, "routes/api-routes.js"),
    "utf8"
  );
  for (const declaration of [
    'router.get("/assessments", ipadAssessmentController.list);',
    'router.post("/assessments/start", ipadAssessmentController.start);',
    'router.get("/assessments/:attemptId", ipadAssessmentController.get);',
    'router.patch("/assessments/:attemptId/draft", ipadAssessmentController.saveDraft);',
    'router.post("/assessments/:attemptId/submit", ipadAssessmentController.submit);',
    'router.post("/assessments/:attemptId/expire", ipadAssessmentController.expire);',
  ]) {
    assert.ok(source.includes(declaration), `missing API route: ${declaration}`);
  }
}

function assertHiddenQuestion(question) {
  assert.equal(question.answer, "", "응시 중 정답은 비공개여야 합니다.");
  assert.equal(question.solution, "", "응시 중 해설은 비공개여야 합니다.");
  assert.equal(question.isCorrect, null, "응시 중 채점 결과는 비공개여야 합니다.");
}

async function run() {
  assertRegisteredRoutes();

  const app = express();
  app.use(express.json());
  app.use("/api/v1/assessments", requireApiAuth);
  app.get("/api/v1/assessments", controller.list);
  app.post("/api/v1/assessments/start", controller.start);
  app.get("/api/v1/assessments/:attemptId", controller.get);
  app.patch("/api/v1/assessments/:attemptId/draft", controller.saveDraft);
  app.post("/api/v1/assessments/:attemptId/submit", controller.submit);
  app.post("/api/v1/assessments/:attemptId/expire", controller.expire);
  app.use((error, req, res, next) => {
    void req;
    void next;
    res.status(error.status || 500).json({
      code: error.code || null,
      message: error.message,
    });
  });

  const server = await new Promise((accept) => {
    const listening = app.listen(0, "127.0.0.1", () => accept(listening));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}/api/v1/assessments`;
  const request = (token, pathSuffix, options = {}) =>
    fetch(`${base}${pathSuffix}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });

  try {
    let response = await fetch(base);
    assert.equal(response.status, 401, "Bearer 없는 요청은 거절해야 합니다.");
    response = await request("assessment-revoked", "");
    assert.equal(response.status, 401, "폐기된 tokenVersion은 거절해야 합니다.");

    const startBody = JSON.stringify({
      scopeType: "course",
      courseId: "math1",
      clientStartId: "client-start-1",
    });
    const concurrentStarts = await Promise.all([
      request("assessment-a", "/start", {
        method: "POST",
        body: startBody,
      }),
      request("assessment-a", "/start", {
        method: "POST",
        body: startBody,
      }),
    ]);
    assert.equal(concurrentStarts[0].status, 200);
    assert.equal(concurrentStarts[1].status, 200);
    const [firstStart, replayedStart] = await Promise.all(
      concurrentStarts.map((item) => item.json())
    );
    const accountAAttemptId = firstStart.assessment.id;
    assertHiddenQuestion(firstStart.assessment.questions[0]);
    assert.equal(
      replayedStart.assessment.id,
      accountAAttemptId,
      "동시 요청도 같은 계정과 clientStartId에 같은 시도를 반환해야 합니다."
    );
    assert.equal(startKeys.size, 1);

    response = await request("assessment-b", "/start", {
      method: "POST",
      body: startBody,
    });
    let payload = await response.json();
    assert.notEqual(
      payload.assessment.id,
      accountAAttemptId,
      "멱등 키는 사용자 경계 안에서만 재사용해야 합니다."
    );

    response = await request("assessment-b", `/${accountAAttemptId}`);
    assert.equal(response.status, 404, "다른 사용자의 평가 시도는 숨겨야 합니다.");

    response = await request("assessment-a", `/${accountAAttemptId}`);
    assert.equal(response.status, 200);
    payload = await response.json();
    assertHiddenQuestion(payload.assessment.questions[0]);

    response = await request("assessment-a", `/${accountAAttemptId}/draft`, {
      method: "PATCH",
      body: JSON.stringify({ answers: { "question-authority-1": "1" } }),
    });
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.draft.answeredCount, 1);

    response = await request("assessment-a", `/${accountAAttemptId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: { "question-authority-1": "1" } }),
    });
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.assessment.status, "submitted");
    assert.equal(payload.assessment.passed, true);
    assert.equal(payload.assessment.questions[0].answer, "1");
    assert.equal(payload.assessment.questions[0].solution, "양변에서 1을 뺍니다.");
    assert.equal(payload.assessment.questions[0].isCorrect, true);

    const expireStartBody = JSON.stringify({
      scopeType: "unit",
      courseId: "math1",
      unitId: "unit-1",
      clientStartId: "client-start-expire",
    });
    response = await request("assessment-a", "/start", {
      method: "POST",
      body: expireStartBody,
    });
    payload = await response.json();
    const expiringId = payload.assessment.id;
    response = await request("assessment-a", `/${expiringId}/expire`, {
      method: "POST",
      body: JSON.stringify({ answers: { "question-authority-1": "" } }),
    });
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.assessment.status, "disqualified");
    assert.equal(payload.assessment.disqualified, true);
    assert.equal(payload.assessment.questions[0].answer, "1");

    response = await request("assessment-a", "");
    payload = await response.json();
    assert.equal(payload.assessments.length, 2);
    assert.ok(
      calls.every(([, input]) => String(input.userId) === ACCOUNT_A || String(input.userId) === ACCOUNT_B),
      "모든 서비스 호출은 인증된 사용자 ID를 포함해야 합니다."
    );
  } finally {
    await new Promise((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }

  console.log(
    "iPad assessment HTTP contract verified: Bearer auth, ownership, concurrent idempotent start, answer hiding, draft, submit, and expire."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

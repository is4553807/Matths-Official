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

const ACCOUNT_A = "64d000000000000000000011";
const ACCOUNT_B = "64d000000000000000000012";
const users = new Map([
  [ACCOUNT_A, user(ACCOUNT_A)],
  [ACCOUNT_B, user(ACCOUNT_B)],
]);

function user(id) {
  return {
    _id: id,
    tokenVersion: 5,
    toObject() {
      return { _id: this._id, tokenVersion: this.tokenVersion };
    },
  };
}

stub("services/mobileAuthService.js", {
  verifyAccessToken(token) {
    if (token === "placement-a") return { sub: ACCOUNT_A, ver: 5 };
    if (token === "placement-b") return { sub: ACCOUNT_B, ver: 5 };
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
const activeByUser = new Map();
const calls = [];
let sequence = 0;

function notFound() {
  const error = new Error("배치고사 시도를 찾을 수 없습니다.");
  error.status = 404;
  return error;
}

function ownedAttempt({ userId, attemptId }) {
  const attempt = attempts.get(String(attemptId));
  if (!attempt || String(attempt.userId) !== String(userId)) throw notFound();
  return attempt;
}

function question() {
  return {
    questionId: "placement-question-1",
    placementNumber: 1,
    prompt: "2x=4일 때 x는?",
    inputMode: "multiple-choice",
    choices: [
      { key: "1", text: "1" },
      { key: "2", text: "2" },
    ],
    answer: "2",
    solution: "양변을 2로 나눕니다.",
    points: 3,
    submittedAnswer: "",
    responseTimeMs: 0,
    visitCount: 1,
  };
}

function activeAttempt(userId) {
  sequence += 1;
  const id = `64d0000000000000000001${String(sequence).padStart(2, "0")}`;
  const attempt = {
    _id: id,
    userId: String(userId),
    status: "in-progress",
    placementPurpose: "INITIAL",
    questions: [question()],
    timeLimitMs: 6_000_000,
    startedAt: new Date("2026-08-12T01:00:00.000Z"),
    elapsedTimeMs: 0,
    currentQuestionIndex: 0,
    submittedAt: null,
    placementResult: null,
  };
  attempts.set(id, attempt);
  activeByUser.set(String(userId), id);
  return attempt;
}

const placementService = {
  async getPlacementDashboardData(userId) {
    calls.push(["status", { userId: String(userId) }]);
    const docs = [...attempts.values()].filter(
      (attempt) => String(attempt.userId) === String(userId)
    );
    const doc = docs.at(-1);
    if (!doc) {
      return {
        status: "not-started",
        attemptId: null,
        answeredCount: 0,
        ctaLabel: "배치고사 시작",
      };
    }
    return {
      status: doc.status,
      attemptId: String(doc._id),
      answeredCount: doc.questions.filter((item) => item.submittedAnswer).length,
      ctaLabel: doc.status === "submitted" ? "결과 보기" : "이어하기",
    };
  },

  async createPlacementAttempt({ userId }) {
    calls.push(["start", { userId: String(userId) }]);
    const activeId = activeByUser.get(String(userId));
    if (activeId) {
      const existing = attempts.get(activeId);
      if (existing?.status === "in-progress") return existing;
    }
    return activeAttempt(userId);
  },

  async getPlacementAttempt(input) {
    calls.push(["get", { ...input, userId: String(input.userId) }]);
    return ownedAttempt(input);
  },

  async savePlacementDraft(input) {
    calls.push(["draft", { ...input, userId: String(input.userId) }]);
    const attempt = ownedAttempt(input);
    attempt.questions[0].submittedAnswer = String(
      input.answers[attempt.questions[0].questionId] || ""
    );
    attempt.elapsedTimeMs = 12_000;
    attempt.currentQuestionIndex = input.currentQuestionIndex;
    return {
      savedAt: new Date("2026-08-12T01:02:00.000Z"),
      elapsedTimeMs: attempt.elapsedTimeMs,
      answeredCount: attempt.questions[0].submittedAnswer ? 1 : 0,
      currentQuestionIndex: attempt.currentQuestionIndex,
      status: attempt.status,
      expired: false,
    };
  },

  async submitPlacementAttempt(input) {
    calls.push(["submit", { ...input, userId: String(input.userId) }]);
    const attempt = ownedAttempt(input);
    attempt.status = "submitted";
    attempt.submittedAt = new Date("2026-08-12T03:00:00.000Z");
    attempt.elapsedTimeMs = 4_200_000;
    attempt.currentQuestionIndex = input.currentQuestionIndex;
    attempt.questions[0].submittedAnswer = String(
      input.answers[attempt.questions[0].questionId] || ""
    );
    attempt.placementResult = {
      placementScore: 87.5,
      initialMmr: 1320,
      initialTier: "플래티넘",
      rankPoint: 42,
      rankingStatus: "PROVISIONAL",
      percentile: 0.91,
      threePoint: { correct: 18 },
      fourPoint: { correct: 7 },
      verification: { result: "passed" },
    };
    return attempt;
  },

  async expirePlacementAttempt(input) {
    calls.push(["expire", { ...input, userId: String(input.userId) }]);
    const attempt = ownedAttempt(input);
    attempt.status = "disqualified";
    attempt.submittedAt = new Date("2026-08-12T03:30:00.000Z");
    return attempt;
  },
};

stub("services/placementExamService.js", placementService);
stub("services/mmrService.js", {
  async ensureRankingProfile(id) {
    assert.ok(users.has(String(id)), "랭킹 프로필은 시도 소유자 기준이어야 합니다.");
    return {
      tier: "PLATINUM",
      tierLabel: "플래티넘",
      mmr: 1320,
      rankPoint: 42,
      status: "PROVISIONAL",
      percentile: 0.91,
    };
  },
  rankingProfileView(profile) {
    return profile;
  },
});

delete require.cache[resolveFromRoot("middleware/apiAuthMiddleware.js")];
delete require.cache[resolveFromRoot("controllers/ipadPlacementController.js")];
const { requireApiAuth } = require(resolveFromRoot(
  "middleware/apiAuthMiddleware.js"
));
const controller = require(resolveFromRoot(
  "controllers/ipadPlacementController.js"
));

function assertRegisteredRoutes() {
  const source = fs.readFileSync(
    path.join(repoRoot, "routes/api-routes.js"),
    "utf8"
  );
  for (const declaration of [
    'router.get("/placement-exam/status", ipadPlacementController.getStatus);',
    'router.post("/placement-exam/start", ipadPlacementController.start);',
    'router.get("/placement-exam/:attemptId", ipadPlacementController.getAttempt);',
    'router.patch("/placement-exam/:attemptId/draft", ipadPlacementController.saveDraft);',
    'router.post("/placement-exam/:attemptId/submit", ipadPlacementController.submit);',
    'router.post("/placement-exam/:attemptId/expire", ipadPlacementController.expire);',
  ]) {
    assert.ok(source.includes(declaration), `missing API route: ${declaration}`);
  }
}

function assertAnswerAuthorityHidden(questionView) {
  assert.equal(
    Object.hasOwn(questionView, "answer"),
    false,
    "배치고사 정답 필드는 앱 응답에 포함하면 안 됩니다."
  );
  assert.equal(
    Object.hasOwn(questionView, "solution"),
    false,
    "배치고사 해설 필드는 앱 응답에 포함하면 안 됩니다."
  );
}

async function run() {
  assertRegisteredRoutes();

  const app = express();
  app.use(express.json());
  app.use("/api/v1/placement-exam", requireApiAuth);
  app.get("/api/v1/placement-exam/status", controller.getStatus);
  app.post("/api/v1/placement-exam/start", controller.start);
  app.get("/api/v1/placement-exam/:attemptId", controller.getAttempt);
  app.patch("/api/v1/placement-exam/:attemptId/draft", controller.saveDraft);
  app.post("/api/v1/placement-exam/:attemptId/submit", controller.submit);
  app.post("/api/v1/placement-exam/:attemptId/expire", controller.expire);
  app.use((error, req, res, next) => {
    void req;
    void next;
    res.status(error.status || 500).json({ message: error.message });
  });

  const server = await new Promise((accept) => {
    const listening = app.listen(0, "127.0.0.1", () => accept(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/placement-exam`;
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
    let response = await fetch(`${base}/status`);
    assert.equal(response.status, 401, "Bearer 없는 배치고사 요청은 거절해야 합니다.");
    assert.equal(calls.length, 0, "인증 실패 요청은 배치 서비스에 도달하면 안 됩니다.");

    response = await request("placement-a", "/status");
    assert.equal(response.status, 200);
    let payload = await response.json();
    assert.equal(payload.placement.status, "not-started");

    response = await request("placement-a", "/start", { method: "POST" });
    assert.equal(response.status, 200);
    payload = await response.json();
    const accountAAttemptId = payload.attempt.id;
    assert.equal(payload.attempt.phase, "exam");
    assertAnswerAuthorityHidden(payload.attempt.questions[0]);

    response = await request("placement-a", "/start", { method: "POST" });
    payload = await response.json();
    assert.equal(
      payload.attempt.id,
      accountAAttemptId,
      "진행 중 배치고사 시작 재요청은 같은 시도를 반환해야 합니다."
    );

    response = await request("placement-b", "/start", { method: "POST" });
    payload = await response.json();
    assert.notEqual(
      payload.attempt.id,
      accountAAttemptId,
      "진행 시도 재사용은 사용자 경계를 넘으면 안 됩니다."
    );

    response = await request("placement-b", `/${accountAAttemptId}`);
    assert.equal(response.status, 404, "다른 사용자의 배치고사 시도는 숨겨야 합니다.");

    response = await request("placement-a", `/${accountAAttemptId}`);
    assert.equal(response.status, 200);
    payload = await response.json();
    assertAnswerAuthorityHidden(payload.attempt.questions[0]);

    response = await request("placement-a", `/${accountAAttemptId}/draft`, {
      method: "PATCH",
      body: JSON.stringify({
        answers: { "placement-question-1": "2" },
        activeQuestionId: "placement-question-1",
        currentQuestionIndex: 0,
        closeQuestionTiming: true,
      }),
    });
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.draft.answeredCount, 1);
    assert.equal(payload.draft.elapsedTimeMs, 12_000);

    response = await request("placement-a", `/${accountAAttemptId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        answers: { "placement-question-1": "2" },
        activeQuestionId: "placement-question-1",
        currentQuestionIndex: 0,
      }),
    });
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.attempt.phase, "completed");
    assert.equal(payload.result.tierCode, "PLATINUM");
    assert.equal(payload.result.tierLabel, "플래티넘");
    assert.equal(payload.result.initialMmr, 1320);
    assert.deepEqual(payload.presentation, {
      id: `placement-${accountAAttemptId}`,
      kind: "placement",
      tierCode: "PLATINUM",
      tierLabel: "플래티넘",
    });
    assertAnswerAuthorityHidden(payload.attempt.questions[0]);

    response = await request("placement-a", "/status");
    payload = await response.json();
    assert.equal(payload.placement.status, "submitted");
    assert.deepEqual(payload.placement.presentation, payload.presentation || {
      id: `placement-${accountAAttemptId}`,
      kind: "placement",
      tierCode: "PLATINUM",
      tierLabel: "플래티넘",
    });

    response = await request("placement-a", "/start", { method: "POST" });
    payload = await response.json();
    const expiringId = payload.attempt.id;
    assert.notEqual(expiringId, accountAAttemptId);
    response = await request("placement-a", `/${expiringId}/expire`, {
      method: "POST",
      body: JSON.stringify({ answers: {}, currentQuestionIndex: 0 }),
    });
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.equal(payload.attempt.phase, "completed");
    assert.equal(payload.attempt.status, "disqualified");
    assert.equal(payload.result, null);
    assert.equal(payload.presentation, null);

    const mutatingCalls = calls.filter(([name]) =>
      ["draft", "submit", "expire"].includes(name)
    );
    assert.ok(
      mutatingCalls.every(([, input]) => String(input.userId) === ACCOUNT_A),
      "쓰기 서비스에는 인증된 시도 소유자 ID만 전달해야 합니다."
    );
  } finally {
    await new Promise((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }

  console.log(
    "iPad placement HTTP contract verified: Bearer auth, ownership, idempotent resume, answer hiding, status, draft, submit, presentation, and expire."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

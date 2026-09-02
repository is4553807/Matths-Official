"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminWeeklyMockController.js"), "utf8");
const calls = [];

function install(filename, value) {
  const resolved = require.resolve(filename); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value };
}
const exam = { _id: "e1", id: "e1", title: "주간 모의고사", questionCount: 2, status: "closed", answerKey: ["1", "2"], points: [3, 4], explanations: [] };
install("../services/privateMockExamService", {
  createPrivateMockExamBatch: async () => [],
  createPrivateMockFormulaResource: async () => {},
  deletePrivateMockFormulaResource: async () => {},
  getAdminPrivateMockPdfFile: async () => ({ path: __filename, mimeType: "application/pdf", name: "x.pdf" }),
  getAdminPrivateMockIntegrityEvidenceFile: async () => ({ path: __filename, mimeType: "application/pdf", name: "x.pdf" }),
  getAdminPrivateMockExamData: async () => ({ nextSunday: "2026-09-06", defaultExamDate: "2026-W36", defaultDurationMinutes: 80, formSchedules: [], formulaResources: [], exams: [{ ...exam, attemptCount: 1, integrityCaseCount: 0 }] }),
  getAdminPrivateMockExamDetailData: async () => ({ exam, attempts: [{ _id: "a1", userId: { _id: "u1", realName: "학생", email: "s@example.com" }, status: "submitted", score: 70, correctCount: 1, elapsedMs: 1000, answers: ["1", "3"], correctByQuestion: [true, false], incorrectQuestionNumbers: [2], review: [{ number: 1, isCorrect: true }], events: [] }] }),
  getAdminPrivateMockObjection: async () => ({ _id: "o1", id: "o1", userId: { _id: "u1", realName: "학생" }, examId: exam, questionNumber: 2, currentAnswer: "2", issueDetail: "복수 정답", status: "pending" }),
  requestPrivateMockIntegrityEvidenceByAdmin: async (value) => calls.push(["request", value]),
  reviewPrivateMockIntegrityCase: async (value) => calls.push(["review", value]),
  correctPrivateMockAnswers: async (value) => { calls.push(["correct", value]); return { affectedAttemptCount: 1 }; },
  deletePrivateMockExam: async (value) => calls.push(["delete", value]),
  rejectPrivateMockObjection: async (value) => calls.push(["reject", value]),
  acceptPrivateMockObjection: async (value) => calls.push(["accept", value]),
});
install("../services/archiveService", { discardArchiveUpload: async () => {} });

async function invoke(handler, { role = "admin", params = {}, body = {} } = {}) {
  let payload; let error; const headers = new Map();
  const req = { apiUser: { _id: "admin-1", role }, params, body, query: {} };
  const res = { set(key, value) { headers.set(key, value); return res; }, json(value) { payload = value; return res; } };
  await handler(req, res, (value) => { error = value; }); return { payload, error, headers };
}

for (const route of [
  'router.get("/admin/weekly-mock-exams"', '"/admin/weekly-mock-exams/:examId"',
  '"/admin/weekly-mock-exams/:examId/attempts/:attemptId/integrity-request"',
  '"/admin/weekly-mock-exams/:examId/integrity/:caseId/review"',
  '"/admin/weekly-mock-exams/:examId/answer-corrections"',
  '"/admin/weekly-mock-objections/:objectionId/accept"',
]) assert(routes.includes(route), `missing admin weekly mock route ${route}`);
assert(source.includes("req.apiUser")); assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminWeeklyMockController");
(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.dashboard); assert.equal(dashboard.payload.schemaVersion, "ADMIN_WEEKLY_MOCK_NATIVE_V1"); assert.equal(dashboard.payload.dashboard.exams[0].attemptCount, 1);
  const detail = await invoke(controller.detail, { params: { examId: "e1" } }); assert.equal(detail.payload.detail.attempts[0].user.name, "학생"); assert.equal(detail.headers.get("Cache-Control"), "private, no-store");
  const objection = await invoke(controller.objection, { params: { objectionId: "o1" } }); assert.equal(objection.payload.objection.currentAnswer, "2");
  await invoke(controller.requestIntegrityEvidence, { params: { examId: "e1", attemptId: "a1" }, body: { requestedQuestionNumbers: "2" } });
  await invoke(controller.reviewIntegrity, { params: { examId: "e1", caseId: "c1" }, body: { reviewStatus: "completed" } });
  const correction = await invoke(controller.correctAnswers, { params: { examId: "e1" }, body: { corrections: [{ questionNumber: 2, newAnswer: "3" }] } }); assert.equal(correction.payload.affectedAttemptCount, 1);
  await invoke(controller.deleteExam, { params: { examId: "e1" } });
  await invoke(controller.rejectObjection, { params: { objectionId: "o1" }, body: { reason: "반려 사유" } });
  await invoke(controller.acceptObjection, { params: { objectionId: "o1" }, body: { newAnswer: "3", questionContent: "문항", reason: "정정 사유" } });
  assert.deepEqual(calls.map(([name]) => name), ["request", "review", "correct", "delete", "reject", "accept"]);
  console.log("iPad native admin weekly mock HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

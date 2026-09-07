const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");

const STAGES = new Set(["goal", "diagnosis", "lesson", "checks", "awaitingSync", "result", "completed", "skipped"]);
const GOALS = new Set(["school", "review", "examination", "measure"]);
const STATE_FIELDS = ["flowVersion", "stage", "goal", "diagnosticAnswers", "seed", "conceptId",
  "expectedProblemIds", "problemContentFingerprint", "checkedAnswers", "topicRead", "startedAt",
  "learningStartedAt", "baselineProgress"];

function invalid(message = "첫 학습 저장 정보가 올바르지 않습니다.") {
  return Object.assign(new Error(message), { status: 400, code: "FIRST_LEARNING_STATE_INVALID" });
}
function strictObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !fields.includes(key))) throw invalid();
  return value;
}
function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function nullableDate(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) throw invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid();
  return date;
}
function validateFirstLearningState(value) {
  const state = strictObject(value, STATE_FIELDS);
  if (state.flowVersion !== 2 || !STAGES.has(state.stage) || !GOALS.has(state.goal) ||
      typeof state.topicRead !== "boolean") throw invalid();
  if (!Array.isArray(state.diagnosticAnswers) || state.diagnosticAnswers.length > 2 ||
      state.diagnosticAnswers.some((answer, index) => !(index === 0 ? [6, 7, 8] : [2, 3, 4]).includes(answer))) throw invalid();
  if (state.seed != null && (typeof state.seed !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(state.seed) ||
      BigInt(state.seed) > 18446744073709551615n)) throw invalid();
  if (state.conceptId != null && !safeId(state.conceptId)) throw invalid();
  if (!Array.isArray(state.expectedProblemIds) || state.expectedProblemIds.length > 3 ||
      !state.expectedProblemIds.every(safeId) || new Set(state.expectedProblemIds).size !== state.expectedProblemIds.length) throw invalid();
  if (state.problemContentFingerprint != null && (typeof state.problemContentFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(state.problemContentFingerprint))) throw invalid();
  if (!Array.isArray(state.checkedAnswers) || state.checkedAnswers.length > 3) throw invalid();
  const checked = state.checkedAnswers.map((answer) => {
    strictObject(answer, ["problemId", "correct"]);
    if (!state.expectedProblemIds.includes(answer.problemId) || typeof answer.correct !== "boolean") throw invalid();
    return { problemId: answer.problemId, correct: answer.correct };
  });
  if (new Set(checked.map((answer) => answer.problemId)).size !== checked.length) throw invalid();
  if (state.baselineProgress != null && (!Number.isInteger(state.baselineProgress) ||
      state.baselineProgress < 0 || state.baselineProgress > 100)) throw invalid();
  if (["checks", "awaitingSync", "result", "completed"].includes(state.stage) &&
      (!state.conceptId || state.seed == null || state.expectedProblemIds.length !== 3 || !state.topicRead)) throw invalid();
  if (["awaitingSync", "result", "completed"].includes(state.stage) && checked.length !== 3) throw invalid();
  return {
    flowVersion: 2, stage: state.stage, goal: state.goal,
    diagnosticAnswers: [...state.diagnosticAnswers], seed: state.seed ?? null,
    conceptId: state.conceptId ?? null, expectedProblemIds: [...state.expectedProblemIds],
    problemContentFingerprint: state.problemContentFingerprint ?? null,
    checkedAnswers: checked, topicRead: state.topicRead,
    startedAt: nullableDate(state.startedAt), learningStartedAt: nullableDate(state.learningStartedAt),
    baselineProgress: state.baselineProgress ?? null,
  };
}

function firstLearningEnvelope(preferences = {}) {
  const stored = preferences.firstLearning;
  const state = stored ? Object.fromEntries(STATE_FIELDS.map((field) => [field, stored[field] ?? null])) : null;
  return {
    schemaVersion: "FIRST_LEARNING_V1", supported: true,
    revision: Number(preferences.firstLearningRevision) || 0,
    state,
    updatedAt: stored?.updatedAt || null,
  };
}
function userFilter(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw Object.assign(new Error("사용자 정보를 찾을 수 없습니다."), { status: 404 });
  }
  return { _id: userId, isActive: true, accountStatus: { $in: ["active", null] } };
}
async function getFirstLearningState({ userId }) {
  const user = await User.findOne(userFilter(userId)).select("preferences.firstLearning preferences.firstLearningRevision").lean();
  if (!user) throw Object.assign(new Error("사용자 정보를 찾을 수 없습니다."), { status: 404 });
  return firstLearningEnvelope(user.preferences);
}
async function saveFirstLearningState({ userId, body }) {
  strictObject(body, ["schemaVersion", "expectedRevision", "state"]);
  if (body.schemaVersion !== 1 || !Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER) throw invalid();
  const state = validateFirstLearningState(body.state);
  const revisionFilter = body.expectedRevision === 0
    ? { $or: [{ "preferences.firstLearningRevision": 0 }, { "preferences.firstLearningRevision": { $exists: false } }] }
    : { "preferences.firstLearningRevision": body.expectedRevision };
  const user = await User.findOneAndUpdate({ ...userFilter(userId), ...revisionFilter }, {
    $set: { "preferences.firstLearning": { ...state, updatedAt: new Date() } },
    $inc: { "preferences.firstLearningRevision": 1 },
  }, { returnDocument: "after", runValidators: true }).select("preferences.firstLearning preferences.firstLearningRevision").lean();
  if (user) return firstLearningEnvelope(user.preferences);
  const current = await getFirstLearningState({ userId });
  throw Object.assign(new Error("다른 기기에서 학습 안내 상태가 변경되었습니다. 최신 상태를 확인해주세요."), {
    status: 409, code: "FIRST_LEARNING_REVISION_CONFLICT", current,
  });
}

module.exports = { firstLearningEnvelope, getFirstLearningState, saveFirstLearningState, validateFirstLearningState };

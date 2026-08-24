"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const {
  ConceptProgress,
  LearningEvent,
  Problem,
  ProblemAttempt,
} = require("../models/matthsModel");
const {
  findCurriculumConcept,
  loadCurriculum,
} = require("../services/curriculumService");
const {
  canonicalProgressTypeIds,
  canonicalProgressView,
} = require("../services/progressTypeIdService");
const {
  getKoreanDateKey,
  recordStudyActivity,
} = require("../services/userLifecycleService");

const CURRICULUM_ID = "kr-2022";
const IPAD_SYNC_COURSE = "ipad-sync";
const MAX_EVENTS = 500;
const MAX_WRONG_NOTES = 200;
const WRONG_NOTE_PAGE_SIZE = 300;
const PROTECTED_EVENT_TYPES = new Set([
  "protected-screen-screenshot",
  "protected-screen-capture-started",
  "protected-screen-capture-ended",
]);
const STREAK_LEARNING_EVENT_TYPES = new Set([
  "concept-opened",
  "concept-closed",
  "step-viewed",
  "step-replayed",
  "hint-used",
  "problem-opened",
  "problem-attempted",
  "problem-correct",
  "problem-wrong",
  "topic-completed",
  "concept-completed",
  "review-started",
  "review-completed",
]);
const ERROR_TYPES = new Set([
  "calculation-error",
  "formula-confusion",
  "missing-condition",
  "sign-error",
  "concept-not-understood",
  "prerequisite-missing",
  "unknown",
]);
const SYNC_TAG_PREFIX = "ipad-sync:";

let curriculumCache = null;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function boundedText(value, maxLength, { required = false, fallback = "" } = {}) {
  const text = String(value ?? fallback).trim();
  if (required && !text) {
    throw httpError(400, "INVALID_REQUEST", "필수 문자열 값이 비어 있습니다.");
  }
  return text.slice(0, maxLength);
}

function boundedInteger(value, min, max, fallback = null) {
  if (max < min) return fallback;
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function integerInRange(value, min, max, fallback = null) {
  if (max < min) return fallback;
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return fallback;
  return number;
}

function parseDate(value, { required = false, fallback = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw httpError(400, "INVALID_DATE", "요청 시각이 필요합니다.");
    }
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, "INVALID_DATE", "날짜 형식이 올바르지 않습니다.");
  }
  return date;
}

function curriculumData() {
  curriculumCache ||= loadCurriculum();
  return curriculumCache;
}

function conceptContract(courseId, unitId, conceptId) {
  const ids = [courseId, unitId, conceptId].map((value) =>
    boundedText(value, 120, { required: true })
  );
  const match = findCurriculumConcept(curriculumData(), ...ids);
  if (!match) {
    throw httpError(404, "CONCEPT_NOT_FOUND", "교육과정에서 해당 개념을 찾을 수 없습니다.");
  }
  return {
    courseId: ids[0],
    unitId: ids[1],
    conceptId: ids[2],
    topicCount: Array.isArray(match.concept.topics) ? match.concept.topics.length : 0,
  };
}

function progressFilter(userId, contract) {
  return {
    userId,
    curriculumId: CURRICULUM_ID,
    courseId: contract.courseId,
    unitId: contract.unitId,
    conceptId: contract.conceptId,
  };
}

function canonicalTypeIdsExpression(additionalTypeIds) {
  const storedTypeId = { $toString: "$$typeId" };
  return {
    $setUnion: [
      {
        $map: {
          input: { $ifNull: ["$masteryGate.correctTypeIds", []] },
          as: "typeId",
          in: {
            $cond: [
              { $eq: [{ $indexOfBytes: [storedTypeId, "web-"] }, 0] },
              {
                $substrBytes: [
                  storedTypeId,
                  4,
                  { $subtract: [{ $strLenBytes: storedTypeId }, 4] },
                ],
              },
              storedTypeId,
            ],
          },
        },
      },
      canonicalProgressTypeIds(additionalTypeIds),
    ],
  };
}

async function latestProgressResetCutoff(userId) {
  const reset = await LearningEvent.findOne({
    userId,
    "metadata.syncKind": "ipad-progress-reset",
  })
    .sort({ occurredAt: -1, _id: -1 })
    .select("occurredAt metadata.cutoff")
    .lean();
  if (!reset) return null;
  return parseDate(reset.metadata?.cutoff, { fallback: reset.occurredAt });
}

async function ensureProgress(userId, contract) {
  const filter = progressFilter(userId, contract);
  let progress = await ConceptProgress.findOne(filter);
  if (progress) return progress;
  try {
    progress = new ConceptProgress({
      ...filter,
      topicCount: contract.topicCount,
      lastStudiedAt: new Date(),
    });
    await progress.save();
    return progress;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return ConceptProgress.findOne(filter);
  }
}

async function refreshProgress(userId, contract) {
  const progress = await ConceptProgress.findOne(progressFilter(userId, contract));
  if (!progress) {
    throw httpError(500, "PROGRESS_WRITE_FAILED", "학습 진도를 저장하지 못했습니다.");
  }
  progress.topicCount = contract.topicCount;
  await progress.save();
  return progress;
}

function serializeProgress(progress) {
  const view = canonicalProgressView(progress);
  return {
    courseId: progress.courseId,
    unitId: progress.unitId,
    conceptId: progress.conceptId,
    topicCount: Number(progress.topicCount) || 0,
    completedTopicIndexes: view.completedTopicIndexes,
    completionPercent: view.completionPercent,
    status: view.status,
    masteryGate: {
      requiredDistinctTypes: view.requiredDistinctTypes,
      correctTypeIds: view.correctTypeIds,
      unlocked: view.masteryUnlocked,
      userCompleted: view.userCompleted,
    },
    lastStudiedAt: progress.lastStudiedAt || null,
    updatedAt: progress.updatedAt || null,
  };
}

function sanitizeJson(value, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 1000);
  if (depth >= 4) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeJson(item, depth + 1));
  }
  if (!value || typeof value !== "object") return null;
  const safe = {};
  for (const [rawKey, child] of Object.entries(value).slice(0, 80)) {
    const key = String(rawKey).slice(0, 80);
    if (!key || ["__proto__", "prototype", "constructor"].includes(key)) continue;
    safe[key] = sanitizeJson(child, depth + 1);
  }
  return safe;
}

function allowedLearningEventTypes() {
  return new Set(LearningEvent.schema.path("eventType")?.enumValues || []);
}

function normalizeEvent(raw, { userId, sessionId, occurredAtFallback = new Date() }) {
  if (!raw || typeof raw !== "object") return null;
  const clientEventId = boundedText(raw.clientEventId, 160);
  const sourceEventType = boundedText(raw.eventType, 100).toLowerCase();
  if (!clientEventId || !sourceEventType) return null;

  const allowed = allowedLearningEventTypes();
  const protectedEvent = PROTECTED_EVENT_TYPES.has(sourceEventType);
  if (!allowed.has(sourceEventType) && !protectedEvent) return null;

  let occurredAt;
  try {
    occurredAt = parseDate(raw.occurredAt, { fallback: occurredAtFallback });
  } catch (_error) {
    return null;
  }

  const metadata = sanitizeJson(raw.metadata) || {};
  if (protectedEvent) {
    metadata.syncKind = "protected-screen-event";
    metadata.sourceEventType = sourceEventType;
    metadata.integritySessionCode = boundedText(raw.integritySessionCode, 16, {
      fallback: "UNKNOWN",
    });
    metadata.protectedSurface = boundedText(raw.protectedSurface, 160, {
      fallback: "protected",
    });
    metadata.analyticsExcluded = true;
  }

  const document = {
    userId,
    clientEventId,
    sessionId,
    eventType: protectedEvent ? "concept-closed" : sourceEventType,
    curriculumId: CURRICULUM_ID,
    courseId: boundedText(raw.courseId, 120) || null,
    unitId: boundedText(raw.unitId, 120) || null,
    conceptId: boundedText(raw.conceptId, 120) || null,
    topicIndex: boundedInteger(raw.topicIndex, 0, 10000),
    stepNumber: boundedInteger(raw.stepNumber, 1, 10000),
    durationMs: boundedInteger(raw.durationMs, 0, 86_400_000),
    correct: typeof raw.correct === "boolean" ? raw.correct : null,
    metadata,
    occurredAt,
  };
  if (mongoose.isValidObjectId(raw.problemId)) document.problemId = raw.problemId;
  if (mongoose.isValidObjectId(raw.attemptId)) document.attemptId = raw.attemptId;
  return document;
}

function isStreakLearningEvent(document) {
  return Boolean(
    document &&
      document.metadata?.analyticsExcluded !== true &&
      STREAK_LEARNING_EVENT_TYPES.has(document.eventType)
  );
}

function groupIpadLearningEvents(documents, acceptedClientEventIds) {
  const accepted = acceptedClientEventIds || new Set();
  const days = new Map();
  for (const document of documents || []) {
    if (!isStreakLearningEvent(document)) continue;
    const dateKey = getKoreanDateKey(document.occurredAt);
    const current = days.get(dateKey) || {
      userId: document.userId,
      occurredAt: document.occurredAt,
      durationMs: 0,
    };
    if (new Date(document.occurredAt) > new Date(current.occurredAt)) {
      current.occurredAt = document.occurredAt;
    }
    if (accepted.has(document.clientEventId)) {
      current.durationMs += Math.max(0, Number(document.durationMs) || 0);
    }
    days.set(dateKey, current);
  }

  return [...days.values()].sort(
    (left, right) => new Date(left.occurredAt) - new Date(right.occurredAt)
  );
}

async function recordIpadLearningEvents(documents, acceptedClientEventIds) {
  for (const day of groupIpadLearningEvents(
    documents,
    acceptedClientEventIds
  )) {
    /* LearningEvent의 unique insert가 시간 중복 집계를 막고, 0ms 재호출은
     * 중간 실패 뒤 재시도에서도 streak 날짜만 안전하게 복구한다. */
    await recordStudyActivity(day.userId, day.occurredAt, day.durationMs);
  }
}

async function insertEventOnce(document) {
  const result = await LearningEvent.updateOne(
    { userId: document.userId, clientEventId: document.clientEventId },
    { $setOnInsert: document },
    { upsert: true }
  );
  return Number(result.upsertedCount || 0) > 0;
}

function tag(prefix, value) {
  return `${SYNC_TAG_PREFIX}${prefix}:${Buffer.from(String(value)).toString("base64url")}`;
}

function tagValue(tags, prefix) {
  const marker = `${SYNC_TAG_PREFIX}${prefix}:`;
  const encoded = (Array.isArray(tags) ? tags : []).find((item) =>
    String(item).startsWith(marker)
  );
  if (!encoded) return null;
  try {
    return Buffer.from(String(encoded).slice(marker.length), "base64url").toString("utf8");
  } catch (_error) {
    return null;
  }
}

function replaceTag(tags, prefix, value) {
  const marker = `${SYNC_TAG_PREFIX}${prefix}:`;
  return [
    ...(Array.isArray(tags) ? tags : []).filter((item) => !String(item).startsWith(marker)),
    tag(prefix, value),
  ];
}

function wrongNoteExternalId(userId, clientAttemptId) {
  const digest = crypto
    .createHash("sha256")
    .update(`${String(userId)}\0${clientAttemptId}`)
    .digest("hex");
  return `ipad-wrong-note:${digest}`;
}

function wrongNoteState(problem) {
  return {
    clientAttemptId: tagValue(problem?.tags, "client-attempt"),
    srsStage: boundedInteger(tagValue(problem?.tags, "srs-stage"), 0, 4, 0),
    wrongCount: boundedInteger(tagValue(problem?.tags, "wrong-count"), 0, 100000, 1),
    divergenceStep: integerInRange(
      tagValue(problem?.tags, "divergence-step"),
      0,
      1000
    ),
    isTex: tagValue(problem?.tags, "is-tex") === "1",
  };
}

async function saveWrongNoteState(problem, state) {
  let tags = Array.isArray(problem.tags) ? [...problem.tags] : [];
  if (state.clientAttemptId) {
    tags = replaceTag(tags, "client-attempt", state.clientAttemptId);
  }
  tags = replaceTag(tags, "srs-stage", boundedInteger(state.srsStage, 0, 4, 0));
  tags = replaceTag(tags, "wrong-count", boundedInteger(state.wrongCount, 0, 100000, 1));
  if (state.divergenceStep !== null && state.divergenceStep !== undefined) {
    tags = replaceTag(
      tags,
      "divergence-step",
      integerInRange(state.divergenceStep, 0, 1000, 0)
    );
  }
  tags = replaceTag(tags, "is-tex", state.isTex === true ? "1" : "0");
  problem.tags = tags;
  await problem.save();
}

function normalizeChoices(values) {
  return (Array.isArray(values) ? values : [])
    .slice(0, 10)
    .map((value, index) => ({
      key: String.fromCharCode(97 + index),
      text: boundedText(value, 1000),
    }))
    .filter((choice) => choice.text);
}

function incomingWrongNote(entry) {
  const clientAttemptId = boundedText(entry?.clientAttemptId, 160, { required: true });
  const statement = boundedText(entry?.statement, 4000, { required: true });
  const answer = boundedText(entry?.answer, 2000);
  const typeKey = boundedText(entry?.typeKey, 120, { fallback: "unknown" }) || "unknown";
  const steps = (Array.isArray(entry?.steps) ? entry.steps : [])
    .slice(0, 20)
    .map((step) => boundedText(step, 2000))
    .filter(Boolean);
  const nextReviewAt = parseDate(entry?.nextReviewAt);
  const srsStage = boundedInteger(entry?.srsStage, 0, 4, 0);
  const wrongCount = boundedInteger(entry?.wrongCount, 1, 100000, 1);
  const createdAt = parseDate(entry?.createdAt, { fallback: new Date() });
  const errorType = ERROR_TYPES.has(String(entry?.errorType)) ? String(entry.errorType) : "unknown";
  return {
    clientAttemptId,
    statement,
    answer,
    typeKey,
    steps,
    choices: normalizeChoices(entry?.choices),
    myAnswer: boundedText(entry?.myAnswer, 2000, { fallback: "답안 없음" }) || "답안 없음",
    divergenceStep: integerInRange(entry?.divergenceStep, 0, 1000),
    errorType,
    srsStage,
    wrongCount,
    nextReviewAt,
    createdAt,
    isTex: entry?.isTex === true,
    courseId: boundedText(entry?.courseId, 120, { fallback: IPAD_SYNC_COURSE }) || IPAD_SYNC_COURSE,
    unitId: boundedText(entry?.unitId, 120, { fallback: IPAD_SYNC_COURSE }) || IPAD_SYNC_COURSE,
    conceptId: boundedText(entry?.conceptId, 120, { fallback: typeKey }) || typeKey,
  };
}

function reviewStatus({ srsStage, nextReviewAt }) {
  if (srsStage >= 4 && !nextReviewAt) return "completed";
  return nextReviewAt ? "scheduled" : "pending";
}

async function upsertWrongNote(userId, rawEntry) {
  const entry = incomingWrongNote(rawEntry);
  const externalId = wrongNoteExternalId(userId, entry.clientAttemptId);
  const problem = await Problem.findOneAndUpdate(
    { externalId },
    {
      $setOnInsert: {
        externalId,
        curriculumId: CURRICULUM_ID,
        courseId: entry.courseId,
        unitId: entry.unitId,
        conceptIds: [entry.conceptId],
        primaryConceptId: entry.conceptId,
        source: { type: "generated" },
        questionType: entry.choices.length ? "multiple-choice" : "short-answer",
        stem: entry.statement,
        choices: entry.choices,
        correctAnswer: entry.answer,
        solutionSteps: entry.steps.map((explanation, index) => ({
          step: index + 1,
          title: `${index + 1}단계`,
          explanation,
        })),
        difficulty: 1,
        tags: ["ipad-wrong-note"],
        isPublished: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).select("+correctAnswer");

  const previousState = wrongNoteState(problem);
  const newer =
    entry.wrongCount > previousState.wrongCount ||
    (entry.wrongCount === previousState.wrongCount && entry.srsStage >= previousState.srsStage);
  if (!previousState.clientAttemptId || newer) {
    await saveWrongNoteState(problem, entry);
  }

  let attempt = await ProblemAttempt.findOne({
    userId,
    problemId: problem._id,
    attemptNumber: 1,
  });
  const duplicate = Boolean(attempt);
  if (!attempt) {
    try {
      attempt = await ProblemAttempt.create({
        userId,
        problemId: problem._id,
        curriculumId: CURRICULUM_ID,
        courseId: entry.courseId,
        unitId: entry.unitId,
        conceptId: entry.conceptId,
        attemptNumber: 1,
        submittedAnswer: entry.myAnswer,
        problemSnapshot: {
          typeId: entry.typeKey,
          stem: entry.statement,
          choices: entry.choices,
          solution: entry.steps.join("\n"),
          difficulty: 1,
        },
        isCorrect: false,
        stoppedAtStep: entry.divergenceStep > 0 ? entry.divergenceStep : null,
        errorAnalysis: { errorType: entry.errorType },
        review: {
          status: reviewStatus(entry),
          scheduledAt: entry.nextReviewAt,
          correctedAfterReview: false,
        },
        submittedAt: entry.createdAt,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      attempt = await ProblemAttempt.findOne({
        userId,
        problemId: problem._id,
        attemptNumber: 1,
      });
    }
  } else if (newer) {
    attempt.submittedAnswer = entry.myAnswer;
    attempt.stoppedAtStep = entry.divergenceStep > 0 ? entry.divergenceStep : null;
    attempt.errorAnalysis = { errorType: entry.errorType };
    attempt.review.status = reviewStatus(entry);
    attempt.review.scheduledAt = entry.nextReviewAt;
    await attempt.save();
  }
  return { attempt, duplicate, clientAttemptId: entry.clientAttemptId };
}

function serializeWrongNote(attempt) {
  const problem = attempt.problemId || {};
  const state = wrongNoteState(problem);
  const snapshot = attempt.problemSnapshot || {};
  const steps = (problem.solutionSteps || [])
    .map((step) => String(step.explanation || ""))
    .filter(Boolean);
  const submittedAnswer =
    typeof attempt.submittedAnswer === "string"
      ? attempt.submittedAnswer
      : JSON.stringify(attempt.submittedAnswer ?? "");
  return {
    attemptId: String(attempt._id),
    clientAttemptId: state.clientAttemptId || null,
    statement: String(snapshot.stem || problem.stem || ""),
    answer: problem.correctAnswer === undefined ? null : String(problem.correctAnswer),
    steps: steps.length ? steps : String(snapshot.solution || "").split("\n").filter(Boolean),
    typeKey: snapshot.typeId || "unknown",
    myAnswer: submittedAnswer || null,
    divergenceStep: state.divergenceStep ?? attempt.stoppedAtStep ?? null,
    errorType: attempt.errorAnalysis?.errorType || "unknown",
    srsStage: state.srsStage,
    wrongCount: state.wrongCount,
    nextReviewAt: attempt.review?.scheduledAt || null,
    reviewStatus: attempt.review?.status || "pending",
    createdAt: attempt.submittedAt || attempt.createdAt,
    updatedAt: attempt.updatedAt || attempt.submittedAt || attempt.createdAt,
    choices: (snapshot.choices?.length ? snapshot.choices : problem.choices || []).map((choice) =>
      String(choice.text || "")
    ),
    isTex: state.isTex,
  };
}

function invalidWrongNoteCursor() {
  return httpError(400, "INVALID_WRONG_NOTE_CURSOR", "오답 목록 커서가 올바르지 않습니다.");
}

function wrongNoteCursorPosition(value) {
  const id = String(value?._id || value?.id || "");
  const updatedAt = value?.updatedAt instanceof Date
    ? value.updatedAt
    : new Date(value?.updatedAt);
  if (!mongoose.isValidObjectId(id) || Number.isNaN(updatedAt.getTime())) {
    throw invalidWrongNoteCursor();
  }
  return { updatedAt, id };
}

function encodeWrongNoteCursor(value) {
  const position = wrongNoteCursorPosition(value);
  return Buffer.from(
    JSON.stringify({
      v: 1,
      updatedAt: position.updatedAt.toISOString(),
      id: position.id,
    })
  ).toString("base64url");
}

function decodeWrongNoteCursor(value) {
  try {
    const text = boundedText(value, 1000, { required: true });
    const decoded = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    if (decoded?.v !== 1) throw invalidWrongNoteCursor();
    return wrongNoteCursorPosition(decoded);
  } catch (error) {
    if (error?.code === "INVALID_WRONG_NOTE_CURSOR") throw error;
    throw invalidWrongNoteCursor();
  }
}

function wrongNoteCursorClause(cursor) {
  const position = typeof cursor === "string" ? decodeWrongNoteCursor(cursor) : cursor;
  const id = new mongoose.Types.ObjectId(position.id);
  return [
    { updatedAt: { $gt: position.updatedAt } },
    { updatedAt: position.updatedAt, _id: { $gt: id } },
  ];
}

function wrongNotePage(attempts) {
  const hasMore = attempts.length > WRONG_NOTE_PAGE_SIZE;
  const page = hasMore ? attempts.slice(0, WRONG_NOTE_PAGE_SIZE) : attempts;
  return {
    page,
    hasMore,
    nextCursor: hasMore && page.length ? encodeWrongNoteCursor(page[page.length - 1]) : null,
  };
}

async function findWrongNoteAttempt(userId, identifier) {
  const value = boundedText(identifier, 160, { required: true });
  if (mongoose.isValidObjectId(value)) {
    const direct = await ProblemAttempt.findOne({ _id: value, userId }).populate({
      path: "problemId",
      select: "externalId tags +correctAnswer",
    });
    if (direct) return direct;
  }
  const problem = await Problem.findOne({
    externalId: wrongNoteExternalId(userId, value),
  }).select("tags +correctAnswer");
  if (!problem) return null;
  return ProblemAttempt.findOne({ userId, problemId: problem._id, attemptNumber: 1 }).populate({
    path: "problemId",
    select: "externalId tags +correctAnswer",
  });
}

exports.patchMastery = async (req, res, next) => {
  try {
    const contract = conceptContract(req.params.courseId, req.params.unitId, req.params.conceptId);
    const occurredAt = parseDate(req.body?.occurredAt, { fallback: new Date() });
    const resetCutoff = await latestProgressResetCutoff(req.apiUser._id);
    if (resetCutoff && occurredAt <= resetCutoff) {
      const current = await ConceptProgress.findOne(progressFilter(req.apiUser._id, contract));
      return res.json({
        progress: current ? serializeProgress(current) : null,
        ignored: true,
        reason: "BEFORE_PROGRESS_RESET",
      });
    }
    const typeIds = canonicalProgressTypeIds(req.body?.addCorrectTypeIds)
      .map((value) => boundedText(value, 120))
      .filter(Boolean)
      .slice(0, 100);
    await ensureProgress(req.apiUser._id, contract);
    const setStage = {
      "masteryGate.correctTypeIds": canonicalTypeIdsExpression(typeIds),
      lastStudiedAt: {
        $cond: [
          { $gt: [occurredAt, { $ifNull: ["$lastStudiedAt", new Date(0)] }] },
          occurredAt,
          "$lastStudiedAt",
        ],
      },
      topicCount: contract.topicCount,
    };
    if (req.body?.userCompleted === true) {
      setStage["masteryGate.userCompleted"] = true;
    }
    // 기존 web-<typeId>도 같은 원자적 쓰기에서 정본 ID로 접어, DB의 raw 배열과
    // 응답 view가 서로 다른 유형 개수를 세는 순간을 만들지 않는다.
    await ConceptProgress.updateOne(progressFilter(req.apiUser._id, contract), [
      { $set: setStage },
    ]);
    const progress = await refreshProgress(req.apiUser._id, contract);
    return res.json({ progress: serializeProgress(progress) });
  } catch (error) {
    return next(error);
  }
};

exports.updateTopic = async (req, res, next) => {
  try {
    const contract = conceptContract(req.params.courseId, req.params.unitId, req.params.conceptId);
    const topicIndex = integerInRange(req.params.topicIndex, 0, contract.topicCount - 1);
    if (topicIndex === null) {
      throw httpError(400, "INVALID_TOPIC", "학습 주제 번호가 올바르지 않습니다.");
    }
    if (typeof req.body?.completed !== "boolean") {
      throw httpError(400, "INVALID_COMPLETION", "completed 값은 Boolean이어야 합니다.");
    }
    const completed = req.body.completed;
    const clientEventId = boundedText(req.body?.clientEventId, 160, {
      fallback: `web-topic-${crypto.randomUUID()}`,
    });
    const occurredAt = parseDate(req.body?.occurredAt, { fallback: new Date() });
    const resetCutoff = await latestProgressResetCutoff(req.apiUser._id);
    if (resetCutoff && occurredAt <= resetCutoff) {
      const current = await ConceptProgress.findOne(progressFilter(req.apiUser._id, contract));
      return res.json({
        progress: current ? serializeProgress(current) : null,
        ignored: true,
        reason: "BEFORE_PROGRESS_RESET",
      });
    }
    await ensureProgress(req.apiUser._id, contract);
    const update = {
      $set: { topicCount: contract.topicCount },
      $max: { lastStudiedAt: occurredAt },
      [completed ? "$addToSet" : "$pull"]: {
        completedTopicIndexes: topicIndex,
      },
    };
    await ConceptProgress.updateOne(progressFilter(req.apiUser._id, contract), update);
    const activityEvent = {
      userId: req.apiUser._id,
      clientEventId,
      sessionId: "ipad-topic-sync",
      eventType: completed ? "topic-completed" : "topic-uncompleted",
      curriculumId: CURRICULUM_ID,
      courseId: contract.courseId,
      unitId: contract.unitId,
      conceptId: contract.conceptId,
      topicIndex,
      metadata: { source: req.body?.clientEventId ? "ipad" : "web" },
      occurredAt,
    };
    const inserted = await insertEventOnce(activityEvent);
    await recordIpadLearningEvents(
      [activityEvent],
      inserted ? new Set([activityEvent.clientEventId]) : new Set()
    );
    const progress = await refreshProgress(req.apiUser._id, contract);
    return res.json({ progress: serializeProgress(progress) });
  } catch (error) {
    return next(error);
  }
};

exports.patchSnapshot = async (req, res, next) => {
  try {
    const contract = conceptContract(req.params.courseId, req.params.unitId, req.params.conceptId);
    const completedTopicIndexes = [
      ...new Set(
        (Array.isArray(req.body?.completedTopicIndexes) ? req.body.completedTopicIndexes : [])
          .map((value) => integerInRange(value, 0, contract.topicCount - 1))
          .filter((value) => value !== null)
      ),
    ].sort((left, right) => left - right);
    const correctTypeIds = canonicalProgressTypeIds(req.body?.correctTypeIds)
      .map((value) => boundedText(value, 120))
      .filter(Boolean)
      .slice(0, 100);
    const lastStudiedAt = parseDate(req.body?.lastStudiedAt, { fallback: new Date() });
    const resetCutoff = await latestProgressResetCutoff(req.apiUser._id);
    if (resetCutoff && lastStudiedAt <= resetCutoff) {
      const current = await ConceptProgress.findOne(progressFilter(req.apiUser._id, contract));
      return res.json({
        progress: current ? serializeProgress(current) : null,
        ignored: true,
        reason: "BEFORE_PROGRESS_RESET",
      });
    }
    await ensureProgress(req.apiUser._id, contract);
    const setStage = {
      completedTopicIndexes: {
        $setUnion: [{ $ifNull: ["$completedTopicIndexes", []] }, completedTopicIndexes],
      },
      "masteryGate.correctTypeIds": canonicalTypeIdsExpression(correctTypeIds),
      lastStudiedAt: {
        $cond: [
          { $gt: [lastStudiedAt, { $ifNull: ["$lastStudiedAt", new Date(0)] }] },
          lastStudiedAt,
          "$lastStudiedAt",
        ],
      },
      topicCount: contract.topicCount,
    };
    if (req.body?.userCompleted === true) {
      setStage["masteryGate.userCompleted"] = true;
    }
    await ConceptProgress.updateOne(progressFilter(req.apiUser._id, contract), [
      { $set: setStage },
    ]);
    const progress = await refreshProgress(req.apiUser._id, contract);
    return res.json({ progress: serializeProgress(progress) });
  } catch (error) {
    return next(error);
  }
};

exports.postEvents = async (req, res, next) => {
  try {
    const sessionId = boundedText(req.body?.sessionId, 120, { fallback: "ipad" }) || "ipad";
    if (!Array.isArray(req.body?.events)) {
      throw httpError(400, "INVALID_EVENTS", "events 배열이 필요합니다.");
    }
    if (req.body.events.length > MAX_EVENTS) {
      throw httpError(
        413,
        "EVENT_BATCH_TOO_LARGE",
        `이벤트는 한 번에 ${MAX_EVENTS}개까지 보낼 수 있습니다.`
      );
    }
    const incoming = req.body.events;
    const seen = new Set();
    const documents = [];
    let duplicates = 0;
    for (const [index, raw] of incoming.entries()) {
      const document = normalizeEvent(raw, { userId: req.apiUser._id, sessionId });
      if (!document) {
        throw httpError(
          422,
          "INVALID_EVENT",
          `${index + 1}번째 이벤트 형식 또는 eventType을 처리할 수 없습니다.`
        );
      }
      if (seen.has(document.clientEventId)) {
        duplicates += 1;
        continue;
      }
      seen.add(document.clientEventId);
      documents.push(document);
    }
    let accepted = 0;
    const acceptedClientEventIds = new Set();
    for (const document of documents) {
      if (await insertEventOnce(document)) {
        accepted += 1;
        acceptedClientEventIds.add(document.clientEventId);
      } else {
        duplicates += 1;
      }
    }
    await recordIpadLearningEvents(documents, acceptedClientEventIds);
    return res.json({ accepted, duplicates, rejected: 0 });
  } catch (error) {
    return next(error);
  }
};

exports.postWrongNotesBulk = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.entries)) {
      throw httpError(400, "INVALID_WRONG_NOTES", "entries 배열이 필요합니다.");
    }
    if (req.body.entries.length > MAX_WRONG_NOTES) {
      throw httpError(
        413,
        "WRONG_NOTE_BATCH_TOO_LARGE",
        `오답은 한 번에 ${MAX_WRONG_NOTES}개까지 보낼 수 있습니다.`
      );
    }
    const entries = req.body.entries;
    // 한 항목이라도 영구 거부할 payload면 쓰기 전에 요청 전체를 4xx로 돌린다.
    // iPad 큐는 2xx를 받으면 op를 지우므로 부분 성공/조용한 생략은 데이터 유실이다.
    entries.forEach((entry) => incomingWrongNote(entry));
    const synced = [];
    for (const entry of entries) {
      const result = await upsertWrongNote(req.apiUser._id, entry);
      synced.push({
        clientAttemptId: result.clientAttemptId,
        attemptId: String(result.attempt._id),
        duplicate: result.duplicate,
      });
    }
    return res.json({ synced, rejected: 0 });
  } catch (error) {
    return next(error);
  }
};

exports.getWrongNotes = async (req, res, next) => {
  try {
    const query = {
      userId: req.apiUser._id,
      isCorrect: false,
      reviewSourceAttemptId: null,
    };
    if (req.query?.cursor) {
      query.$or = wrongNoteCursorClause(req.query.cursor);
    } else if (req.query?.since) {
      query.updatedAt = { $gt: parseDate(req.query.since, { required: true }) };
    }
    const attempts = await ProblemAttempt.find(query)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(WRONG_NOTE_PAGE_SIZE + 1)
      .populate({
        path: "problemId",
        select: "externalId stem solutionSteps source tags choices +correctAnswer",
      })
      .lean();
    const result = wrongNotePage(attempts);
    // `entries`는 현 Swift Codable 계약을 그대로 유지한다. 새 클라이언트는
    // hasMore/nextCursor로 같은 updatedAt 묶음도 _id 경계 뒤에서 계속 받는다.
    return res.json({
      entries: result.page.map(serializeWrongNote),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return next(error);
  }
};

exports.postReviewResult = async (req, res, next) => {
  try {
    const clientEventId = boundedText(req.body?.clientEventId, 160, { required: true });
    const eventKey = `wrong-note-review:${clientEventId}`;
    const attempt = await findWrongNoteAttempt(req.apiUser._id, req.params.attemptId);
    if (!attempt) {
      throw httpError(404, "WRONG_NOTE_NOT_FOUND", "해당 오답 기록이 없습니다.");
    }
    if (typeof req.body?.correct !== "boolean") {
      throw httpError(400, "INVALID_REVIEW_RESULT", "correct 값은 Boolean이어야 합니다.");
    }
    const requestedStage = integerInRange(req.body?.srsStage, 0, 4);
    const requestedWrongCount = integerInRange(req.body?.wrongCount, 0, 100000);
    if (requestedStage === null || requestedWrongCount === null) {
      throw httpError(400, "INVALID_REVIEW_RESULT", "복습 단계 값이 올바르지 않습니다.");
    }
    const requestedNextReviewAt = parseDate(req.body?.nextReviewAt);
    const reviewEvent = {
      userId: req.apiUser._id,
      clientEventId: eventKey,
      sessionId: "ipad-wrong-note-review",
      eventType: "review-completed",
      curriculumId: attempt.curriculumId,
      courseId: attempt.courseId,
      unitId: attempt.unitId,
      conceptId: attempt.conceptId,
      attemptId: attempt._id,
      correct: req.body.correct,
      metadata: {
        syncKind: "ipad-wrong-note-review",
        srsStage: requestedStage,
        wrongCount: requestedWrongCount,
        nextReviewAt: requestedNextReviewAt,
      },
      occurredAt: new Date(),
    };
    const inserted = await insertEventOnce(reviewEvent);
    await recordIpadLearningEvents(
      [reviewEvent],
      inserted ? new Set([reviewEvent.clientEventId]) : new Set()
    );
    // 이벤트를 먼저 유일키로 claim하고, 승리한 payload를 매 재시도마다 적용한다.
    // 저장 중간에 프로세스가 죽어도 같은 요청이 winner를 다시 적용해 복구한다.
    const claimedEvent = await LearningEvent.findOne({
      userId: req.apiUser._id,
      clientEventId: eventKey,
    }).lean();
    if (!claimedEvent) {
      throw httpError(500, "REVIEW_WRITE_FAILED", "복습 결과를 저장하지 못했습니다.");
    }
    if (String(claimedEvent.attemptId) !== String(attempt._id)) {
      throw httpError(
        409,
        "REVIEW_EVENT_CONFLICT",
        "같은 복습 이벤트 ID가 다른 오답 기록에 이미 사용되었습니다."
      );
    }
    // 요청 A를 재시도하더라도 A 자체를 다시 적용하지 않는다. 이 오답에서 이미
    // claim된 최신 이벤트를 승자로 고르면 A -> B -> A(retry)가 B를 되돌리지 못한다.
    const winner = await LearningEvent.findOne({
      userId: req.apiUser._id,
      attemptId: attempt._id,
      "metadata.syncKind": "ipad-wrong-note-review",
    })
      .sort({ occurredAt: -1, _id: -1 })
      .lean();
    if (!winner) {
      throw httpError(500, "REVIEW_WRITE_FAILED", "복습 결과를 저장하지 못했습니다.");
    }
    const winnerOccurredAt = parseDate(winner.occurredAt, { required: true });
    const currentReviewedAt = parseDate(attempt.review?.reviewedAt);
    // 다른 쓰기 경로가 더 최신 reviewedAt을 이미 남겼다면 iPad claim도 그것을
    // 거슬러 올라가지 않는다. 동일 시각의 iPad claim은 위 _id tie-break로 결정한다.
    if (!currentReviewedAt || winnerOccurredAt >= currentReviewedAt) {
      const srsStage = integerInRange(winner.metadata?.srsStage, 0, 4, 0);
      const wrongCount = integerInRange(winner.metadata?.wrongCount, 0, 100000, 0);
      const nextReviewAt = parseDate(winner.metadata?.nextReviewAt);
      const correct = winner.correct === true;
      const problem = attempt.problemId;
      const previousState = wrongNoteState(problem);
      await saveWrongNoteState(problem, { ...previousState, srsStage, wrongCount });
      attempt.review.status = correct
        ? nextReviewAt
          ? "scheduled"
          : "completed"
        : nextReviewAt
          ? "scheduled"
          : "pending";
      attempt.review.scheduledAt = nextReviewAt;
      attempt.review.reviewedAt = winnerOccurredAt;
      attempt.review.correctedAfterReview = correct;
      await attempt.save();
    }
    const duplicate = !inserted;
    const state = wrongNoteState(attempt.problemId);
    return res.json({
      review: {
        attemptId: String(attempt._id),
        clientAttemptId: state.clientAttemptId,
        srsStage: state.srsStage,
        wrongCount: state.wrongCount,
        nextReviewAt: attempt.review?.scheduledAt || null,
        status: attempt.review?.status || "pending",
        duplicate,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.resetLearningProgress = async (req, res, next) => {
  try {
    const clientResetId = boundedText(req.body?.clientResetId, 160, { required: true });
    const eventKey = `progress-reset:${clientResetId}`;
    const cutoff = parseDate(req.body?.occurredAt, { required: true });
    const event = {
      userId: req.apiUser._id,
      clientEventId: eventKey,
      sessionId: "ipad-progress-reset",
      eventType: "concept-closed",
      curriculumId: CURRICULUM_ID,
      metadata: {
        syncKind: "ipad-progress-reset",
        cutoff,
        deletedCount: 0,
        analyticsExcluded: true,
      },
      occurredAt: cutoff,
    };
    const inserted = await insertEventOnce(event);
    // 삭제 전에 tombstone을 claim한다. 중간 실패 뒤 같은 요청이 다시 오면
    // 최초 요청의 cutoff로 삭제를 재실행하므로 초기화가 반만 끝나지 않는다.
    let winner = await LearningEvent.findOne({
      userId: req.apiUser._id,
      clientEventId: eventKey,
    }).lean();
    if (!winner) {
      throw httpError(500, "RESET_WRITE_FAILED", "진도 초기화 표식을 저장하지 못했습니다.");
    }
    const winnerCutoff = parseDate(winner.metadata?.cutoff, {
      fallback: winner.occurredAt,
    });
    const result = await ConceptProgress.deleteMany({
      userId: req.apiUser._id,
      updatedAt: { $lte: winnerCutoff },
    });
    const deletedNow = Number(result.deletedCount) || 0;
    if (deletedNow > 0) {
      await LearningEvent.updateOne(
        { _id: winner._id },
        { $inc: { "metadata.deletedCount": deletedNow } }
      );
      winner = await LearningEvent.findById(winner._id).lean();
    }
    return res.json({
      reset: {
        clientResetId,
        cutoff: winner?.metadata?.cutoff || winnerCutoff,
        deletedCount: Number(winner?.metadata?.deletedCount) || 0,
        duplicate: !inserted,
      },
    });
  } catch (error) {
    return next(error);
  }
};

function serializeStuckPoint(event) {
  return {
    id: String(event.metadata?.id || ""),
    text: String(event.metadata?.text || ""),
    createdAt: event.metadata?.createdAt || event.occurredAt,
  };
}

exports.postStuckPoint = async (req, res, next) => {
  try {
    const id = boundedText(req.body?.id, 160, { required: true });
    const text = boundedText(req.body?.text, 2000, { required: true });
    const createdAt = parseDate(req.body?.createdAt, { required: true });
    const clientEventId = `stuck-point:${id}`;
    const document = {
      userId: req.apiUser._id,
      clientEventId,
      sessionId: "ipad-stuck-points",
      eventType: "hint-used",
      curriculumId: CURRICULUM_ID,
      metadata: {
        syncKind: "ipad-stuck-point",
        id,
        text,
        createdAt,
        analyticsExcluded: true,
      },
      occurredAt: createdAt,
    };
    await insertEventOnce(document);
    const stored = await LearningEvent.findOne({
      userId: req.apiUser._id,
      clientEventId,
    }).lean();
    return res.json({ stuckPoint: serializeStuckPoint(stored || document) });
  } catch (error) {
    return next(error);
  }
};

exports.getStuckPoints = async (req, res, next) => {
  try {
    const rows = await LearningEvent.find({
      userId: req.apiUser._id,
      "metadata.syncKind": "ipad-stuck-point",
    })
      .sort({ occurredAt: -1, _id: -1 })
      .limit(500)
      .lean();
    return res.json({ stuckPoints: rows.map(serializeStuckPoint) });
  } catch (error) {
    return next(error);
  }
};

exports._private = {
  boundedInteger,
  canonicalTypeIdsExpression,
  decodeWrongNoteCursor,
  encodeWrongNoteCursor,
  groupIpadLearningEvents,
  integerInRange,
  normalizeEvent,
  isStreakLearningEvent,
  serializeProgress,
  serializeStuckPoint,
  serializeWrongNote,
  tagValue,
  wrongNoteCursorClause,
  wrongNotePage,
  wrongNoteExternalId,
  wrongNoteState,
};

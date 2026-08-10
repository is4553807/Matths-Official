const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { StudyHallContent, StudyHallProgress } = require("../models/studyHallModel");
const {
  createR2ObjectKey,
  deleteR2Object,
  signedR2Url,
  uploadLocalFileToR2,
} = require("./r2ObjectStorageService");
const {
  isCorrectAnswer,
  normalizeAnswer,
  standardQuestionMode,
  validateAnswerKeyJson,
} = require("./privateMockExamService");

const STUDY_HALL_TABS = Object.freeze([
  { code: "NJE", label: "자체제작 N제", summary: "시리즈별 문제집을 플랫폼에서 바로 풉니다." },
  { code: "DAILY_HALF", label: "데일리 하프", summary: "공개된 15문항 회차를 원하는 시간에 응시합니다." },
  { code: "PRACTICE_MOCK", label: "실전 모의고사", summary: "시기와 시리즈에 맞춘 실전 훈련입니다." },
  { code: "FINAL", label: "수능 파이널", summary: "수능 직전 목적별 압축 콘텐츠입니다." },
  { code: "CONCEPT", label: "개념 학습", summary: "고3 수능 개념을 짧고 정확하게 정리합니다." },
  { code: "ERROR_REPORT", label: "오답 유형 리포트", summary: "운영자가 정리한 대표 오답 원인과 교정법입니다." },
]);

function httpError(status, message, code = "STUDY_HALL_REQUEST_FAILED") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function integer(value, { min = 0, max = 100000, fallback = 0 } = {}) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizedTab(value) {
  const code = String(value || "NJE").trim().toUpperCase();
  return STUDY_HALL_TABS.some((tab) => tab.code === code) ? code : "NJE";
}

function normalizedAnswerType(value, questionNumber, questionCount = 30) {
  const raw = String(value || "").trim().toLowerCase();
  if (["multiple-choice", "multiple_choice", "multiple", "choice", "객관식"].includes(raw)) {
    return "multiple-choice";
  }
  if (["short-answer", "short_answer", "short", "subjective", "주관식", "단답형"].includes(raw)) {
    return "short-answer";
  }
  if (questionCount === 30) return standardQuestionMode(questionNumber);
  return "multiple-choice";
}

function explanationText(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value, 20000);
  const lines = [];
  const append = (label, text) => {
    const cleaned = cleanText(text, 6000);
    if (cleaned) lines.push(label ? `${label}: ${cleaned}` : cleaned);
  };
  append("출제 의도", value.intent);
  append("핵심 개념", value.concept);
  if (Array.isArray(value.steps)) {
    value.steps.forEach((step, index) => append(`풀이 ${index + 1}`, step?.text ?? step));
  }
  append("정리", value.summary);
  append("주의", value.commonMistake);
  append("", value.text);
  return cleanText(lines.join("\n"), 20000);
}

function answerKeyRows(parsed) {
  if (Array.isArray(parsed?.questions)) return parsed.questions;
  if (Array.isArray(parsed?.answers)) {
    const explanations = new Map(
      (Array.isArray(parsed.explanations) ? parsed.explanations : [])
        .map((value) => [Number(value?.number), value])
    );
    return parsed.answers.map((answer, index) => ({
      number: index + 1,
      answer,
      points: parsed.points?.[index],
      type: parsed.questionModes?.[index],
      explanation: explanations.get(index + 1) || null,
    }));
  }
  return null;
}

function validateStudyHallAnswerKeyJson(value, { expectedCount = 0 } = {}) {
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (_error) {
      throw httpError(400, "답지 JSON 문법이 올바르지 않습니다.", "INVALID_STUDY_HALL_ANSWER_KEY");
    }
  }
  const rawRows = answerKeyRows(parsed);
  if (!Array.isArray(rawRows) || !rawRows.length) {
    throw httpError(400, "주간 공식 모의고사 답지와 같은 questions 또는 answers 형식이 필요합니다.", "INVALID_STUDY_HALL_ANSWER_KEY");
  }
  const questionCount = rawRows.length;
  if (expectedCount > 0 && questionCount !== expectedCount) {
    throw httpError(400, `답지 JSON은 ${expectedCount}문항이어야 합니다. 현재 ${questionCount}문항입니다.`, "STUDY_HALL_ANSWER_KEY_COUNT_MISMATCH");
  }

  // 30문항 모의고사는 주간 공식 모의고사와 동일한 100점·문항 유형 검증을 그대로 적용한다.
  let normalizedRows = rawRows;
  if (questionCount === 30) {
    normalizedRows = validateAnswerKeyJson(parsed).questions.map((validated, index) => ({
      ...rawRows[index],
      ...validated,
      stem: rawRows[index]?.stem,
      choices: rawRows[index]?.choices,
      explanation: rawRows[index]?.explanation ?? validated.explanation,
    }));
  }

  const seen = new Set();
  const questions = normalizedRows.map((row, index) => {
    const number = integer(row?.number, { min: 1, max: 500, fallback: index + 1 });
    if (number !== index + 1 || seen.has(number)) {
      throw httpError(400, "답지 JSON의 문항 번호는 1번부터 빠짐없이 한 번씩 있어야 합니다.", "INVALID_STUDY_HALL_ANSWER_KEY_ORDER");
    }
    seen.add(number);
    const correctAnswer = cleanText(row?.answer ?? row?.correctAnswer, 100);
    if (!normalizeAnswer(correctAnswer)) {
      throw httpError(400, `${number}번 정답이 비어 있습니다.`, "INVALID_STUDY_HALL_ANSWER_KEY_ANSWER");
    }
    const points = Number(row?.points ?? 1);
    if (!Number.isFinite(points) || points < 0 || points > 100) {
      throw httpError(400, `${number}번 배점을 확인해주세요.`, "INVALID_STUDY_HALL_ANSWER_KEY_POINTS");
    }
    const answerType = normalizedAnswerType(row?.type ?? row?.answerType, number, questionCount);
    const choices = Array.isArray(row?.choices)
      ? row.choices.slice(0, 5).map((choice) => cleanText(choice, 1000))
      : [];
    return {
      number,
      stem: cleanText(row?.stem, 10000),
      choices,
      answerType,
      points,
      correctAnswer,
      explanation: explanationText(row?.explanation),
    };
  });
  return {
    schemaVersion: String(parsed?.schemaVersion || "matths-answer-key-v1"),
    questionCount,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    questions,
  };
}

async function questionsFromAnswerKeyFile(file, { expectedCount = 0 } = {}) {
  const buffer = await fs.promises.readFile(file.path);
  return validateStudyHallAnswerKeyJson(buffer, { expectedCount }).questions;
}

function parseQuestions(value) {
  let rows;
  try {
    rows = JSON.parse(String(value || "[]"));
  } catch (_error) {
    throw httpError(400, "문항 데이터 형식을 확인해주세요.", "INVALID_STUDY_HALL_QUESTIONS");
  }
  if (!Array.isArray(rows)) return [];
  const used = new Set();
  return rows.slice(0, 500).flatMap((row, index) => {
    const number = integer(row?.number, { min: 1, max: 500, fallback: index + 1 });
    const correctAnswer = cleanText(row?.correctAnswer, 100);
    if (used.has(number) || !correctAnswer) return [];
    used.add(number);
    return [{
      number,
      stem: cleanText(row?.stem, 10000),
      choices: Array.isArray(row?.choices)
        ? row.choices.slice(0, 5).map((choice) => cleanText(choice, 1000))
        : [],
      answerType: normalizedAnswerType(row?.answerType ?? row?.type, number, rows.length),
      points: Number.isFinite(Number(row?.points)) ? Math.max(0, Math.min(100, Number(row.points))) : 1,
      correctAnswer,
      explanation: cleanText(row?.explanation, 20000),
    }];
  }).sort((a, b) => a.number - b.number);
}

function dateField(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function uploadAsset(file, kind, ownerId) {
  const objectKey = createR2ObjectKey({
    namespace: "study-hall",
    ownerId,
    kind,
    originalName: file.originalname,
  });
  const stored = await uploadLocalFileToR2({
    filePath: file.path,
    objectKey,
    contentType: String(file.mimetype || "application/octet-stream"),
    metadata: { contentarea: "study-hall", assetkind: kind.toLowerCase() },
  });
  return {
    kind,
    originalName: path.basename(String(file.originalname || "file")),
    mimeType: String(file.mimetype || "application/octet-stream"),
    sizeBytes: Number(stored.sizeBytes || file.size || 0),
    storageProvider: "R2",
    r2ObjectKey: stored.r2ObjectKey,
    r2Sha256: stored.r2Sha256,
    r2ETag: stored.r2ETag,
  };
}

async function discardStudyHallUploads(files = {}) {
  const entries = Object.values(files || {}).flat();
  await Promise.all(entries.map((file) => fs.promises.unlink(file.path).catch(() => {})));
}

function serializeAsset(asset) {
  return {
    id: String(asset._id),
    kind: asset.kind,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.sizeBytes || 0),
    downloadCount: Number(asset.downloadCount || 0),
  };
}

function progressPercent(progress, itemCount) {
  const count = Math.max(0, Number(itemCount || 0));
  if (progress?.status === "SUBMITTED") return 100;
  if (!count) return progress?.status === "IN_PROGRESS" ? 1 : 0;
  return Math.min(100, Math.round((Number(progress?.answeredCount || 0) / count) * 100));
}

function serializeContent(content, progress = null, { admin = false } = {}) {
  const itemCount = Number(content.itemCount || content.questions?.length || 0);
  const assets = (content.assets || []).map(serializeAsset);
  const answerMap = new Map(
    Array.from(progress?.answers || []).map((answer) => [Number(answer.number), String(answer.answer || "")])
  );
  return {
    id: String(content._id),
    contentType: content.contentType,
    tabLabel: STUDY_HALL_TABS.find((tab) => tab.code === content.contentType)?.label || content.contentType,
    series: content.series || "",
    title: content.title,
    description: content.description || "",
    grade: content.grade || "공통",
    subject: content.subject || "",
    itemCount,
    difficulty: content.difficulty || "",
    timeLimitMinutes: Number(content.timeLimitMinutes || 0),
    recommendedStudyDays: Number(content.recommendedStudyDays || 0),
    estimatedMinutes: Number(content.estimatedMinutes || 0),
    year: Number(content.year || 0),
    month: Number(content.month || 0),
    week: Number(content.week || 0),
    session: Number(content.session || 0),
    phase: content.phase || "",
    finalCategory: content.finalCategory || "",
    errorCategory: content.errorCategory || "",
    commonMistake: content.commonMistake || "",
    wrongApproach: content.wrongApproach || "",
    correctApproach: content.correctApproach || "",
    relatedProblem: content.relatedProblem || "",
    questions: (content.questions || []).map((question) => ({
      id: String(question._id),
      number: Number(question.number),
      stem: question.stem || "",
      choices: Array.from(question.choices || []),
      answerType: question.answerType || normalizedAnswerType("", Number(question.number), itemCount),
      points: Number(question.points ?? 1),
      ...(admin || progress?.status === "SUBMITTED"
        ? {
          correctAnswer: question.correctAnswer,
          explanation: question.explanation || "",
          isCorrect: progress?.status === "SUBMITTED"
            ? isCorrectAnswer(answerMap.get(Number(question.number)), question.correctAnswer)
            : null,
        }
        : {}),
    })),
    assets,
    thumbnail: assets.find((asset) => asset.kind === "THUMBNAIL") || null,
    questionPdf: assets.find((asset) => asset.kind === "QUESTION_PDF") || null,
    solutionPdf: assets.find((asset) => asset.kind === "SOLUTION_PDF") || null,
    contentFiles: assets.filter((asset) => asset.kind === "CONTENT_FILE"),
    status: content.status,
    sortOrder: Number(content.sortOrder || 0),
    publishAt: content.publishAt || null,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    progress: {
      status: progress?.status || "NOT_STARTED",
      lastQuestionNumber: Number(progress?.lastQuestionNumber || 0),
      answeredCount: Number(progress?.answeredCount || 0),
      correctCount: Number(progress?.correctCount || 0),
      scorePoints: Number(progress?.scorePoints || 0),
      totalPoints: Number(progress?.totalPoints || 0),
      scorePercent: Number(progress?.scorePercent || 0),
      percent: progressPercent(progress, itemCount),
      answers: Array.from(progress?.answers || []).map((answer) => ({ number: answer.number, answer: answer.answer })),
      submittedAt: progress?.submittedAt || null,
    },
  };
}

async function listStudyHall({ userId, tab = "NJE" } = {}) {
  const activeTab = normalizedTab(tab);
  const now = new Date();
  const contents = await StudyHallContent.find({
    contentType: activeTab,
    status: "PUBLISHED",
    $or: [{ publishAt: null }, { publishAt: { $lte: now } }],
  }).sort({ sortOrder: 1, year: -1, month: -1, week: -1, session: -1, createdAt: -1 }).lean();
  const contentIds = contents.map((content) => content._id);
  const progressRows = mongoose.isValidObjectId(userId) && contentIds.length
    ? await StudyHallProgress.find({ userId, contentId: { $in: contentIds } }).lean()
    : [];
  const progressMap = new Map(progressRows.map((row) => [String(row.contentId), row]));
  const items = contents.map((content) => serializeContent(content, progressMap.get(String(content._id))));
  let continuing = null;
  if (mongoose.isValidObjectId(userId)) {
    const recentProgress = await StudyHallProgress.findOne({ userId, status: "IN_PROGRESS" })
      .sort({ updatedAt: -1 })
      .lean();
    if (recentProgress) {
      const recentContent = await StudyHallContent.findOne({
        _id: recentProgress.contentId,
        status: "PUBLISHED",
        $or: [{ publishAt: null }, { publishAt: { $lte: now } }],
      }).lean();
      if (recentContent) continuing = serializeContent(recentContent, recentProgress);
    }
  }
  return { tabs: STUDY_HALL_TABS, activeTab, items, continuing };
}

async function getStudyHallContent({ contentId, userId, admin = false }) {
  if (!mongoose.isValidObjectId(contentId)) throw httpError(404, "콘텐츠를 찾을 수 없습니다.");
  const content = await StudyHallContent.findOne({
    _id: contentId,
    ...(admin ? {} : { status: "PUBLISHED", $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] }),
  }).lean();
  if (!content) throw httpError(404, "공개된 수험관 콘텐츠를 찾을 수 없습니다.");
  const progress = mongoose.isValidObjectId(userId)
    ? await StudyHallProgress.findOne({ userId, contentId }).lean()
    : null;
  return serializeContent(content, progress, { admin });
}

function answersFromInput(input, maxCount = 500) {
  let rows = [];
  try { rows = JSON.parse(String(input.answersJson || "[]")); } catch (_error) { rows = []; }
  if (!Array.isArray(rows)) return [];
  const map = new Map();
  for (const row of rows.slice(0, maxCount)) {
    const number = integer(row?.number, { min: 1, max: 500, fallback: 0 });
    if (!number) continue;
    map.set(number, cleanText(row?.answer, 100));
  }
  return Array.from(map, ([number, answer]) => ({ number, answer })).sort((a, b) => a.number - b.number);
}

async function saveStudyHallAnswers({ contentId, userId, input, submit = false }) {
  if (!mongoose.isValidObjectId(userId)) throw httpError(401, "로그인이 필요합니다.");
  const now = new Date();
  const content = await StudyHallContent.findOne({
    _id: contentId,
    status: "PUBLISHED",
    $or: [{ publishAt: null }, { publishAt: { $lte: now } }],
  }).lean();
  if (!content) throw httpError(404, "응시할 콘텐츠를 찾을 수 없습니다.");
  const existing = await StudyHallProgress.findOne({ userId, contentId });
  if (existing?.status === "SUBMITTED") {
    throw httpError(409, "이미 최종 제출한 콘텐츠입니다.", "STUDY_HALL_ALREADY_SUBMITTED");
  }
  const answers = answersFromInput(input);
  const answerMap = new Map(answers.map((answer) => [answer.number, answer.answer]));
  const questions = Array.from(content.questions || []);
  const itemCount = Math.max(Number(content.itemCount || 0), questions.length);
  const answeredCount = answers.filter((answer) => answer.answer).length;
  const lastQuestionNumber = Math.max(0, ...answers.filter((answer) => answer.answer).map((answer) => answer.number));
  let correctCount = 0;
  let scorePoints = 0;
  const totalPoints = questions.reduce((sum, question) => sum + Number(question.points ?? 1), 0);
  if (submit) {
    for (const question of questions) {
      if (!isCorrectAnswer(answerMap.get(Number(question.number)), question.correctAnswer)) continue;
      correctCount += 1;
      scorePoints += Number(question.points ?? 1);
    }
  }
  const progress = await StudyHallProgress.findOneAndUpdate(
    { userId, contentId, status: { $ne: "SUBMITTED" } },
    {
      $set: {
        status: submit ? "SUBMITTED" : "IN_PROGRESS",
        answers,
        answeredCount,
        lastQuestionNumber,
        correctCount: submit ? correctCount : 0,
        scorePoints: submit ? scorePoints : 0,
        totalPoints,
        scorePercent: submit && totalPoints > 0
          ? Math.round((scorePoints / totalPoints) * 100)
          : submit && questions.length
            ? Math.round((correctCount / questions.length) * 100)
            : 0,
        submittedAt: submit ? new Date() : null,
        startedAt: existing?.startedAt || now,
      },
    },
    { upsert: !existing, returnDocument: "after" }
  ).lean().catch((error) => {
    if (Number(error?.code) === 11000) {
      throw httpError(409, "이미 최종 제출한 콘텐츠입니다.", "STUDY_HALL_ALREADY_SUBMITTED");
    }
    throw error;
  });
  if (!progress) throw httpError(409, "이미 최종 제출한 콘텐츠입니다.", "STUDY_HALL_ALREADY_SUBMITTED");
  return serializeContent(content, progress);
}

async function listAdminStudyHall({ editId = "", tab = "" } = {}) {
  const filter = tab ? { contentType: normalizedTab(tab) } : {};
  const contents = await StudyHallContent.find(filter).sort({ contentType: 1, sortOrder: 1, updatedAt: -1 }).lean();
  const editing = mongoose.isValidObjectId(editId)
    ? await StudyHallContent.findById(editId).lean()
    : null;
  return {
    tabs: STUDY_HALL_TABS,
    activeTab: tab ? normalizedTab(tab) : "",
    items: contents.map((content) => serializeContent(content, null, { admin: true })),
    editing: editing ? serializeContent(editing, null, { admin: true }) : null,
  };
}

async function saveStudyHallContent({ contentId = "", input, files = {}, adminUserId }) {
  if (!mongoose.isValidObjectId(adminUserId)) throw httpError(403, "운영자 정보를 확인할 수 없습니다.");
  const existing = mongoose.isValidObjectId(contentId) ? await StudyHallContent.findById(contentId) : null;
  if (contentId && !existing) throw httpError(404, "수정할 콘텐츠를 찾을 수 없습니다.");
  const title = cleanText(input.title, 180);
  if (!title) throw httpError(400, "콘텐츠 제목을 입력해주세요.");
  const contentType = normalizedTab(input.contentType);
  const answerKeyFile = files.answerKeyJson?.[0] || null;
  const requestedItemCount = integer(input.itemCount, { min: 0, max: 500, fallback: 0 });
  const questions = answerKeyFile
    ? await questionsFromAnswerKeyFile(answerKeyFile, { expectedCount: requestedItemCount })
    : parseQuestions(input.questionsJson);
  const itemCount = requestedItemCount > 0 ? requestedItemCount : questions.length;
  const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(input.status) ? input.status : "DRAFT";
  if (status === "PUBLISHED" && contentType !== "ERROR_REPORT") {
    if (!questions.length) {
      throw httpError(400, "공개 콘텐츠에는 정답이 등록된 문항이 1개 이상 필요합니다.");
    }
    if (itemCount !== questions.length) {
      throw httpError(400, "공개 콘텐츠의 문항 수와 등록한 답안 데이터 수가 일치해야 합니다.");
    }
    if (contentType === "DAILY_HALF" && questions.length !== 15) {
      throw httpError(400, "데일리 하프는 1번부터 15번까지 총 15문항을 등록해야 공개할 수 있습니다.");
    }
  }
  const removeAssetIds = new Set((Array.isArray(input.removeAssetIds) ? input.removeAssetIds : input.removeAssetIds ? [input.removeAssetIds] : []).map(String));
  const previousAssets = Array.from(existing?.assets || []);
  const removedAssets = previousAssets.filter((asset) => removeAssetIds.has(String(asset._id)));
  const retainedAssets = previousAssets.filter((asset) => !removeAssetIds.has(String(asset._id)));
  const fieldMap = [
    ["studyThumbnail", "THUMBNAIL", true],
    ["questionPdf", "QUESTION_PDF", true],
    ["solutionPdf", "SOLUTION_PDF", true],
    ["contentFiles", "CONTENT_FILE", false],
  ];
  const uploadedAssets = [];
  let saved;
  try {
    for (const [field, kind, replaceKind] of fieldMap) {
      for (const file of files[field] || []) {
        uploadedAssets.push(await uploadAsset(file, kind, contentId || adminUserId));
      }
      if (replaceKind && uploadedAssets.some((asset) => asset.kind === kind)) {
        for (const asset of retainedAssets.filter((asset) => asset.kind === kind)) removedAssets.push(asset);
      }
    }
    const replaceKinds = new Set(uploadedAssets.filter((asset) => asset.kind !== "CONTENT_FILE").map((asset) => asset.kind));
    const finalAssets = retainedAssets.filter((asset) => !replaceKinds.has(asset.kind)).concat(uploadedAssets);
    const payload = {
      contentType,
      series: cleanText(input.series, 120),
      title,
      description: cleanText(input.description, 4000),
      grade: ["고2", "고3", "공통"].includes(input.grade) ? input.grade : "공통",
      subject: cleanText(input.subject, 80),
      itemCount,
      difficulty: cleanText(input.difficulty, 80),
      timeLimitMinutes: integer(input.timeLimitMinutes, { max: 600 }),
      recommendedStudyDays: integer(input.recommendedStudyDays, { max: 365 }),
      estimatedMinutes: integer(input.estimatedMinutes, { max: 10000 }),
      year: integer(input.year, { max: 2200 }),
      month: integer(input.month, { max: 12 }),
      week: integer(input.week, { max: 6 }),
      session: integer(input.session, { max: 100 }),
      phase: cleanText(input.phase, 100),
      finalCategory: cleanText(input.finalCategory, 100),
      errorCategory: cleanText(input.errorCategory, 100),
      commonMistake: cleanText(input.commonMistake, 4000),
      wrongApproach: cleanText(input.wrongApproach, 8000),
      correctApproach: cleanText(input.correctApproach, 8000),
      relatedProblem: cleanText(input.relatedProblem, 10000),
      questions,
      assets: finalAssets,
      status,
      sortOrder: integer(input.sortOrder, { max: 100000 }),
      publishAt: dateField(input.publishAt),
      updatedBy: adminUserId,
    };
    saved = existing
      ? await StudyHallContent.findByIdAndUpdate(existing._id, { $set: payload }, { returnDocument: "after", runValidators: true })
      : await StudyHallContent.create({ ...payload, createdBy: adminUserId });
  } catch (error) {
    await Promise.all(uploadedAssets.map((asset) => deleteR2Object(asset.r2ObjectKey).catch(() => {})));
    throw error;
  }
  await Promise.all(removedAssets.map((asset) => deleteR2Object(asset.r2ObjectKey).catch(() => {})));
  await discardStudyHallUploads(files);
  return serializeContent(saved.toObject(), null, { admin: true });
}

async function archiveStudyHallContent(contentId, adminUserId) {
  if (!mongoose.isValidObjectId(contentId)) throw httpError(404, "콘텐츠를 찾을 수 없습니다.");
  const content = await StudyHallContent.findByIdAndUpdate(
    contentId,
    { $set: { status: "ARCHIVED", updatedBy: adminUserId } },
    { returnDocument: "after" }
  );
  if (!content) throw httpError(404, "콘텐츠를 찾을 수 없습니다.");
  return serializeContent(content.toObject(), null, { admin: true });
}

async function getStudyHallAsset({ contentId, assetId, userId, admin = false }) {
  const content = await StudyHallContent.findOne({
    _id: contentId,
    ...(admin ? {} : {
      status: "PUBLISHED",
      $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }],
    }),
  });
  const asset = content?.assets?.id(assetId);
  if (!content || !asset) throw httpError(404, "파일을 찾을 수 없습니다.");
  if (!admin && asset.kind === "SOLUTION_PDF") {
    const progress = await StudyHallProgress.findOne({ userId, contentId }).lean();
    if (progress?.status !== "SUBMITTED") throw httpError(403, "최종 제출 후 해설을 확인할 수 있습니다.");
  }
  const isDownloadableAsset = asset.kind !== "THUMBNAIL";
  if (isDownloadableAsset && mongoose.isValidObjectId(userId)) {
    await StudyHallProgress.updateOne(
      { userId, contentId },
      {
        $setOnInsert: { status: "NOT_STARTED" },
        $push: { downloads: { assetId: asset._id, downloadedAt: new Date() } },
      },
      { upsert: true }
    );
  }
  if (isDownloadableAsset) {
    await StudyHallContent.updateOne({ _id: contentId, "assets._id": assetId }, { $inc: { "assets.$.downloadCount": 1 } });
  }
  return {
    asset: { ...asset.toObject(), id: String(asset._id) },
    signedUrl: await signedR2Url(asset, { download: asset.kind !== "THUMBNAIL", originalName: asset.originalName }),
  };
}

module.exports = {
  STUDY_HALL_TABS,
  archiveStudyHallContent,
  discardStudyHallUploads,
  getStudyHallAsset,
  getStudyHallContent,
  listAdminStudyHall,
  listStudyHall,
  saveStudyHallAnswers,
  saveStudyHallContent,
  validateStudyHallAnswerKeyJson,
};

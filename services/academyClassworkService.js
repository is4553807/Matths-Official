const path = require("node:path");
const mongoose = require("mongoose");
const {
  AcademyAssignmentSubmission,
  AcademyClass,
  AcademyClassWeek,
  AcademyStudentMembership,
} = require("../models/academyModel");
const { conceptKey, isCourseAvailable, loadCurriculum } = require("./curriculumService");
const {
  destroyStoredAsset,
  signedStoredAssetUrl,
  STORAGE_PURPOSES,
  storageFields,
  storeUploadedFile,
} = require("./fileStorageService");
const { getTeacherAcademyContext } = require("./academyService");
const {
  isPdfDownload,
  issuePersonalizedPdf,
} = require("./pdfWatermarkService");
const { withSchedulerLease } = require("./schedulerLeaseService");

const MAX_WEEK_CONCEPTS = 30;
const MAX_WEEK_FILES = 10;
const MAX_OMR_QUESTIONS = 100;
const ASSIGNMENT_DEADLINE_INTERVAL_MS = 60 * 1000;
const OMR_NOT_PROVIDED = Symbol("OMR_NOT_PROVIDED");
let assignmentDeadlineTimer = null;
let assignmentDeadlineRunning = false;

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value, maximum, label, { required = false, multiline = false } = {}) {
  const source = String(value || "");
  const cleaned = multiline
    ? source.replace(/\r\n?/g, "\n").trim()
    : source.replace(/\s+/g, " ").trim();
  if (required && !cleaned) throw statusError(400, `${label}을 입력해 주세요.`);
  if (cleaned.length > maximum) throw statusError(400, `${label}은 ${maximum}자 이하로 입력해 주세요.`);
  return cleaned;
}

function currentKstYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));
}

function normalizeAcademicYear(value) {
  const year = Number.parseInt(value, 10);
  if (!Number.isInteger(year) || year < 2022 || year > 2100) {
    throw statusError(400, "학년도를 다시 확인해 주세요.");
  }
  return year;
}

function normalizeWeekNumber(value) {
  const week = Number.parseInt(value, 10);
  if (!Number.isInteger(week) || week < 1 || week > 60) {
    throw statusError(400, "주차는 1주차부터 60주차 사이로 입력해 주세요.");
  }
  return week;
}

function parseKstDueAt(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw statusError(400, "과제 마감일을 다시 확인해 주세요.");
  }
  const dueAt = new Date(`${normalized}:00+09:00`);
  if (Number.isNaN(dueAt.getTime())) throw statusError(400, "과제 마감일을 다시 확인해 주세요.");
  return dueAt;
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR")
    .slice(0, 80);
}

function answerTypeForNumber(omr, questionNumber) {
  return (omr?.sections || []).find(
    (section) => questionNumber >= Number(section.startNumber) && questionNumber <= Number(section.endNumber)
  ) || null;
}

function normalizeAssignmentOmr(value, teacherUserId) {
  if (value === undefined || value === null || String(value).trim() === "") return OMR_NOT_PROVIDED;
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch (_error) {
    throw statusError(400, "답안지 설정을 읽을 수 없습니다. 문항 구간을 다시 확인해 주세요.");
  }
  if (!parsed || parsed.enabled === false) return null;
  let sourceSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  if (!sourceSections.length) {
    const questionCount = Number.parseInt(parsed.questionCount, 10);
    const rawDefaultType = String(parsed.defaultAnswerType || parsed.answerType || "")
      .trim()
      .toUpperCase();
    const defaultAnswerType = ["SHORT_ANSWER", "SHORT-ANSWER", "SUBJECTIVE", "주관식", "단답형"]
      .includes(rawDefaultType)
      ? "SHORT_ANSWER"
      : ["MULTIPLE_CHOICE", "MULTIPLE-CHOICE", "OBJECTIVE", "객관식"].includes(rawDefaultType)
        ? "MULTIPLE_CHOICE"
        : "";
    if (
      Number.isInteger(questionCount)
      && questionCount >= 1
      && questionCount <= MAX_OMR_QUESTIONS
      && defaultAnswerType
    ) {
      sourceSections = [{
        startNumber: 1,
        endNumber: questionCount,
        answerType: defaultAnswerType,
        choiceCount: Number.parseInt(parsed.choiceCount, 10) || 5,
      }];
    }
  }
  if (!sourceSections.length || sourceSections.length > MAX_OMR_QUESTIONS) {
    throw statusError(400, "총 문항 수와 기본 입력 방식을 다시 확인해 주세요.");
  }
  const sections = sourceSections
    .map((section) => {
      const startNumber = Number.parseInt(section.startNumber ?? section.start, 10);
      const endNumber = Number.parseInt(section.endNumber ?? section.end, 10);
      const rawType = String(section.answerType || section.type || "").trim().toUpperCase();
      const answerType = ["MULTIPLE_CHOICE", "MULTIPLE-CHOICE", "OBJECTIVE", "객관식"].includes(rawType)
        ? "MULTIPLE_CHOICE"
        : ["SHORT_ANSWER", "SHORT-ANSWER", "SUBJECTIVE", "주관식", "단답형"].includes(rawType)
          ? "SHORT_ANSWER"
          : "";
      const choiceCount = answerType === "MULTIPLE_CHOICE"
        ? Number.parseInt(section.choiceCount, 10) || 5
        : 0;
      if (
        !Number.isInteger(startNumber) ||
        !Number.isInteger(endNumber) ||
        startNumber < 1 ||
        endNumber < startNumber ||
        endNumber > MAX_OMR_QUESTIONS ||
        !answerType
      ) {
        throw statusError(400, "OMR 문항 구간과 유형을 다시 확인해 주세요.");
      }
      if (answerType === "MULTIPLE_CHOICE" && (choiceCount < 2 || choiceCount > 9)) {
        throw statusError(400, "객관식 선택지 수는 2개부터 9개까지 설정할 수 있습니다.");
      }
      return { startNumber, endNumber, answerType, choiceCount: answerType === "MULTIPLE_CHOICE" ? choiceCount : 5 };
    })
    .sort((left, right) => left.startNumber - right.startNumber);

  let expectedStart = 1;
  sections.forEach((section) => {
    if (section.startNumber !== expectedStart) {
      throw statusError(400, `OMR 문항은 ${expectedStart}번부터 빠짐없이 이어지도록 설정해 주세요.`);
    }
    expectedStart = section.endNumber + 1;
  });
  const questionCount = sections.at(-1).endNumber;
  const sourceAnswers = Array.isArray(parsed.answers)
    ? parsed.answers
    : Array.isArray(parsed.answerKey)
      ? parsed.answerKey
      : [];
  if (sourceAnswers.length !== questionCount) {
    throw statusError(400, `교사 정답을 1번부터 ${questionCount}번까지 모두 입력해 주세요.`);
  }
  const answerKey = sourceAnswers.map((value, index) => {
    const answer = normalizeAnswer(value);
    const questionNumber = index + 1;
    const section = answerTypeForNumber({ sections }, questionNumber);
    if (!answer) throw statusError(400, `${questionNumber}번 정답을 입력해 주세요.`);
    if (
      section.answerType === "MULTIPLE_CHOICE"
      && (!/^\d$/.test(answer) || Number(answer) < 1 || Number(answer) > section.choiceCount)
    ) {
      throw statusError(400, `${questionNumber}번 객관식 정답은 1~${section.choiceCount} 중 하나여야 합니다.`);
    }
    return answer;
  });
  return {
    enabled: true,
    questionCount,
    sections,
    answerKey,
    configuredAt: new Date(),
    configuredByUserId: teacherUserId,
    missedSubmissionsFinalizedAt: null,
  };
}

function omrQuestionRows(omr, answers = []) {
  if (!omr?.enabled || !Number.isInteger(Number(omr.questionCount))) return [];
  return Array.from({ length: Number(omr.questionCount) }, (_unused, index) => {
    const number = index + 1;
    const section = answerTypeForNumber(omr, number);
    const answerType = section?.answerType || "SHORT_ANSWER";
    return {
      number,
      answerType,
      choiceCount: Number(section?.choiceCount || 5),
      answer: String(answers[index] || ""),
    };
  });
}

function gradeAssignmentAnswers({ omr, answers }) {
  const normalizedAnswers = Array.from({ length: Number(omr.questionCount) }, (_unused, index) =>
    normalizeAnswer(answers?.[index])
  );
  const correctByQuestion = normalizedAnswers.map((answer, index) =>
    Boolean(answer) && String(omr.answerKey?.[index] || "")
      .split("|")
      .map(normalizeAnswer)
      .includes(answer)
  );
  const correctCount = correctByQuestion.filter(Boolean).length;
  return {
    answers: normalizedAnswers,
    answeredCount: normalizedAnswers.filter(Boolean).length,
    correctByQuestion,
    correctCount,
    questionCount: Number(omr.questionCount),
    scorePercent: Math.round((correctCount / Number(omr.questionCount)) * 100),
    gradedAt: new Date(),
    answerKeyConfiguredAt: omr.configuredAt || null,
  };
}

function curriculumConceptCatalog() {
  const curriculum = loadCurriculum();
  const curriculumId = curriculum.curriculum?.id || "kr-2022";
  const lookup = new Map();
  const courses = (curriculum.courses || [])
    .filter((course) => isCourseAvailable(course.id))
    .map((course) => ({
      id: course.id,
      title: course.officialTitle || course.title || course.id,
      units: (course.units || []).map((unit) => ({
        id: unit.id,
        title: unit.title || unit.id,
        concepts: (unit.concepts || []).map((concept) => {
          const key = conceptKey(course.id, unit.id, concept.id);
          const item = {
            key,
            curriculumId,
            courseId: course.id,
            courseTitle: course.officialTitle || course.title || course.id,
            unitId: unit.id,
            unitTitle: unit.title || unit.id,
            conceptId: concept.id,
            conceptTitle: concept.title || concept.id,
          };
          lookup.set(key, item);
          return item;
        }),
      })).filter((unit) => unit.concepts.length),
    })).filter((course) => course.units.length);
  return { curriculumId, courses, lookup };
}

function normalizeConceptSelection(values) {
  const selected = Array.isArray(values) ? values : values ? [values] : [];
  const uniqueKeys = [...new Set(selected.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!uniqueKeys.length) throw statusError(400, "이번 주에 배운 개념을 한 개 이상 선택해 주세요.");
  if (uniqueKeys.length > MAX_WEEK_CONCEPTS) {
    throw statusError(400, `한 주에는 개념을 최대 ${MAX_WEEK_CONCEPTS}개까지 선택할 수 있습니다.`);
  }
  const { lookup } = curriculumConceptCatalog();
  return uniqueKeys.map((key) => {
    const concept = lookup.get(key);
    if (!concept) throw statusError(400, "교육과정에 없거나 아직 제공되지 않는 개념이 포함되어 있습니다.");
    const { key: _key, ...snapshot } = concept;
    return snapshot;
  });
}

function conceptHref(concept) {
  return `/learn/${encodeURIComponent(concept.courseId)}/${encodeURIComponent(concept.unitId)}/${encodeURIComponent(concept.conceptId)}`;
}

function serializeWeek(week, { includeAnswerKey = false } = {}) {
  const source = typeof week?.toObject === "function" ? week.toObject() : week;
  const assignmentOmr = source?.assignmentOmr
    ? { ...source.assignmentOmr }
    : null;
  if (assignmentOmr && !includeAnswerKey) delete assignmentOmr.answerKey;
  if (assignmentOmr) assignmentOmr.questions = omrQuestionRows(assignmentOmr);
  return {
    ...source,
    assignmentOmr,
    concepts: (source?.concepts || []).map((concept) => ({ ...concept, href: conceptHref(concept) })),
  };
}

async function getManagedClass({ teacherUserId, classId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (!mongoose.isValidObjectId(classId)) throw statusError(404, "반을 찾을 수 없습니다.");
  const academyClass = await AcademyClass.findOne({
    _id: classId,
    academyId: context.academyId,
    isActive: true,
  }).lean();
  if (!academyClass) throw statusError(404, "현재 학원에서 사용하는 반을 찾을 수 없습니다.");
  const assigned =
    String(academyClass.homeroomTeacherUserId || "") === String(teacherUserId) ||
    (academyClass.coTeacherUserIds || []).some((userId) => String(userId) === String(teacherUserId));
  if (context.staff.role !== "OWNER" && !assigned) {
    throw statusError(403, "이 반을 담당하는 선생님만 주차별 수업과 과제를 관리할 수 있습니다.");
  }
  return { context, academyClass };
}

async function getAcademyClassworkTeacherView({ teacherUserId, classId, editWeekId = "" }) {
  const { context, academyClass } = await getManagedClass({ teacherUserId, classId });
  const weeks = await AcademyClassWeek.find({ academyId: context.academyId, classId: academyClass._id })
    .select("+assignmentOmr.answerKey")
    .sort({ academicYear: -1, weekNumber: -1, _id: -1 })
    .populate("createdByUserId", "name realName")
    .populate("updatedByUserId", "name realName")
    .lean();
  await finalizeMissedAssignmentSubmissions({ weekIds: weeks.map((week) => week._id) });
  const submissions = weeks.length
    ? await AcademyAssignmentSubmission.find({ weekId: { $in: weeks.map((week) => week._id) } })
        .sort({ submittedAt: -1 })
        .populate("studentUserId", "name realName email")
        .lean()
    : [];
  const submissionsByWeek = new Map();
  submissions.forEach((submission) => {
    const key = String(submission.weekId);
    if (!submissionsByWeek.has(key)) submissionsByWeek.set(key, []);
    submissionsByWeek.get(key).push(submission);
  });
  weeks.forEach((week) => {
    week.submissions = submissionsByWeek.get(String(week._id)) || [];
  });
  let editingWeek = null;
  if (editWeekId) {
    if (!mongoose.isValidObjectId(editWeekId)) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
    editingWeek = weeks.find((week) => String(week._id) === String(editWeekId)) || null;
    if (!editingWeek) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
  }
  return {
    academyClass,
    catalog: curriculumConceptCatalog().courses,
    currentAcademicYear: currentKstYear(),
    weeks: weeks.map((week) => serializeWeek(week, { includeAnswerKey: true })),
    editingWeek: editingWeek ? serializeWeek(editingWeek, { includeAnswerKey: true }) : null,
  };
}

async function storeWeekFiles(files, { academyId, classId }) {
  const storedFiles = [];
  try {
    for (const file of files || []) {
      if (!file?.contentValidated) throw statusError(422, "검사가 완료된 과제 파일만 저장할 수 있습니다.");
      const asset = await storeUploadedFile(file, {
        folder: `matths/academy-assignments/${academyId}/${classId}`,
        purpose: STORAGE_PURPOSES.ACADEMY_ASSIGNMENT,
      });
      storedFiles.push({
        originalName: path.basename(String(file.originalname || "과제 파일")).normalize("NFC").slice(0, 240),
        mimeType: String(file.mimetype || "application/octet-stream").slice(0, 160),
        sizeBytes: Number(file.size || 0),
        ...storageFields(asset),
        uploadedAt: new Date(),
      });
    }
    return storedFiles;
  } catch (error) {
    await Promise.all(storedFiles.map((file) => destroyStoredAsset(file).catch(() => {})));
    throw error;
  }
}

async function saveAcademyClassWeek({
  teacherUserId,
  classId,
  weekId = "",
  academicYear,
  weekNumber,
  title,
  lessonSummary,
  conceptKeys,
  assignmentTitle,
  assignmentInstructions,
  assignmentOmr,
  dueAt,
  files = [],
}) {
  const { context, academyClass } = await getManagedClass({ teacherUserId, classId });
  const normalizedYear = normalizeAcademicYear(academicYear);
  const normalizedWeek = normalizeWeekNumber(weekNumber);
  const normalizedTitle = cleanText(title, 100, "주차 제목") || `${normalizedWeek}주차 수업`;
  const concepts = normalizeConceptSelection(conceptKeys);
  const normalizedOmr = normalizeAssignmentOmr(assignmentOmr, teacherUserId);
  const nextValues = {
    academicYear: normalizedYear,
    weekNumber: normalizedWeek,
    title: normalizedTitle,
    lessonSummary: cleanText(lessonSummary, 2000, "수업 요약", { multiline: true }),
    concepts,
    assignmentTitle: cleanText(assignmentTitle, 120, "과제 제목", { required: true }),
    assignmentInstructions: cleanText(assignmentInstructions, 3000, "과제 안내", { multiline: true }),
    dueAt: parseKstDueAt(dueAt),
    status: "PUBLISHED",
    publishedAt: new Date(),
    updatedByUserId: teacherUserId,
  };
  if (normalizedOmr !== OMR_NOT_PROVIDED) nextValues.assignmentOmr = normalizedOmr || undefined;

  let week = null;
  if (weekId) {
    if (!mongoose.isValidObjectId(weekId)) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
    week = await AcademyClassWeek.findOne({
      _id: weekId,
      academyId: context.academyId,
      classId: academyClass._id,
    }).select("+assignmentOmr.answerKey");
    if (!week) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
    if ((week.files || []).length + files.length > MAX_WEEK_FILES) {
      throw statusError(400, `한 주차에는 과제 파일을 최대 ${MAX_WEEK_FILES}개까지 등록할 수 있습니다.`);
    }
  } else if (files.length > MAX_WEEK_FILES) {
    throw statusError(400, `한 주차에는 과제 파일을 최대 ${MAX_WEEK_FILES}개까지 등록할 수 있습니다.`);
  }

  const storedFiles = await storeWeekFiles(files, {
    academyId: context.academyId,
    classId: academyClass._id,
  });
  try {
    if (week) {
      Object.assign(week, nextValues);
      if (week.assignmentOmr?.enabled) week.assignmentOmr.missedSubmissionsFinalizedAt = null;
      if (storedFiles.length) week.files.push(...storedFiles);
      await week.save();
    } else {
      week = await AcademyClassWeek.create({
        academyId: context.academyId,
        classId: academyClass._id,
        ...nextValues,
        files: storedFiles,
        createdByUserId: teacherUserId,
      });
    }
    await AcademyAssignmentSubmission.deleteMany({ weekId: week._id, status: "MISSED" });
    if (week.assignmentOmr?.enabled) await regradeAssignmentSubmissions(week);
    await finalizeMissedAssignmentSubmissions({ weekIds: [week._id] });
    return serializeWeek(week, { includeAnswerKey: true });
  } catch (error) {
    await Promise.all(storedFiles.map((file) => destroyStoredAsset(file).catch(() => {})));
    if (error?.code === 11000) throw statusError(409, "같은 학년도와 주차가 이미 있습니다. 기존 주차의 수정 버튼을 이용해 주세요.");
    throw error;
  }
}

async function removeAcademyClassWeekFile({ teacherUserId, classId, weekId, fileId }) {
  const { context, academyClass } = await getManagedClass({ teacherUserId, classId });
  if (!mongoose.isValidObjectId(weekId) || !mongoose.isValidObjectId(fileId)) {
    throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  }
  const week = await AcademyClassWeek.findOne({
    _id: weekId,
    academyId: context.academyId,
    classId: academyClass._id,
  });
  const file = week?.files?.id(fileId);
  if (!week || !file) throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  const storedFile = file.toObject();
  file.deleteOne();
  week.updatedByUserId = teacherUserId;
  await week.save();
  await destroyStoredAsset(storedFile).catch((error) => {
    console.error("학원 과제 파일 원본 삭제 실패:", error.message);
  });
  return { weekId: week._id, fileId };
}

async function deleteAcademyClassWeek({ teacherUserId, classId, weekId }) {
  const { context, academyClass } = await getManagedClass({ teacherUserId, classId });
  if (!mongoose.isValidObjectId(weekId)) {
    throw statusError(404, "삭제할 주차를 찾을 수 없습니다.");
  }
  const week = await AcademyClassWeek.findOne({
    _id: weekId,
    academyId: context.academyId,
    classId: academyClass._id,
  }).lean();
  if (!week) throw statusError(404, "삭제할 주차를 찾을 수 없습니다.");

  const deletion = await AcademyClassWeek.deleteOne({
    _id: week._id,
    academyId: context.academyId,
    classId: academyClass._id,
  });
  if (deletion.deletedCount !== 1) throw statusError(409, "주차 삭제 상태가 변경되었습니다. 다시 확인해 주세요.");
  await AcademyAssignmentSubmission.deleteMany({ weekId: week._id });

  await Promise.all((week.files || []).map((file) => destroyStoredAsset(file).catch((error) => {
    console.error("학원 주차 삭제 후 과제 파일 원본 정리 실패:", error.message);
  })));
  return { weekId: week._id, academicYear: week.academicYear, weekNumber: week.weekNumber };
}

async function getStudentAcademyContext(studentUserId) {
  const membership = await AcademyStudentMembership.findOne({
    studentUserId,
    status: "APPROVED",
  })
    .populate("academyId", "name status profileImageAsset")
    .populate("classId", "name isActive schedule homeroomTeacherUserId")
    .lean();
  if (!membership || !membership.academyId || membership.academyId.status !== "ACTIVE") {
    throw statusError(403, "승인된 학원 소속 학생만 학원 탭을 이용할 수 있습니다.");
  }
  if (membership.classId && membership.classId.isActive === false) membership.classId = null;
  return { membership, academy: membership.academyId, academyClass: membership.classId || null };
}

async function getStudentAcademyClassroom({ studentUserId }) {
  const context = await getStudentAcademyContext(studentUserId);
  const weeks = context.academyClass
    ? await AcademyClassWeek.find({
        academyId: context.academy._id,
        classId: context.academyClass._id,
        status: "PUBLISHED",
      }).sort({ academicYear: -1, weekNumber: -1, _id: -1 }).lean()
    : [];
  return { ...context, weeks: weeks.map(serializeWeek) };
}

async function getStudentAcademyWeek({ studentUserId, weekId }) {
  const context = await getStudentAcademyContext(studentUserId);
  if (!context.academyClass || !mongoose.isValidObjectId(weekId)) {
    throw statusError(404, "주차별 수업을 찾을 수 없습니다.");
  }
  const week = await AcademyClassWeek.findOne({
    _id: weekId,
    academyId: context.academy._id,
    classId: context.academyClass._id,
    status: "PUBLISHED",
  }).lean();
  if (!week) throw statusError(404, "주차별 수업을 찾을 수 없습니다.");
  await finalizeMissedAssignmentSubmissions({ weekIds: [week._id] });
  const submission = await AcademyAssignmentSubmission.findOne({
    weekId: week._id,
    studentUserId,
  }).lean();
  const serialized = serializeWeek(week);
  if (serialized.assignmentOmr) {
    serialized.assignmentOmr.questions = omrQuestionRows(
      serialized.assignmentOmr,
      submission?.answers || []
    );
  }
  return { ...context, week: serialized, submission };
}

async function regradeAssignmentSubmissions(week) {
  if (!week?.assignmentOmr?.enabled || !week.assignmentOmr.answerKey?.length) return { modifiedCount: 0 };
  const submissions = await AcademyAssignmentSubmission.find({ weekId: week._id }).lean();
  if (!submissions.length) return { modifiedCount: 0 };
  const operations = submissions.map((submission) => ({
    updateOne: {
      filter: { _id: submission._id },
      update: { $set: gradeAssignmentAnswers({ omr: week.assignmentOmr, answers: submission.answers }) },
    },
  }));
  return AcademyAssignmentSubmission.bulkWrite(operations);
}

function missedAssignmentGrade(week, now) {
  const questionCount = Number(week.assignmentOmr.questionCount);
  return {
    academyId: week.academyId,
    classId: week.classId,
    weekId: week._id,
    answers: Array(questionCount).fill(""),
    answeredCount: 0,
    correctByQuestion: Array(questionCount).fill(false),
    correctCount: 0,
    questionCount,
    scorePercent: 0,
    status: "MISSED",
    submittedAt: null,
    gradedAt: now,
    autoZeroedAt: now,
    answerKeyConfiguredAt: week.assignmentOmr.configuredAt || null,
  };
}

async function finalizeMissedAssignmentSubmissions({ now = new Date(), weekIds, limit = 100 } = {}) {
  const currentTime = new Date(now);
  if (Number.isNaN(currentTime.getTime())) throw new TypeError("과제 마감 처리 기준 시간이 올바르지 않습니다.");
  const query = {
    status: "PUBLISHED",
    dueAt: { $ne: null, $lte: currentTime },
    "assignmentOmr.enabled": true,
    "assignmentOmr.missedSubmissionsFinalizedAt": null,
  };
  if (weekIds !== undefined) {
    const normalizedWeekIds = [...new Set((weekIds || []).map(String))]
      .filter((value) => mongoose.isValidObjectId(value))
      .map((value) => new mongoose.Types.ObjectId(value));
    if (!normalizedWeekIds.length) return { scanned: 0, finalized: 0, autoZeroed: 0 };
    query._id = { $in: normalizedWeekIds };
  }
  const weeks = await AcademyClassWeek.find(query)
    .sort({ dueAt: 1, _id: 1 })
    .limit(Math.max(1, Math.min(1000, Number(limit) || 100)))
    .lean();
  const summary = { scanned: weeks.length, finalized: 0, autoZeroed: 0 };
  for (const week of weeks) {
    const memberships = await AcademyStudentMembership.find({
      academyId: week.academyId,
      classId: week.classId,
      status: "APPROVED",
      $or: [
        { approvedAt: { $lte: week.dueAt } },
        { approvedAt: null },
        { approvedAt: { $exists: false } },
      ],
    }).select("studentUserId").lean();
    if (memberships.length) {
      const zeroGrade = missedAssignmentGrade(week, currentTime);
      const operations = memberships.map((membership) => ({
        updateOne: {
          filter: { weekId: week._id, studentUserId: membership.studentUserId },
          update: {
            $setOnInsert: {
              ...zeroGrade,
              studentUserId: membership.studentUserId,
            },
          },
          upsert: true,
        },
      }));
      try {
        const result = await AcademyAssignmentSubmission.bulkWrite(operations, { ordered: false });
        summary.autoZeroed += Number(result.upsertedCount || 0);
      } catch (error) {
        const writeErrors = error?.writeErrors || [];
        if (!writeErrors.length || writeErrors.some((item) => Number(item?.code) !== 11000)) throw error;
        summary.autoZeroed += Number(error?.result?.upsertedCount || 0);
      }
    }
    const finalized = await AcademyClassWeek.updateOne(
      {
        _id: week._id,
        dueAt: week.dueAt,
        "assignmentOmr.enabled": true,
        "assignmentOmr.missedSubmissionsFinalizedAt": null,
      },
      { $set: { "assignmentOmr.missedSubmissionsFinalizedAt": currentTime } }
    );
    summary.finalized += Number(finalized.modifiedCount || 0);
  }
  return summary;
}

function startAcademyAssignmentDeadlineScheduler({ intervalMs = ASSIGNMENT_DEADLINE_INTERVAL_MS } = {}) {
  if (assignmentDeadlineTimer) return assignmentDeadlineTimer;
  const run = async () => {
    if (assignmentDeadlineRunning) return;
    assignmentDeadlineRunning = true;
    try {
      await withSchedulerLease(
        { name: "ACADEMY_ASSIGNMENT_DEADLINES", leaseMs: 2 * 60 * 1000 },
        () => finalizeMissedAssignmentSubmissions()
      );
    } finally {
      assignmentDeadlineRunning = false;
    }
  };
  run().catch((error) => console.error("학원 과제 미제출 자동 0점 초기 처리 실패:", error));
  assignmentDeadlineTimer = setInterval(() => {
    run().catch((error) => console.error("학원 과제 미제출 자동 0점 처리 실패:", error));
  }, Math.max(10_000, Number(intervalMs) || ASSIGNMENT_DEADLINE_INTERVAL_MS));
  assignmentDeadlineTimer.unref?.();
  return assignmentDeadlineTimer;
}

function stopAcademyAssignmentDeadlineScheduler() {
  if (assignmentDeadlineTimer) clearInterval(assignmentDeadlineTimer);
  assignmentDeadlineTimer = null;
  assignmentDeadlineRunning = false;
}

async function submitAcademyAssignment({ studentUserId, weekId, answers }) {
  const context = await getStudentAcademyContext(studentUserId);
  if (!context.academyClass || !mongoose.isValidObjectId(weekId)) {
    throw statusError(404, "제출할 과제를 찾을 수 없습니다.");
  }
  const week = await AcademyClassWeek.findOne({
    _id: weekId,
    academyId: context.academy._id,
    classId: context.academyClass._id,
    status: "PUBLISHED",
  }).select("+assignmentOmr.answerKey");
  if (!week || !week.assignmentOmr?.enabled || !week.assignmentOmr.answerKey?.length) {
    throw statusError(404, "이 과제에는 제출 가능한 답안지가 없습니다.");
  }
  if (week.dueAt && new Date(week.dueAt).getTime() <= Date.now()) {
    throw statusError(410, "과제 제출 마감 시간이 지났습니다.");
  }
  const normalizedInput = Array.from({ length: week.assignmentOmr.questionCount }, (_unused, index) =>
    normalizeAnswer(answers?.[index])
  );
  const missingNumber = normalizedInput.findIndex((answer) => !answer);
  if (missingNumber >= 0) throw statusError(400, `${missingNumber + 1}번 답안을 입력해 주세요.`);
  const normalizedModes = Array.from({ length: week.assignmentOmr.questionCount }, (_unused, index) => {
    return answerTypeForNumber(week.assignmentOmr, index + 1)?.answerType || "SHORT_ANSWER";
  });
  normalizedInput.forEach((answer, index) => {
    const questionNumber = index + 1;
    const section = answerTypeForNumber(week.assignmentOmr, questionNumber);
    if (
      normalizedModes[index] === "MULTIPLE_CHOICE" &&
      (!/^\d$/.test(answer) || Number(answer) < 1 || Number(answer) > section.choiceCount)
    ) {
      throw statusError(400, `${questionNumber}번 답안을 1~${section.choiceCount} 중에서 선택해 주세요.`);
    }
  });
  const graded = gradeAssignmentAnswers({ omr: week.assignmentOmr, answers: normalizedInput });
  const submittedAt = new Date();
  return AcademyAssignmentSubmission.findOneAndUpdate(
    { weekId: week._id, studentUserId },
    {
      $set: {
        academyId: context.academy._id,
        classId: context.academyClass._id,
        ...graded,
        answerModes: normalizedModes,
        status: "SUBMITTED",
        submittedAt,
        autoZeroedAt: null,
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true }
  ).lean();
}

async function signedWeekFile(week, fileId) {
  const file = week?.files?.id(fileId);
  if (!file) throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  const url = await signedStoredAssetUrl(file.toObject(), {
    download: true,
    originalName: file.originalName,
  });
  if (!url) throw statusError(404, "과제 파일 원본을 찾을 수 없습니다.");
  return url;
}

async function createAcademyWeekFileDownload({ userId, downloaderRole, week, fileId }) {
  const file = week?.files?.id(fileId);
  if (!file) throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  if (isPdfDownload(file)) {
    const issued = await issuePersonalizedPdf({
      userId,
      examId: String(week._id),
      sourceType: "ACADEMY_ASSIGNMENT",
      sourceId: `${week._id}:${file._id}`,
      assetId: String(file._id),
      originalName: file.originalName,
      storageRecord: file.toObject(),
      academyId: week.academyId,
      academyClassId: week.classId,
      academyClassWeekId: week._id,
      academyAssignmentFileId: String(file._id),
      downloaderRole,
    });
    return { type: "PERSONALIZED_PDF", issued };
  }
  return { type: "REDIRECT", url: await signedWeekFile(week, fileId) };
}

async function getTeacherAcademyWeekFileDownload({ teacherUserId, classId, weekId, fileId }) {
  const { context, academyClass } = await getManagedClass({ teacherUserId, classId });
  if (!mongoose.isValidObjectId(weekId) || !mongoose.isValidObjectId(fileId)) {
    throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  }
  const week = await AcademyClassWeek.findOne({
    _id: weekId,
    academyId: context.academyId,
    classId: academyClass._id,
  });
  if (!week) throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  return createAcademyWeekFileDownload({
    userId: teacherUserId,
    downloaderRole: "teacher",
    week,
    fileId,
  });
}

async function getStudentAcademyWeekFileDownload({ studentUserId, weekId, fileId, studentRole = "student" }) {
  const context = await getStudentAcademyContext(studentUserId);
  if (!context.academyClass || !mongoose.isValidObjectId(weekId) || !mongoose.isValidObjectId(fileId)) {
    throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  }
  const week = await AcademyClassWeek.findOne({
    _id: weekId,
    academyId: context.academy._id,
    classId: context.academyClass._id,
    status: "PUBLISHED",
  });
  if (!week) throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  return createAcademyWeekFileDownload({
    userId: studentUserId,
    downloaderRole: studentRole === "test" ? "test" : "student",
    week,
    fileId,
  });
}

module.exports = {
  currentKstYear,
  curriculumConceptCatalog,
  createAcademyWeekFileDownload,
  deleteAcademyClassWeek,
  getAcademyClassworkTeacherView,
  getStudentAcademyClassroom,
  getStudentAcademyWeek,
  getStudentAcademyWeekFileDownload,
  getTeacherAcademyWeekFileDownload,
  MAX_WEEK_CONCEPTS,
  MAX_WEEK_FILES,
  MAX_OMR_QUESTIONS,
  ASSIGNMENT_DEADLINE_INTERVAL_MS,
  finalizeMissedAssignmentSubmissions,
  normalizeAssignmentOmr,
  gradeAssignmentAnswers,
  removeAcademyClassWeekFile,
  saveAcademyClassWeek,
  startAcademyAssignmentDeadlineScheduler,
  stopAcademyAssignmentDeadlineScheduler,
  submitAcademyAssignment,
};

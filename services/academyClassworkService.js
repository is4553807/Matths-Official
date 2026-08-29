const path = require("node:path");
const mongoose = require("mongoose");
const {
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

const MAX_WEEK_CONCEPTS = 30;
const MAX_WEEK_FILES = 10;

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
    if (!concept) throw statusError(400, "YAML 교육과정에 없거나 아직 제공되지 않는 개념이 포함되어 있습니다.");
    const { key: _key, ...snapshot } = concept;
    return snapshot;
  });
}

function conceptHref(concept) {
  return `/learn/${encodeURIComponent(concept.courseId)}/${encodeURIComponent(concept.unitId)}/${encodeURIComponent(concept.conceptId)}`;
}

function serializeWeek(week) {
  const source = typeof week?.toObject === "function" ? week.toObject() : week;
  return {
    ...source,
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
    .sort({ academicYear: -1, weekNumber: -1, _id: -1 })
    .populate("createdByUserId", "name realName")
    .populate("updatedByUserId", "name realName")
    .lean();
  let editingWeek = null;
  if (editWeekId) {
    if (!mongoose.isValidObjectId(editWeekId)) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
    editingWeek = weeks.find((week) => String(week._id) === String(editWeekId)) || null;
    if (!editingWeek) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
  }
  return {
    catalog: curriculumConceptCatalog().courses,
    currentAcademicYear: currentKstYear(),
    weeks: weeks.map(serializeWeek),
    editingWeek: editingWeek ? serializeWeek(editingWeek) : null,
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
  dueAt,
  files = [],
}) {
  const { context, academyClass } = await getManagedClass({ teacherUserId, classId });
  const normalizedYear = normalizeAcademicYear(academicYear);
  const normalizedWeek = normalizeWeekNumber(weekNumber);
  const normalizedTitle = cleanText(title, 100, "주차 제목") || `${normalizedWeek}주차 수업`;
  const concepts = normalizeConceptSelection(conceptKeys);
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

  let week = null;
  if (weekId) {
    if (!mongoose.isValidObjectId(weekId)) throw statusError(404, "수정할 주차를 찾을 수 없습니다.");
    week = await AcademyClassWeek.findOne({
      _id: weekId,
      academyId: context.academyId,
      classId: academyClass._id,
    });
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
    return serializeWeek(week);
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
  return { ...context, week: serializeWeek(week) };
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
  removeAcademyClassWeekFile,
  saveAcademyClassWeek,
};

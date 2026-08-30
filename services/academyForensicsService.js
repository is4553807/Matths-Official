const mongoose = require("mongoose");
const {
  AcademyClass,
  AcademyStudentMembership,
} = require("../models/academyModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const { getTeacherAcademyContext } = require("./academyService");
const {
  analyzeForensicTraceCode,
  analyzeForensicUpload,
} = require("./pdfWatermarkService");

const ACADEMY_FORENSIC_ROLES = ["student", "test", "teacher"];

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function accessibleClassQuery(context, teacherUserId) {
  // 유출은 반 보관 이후 발견될 수도 있으므로 과거 반을 선택지에서 제외하지 않는다.
  const query = { academyId: context.academyId };
  if (context.staff.role !== "OWNER") {
    query.$or = [
      { homeroomTeacherUserId: teacherUserId },
      { coTeacherUserIds: teacherUserId },
    ];
  }
  return query;
}

async function academyForensicsContext({ teacherUserId, classId = "", allowDefault = true }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const classes = await AcademyClass.find(accessibleClassQuery(context, teacherUserId))
    .select("name isActive homeroomTeacherUserId coTeacherUserIds")
    .sort({ isActive: -1, name: 1, _id: 1 })
    .lean();
  if (!classes.length) {
    if (String(classId || "").trim()) {
      throw statusError(403, "원장 또는 해당 반 담당 선생님만 자료를 추적할 수 있습니다.");
    }
    return { context, classes, selectedClass: null };
  }
  const selectedId = String(classId || (allowDefault ? classes[0]._id : ""));
  if (!mongoose.isValidObjectId(selectedId)) throw statusError(400, "추적 범위로 사용할 반을 선택해 주세요.");
  const selectedClass = classes.find((academyClass) => String(academyClass._id) === selectedId);
  if (!selectedClass) {
    throw statusError(403, "원장 또는 해당 반 담당 선생님만 자료를 추적할 수 있습니다.");
  }
  return { context, classes, selectedClass };
}

function issuanceScope(context, selectedClass) {
  return {
    academyId: context.academyId,
    academyClassId: selectedClass._id,
    sourceType: "ACADEMY_ASSIGNMENT",
    status: "READY",
    downloaderRole: { $in: ACADEMY_FORENSIC_ROLES },
  };
}

async function scopeSummary(context, selectedClass) {
  if (!selectedClass) {
    return { approvedStudents: 0, issuedCopies: 0, distinctDownloaders: 0, firstIssuedAt: null };
  }
  const scope = issuanceScope(context, selectedClass);
  const [approvedStudents, issuedCopies, downloaderIds, oldestIssuance] = await Promise.all([
    AcademyStudentMembership.countDocuments({
      academyId: context.academyId,
      classId: selectedClass._id,
      status: "APPROVED",
    }),
    PdfWatermarkIssuance.countDocuments(scope),
    PdfWatermarkIssuance.distinct("userId", scope),
    PdfWatermarkIssuance.findOne(scope).select("downloadedAt").sort({ downloadedAt: 1 }).lean(),
  ]);
  return {
    approvedStudents,
    issuedCopies,
    distinctDownloaders: downloaderIds.length,
    firstIssuedAt: oldestIssuance?.downloadedAt || null,
  };
}

async function getAcademyForensicsPageData({ teacherUserId, classId = "" }) {
  const { context, classes, selectedClass } = await academyForensicsContext({
    teacherUserId,
    classId,
    allowDefault: true,
  });
  return {
    academy: context.academy,
    isOwner: context.staff.role === "OWNER",
    classes,
    selectedClass,
    scope: await scopeSummary(context, selectedClass),
  };
}

function mapAcademyMatch(match, selectedClass) {
  return {
    displayName: match.realName || match.name || match.username || "이름 미등록",
    className: selectedClass.name,
    userRole: match.userRole,
    downloadedAt: match.downloadedAt,
    traceCode: match.traceCode,
    documentIssueId: match.documentIssueId,
    originalName: match.originalName,
    signatureVerified: Boolean(match.signatureVerified),
    recognitionMethod: match.recognitionMethod,
    ocrConfidence: match.ocrConfidence,
    matchedCandidate: match.matchedCandidate,
  };
}

async function analyzeAcademyForensicEvidence({
  teacherUserId,
  classId,
  filePath = "",
  traceCode = "",
}) {
  const { context, classes, selectedClass } = await academyForensicsContext({
    teacherUserId,
    classId,
    allowDefault: false,
  });
  if (!selectedClass) throw statusError(400, "추적 범위로 사용할 반을 선택해 주세요.");
  const hasFile = Boolean(filePath);
  const normalizedTraceCode = String(traceCode || "").trim();
  if (hasFile === Boolean(normalizedTraceCode)) {
    throw statusError(400, hasFile
      ? "파일과 추적 코드 중 한 가지만 선택해 주세요."
      : "분석할 파일을 선택하거나 추적 코드를 입력해 주세요.");
  }
  if (/^\s*ARM/i.test(normalizedTraceCode)) {
    throw statusError(400, "학원 자료 추적에서는 MTH PDF 추적 코드만 사용할 수 있습니다.");
  }
  const filter = issuanceScope(context, selectedClass);
  const analysis = normalizedTraceCode
    ? await analyzeForensicTraceCode(normalizedTraceCode, {
        issuanceFilter: filter,
        includeArena: false,
      })
    : await analyzeForensicUpload(filePath, {
        issuanceFilter: filter,
        includeArena: false,
        exposeUnmatchedPayloads: false,
      });
  return {
    pageData: {
      academy: context.academy,
      isOwner: context.staff.role === "OWNER",
      classes,
      selectedClass,
      scope: await scopeSummary(context, selectedClass),
    },
    analysis: {
      ...analysis,
      validPayloads: [],
      matches: analysis.matches.map((match) => mapAcademyMatch(match, selectedClass)),
    },
  };
}

module.exports = {
  analyzeAcademyForensicEvidence,
  getAcademyForensicsPageData,
};

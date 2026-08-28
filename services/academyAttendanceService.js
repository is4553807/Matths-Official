const mongoose = require("mongoose");

const {
  AcademyAttendance,
  AcademyClass,
  AcademyStudentMembership,
} = require("../models/academyModel");
const { getTeacherAcademyContext } = require("./academyService");

const KST_TIME_ZONE = "Asia/Seoul";
const ATTENDANCE_STATUSES = new Set(["PRESENT", "LATE", "ABSENT", "EXCUSED"]);
const MAX_ROSTER_SIZE = 300;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getKstDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("value must be a valid date");
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeDateKey(value, now = new Date()) {
  const candidate = String(value || "").trim() || getKstDateKey(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);
  if (!match) throw statusError(400, "출결 날짜 형식이 올바르지 않습니다.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw statusError(400, "존재하지 않는 출결 날짜입니다.");
  }
  return candidate;
}

function normalizeOptionalObjectId(value, fieldLabel) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (!mongoose.isValidObjectId(normalized)) {
    throw statusError(400, `${fieldLabel} 정보가 올바르지 않습니다.`);
  }
  return new mongoose.Types.ObjectId(normalized);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

async function resolveClassFilter(academyId, classId) {
  const normalizedClassId = normalizeOptionalObjectId(classId, "반");
  if (!normalizedClassId) return null;
  const academyClass = await AcademyClass.findOne({
    _id: normalizedClassId,
    academyId,
    isActive: true,
  }).lean();
  if (!academyClass) throw statusError(404, "현재 학원에서 사용하는 반을 찾을 수 없습니다.");
  return academyClass;
}

async function getAcademyAttendanceRoster({ teacherUserId, dateKey, classId, now = new Date() }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const selectedDateKey = normalizeDateKey(dateKey, now);
  const selectedClass = await resolveClassFilter(context.academyId, classId);
  const membershipFilter = {
    academyId: context.academyId,
    status: "APPROVED",
    ...(selectedClass ? { classId: selectedClass._id } : {}),
  };

  const [classes, memberships] = await Promise.all([
    AcademyClass.find({ academyId: context.academyId, isActive: true })
      .sort({ name: 1, _id: 1 })
      .lean(),
    AcademyStudentMembership.find(membershipFilter)
      .sort({ approvedAt: 1, _id: 1 })
      .limit(MAX_ROSTER_SIZE)
      .populate("studentUserId", "name realName schoolGrade school isActive accountStatus")
      .populate("classId", "name")
      .lean(),
  ]);

  const activeMemberships = memberships.filter(
    (membership) =>
      membership.studentUserId &&
      membership.studentUserId.isActive !== false &&
      membership.studentUserId.accountStatus !== "withdrawn"
  );
  const studentUserIds = activeMemberships.map((membership) => membership.studentUserId._id);
  const records = studentUserIds.length
    ? await AcademyAttendance.find({
        academyId: context.academyId,
        dateKey: selectedDateKey,
        studentUserId: { $in: studentUserIds },
      }).lean()
    : [];
  const recordsByStudentId = new Map(
    records.map((record) => [String(record.studentUserId), record])
  );
  const roster = activeMemberships.map((membership) => ({
    membership,
    attendance: recordsByStudentId.get(String(membership.studentUserId._id)) || null,
  }));
  const counts = roster.reduce(
    (result, item) => {
      const status = item.attendance?.status || "UNRECORDED";
      result[status] += 1;
      return result;
    },
    { TOTAL: roster.length, PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, UNRECORDED: 0 }
  );

  return {
    dateKey: selectedDateKey,
    todayKey: getKstDateKey(now),
    classes,
    selectedClass,
    roster,
    counts,
    truncated: memberships.length >= MAX_ROSTER_SIZE,
  };
}

async function saveAcademyAttendanceRoster({
  teacherUserId,
  dateKey,
  classId,
  studentUserIds,
  statuses,
  notes,
  now = new Date(),
}) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const selectedDateKey = normalizeDateKey(dateKey, now);
  const selectedClass = await resolveClassFilter(context.academyId, classId);
  const rawUserIds = asArray(studentUserIds).map((value) => String(value || "").trim());
  const rawStatuses = asArray(statuses).map((value) => String(value || "").trim().toUpperCase());
  const rawNotes = asArray(notes).map((value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 200));

  if (!rawUserIds.length || rawUserIds.length > MAX_ROSTER_SIZE) {
    throw statusError(400, "저장할 출결 학생 목록이 올바르지 않습니다.");
  }
  if (rawStatuses.length !== rawUserIds.length) {
    throw statusError(400, "학생별 출결 상태를 다시 확인해 주세요.");
  }
  if (new Set(rawUserIds).size !== rawUserIds.length) {
    throw statusError(400, "출결 목록에 같은 학생이 중복되어 있습니다.");
  }
  if (rawUserIds.some((value) => !mongoose.isValidObjectId(value))) {
    throw statusError(400, "학생 정보가 올바르지 않습니다.");
  }
  if (rawStatuses.some((status) => status && !ATTENDANCE_STATUSES.has(status))) {
    throw statusError(400, "지원하지 않는 출결 상태가 포함되어 있습니다.");
  }

  const objectIds = rawUserIds.map((value) => new mongoose.Types.ObjectId(value));
  const membershipFilter = {
    academyId: context.academyId,
    status: "APPROVED",
    studentUserId: { $in: objectIds },
    ...(selectedClass ? { classId: selectedClass._id } : {}),
  };
  const [memberships, existingRecords] = await Promise.all([
    AcademyStudentMembership.find(membershipFilter).select("studentUserId classId").lean(),
    AcademyAttendance.find({
      academyId: context.academyId,
      dateKey: selectedDateKey,
      studentUserId: { $in: objectIds },
    }).lean(),
  ]);
  if (memberships.length !== rawUserIds.length) {
    throw statusError(403, "현재 학원과 반에 소속된 승인 학생만 출결을 기록할 수 있습니다.");
  }

  const membershipByStudentId = new Map(
    memberships.map((membership) => [String(membership.studentUserId), membership])
  );
  const existingByStudentId = new Map(
    existingRecords.map((record) => [String(record.studentUserId), record])
  );
  const operations = rawUserIds.map((studentUserId, index) => {
    const status = rawStatuses[index];
    if (!status) {
      return {
        deleteOne: {
          filter: { academyId: context.academyId, studentUserId, dateKey: selectedDateKey },
        },
      };
    }
    const membership = membershipByStudentId.get(studentUserId);
    const existing = existingByStudentId.get(studentUserId);
    const isArrival = status === "PRESENT" || status === "LATE";
    return {
      updateOne: {
        filter: { academyId: context.academyId, studentUserId, dateKey: selectedDateKey },
        update: {
          $set: {
            classId: membership.classId || null,
            status,
            checkedInAt: isArrival ? existing?.checkedInAt || now : null,
            checkedOutAt: isArrival ? existing?.checkedOutAt || null : null,
            note: rawNotes[index] || "",
            recordedByUserId: teacherUserId,
            source: "MANUAL",
            seedRunId: null,
          },
          $setOnInsert: {
            academyId: context.academyId,
            studentUserId,
            dateKey: selectedDateKey,
          },
        },
        upsert: true,
      },
    };
  });

  if (operations.length) {
    await AcademyAttendance.bulkWrite(operations, { ordered: true });
  }
  return {
    dateKey: selectedDateKey,
    classId: selectedClass ? String(selectedClass._id) : "",
    count: operations.length,
    recordedCount: rawStatuses.filter(Boolean).length,
  };
}

module.exports = {
  getAcademyAttendanceRoster,
  saveAcademyAttendanceRoster,
  _private: {
    getKstDateKey,
    normalizeDateKey,
  },
};

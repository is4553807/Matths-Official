const { createHmac, timingSafeEqual } = require("node:crypto");
const mongoose = require("mongoose");

const {
  AcademyAttendance,
  AcademyAttendanceAudit,
  AcademyAttendanceCodeAttempt,
  AcademyAttendanceSession,
  AcademyClass,
  AcademyStudentMembership,
} = require("../models/academyModel");
const { getTeacherAcademyContext } = require("./academyService");

const KST_TIME_ZONE = "Asia/Seoul";
const ATTENDANCE_STATUSES = new Set(["PRESENT", "LATE", "ABSENT", "EXCUSED"]);
const MAX_ROSTER_SIZE = 300;
const MAX_CODE_ATTEMPTS = 5;
const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
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
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function dateKeyToUtcDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysToDateKey(dateKey, days) {
  return new Date(dateKeyToUtcDate(dateKey).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function dateKeyWeekday(dateKey) {
  return dateKeyToUtcDate(dateKey).getUTCDay();
}

function kstDateTime(dateKey, time) {
  return new Date(`${dateKey}T${time}:00+09:00`);
}

function classHasSchedule(academyClass) {
  return Boolean(
    academyClass?.schedule?.weekdays?.length &&
    academyClass.schedule.startTime &&
    academyClass.schedule.endTime &&
    academyClass.schedule.effectiveFrom
  );
}

function classRunsOnDate(academyClass, dateKey) {
  return classHasSchedule(academyClass) &&
    dateKey >= academyClass.schedule.effectiveFrom &&
    academyClass.schedule.weekdays.includes(dateKeyWeekday(dateKey));
}

function sessionState(session, now = new Date()) {
  if (!session) return "NONE";
  if (session.status === "CANCELED") return "CANCELED";
  if (now < new Date(session.checkInOpensAt)) return "SCHEDULED";
  if (now <= new Date(session.checkInClosesAt)) return "OPEN";
  return "CLOSED";
}

function attendanceCodeSecret() {
  const secret = String(
    process.env.ATTENDANCE_CODE_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SESSION_KEY ||
    ""
  );
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw statusError(503, "출석 코드 보안 설정이 완료되지 않았습니다.");
  }
  return "matths-local-attendance-code-secret";
}

function attendanceCodeForSession(session) {
  const digest = createHmac("sha256", attendanceCodeSecret())
    .update(`${session._id}:${session.codeVersion}:${session.sessionKey}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

function codeMatches(session, submittedCode) {
  const expected = Buffer.from(attendanceCodeForSession(session));
  const submitted = Buffer.from(String(submittedCode || "").replace(/\D/g, ""));
  return expected.length === submitted.length && timingSafeEqual(expected, submitted);
}

function isAssignedClassTeacher(context, academyClass, teacherUserId) {
  if (context.staff.role === "OWNER") return true;
  if (String(academyClass.homeroomTeacherUserId || "") === String(teacherUserId)) return true;
  return (academyClass.coTeacherUserIds || []).some(
    (userId) => String(userId) === String(teacherUserId)
  );
}

async function getManageableClasses(context, teacherUserId) {
  const filter = { academyId: context.academyId, isActive: true };
  if (context.staff.role !== "OWNER") {
    filter.$or = [
      { homeroomTeacherUserId: teacherUserId },
      { coTeacherUserIds: teacherUserId },
    ];
  }
  return AcademyClass.find(filter)
    .sort({ name: 1, _id: 1 })
    .populate("homeroomTeacherUserId", "name realName")
    .populate("coTeacherUserIds", "name realName")
    .lean();
}

async function resolveClassFilter(context, teacherUserId, classId, classes, { defaultFirst = true } = {}) {
  const normalizedClassId = normalizeOptionalObjectId(classId, "반");
  const selectedClass = normalizedClassId
    ? classes.find((academyClass) => String(academyClass._id) === String(normalizedClassId))
    : defaultFirst ? classes[0] || null : null;
  if (normalizedClassId && !selectedClass) {
    const academyClass = await AcademyClass.findOne({
      _id: normalizedClassId,
      academyId: context.academyId,
      isActive: true,
    }).lean();
    if (!academyClass) throw statusError(404, "현재 학원에서 사용하는 반을 찾을 수 없습니다.");
    if (!isAssignedClassTeacher(context, academyClass, teacherUserId)) {
      throw statusError(403, "이 반을 담당하는 선생님만 출결을 관리할 수 있습니다.");
    }
  }
  return selectedClass;
}

async function activeClassRosterStudentIds(academyId, classId) {
  const memberships = await AcademyStudentMembership.find({
    academyId,
    classId,
    status: "APPROVED",
  })
    .select("studentUserId")
    .populate("studentUserId", "isActive accountStatus")
    .lean();
  return memberships
    .filter((membership) =>
      membership.studentUserId &&
      membership.studentUserId.isActive !== false &&
      membership.studentUserId.accountStatus !== "withdrawn"
    )
    .map((membership) => membership.studentUserId._id);
}

function buildSessionWindow(academyClass, dateKey) {
  const startsAt = kstDateTime(dateKey, academyClass.schedule.startTime);
  const endsAt = kstDateTime(dateKey, academyClass.schedule.endTime);
  const policy = academyClass.attendancePolicy || {};
  const opensBeforeMinutes = Number(policy.opensBeforeMinutes ?? 10);
  const lateAfterMinutes = Number(policy.lateAfterMinutes ?? 5);
  const closesAfterMinutes = Number(policy.closesAfterMinutes ?? 20);
  return {
    startsAt,
    endsAt,
    checkInOpensAt: new Date(startsAt.getTime() - opensBeforeMinutes * MINUTE_MS),
    lateAfterAt: new Date(startsAt.getTime() + lateAfterMinutes * MINUTE_MS),
    checkInClosesAt: new Date(startsAt.getTime() + closesAfterMinutes * MINUTE_MS),
  };
}

async function ensureAttendanceSessionForClassDate({ academyClass, dateKey, actorUserId, now = new Date() }) {
  if (!classRunsOnDate(academyClass, dateKey)) return null;
  const window = buildSessionWindow(academyClass, dateKey);
  const sessionKey = `${academyClass.academyId}:${academyClass._id}:${dateKey}:${academyClass.schedule.startTime}`;
  const rosterStudentUserIds = await activeClassRosterStudentIds(academyClass.academyId, academyClass._id);
  let session = await AcademyAttendanceSession.findOneAndUpdate(
    { sessionKey },
    {
      $setOnInsert: {
        academyId: academyClass.academyId,
        classId: academyClass._id,
        sessionKey,
        dateKey,
        ...window,
        attendanceMode: academyClass.attendancePolicy?.mode || "MANUAL",
        codeVersion: 1,
        codeIssuedAt: now,
        rosterStudentUserIds,
        status: "SCHEDULED",
        createdByUserId: actorUserId,
      },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();
  if (session.status === "CANCELED" && now <= window.checkInClosesAt) {
    session = await AcademyAttendanceSession.findOneAndUpdate(
      { _id: session._id, status: "CANCELED" },
      {
        $set: {
          ...window,
          attendanceMode: academyClass.attendancePolicy?.mode || "MANUAL",
          rosterStudentUserIds,
          status: "SCHEDULED",
          createdByUserId: actorUserId,
          codeIssuedAt: now,
          closedAt: null,
          canceledAt: null,
          cancellationReason: null,
        },
        $inc: { codeVersion: 1 },
      },
      { returnDocument: "after", runValidators: true }
    ).lean();
  }
  const nextStatus = sessionState(session, now);
  if (nextStatus !== session.status && nextStatus !== "CANCELED") {
    await AcademyAttendanceSession.updateOne(
      { _id: session._id, status: { $ne: "CANCELED" } },
      { $set: { status: nextStatus, ...(nextStatus === "CLOSED" ? { closedAt: now } : {}) } }
    );
    session.status = nextStatus;
    if (nextStatus === "CLOSED") session.closedAt = now;
  }
  return session;
}

async function finalizeAttendanceSession(session, now = new Date()) {
  if (!session || session.status === "CANCELED" || now <= new Date(session.checkInClosesAt)) return 0;
  const rosterStudentUserIds = session.rosterStudentUserIds || [];
  if (!rosterStudentUserIds.length) {
    await AcademyAttendanceSession.updateOne(
      { _id: session._id, status: { $ne: "CANCELED" } },
      { $set: { status: "CLOSED", closedAt: now } }
    );
    return 0;
  }
  const existingStudentIds = new Set(
    (await AcademyAttendance.distinct("studentUserId", { sessionId: session._id })).map(String)
  );
  const missingStudentIds = rosterStudentUserIds.filter(
    (studentUserId) => !existingStudentIds.has(String(studentUserId))
  );
  if (missingStudentIds.length) {
    const attendanceIds = new Map(missingStudentIds.map((studentUserId) => [
      String(studentUserId),
      new mongoose.Types.ObjectId(),
    ]));
    await AcademyAttendance.bulkWrite(missingStudentIds.map((studentUserId) => ({
      updateOne: {
        filter: { sessionId: session._id, studentUserId },
        update: {
          $setOnInsert: {
            _id: attendanceIds.get(String(studentUserId)),
            academyId: session.academyId,
            classId: session.classId,
            sessionId: session._id,
            studentUserId,
            dateKey: session.dateKey,
            status: "ABSENT",
            checkedInAt: null,
            checkedOutAt: null,
            note: "코드 입력 시간 종료",
            recordedByUserId: session.createdByUserId,
            source: "AUTO_ABSENT",
          },
        },
        upsert: true,
      },
    })), { ordered: false });
    await AcademyAttendanceAudit.insertMany(missingStudentIds.map((studentUserId) => ({
      academyId: session.academyId,
      classId: session.classId,
      sessionId: session._id,
      attendanceId: attendanceIds.get(String(studentUserId)),
      studentUserId,
      actorUserId: session.createdByUserId,
      actorType: "SYSTEM",
      action: "AUTO_ABSENT",
      previousStatus: null,
      nextStatus: "ABSENT",
      note: "코드 입력 시간 종료",
      occurredAt: now,
    })), { ordered: false });
  }
  await AcademyAttendanceSession.updateOne(
    { _id: session._id, status: { $ne: "CANCELED" } },
    { $set: { status: "CLOSED", closedAt: now } }
  );
  return missingStudentIds.length;
}

function sessionPresentation(session, now, { includeCode = false } = {}) {
  if (!session) return null;
  const state = sessionState(session, now);
  return {
    id: String(session._id),
    dateKey: session.dateKey,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    checkInOpensAt: session.checkInOpensAt,
    lateAfterAt: session.lateAfterAt,
    checkInClosesAt: session.checkInClosesAt,
    attendanceMode: session.attendanceMode,
    state,
    isLateWindow: state === "OPEN" && now > new Date(session.lateAfterAt),
    codeVersion: session.codeVersion,
    code: includeCode && session.attendanceMode === "SELF_CODE" && state !== "CANCELED"
      ? attendanceCodeForSession(session)
      : null,
  };
}

async function getAcademyAttendanceRoster({ teacherUserId, dateKey, classId, now = new Date() }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const selectedDateKey = normalizeDateKey(dateKey, now);
  const classes = await getManageableClasses(context, teacherUserId);
  const selectedClass = await resolveClassFilter(context, teacherUserId, classId, classes, { defaultFirst: true });
  const membershipFilter = {
    academyId: context.academyId,
    status: "APPROVED",
    ...(selectedClass ? { classId: selectedClass._id } : {}),
  };
  const memberships = await AcademyStudentMembership.find(membershipFilter)
    .sort({ approvedAt: 1, _id: 1 })
    .limit(MAX_ROSTER_SIZE)
    .populate("studentUserId", "name realName schoolGrade school isActive accountStatus")
    .populate("classId", "name")
    .lean();
  const activeMemberships = memberships.filter(
    (membership) =>
      membership.studentUserId &&
      membership.studentUserId.isActive !== false &&
      membership.studentUserId.accountStatus !== "withdrawn"
  );
  let session = selectedClass
    ? await ensureAttendanceSessionForClassDate({ academyClass: selectedClass, dateKey: selectedDateKey, actorUserId: teacherUserId, now })
    : null;
  if (session) {
    await finalizeAttendanceSession(session, now);
    session = await AcademyAttendanceSession.findById(session._id).lean();
  }
  const studentUserIds = activeMemberships.map((membership) => membership.studentUserId._id);
  const records = studentUserIds.length
    ? await AcademyAttendance.find({
        academyId: context.academyId,
        studentUserId: { $in: studentUserIds },
        ...(session
          ? { sessionId: session._id }
          : { dateKey: selectedDateKey, classId: selectedClass?._id || null, sessionId: null }),
      }).lean()
    : [];
  const recordsByStudentId = new Map(records.map((record) => [String(record.studentUserId), record]));
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
    session: sessionPresentation(session, now, { includeCode: true }),
    roster,
    counts,
    truncated: memberships.length >= MAX_ROSTER_SIZE,
  };
}

async function saveAcademyAttendanceRoster({
  teacherUserId,
  dateKey,
  classId,
  sessionId,
  studentUserIds,
  statuses,
  notes,
  now = new Date(),
}) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const selectedDateKey = normalizeDateKey(dateKey, now);
  const classes = await getManageableClasses(context, teacherUserId);
  const selectedClass = await resolveClassFilter(context, teacherUserId, classId, classes, { defaultFirst: false });
  const rawUserIds = asArray(studentUserIds).map((value) => String(value || "").trim());
  const rawStatuses = asArray(statuses).map((value) => String(value || "").trim().toUpperCase());
  const rawNotes = asArray(notes).map((value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 200));
  if (!rawUserIds.length || rawUserIds.length > MAX_ROSTER_SIZE) throw statusError(400, "저장할 출결 학생 목록이 올바르지 않습니다.");
  if (rawStatuses.length !== rawUserIds.length) throw statusError(400, "학생별 출결 상태를 다시 확인해 주세요.");
  if (new Set(rawUserIds).size !== rawUserIds.length) throw statusError(400, "출결 목록에 같은 학생이 중복되어 있습니다.");
  if (rawUserIds.some((value) => !mongoose.isValidObjectId(value))) throw statusError(400, "학생 정보가 올바르지 않습니다.");
  if (rawStatuses.some((status) => status && !ATTENDANCE_STATUSES.has(status))) throw statusError(400, "지원하지 않는 출결 상태가 포함되어 있습니다.");

  let session = null;
  const normalizedSessionId = normalizeOptionalObjectId(sessionId, "수업 회차");
  if (normalizedSessionId) {
    session = await AcademyAttendanceSession.findOne({
      _id: normalizedSessionId,
      academyId: context.academyId,
      ...(selectedClass ? { classId: selectedClass._id } : {}),
    }).lean();
    if (!session) throw statusError(404, "출결 수업 회차를 찾을 수 없습니다.");
  } else if (selectedClass) {
    session = await ensureAttendanceSessionForClassDate({ academyClass: selectedClass, dateKey: selectedDateKey, actorUserId: teacherUserId, now });
  }

  const objectIds = rawUserIds.map((value) => new mongoose.Types.ObjectId(value));
  const membershipFilter = {
    academyId: context.academyId,
    status: "APPROVED",
    studentUserId: { $in: objectIds },
    ...(selectedClass ? { classId: selectedClass._id } : {}),
  };
  const recordFilter = session
    ? { academyId: context.academyId, sessionId: session._id, studentUserId: { $in: objectIds } }
    : {
        academyId: context.academyId,
        dateKey: selectedDateKey,
        classId: selectedClass?._id || null,
        sessionId: null,
        studentUserId: { $in: objectIds },
      };
  const [memberships, existingRecords] = await Promise.all([
    AcademyStudentMembership.find(membershipFilter).select("studentUserId classId").lean(),
    AcademyAttendance.find(recordFilter).lean(),
  ]);
  if (memberships.length !== rawUserIds.length) throw statusError(403, "현재 학원과 반에 소속된 승인 학생만 출결을 기록할 수 있습니다.");
  const membershipByStudentId = new Map(memberships.map((membership) => [String(membership.studentUserId), membership]));
  const existingByStudentId = new Map(existingRecords.map((record) => [String(record.studentUserId), record]));
  const operations = rawUserIds.map((studentUserId, index) => {
    const status = rawStatuses[index];
    const baseFilter = session
      ? { sessionId: session._id, studentUserId }
      : { academyId: context.academyId, studentUserId, dateKey: selectedDateKey, classId: selectedClass?._id || null, sessionId: null };
    if (!status) return { deleteOne: { filter: baseFilter } };
    const membership = membershipByStudentId.get(studentUserId);
    const existing = existingByStudentId.get(studentUserId);
    const isArrival = status === "PRESENT" || status === "LATE";
    return {
      updateOne: {
        filter: baseFilter,
        update: {
          $set: {
            academyId: context.academyId,
            classId: membership.classId || null,
            sessionId: session?._id || null,
            studentUserId,
            dateKey: selectedDateKey,
            status,
            checkedInAt: isArrival ? existing?.checkedInAt || now : null,
            checkedOutAt: isArrival ? existing?.checkedOutAt || null : null,
            note: rawNotes[index] || "",
            recordedByUserId: teacherUserId,
            source: "MANUAL",
            seedRunId: null,
          },
        },
        upsert: true,
      },
    };
  });
  await AcademyAttendance.bulkWrite(operations, { ordered: true });
  if (session) {
    await AcademyAttendanceSession.updateOne({ _id: session._id }, { $addToSet: { rosterStudentUserIds: { $each: objectIds } } });
  }
  const savedRecords = await AcademyAttendance.find(recordFilter).lean();
  const savedByStudentId = new Map(savedRecords.map((record) => [String(record.studentUserId), record]));
  await AcademyAttendanceAudit.insertMany(rawUserIds.map((studentUserId, index) => {
    const existing = existingByStudentId.get(studentUserId);
    const saved = savedByStudentId.get(studentUserId);
    return {
      academyId: context.academyId,
      classId: selectedClass?._id || membershipByStudentId.get(studentUserId)?.classId || null,
      sessionId: session?._id || null,
      attendanceId: saved?._id || existing?._id || null,
      studentUserId,
      actorUserId: teacherUserId,
      actorType: "TEACHER",
      action: rawStatuses[index] ? existing ? "UPDATED" : "CREATED" : "CLEARED",
      previousStatus: existing?.status || null,
      nextStatus: rawStatuses[index] || null,
      note: rawNotes[index] || "",
      occurredAt: now,
    };
  }), { ordered: false });
  return {
    dateKey: selectedDateKey,
    classId: selectedClass ? String(selectedClass._id) : "",
    sessionId: session ? String(session._id) : "",
    count: operations.length,
    recordedCount: rawStatuses.filter(Boolean).length,
  };
}

async function regenerateAttendanceSessionCode({ teacherUserId, sessionId, now = new Date() }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const normalizedSessionId = normalizeOptionalObjectId(sessionId, "수업 회차");
  if (!normalizedSessionId) throw statusError(404, "수업 회차를 찾을 수 없습니다.");
  const session = await AcademyAttendanceSession.findOne({ _id: normalizedSessionId, academyId: context.academyId }).lean();
  if (!session) throw statusError(404, "수업 회차를 찾을 수 없습니다.");
  const academyClass = await AcademyClass.findOne({ _id: session.classId, academyId: context.academyId }).lean();
  if (!academyClass || !isAssignedClassTeacher(context, academyClass, teacherUserId)) {
    throw statusError(403, "이 반을 담당하는 선생님만 출석 코드를 변경할 수 있습니다.");
  }
  if (session.attendanceMode !== "SELF_CODE") throw statusError(409, "학생 코드 출결을 사용하는 수업이 아닙니다.");
  if (["CLOSED", "CANCELED"].includes(sessionState(session, now))) throw statusError(409, "종료된 수업의 출석 코드는 변경할 수 없습니다.");
  const updated = await AcademyAttendanceSession.findByIdAndUpdate(
    session._id,
    { $inc: { codeVersion: 1 }, $set: { codeIssuedAt: now } },
    { returnDocument: "after" }
  ).lean();
  await AcademyAttendanceCodeAttempt.deleteMany({ sessionId: session._id });
  return sessionPresentation(updated, now, { includeCode: true });
}

async function getStudentAttendanceDashboard({ studentUserId, now = new Date() }) {
  const membership = await AcademyStudentMembership.findOne({ studentUserId, status: "APPROVED" })
    .populate("academyId", "name status")
    .populate("classId")
    .lean();
  if (!membership?.academyId || membership.academyId.status !== "ACTIVE" || !membership.classId?.isActive) return null;
  const academyClass = membership.classId;
  if (!classHasSchedule(academyClass)) return null;
  const todayKey = getKstDateKey(now);
  const sessions = [];
  for (let offset = 0; offset <= 7 && sessions.length < 2; offset += 1) {
    const candidateDateKey = addDaysToDateKey(todayKey, offset);
    if (!classRunsOnDate(academyClass, candidateDateKey)) continue;
    const session = await ensureAttendanceSessionForClassDate({
      academyClass,
      dateKey: candidateDateKey,
      actorUserId: academyClass.homeroomTeacherUserId || academyClass.createdByUserId,
      now,
    });
    if (session) sessions.push(session);
  }
  if (!sessions.length) return null;
  const currentOrNext = sessions.find((session) =>
    session.dateKey === todayKey && !["CLOSED", "CANCELED"].includes(sessionState(session, now))
  ) || sessions.find((session) => !["CLOSED", "CANCELED"].includes(sessionState(session, now))) || sessions[0];
  await finalizeAttendanceSession(currentOrNext, now);
  const [refreshedSession, attendance] = await Promise.all([
    AcademyAttendanceSession.findById(currentOrNext._id).lean(),
    AcademyAttendance.findOne({ sessionId: currentOrNext._id, studentUserId }).lean(),
  ]);
  const presentation = sessionPresentation(refreshedSession, now);
  return {
    academy: { id: String(membership.academyId._id), name: membership.academyId.name },
    academyClass: { id: String(academyClass._id), name: academyClass.name },
    session: presentation,
    attendance: attendance ? { status: attendance.status, checkedInAt: attendance.checkedInAt, source: attendance.source } : null,
    canCheckIn: presentation.attendanceMode === "SELF_CODE" && presentation.state === "OPEN" && !attendance,
    serverNow: now,
  };
}

async function checkInStudentAttendance({ studentUserId, sessionId, code, now = new Date() }) {
  const normalizedSessionId = normalizeOptionalObjectId(sessionId, "수업 회차");
  if (!normalizedSessionId) throw statusError(404, "출석할 수업을 찾을 수 없습니다.");
  const session = await AcademyAttendanceSession.findById(normalizedSessionId).lean();
  if (!session) throw statusError(404, "출석할 수업을 찾을 수 없습니다.");
  const membership = await AcademyStudentMembership.findOne({
    academyId: session.academyId,
    classId: session.classId,
    studentUserId,
    status: "APPROVED",
  }).lean();
  if (!membership) throw statusError(403, "이 수업 반에 소속된 승인 학생만 출석할 수 있습니다.");
  if (session.attendanceMode !== "SELF_CODE") throw statusError(409, "선생님이 직접 출결을 기록하는 수업입니다.");
  const state = sessionState(session, now);
  if (state === "SCHEDULED") throw statusError(409, "아직 출석 입력 시간이 아닙니다.", "ATTENDANCE_NOT_OPEN");
  if (state !== "OPEN") throw statusError(410, "출석 입력 시간이 종료되었습니다.", "ATTENDANCE_CLOSED");
  const existing = await AcademyAttendance.findOne({ sessionId: session._id, studentUserId }).lean();
  if (["MANUAL", "ADMIN"].includes(existing?.source)) {
    throw statusError(409, existing.source === "ADMIN"
      ? "운영자가 이미 출결 상태를 확정했습니다."
      : "선생님이 이미 출결 상태를 기록했습니다.");
  }
  if (existing && ["PRESENT", "LATE"].includes(existing.status)) {
    return { status: existing.status, checkedInAt: existing.checkedInAt, alreadyCheckedIn: true };
  }
  const attempt = await AcademyAttendanceCodeAttempt.findOne({ sessionId: session._id, studentUserId }).lean();
  if (Number(attempt?.failedAttempts || 0) >= MAX_CODE_ATTEMPTS) {
    throw statusError(429, "출석 코드 입력 횟수를 초과했습니다. 선생님에게 문의해 주세요.", "ATTENDANCE_CODE_LOCKED");
  }
  if (!/^\d{6}$/.test(String(code || "").trim()) || !codeMatches(session, code)) {
    const updatedAttempt = await AcademyAttendanceCodeAttempt.findOneAndUpdate(
      { sessionId: session._id, studentUserId },
      { $inc: { failedAttempts: 1 }, $set: { lastFailedAt: now }, $setOnInsert: { sessionId: session._id, studentUserId } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    if (updatedAttempt.failedAttempts >= MAX_CODE_ATTEMPTS) {
      await AcademyAttendanceCodeAttempt.updateOne({ _id: updatedAttempt._id }, { $set: { lockedAt: now } });
      throw statusError(429, "출석 코드 입력 횟수를 초과했습니다. 선생님에게 문의해 주세요.", "ATTENDANCE_CODE_LOCKED");
    }
    throw statusError(400, `출석 코드가 올바르지 않습니다. ${MAX_CODE_ATTEMPTS - updatedAttempt.failedAttempts}번 더 입력할 수 있습니다.`);
  }
  const status = now <= new Date(session.lateAfterAt) ? "PRESENT" : "LATE";
  const attendance = await AcademyAttendance.findOneAndUpdate(
    { sessionId: session._id, studentUserId },
    {
      $set: {
        academyId: session.academyId,
        classId: session.classId,
        sessionId: session._id,
        studentUserId,
        dateKey: session.dateKey,
        status,
        checkedInAt: now,
        checkedOutAt: null,
        note: "",
        recordedByUserId: studentUserId,
        source: "SELF_CODE",
        seedRunId: null,
      },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();
  await Promise.all([
    AcademyAttendanceCodeAttempt.deleteOne({ sessionId: session._id, studentUserId }),
    AcademyAttendanceAudit.create({
      academyId: session.academyId,
      classId: session.classId,
      sessionId: session._id,
      attendanceId: attendance._id,
      studentUserId,
      actorUserId: studentUserId,
      actorType: "STUDENT",
      action: existing ? "UPDATED" : "CREATED",
      previousStatus: existing?.status || null,
      nextStatus: status,
      note: "학생 코드 출결",
      occurredAt: now,
    }),
  ]);
  return { status, checkedInAt: now, alreadyCheckedIn: false };
}

module.exports = {
  checkInStudentAttendance,
  getAcademyAttendanceRoster,
  getStudentAttendanceDashboard,
  regenerateAttendanceSessionCode,
  saveAcademyAttendanceRoster,
  _private: {
    attendanceCodeForSession,
    classRunsOnDate,
    getKstDateKey,
    normalizeDateKey,
    sessionState,
  },
};

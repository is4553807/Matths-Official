"use strict";

const { AcademyAttendance } = require("../models/academyModel");
const {
  getAcademyAttendanceRoster,
  _private: { classRunsOnDate, normalizeDateKey },
} = require("./academyAttendanceService");

const STATUS_LABELS = { PRESENT: "출석", LATE: "지각", ABSENT: "결석", EXCUSED: "사유 결석" };
const SOURCE_LABELS = { MANUAL: "선생님 기록", SELF_CODE: "학생 코드", AUTO_ABSENT: "자동 결석", ADMIN: "관리자 기록", SEED: "테스트 기록" };
const GRADE_LABELS = { 10: "고1", 11: "고2", 12: "고3", 13: "N수생", 14: "대학생", 15: "직장인" };
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_RANGE_DAYS = 366;
const MAX_RANGE_CELLS = 250_000;
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function csvCell(value) {
  let text = String(value ?? "");
  // Quoting alone does not stop Excel from evaluating imported formulas.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatTime(value) {
  return value ? timeFormatter.format(new Date(value)) : "";
}

function dateKeyToUtcDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function inclusiveDateKeys(startDate, endDate) {
  const start = dateKeyToUtcDate(startDate);
  const end = dateKeyToUtcDate(endDate);
  if (start > end) {
    throw Object.assign(new Error("시작 날짜는 종료 날짜보다 늦을 수 없습니다."), { status: 400 });
  }
  const count = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (count > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`출결 다운로드 기간은 최대 ${MAX_RANGE_DAYS}일까지 선택할 수 있습니다.`), { status: 400 });
  }
  return Array.from({ length: count }, (_value, index) =>
    new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10)
  );
}

function rangeDateHeader(dateKey) {
  return `${dateKey} (${WEEKDAY_LABELS[dateKeyToUtcDate(dateKey).getUTCDay()]})`;
}

function rangeAttendanceCell(record) {
  if (!record) return "미기록";
  const label = STATUS_LABELS[record.status] || record.status;
  const checkedInTime = formatTime(record.checkedInAt);
  return checkedInTime ? `${label} ${checkedInTime}` : label;
}

function studentIdentity(item) {
  const student = item.membership.studentUserId;
  return [
    item.membership.classId?.name || "미배정",
    student.realName || student.name || "학생",
    GRADE_LABELS[student.schoolGrade] || "학년 미설정",
    student.school?.name || student.university?.name || "",
  ];
}

function recordsByStudentAndDate(records) {
  const byKey = new Map();
  for (const record of records) {
    byKey.set(`${record.studentUserId}:${record.dateKey}`, record);
  }
  return byKey;
}

function rangeRows({ roster, records, dateKeys }) {
  const recordsByKey = recordsByStudentAndDate(records);
  const summaryKeys = ["PRESENT", "LATE", "ABSENT", "EXCUSED", "UNRECORDED"];
  const dailyCounts = new Map(dateKeys.map((dateKey) => [
    dateKey,
    { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, UNRECORDED: 0 },
  ]));
  const rows = [[
    "반", "학생명", "학년", "학교",
    ...dateKeys.map(rangeDateHeader),
    "출석 합계", "지각 합계", "결석 합계", "사유 결석 합계", "미기록 합계", "기간 메모",
  ]];
  for (const item of roster) {
    const studentId = String(item.membership.studentUserId._id);
    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, UNRECORDED: 0 };
    const notes = [];
    const cells = dateKeys.map((dateKey) => {
      const record = recordsByKey.get(`${studentId}:${dateKey}`) || null;
      const status = record?.status || "UNRECORDED";
      counts[status] += 1;
      dailyCounts.get(dateKey)[status] += 1;
      if (record?.note) notes.push(`${dateKey}: ${String(record.note).replace(/\s+/g, " ").trim()}`);
      return rangeAttendanceCell(record);
    });
    rows.push([
      ...studentIdentity(item),
      ...cells,
      ...summaryKeys.map((key) => counts[key]),
      notes.join(" / "),
    ]);
  }
  const summaryLabels = {
    PRESENT: "날짜별 출석",
    LATE: "날짜별 지각",
    ABSENT: "날짜별 결석",
    EXCUSED: "날짜별 사유 결석",
    UNRECORDED: "날짜별 미기록",
  };
  for (const key of summaryKeys) {
    rows.push([
      summaryLabels[key], "", "", "",
      ...dateKeys.map((dateKey) => dailyCounts.get(dateKey)[key]),
      ...summaryKeys.map((summaryKey) => summaryKey === key
        ? dateKeys.reduce((total, dateKey) => total + dailyCounts.get(dateKey)[key], 0)
        : ""),
      "",
    ]);
  }
  return rows;
}

async function getAcademyAttendanceRangeCsv({ teacherUserId, startDate, endDate, classId }) {
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedEndDate = normalizeDateKey(endDate);
  const requestedDateKeys = inclusiveDateKeys(normalizedStartDate, normalizedEndDate);
  const roster = await getAcademyAttendanceRoster({
    teacherUserId,
    dateKey: normalizedEndDate,
    classId,
    readOnly: true,
    rosterLimit: 10001,
    includeCode: false,
  });
  if (roster.truncated) {
    throw Object.assign(new Error("출결표가 너무 큽니다. 반을 선택해 다시 다운로드해 주세요."), { status: 413 });
  }
  if (roster.roster.length * requestedDateKeys.length > MAX_RANGE_CELLS) {
    throw Object.assign(new Error("선택한 기간의 출결표가 너무 큽니다. 기간을 줄여 다시 다운로드해 주세요."), { status: 413 });
  }
  const studentUserIds = roster.roster.map((item) => item.membership.studentUserId._id);
  const records = studentUserIds.length && roster.selectedClass
    ? await AcademyAttendance.find({
        academyId: roster.selectedClass.academyId,
        classId: roster.selectedClass._id,
        studentUserId: { $in: studentUserIds },
        dateKey: { $gte: normalizedStartDate, $lte: normalizedEndDate },
      }).sort({ updatedAt: 1, _id: 1 }).lean()
    : [];
  const recordedDateKeys = new Set(records.map((record) => record.dateKey));
  const hasConfiguredSchedule = Boolean(
    roster.selectedClass?.schedule?.weekdays?.length &&
    roster.selectedClass.schedule.startTime &&
    roster.selectedClass.schedule.endTime &&
    roster.selectedClass.schedule.effectiveFrom
  );
  const dateKeys = hasConfiguredSchedule
    ? requestedDateKeys.filter((dateKey) => classRunsOnDate(roster.selectedClass, dateKey) || recordedDateKeys.has(dateKey))
    : requestedDateKeys;
  const rows = rangeRows({ roster: roster.roster, records, dateKeys });
  return {
    filename: `matths-attendance-${normalizedStartDate}-to-${normalizedEndDate}.csv`,
    csv: "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
  };
}

async function getAcademyAttendanceCsv({ teacherUserId, dateKey, startDate, endDate, classId }) {
  if (startDate || endDate) {
    if (!startDate || !endDate) {
      throw Object.assign(new Error("시작 날짜와 종료 날짜를 모두 선택해 주세요."), { status: 400 });
    }
    return getAcademyAttendanceRangeCsv({
      teacherUserId,
      startDate,
      endDate,
      classId,
    });
  }
  // Use the same academy/class/teacher scope as the visible roster, but never
  // create sessions or finalize absences just because a CSV was downloaded.
  const roster = await getAcademyAttendanceRoster({
    teacherUserId, dateKey, classId, readOnly: true, rosterLimit: 10001, includeCode: false,
  });
  if (roster.truncated) {
    throw Object.assign(new Error("출결표가 너무 큽니다. 반을 선택해 다시 다운로드해 주세요."), { status: 413 });
  }
  const rows = [["출결 날짜", "반", "학생명", "학년", "학교", "출결 상태", "체크인 시각 (한국시간)", "기록 출처", "메모"]];
  for (const item of roster.roster) {
    const student = item.membership.studentUserId;
    const record = item.attendance;
    rows.push([
      roster.dateKey,
      item.membership.classId?.name || "미배정",
      student.realName || student.name || "학생",
      GRADE_LABELS[student.schoolGrade] || "학년 미설정",
      student.school?.name || student.university?.name || "",
      record ? STATUS_LABELS[record.status] || record.status : "미기록",
      formatTime(record?.checkedInAt),
      record ? SOURCE_LABELS[record.source] || record.source || "" : "",
      record?.note || "",
    ]);
  }
  return {
    filename: `matths-attendance-${roster.dateKey}.csv`,
    csv: "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
  };
}

module.exports = { getAcademyAttendanceCsv, csvCell };

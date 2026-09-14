"use strict";

const { getAcademyAttendanceRoster } = require("./academyAttendanceService");

const STATUS_LABELS = { PRESENT: "출석", LATE: "지각", ABSENT: "결석", EXCUSED: "사유 결석" };
const SOURCE_LABELS = { MANUAL: "선생님 기록", SELF_CODE: "학생 코드", AUTO_ABSENT: "자동 결석", ADMIN: "관리자 기록", SEED: "테스트 기록" };
const GRADE_LABELS = { 10: "고1", 11: "고2", 12: "고3", 13: "N수생", 14: "대학생", 15: "직장인" };
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function csvCell(value) {
  let text = String(value ?? "");
  // Quoting alone does not stop Excel from evaluating imported formulas.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatTime(value) {
  return value ? timeFormatter.format(new Date(value)) : "";
}

async function getAcademyAttendanceCsv({ teacherUserId, dateKey, classId }) {
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

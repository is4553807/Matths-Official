const { createHash } = require("node:crypto");
const mongoose = require("mongoose");

function conflict() {
  return Object.assign(new Error("다른 작업자가 출결을 변경했습니다. 최신 기록을 불러온 뒤 초안을 확인해주세요."),
    { status: 409, code: "ATTENDANCE_WRITE_CONFLICT" });
}
function invalid() {
  return Object.assign(new Error("출결의 이전 상태 확인 정보가 올바르지 않습니다."),
    { status: 400, code: "ATTENDANCE_EXPECTED_STATE_INVALID" });
}
function normalizedExpectedStates(states, count) {
  if (states === undefined) return null;
  if (!Array.isArray(states) || states.length !== count) throw invalid();
  return states.map((state) => {
    if (!state || typeof state !== "object" || Array.isArray(state) ||
        Object.keys(state).some((key) => !["recordId", "updatedAt", "status", "note"].includes(key)) ||
        !["recordId", "updatedAt", "status", "note"].every((key) => Object.hasOwn(state, key)) ||
        typeof state.note !== "string" || state.note.length > 200) throw invalid();
    if (state.recordId === null) {
      if (state.status !== null || state.updatedAt !== null || state.note !== "") throw invalid();
      return { recordId: null, updatedAt: null, status: null, note: "" };
    }
    if (typeof state.recordId !== "string" || !/^[a-f0-9]{24}$/i.test(state.recordId) ||
        !["PRESENT", "LATE", "ABSENT", "EXCUSED"].includes(state.status)) throw invalid();
    let updatedAt = null;
    if (state.updatedAt !== null) {
      if (typeof state.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(state.updatedAt)) throw invalid();
      updatedAt = new Date(state.updatedAt);
      if (!Number.isFinite(updatedAt.getTime()) || updatedAt.toISOString().slice(0, 19) !== state.updatedAt.slice(0, 19)) throw invalid();
    }
    return { recordId: state.recordId.toLowerCase(), updatedAt, status: state.status, note: state.note };
  });
}
function assertExpectedAttendance(record, expected) {
  if (!record) { if (expected.recordId !== null) throw conflict(); return; }
  const updated = record.updatedAt ? new Date(record.updatedAt).getTime() : null;
  if (String(record._id) !== expected.recordId || record.status !== expected.status ||
      String(record.note || "") !== expected.note || updated !== (expected.updatedAt?.getTime() ?? null)) throw conflict();
}
function expectedAttendanceFilter(base, expected) {
  return { ...base, _id: new mongoose.Types.ObjectId(expected.recordId),
    updatedAt: expected.updatedAt ?? null, status: expected.status,
    note: expected.note === "" ? { $in: ["", null] } : expected.note };
}
function attendanceDocumentId(base) {
  // Existing IDs are never rewritten. New legacy/no-session rows otherwise had
  // no unique logical-row constraint; deterministic _id makes concurrent inserts
  // (including old keyless service calls) collide on Mongo's built-in unique ID.
  const logicalKey = [String(base.academyId), String(base.studentUserId), String(base.sessionId || ""),
    String(base.classId || ""), String(base.dateKey || "")];
  return new mongoose.Types.ObjectId(createHash("sha256").update(JSON.stringify(logicalKey)).digest("hex").slice(0, 24));
}
module.exports = { assertExpectedAttendance, attendanceDocumentId, expectedAttendanceFilter,
  normalizedExpectedStates, attendanceWriteConflict: conflict };

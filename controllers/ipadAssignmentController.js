const { submitAcademyAssignment } = require("../services/academyClassworkService");
const { assertTeacherAccount, getAcademyClassDetail } = require("../services/academyService");

async function requireTeacher(req, _res, next) {
  try {
    await assertTeacherAccount(req.apiUser?._id);
    return next();
  } catch (error) { return next(error); }
}

async function assertTeacherClassworkAccess(req) {
  await assertTeacherAccount(req.apiUser._id);
  // Recheck current staff/class assignment after the awaited query. A returned
  // answer key must not outlive either the teacher role or the class permission.
  await getAcademyClassDetail({ teacherUserId: req.apiUser._id, classId: req.params.classId });
}

function identifier(value) {
  if (value === undefined || value === null) return null;
  if (typeof value.toHexString === "function") return value.toHexString();
  return String(value._id || (typeof value.id === "string" ? value.id : value));
}

function serializeAssignmentOmr(omr, { includeAnswerKey = false } = {}) {
  if (!omr?.enabled) return null;
  const value = {
    enabled: true,
    questionCount: Number(omr.questionCount),
    sections: (omr.sections || []).map((section) => ({
      startNumber: Number(section.startNumber), endNumber: Number(section.endNumber),
      answerType: String(section.answerType), choiceCount: Number(section.choiceCount || 5),
    })),
    questions: (omr.questions || []).map((question) => ({
      number: Number(question.number), answerType: String(question.answerType),
      choiceCount: Number(question.choiceCount || 5), answer: String(question.answer || ""),
    })),
    configuredAt: omr.configuredAt || null,
    missedSubmissionsFinalizedAt: omr.missedSubmissionsFinalizedAt || null,
  };
  // Explicit opt-in by the authorized teacher serializer. Never spread the
  // source object: a future service change must not leak the answer key.
  if (includeAnswerKey && Array.isArray(omr.answerKey)) value.answerKey = omr.answerKey.map(String);
  return value;
}

function serializeAssignmentSubmission(submission, { includeStudent = false } = {}) {
  if (!submission) return null;
  const value = {
    id: identifier(submission), weekId: identifier(submission.weekId),
    answers: (submission.answers || []).map(String), answerModes: (submission.answerModes || []).map(String),
    answeredCount: Number(submission.answeredCount || 0),
    correctByQuestion: (submission.correctByQuestion || []).map((correct) => correct === true),
    correctCount: Number(submission.correctCount || 0), questionCount: Number(submission.questionCount),
    scorePercent: Number(submission.scorePercent || 0), status: String(submission.status),
    submittedAt: submission.submittedAt || null, gradedAt: submission.gradedAt || null,
    autoZeroedAt: submission.autoZeroedAt || null, answerKeyConfiguredAt: submission.answerKeyConfiguredAt || null,
  };
  if (includeStudent && submission.studentUserId) {
    const student = submission.studentUserId;
    value.student = { id: identifier(student), name: String(student.name || student.realName || "학생"), email: String(student.email || "") };
  }
  return value;
}

async function submit(req, res, next) {
  try {
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length < 1 || answers.length > 100 ||
        answers.some((answer) => typeof answer !== "string" || answer.length > 80)) {
      const error = new Error("답안을 1~100개 문자열로 입력해 주세요. 문항별 답안은 80자까지 가능합니다.");
      error.status = 400; error.code = "ACADEMY_ASSIGNMENT_ANSWERS_INVALID";
      throw error;
    }
    // The same service as the web owns membership, deadlines, grading,
    // repeat submissions and the unique week/student result.
    const submission = await submitAcademyAssignment({
      studentUserId: req.apiUser._id, weekId: req.params.weekId, answers,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ schemaVersion: "ACADEMY_ASSIGNMENT_V1", submission: serializeAssignmentSubmission(submission) });
  } catch (error) { return next(error); }
}

module.exports = { submit, requireTeacher, assertTeacherClassworkAccess, serializeAssignmentOmr, serializeAssignmentSubmission };

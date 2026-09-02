const mongoose = require("mongoose");
const {
  PrivateMockExam,
  PrivateMockExamAttempt,
} = require("../models/matthsModel");
const {
  AcademyClass,
  AcademyStudentMembership,
} = require("../models/academyModel");

const DEFAULT_EXAM_LIMIT = 36;

function objectIds(values) {
  return [...new Set((values || []).map(String))]
    .filter((value) => mongoose.isValidObjectId(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

function emptyInsight(scopeLabel = "전체") {
  return {
    scopeLabel,
    examCount: 0,
    participantCount: 0,
    submissionCount: 0,
    averageScore: null,
    conceptCount: 0,
    concepts: [],
    hardestConcept: null,
    generatedAt: new Date(),
  };
}

function conceptKey(concept) {
  return [
    concept.courseTitle || "",
    concept.unitTitle || "",
    concept.conceptId || concept.conceptTitle,
  ].join("::");
}

function difficultyState(difficulty) {
  if (difficulty >= 70) return { code: "VERY_HARD", label: "집중 보완", level: 5 };
  if (difficulty >= 50) return { code: "HARD", label: "어려움", level: 4 };
  if (difficulty >= 30) return { code: "WATCH", label: "확인 필요", level: 3 };
  if (difficulty >= 15) return { code: "GOOD", label: "대체로 안정", level: 2 };
  return { code: "STRONG", label: "안정", level: 1 };
}

async function recentConceptExams(now = new Date()) {
  const exams = await PrivateMockExam.find({
    isTest: { $ne: true },
    status: { $nin: ["cancelled", "pending-review"] },
    releaseAt: { $lte: now },
  })
    .select("title weekKey releaseAt questionCount questionConcepts +explanations")
    .sort({ releaseAt: -1, _id: -1 })
    .limit(DEFAULT_EXAM_LIMIT)
    .lean();
  return exams
    .map((exam) => {
      if (exam.questionConcepts?.some((concept) => concept?.conceptTitle)) return exam;
      const fallbackConcepts = (exam.explanations || []).map((explanation, index) => {
        const conceptTitle = String(explanation?.concept || "").replace(/\s+/g, " ").trim().slice(0, 180);
        if (!conceptTitle) return null;
        return {
          conceptId: conceptTitle
            .normalize("NFKC")
            .toLocaleLowerCase("ko-KR")
            .replace(/[^0-9a-z가-힣]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 140) || `legacy-question-${index + 1}`,
          conceptTitle,
          courseTitle: "",
          unitTitle: "",
        };
      });
      return { ...exam, questionConcepts: fallbackConcepts };
    })
    .filter((exam) => exam.questionConcepts?.some((concept) => concept?.conceptTitle));
}

async function getWeeklyMockInsights({
  studentUserIds,
  scopeLabel = "전체",
  exams: suppliedExams,
  now = new Date(),
} = {}) {
  const scopedUserIds = studentUserIds === undefined ? null : objectIds(studentUserIds);
  if (scopedUserIds && !scopedUserIds.length) return emptyInsight(scopeLabel);
  const exams = suppliedExams || await recentConceptExams(now);
  if (!exams.length) return emptyInsight(scopeLabel);
  const examIds = exams.map((exam) => exam._id);
  const match = {
    examId: { $in: examIds },
    status: "submitted",
    $and: [
      {
        $or: [
          { integrityStatus: { $exists: false } },
          { integrityStatus: { $in: ["NOT_REVIEWED", "CLEAR"] } },
        ],
      },
      { "submissionFinalization.status": { $nin: ["pending", "processing"] } },
    ],
  };
  if (scopedUserIds) match.userId = { $in: scopedUserIds };

  const [questionRows, summaryRows] = await Promise.all([
    PrivateMockExamAttempt.aggregate([
      { $match: match },
      { $project: { examId: 1, correctByQuestion: 1 } },
      { $unwind: { path: "$correctByQuestion", includeArrayIndex: "questionIndex" } },
      {
        $group: {
          _id: { examId: "$examId", questionIndex: "$questionIndex" },
          responseCount: { $sum: 1 },
          correctCount: { $sum: { $cond: ["$correctByQuestion", 1, 0] } },
        },
      },
    ]),
    PrivateMockExamAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          participantIds: { $addToSet: "$userId" },
          submissionCount: { $sum: 1 },
          averageScore: { $avg: "$score" },
        },
      },
      {
        $project: {
          _id: 0,
          participantCount: { $size: "$participantIds" },
          submissionCount: 1,
          averageScore: 1,
        },
      },
    ]),
  ]);

  const examById = new Map(exams.map((exam) => [String(exam._id), exam]));
  const conceptStats = new Map();
  questionRows.forEach((row) => {
    const exam = examById.get(String(row._id.examId));
    const questionIndex = Number(row._id.questionIndex);
    const concept = exam?.questionConcepts?.[questionIndex];
    if (!concept?.conceptTitle) return;
    const key = conceptKey(concept);
    const current = conceptStats.get(key) || {
      conceptId: concept.conceptId,
      conceptTitle: concept.conceptTitle,
      courseTitle: concept.courseTitle || "",
      unitTitle: concept.unitTitle || "",
      responseCount: 0,
      correctCount: 0,
      questionCount: 0,
      examIds: new Set(),
    };
    current.responseCount += Number(row.responseCount || 0);
    current.correctCount += Number(row.correctCount || 0);
    current.questionCount += 1;
    current.examIds.add(String(exam._id));
    conceptStats.set(key, current);
  });

  const concepts = [...conceptStats.values()]
    .map((concept) => {
      const accuracy = concept.responseCount
        ? Math.round((concept.correctCount / concept.responseCount) * 100)
        : 0;
      const difficulty = 100 - accuracy;
      return {
        conceptId: concept.conceptId,
        conceptTitle: concept.conceptTitle,
        courseTitle: concept.courseTitle,
        unitTitle: concept.unitTitle,
        responseCount: concept.responseCount,
        correctCount: concept.correctCount,
        questionCount: concept.questionCount,
        examCount: concept.examIds.size,
        accuracy,
        difficulty,
        ...difficultyState(difficulty),
      };
    })
    .sort((left, right) => right.difficulty - left.difficulty || right.responseCount - left.responseCount || left.conceptTitle.localeCompare(right.conceptTitle, "ko"));
  const summary = summaryRows[0] || {};
  const analyzedExamCount = new Set(questionRows.map((row) => String(row._id.examId))).size;
  return {
    scopeLabel,
    examCount: analyzedExamCount,
    participantCount: Number(summary.participantCount || 0),
    submissionCount: Number(summary.submissionCount || 0),
    averageScore: Number.isFinite(Number(summary.averageScore)) ? Math.round(Number(summary.averageScore) * 10) / 10 : null,
    conceptCount: concepts.length,
    concepts,
    hardestConcept: concepts[0] || null,
    generatedAt: now,
  };
}

async function getAcademyWeeklyMockInsights({ academyId, now = new Date() }) {
  if (!mongoose.isValidObjectId(academyId)) return { overall: emptyInsight("학원 전체"), classes: [] };
  const [classes, memberships, exams] = await Promise.all([
    AcademyClass.find({ academyId }).sort({ isActive: -1, name: 1 }).select("name isActive").lean(),
    AcademyStudentMembership.find({ academyId, status: "APPROVED" }).select("studentUserId classId").lean(),
    recentConceptExams(now),
  ]);
  const allStudentIds = memberships.map((membership) => membership.studentUserId);
  const [overall, classInsights] = await Promise.all([
    getWeeklyMockInsights({ studentUserIds: allStudentIds, scopeLabel: "학원 전체", exams, now }),
    Promise.all(classes.map(async (academyClass) => {
      const studentIds = memberships
        .filter((membership) => String(membership.classId || "") === String(academyClass._id))
        .map((membership) => membership.studentUserId);
      return {
        classId: String(academyClass._id),
        className: academyClass.name,
        isActive: academyClass.isActive,
        studentCount: studentIds.length,
        insight: await getWeeklyMockInsights({
          studentUserIds: studentIds,
          scopeLabel: academyClass.name,
          exams,
          now,
        }),
      };
    })),
  ]);
  return { overall, classes: await classInsights };
}

module.exports = {
  DEFAULT_EXAM_LIMIT,
  difficultyState,
  emptyInsight,
  getAcademyWeeklyMockInsights,
  getWeeklyMockInsights,
};

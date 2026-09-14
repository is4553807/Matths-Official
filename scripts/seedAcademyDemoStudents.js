"use strict";

// Exactly 20 synthetic students. No broad cleanup, payments, real rankings,
// external messages, or modification of existing users/classes/exam metadata.
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const models = require("../models/matthsModel");
const academyModels = require("../models/academyModel");
const {
  buildClassWeekOperations,
  buildMathMapProblemCatalog,
  MATH_MAP_CONCEPTS,
  createSeededRandom,
} = require("./seedAcademyStatisticsDummyData");
const {
  _private: { resolvePeriod },
  getStudentMonthlyStatistics,
} = require("../services/academyStatisticsService");
const { getStudentMathMaps } = require("../services/mathMapService");
const {
  getAcademyWeeklyMockInsights,
  getWeeklyMockInsights,
} = require("../services/weeklyMockInsightService");

const COUNT = 20;
const CONFIRMATION = "SEED_20_ACADEMY_DEMO_STUDENTS";
const DAY = 86400000;
const NORMAL_QUANTILES = [
  -1.96, -1.44, -1.15, -0.93, -0.76, -0.6, -0.45, -0.32, -0.19, -0.06, 0.06,
  0.19, 0.32, 0.45, 0.6, 0.76, 0.93, 1.15, 1.44, 1.96,
];
const SCALE = Math.sqrt(
  NORMAL_QUANTILES.reduce((sum, z) => sum + z * z, 0) / COUNT,
);
const zAt = (index) => NORMAL_QUANTILES[index % COUNT] / SCALE;
const clamp = (number, low, high) => Math.max(low, Math.min(high, number));
const idFor = (key) =>
  new mongoose.Types.ObjectId(
    crypto.createHash("sha256").update(key).digest("hex").slice(0, 24),
  );
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const suffix = (key) =>
  crypto.createHash("sha256").update(key).digest("hex").slice(0, 10);
function shuffle(values, random) {
  for (let index = values.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}
const MODEL_MAP = {
  users: models.User,
  memberships: academyModels.AcademyStudentMembership,
  classes: academyModels.AcademyClass,
  weeks: academyModels.AcademyClassWeek,
  submissions: academyModels.AcademyAssignmentSubmission,
  problems: models.Problem,
  attempts: models.ProblemAttempt,
  progress: models.ConceptProgress,
  events: models.LearningEvent,
  attendance: academyModels.AcademyAttendance,
  sessions: academyModels.AcademyAttendanceSession,
  audits: academyModels.AcademyAttendanceAudit,
  mockAttempts: models.PrivateMockExamAttempt,
};

async function resolveTarget(academyId, now, { allowPaused = false } = {}) {
  if (!mongoose.isValidObjectId(academyId))
    throw new Error("정확한 --academy-id가 필요합니다.");
  const academy = await academyModels.Academy.findById(academyId).lean();
  if (
    !academy ||
    !(
      academy.status === "ACTIVE" ||
      (allowPaused && academy.status === "PAUSED")
    )
  )
    throw new Error(
      "활성 학원을 지정해주세요. 일시정지 학원은 임의로 활성화하지 않습니다.",
    );
  if (academy.contractEndsAt && +new Date(academy.contractEndsAt) <= +now)
    throw new Error(
      "학원 계약이 만료되어 있습니다. 계약 기간은 임의로 연장하지 않습니다.",
    );
  const staff = await academyModels.AcademyStaff.findOne({
    academyId,
    role: "OWNER",
    status: "ACTIVE",
  }).lean();
  if (
    !staff ||
    !(await models.User.exists({
      _id: staff.userId,
      role: { $in: ["teacher", "admin"] },
      isActive: { $ne: false },
    }))
  )
    throw new Error("활성 학원 운영자 연결이 필요합니다.");
  // Reuse an already settled CUSTOM's real paper/answer/concept metadata.
  // The synthetic attempt marker keeps these rows out of official heatmaps.
  const exam = await models.PrivateMockExam.findOne({
    isTest: true,
    formCode: "CUSTOM",
    closeAt: { $lte: now },
    settlementCompletedAt: { $ne: null },
    "questionConcepts.0": { $exists: true },
  })
    .select("+answerKey +points")
    .sort({ releaseAt: -1 })
    .lean();
  if (
    !exam ||
    exam.questionCount < 1 ||
    exam.questionConcepts.length !== exam.questionCount ||
    exam.answerKey.length !== exam.questionCount ||
    exam.points.length !== exam.questionCount ||
    !(await models.ArchiveItem.exists({
      _id: exam.archiveItemId,
      deletedAt: null,
    }))
  )
    throw new Error(
      "문제지·정답·문항별 개념이 연결된 정산 완료 CUSTOM 회차가 필요합니다.",
    );
  return { academy, staff, exam };
}

function activityDates(period, count, random) {
  const end = Math.min(
    period.reportCutoff.getTime() - 3600000,
    period.end?.getTime?.() || Infinity,
  );
  const available = Math.max(
    1,
    Math.floor((end - period.start.getTime()) / DAY) + 1,
  );
  const days = shuffle(
    Array.from({ length: available }, (_, index) => index),
    random,
  )
    .slice(0, Math.min(available, count))
    .sort((a, b) => a - b);
  return days.map(
    (index) =>
      new Date(
        Math.min(end, period.start.getTime() + index * DAY + 10 * 3600000),
      ),
  );
}

async function buildPlan({ academy, staff, exam, now = new Date(), password }) {
  const batchKey = `academy-demo-20:${academy._id}:v1`;
  const batchSuffix = suffix(batchKey);
  const passwordHash = await bcrypt.hash(password, 12);
  const records = Object.fromEntries(
    Object.keys(MODEL_MAP).map((key) => [key, []]),
  );
  const profiles = [];
  const periods = resolvePeriod("", now).options.map((option) =>
    resolvePeriod(option.key, now),
  );
  for (let index = 0; index < 2; index++)
    records.classes.push({
      _id: idFor(`${batchKey}:class:${index}`),
      academyId: academy._id,
      name: `[데모] 고${index + 2} ${index ? "B" : "A"}반`,
      nameNormalized: `[데모] 고${index + 2} ${index ? "b" : "a"}반`,
      isActive: true,
      createdByUserId: staff.userId,
      homeroomTeacherUserId: staff.userId,
      schedule: {
        weekdays: [1, 3, 5],
        startTime: "18:00",
        endTime: "20:00",
        effectiveFrom: dayKey(new Date(now - 45 * DAY)),
        timezone: "Asia/Seoul",
      },
    });
  for (const operation of buildClassWeekOperations({
    academy,
    activeClasses: records.classes,
    now,
  })) {
    const data = {
      ...operation.updateOne.filter,
      ...operation.updateOne.update.$setOnInsert,
    };
    const weekIndex = data.weekNumber - 1;
    const publishedAt = new Date(now - (28 - weekIndex * 7) * DAY);
    const dueAt = new Date(now - (23 - weekIndex * 7) * DAY);
    records.weeks.push({
      ...data,
      _id: idFor(`${batchKey}:week:${data.classId}:${data.weekNumber}`),
      title: `[데모] ${data.title}`,
      lessonSummary: data.lessonSummary.replace(
        "[academy-metrics-v2]",
        "[데모]",
      ),
      publishedAt,
      dueAt,
      assignmentOmr: {
        enabled: true,
        questionCount: 20,
        sections: [
          {
            startNumber: 1,
            endNumber: 15,
            answerType: "MULTIPLE_CHOICE",
            choiceCount: 5,
          },
          {
            startNumber: 16,
            endNumber: 20,
            answerType: "SHORT_ANSWER",
            choiceCount: 5,
          },
        ],
        answerKey: Array.from({ length: 20 }, (_, q) =>
          q < 15 ? String((q % 5) + 1) : String(q + 1),
        ),
        configuredAt: publishedAt,
        configuredByUserId: staff.userId,
        missedSubmissionsFinalizedAt: dueAt,
      },
    });
  }
  const problemPools = buildMathMapProblemCatalog().pools;
  problemPools.forEach((pool, conceptIndex) =>
    pool.problems.forEach((problem, index) => {
      const n = index + 2;
      const templates = [
        [
          `함수 f(x)=(x-${n})²이 최솟값을 갖는 x의 값을 구하시오.`,
          n,
          `f'(x)=2(x-${n})이므로 x=${n}에서 감소에서 증가로 바뀝니다.`,
        ],
        [
          `함수 y=(x-${n})²의 그래프에서 꼭짓점의 x좌표를 구하시오.`,
          n,
          `평행이동한 포물선의 꼭짓점은 (${n}, 0)입니다.`,
        ],
        [
          `함수 f(x)=${n}x²에 대하여 f'(1)의 값을 구하시오.`,
          2 * n,
          `f'(x)=${2 * n}x이므로 f'(1)=${2 * n}입니다.`,
        ],
        [
          `함수 f(x)=x²-${2 * n}x가 증가하는 구간은 x>a이다. a를 구하시오.`,
          n,
          `f'(x)=2x-${2 * n}>0을 풀면 x>${n}입니다.`,
        ],
      ];
      const [stem, answer, solution] = templates[conceptIndex];
      const correctChoice = index % 5;
      records.problems.push({
        ...problem,
        _id: idFor(`${batchKey}:problem:${problem.externalId}`),
        externalId: `${batchKey}:${problem.primaryConceptId}:${index}`,
        stem: `[데모] ${stem}`,
        correctAnswer:
          problem.questionType === "multiple-choice"
            ? String(correctChoice + 1)
            : String(answer),
        choices:
          problem.questionType === "multiple-choice"
            ? Array.from({ length: 5 }, (_, choice) => ({
                key: String(choice + 1),
                text: String(answer + choice - correctChoice),
              }))
            : [],
        solutionSteps: [{ step: 1, title: "해설", explanation: solution }],
        source: { type: "custom" },
        tags: ["academy-demo", batchKey, `math-map-type-${(index % 4) + 1}`],
      });
    }),
  );
  const names = [
    "김민준",
    "이서연",
    "박도윤",
    "최서윤",
    "정시우",
    "강하준",
    "조지우",
    "윤지호",
    "장예준",
    "임수빈",
    "한지민",
    "오지안",
    "서현우",
    "신유진",
    "권서준",
    "황채원",
    "안건우",
    "송지원",
    "류태윤",
    "홍수아",
  ];
  for (let index = 0; index < COUNT; index++) {
    const userId = idFor(`${batchKey}:student:${index}`),
      classData = records.classes[index < 10 ? 0 : 1];
    const random = createSeededRandom(`${batchKey}:student:${index}`);
    const ability = 0.7 + 0.12 * zAt((index * 7) % COUNT);
    const engagement = clamp(
      0.72 + 0.15 * zAt((index * 3 + 5) % COUNT),
      0.35,
      0.98,
    );
    const address = `demo-${batchSuffix}-${String(index + 1).padStart(2, "0")}@academy-demo.invalid`;
    const user = {
      _id: userId,
      name: `데모${String(index + 1).padStart(2, "0")}-${batchSuffix}`,
      realName: `${names[index]} (데모)`,
      email: address,
      passwordHash,
      role: "student",
      isTestAccount: true,
      testBatchKey: batchKey,
      isActive: true,
      accountStatus: "active",
      birthDate: new Date(
        `${index < 10 ? 2009 : 2008}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}T00:00:00Z`,
      ),
      schoolGrade: index < 10 ? 11 : 12,
      learnerType: "HIGH_SCHOOL",
      lastGradePromotionYear: Number(dayKey(now).slice(0, 4)),
      termsAcceptedAt: new Date(now - 45 * DAY),
      termsVersion: "2026-08-13",
      privacyVersion: "2026-08-13",
      emailVerifiedAt: now,
      lastLoginAt: now,
      totalConnectedSeconds: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
    };
    records.users.push(user);
    records.memberships.push({
      _id: idFor(`${batchKey}:membership:${index}`),
      academyId: academy._id,
      classId: classData._id,
      studentUserId: userId,
      activeStudentKey: String(userId),
      status: "APPROVED",
      joinSource: "ADMIN_ASSIGNMENT",
      requestedAt: new Date(now - 45 * DAY),
      dataConsentAt: new Date(now - 45 * DAY),
      reviewedAt: new Date(now - 45 * DAY),
      approvedAt: new Date(now - 45 * DAY),
      reviewedByUserId: staff.userId,
    });
    const allActivityDates = [];
    const reviewChance = clamp(
      0.6 + 0.17 * zAt((index * 9 + 2) % COUNT),
      0.2,
      0.95,
    );
    periods.forEach((period, periodIndex) => {
      const elapsed = Math.max(
        1,
        Math.ceil((period.reportCutoff - period.start) / DAY),
      );
      const dates = activityDates(
        period,
        Math.max(3, Math.round(elapsed * engagement)),
        random,
      );
      allActivityDates.push(...dates);
      dates.forEach((occurredAt, day) =>
        records.events.push({
          _id: idFor(`${batchKey}:event:${index}:${period.key}:${day}`),
          userId,
          clientEventId: `${batchKey}:${index}:${period.key}:${day}`,
          sessionId: `${batchKey}:${index}:${period.key}:${day}`,
          eventType: "problem-attempted",
          curriculumId: "kr-2022",
          courseId: "calculus-1",
          unitId: "calculus-1-02",
          conceptId: MATH_MAP_CONCEPTS[day % 4].conceptId,
          durationMs:
            Math.round(clamp(40 + 12 * zAt((index + day) % COUNT), 15, 75)) *
            60000,
          metadata: { demoBatchKey: batchKey, academyId: String(academy._id) },
          occurredAt,
        }),
      );
      MATH_MAP_CONCEPTS.forEach((concept, conceptIndex) => {
        const problems = records.problems
          .filter((problem) => problem.primaryConceptId === concept.conceptId)
          .slice(periodIndex * 10, periodIndex * 10 + 10);
        const targetAccuracy = clamp(
          ability +
            0.13 * Math.cos(index + conceptIndex * 1.8) +
            (periodIndex ? -0.06 : 0.025),
          0.15,
          0.97,
        );
        const correctness = shuffle(
          Array.from(
            { length: 10 },
            (_, q) => q < Math.min(9, Math.round(targetAccuracy * 10)),
          ),
          random,
        );
        problems.forEach((problem, question) => {
          const correct = correctness[question],
            submittedAt = dates[question % dates.length];
          const reviewed =
            !correct &&
            (question === correctness.indexOf(false) ||
              random() < reviewChance);
          const reviewedAt = reviewed
            ? new Date(
                Math.min(period.reportCutoff - 1, +submittedAt + 15 * 60000),
              )
            : null;
          const attemptId = idFor(
            `${batchKey}:attempt:${index}:${periodIndex}:${conceptIndex}:${question}`,
          );
          const wrongAnswer =
            problem.questionType === "multiple-choice"
              ? String((Number(problem.correctAnswer) % 5) + 1)
              : "999";
          const attempt = {
            _id: attemptId,
            userId,
            problemId: problem._id,
            curriculumId: problem.curriculumId,
            courseId: problem.courseId,
            unitId: problem.unitId,
            conceptId: concept.conceptId,
            attemptNumber: 1,
            submittedAnswer: correct ? problem.correctAnswer : wrongAnswer,
            isCorrect: correct,
            score: correct ? 1 : 0,
            maxScore: 1,
            responseTimeMs:
              Math.round(clamp(90 - ability * 60 + random() * 35, 15, 130)) *
              1000,
            hintsUsed: correct ? 0 : question % 3,
            problemSnapshot: {
              typeId: `demo-type-${question % 4}`,
              stem: problem.stem,
              choices: problem.choices,
              solution: problem.solutionSteps[0].explanation,
              difficulty: problem.difficulty,
            },
            errorAnalysis: {
              modelVersion: batchKey,
              relatedConceptId: concept.conceptId,
            },
            review: {
              status: correct
                ? "not-required"
                : reviewed
                  ? "completed"
                  : "pending",
              scheduledAt: correct
                ? null
                : new Date(
                    Math.min(period.reportCutoff - 1, +submittedAt + 60000),
                  ),
              reviewedAt,
              correctedAfterReview: false,
            },
            submittedAt,
          };
          records.attempts.push(attempt);
          if (reviewed) {
            const retryCorrect =
              question === correctness.indexOf(false) ||
              random() < clamp(ability + 0.12, 0.25, 0.98);
            records.attempts.push({
              ...attempt,
              _id: idFor(`${attemptId}:retry`),
              reviewSourceAttemptId: attemptId,
              attemptNumber: 2,
              submittedAnswer: retryCorrect
                ? problem.correctAnswer
                : wrongAnswer,
              isCorrect: retryCorrect,
              score: retryCorrect ? 1 : 0,
              hintsUsed: 0,
              review: { status: "not-required" },
              submittedAt: new Date(
                Math.min(period.reportCutoff - 1, +reviewedAt + 60000),
              ),
            });
            attempt.review.correctedAfterReview = retryCorrect;
            records.events.push({
              _id: idFor(`${attemptId}:review-event`),
              userId,
              clientEventId: `${attemptId}:review`,
              sessionId: `${batchKey}:review:${index}`,
              eventType: "review-completed",
              curriculumId: problem.curriculumId,
              courseId: problem.courseId,
              unitId: problem.unitId,
              conceptId: concept.conceptId,
              problemId: problem._id,
              attemptId,
              durationMs: 3 * 60000,
              occurredAt: reviewedAt,
              metadata: { demoBatchKey: batchKey },
            });
          }
        });
      });
    });
    const concepts = [
      ...MATH_MAP_CONCEPTS.map((concept) => ({
        ...concept,
        conceptTitle: concept.title,
      })),
      ...records.weeks
        .filter((week) => String(week.classId) === String(classData._id))
        .flatMap((week) => week.concepts),
    ];
    const seen = new Set();
    concepts.forEach((concept, conceptIndex) => {
      const key = `${concept.courseId}:${concept.conceptId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const periodIndex = conceptIndex % 2,
        dates = allActivityDates.filter(
          (date) =>
            date >= periods[periodIndex].start &&
            date < periods[periodIndex].reportCutoff,
        );
      const completed =
        conceptIndex < 2 || conceptIndex % 4 < Math.round(ability * 3);
      const completion = completed ? 4 : clamp(Math.round(ability * 3), 1, 3);
      const conceptAttempts = records.attempts.filter(
        (attempt) =>
          String(attempt.userId) === String(userId) &&
          attempt.conceptId === concept.conceptId,
      );
      const completedAt = completed ? dates.at(-1) : null;
      records.progress.push({
        _id: idFor(`${batchKey}:progress:${index}:${key}`),
        userId,
        curriculumId: "kr-2022",
        courseId: concept.courseId,
        unitId: concept.unitId,
        conceptId: concept.conceptId,
        topicCount: 4,
        completedTopicIndexes: Array.from({ length: completion }, (_, q) => q),
        completedTopics: completion,
        completionPercent: completion * 25,
        status: completed ? "completed" : "in-progress",
        masteryProbability: Number(
          clamp(
            ability + 0.1 * Math.cos(conceptIndex + index),
            0.1,
            0.98,
          ).toFixed(3),
        ),
        signals: {
          totalAttempts: conceptAttempts.length,
          correctAttempts: conceptAttempts.filter(
            (attempt) => attempt.isCorrect,
          ).length,
          totalResponseTimeMs: conceptAttempts.reduce(
            (sum, attempt) => sum + attempt.responseTimeMs,
            0,
          ),
          hintsUsed: conceptAttempts.reduce(
            (sum, attempt) => sum + attempt.hintsUsed,
            0,
          ),
        },
        lastStudiedAt: dates.at(-1),
        completedAt,
        masteryGate: {
          requiredDistinctTypes: 4,
          correctTypeIds: completed
            ? ["demo-type-0", "demo-type-1", "demo-type-2", "demo-type-3"]
            : [],
          userCompleted: completed,
          unlockedAt: completedAt,
          completedAt,
        },
      });
      if (completed)
        records.events.push({
          _id: idFor(`${batchKey}:concept-event:${index}:${key}`),
          userId,
          clientEventId: `${batchKey}:concept:${index}:${key}`,
          sessionId: `${batchKey}:concept:${index}`,
          eventType: "concept-completed",
          curriculumId: "kr-2022",
          courseId: concept.courseId,
          unitId: concept.unitId,
          conceptId: concept.conceptId,
          occurredAt: completedAt,
          metadata: { demoBatchKey: batchKey },
        });
    });
    for (const week of records.weeks.filter(
      (week) => String(week.classId) === String(classData._id),
    )) {
      const missed = index % 10 === 0 && week.weekNumber === 2;
      const countCorrect = Math.round(
        clamp(
          ability + 0.055 * zAt((index + week.weekNumber * 3) % COUNT),
          0.2,
          0.98,
        ) * 20,
      );
      const correctByQuestion = shuffle(
        Array.from({ length: 20 }, (_, q) => !missed && q < countCorrect),
        random,
      );
      const answers = missed
        ? Array(20).fill("")
        : week.assignmentOmr.answerKey.map((answer, q) =>
            correctByQuestion[q]
              ? answer
              : q < 15
                ? String((Number(answer) % 5) + 1)
                : "999",
          );
      records.submissions.push({
        _id: idFor(`${batchKey}:submission:${index}:${week._id}`),
        academyId: academy._id,
        classId: classData._id,
        weekId: week._id,
        studentUserId: userId,
        answers,
        answerModes: Array.from({ length: 20 }, (_, q) =>
          q < 15 ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        ),
        answeredCount: missed ? 0 : 20,
        correctByQuestion,
        correctCount: missed ? 0 : countCorrect,
        questionCount: 20,
        scorePercent: missed ? 0 : countCorrect * 5,
        status: missed ? "MISSED" : "SUBMITTED",
        submittedAt: missed
          ? null
          : new Date(+week.dueAt - (12 + (index % 24)) * 3600000),
        gradedAt: week.dueAt,
        autoZeroedAt: missed ? week.dueAt : null,
        answerKeyConfiguredAt: week.publishedAt,
      });
    }
    const mockCorrectCount = Math.round(ability * exam.questionCount);
    const mockCorrect = shuffle(
      Array.from(
        { length: exam.questionCount },
        (_, q) => q < mockCorrectCount,
      ),
      random,
    );
    const mockScore = mockCorrect.reduce(
      (sum, correct, q) => sum + (correct ? exam.points[q] : 0),
      0,
    );
    const startedAt = new Date(+exam.releaseAt + index * 1000),
      submittedAt = new Date(
        Math.min(
          +exam.closeAt - 1000,
          +startedAt + (70 + (index % 20)) * 60000,
        ),
      );
    records.mockAttempts.push({
      _id: idFor(`${batchKey}:mock:${index}:${exam._id}`),
      demoBatchKey: batchKey,
      userId,
      examId: exam._id,
      weekKey: exam.weekKey,
      formCode: exam.formCode,
      attemptNumber: exam.attemptNumber,
      answers: exam.answerKey.map((answer, q) =>
        mockCorrect[q] ? answer : answer === "1" ? "2" : "1",
      ),
      answeredCount: exam.questionCount,
      correctCount: mockCorrectCount,
      correctByQuestion: mockCorrect,
      score: mockScore,
      status: "submitted",
      startedAt,
      submittedAt,
      elapsedTimeMs: +submittedAt - +startedAt,
      isRepresentative: false,
      usedForWeeklyRanking: false,
      usedForMmrStability: false,
      usedForCalibration: false,
      usedForIntegrityAnalysis: false,
      integrityStatus: "CLEAR",
      submissionFinalization: { status: "completed", completedAt: submittedAt },
      submissionReceipt: {
        requestId: `${batchKey}:${index}`,
        payloadHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(mockCorrect))
          .digest("hex"),
        acceptedAt: submittedAt,
      },
      scoreBreakdown: {
        threePointCorrect: mockCorrect.filter(
          (value, q) => value && exam.points[q] === 3,
        ).length,
        threePointTotal: exam.points.filter((points) => points === 3).length,
        fourPointCorrect: mockCorrect.filter(
          (value, q) => value && exam.points[q] === 4,
        ).length,
        fourPointTotal: exam.points.filter((points) => points === 4).length,
      },
    });
    const keys = [...new Set(allActivityDates.map(dayKey))].sort();
    let longest = 0,
      streak = 0,
      previous;
    for (const key of keys) {
      streak =
        previous && +new Date(key) - +new Date(previous) === DAY
          ? streak + 1
          : 1;
      longest = Math.max(longest, streak);
      previous = key;
    }
    const lastDate = allActivityDates.sort((a, b) => a - b).at(-1);
    user.lastStudyDate = lastDate;
    user.longestStreak = longest;
    user.currentStreak = [dayKey(now), dayKey(new Date(now - DAY))].includes(
      keys.at(-1),
    )
      ? streak
      : 0;
    user.totalConnectedSeconds = Math.round(
      records.events
        .filter((event) => String(event.userId) === String(userId))
        .reduce((sum, event) => sum + (event.durationMs || 0), 0) / 1000,
    );
    profiles.push({
      number: index + 1,
      userId: String(userId),
      email: address,
      displayName: user.realName,
      className: classData.name,
      targetAccuracy: Number((ability * 100).toFixed(1)),
      engagement: Number(engagement.toFixed(3)),
      mockScore,
    });
  }
  // Use the real timetable key, so roster/CSV reads find the seeded session
  // instead of creating a second session and incorrectly marking absences.
  for (const classData of records.classes) {
    const attendanceDates = [];
    for (let offset = 0; attendanceDates.length < 12 && offset < 60; offset++) {
      const key = dayKey(new Date(now - offset * DAY));
      const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
      if (
        classData.schedule.weekdays.includes(weekday) &&
        +new Date(`${key}T${classData.schedule.endTime}:00+09:00`) <= +now
      )
        attendanceDates.push(key);
    }
    for (let day = 0; day < 12; day++) {
      const dateKey = attendanceDates[day];
      const startsAt = new Date(
          `${dateKey}T${classData.schedule.startTime}:00+09:00`,
        ),
        endsAt = new Date(`${dateKey}T${classData.schedule.endTime}:00+09:00`);
      const sessionId = idFor(`${batchKey}:session:${classData._id}:${day}`);
      const roster = records.memberships
        .filter((member) => String(member.classId) === String(classData._id))
        .map((member) => member.studentUserId);
      records.sessions.push({
        _id: sessionId,
        academyId: academy._id,
        classId: classData._id,
        sessionKey: `${academy._id}:${classData._id}:${dateKey}:${classData.schedule.startTime}`,
        dateKey: dayKey(startsAt),
        startsAt,
        endsAt,
        checkInOpensAt: new Date(+startsAt - 10 * 60000),
        lateAfterAt: new Date(+startsAt + 5 * 60000),
        checkInClosesAt: new Date(+startsAt + 20 * 60000),
        attendanceMode: "MANUAL",
        codeVersion: 1,
        rosterStudentUserIds: roster,
        status: "CLOSED",
        createdByUserId: staff.userId,
        closedAt: endsAt,
      });
      roster.forEach((userId) => {
        const index = records.users.findIndex(
          (user) => String(user._id) === String(userId),
        );
        const profile = profiles[index],
          random = createSeededRandom(`${batchKey}:attendance:${index}:${day}`);
        const roll = random();
        const status =
          roll < clamp(profile.engagement + 0.17, 0.6, 0.98)
            ? "PRESENT"
            : roll < 0.93
              ? "LATE"
              : roll < 0.97
                ? "ABSENT"
                : "EXCUSED";
        const checkedInAt = ["PRESENT", "LATE"].includes(status)
          ? new Date(+startsAt + (status === "LATE" ? 12 : -3) * 60000)
          : null;
        const attendanceId = idFor(`${sessionId}:${userId}`);
        records.attendance.push({
          _id: attendanceId,
          academyId: academy._id,
          classId: classData._id,
          sessionId,
          studentUserId: userId,
          dateKey: dayKey(startsAt),
          status,
          checkedInAt,
          checkedOutAt: checkedInAt ? endsAt : null,
          note: "데모 출결",
          recordedByUserId: staff.userId,
          source: "SEED",
          seedRunId: batchKey,
        });
        records.audits.push({
          _id: idFor(`${attendanceId}:audit`),
          academyId: academy._id,
          classId: classData._id,
          sessionId,
          attendanceId,
          studentUserId: userId,
          actorUserId: staff.userId,
          actorType: "SYSTEM",
          action: "CREATED",
          previousStatus: null,
          nextStatus: status,
          note: "데모 출결 생성",
          occurredAt: endsAt,
        });
      });
    }
  }
  // Validate all required fields and hooks, not just collection counts.
  for (const [key, rows] of Object.entries(records))
    for (let index = 0; index < rows.length; index++) {
      const document = new MODEL_MAP[key](rows[index]);
      await document.validate();
      records[key][index] = document.toObject();
    }
  return {
    batchKey,
    academyId: String(academy._id),
    academyName: academy.name,
    createdAt: now.toISOString(),
    sourceExamId: String(exam._id),
    sourceExamTitle: exam.title,
    periods: periods.map((period) => period.key),
    profiles,
    counts: Object.fromEntries(
      Object.entries(records).map(([key, rows]) => [key, rows.length]),
    ),
    records,
  };
}

async function applyPlan(plan, { reactivate = false, now = new Date() } = {}) {
  const existing = await models.User.find({ testBatchKey: plan.batchKey })
    .select("isTestAccount")
    .lean();
  if (existing.length) {
    if (
      existing.length !== COUNT ||
      existing.some((user) => !user.isTestAccount) ||
      existing.some(
        (user) =>
          !plan.profiles.some((profile) => profile.userId === String(user._id)),
      )
    )
      throw new Error(
        "기존 데모 배치가 정확히 20명과 일치하지 않습니다. 자동 삭제하지 않습니다.",
      );
    return { applied: false, alreadyPresent: true };
  }
  for (const [key, rows] of Object.entries(plan.records)) {
    if (
      await MODEL_MAP[key].exists({ _id: { $in: rows.map((row) => row._id) } })
    )
      throw new Error(`${key} ID 충돌: 기존 데이터는 덮어쓰지 않습니다.`);
  }
  if (
    await models.User.exists({
      $or: [
        { email: { $in: plan.profiles.map((profile) => profile.email) } },
        { name: { $in: plan.records.users.map((user) => user.name) } },
      ],
    })
  )
    throw new Error("실제 계정 이메일/닉네임 충돌입니다.");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const academy = await academyModels.Academy.findById(plan.academyId)
        .session(session)
        .lean();
      if (
        !academy ||
        academy.name !== plan.academyName ||
        !(
          academy.status === "ACTIVE" ||
          (reactivate && academy.status === "PAUSED")
        )
      )
        throw new Error(
          "학원 상태가 변경되었습니다. 승인되지 않은 상태 변경은 하지 않습니다.",
        );
      if (academy.contractEndsAt && +new Date(academy.contractEndsAt) <= +now)
        throw new Error("학원 계약이 만료되어 적용하지 않았습니다.");
      const ownerId = plan.records.classes[0].createdByUserId;
      if (
        !(await academyModels.AcademyStaff.exists({
          academyId: academy._id,
          userId: ownerId,
          role: "OWNER",
          status: "ACTIVE",
        }).session(session)) ||
        !(await models.User.exists({
          _id: ownerId,
          role: { $in: ["teacher", "admin"] },
          isActive: { $ne: false },
        }).session(session))
      )
        throw new Error("학원 운영자 연결이 변경되어 적용하지 않았습니다.");
      if (academy.status === "PAUSED") {
        const activated = await academyModels.Academy.updateOne(
          { _id: academy._id, status: "PAUSED", updatedAt: academy.updatedAt },
          { $set: { status: "ACTIVE" } },
          { session },
        );
        if (activated.modifiedCount !== 1)
          throw new Error("학원 활성화 상태가 충돌했습니다.");
      }
      // MongoDB does not support parallel operations within a transaction.
      for (const [key, rows] of Object.entries(plan.records))
        for (let offset = 0; offset < rows.length; offset += 400)
          await MODEL_MAP[key].insertMany(rows.slice(offset, offset + 400), {
            session,
            ordered: true,
          });
    });
  } finally {
    await session.endSession();
  }
  return { applied: true, alreadyPresent: false };
}

async function verifyPlan(plan, now = new Date()) {
  const userIds = plan.profiles.map(
    (profile) => new mongoose.Types.ObjectId(profile.userId),
  );
  const counts = {};
  for (const [key, rows] of Object.entries(plan.records)) {
    counts[key] = await MODEL_MAP[key].countDocuments({
      _id: { $in: rows.map((row) => row._id) },
    });
    if (counts[key] !== rows.length)
      throw new Error(`${key} 누락: ${counts[key]}/${rows.length}`);
  }
  const maps = await getStudentMathMaps({ studentUserIds: userIds });
  const statistics = [];
  for (const userId of userIds) {
    for (const periodKey of plan.periods) {
      const stats = await getStudentMonthlyStatistics({
        studentUserId: userId,
        periodKey,
        now,
      });
      if (
        !stats.hasActivity ||
        !stats.samples.firstAttempts ||
        !stats.samples.wrongAnswers ||
        !stats.samples.retriedWrongAnswers ||
        !stats.values.completedConcepts
      )
        throw new Error(`월간 지표 누락: ${userId}/${periodKey}`);
      statistics.push({
        userId: String(userId),
        periodKey,
        health: stats.health.score,
        ...stats.values,
      });
    }
    const insight = await getWeeklyMockInsights({
      studentUserIds: [userId],
      now,
    });
    if (insight.submissionCount !== 1 || !insight.conceptCount)
      throw new Error(`개인 모의고사 분석 누락: ${userId}`);
  }
  const school = await getAcademyWeeklyMockInsights({
    academyId: plan.academyId,
    now,
  });
  if (
    school.overall.submissionCount < COUNT ||
    school.classes
      .filter((row) => row.className.startsWith("[데모]"))
      .some((row) => row.insight.submissionCount !== 10)
  )
    throw new Error("학원/반 모의고사 집계 불일치");
  if (
    maps.size !== COUNT ||
    [...maps.values()].some(
      (map) =>
        map.analyzedConceptCount < 4 || !map.topStrength || !map.topPriority,
    )
  )
    throw new Error("Math Map 개념·강약점 분석 누락");
  return {
    counts,
    monthlyStatistics: statistics,
    mockConceptCount: school.overall.conceptCount,
  };
}

async function main() {
  require("dotenv").config({ path: "config.env", quiet: true });
  const academyId = (
    process.argv.find((argument) => argument.startsWith("--academy-id=")) || ""
  ).slice("--academy-id=".length);
  const apply = process.argv.includes("--apply");
  const reactivate = process.argv.includes("--reactivate");
  if (apply && !process.argv.includes(`--confirm=${CONFIRMATION}`))
    throw new Error(`--confirm=${CONFIRMATION}가 필요합니다.`);
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: false,
    autoCreate: false,
  });
  const now = new Date(),
    target = await resolveTarget(academyId, now, { allowPaused: reactivate });
  const password = `Demo1!${crypto.randomBytes(24).toString("base64url")}`;
  const plan = await buildPlan({ ...target, now, password });
  const summary = {
    batchKey: plan.batchKey,
    academyId: plan.academyId,
    academyName: plan.academyName,
    counts: plan.counts,
    profiles: plan.profiles,
    sourceExamId: plan.sourceExamId,
    sourceExamTitle: plan.sourceExamTitle,
    periods: plan.periods,
    reactivationRequested: reactivate,
    previousAcademyStatus: target.academy.status,
  };
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }
  const existing = await models.User.countDocuments({
    testBatchKey: plan.batchKey,
  });
  let manifestPath = "";
  if (!existing) {
    const privateDirectory = path.resolve(
      __dirname,
      "..",
      "backups",
      "academy-demo-20",
    );
    await fs.mkdir(privateDirectory, { recursive: true, mode: 0o700 });
    manifestPath = path.join(
      privateDirectory,
      `${suffix(plan.batchKey)}-${now.toISOString().replace(/[:.]/g, "-")}.json`,
    );
    const baseline = {
      academy: target.academy,
      sourceExam: target.exam,
      collectionCounts: {},
    };
    for (const [key, Model] of Object.entries(MODEL_MAP))
      baseline.collectionCounts[key] = await Model.countDocuments({});
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          ...summary,
          password,
          baseline,
          recordIds: Object.fromEntries(
            Object.entries(plan.records).map(([key, rows]) => [
              key,
              rows.map((row) => String(row._id)),
            ]),
          ),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
  }
  const result = await applyPlan(plan, { reactivate, now });
  const verification = result.applied
    ? await verifyPlan(plan, now)
    : { existingStudents: existing };
  console.log(
    JSON.stringify(
      {
        ...summary,
        ...result,
        verification,
        ...(manifestPath ? { credentialsFile: manifestPath } : {}),
      },
      null,
      2,
    ),
  );
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
module.exports = {
  COUNT,
  MODEL_MAP,
  applyPlan,
  buildPlan,
  resolveTarget,
  verifyPlan,
  zAt,
};

const { createHash, randomBytes } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  ConceptProgress,
  LearningEvent,
  Problem,
  ProblemAttempt,
  User,
} = require("../models/matthsModel");
const {
  Academy,
  AcademyAttendance,
  AcademyAttendanceAudit,
  AcademyAttendanceSession,
  AcademyClass,
  AcademyClassWeek,
  AcademyStudentMembership,
} = require("../models/academyModel");
const {
  getAcademyMonthlyStatistics,
  _private: { resolvePeriod },
} = require("../services/academyStatisticsService");
const {
  getClassMathMap,
  getStudentMathMaps,
} = require("../services/mathMapService");
const {
  _private: { getKstDateKey },
} = require("../services/academyAttendanceService");
const { curriculumConceptCatalog } = require("../services/academyClassworkService");

const TARGET_ACADEMY_NAME = "테스트 수학학원";
const DATASET_KEY = "academy-metrics-v2";
const LEGACY_DATASET_KEYS = ["academy-metrics-v1"];
const COURSE_ID = "academy-dashboard-dummy";
const CONFIRMATION = "SEED_TEST_ACADEMY_METRICS";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes(`--confirm=${CONFIRMATION}`);
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const BULK_CHUNK_SIZE = 500;
const MATH_MAP_PROBLEMS_PER_CONCEPT = 20;
const MATH_MAP_CONCEPTS = Object.freeze([
  {
    conceptId: "calculus-1-02-07",
    curriculumId: "kr-2022",
    courseId: "calculus-1",
    unitId: "calculus-1-02",
    title: "함수의 증가·감소와 극값",
  },
  {
    conceptId: "calculus-1-02-08",
    curriculumId: "kr-2022",
    courseId: "calculus-1",
    unitId: "calculus-1-02",
    title: "함수 그래프의 개형",
  },
  {
    conceptId: "calculus-1-02-04",
    curriculumId: "kr-2022",
    courseId: "calculus-1",
    unitId: "calculus-1-02",
    title: "다항함수의 미분법",
  },
  {
    conceptId: "calculus-1-02-09",
    curriculumId: "kr-2022",
    courseId: "calculus-1",
    unitId: "calculus-1-02",
    title: "미분과 방정식·부등식",
  },
]);
const PROVIDED_RUN_SEED = String(
  process.argv.find((argument) => argument.startsWith("--seed=")) || ""
).replace(/^--seed=/, "").trim();

function deterministicObjectId(value) {
  return new mongoose.Types.ObjectId(
    createHash("sha256").update(String(value)).digest("hex").slice(0, 24)
  );
}

function createSeededRandom(seed) {
  let state = Number.parseInt(
    createHash("sha256").update(String(seed)).digest("hex").slice(0, 8),
    16
  ) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function randomChance(random, probability) {
  return random() < probability;
}

function testUserFilter(userIds) {
  return {
    _id: { $in: userIds },
    role: { $in: ["student", "test"] },
    accountStatus: { $ne: "withdrawn" },
    isActive: { $ne: false },
    $or: [{ isTestAccount: true }, { role: "test" }],
  };
}

async function findExactTargetAcademy() {
  const matches = await Academy.find({
    nameNormalized: TARGET_ACADEMY_NAME.toLocaleLowerCase("ko-KR"),
    status: "ACTIVE",
  })
    .select("_id name status createdByUserId")
    .lean();
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `이름이 같은 활성 학원이 ${matches.length}개라 대상을 확정할 수 없습니다.`
        : `활성 상태의 '${TARGET_ACADEMY_NAME}'을 찾을 수 없습니다.`
    );
  }
  return matches[0];
}

function periodActivityTimes(period, requestedCount, random) {
  const candidates = [];
  for (
    let timestamp = period.start.getTime() + 12 * HOUR_MS;
    timestamp < period.reportCutoff.getTime();
    timestamp += DAY_MS
  ) {
    candidates.push(new Date(timestamp));
  }
  if (!candidates.length) {
    const fallback = new Date(Math.max(period.start.getTime(), period.reportCutoff.getTime() - HOUR_MS));
    if (fallback < period.reportCutoff) candidates.push(fallback);
  }
  const count = Math.min(Math.max(0, requestedCount), candidates.length);
  if (!count) return [];
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const target = randomInteger(random, 0, index);
    [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
  }
  return candidates.slice(0, count).sort((left, right) => left - right);
}

function boundedAfter(timestamp, hours, period) {
  return new Date(Math.min(
    timestamp.getTime() + hours * HOUR_MS,
    period.reportCutoff.getTime() - 1
  ));
}

function allDatasetKeys() {
  return [DATASET_KEY, ...LEGACY_DATASET_KEYS];
}

function buildClassWeekOperations({ academy, activeClasses, now }) {
  const academicYear = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(now));
  const { lookup } = curriculumConceptCatalog();
  const weekPlans = [
    {
      title: "다항식의 연산",
      lessonSummary: "다항식의 사칙연산과 항등식의 기본 원리를 학습했습니다.",
      assignmentTitle: "다항식 기본 연산 과제",
      assignmentInstructions: "내 학습에서 연결된 개념을 복습하고 수업 교재의 기본 문제를 풀어오세요.",
      conceptKeys: [
        "common-math-1/polynomials/polynomial-arithmetic",
        "common-math-1/polynomials/identity-remainder-theorem",
      ],
    },
    {
      title: "인수분해와 복소수",
      lessonSummary: "다항식의 인수분해를 정리하고 복소수의 뜻과 연산으로 확장했습니다.",
      assignmentTitle: "인수분해·복소수 복습",
      assignmentInstructions: "오답은 풀이 과정을 다시 적고, 연결된 두 개념을 내 학습에서 확인하세요.",
      conceptKeys: [
        "common-math-1/polynomials/polynomial-factorization",
        "common-math-1/equations-and-inequalities/complex-numbers",
      ],
    },
    {
      title: "이차방정식의 판별식",
      lessonSummary: "실근과 허근을 구분하고 판별식을 이용해 근의 성질을 판단했습니다.",
      assignmentTitle: "판별식 유형 과제",
      assignmentInstructions: "판별식의 부호별 조건을 정리한 뒤 유형 문제를 풀어오세요.",
      conceptKeys: [
        "common-math-1/equations-and-inequalities/quadratic-discriminant",
        "common-math-1/equations-and-inequalities/quadratic-roots-and-coefficients",
      ],
    },
    {
      title: "이차방정식과 이차함수",
      lessonSummary: "방정식의 근과 이차함수 그래프의 교점 관계를 연결해 학습했습니다.",
      assignmentTitle: "이차함수 그래프 연결 과제",
      assignmentInstructions: "그래프를 직접 그려 교점의 개수와 판별식의 관계를 설명하세요.",
      conceptKeys: [
        "common-math-1/equations-and-inequalities/quadratic-equation-and-function",
        "common-math-1/equations-and-inequalities/parabola-and-line",
      ],
    },
  ];
  return activeClasses.flatMap((academyClass) => weekPlans.map((plan, index) => {
    const concepts = plan.conceptKeys.map((key) => {
      const concept = lookup.get(key);
      if (!concept) throw new Error(`주차 더미 개념이 현재 YAML에 없습니다: ${key}`);
      const { key: _key, ...snapshot } = concept;
      return snapshot;
    });
    const weekNumber = index + 1;
    const dueAt = new Date(now.getTime() + (weekNumber * 7 + 2) * DAY_MS);
    return {
      updateOne: {
        filter: {
          academyId: academy._id,
          classId: academyClass._id,
          academicYear,
          weekNumber,
        },
        update: {
          $setOnInsert: {
            title: plan.title,
            lessonSummary: `[${DATASET_KEY}] ${plan.lessonSummary}`,
            concepts,
            assignmentTitle: plan.assignmentTitle,
            assignmentInstructions: plan.assignmentInstructions,
            dueAt,
            files: [],
            status: "PUBLISHED",
            publishedAt: now,
            createdByUserId: academyClass.homeroomTeacherUserId || academyClass.createdByUserId || academy.createdByUserId,
            updatedByUserId: academyClass.homeroomTeacherUserId || academyClass.createdByUserId || academy.createdByUserId,
          },
        },
        upsert: true,
      },
    };
  }));
}

function dummyAttemptFilter(userIds) {
  return {
    userId: { $in: userIds },
    $or: [
      { "errorAnalysis.modelVersion": DATASET_KEY },
      { "problemSnapshot.typeId": { $in: allDatasetKeys() } },
    ],
  };
}

function buildMathMapProblemCatalog() {
  const operations = [];
  const pools = MATH_MAP_CONCEPTS.map((concept) => ({
    ...concept,
    problems: Array.from({ length: MATH_MAP_PROBLEMS_PER_CONCEPT }, (_, index) => {
      const number = index + 1;
      const typeNumber = (index % 4) + 1;
      const difficulty = (index % 5) + 1;
      const externalId = `${DATASET_KEY}:${concept.conceptId}:problem-${String(number).padStart(2, "0")}`;
      const problem = {
        _id: deterministicObjectId(externalId),
        externalId,
        curriculumId: concept.curriculumId,
        courseId: concept.courseId,
        unitId: concept.unitId,
        conceptIds: [concept.conceptId],
        primaryConceptId: concept.conceptId,
        source: { type: "custom" },
        questionType: number % 3 === 0 ? "multiple-choice" : "short-answer",
        stem: `[더미] ${concept.title} 유형 ${typeNumber} · 난이도 ${difficulty}`,
        correctAnswer: "__academy_dummy__",
        solutionSteps: [],
        difficulty,
        estimatedTimeSeconds: 60 + difficulty * 25,
        score: 1,
        tags: ["academy-dummy", DATASET_KEY, `math-map-type-${typeNumber}`],
        isPublished: false,
      };
      operations.push({
        updateOne: {
          filter: { externalId },
          update: {
            $set: Object.fromEntries(Object.entries(problem).filter(([key]) => key !== "_id")),
            $setOnInsert: { _id: problem._id },
          },
          upsert: true,
        },
      });
      return problem;
    }),
  }));
  return { operations, pools };
}

function shuffledCorrectFlags(total, correctCount, random) {
  const flags = Array.from({ length: total }, (_, index) => index < correctCount);
  for (let index = flags.length - 1; index > 0; index -= 1) {
    const target = randomInteger(random, 0, index);
    [flags[index], flags[target]] = [flags[target], flags[index]];
  }
  return flags;
}

function targetMathMapStatus(userIndex, conceptIndex) {
  const residue = userIndex % 5;
  if (conceptIndex === 0) return residue < 3 ? "WEAK" : "DEVELOPING";
  if (conceptIndex === 1) {
    if (residue === 0 || residue === 2) return "WEAK";
    if (residue === 4) return "MASTERED";
    return "DEVELOPING";
  }
  return ["UNKNOWN", "WEAK", "DEVELOPING", "MASTERED"][(userIndex + conceptIndex) % 4];
}

function targetAttemptProfile(status, random) {
  if (status === "UNKNOWN") {
    const total = randomInteger(random, 3, 4);
    return { total, correct: randomInteger(random, 1, Math.max(1, total - 1)) };
  }
  if (status === "WEAK") {
    const total = randomInteger(random, 10, 14);
    return { total, correct: Math.max(1, Math.floor(total * 0.25)) };
  }
  if (status === "MASTERED") {
    return { total: MATH_MAP_PROBLEMS_PER_CONCEPT, correct: MATH_MAP_PROBLEMS_PER_CONCEPT - 1 };
  }
  const total = randomInteger(random, 14, 18);
  return { total, correct: Math.floor(total * 0.68) };
}

function buildStudentMathMapPlans(users, periods, pools, runSeed) {
  return new Map(users.map((user, userIndex) => {
    const conceptPlans = pools.map((pool, conceptIndex) => {
      const random = createSeededRandom(`${runSeed}:math-map:${user._id}:${pool.conceptId}`);
      const targetStatus = targetMathMapStatus(userIndex, conceptIndex);
      const profile = targetAttemptProfile(targetStatus, random);
      const correctFlags = shuffledCorrectFlags(profile.total, profile.correct, random);
      const previousPeriodCount = periods.length > 1 ? Math.max(1, Math.floor(profile.total * 0.45)) : 0;
      const currentPeriodCount = profile.total - previousPeriodCount;
      const records = pool.problems.slice(0, profile.total).map((problem, attemptIndex) => ({
        attemptIndex,
        problem,
        isCorrect: correctFlags[attemptIndex],
      }));
      return {
        concept: pool,
        targetStatus,
        total: profile.total,
        correct: profile.correct,
        byPeriod: periods.map((_period, periodIndex) => {
          if (periodIndex === 0) return records.slice(previousPeriodCount, previousPeriodCount + currentPeriodCount);
          if (periodIndex === 1) return records.slice(0, previousPeriodCount);
          return [];
        }),
      };
    });
    return [String(user._id), conceptPlans];
  }));
}

function buildDataset(users, now = new Date(), runSeed = randomBytes(16).toString("hex")) {
  const currentPeriod = resolvePeriod("", now);
  const periods = currentPeriod.options.map((option) => resolvePeriod(option.key, now));
  const problemCatalog = buildMathMapProblemCatalog();
  const mathMapPlans = buildStudentMathMapPlans(users, periods, problemCatalog.pools, runSeed);
  const learningEventOperations = [];
  const problemAttemptOperations = [];
  const conceptProgressOperations = [];
  const attendanceOperations = [];
  const attendanceAuditOperations = [];
  const attendanceSessionOperations = [];
  const periodPlans = [];

  periods.forEach((period, periodIndex) => {
    let activeStudents = 0;
    let plannedFirstAttempts = 0;
    let plannedRetries = 0;
    let plannedCompletedConcepts = 0;

    users.forEach((user) => {
      const random = createSeededRandom(`${runSeed}:${period.key}:${user._id}`);
      const requestedLearningDays = randomInteger(random, 1, 15);
      const activityTimes = periodActivityTimes(period, requestedLearningDays, random);
      if (!activityTimes.length) return;
      activeStudents += 1;

      const wrongAnswerReviewProbability = 0.25 + random() * 0.7;

      activityTimes.forEach((occurredAt, dayIndex) => {
        const clientEventId = `${DATASET_KEY}:${runSeed}:${period.key}:${user._id}:day:${dayIndex}`;
        learningEventOperations.push({
          updateOne: {
            filter: { userId: user._id, clientEventId },
            update: {
              $set: {
                sessionId: `${DATASET_KEY}:${period.key}:${user._id}`,
                schemaVersion: 1,
                eventType: "problem-attempted",
                curriculumId: DATASET_KEY,
                courseId: COURSE_ID,
                unitId: period.key,
                conceptId: `${DATASET_KEY}-${period.key}-${dayIndex % 4}`,
                durationMs: randomInteger(random, 12, 75) * 60 * 1000,
                metadata: {
                  datasetKey: DATASET_KEY,
                  runSeed,
                  academyId: String(user.academyId),
                  generatedFor: "academy-dashboard",
                },
                occurredAt,
              },
              $setOnInsert: { userId: user._id, clientEventId },
            },
            upsert: true,
          },
        });
      });

      const conceptPlans = mathMapPlans.get(String(user._id)) || [];
      conceptPlans.forEach((conceptPlan) => {
        const periodRecords = conceptPlan.byPeriod[periodIndex] || [];
        plannedFirstAttempts += periodRecords.length;
        periodRecords.forEach(({ problem, attemptIndex, isCorrect }) => {
          const problemKey = `${DATASET_KEY}:${runSeed}:${user._id}:${problem.primaryConceptId}:${attemptIndex}`;
          const attemptId = deterministicObjectId(`${problemKey}:attempt:1`);
          const submittedAt = activityTimes[randomInteger(random, 0, activityTimes.length - 1)];
          const reviewed = !isCorrect && randomChance(random, wrongAnswerReviewProbability);
          const reviewedAt = reviewed ? boundedAfter(submittedAt, 2, period) : null;
          const typeId = `${DATASET_KEY}:type-${(attemptIndex % 4) + 1}`;
          problemAttemptOperations.push({
            updateOne: {
              filter: { _id: attemptId },
              update: {
                $set: {
                  userId: user._id,
                  problemId: problem._id,
                  reviewSourceAttemptId: null,
                  curriculumId: problem.curriculumId,
                  courseId: problem.courseId,
                  unitId: problem.unitId,
                  conceptId: problem.primaryConceptId,
                  attemptNumber: 1,
                  submittedAnswer: isCorrect ? "dummy-correct" : "dummy-wrong",
                  problemSnapshot: {
                    typeId,
                    stem: problem.stem,
                    choices: [],
                    solution: "학원 Math Map 계산 검증용 더미 데이터",
                    difficulty: problem.difficulty,
                  },
                  isCorrect,
                  score: isCorrect ? 1 : 0,
                  maxScore: 1,
                  responseTimeMs: randomInteger(random, 18, 140) * 1_000,
                  hintsUsed: randomChance(random, 0.22) ? randomInteger(random, 1, 2) : 0,
                  errorAnalysis: {
                    errorType: null,
                    relatedConceptId: problem.primaryConceptId,
                    confidence: null,
                    modelVersion: DATASET_KEY,
                    analyzedAt: null,
                  },
                  review: {
                    status: isCorrect ? "not-required" : reviewed ? "completed" : "pending",
                    scheduledAt: isCorrect ? null : boundedAfter(submittedAt, 1, period),
                    reviewedAt,
                    correctedAfterReview: false,
                  },
                  submittedAt,
                },
              },
              upsert: true,
            },
          });

          const retryProbability = conceptPlan.targetStatus === "WEAK" ? 0.72 : 0.45;
          if (!isCorrect && randomChance(random, retryProbability)) {
            plannedRetries += 1;
            const retrySuccessProbability = conceptPlan.targetStatus === "WEAK" ? 0.45 : 0.72;
            const retryCorrect = randomChance(random, retrySuccessProbability);
            problemAttemptOperations.push({
              updateOne: {
                filter: { _id: deterministicObjectId(`${problemKey}:attempt:2`) },
                update: {
                  $set: {
                    userId: user._id,
                    problemId: problem._id,
                    reviewSourceAttemptId: attemptId,
                    curriculumId: problem.curriculumId,
                    courseId: problem.courseId,
                    unitId: problem.unitId,
                    conceptId: problem.primaryConceptId,
                    attemptNumber: 2,
                    submittedAnswer: retryCorrect ? "dummy-retry-correct" : "dummy-retry-wrong",
                    problemSnapshot: {
                      typeId,
                      stem: problem.stem,
                      choices: [],
                      solution: "학원 Math Map 재도전 검증용 더미 데이터",
                      difficulty: problem.difficulty,
                    },
                    isCorrect: retryCorrect,
                    score: retryCorrect ? 1 : 0,
                    maxScore: 1,
                    responseTimeMs: randomInteger(random, 15, 105) * 1_000,
                    hintsUsed: 0,
                    errorAnalysis: {
                      errorType: null,
                      relatedConceptId: problem.primaryConceptId,
                      confidence: null,
                      modelVersion: DATASET_KEY,
                      analyzedAt: null,
                    },
                    review: {
                      status: "not-required",
                      scheduledAt: null,
                      reviewedAt: null,
                      correctedAfterReview: false,
                    },
                    submittedAt: boundedAfter(submittedAt, 3, period),
                  },
                },
                upsert: true,
              },
            });
          }
        });
      });

      const completedConceptCount = randomInteger(random, 0, 6);
      plannedCompletedConcepts += completedConceptCount;
      for (let conceptIndex = 0; conceptIndex < completedConceptCount; conceptIndex += 1) {
        const conceptId = `${DATASET_KEY}-${period.key}-${conceptIndex}`;
        const completedAt = activityTimes[randomInteger(random, 0, activityTimes.length - 1)];
        conceptProgressOperations.push({
          updateOne: {
            filter: {
              userId: user._id,
              curriculumId: DATASET_KEY,
              courseId: COURSE_ID,
              unitId: period.key,
              conceptId,
            },
            update: {
              $set: {
                topicCount: 4,
                completedTopicIndexes: [0, 1, 2, 3],
                completedTopics: 4,
                completionPercent: 100,
                masteryProbability: Number((0.45 + random() * 0.5).toFixed(2)),
                status: "completed",
                signals: {
                  totalAttempts: randomInteger(random, 4, 16),
                  correctAttempts: randomInteger(random, 2, 4),
                  totalResponseTimeMs: randomInteger(random, 120, 720) * 1_000,
                  hintsUsed: randomInteger(random, 0, 4),
                  visualizationReplays: randomInteger(random, 0, 2),
                },
                lastStudiedAt: completedAt,
                completedAt,
                masteryGate: {
                  requiredDistinctTypes: 5,
                  correctTypeIds: ["dummy-1", "dummy-2", "dummy-3", "dummy-4", "dummy-5"],
                  unlockedAt: completedAt,
                  userCompleted: true,
                  completedAt,
                },
              },
              $setOnInsert: {
                userId: user._id,
                curriculumId: DATASET_KEY,
                courseId: COURSE_ID,
                unitId: period.key,
                conceptId,
              },
            },
            upsert: true,
          },
        });
      }
    });

    periodPlans.push({
      periodKey: period.key,
      approvedTestStudents: users.length,
      activeStudents,
      participationRate: users.length ? Math.round((activeStudents / users.length) * 100) : 0,
      learningEvents: learningEventOperations.length - periodPlans.reduce((sum, item) => sum + item.learningEvents, 0),
      firstAttempts: plannedFirstAttempts,
      retries: plannedRetries,
      completedConcepts: plannedCompletedConcepts,
    });
  });

  const attendanceStartsAt = new Date(now.getTime() - 2 * HOUR_MS);
  const attendanceEndsAt = new Date(now.getTime() - HOUR_MS);
  const attendanceDateKey = getKstDateKey(attendanceStartsAt);
  const studentsByClassId = new Map();
  users.forEach((user) => {
    if (!user.classId) return;
    const classId = String(user.classId);
    if (!studentsByClassId.has(classId)) studentsByClassId.set(classId, []);
    studentsByClassId.get(classId).push(user._id);
  });
  const attendanceSessionIdByClassId = new Map();
  studentsByClassId.forEach((studentUserIds, classId) => {
    const sessionKey = `${DATASET_KEY}:${runSeed}:${users[0].academyId}:${classId}:${attendanceDateKey}`;
    const sessionId = deterministicObjectId(`${sessionKey}:session`);
    attendanceSessionIdByClassId.set(classId, sessionId);
    attendanceSessionOperations.push({
      updateOne: {
        filter: { sessionKey },
        update: {
          $set: {
            academyId: users[0].academyId,
            classId,
            dateKey: attendanceDateKey,
            startsAt: attendanceStartsAt,
            endsAt: attendanceEndsAt,
            checkInOpensAt: new Date(attendanceStartsAt.getTime() - 10 * 60 * 1000),
            lateAfterAt: new Date(attendanceStartsAt.getTime() + 5 * 60 * 1000),
            checkInClosesAt: new Date(attendanceStartsAt.getTime() + 20 * 60 * 1000),
            attendanceMode: "MANUAL",
            codeVersion: 1,
            codeIssuedAt: attendanceStartsAt,
            rosterStudentUserIds: studentUserIds,
            status: "CLOSED",
            createdByUserId: users[0].recordedByUserId,
            closedAt: attendanceEndsAt,
          },
          $setOnInsert: { _id: sessionId, sessionKey },
        },
        upsert: true,
      },
    });
  });
  users.forEach((user) => {
    const random = createSeededRandom(`${runSeed}:attendance:${attendanceDateKey}:${user._id}`);
    const roll = random();
    const status = roll < 0.72 ? "PRESENT" : roll < 0.84 ? "LATE" : roll < 0.94 ? "ABSENT" : "EXCUSED";
    const isArrival = status === "PRESENT" || status === "LATE";
    const checkedInAt = isArrival
      ? new Date(attendanceStartsAt.getTime() + randomInteger(random, -5, 15) * 60 * 1000)
      : null;
    const sessionId = user.classId ? attendanceSessionIdByClassId.get(String(user.classId)) || null : null;
    const attendanceId = deterministicObjectId(
      `${DATASET_KEY}:${runSeed}:attendance:${attendanceDateKey}:${user._id}`
    );
    attendanceOperations.push({
      updateOne: {
        filter: {
          ...(sessionId ? { sessionId } : { academyId: user.academyId, sessionId: null }),
          studentUserId: user._id,
          dateKey: attendanceDateKey,
        },
        update: {
          $set: {
            classId: user.classId || null,
            sessionId,
            status,
            checkedInAt,
            checkedOutAt: null,
            note: status === "LATE" ? "더미 데이터 · 지각" : status === "EXCUSED" ? "더미 데이터 · 사유 결석" : "",
            recordedByUserId: user.recordedByUserId,
            source: "SEED",
            seedRunId: runSeed,
          },
          $setOnInsert: {
            _id: attendanceId,
            academyId: user.academyId,
            studentUserId: user._id,
            dateKey: attendanceDateKey,
          },
        },
        upsert: true,
      },
    });
    attendanceAuditOperations.push({
      updateOne: {
        filter: { _id: deterministicObjectId(`${attendanceId}:audit`) },
        update: {
          $set: {
            academyId: user.academyId,
            classId: user.classId || null,
            sessionId,
            attendanceId,
            studentUserId: user._id,
            actorUserId: user.recordedByUserId,
            actorType: "SYSTEM",
            action: "CREATED",
            previousStatus: null,
            nextStatus: status,
            note: `${DATASET_KEY} 출결 더미`,
            occurredAt: attendanceEndsAt,
          },
        },
        upsert: true,
      },
    });
  });

  return {
    runSeed,
    periods,
    periodPlans,
    operations: {
      problems: problemCatalog.operations,
      learningEvents: learningEventOperations,
      problemAttempts: problemAttemptOperations,
      conceptProgress: conceptProgressOperations,
      attendance: attendanceOperations,
      attendanceAudits: attendanceAuditOperations,
      attendanceSessions: attendanceSessionOperations,
    },
  };
}

async function runBulkOperations(Model, operations, session = null) {
  let matched = 0;
  let modified = 0;
  let upserted = 0;
  for (let index = 0; index < operations.length; index += BULK_CHUNK_SIZE) {
    const result = await Model.bulkWrite(
      operations.slice(index, index + BULK_CHUNK_SIZE),
      { ordered: false, ...(session ? { session } : {}) }
    );
    matched += Number(result.matchedCount || 0);
    modified += Number(result.modifiedCount || 0);
    upserted += Number(result.upsertedCount || 0);
  }
  return { planned: operations.length, matched, modified, upserted };
}

async function replaceExistingDummyDataset({ userIds, operations }) {
  const session = await mongoose.startSession();
  let cleanupResults;
  let writeResults;
  try {
    await session.withTransaction(async () => {
      const oldSeedAttendanceIds = await AcademyAttendance.distinct("_id", {
        studentUserId: { $in: userIds },
        source: "SEED",
      }).session(session);
      const oldSeedSessionIds = await AcademyAttendanceSession.distinct("_id", {
        sessionKey: new RegExp(`^${DATASET_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`),
      }).session(session);
      const learningEvents = await LearningEvent.deleteMany(
        { userId: { $in: userIds }, "metadata.datasetKey": { $in: allDatasetKeys() } },
        { session }
      );
      const problemAttempts = await ProblemAttempt.deleteMany(
        dummyAttemptFilter(userIds),
        { session }
      );
      const conceptProgress = await ConceptProgress.deleteMany(
        { userId: { $in: userIds }, curriculumId: { $in: allDatasetKeys() }, courseId: COURSE_ID },
        { session }
      );
      const attendance = await AcademyAttendance.deleteMany(
        { studentUserId: { $in: userIds }, source: "SEED" },
        { session }
      );
      const attendanceAudits = await AcademyAttendanceAudit.deleteMany(
        { $or: [{ attendanceId: { $in: oldSeedAttendanceIds } }, { sessionId: { $in: oldSeedSessionIds } }] },
        { session }
      );
      const attendanceSessions = await AcademyAttendanceSession.deleteMany(
        { _id: { $in: oldSeedSessionIds } },
        { session }
      );
      cleanupResults = {
        learningEvents: Number(learningEvents.deletedCount || 0),
        problemAttempts: Number(problemAttempts.deletedCount || 0),
        conceptProgress: Number(conceptProgress.deletedCount || 0),
        attendance: Number(attendance.deletedCount || 0),
        attendanceAudits: Number(attendanceAudits.deletedCount || 0),
        attendanceSessions: Number(attendanceSessions.deletedCount || 0),
      };
      writeResults = {
        membershipAssignments: await runBulkOperations(AcademyStudentMembership, operations.membershipAssignments || [], session),
        classSetup: await runBulkOperations(AcademyClass, operations.classSetup || [], session),
        classWeeks: await runBulkOperations(AcademyClassWeek, operations.classWeeks || [], session),
        problems: await runBulkOperations(Problem, operations.problems, session),
        learningEvents: await runBulkOperations(LearningEvent, operations.learningEvents, session),
        problemAttempts: await runBulkOperations(ProblemAttempt, operations.problemAttempts, session),
        conceptProgress: await runBulkOperations(ConceptProgress, operations.conceptProgress, session),
        attendanceSessions: await runBulkOperations(AcademyAttendanceSession, operations.attendanceSessions, session),
        attendance: await runBulkOperations(AcademyAttendance, operations.attendance, session),
        attendanceAudits: await runBulkOperations(AcademyAttendanceAudit, operations.attendanceAudits, session),
      };
    });
  } finally {
    await session.endSession();
  }
  return { cleanupResults, writeResults };
}

async function verifyAcademyUserConnection({ academy, period, now = new Date(), requireMathMap = false }) {
  const memberships = await AcademyStudentMembership.find({
    academyId: academy._id,
    status: "APPROVED",
  })
    .select("studentUserId classId")
    .populate("studentUserId", "name realName role isTestAccount testBatchKey accountStatus isActive")
    .lean();
  const connectedMemberships = memberships.filter((membership) => membership.studentUserId);
  const orphanMemberships = memberships.length - connectedMemberships.length;
  const userIds = connectedMemberships.map((membership) => membership.studentUserId._id);
  const dummyMembers = connectedMemberships.filter((membership) =>
    membership.studentUserId.isTestAccount === true || membership.studentUserId.role === "test"
  );
  const dummyUserIds = dummyMembers.map((membership) => membership.studentUserId._id);
  const dummyMembershipsWithClass = dummyMembers.filter((membership) => membership.classId).length;
  const nonDummyMembers = connectedMemberships.filter((membership) =>
    membership.studentUserId.isTestAccount !== true && membership.studentUserId.role !== "test"
  );
  const periodRange = { $gte: period.start, $lt: period.reportCutoff };
  const [
    learningUsers,
    attemptUsers,
    conceptUsers,
    datasetProblemIds,
    studentLearningRows,
    studentAttemptRows,
    studentConceptRows,
    statistics,
    studentMathMaps,
    classMathMap,
  ] = await Promise.all([
    LearningEvent.distinct("userId", { userId: { $in: userIds }, occurredAt: periodRange }),
    ProblemAttempt.distinct("userId", { userId: { $in: userIds }, submittedAt: periodRange }),
    ConceptProgress.distinct("userId", { userId: { $in: userIds }, completedAt: periodRange }),
    ProblemAttempt.distinct("problemId", {
      ...dummyAttemptFilter(userIds),
      submittedAt: periodRange,
    }),
    LearningEvent.aggregate([
      {
        $match: {
          userId: { $in: dummyUserIds },
          occurredAt: periodRange,
          "metadata.datasetKey": DATASET_KEY,
        },
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            day: { $dateToString: { date: "$occurredAt", format: "%Y-%m-%d", timezone: "Asia/Seoul" } },
          },
        },
      },
      { $group: { _id: "$_id.userId", learningDays: { $sum: 1 } } },
    ]),
    ProblemAttempt.aggregate([
      {
        $match: {
          ...dummyAttemptFilter(dummyUserIds),
          submittedAt: periodRange,
          reviewSourceAttemptId: null,
          attemptNumber: 1,
        },
      },
      {
        $group: {
          _id: "$userId",
          firstAttempts: { $sum: 1 },
          correct: { $sum: { $cond: ["$isCorrect", 1, 0] } },
          reviewedWrong: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isCorrect", false] }, { $eq: ["$review.status", "completed"] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    ConceptProgress.aggregate([
      {
        $match: {
          userId: { $in: dummyUserIds },
          curriculumId: DATASET_KEY,
          courseId: COURSE_ID,
          status: "completed",
          completedAt: periodRange,
        },
      },
      { $group: { _id: "$userId", completedConcepts: { $sum: 1 } } },
    ]),
    getAcademyMonthlyStatistics({ studentUserIds: userIds, periodKey: period.key, now }),
    getStudentMathMaps({ studentUserIds: dummyUserIds }),
    getClassMathMap({ studentUserIds: dummyUserIds }),
  ]);
  const linkedProblemCount = await Problem.countDocuments({ _id: { $in: datasetProblemIds } });
  const seedAttendanceRecords = await AcademyAttendance.find({
    studentUserId: { $in: dummyUserIds },
    source: "SEED",
  }).select("_id sessionId").lean();
  const seedAttendanceIds = seedAttendanceRecords.map((record) => record._id);
  const seedSessionIds = [...new Set(seedAttendanceRecords.map((record) => String(record.sessionId || "")).filter(Boolean))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const [linkedSeedSessions, linkedSeedAudits] = await Promise.all([
    AcademyAttendanceSession.countDocuments({ _id: { $in: seedSessionIds }, academyId: academy._id }),
    AcademyAttendanceAudit.countDocuments({ attendanceId: { $in: seedAttendanceIds }, actorType: "SYSTEM" }),
  ]);
  const assignedClassIds = [...new Set(dummyMembers.map((membership) => String(membership.classId || "")).filter(Boolean))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const seededClassWeekCount = await AcademyClassWeek.countDocuments({
    academyId: academy._id,
    classId: { $in: assignedClassIds },
    lessonSummary: new RegExp(`^\\[${DATASET_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`),
  });
  const usersWithRecords = new Set(
    [...learningUsers, ...attemptUsers, ...conceptUsers].map(String)
  );
  const nonDummyWithRecords = nonDummyMembers.filter((membership) =>
    usersWithRecords.has(String(membership.studentUserId._id))
  ).length;
  const studentProfiles = new Map(dummyUserIds.map((userId) => [String(userId), {
    learningDays: 0,
    firstAttempts: 0,
    correct: 0,
    reviewedWrong: 0,
    completedConcepts: 0,
  }]));
  studentLearningRows.forEach((row) => {
    const profile = studentProfiles.get(String(row._id));
    if (profile) profile.learningDays = Number(row.learningDays || 0);
  });
  studentAttemptRows.forEach((row) => {
    const profile = studentProfiles.get(String(row._id));
    if (profile) {
      profile.firstAttempts = Number(row.firstAttempts || 0);
      profile.correct = Number(row.correct || 0);
      profile.reviewedWrong = Number(row.reviewedWrong || 0);
    }
  });
  studentConceptRows.forEach((row) => {
    const profile = studentProfiles.get(String(row._id));
    if (profile) profile.completedConcepts = Number(row.completedConcepts || 0);
  });
  const profileValues = [...studentProfiles.values()];
  const profilesWithRecords = profileValues.filter((profile) =>
    profile.learningDays > 0 && profile.firstAttempts > 0
  );
  const profileSignatures = new Set(profileValues.map((profile) =>
    [
      profile.learningDays,
      profile.firstAttempts,
      profile.correct,
      profile.reviewedWrong,
      profile.completedConcepts,
    ].join(":")
  ));
  const rangeFor = (field) => ({
    minimum: profileValues.length ? Math.min(...profileValues.map((profile) => profile[field])) : 0,
    maximum: profileValues.length ? Math.max(...profileValues.map((profile) => profile[field])) : 0,
  });

  if (orphanMemberships) {
    throw new Error(`실제 User 문서가 없는 승인 소속 ${orphanMemberships}건을 발견했습니다.`);
  }
  if (statistics.values.totalStudents !== connectedMemberships.length) {
    throw new Error("학원 통계의 학생 수와 실제 승인 소속 User 연결 수가 일치하지 않습니다.");
  }
  if (linkedProblemCount !== datasetProblemIds.length) {
    throw new Error("학원 지표용 더미 풀이 중 실제 Problem 문서와 연결되지 않은 기록이 있습니다.");
  }
  const targetMathMapConceptIds = new Set(MATH_MAP_CONCEPTS.map((concept) => concept.conceptId));
  const mathMapProfiles = dummyUserIds.map((userId) => studentMathMaps.get(String(userId)));
  const targetMathMapConcepts = new Map(mathMapProfiles.map((map) => [
    map.userId,
    map.concepts.filter((concept) => targetMathMapConceptIds.has(concept.id)),
  ]));
  const mathMapStatusCounts = mathMapProfiles.reduce(
    (counts, map) => {
      (targetMathMapConcepts.get(map.userId) || []).forEach((concept) => {
        counts[concept.status] += 1;
      });
      return counts;
    },
    { MASTERED: 0, DEVELOPING: 0, WEAK: 0, UNKNOWN: 0 }
  );
  const allStudentsHaveMathMap = mathMapProfiles.every((map) => {
    const targetConcepts = targetMathMapConcepts.get(map.userId) || [];
    return targetConcepts.length === MATH_MAP_CONCEPTS.length &&
    targetConcepts.filter((concept) => concept.status !== "UNKNOWN").length >= 2 &&
    targetConcepts
      .filter((concept) => concept.status !== "UNKNOWN")
      .every((concept) => concept.evidence.attemptCount >= 5 && concept.evidence.problemTypeCount >= 3);
  });
  const mathMapHasStatusVariety =
    mathMapStatusCounts.DEVELOPING > 0 &&
    mathMapStatusCounts.WEAK > 0 &&
    (dummyUserIds.length < 2 || mathMapStatusCounts.MASTERED > 0) &&
    (dummyUserIds.length < 3 || mathMapStatusCounts.UNKNOWN > 0);
  const mathMapHasClassBottleneck = classMathMap.bottlenecks.some(
    (item) => targetMathMapConceptIds.has(item.conceptId)
  );
  if (requireMathMap && !allStudentsHaveMathMap) {
    throw new Error("학생별 Math Map 표본 수 또는 문제 유형 다양성 검증에 실패했습니다.");
  }
  if (requireMathMap && !mathMapHasStatusVariety) {
    throw new Error("Math Map 더미 상태 분포가 Weak/Developing/Mastered/Unknown 다양성 기준을 충족하지 못했습니다.");
  }
  if (requireMathMap && !mathMapHasClassBottleneck) {
    throw new Error("Math Map 더미 데이터에서 검증 대상 반 병목이 계산되지 않았습니다.");
  }
  if (requireMathMap && dummyMembershipsWithClass !== dummyMembers.length) {
    throw new Error("반에 배정되지 않은 테스트 학생이 있어 회차 기반 출결을 만들 수 없습니다.");
  }
  if (requireMathMap && (linkedSeedSessions !== seedSessionIds.length || linkedSeedAudits !== seedAttendanceRecords.length)) {
    throw new Error("더미 출결 기록과 실제 수업 회차 또는 감사 이력 연결이 일치하지 않습니다.");
  }

  return {
    academyId: String(academy._id),
    periodKey: period.key,
    approvedMemberships: memberships.length,
    existingUserLinks: connectedMemberships.length,
    orphanMemberships,
    dummyMembers: dummyMembers.length,
    nonDummyMembers: nonDummyMembers.length,
    dummyMembershipsWithClass,
    usersWithActualLearningRecords: usersWithRecords.size,
    nonDummyMembersWithLearningRecords: nonDummyWithRecords,
    dummyDatasetProblemReferences: datasetProblemIds.length,
    linkedProblemReferences: linkedProblemCount,
    perStudentRandomData: {
      students: profileValues.length,
      studentsWithRecords: profilesWithRecords.length,
      distinctMetricProfiles: profileSignatures.size,
      learningDays: rangeFor("learningDays"),
      firstAttempts: rangeFor("firstAttempts"),
      correctAnswers: rangeFor("correct"),
      reviewedWrongAnswers: rangeFor("reviewedWrong"),
      completedConcepts: rangeFor("completedConcepts"),
      allDummyStudentsHaveRecords: profilesWithRecords.length === profileValues.length,
    },
    mathMap: {
      graphVersion: classMathMap.graphVersion,
      modelVersion: classMathMap.modelVersion,
      analyzedConcepts: classMathMap.analyzedConceptCount,
      overallMastery: classMathMap.overallMastery,
      classBottlenecks: classMathMap.bottlenecks.length,
      statusCounts: mathMapStatusCounts,
      allStudentsHaveMathMap,
      statusVarietyVerified: mathMapHasStatusVariety,
      classBottleneckVerified: mathMapHasClassBottleneck,
      perStudent: mathMapProfiles.map((map) => ({
        userId: map.userId,
        overallMastery: map.overallMastery,
        seededConcepts: (targetMathMapConcepts.get(map.userId) || []).length,
        analyzedSeededConcepts: (targetMathMapConcepts.get(map.userId) || [])
          .filter((concept) => concept.status !== "UNKNOWN").length,
        unknownSeededConcepts: (targetMathMapConcepts.get(map.userId) || [])
          .filter((concept) => concept.status === "UNKNOWN").length,
        bottlenecks: map.bottlenecks.length,
        recommendation: map.recommendation?.conceptTitle || null,
      })),
    },
    statistics: statistics.values,
    samples: statistics.samples,
    connectionVerified:
      orphanMemberships === 0 &&
      statistics.values.totalStudents === connectedMemberships.length,
    problemReferencesVerified: linkedProblemCount === datasetProblemIds.length,
    attendanceSessionConnection: {
      records: seedAttendanceRecords.length,
      distinctSessions: seedSessionIds.length,
      linkedSessions: linkedSeedSessions,
      linkedAudits: linkedSeedAudits,
      verified:
        dummyMembershipsWithClass === dummyMembers.length &&
        linkedSeedSessions === seedSessionIds.length &&
        linkedSeedAudits === seedAttendanceRecords.length,
    },
    classWeeks: {
      records: seededClassWeekCount,
      assignedClasses: assignedClassIds.length,
      verified: assignedClassIds.length > 0 && seededClassWeekCount >= assignedClassIds.length * 4,
    },
  };
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  try {
    const now = new Date();
    const academy = await findExactTargetAcademy();
    const approvedMemberships = await AcademyStudentMembership.find({
      academyId: academy._id,
      status: "APPROVED",
    }).select("studentUserId classId").lean();
    const activeClasses = await AcademyClass.find({ academyId: academy._id, isActive: true })
      .select("_id createdByUserId homeroomTeacherUserId schedule attendancePolicy")
      .sort({ name: 1, _id: 1 })
      .lean();
    if (!activeClasses.length) throw new Error("테스트 학원에 활성 반이 없어 더미 학생과 출결 회차를 연결할 수 없습니다.");
    const approvedUserIds = approvedMemberships.map((membership) => membership.studentUserId);
    const users = await User.find(testUserFilter(approvedUserIds))
      .select("_id name realName role isTestAccount testBatchKey")
      .sort({ testBatchKey: 1, name: 1, _id: 1 })
      .lean();
    if (!users.length) throw new Error("학원에 승인된 활성 테스트 계정을 찾을 수 없습니다.");
    const membershipByUserId = new Map(
      approvedMemberships.map((membership) => [String(membership.studentUserId), membership])
    );
    const activeClassIds = new Set(activeClasses.map((academyClass) => String(academyClass._id)));
    users.forEach((user, index) => {
      user.academyId = academy._id;
      const currentClassId = membershipByUserId.get(String(user._id))?.classId || null;
      user.classId = currentClassId && activeClassIds.has(String(currentClassId))
        ? currentClassId
        : activeClasses[index % activeClasses.length]._id;
      user.recordedByUserId = academy.createdByUserId;
    });
    const userIds = users.map((user) => user._id);

    const runSeed = PROVIDED_RUN_SEED || randomBytes(16).toString("hex");
    const dataset = buildDataset(users, now, runSeed);
    const currentWeekday = new Date(`${getKstDateKey(now)}T00:00:00Z`).getUTCDay();
    dataset.operations.membershipAssignments = users.map((user) => ({
      updateOne: {
        filter: { academyId: academy._id, studentUserId: user._id, status: "APPROVED" },
        update: { $set: { classId: user.classId } },
      },
    }));
    dataset.operations.classSetup = activeClasses.map((academyClass, index) => {
      const hasSchedule = Boolean(
        academyClass.schedule?.weekdays?.length &&
        academyClass.schedule?.startTime &&
        academyClass.schedule?.endTime &&
        academyClass.schedule?.effectiveFrom
      );
      const startHour = 17 + (index % 3);
      return {
        updateOne: {
          filter: { _id: academyClass._id, academyId: academy._id },
          update: {
            $set: {
              homeroomTeacherUserId: academyClass.homeroomTeacherUserId || academyClass.createdByUserId || academy.createdByUserId,
              ...(hasSchedule ? {} : {
                schedule: {
                  weekdays: [currentWeekday, (currentWeekday + 3) % 7].sort((left, right) => left - right),
                  startTime: `${String(startHour).padStart(2, "0")}:00`,
                  endTime: `${String(startHour + 2).padStart(2, "0")}:00`,
                  effectiveFrom: getKstDateKey(now),
                  timezone: "Asia/Seoul",
                },
                attendancePolicy: {
                  mode: index % 2 === 0 ? "SELF_CODE" : "MANUAL",
                  opensBeforeMinutes: 10,
                  lateAfterMinutes: 5,
                  closesAfterMinutes: 20,
                },
              }),
            },
          },
        },
      };
    });
    dataset.operations.classWeeks = buildClassWeekOperations({ academy, activeClasses, now });
    const existingDatasetCounts = {
      learningEvents: await LearningEvent.countDocuments({
        userId: { $in: userIds },
        "metadata.datasetKey": { $in: allDatasetKeys() },
      }),
      problemAttempts: await ProblemAttempt.countDocuments(dummyAttemptFilter(userIds)),
      conceptProgress: await ConceptProgress.countDocuments({
        userId: { $in: userIds },
        curriculumId: { $in: allDatasetKeys() },
        courseId: COURSE_ID,
      }),
      attendance: await AcademyAttendance.countDocuments({
        studentUserId: { $in: userIds },
        source: "SEED",
      }),
    };
    const preview = {
      apply: APPLY,
      database: mongoose.connection.name,
      academy: { id: String(academy._id), name: academy.name },
      approvedMemberships: approvedMemberships.length,
      targetedTestUsers: users.length,
      excludedNonTestMemberships: approvedMemberships.length - users.length,
      datasetKey: DATASET_KEY,
      runSeed: dataset.runSeed,
      privateMathMapProblemDocuments: dataset.operations.problems.length,
      mathMapConcepts: MATH_MAP_CONCEPTS.map((concept) => concept.conceptId),
      existingDatasetCounts,
      periodPlans: dataset.periodPlans,
      totalOperations: {
        membershipAssignments: dataset.operations.membershipAssignments.length,
        classSetup: dataset.operations.classSetup.length,
        classWeeks: dataset.operations.classWeeks.length,
        problems: dataset.operations.problems.length,
        learningEvents: dataset.operations.learningEvents.length,
        problemAttempts: dataset.operations.problemAttempts.length,
        conceptProgress: dataset.operations.conceptProgress.length,
        attendance: dataset.operations.attendance.length,
        attendanceSessions: dataset.operations.attendanceSessions.length,
        attendanceAudits: dataset.operations.attendanceAudits.length,
      },
    };

    if (!APPLY) {
      const verification = await verifyAcademyUserConnection({
        academy,
        period: dataset.periods[0],
        now,
      });
      console.log(JSON.stringify({ ...preview, currentConnection: verification }, null, 2));
      return;
    }
    if (!CONFIRMED) {
      throw new Error(`실행하려면 --confirm=${CONFIRMATION}를 함께 지정해야 합니다.`);
    }

    const { cleanupResults, writeResults } = await replaceExistingDummyDataset({
      userIds,
      operations: dataset.operations,
    });
    const verification = [];
    for (const period of dataset.periods) {
      verification.push(await verifyAcademyUserConnection({ academy, period, now, requireMathMap: true }));
    }
    console.log(JSON.stringify({
      ...preview,
      cleanupResults,
      writeResults,
      verification,
      completed: verification.every((item) =>
        item.connectionVerified &&
        item.problemReferencesVerified &&
        item.attendanceSessionConnection.verified &&
        item.classWeeks.verified &&
        item.perStudentRandomData.allDummyStudentsHaveRecords &&
        item.mathMap.allStudentsHaveMathMap &&
        item.mathMap.statusVarietyVerified &&
        item.mathMap.classBottleneckVerified
      ),
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error.stack || error.message);
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = {
  DATASET_KEY,
  MATH_MAP_CONCEPTS,
  buildClassWeekOperations,
  buildDataset,
  buildMathMapProblemCatalog,
  createSeededRandom,
  deterministicObjectId,
};

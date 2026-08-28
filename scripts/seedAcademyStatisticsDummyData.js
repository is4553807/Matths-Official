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
  AcademyStudentMembership,
} = require("../models/academyModel");
const {
  getAcademyMonthlyStatistics,
  _private: { resolvePeriod },
} = require("../services/academyStatisticsService");

const TARGET_ACADEMY_NAME = "테스트 수학학원";
const DATASET_KEY = "academy-metrics-v1";
const COURSE_ID = "academy-dashboard-dummy";
const CONFIRMATION = "SEED_TEST_ACADEMY_METRICS";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes(`--confirm=${CONFIRMATION}`);
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const BULK_CHUNK_SIZE = 500;
const MAX_FIRST_ATTEMPTS = 18;
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
    .select("_id name status")
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

function buildDataset(users, now = new Date(), problems = [], runSeed = randomBytes(16).toString("hex")) {
  const currentPeriod = resolvePeriod("", now);
  const periods = currentPeriod.options.map((option) => resolvePeriod(option.key, now));
  const requiredProblemCount = periods.length * MAX_FIRST_ATTEMPTS;
  if (problems.length < requiredProblemCount) {
    throw new Error(`학원 지표 더미 데이터에는 사용 가능한 실제 문제 ${requiredProblemCount}개가 필요합니다.`);
  }
  const learningEventOperations = [];
  const problemAttemptOperations = [];
  const conceptProgressOperations = [];
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

      const firstAttemptAccuracy = 0.35 + random() * 0.6;
      const wrongAnswerReviewProbability = 0.25 + random() * 0.7;
      const retryProbability = 0.2 + random() * 0.65;
      const retrySuccessProbability = 0.35 + random() * 0.6;

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

      const firstAttemptCount = randomInteger(random, 3, MAX_FIRST_ATTEMPTS);
      plannedFirstAttempts += firstAttemptCount;
      for (let attemptIndex = 0; attemptIndex < firstAttemptCount; attemptIndex += 1) {
        const problemKey = `${DATASET_KEY}:${runSeed}:${period.key}:${user._id}:problem:${attemptIndex}`;
        const problem = problems[periodIndex * MAX_FIRST_ATTEMPTS + attemptIndex];
        const problemId = problem._id;
        const attemptId = deterministicObjectId(`${problemKey}:attempt:1`);
        const submittedAt = activityTimes[randomInteger(random, 0, activityTimes.length - 1)];
        const isCorrect = randomChance(random, firstAttemptAccuracy);
        const reviewed = !isCorrect && randomChance(random, wrongAnswerReviewProbability);
        const reviewedAt = reviewed ? boundedAfter(submittedAt, 2, period) : null;
        problemAttemptOperations.push({
          updateOne: {
            filter: { _id: attemptId },
            update: {
              $set: {
                userId: user._id,
                problemId,
                reviewSourceAttemptId: null,
                curriculumId: problem.curriculumId,
                courseId: problem.courseId,
                unitId: problem.unitId,
                conceptId: problem.primaryConceptId,
                attemptNumber: 1,
                submittedAnswer: isCorrect ? "dummy-correct" : "dummy-wrong",
                problemSnapshot: {
                  typeId: DATASET_KEY,
                  stem: "학원 통계 검증용 더미 문제",
                  choices: [],
                  solution: "통계 집계 검증용 데이터",
                  difficulty: randomInteger(random, 1, 5),
                },
                isCorrect,
                score: isCorrect ? 1 : 0,
                maxScore: 1,
                responseTimeMs: randomInteger(random, 18, 140) * 1_000,
                hintsUsed: randomChance(random, 0.22) ? randomInteger(random, 1, 2) : 0,
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

        const shouldRetry = !isCorrect && randomChance(random, retryProbability);
        if (shouldRetry) {
          plannedRetries += 1;
          const retryCorrect = randomChance(random, retrySuccessProbability);
          problemAttemptOperations.push({
            updateOne: {
              filter: { _id: deterministicObjectId(`${problemKey}:attempt:2`) },
              update: {
                $set: {
                  userId: user._id,
                  problemId,
                  reviewSourceAttemptId: attemptId,
                  curriculumId: problem.curriculumId,
                  courseId: problem.courseId,
                  unitId: problem.unitId,
                  conceptId: problem.primaryConceptId,
                  attemptNumber: 2,
                  submittedAnswer: retryCorrect ? "dummy-retry-correct" : "dummy-retry-wrong",
                  problemSnapshot: {
                    typeId: DATASET_KEY,
                    stem: "학원 통계 검증용 오답 재도전",
                    choices: [],
                    solution: "통계 집계 검증용 데이터",
                    difficulty: randomInteger(random, 1, 5),
                  },
                  isCorrect: retryCorrect,
                  score: retryCorrect ? 1 : 0,
                  maxScore: 1,
                  responseTimeMs: randomInteger(random, 15, 105) * 1_000,
                  hintsUsed: 0,
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
      }

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

  return {
    runSeed,
    periods,
    periodPlans,
    operations: {
      learningEvents: learningEventOperations,
      problemAttempts: problemAttemptOperations,
      conceptProgress: conceptProgressOperations,
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
      const learningEvents = await LearningEvent.deleteMany(
        { userId: { $in: userIds }, "metadata.datasetKey": DATASET_KEY },
        { session }
      );
      const problemAttempts = await ProblemAttempt.deleteMany(
        { userId: { $in: userIds }, "problemSnapshot.typeId": DATASET_KEY },
        { session }
      );
      const conceptProgress = await ConceptProgress.deleteMany(
        { userId: { $in: userIds }, curriculumId: DATASET_KEY, courseId: COURSE_ID },
        { session }
      );
      cleanupResults = {
        learningEvents: Number(learningEvents.deletedCount || 0),
        problemAttempts: Number(problemAttempts.deletedCount || 0),
        conceptProgress: Number(conceptProgress.deletedCount || 0),
      };
      writeResults = {
        learningEvents: await runBulkOperations(LearningEvent, operations.learningEvents, session),
        problemAttempts: await runBulkOperations(ProblemAttempt, operations.problemAttempts, session),
        conceptProgress: await runBulkOperations(ConceptProgress, operations.conceptProgress, session),
      };
    });
  } finally {
    await session.endSession();
  }
  return { cleanupResults, writeResults };
}

async function verifyAcademyUserConnection({ academy, period, now = new Date() }) {
  const memberships = await AcademyStudentMembership.find({
    academyId: academy._id,
    status: "APPROVED",
  })
    .select("studentUserId")
    .populate("studentUserId", "name realName role isTestAccount testBatchKey accountStatus isActive")
    .lean();
  const connectedMemberships = memberships.filter((membership) => membership.studentUserId);
  const orphanMemberships = memberships.length - connectedMemberships.length;
  const userIds = connectedMemberships.map((membership) => membership.studentUserId._id);
  const dummyMembers = connectedMemberships.filter((membership) =>
    membership.studentUserId.isTestAccount === true || membership.studentUserId.role === "test"
  );
  const dummyUserIds = dummyMembers.map((membership) => membership.studentUserId._id);
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
  ] = await Promise.all([
    LearningEvent.distinct("userId", { userId: { $in: userIds }, occurredAt: periodRange }),
    ProblemAttempt.distinct("userId", { userId: { $in: userIds }, submittedAt: periodRange }),
    ConceptProgress.distinct("userId", { userId: { $in: userIds }, completedAt: periodRange }),
    ProblemAttempt.distinct("problemId", {
      userId: { $in: userIds },
      submittedAt: periodRange,
      "problemSnapshot.typeId": DATASET_KEY,
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
          userId: { $in: dummyUserIds },
          submittedAt: periodRange,
          "problemSnapshot.typeId": DATASET_KEY,
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
  ]);
  const linkedProblemCount = await Problem.countDocuments({ _id: { $in: datasetProblemIds } });
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

  return {
    academyId: String(academy._id),
    periodKey: period.key,
    approvedMemberships: memberships.length,
    existingUserLinks: connectedMemberships.length,
    orphanMemberships,
    dummyMembers: dummyMembers.length,
    nonDummyMembers: nonDummyMembers.length,
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
    statistics: statistics.values,
    samples: statistics.samples,
    connectionVerified:
      orphanMemberships === 0 &&
      statistics.values.totalStudents === connectedMemberships.length,
    problemReferencesVerified: linkedProblemCount === datasetProblemIds.length,
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
    }).select("studentUserId").lean();
    const approvedUserIds = approvedMemberships.map((membership) => membership.studentUserId);
    const users = await User.find(testUserFilter(approvedUserIds))
      .select("_id name realName role isTestAccount testBatchKey")
      .sort({ testBatchKey: 1, name: 1, _id: 1 })
      .lean();
    if (!users.length) throw new Error("학원에 승인된 활성 테스트 계정을 찾을 수 없습니다.");
    users.forEach((user) => { user.academyId = academy._id; });
    const userIds = users.map((user) => user._id);

    const nonDatasetUsedProblemIds = await ProblemAttempt.distinct("problemId", {
      userId: { $in: userIds },
      "problemSnapshot.typeId": { $ne: DATASET_KEY },
    });
    const problems = await Problem.find({
      _id: { $nin: nonDatasetUsedProblemIds },
      curriculumId: { $type: "string", $ne: "" },
      courseId: { $type: "string", $ne: "" },
      unitId: { $type: "string", $ne: "" },
      primaryConceptId: { $type: "string", $ne: "" },
    })
      .select("_id curriculumId courseId unitId primaryConceptId")
      .sort({ _id: 1 })
      .limit(resolvePeriod("", now).options.length * MAX_FIRST_ATTEMPTS)
      .lean();

    const runSeed = PROVIDED_RUN_SEED || randomBytes(16).toString("hex");
    const dataset = buildDataset(users, now, problems, runSeed);
    const existingDatasetCounts = {
      learningEvents: await LearningEvent.countDocuments({
        userId: { $in: userIds },
        "metadata.datasetKey": DATASET_KEY,
      }),
      problemAttempts: await ProblemAttempt.countDocuments({
        userId: { $in: userIds },
        "problemSnapshot.typeId": DATASET_KEY,
      }),
      conceptProgress: await ConceptProgress.countDocuments({
        userId: { $in: userIds },
        curriculumId: DATASET_KEY,
        courseId: COURSE_ID,
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
      actualProblemDocumentsUsed: problems.length,
      existingDatasetCounts,
      periodPlans: dataset.periodPlans,
      totalOperations: {
        learningEvents: dataset.operations.learningEvents.length,
        problemAttempts: dataset.operations.problemAttempts.length,
        conceptProgress: dataset.operations.conceptProgress.length,
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
      verification.push(await verifyAcademyUserConnection({ academy, period, now }));
    }
    console.log(JSON.stringify({
      ...preview,
      cleanupResults,
      writeResults,
      verification,
      completed: verification.every((item) =>
        item.connectionVerified &&
        item.problemReferencesVerified &&
        item.perStudentRandomData.allDummyStudentsHaveRecords
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
  buildDataset,
  createSeededRandom,
  deterministicObjectId,
};

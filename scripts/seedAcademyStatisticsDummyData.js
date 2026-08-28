const { createHash } = require("node:crypto");
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

function deterministicObjectId(value) {
  return new mongoose.Types.ObjectId(
    createHash("sha256").update(String(value)).digest("hex").slice(0, 24)
  );
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

function periodActivityTimes(period, requestedCount, seed) {
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
  const rotated = candidates.map((_, index) => candidates[(index + seed) % candidates.length]);
  return rotated.slice(0, count).sort((left, right) => left - right);
}

function boundedAfter(timestamp, hours, period) {
  return new Date(Math.min(
    timestamp.getTime() + hours * HOUR_MS,
    period.reportCutoff.getTime() - 1
  ));
}

function buildDataset(users, now = new Date(), problems = []) {
  const currentPeriod = resolvePeriod("", now);
  const periods = currentPeriod.options.map((option) => resolvePeriod(option.key, now));
  const requiredProblemCount = periods.length * 12;
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

    users.forEach((user, userIndex) => {
      const active = (userIndex + periodIndex * 2) % (periodIndex === 0 ? 6 : 5) !== 0;
      const requestedLearningDays = active ? 3 + ((userIndex * 3 + periodIndex) % 10) : 0;
      const activityTimes = periodActivityTimes(period, requestedLearningDays, userIndex * 2 + periodIndex);
      if (!activityTimes.length) return;
      activeStudents += 1;

      activityTimes.forEach((occurredAt, dayIndex) => {
        const clientEventId = `${DATASET_KEY}:${period.key}:${user._id}:day:${dayIndex}`;
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
                durationMs: (20 + ((userIndex + dayIndex) % 35)) * 60 * 1000,
                metadata: {
                  datasetKey: DATASET_KEY,
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

      const firstAttemptCount = 5 + ((userIndex + periodIndex) % 8);
      plannedFirstAttempts += firstAttemptCount;
      for (let attemptIndex = 0; attemptIndex < firstAttemptCount; attemptIndex += 1) {
        const problemKey = `${DATASET_KEY}:${period.key}:${user._id}:problem:${attemptIndex}`;
        const problem = problems[periodIndex * 12 + attemptIndex];
        const problemId = problem._id;
        const attemptId = deterministicObjectId(`${problemKey}:attempt:1`);
        const submittedAt = activityTimes[(attemptIndex + userIndex) % activityTimes.length];
        const lowAccuracyProfile = userIndex % 7 === 0;
        const isCorrect = lowAccuracyProfile
          ? (attemptIndex + userIndex) % 3 === 0
          : (attemptIndex + userIndex + periodIndex) % 5 !== 0;
        const reviewed = !isCorrect && (attemptIndex + userIndex + periodIndex) % 3 !== 0;
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
                  difficulty: 1 + ((userIndex + attemptIndex) % 5),
                },
                isCorrect,
                score: isCorrect ? 1 : 0,
                maxScore: 1,
                responseTimeMs: 25_000 + ((userIndex + attemptIndex) % 80) * 1_000,
                hintsUsed: (userIndex + attemptIndex) % 4 === 0 ? 1 : 0,
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

        const shouldRetry = !isCorrect && (attemptIndex + userIndex) % 2 === 0;
        if (shouldRetry) {
          plannedRetries += 1;
          const retryCorrect = (attemptIndex + userIndex + periodIndex) % 4 !== 0;
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
                    difficulty: 1 + ((userIndex + attemptIndex) % 5),
                  },
                  isCorrect: retryCorrect,
                  score: retryCorrect ? 1 : 0,
                  maxScore: 1,
                  responseTimeMs: 20_000 + ((userIndex + attemptIndex) % 55) * 1_000,
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

      const completedConceptCount = 1 + ((userIndex + periodIndex) % 4);
      plannedCompletedConcepts += completedConceptCount;
      for (let conceptIndex = 0; conceptIndex < completedConceptCount; conceptIndex += 1) {
        const conceptId = `${DATASET_KEY}-${period.key}-${conceptIndex}`;
        const completedAt = activityTimes[(conceptIndex + userIndex) % activityTimes.length];
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
                masteryProbability: Number((0.62 + ((userIndex + conceptIndex) % 34) / 100).toFixed(2)),
                status: "completed",
                signals: {
                  totalAttempts: 5 + ((userIndex + conceptIndex) % 8),
                  correctAttempts: 3 + ((userIndex + conceptIndex) % 5),
                  totalResponseTimeMs: 180_000,
                  hintsUsed: (userIndex + conceptIndex) % 3,
                  visualizationReplays: 0,
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
    periods,
    periodPlans,
    operations: {
      learningEvents: learningEventOperations,
      problemAttempts: problemAttemptOperations,
      conceptProgress: conceptProgressOperations,
    },
  };
}

async function runBulkOperations(Model, operations) {
  let matched = 0;
  let modified = 0;
  let upserted = 0;
  for (let index = 0; index < operations.length; index += BULK_CHUNK_SIZE) {
    const result = await Model.bulkWrite(
      operations.slice(index, index + BULK_CHUNK_SIZE),
      { ordered: false }
    );
    matched += Number(result.matchedCount || 0);
    modified += Number(result.modifiedCount || 0);
    upserted += Number(result.upsertedCount || 0);
  }
  return { planned: operations.length, matched, modified, upserted };
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
  const nonDummyMembers = connectedMemberships.filter((membership) =>
    membership.studentUserId.isTestAccount !== true && membership.studentUserId.role !== "test"
  );
  const periodRange = { $gte: period.start, $lt: period.reportCutoff };
  const [learningUsers, attemptUsers, conceptUsers, datasetProblemIds, statistics] = await Promise.all([
    LearningEvent.distinct("userId", { userId: { $in: userIds }, occurredAt: periodRange }),
    ProblemAttempt.distinct("userId", { userId: { $in: userIds }, submittedAt: periodRange }),
    ConceptProgress.distinct("userId", { userId: { $in: userIds }, completedAt: periodRange }),
    ProblemAttempt.distinct("problemId", {
      userId: { $in: userIds },
      submittedAt: periodRange,
      "problemSnapshot.typeId": DATASET_KEY,
    }),
    getAcademyMonthlyStatistics({ studentUserIds: userIds, periodKey: period.key, now }),
  ]);
  const linkedProblemCount = await Problem.countDocuments({ _id: { $in: datasetProblemIds } });
  const usersWithRecords = new Set(
    [...learningUsers, ...attemptUsers, ...conceptUsers].map(String)
  );
  const nonDummyWithRecords = nonDummyMembers.filter((membership) =>
    usersWithRecords.has(String(membership.studentUserId._id))
  ).length;

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

    const nonDatasetUsedProblemIds = await ProblemAttempt.distinct("problemId", {
      userId: { $in: users.map((user) => user._id) },
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
      .limit(24)
      .lean();

    const dataset = buildDataset(users, now, problems);
    const preview = {
      apply: APPLY,
      database: mongoose.connection.name,
      academy: { id: String(academy._id), name: academy.name },
      approvedMemberships: approvedMemberships.length,
      targetedTestUsers: users.length,
      excludedNonTestMemberships: approvedMemberships.length - users.length,
      datasetKey: DATASET_KEY,
      actualProblemDocumentsUsed: problems.length,
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

    const writeResults = {
      learningEvents: await runBulkOperations(LearningEvent, dataset.operations.learningEvents),
      problemAttempts: await runBulkOperations(ProblemAttempt, dataset.operations.problemAttempts),
      conceptProgress: await runBulkOperations(ConceptProgress, dataset.operations.conceptProgress),
    };
    const verification = [];
    for (const period of dataset.periods) {
      verification.push(await verifyAcademyUserConnection({ academy, period, now }));
    }
    console.log(JSON.stringify({
      ...preview,
      writeResults,
      verification,
      completed: verification.every((item) => item.connectionVerified),
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
  deterministicObjectId,
};

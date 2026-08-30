const {
    User,
    ConceptProgress,
    ConceptLesson,
    DailyPlan,
    Problem,
    ProblemAttempt,
    AssessmentAttempt,
    QuickPracticeAttempt,
    PrivateMockExamAttempt,
    Announcement,
    UserNotification,
} = require("../models/matthsModel");
const {
    AccessCycle,
    ArenaAccessState,
    MainToSubConversionResult,
    MockExamSubscription,
} = require("../models/goatArenaModel");
const {
    ARENA_TIER_CONFIG,
    arenaTierByValue,
    arenaTierIndex,
} = require("./arenaTierPolicy");

const {
    loadCurriculum,
    buildLearningViewModel,
} = require("./curriculumService");
const {
    formatDashboardFormula,
} = require("./mathTextService");
const {
    TIME_ZONE,
    getKoreanDateKey,
    getEffectiveStreak,
} = require("./userLifecycleService");
const {
    applyAssessmentGatesToLearningData,
} = require("./assessmentService");
const {
    getCoachView,
    MODES: COACH_MODES,
} = require("./coachMessageService");
const {
    getStudentAttendanceDashboard,
} = require("./academyAttendanceService");

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLISHED_LESSON_CACHE_TTL_MS = Math.max(
    5_000,
    Number(
        process.env
            .DASHBOARD_LESSON_CACHE_TTL_MS
    ) || 60_000
);
let publishedLessonCache = null;
let publishedLessonCacheExpiresAt = 0;
let publishedLessonQuery = null;
const DASHBOARD_ANNOUNCEMENT_CACHE_TTL_MS = Math.max(
    5_000,
    Number(
        process.env
            .DASHBOARD_ANNOUNCEMENT_CACHE_TTL_MS
    ) || 30_000
);
let dashboardAnnouncementCache = null;
let dashboardAnnouncementCacheExpiresAt = 0;
let dashboardAnnouncementQuery = null;

const ERROR_LABELS = {
    "calculation-error": "계산 과정에서 실수",
    "formula-confusion": "공식 적용에서 막힘",
    "missing-condition": "문제 조건을 놓침",
    "sign-error": "부호 계산에서 실수",
    "concept-not-understood": "핵심 개념 이해가 부족함",
    "prerequisite-missing": "선행 개념 복습이 필요함",
    unknown: "풀이 과정을 다시 확인해야 함",
};

async function getPublishedLessons(
    curriculumId
) {
    if (
        publishedLessonCache &&
        publishedLessonCacheExpiresAt >
            Date.now()
    ) {
        return publishedLessonCache;
    }

    if (publishedLessonQuery) {
        return publishedLessonQuery;
    }

    publishedLessonQuery =
        ConceptLesson.find({
            curriculumId,
            isPublished: true,
        })
            .select(
                "courseId unitId conceptId estimatedMinutes steps.title dashboardPreview"
            )
            .lean()
            .then((lessons) => {
                publishedLessonCache =
                    lessons;
                publishedLessonCacheExpiresAt =
                    Date.now() +
                    PUBLISHED_LESSON_CACHE_TTL_MS;
                return lessons;
            })
            .finally(() => {
                publishedLessonQuery =
                    null;
            });

    return publishedLessonQuery;
}

async function getDashboardAnnouncements(
    now = new Date()
) {
    if (
        dashboardAnnouncementCache &&
        dashboardAnnouncementCacheExpiresAt >
            now.getTime()
    ) {
        return dashboardAnnouncementCache;
    }

    if (dashboardAnnouncementQuery) {
        return dashboardAnnouncementQuery;
    }

    dashboardAnnouncementQuery =
        Announcement.find({
            isPublished: true,
            publishedAt: {
                $ne: null,
            },
            $or: [
                {
                    dashboardEndsAt: null,
                },
                {
                    dashboardEndsAt: {
                        $gte: now,
                    },
                },
            ],
        })
            .sort({ publishedAt: -1 })
            .limit(3)
            .select(
                "title content href publishedAt"
            )
            .lean()
            .then((announcements) => {
                dashboardAnnouncementCache =
                    announcements;
                dashboardAnnouncementCacheExpiresAt =
                    Date.now() +
                    DASHBOARD_ANNOUNCEMENT_CACHE_TTL_MS;
                return announcements;
            })
            .finally(() => {
                dashboardAnnouncementQuery =
                    null;
            });

    return dashboardAnnouncementQuery;
}

async function getDashboardNotificationData(
    userId
) {
    const [result = {}] =
        await UserNotification.aggregate([
            {
                $match: {
                    userId,
                },
            },
            {
                $facet: {
                    directNotifications: [
                        {
                            $match: {
                                readAt: null,
                            },
                        },
                        {
                            $sort: {
                                createdAt: -1,
                            },
                        },
                        { $limit: 8 },
                        {
                            $project: {
                                title: 1,
                                message: 1,
                                kind: 1,
                            },
                        },
                    ],
                    dashboardUrgentNotifications: [
                        {
                            $match: {
                                kind: {
                                    $in: [
                                        "warning",
                                        "account",
                                        "nickname",
                                        "integrity",
                                    ],
                                },
                                dashboardDismissedAt:
                                    null,
                            },
                        },
                        {
                            $sort: {
                                createdAt: -1,
                            },
                        },
                        { $limit: 5 },
                        {
                            $project: {
                                title: 1,
                                message: 1,
                                kind: 1,
                                createdAt: 1,
                            },
                        },
                    ],
                    dismissedAnnouncements: [
                        {
                            $match: {
                                announcementId: {
                                    $ne: null,
                                },
                            },
                        },
                        {
                            $project: {
                                announcementId: 1,
                                dashboardDismissedAt: 1,
                            },
                        },
                    ],
                },
            },
        ]);

    return {
        directNotifications:
            result.directNotifications || [],
        dashboardUrgentNotifications:
            result.dashboardUrgentNotifications || [],
        dismissedAnnouncements:
            result.dismissedAnnouncements || [],
    };
}

async function getDashboardWrongAttemptData(
    userId
) {
    const [result = {}] =
        await ProblemAttempt.aggregate([
            {
                $match: {
                    userId,
                    isCorrect: false,
                },
            },
            {
                $sort: {
                    submittedAt: -1,
                },
            },
            {
                $facet: {
                    pendingReview: [
                        {
                            $match: {
                                "review.status": {
                                    $in: [
                                        "pending",
                                        "scheduled",
                                    ],
                                },
                            },
                        },
                        { $count: "count" },
                    ],
                    recentWrongAttempts: [
                        { $limit: 3 },
                        {
                            $project: {
                                problemId: 1,
                                maxScore: 1,
                                errorAnalysis: 1,
                                courseId: 1,
                                unitId: 1,
                                conceptId: 1,
                            },
                        },
                        {
                            $lookup: {
                                from:
                                    Problem.collection.name,
                                let: {
                                    problemId:
                                        "$problemId",
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $eq: [
                                                    "$_id",
                                                    "$$problemId",
                                                ],
                                            },
                                        },
                                    },
                                    {
                                        $project: {
                                            stem: 1,
                                            score: 1,
                                        },
                                    },
                                ],
                                as: "problem",
                            },
                        },
                        {
                            $set: {
                                problemId: {
                                    $ifNull: [
                                        {
                                            $arrayElemAt: [
                                                "$problem",
                                                0,
                                            ],
                                        },
                                        null,
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                problem: 0,
                            },
                        },
                    ],
                },
            },
        ]);

    return {
        pendingReviewCount:
            Number(
                result.pendingReview?.[0]
                    ?.count
            ) || 0,
        recentWrongAttempts:
            result.recentWrongAttempts || [],
    };
}

function createDateSeries(length = 14) {
    return Array.from(
        { length },
        (_, index) => {
            const daysAgo = length - index - 1;
            const date = new Date(
                Date.now() - daysAgo * DAY_MS
            );

            return {
                date,
                dateKey: getKoreanDateKey(date),
            };
        }
    );
}

function koreanDateKeyToUtc(dateKey) {
    return new Date(
        `${dateKey}T00:00:00+09:00`
    );
}

function dateToKoreanKeyExpression(field) {
    return {
        $dateToString: {
            date: field,
            format: "%Y-%m-%d",
            timezone: TIME_ZONE,
        },
    };
}

function countGradedQuestionsExpression(
    field = "$questions"
) {
    return {
        $size: {
            $filter: {
                input: {
                    $ifNull: [field, []],
                },
                as: "question",
                cond: {
                    $in: [
                        "$$question.isCorrect",
                        [true, false],
                    ],
                },
            },
        },
    };
}

function countCorrectQuestionsExpression(
    field = "$questions"
) {
    return {
        $size: {
            $filter: {
                input: {
                    $ifNull: [field, []],
                },
                as: "question",
                cond: {
                    $eq: [
                        "$$question.isCorrect",
                        true,
                    ],
                },
            },
        },
    };
}

function countBooleanAnswersExpression(
    field = "$correctByQuestion"
) {
    return {
        $size: {
            $filter: {
                input: {
                    $ifNull: [field, []],
                },
                as: "answer",
                cond: {
                    $in: [
                        "$$answer",
                        [true, false],
                    ],
                },
            },
        },
    };
}

function countCorrectBooleanAnswersExpression(
    field = "$correctByQuestion"
) {
    return {
        $size: {
            $filter: {
                input: {
                    $ifNull: [field, []],
                },
                as: "answer",
                cond: {
                    $eq: [
                        "$$answer",
                        true,
                    ],
                },
            },
        },
    };
}

function mergeActivityRows(rowGroups) {
    const merged = new Map();

    for (const rows of rowGroups) {
        for (const row of rows) {
            const dateKey = String(row._id || "");

            if (!dateKey) continue;

            const current = merged.get(dateKey) || {
                durationMs: 0,
                attempts: 0,
                correct: 0,
            };

            current.durationMs += Math.max(
                0,
                Number(row.durationMs) || 0
            );
            current.attempts += Math.max(
                0,
                Number(row.attempts) || 0
            );
            current.correct += Math.max(
                0,
                Number(row.correct) || 0
            );

            merged.set(dateKey, current);
        }
    }

    return merged;
}

async function getLearningActivityRows({
    userId,
    start,
    end,
}) {
    const dateRange = {
        $gte: start,
        $lt: end,
    };

    const [
        practiceRows,
        quickPracticeRows,
        assessmentRows,
        privateMockRows,
    ] = await Promise.all([
        /*
         * ProblemAttempt에는 평가·40초 눈풀이의 오답노트 복제본도
         * 들어간다. 해당 원본 컬렉션에서 별도로 집계하므로 여기서는
         * 일반 개념·오답 복습 풀이만 남겨 중복과 정답률 왜곡을 막는다.
         */
        ProblemAttempt.aggregate([
            {
                $match: {
                    userId,
                    submittedAt: dateRange,
                },
            },
            {
                $lookup: {
                    from: "problems",
                    localField: "problemId",
                    foreignField: "_id",
                    as: "problem",
                },
            },
            {
                $match: {
                    "problem.tags": {
                        $nin: [
                            "assessment",
                            "quick-practice",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id:
                        dateToKoreanKeyExpression(
                            "$submittedAt"
                        ),
                    durationMs: {
                        $sum: {
                            $ifNull: [
                                "$responseTimeMs",
                                0,
                            ],
                        },
                    },
                    attempts: {
                        $sum: 1,
                    },
                    correct: {
                        $sum: {
                            $cond: [
                                "$isCorrect",
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]),

        QuickPracticeAttempt.aggregate([
            {
                $match: {
                    userId,
                    submittedAt: dateRange,
                    status: {
                        $in: [
                            "correct",
                            "wrong",
                            "expired",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id:
                        dateToKoreanKeyExpression(
                            "$submittedAt"
                        ),
                    durationMs: {
                        $sum: {
                            $ifNull: [
                                "$responseTimeMs",
                                0,
                            ],
                        },
                    },
                    attempts: {
                        $sum: 1,
                    },
                    correct: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$status",
                                        "correct",
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]),

        AssessmentAttempt.aggregate([
            {
                $match: {
                    userId,
                    submittedAt: dateRange,
                    status: {
                        $in: [
                            "submitted",
                            "disqualified",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id:
                        dateToKoreanKeyExpression(
                            "$submittedAt"
                        ),
                    durationMs: {
                        $sum: {
                            $ifNull: [
                                "$elapsedTimeMs",
                                0,
                            ],
                        },
                    },
                    attempts: {
                        $sum:
                            countGradedQuestionsExpression(),
                    },
                    correct: {
                        $sum:
                            countCorrectQuestionsExpression(),
                    },
                },
            },
        ]),

        PrivateMockExamAttempt.aggregate([
            {
                $match: {
                    userId,
                    submittedAt: dateRange,
                    status: {
                        $in: [
                            "submitted",
                            "expired",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id:
                        dateToKoreanKeyExpression(
                            "$submittedAt"
                        ),
                    durationMs: {
                        $sum: {
                            $ifNull: [
                                "$elapsedMs",
                                0,
                            ],
                        },
                    },
                    attempts: {
                        $sum:
                            countBooleanAnswersExpression(),
                    },
                    correct: {
                        $sum:
                            countCorrectBooleanAnswersExpression(),
                    },
                },
            },
        ]),
    ]);

    return mergeActivityRows([
        practiceRows,
        quickPracticeRows,
        assessmentRows,
        privateMockRows,
    ]);
}

function createCurriculumIndex(curriculumData) {
    const index = new Map();

    for (const course of curriculumData.courses || []) {
        for (const unit of course.units || []) {
            for (const concept of unit.concepts || []) {
                const key = [
                    course.id,
                    unit.id,
                    concept.id,
                ].join("/");

                index.set(key, {
                    course,
                    unit,
                    concept,
                });
            }
        }
    }

    return index;
}

function createProgressMap(progressDocuments) {
    const concepts = {};

    for (const progress of progressDocuments) {
        const key = [
            progress.courseId,
            progress.unitId,
            progress.conceptId,
        ].join("/");

        concepts[key] = {
            percent: progress.completionPercent,
            completedTopics: progress.completedTopics,
        };
    }

    return { concepts };
}

function serializeDailyPlan(plan) {
    if (!plan) {
        return {
            id: null,
            tasks: [],
            completedCount: 0,
            totalCount: 0,
            progress: 0,
            message: "오늘의 학습 계획이 아직 없습니다.",
        };
    }

    const tasks = (plan.tasks || []).map((task) => ({
        id: String(task._id),
        kind: task.kind,
        title: task.title,
        description: task.description,
        href: task.href,
        estimatedMinutes: task.estimatedMinutes,
        status: task.status,
    }));

    const completedCount = tasks.filter(
        (task) => task.status === "completed"
    ).length;

    const totalCount = tasks.length;

    const progress = totalCount
        ? Math.round(
              (completedCount / totalCount) * 100
          )
        : 0;

    let message = plan.messages?.empty || "";

    if (
        completedCount > 0 &&
        completedCount < totalCount
    ) {
        message = plan.messages?.partial || "";
    }

    if (
        totalCount > 0 &&
        completedCount === totalCount
    ) {
        message = plan.messages?.complete || "";
    }

    return {
        id: String(plan._id),
        tasks,
        completedCount,
        totalCount,
        progress,
        message,
    };
}

function getAttemptRate(stat) {
    if (!stat || !stat.attempts) {
        return 0;
    }

    return Math.round(
        (stat.correct / stat.attempts) * 100
    );
}

function signedText(value, unit) {
    if (value > 0) {
        return `지난 기간보다 +${value}${unit}`;
    }

    if (value < 0) {
        return `지난 기간보다 ${value}${unit}`;
    }

    return "지난 기간과 동일";
}

async function getDashboardData(
    userId,
    { user: authenticatedUser = null } = {}
) {
    const user = authenticatedUser
        ? typeof authenticatedUser.toObject === "function"
            ? authenticatedUser.toObject()
            : authenticatedUser
        : await User.findById(userId).lean();

    if (!user) {
        const error = new Error(
            "사용자 정보를 찾을 수 없습니다."
        );

        error.status = 404;
        throw error;
    }

    const curriculumData = loadCurriculum();
    const curriculumIndex =
        createCurriculumIndex(curriculumData);

    const dateSeries = createDateSeries(14);
    const currentWeekSeries = dateSeries.slice(7);

    const aggregateStart =
        koreanDateKeyToUtc(
            dateSeries[0].dateKey
        );

    const todayKey =
        currentWeekSeries[
            currentWeekSeries.length - 1
        ].dateKey;

    const [
        progressDocuments,
        lessons,
        dailyPlan,
        activityByDate,
        wrongAttemptData,
        assessmentAttempts,
        notificationData,
        announcements,
        activeAccessCycle,
        arenaAccessState,
        latestMainToSubReference,
        activeMockExamSubscription,
        attendanceDashboard,
    ] = await Promise.all([
        ConceptProgress.find({
            userId: user._id,
            curriculumId:
                curriculumData.curriculum?.id ||
                "kr-2022",
        })
            .sort({ lastStudiedAt: -1 })
            .lean(),

        getPublishedLessons(
            curriculumData.curriculum?.id ||
                "kr-2022"
        ),

        DailyPlan.findOne({
            userId: user._id,
            dateKey: todayKey,
        }).lean(),

        getLearningActivityRows({
            userId: user._id,
            start: aggregateStart,
            end: new Date(
                koreanDateKeyToUtc(todayKey)
                    .getTime() + DAY_MS
            ),
        }),

        getDashboardWrongAttemptData(
            user._id
        ),

        AssessmentAttempt.find({
            userId: user._id,
            status: "submitted",
            passed: true,
        })
            .select(
                "scopeType courseId unitId subunitId passed scorePercent"
            )
            .lean(),

        getDashboardNotificationData(
            user._id
        ),

        getDashboardAnnouncements(),

        AccessCycle.findOne({
            userId: user._id,
            status: "ACTIVE",
        })
            .select(
                "availableLearningDays reservedLearningDays lockedLearningDays expiresAt"
            )
            .lean(),

        ArenaAccessState.findOne({
            userId: user._id,
        })
            .select(
                "currentCompetitiveDivision state lastMainSnapshotId renewalGraceDeadline"
            )
            .lean(),

        MainToSubConversionResult.findOne({
            userId: user._id,
            snapshotValid: true,
            integrityStatus: "CLEAR",
        })
            .sort({ createdAt: -1 })
            .select(
                "renewalGraceDeadline referenceSubRank referenceSubGp referenceSubOverallPosition"
            )
            .lean(),

        MockExamSubscription.findOne({
            userId: user._id,
            status: "ACTIVE",
            endsAt: { $gt: new Date() },
        })
            .sort({ endsAt: -1 })
            .select("endsAt")
            .lean(),

        getStudentAttendanceDashboard({
            studentUserId: user._id,
        }),
    ]);
    const {
        directNotifications,
        dashboardUrgentNotifications,
        dismissedAnnouncements,
    } = notificationData;
    const {
        pendingReviewCount,
        recentWrongAttempts,
    } = wrongAttemptData;

    const lessonMap = new Map(
        lessons.map((lesson) => [
            [
                lesson.courseId,
                lesson.unitId,
                lesson.conceptId,
            ].join("/"),
            lesson,
        ])
    );

    const progressMap =
        createProgressMap(progressDocuments);

    const learningData =
        applyAssessmentGatesToLearningData(
            buildLearningViewModel(
                curriculumData,
                progressMap
            ),
            assessmentAttempts
        );

    const currentProgress =
        progressDocuments.find(
            (progress) =>
                progress.status === "in-progress"
        ) ||
        progressDocuments.find(
            (progress) =>
                progress.status !== "completed"
        ) ||
        progressDocuments[0];

    let currentKey = currentProgress
        ? [
              currentProgress.courseId,
              currentProgress.unitId,
              currentProgress.conceptId,
          ].join("/")
        : null;

    if (!currentKey && lessons.length) {
        currentKey = [
            lessons[0].courseId,
            lessons[0].unitId,
            lessons[0].conceptId,
        ].join("/");
    }

    const currentMetadata = currentKey
        ? curriculumIndex.get(currentKey)
        : null;

    const currentLesson = currentKey
        ? lessonMap.get(currentKey)
        : null;

    const lessonSteps =
        currentLesson?.steps || [];

    const selectedStepIndex = Math.min(
        Math.max(
            0,
            Number(currentProgress?.completedTopics) || 0
        ),
        Math.max(lessonSteps.length - 1, 0)
    );

    const selectedStep =
        lessonSteps[selectedStepIndex] || null;

    const currentLearning = currentMetadata
        ? {
              courseTitle:
                  currentMetadata.course.officialTitle,

              unitTitle:
                  currentMetadata.unit.title,

              conceptTitle:
                  currentMetadata.concept.title,

              standardCode:
                  currentMetadata.concept.standardCode,

              progress:
                  currentProgress?.completionPercent ||
                  0,

              href: `/learn/${currentMetadata.course.id}/${currentMetadata.unit.id}/${currentMetadata.concept.id}`,

              estimatedMinutes:
                  currentLesson?.estimatedMinutes ||
                  null,

              stepTitle:
                  selectedStep?.title || null,

              stepLabel: lessonSteps.length
                  ? `STEP ${selectedStepIndex + 1} / ${lessonSteps.length}`
                  : null,

              preview:
                  currentLesson?.dashboardPreview
                      ? {
                            ...currentLesson.dashboardPreview,
                            formula:
                                formatDashboardFormula(
                                    currentLesson
                                        .dashboardPreview
                                        .formula
                                ),
                        }
                      : null,
          }
        : null;

    const activityMap = new Map(
        [...activityByDate.entries()].map(
            ([dateKey, activity]) => [
                dateKey,
                Math.round(
                    activity.durationMs / 60000
                ),
            ]
        )
    );

    const weekdayFormatter =
        new Intl.DateTimeFormat("ko-KR", {
            timeZone: TIME_ZONE,
            weekday: "short",
        });

    const weeklyActivityDays =
        currentWeekSeries.map(
            ({ date, dateKey }, index) => ({
                dateKey,
                label:
                    index ===
                    currentWeekSeries.length - 1
                        ? "오늘"
                        : weekdayFormatter.format(date),
                minutes:
                    activityMap.get(dateKey) || 0,
                isToday:
                    index ===
                    currentWeekSeries.length - 1,
            })
        );

    const previousWeekMinutes = dateSeries
        .slice(0, 7)
        .reduce(
            (total, { dateKey }) =>
                total +
                (activityMap.get(dateKey) || 0),
            0
        );

    const currentWeekMinutes =
        weeklyActivityDays.reduce(
            (total, day) =>
                total + day.minutes,
            0
        );

    const activityMaximum = Math.max(
        10,
        ...weeklyActivityDays.map(
            (day) => day.minutes
        )
    );

    const summarizeAttempts = (series) =>
        series.reduce(
            (summary, { dateKey }) => {
                const activity =
                    activityByDate.get(dateKey);

                if (!activity) {
                    return summary;
                }

                summary.attempts +=
                    activity.attempts;
                summary.correct +=
                    activity.correct;
                return summary;
            },
            {
                attempts: 0,
                correct: 0,
            }
        );

    const currentAttemptStats =
        summarizeAttempts(
            currentWeekSeries
        );

    const previousAttemptStats =
        summarizeAttempts(
            dateSeries.slice(0, 7)
        );

    const currentCorrectRate =
        getAttemptRate(currentAttemptStats);

    const previousCorrectRate =
        getAttemptRate(previousAttemptStats);

    const todayStudyMinutes =
        activityMap.get(todayKey) || 0;
    const todaySolvedProblems =
        Number(activityByDate.get(todayKey)?.attempts) || 0;
    const activeStudyDays =
        weeklyActivityDays.filter(
            (day) => day.minutes > 0
        ).length;
    const averageStudyMinutes =
        activeStudyDays
            ? Math.round(
                  currentWeekMinutes /
                      activeStudyDays
              )
            : 0;

    const weakConcepts = progressDocuments
        .filter(
            (progress) =>
                progress.signals?.totalAttempts > 0
        )
        .map((progress) => {
            const key = [
                progress.courseId,
                progress.unitId,
                progress.conceptId,
            ].join("/");

            const metadata =
                curriculumIndex.get(key);

            const totalAttempts =
                progress.signals.totalAttempts;

            const correctAttempts =
                progress.signals.correctAttempts || 0;

            const accuracy = totalAttempts
                ? Math.round(
                      (correctAttempts /
                          totalAttempts) *
                          100
                  )
                : Math.round(
                      (progress.masteryProbability ||
                          0) * 100
                  );

            return {
                title:
                    metadata?.concept.title ||
                    progress.conceptId,

                unitTitle:
                    metadata?.unit.title ||
                    progress.unitId,

                accuracy,

                href: `/learn/${progress.courseId}/${progress.unitId}/${progress.conceptId}`,
            };
        })
        .sort(
            (left, right) =>
                left.accuracy - right.accuracy
        )
        .slice(0, 3)
        .map((concept, index) => ({
            ...concept,
            rank: index + 1,

            urgency:
                concept.accuracy < 50
                    ? "urgent"
                    : "normal",

            statusText:
                concept.accuracy < 50
                    ? "집중 복습"
                    : concept.accuracy < 70
                        ? "복습 필요"
                        : "한 번 더",
        }));

    const recentWrongAnswers =
        recentWrongAttempts.map((attempt) => ({
            id: String(attempt._id),

            score:
                attempt.maxScore ||
                attempt.problemId?.score ||
                0,

            stem:
                attempt.problemId?.stem ||
                "삭제된 문제",

            reason:
                ERROR_LABELS[
                    attempt.errorAnalysis
                        ?.errorType
                ] || ERROR_LABELS.unknown,

            href: `/learn/${attempt.courseId}/${attempt.unitId}/${attempt.conceptId}`,
        }));

    const curriculumCourses =
        learningData.courses.map((course) => ({
            id: course.id,
            title: course.officialTitle,
            semester: course.defaultSemester,
            completedConcepts:
                course.completedConcepts,
            totalConcepts:
                course.totalConcepts,
            progress: course.progress,
        }));

    const todayPlan =
        serializeDailyPlan(dailyPlan);

    const coachMode =
        user.preferences?.coachMode ||
        "spicy";

    const coachSituation =
        "study_prompt";
    const coach = getCoachView({
        mode: coachMode,
        situation: coachSituation,
        random: true,
    });

    const notifications = [
        ...directNotifications.map(
            (notification) => ({
                title: notification.title,
                description:
                    String(
                        notification.message ||
                            ""
                    ).slice(0, 160),
                href:
                    `/notifications/${notification._id}`,
                kind:
                    notification.kind ||
                    "admin",
                urgent:
                    [
                        "warning",
                        "account",
                        "nickname",
                        "integrity",
                    ].includes(
                        notification.kind
                ),
            })
        ),
    ];

    const activePlan = (() => {
        if (user?.role === "admin") {
            return {
                code: "SUPER_ADMIN",
                name: "관리자 무제한 플랜",
                division: "Unranked · Ranked",
                remainingLearningDays: null,
                availableLearningDays: null,
                reservedLearningDays: 0,
                lockedLearningDays: 0,
                expiresAt: null,
                unlimited: true,
                statusLabel: "무제한 · 만료 없음",
            };
        }
        if (activeAccessCycle) {
            const availableDays = Math.max(
                0,
                Number(activeAccessCycle.availableLearningDays) || 0
            );
            const reservedDays = Math.max(
                0,
                Number(activeAccessCycle.reservedLearningDays) || 0
            );
            const lockedDays = Math.max(
                0,
                Number(activeAccessCycle.lockedLearningDays) || 0
            );
            return {
                code: "LEARNING_PACKAGE",
                name: "29일 학습권 패키지",
                division:
                    arenaAccessState?.currentCompetitiveDivision === "MAIN"
                        ? "Ranked"
                        : "Unranked",
                remainingLearningDays:
                    availableDays + reservedDays + lockedDays,
                availableLearningDays: availableDays,
                reservedLearningDays: reservedDays,
                lockedLearningDays: lockedDays,
                expiresAt: activeAccessCycle.expiresAt,
                statusLabel: "이용 중",
            };
        }
        if (activeMockExamSubscription) {
            return {
                code: "MOCK_EXAM_ONLY",
                name: "Matths 주간 공식 모의고사 이용권",
                division: null,
                remainingLearningDays: 0,
                availableLearningDays: 0,
                reservedLearningDays: 0,
                lockedLearningDays: 0,
                expiresAt: activeMockExamSubscription.endsAt,
                statusLabel: "이용 중",
            };
        }
        return {
            code: "FREE",
            name: "기본학습 패키지",
            division: null,
            remainingLearningDays: 0,
            availableLearningDays: 0,
            reservedLearningDays: 0,
            lockedLearningDays: 0,
            expiresAt: null,
            statusLabel: "기본학습 이용",
        };
    })();

    const accessRenewalNotice = (() => {
        if (
            !["MAIN_DEMOTED_TO_SUB", "SUB_ACCESS_EXPIRED_LOCKED"].includes(
                arenaAccessState?.state
            )
        ) {
            return null;
        }
        const reference = latestMainToSubReference;
        const graceDeadline = reference?.renewalGraceDeadline ||
            arenaAccessState?.renewalGraceDeadline ||
            null;
        const withinGrace = Boolean(
            graceDeadline && new Date(graceDeadline).getTime() >= Date.now()
        );
        const hasMainReference = Boolean(
            arenaAccessState?.state === "MAIN_DEMOTED_TO_SUB" &&
            arenaAccessState?.lastMainSnapshotId &&
            reference
        );
        const referenceTier = hasMainReference
            ? arenaTierByValue(reference.referenceSubRank).label
            : null;
        const referenceTierIndex = hasMainReference
            ? arenaTierIndex(reference.referenceSubRank)
            : 0;
        const lateTier = hasMainReference
            ? ARENA_TIER_CONFIG[Math.max(0, referenceTierIndex - 1)].label
            : null;

        return {
            kind: hasMainReference ? "MAIN_DEMOTION" : "SUB_EXPIRED",
            graceDeadline,
            withinGrace,
            referenceTier,
            referenceGp: hasMainReference
                ? Number(reference.referenceSubGp) || 0
                : null,
            referenceOverallPosition: hasMainReference
                ? Number(reference.referenceSubOverallPosition) || null
                : null,
            lateTier,
            lateGp: hasMainReference
                ? Number(reference.referenceSubGp) || 0
                : null,
        };
    })();

    return {
        user: {
            id: String(user._id),
            name: user.name,
            realName:
                user.realName || "",
            role:
                user.role || "student",
            schoolGrade: user.schoolGrade,
            school: user.school,
            currentStreak:
                getEffectiveStreak(user),
        },

        currentLearning,
        todayPlan,
        coach,
        attendance: attendanceDashboard,
        notifications,
        activeDashboardNotices: [
            ...dashboardUrgentNotifications.map(
                (notification) => ({
                    id: String(
                        notification._id
                    ),
                    title:
                        notification.title,
                    content:
                        notification.message,
                    href:
                        `/notifications/${notification._id}/open`,
                    kind:
                        notification.kind ||
                        "admin",
                    dismissUrl:
                        `/notifications/${notification._id}/dashboard-dismiss`,
                    publishedAt:
                        notification.createdAt,
                })
            ),
            ...announcements
                .filter(
                    (announcement) =>
                        !new Set(
                            dismissedAnnouncements.map(
                                (notification) =>
                                    notification.dashboardDismissedAt
                                        ? String(notification.announcementId)
                                        : ""
                            )
                        ).has(
                            String(
                                announcement._id
                            )
                        )
                )
                .map(
                    (announcement) => ({
                        id: String(
                            announcement._id
                        ),
                        title:
                            announcement.title,
                        content:
                            announcement.content,
                        href:
                            (() => {
                                const inboxNotice =
                                    dismissedAnnouncements.find(
                                        (notification) =>
                                            String(notification.announcementId) ===
                                            String(announcement._id)
                                    );
                                return inboxNotice
                                    ? `/notifications/${inboxNotice._id}/open`
                                    : announcement.href || "/main";
                            })(),
                        kind:
                            "announcement",
                        dismissUrl:
                            `/announcements/${announcement._id}/dismiss`,
                        publishedAt:
                            announcement.publishedAt,
                    })
                ),
        ],
        hasUrgentNotification:
            notifications.some(
                (notification) =>
                    notification.urgent
            ),

        activePlan,
        accessRenewalNotice,

        stats: {
            weeklyStudyMinutes:
                currentWeekMinutes,

            weeklyStudyDetail: signedText(
                currentWeekMinutes -
                    previousWeekMinutes,
                "분"
            ),

            correctRate: currentCorrectRate,

            correctRateDetail: signedText(
                currentCorrectRate -
                    previousCorrectRate,
                "%p"
            ),

            weeklySolvedProblems:
                currentAttemptStats.attempts,

            todaySolvedProblems,

            todayStudyMinutes,

            activeStudyDays,

            averageStudyMinutes,

            pendingReviewCount,
        },

        weeklyActivity: {
            days: weeklyActivityDays,
            maxMinutes: activityMaximum,
        },

        weakConcepts,
        recentWrongAnswers,
        curriculumCourses,

        completedConcepts:
            learningData.completedConcepts,

        totalConcepts:
            learningData.totalConcepts,
    };
}

async function toggleDailyPlanTask(
    userId,
    taskId
) {
    const dateKey = getKoreanDateKey();

    const plan = await DailyPlan.findOne({
        userId,
        dateKey,
    });

    if (!plan) {
        return null;
    }

    const task = plan.tasks.find(
        (item) =>
            String(item._id) === String(taskId)
    );

    if (!task) {
        return null;
    }

    task.status =
        task.status === "completed"
            ? "pending"
            : "completed";

    await plan.save();

    return serializeDailyPlan(plan);
}

async function updateCoachMode(
    userId,
    mode,
    situation = "unanswered"
) {
    if (
        !COACH_MODES.includes(mode)
    ) {
        return null;
    }

    const user =
        await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    "preferences.coachMode": mode,
                },
            },
            {
                returnDocument: "after",
            }
        ).lean();

    if (!user) {
        return null;
    }

    return getCoachView({
        mode,
        situation,
        seed: [
            userId,
            getKoreanDateKey(),
            situation,
        ].join(":"),
    });
}

module.exports = {
    getDashboardData,
    toggleDailyPlanTask,
    updateCoachMode,
};

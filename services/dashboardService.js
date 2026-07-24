const {
    User,
    ConceptProgress,
    ConceptLesson,
    DailyPlan,
    ProblemAttempt,
    LearningEvent,
} = require("../models/matthsModel");

const {
    loadCurriculum,
    buildLearningViewModel,
} = require("./curriculumService");

const DAY_MS = 24 * 60 * 60 * 1000;

const ERROR_LABELS = {
    "calculation-error": "계산 과정에서 실수",
    "formula-confusion": "공식 적용에서 막힘",
    "missing-condition": "문제 조건을 놓침",
    "sign-error": "부호 계산에서 실수",
    "concept-not-understood": "핵심 개념 이해가 부족함",
    "prerequisite-missing": "선행 개념 복습이 필요함",
    unknown: "풀이 과정을 다시 확인해야 함",
};

const COACH_TITLES = {
    mild: "순한맛 모드",
    spicy: "매운맛 모드",
    silent: "무음 모드",
};

function getKoreanDateKey(date = new Date()) {
    const formatter = new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }
    );

    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
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

async function getDashboardData(userId) {
    const user = await User.findById(userId).lean();

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

    const aggregateStart = new Date(
        `${dateSeries[0].dateKey}T00:00:00+09:00`
    );

    const currentWeekStart = new Date(
        `${currentWeekSeries[0].dateKey}T00:00:00+09:00`
    );

    const todayKey =
        currentWeekSeries[
            currentWeekSeries.length - 1
        ].dateKey;

    const [
        progressDocuments,
        lessons,
        dailyPlan,
        attemptStats,
        activityRows,
        totalSolvedProblems,
        pendingReviewCount,
        recentWrongAttempts,
    ] = await Promise.all([
        ConceptProgress.find({
            userId: user._id,
            curriculumId:
                curriculumData.curriculum?.id ||
                "kr-2022",
        })
            .sort({ lastStudiedAt: -1 })
            .lean(),

        ConceptLesson.find({
            curriculumId:
                curriculumData.curriculum?.id ||
                "kr-2022",
            isPublished: true,
        }).lean(),

        DailyPlan.findOne({
            userId: user._id,
            dateKey: todayKey,
        }).lean(),

        ProblemAttempt.aggregate([
            {
                $match: {
                    userId: user._id,
                    submittedAt: {
                        $gte: aggregateStart,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            {
                                $gte: [
                                    "$submittedAt",
                                    currentWeekStart,
                                ],
                            },
                            "current",
                            "previous",
                        ],
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

        LearningEvent.aggregate([
            {
                $match: {
                    userId: user._id,
                    occurredAt: {
                        $gte: aggregateStart,
                    },
                    durationMs: {
                        $ne: null,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            date: "$occurredAt",
                            format: "%Y-%m-%d",
                            timezone: "Asia/Seoul",
                        },
                    },

                    durationMs: {
                        $sum: "$durationMs",
                    },
                },
            },
        ]),

        ProblemAttempt.countDocuments({
            userId: user._id,
        }),

        ProblemAttempt.countDocuments({
            userId: user._id,
            isCorrect: false,
            "review.status": {
                $in: ["pending", "scheduled"],
            },
        }),

        ProblemAttempt.find({
            userId: user._id,
            isCorrect: false,
        })
            .sort({ submittedAt: -1 })
            .limit(3)
            .populate({
                path: "problemId",
                select: "stem score",
            })
            .lean(),
    ]);

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
        buildLearningViewModel(
            curriculumData,
            progressMap
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
                  currentLesson?.dashboardPreview ||
                  null,
          }
        : null;

    const activityMap = new Map(
        activityRows.map((row) => [
            row._id,
            Math.round(row.durationMs / 60000),
        ])
    );

    const weekdayFormatter =
        new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
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

    const currentAttemptStats =
        attemptStats.find(
            (stat) => stat._id === "current"
        ) || {
            attempts: 0,
            correct: 0,
        };

    const previousAttemptStats =
        attemptStats.find(
            (stat) => stat._id === "previous"
        ) || {
            attempts: 0,
            correct: 0,
        };

    const currentCorrectRate =
        getAttemptRate(currentAttemptStats);

    const previousCorrectRate =
        getAttemptRate(previousAttemptStats);

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

    const coach = {
        mode: coachMode,
        title:
            COACH_TITLES[coachMode] ||
            COACH_TITLES.spicy,
        message:
            dailyPlan?.coachMessages?.[
                coachMode
            ] || "",
    };

    const notifications = [];

    if (pendingReviewCount > 0) {
        notifications.push({
            title: `복습할 오답이 ${pendingReviewCount}개 있어요.`,
            description:
                "막힌 개념부터 다시 확인해 보세요.",
            href: "/wrong-notes",
        });
    }

    if (currentLearning) {
        notifications.push({
            title: "이어서 학습할 개념이 있어요.",
            description:
                currentLearning.conceptTitle,
            href: currentLearning.href,
        });
    }

    return {
        user: {
            id: String(user._id),
            name: user.name,
            schoolGrade: user.schoolGrade,
            school: user.school,
            currentStreak:
                user.currentStreak || 0,
        },

        currentLearning,
        todayPlan,
        coach,
        notifications,

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
                "%"
            ),

            totalSolvedProblems,

            weeklySolvedProblems:
                currentAttemptStats.attempts,

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
    mode
) {
    if (
        !["mild", "spicy", "silent"].includes(
            mode
        )
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
                new: true,
            }
        ).lean();

    if (!user) {
        return null;
    }

    const plan = await DailyPlan.findOne({
        userId,
        dateKey: getKoreanDateKey(),
    }).lean();

    return {
        mode,
        title: COACH_TITLES[mode],
        message:
            plan?.coachMessages?.[mode] ||
            "",
    };
}

module.exports = {
    getDashboardData,
    toggleDailyPlanTask,
    updateCoachMode,
};

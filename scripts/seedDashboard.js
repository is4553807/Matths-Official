const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(
        __dirname,
        "..",
        "config.env"
    ),
});

const {
    User,
    ConceptProgress,
    ConceptLesson,
    DailyPlan,
    Problem,
    ProblemAttempt,
    LearningEvent,
} = require("../models/matthsModel");

const {
    loadCurriculum,
} = require("../services/curriculumService");

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days, hours = 0) {
    return new Date(
        Date.now() -
        days * DAY_MS -
        hours * 60 * 60 * 1000
    );
}

function getDateKey(date = new Date()) {
    const formatter =
        new Intl.DateTimeFormat(
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
            .filter(
                (part) =>
                    part.type !== "literal"
            )
            .map(
                (part) => [
                    part.type,
                    part.value,
                ]
            )
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
}

function findConcept(
    curriculum,
    courseId,
    unitId,
    conceptId
) {
    const course =
        curriculum.courses.find(
            (item) =>
                item.id === courseId
        );

    const unit =
        course?.units.find(
            (item) => item.id === unitId
        );

    return unit?.concepts.find(
        (item) => item.id === conceptId
    );
}

async function seed() {
    await mongoose.connect(process.env.DB);

    const targetEmail =
        String(
            process.argv[2] ||
            "demo@matths.kr"
        ).toLowerCase();

    let user = await User.findOne({
        email: targetEmail,
    });

    let createdUser = false;

    if (!user) {
        createdUser = true;

        const passwordHash =
            await bcrypt.hash(
                "REMOVED_FROM_HISTORY",
                12
            );

        user = await User.create({
            name: "매튜",
            email: targetEmail,
            passwordHash,
            schoolGrade: 10,

            school: {
                region: "서울특별시",
                code: "DEMO-SCHOOL",
                name: "Matths 고등학교",
                roadAddress: "",
                establishment: "사립",
                highSchoolType: "일반고",
            },
        });
    }

    await User.findByIdAndUpdate(
        user._id,
        {
            $set: {
                currentStreak: 4,
                longestStreak: 7,
                totalStudySeconds:
                    268 * 60,
                lastStudyDate: new Date(),
                "preferences.coachMode":
                    "spicy",
            },
        }
    );

    await Promise.all([
        ConceptProgress.deleteMany({
            userId: user._id,
        }),

        DailyPlan.deleteMany({
            userId: user._id,
        }),

        ProblemAttempt.deleteMany({
            userId: user._id,
        }),

        LearningEvent.deleteMany({
            userId: user._id,
        }),
    ]);

    await Problem.deleteMany({
        externalId: /^demo-dashboard-/,
    });

    const curriculum =
        loadCurriculum();

    const arithmetic = findConcept(
        curriculum,
        "common-math-1",
        "polynomials",
        "polynomial-arithmetic"
    );

    const remainder = findConcept(
        curriculum,
        "common-math-1",
        "polynomials",
        "identity-remainder-theorem"
    );

    const factorization = findConcept(
        curriculum,
        "common-math-1",
        "polynomials",
        "polynomial-factorization"
    );

    const discriminant = findConcept(
        curriculum,
        "common-math-1",
        "equations-and-inequalities",
        "quadratic-discriminant"
    );

    await ConceptLesson.bulkWrite([
        {
            updateOne: {
                filter: {
                    curriculumId: "kr-2022",
                    courseId:
                        "common-math-1",
                    unitId: "polynomials",
                    conceptId:
                        "polynomial-arithmetic",
                },

                update: {
                    $set: {
                        estimatedMinutes: 12,
                        isPublished: true,

                        steps: [
                            {
                                order: 1,
                                title:
                                    "다항식의 항을 구분합니다.",
                                description:
                                    "같은 차수의 항을 색으로 구분합니다.",
                            },
                            {
                                order: 2,
                                title:
                                    "같은 항끼리 묶습니다.",
                                description:
                                    "대수 타일을 같은 종류끼리 모읍니다.",
                            },
                            {
                                order: 3,
                                title:
                                    "곱셈을 넓이로 바꿉니다.",
                                description:
                                    "두 다항식의 곱을 사각형 넓이로 표현합니다.",
                            },
                            {
                                order: 4,
                                title:
                                    "식을 다시 완성합니다.",
                                description:
                                    "넓이 조각을 합쳐 전개식을 확인합니다.",
                            },
                        ],

                        dashboardPreview: {
                            type: "area-model",
                            title:
                                "VISUAL CONCEPT",
                            formula:
                                "x² + 6x + 9 = (x + 3)²",

                            blocks: [
                                {
                                    label: "x²",
                                    tone: "primary",
                                },
                                {
                                    label: "3x",
                                    tone: "secondary",
                                },
                                {
                                    label: "3x",
                                    tone: "secondary",
                                },
                                {
                                    label: "9",
                                    tone: "accent",
                                },
                            ],
                        },
                    },
                },

                upsert: true,
            },
        },

        {
            updateOne: {
                filter: {
                    curriculumId: "kr-2022",
                    courseId:
                        "common-math-1",
                    unitId: "polynomials",
                    conceptId:
                        "identity-remainder-theorem",
                },

                update: {
                    $set: {
                        estimatedMinutes: 11,
                        isPublished: true,

                        steps: [
                            {
                                order: 1,
                                title:
                                    "항등식의 뜻을 확인합니다.",
                            },
                            {
                                order: 2,
                                title:
                                    "P(x)를 몫과 나머지로 분리합니다.",
                            },
                            {
                                order: 3,
                                title:
                                    "x=a를 대입합니다.",
                            },
                        ],

                        dashboardPreview: {
                            type: "formula",
                            title:
                                "REMAINDER THEOREM",
                            formula:
                                "P(x) = (x-a)Q(x) + P(a)",
                            blocks: [],
                        },
                    },
                },

                upsert: true,
            },
        },

        {
            updateOne: {
                filter: {
                    curriculumId: "kr-2022",
                    courseId:
                        "common-math-1",
                    unitId: "polynomials",
                    conceptId:
                        "polynomial-factorization",
                },

                update: {
                    $set: {
                        estimatedMinutes: 14,
                        isPublished: true,

                        steps: [
                            {
                                order: 1,
                                title:
                                    "공통인수를 찾습니다.",
                            },
                            {
                                order: 2,
                                title:
                                    "넓이 조각을 다시 배치합니다.",
                            },
                            {
                                order: 3,
                                title:
                                    "두 식의 곱으로 표현합니다.",
                            },
                        ],

                        dashboardPreview: {
                            type: "formula",
                            title:
                                "FACTORIZATION",
                            formula:
                                "x² + 5x + 6 = (x+2)(x+3)",
                            blocks: [],
                        },
                    },
                },

                upsert: true,
            },
        },
    ]);

    await ConceptProgress.create([
        {
            userId: user._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId: "polynomials",
            conceptId:
                "polynomial-arithmetic",

            topicCount:
                arithmetic.topics.length,

            completedTopicIndexes:
                [0, 1, 2],

            masteryProbability: 0.64,

            signals: {
                totalAttempts: 8,
                correctAttempts: 5,
                totalResponseTimeMs:
                    520000,
                hintsUsed: 2,
                visualizationReplays: 4,
            },

            lastStudiedAt:
                daysAgo(0, 1),

            nextReviewAt:
                daysAgo(-2),
        },

        {
            userId: user._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId: "polynomials",
            conceptId:
                "identity-remainder-theorem",

            topicCount:
                remainder.topics.length,

            completedTopicIndexes:
                [0, 1],

            masteryProbability: 0.42,

            signals: {
                totalAttempts: 7,
                correctAttempts: 3,
                totalResponseTimeMs:
                    610000,
                hintsUsed: 3,
                visualizationReplays: 5,
            },

            lastStudiedAt:
                daysAgo(1),
        },

        {
            userId: user._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId: "polynomials",
            conceptId:
                "polynomial-factorization",

            topicCount:
                factorization.topics.length,

            completedTopicIndexes:
                [0],

            masteryProbability: 0.58,

            signals: {
                totalAttempts: 5,
                correctAttempts: 3,
                totalResponseTimeMs:
                    430000,
                hintsUsed: 1,
                visualizationReplays: 2,
            },

            lastStudiedAt:
                daysAgo(2),
        },

        {
            userId: user._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId:
                "equations-and-inequalities",
            conceptId:
                "quadratic-discriminant",

            topicCount:
                discriminant.topics.length,

            completedTopicIndexes:
                [0, 1],

            masteryProbability: 0.47,

            signals: {
                totalAttempts: 6,
                correctAttempts: 3,
                totalResponseTimeMs:
                    490000,
                hintsUsed: 2,
                visualizationReplays: 3,
            },

            lastStudiedAt:
                daysAgo(3),
        },
    ]);

    const problems =
        await Problem.create([
            {
                externalId:
                    "demo-dashboard-001",
                curriculumId: "kr-2022",
                courseId: "common-math-1",
                unitId: "polynomials",

                conceptIds: [
                    "polynomial-arithmetic",
                ],

                primaryConceptId:
                    "polynomial-arithmetic",

                source: {
                    type: "generated",
                },

                questionType:
                    "multiple-choice",

                stem:
                    "(x+3)²을 전개한 식으로 옳은 것은?",

                choices: [
                    {
                        key: "1",
                        text: "x²+9",
                    },
                    {
                        key: "2",
                        text: "x²+3x+9",
                    },
                    {
                        key: "3",
                        text: "x²+6x+9",
                    },
                ],

                correctAnswer: "3",
                difficulty: 1,
                estimatedTimeSeconds: 60,
                score: 3,
                isPublished: true,
            },

            {
                externalId:
                    "demo-dashboard-002",
                curriculumId: "kr-2022",
                courseId: "common-math-1",
                unitId: "polynomials",

                conceptIds: [
                    "identity-remainder-theorem",
                ],

                primaryConceptId:
                    "identity-remainder-theorem",

                source: {
                    type: "generated",
                },

                questionType:
                    "short-answer",

                stem:
                    "P(x)를 x-2로 나눈 나머지를 구하여라.",

                correctAnswer: 5,
                difficulty: 2,
                estimatedTimeSeconds: 90,
                score: 3,
                isPublished: true,
            },

            {
                externalId:
                    "demo-dashboard-003",
                curriculumId: "kr-2022",
                courseId: "common-math-1",
                unitId:
                    "equations-and-inequalities",

                conceptIds: [
                    "quadratic-discriminant",
                ],

                primaryConceptId:
                    "quadratic-discriminant",

                source: {
                    type: "generated",
                },

                questionType:
                    "short-answer",

                stem:
                    "이차방정식이 중근을 가질 조건을 구하여라.",

                correctAnswer: "D=0",
                difficulty: 2,
                estimatedTimeSeconds: 120,
                score: 4,
                isPublished: true,
            },
        ]);

    await ProblemAttempt.create([
        {
            userId: user._id,
            problemId: problems[0]._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId: "polynomials",
            conceptId:
                "polynomial-arithmetic",
            attemptNumber: 1,
            submittedAnswer: "2",
            isCorrect: false,
            score: 0,
            maxScore: 3,
            responseTimeMs: 48000,
            stoppedAtStep: 2,

            errorAnalysis: {
                errorType:
                    "formula-confusion",
                relatedConceptId:
                    "polynomial-arithmetic",
                confidence: 0.91,
                modelVersion:
                    "demo-v1",
                analyzedAt:
                    daysAgo(3),
            },

            review: {
                status: "pending",
            },

            submittedAt: daysAgo(3),
        },

        {
            userId: user._id,
            problemId: problems[0]._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId: "polynomials",
            conceptId:
                "polynomial-arithmetic",
            attemptNumber: 2,
            submittedAnswer: "3",
            isCorrect: true,
            score: 3,
            maxScore: 3,
            responseTimeMs: 35000,

            review: {
                status: "completed",
                reviewedAt:
                    daysAgo(1),
                correctedAfterReview: true,
            },

            submittedAt: daysAgo(1),
        },

        {
            userId: user._id,
            problemId: problems[1]._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId: "polynomials",
            conceptId:
                "identity-remainder-theorem",
            attemptNumber: 1,
            submittedAnswer: 3,
            isCorrect: false,
            score: 0,
            maxScore: 3,
            responseTimeMs: 82000,

            errorAnalysis: {
                errorType:
                    "concept-not-understood",
                relatedConceptId:
                    "identity-remainder-theorem",
            },

            review: {
                status: "scheduled",
                scheduledAt:
                    daysAgo(-1),
            },

            submittedAt: daysAgo(2),
        },

        {
            userId: user._id,
            problemId: problems[2]._id,
            curriculumId: "kr-2022",
            courseId: "common-math-1",
            unitId:
                "equations-and-inequalities",
            conceptId:
                "quadratic-discriminant",
            attemptNumber: 1,
            submittedAnswer: "D>0",
            isCorrect: false,
            score: 0,
            maxScore: 4,
            responseTimeMs: 96000,

            errorAnalysis: {
                errorType:
                    "missing-condition",
                relatedConceptId:
                    "quadratic-discriminant",
            },

            review: {
                status: "pending",
            },

            submittedAt: daysAgo(1),
        },
    ]);

    const activityMinutes = [
        32,
        48,
        20,
        55,
        41,
        68,
        24,
    ];

    await LearningEvent.create(
        activityMinutes.map(
            (minutes, index) => ({
                userId: user._id,

                clientEventId:
                    `dashboard-seed-${Date.now()}-${index}`,

                sessionId:
                    `dashboard-session-${index}`,

                eventType:
                    "concept-closed",

                curriculumId: "kr-2022",
                courseId: "common-math-1",
                unitId: "polynomials",

                conceptId:
                    index % 2 === 0
                        ? "polynomial-arithmetic"
                        : "identity-remainder-theorem",

                durationMs:
                    minutes * 60 * 1000,

                occurredAt:
                    daysAgo(6 - index),
            })
        )
    );

    await DailyPlan.create({
        userId: user._id,
        dateKey: getDateKey(),

        tasks: [
            {
                kind: "concept",
                title: "개념 시각화",
                description:
                    "다항식의 곱셈을 넓이로 이해하기",
                href:
                    "/learn/common-math-1/polynomials/polynomial-arithmetic",
                estimatedMinutes: 8,
                status: "completed",
            },

            {
                kind: "practice",
                title: "확인 문제",
                description:
                    "다항식 개념 적용 5문제",
                href:
                    "/learn/common-math-1/polynomials/polynomial-arithmetic",
                estimatedMinutes: 10,
                status: "pending",
            },

            {
                kind: "review",
                title: "오답 복습",
                description:
                    "나머지정리 오답 다시 보기",
                href:
                    "/learn/common-math-1/polynomials/identity-remainder-theorem",
                estimatedMinutes: 6,
                status: "pending",
            },
        ],

        messages: {
            empty:
                "첫 번째 계획부터 시작해 보세요.",
            partial:
                "계획을 진행하고 있습니다. 다음 학습도 이어가세요.",
            complete:
                "오늘의 학습 계획을 모두 완료했습니다.",
        },

        coachMessages: {
            mild:
                "오늘 계획을 하나씩 같이 끝내봐요.",
            spicy:
                "계획은 세워놨는데 설마 보기만 하고 갈 건 아니지?",
            silent:
                "오늘의 학습 계획이 준비되었습니다.",
        },
    });

    console.log(
        `Dashboard seed complete: ${targetEmail}`
    );

    if (createdUser) {
        console.log(
            "Demo password: REMOVED_FROM_HISTORY"
        );
    }

    await mongoose.disconnect();
}

seed().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
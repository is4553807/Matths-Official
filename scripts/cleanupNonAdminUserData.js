const path =
    require("node:path");
const fs =
    require("node:fs");
const dotenv =
    require("dotenv");
const mongoose =
    require("mongoose");

dotenv.config({
    path: path.join(
        __dirname,
        "..",
        "config.env"
    ),
    quiet: true,
});

const models =
    require("../models/matthsModel");

const execute =
    process.argv.includes(
        "--execute"
    );

const archiveStorageDir =
    path.resolve(
        process.env
            .ARCHIVE_STORAGE_DIR ||
            path.join(
                __dirname,
                "..",
                "storage",
                "archive"
            )
    );

const {
    User,
    ConceptProgress,
    Problem,
    ProblemAttempt,
    AssessmentAttempt,
    LearningEvent,
    ConceptLesson,
    DailyPlan,
    PasswordResetCode,
    QuickPracticeAttempt,
    CoachMessageSuggestion,
    SupportInquiry,
    ArchiveItem,
    Announcement,
    UserNotification,
    CommunityPost,
    CommunityComment,
    CommunityVote,
    CommunityReport,
    PrivateMockExam,
    PrivateMockExamAttempt,
    PrivateMockExamEvent,
    PrivateMockResource,
    PrivateMockIntegrityCase,
    PrivateMockAnswerCorrection,
    PrivateMockObjection,
    PrivateMockWeeklyResult,
    RankingProfile,
    NicknameChangeRequest,
    ArchiveFolder,
    AdminActionLog,
    AdminTodo,
} = models;

const derivedProblemFilter = {
    $or: [
        {
            externalId:
                /^assessment:/,
        },
        {
            externalId:
                /^quick-practice:/,
        },
        {
            externalId:
                /^demo-dashboard-/,
        },
        {
            tags: "assessment",
        },
        {
            tags:
                "quick-practice",
        },
    ],
};

function idList(documents) {
    return documents.map(
        (document) =>
            document._id
    );
}

function inIds(ids) {
    return {
        $in: ids,
    };
}

function orFilters(filters) {
    const active =
        filters.filter(Boolean);

    if (active.length === 0) {
        return {
            _id: {
                $exists: false,
            },
        };
    }

    if (active.length === 1) {
        return active[0];
    }

    return {
        $or: active,
    };
}

async function buildCleanupPlan() {
    const adminUsers =
        await User.find({
            role: "admin",
        })
            .select("_id email")
            .lean();

    if (adminUsers.length === 0) {
        throw new Error(
            "Admin 계정을 찾지 못해 정리를 중단했습니다."
        );
    }

    const nonAdminUsers =
        await User.find({
            role: {
                $ne: "admin",
            },
        })
            .select(
                "_id role email"
            )
            .lean();
    const userIds =
        idList(nonAdminUsers);
    const adminId =
        adminUsers[0]._id;

    const posts =
        await CommunityPost.find({
            authorId:
                inIds(userIds),
        })
            .select("_id")
            .lean();
    const postIds =
        idList(posts);

    const comments =
        await CommunityComment.find(
            orFilters([
                {
                    authorId:
                        inIds(
                            userIds
                        ),
                },
                {
                    postId:
                        inIds(
                            postIds
                        ),
                },
            ])
        )
            .select("_id")
            .lean();
    const commentIds =
        idList(comments);

    const inquiries =
        await SupportInquiry.find({
            userId:
                inIds(userIds),
        })
            .select("_id")
            .lean();
    const inquiryIds =
        idList(inquiries);

    const examAttempts =
        await PrivateMockExamAttempt.find(
            {
                userId:
                    inIds(userIds),
            }
        )
            .select("_id examId")
            .lean();
    const examAttemptIds =
        idList(examAttempts);
    const affectedExamIds = [
        ...new Set(
            examAttempts.map(
                (attempt) =>
                    String(
                        attempt.examId
                    )
            )
        ),
    ].map(
        (value) =>
            new mongoose.Types.ObjectId(
                value
            )
    );

    const integrityCases =
        await PrivateMockIntegrityCase.find(
            orFilters([
                {
                    userId:
                        inIds(
                            userIds
                        ),
                },
                {
                    attemptId:
                        inIds(
                            examAttemptIds
                        ),
                },
            ])
        )
            .select("_id")
            .lean();
    const integrityCaseIds =
        idList(integrityCases);

    const objections =
        await PrivateMockObjection.find({
            userId:
                inIds(userIds),
        })
            .select("_id")
            .lean();
    const objectionIds =
        idList(objections);

    const reports =
        await CommunityReport.find(
            orFilters([
                {
                    reporterUserId:
                        inIds(
                            userIds
                        ),
                },
                {
                    reportedUserId:
                        inIds(
                            userIds
                        ),
                },
                {
                    postId:
                        inIds(
                            postIds
                        ),
                },
            ])
        )
            .select("_id")
            .lean();
    const reportIds =
        idList(reports);

    const nicknameRequests =
        await NicknameChangeRequest.find(
            orFilters([
                {
                    userId:
                        inIds(
                            userIds
                        ),
                },
                {
                    requestedBy:
                        inIds(
                            userIds
                        ),
                },
            ])
        )
            .select("_id")
            .lean();
    const nicknameRequestIds =
        idList(
            nicknameRequests
        );

    const userArchiveCandidates =
        await ArchiveItem.find({
            uploadedBy:
                inIds(userIds),
        })
            .select(
                "_id storedName"
            )
            .lean();
    const protectedArchiveReferences =
        await Promise.all([
            PrivateMockExam.find()
                .select(
                    "archiveItemId answerSheetArchiveItemId"
                )
                .lean(),
            PrivateMockResource.find()
                .select(
                    "archiveItemId"
                )
                .lean(),
        ]);
    const protectedArchiveIds =
        new Set();

    for (const exam of
        protectedArchiveReferences[0]) {
        if (exam.archiveItemId) {
            protectedArchiveIds.add(
                String(
                    exam.archiveItemId
                )
            );
        }
        if (
            exam.answerSheetArchiveItemId
        ) {
            protectedArchiveIds.add(
                String(
                    exam.answerSheetArchiveItemId
                )
            );
        }
    }
    for (const resource of
        protectedArchiveReferences[1]) {
        if (resource.archiveItemId) {
            protectedArchiveIds.add(
                String(
                    resource.archiveItemId
                )
            );
        }
    }

    const userArchiveItems =
        userArchiveCandidates.filter(
            (item) =>
                !protectedArchiveIds.has(
                    String(item._id)
                )
        );
    const protectedUserArchiveItems =
        userArchiveCandidates.filter(
            (item) =>
                protectedArchiveIds.has(
                    String(item._id)
                )
        );
    const userArchiveItemIds =
        idList(userArchiveItems);

    const todoSourceIds = [
        ...postIds,
        ...commentIds,
        ...reportIds,
        ...inquiryIds,
        ...integrityCaseIds,
        ...objectionIds,
        ...nicknameRequestIds,
    ];

    const deletions = [
        {
            label:
                "개념 진도",
            model:
                ConceptProgress,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "개념 문제 풀이",
            model:
                ProblemAttempt,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "평가 응시",
            model:
                AssessmentAttempt,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "학습 이벤트",
            model:
                LearningEvent,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "일일 학습 계획",
            model:
                DailyPlan,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "비밀번호 재설정 토큰",
            model:
                PasswordResetCode,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "40초 눈풀이 응시",
            model:
                QuickPracticeAttempt,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "문구 제안",
            model:
                CoachMessageSuggestion,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "문의",
            model:
                SupportInquiry,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "우편함 알림",
            model:
                UserNotification,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "게시판 신고",
            model:
                CommunityReport,
            filter:
                orFilters([
                    {
                        reporterUserId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        reportedUserId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        postId:
                            inIds(
                                postIds
                            ),
                    },
                ]),
        },
        {
            label:
                "게시판 추천·비추천",
            model:
                CommunityVote,
            filter:
                orFilters([
                    {
                        userId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        postId:
                            inIds(
                                postIds
                            ),
                    },
                ]),
        },
        {
            label:
                "게시판 댓글",
            model:
                CommunityComment,
            filter:
                orFilters([
                    {
                        authorId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        postId:
                            inIds(
                                postIds
                            ),
                    },
                ]),
        },
        {
            label:
                "게시판 글",
            model:
                CommunityPost,
            filter: {
                authorId:
                    inIds(userIds),
            },
        },
        {
            label:
                "Matths 주간 공식 모의고사 이벤트",
            model:
                PrivateMockExamEvent,
            filter:
                orFilters([
                    {
                        userId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        attemptId:
                            inIds(
                                examAttemptIds
                            ),
                    },
                ]),
        },
        {
            label:
                "Matths 주간 공식 모의고사 소명",
            model:
                PrivateMockIntegrityCase,
            filter:
                orFilters([
                    {
                        userId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        attemptId:
                            inIds(
                                examAttemptIds
                            ),
                    },
                ]),
        },
        {
            label:
                "Matths 주간 공식 모의고사 이의 신청",
            model:
                PrivateMockObjection,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "Matths 주간 공식 모의고사 결과",
            model:
                PrivateMockWeeklyResult,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "Matths 주간 공식 모의고사 응시",
            model:
                PrivateMockExamAttempt,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "랭킹 프로필",
            model:
                RankingProfile,
            filter: {
                userId:
                    inIds(userIds),
            },
        },
        {
            label:
                "닉네임 변경 요청",
            model:
                NicknameChangeRequest,
            filter:
                orFilters([
                    {
                        userId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        requestedBy:
                            inIds(
                                userIds
                            ),
                    },
                ]),
        },
        {
            label:
                "사용자 업로드 비공개 자료",
            model:
                ArchiveItem,
            filter: {
                _id:
                    inIds(
                        userArchiveItemIds
                    ),
            },
        },
        {
            label:
                "사용자 관련 관리자 로그",
            model:
                AdminActionLog,
            filter:
                orFilters([
                    {
                        targetUserId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        adminUserId:
                            inIds(
                                userIds
                            ),
                    },
                ]),
        },
        {
            label:
                "사용자 관련 관리자 할 일",
            model:
                AdminTodo,
            filter:
                orFilters([
                    {
                        targetUserId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        actorUserId:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        completedBy:
                            inIds(
                                userIds
                            ),
                    },
                    {
                        sourceId:
                            inIds(
                                todoSourceIds
                            ),
                    },
                ]),
        },
        {
            label:
                "오답 연동용 파생 문제",
            model:
                Problem,
            filter:
                derivedProblemFilter,
        },
        {
            label:
                "일반 사용자 계정",
            model:
                User,
            filter: {
                _id:
                    inIds(userIds),
                role: {
                    $ne: "admin",
                },
            },
        },
    ];

    const counts = [];

    for (const operation of deletions) {
        counts.push({
            label:
                operation.label,
            collection:
                operation.model
                    .collection
                    .name,
            count:
                await operation.model
                    .countDocuments(
                        operation.filter
                    ),
        });
    }

    return {
        adminUsers,
        nonAdminUsers,
        userIds,
        adminId,
        affectedExamIds,
        objectionIds,
        userArchiveItems,
        protectedUserArchiveItems,
        deletions,
        counts,
    };
}

async function deleteUserArchiveFiles(
    archiveItems
) {
    const results = [];

    for (const item of archiveItems) {
        const storedName =
            path.basename(
                String(
                    item.storedName ||
                        ""
                )
            );

        if (!storedName) {
            continue;
        }

        const filePath =
            path.resolve(
                archiveStorageDir,
                storedName
            );

        if (
            path.dirname(filePath) !==
            archiveStorageDir
        ) {
            throw new Error(
                `아카이브 경로 검증 실패: ${storedName}`
            );
        }

        try {
            await fs.promises.unlink(
                filePath
            );
            results.push({
                storedName,
                status: "deleted",
            });
        } catch (error) {
            if (
                error.code ===
                "ENOENT"
            ) {
                results.push({
                    storedName,
                    status:
                        "already-missing",
                });
                continue;
            }
            throw error;
        }
    }

    return results;
}

async function applyCleanup(plan) {
    const session =
        await mongoose.startSession();
    const deleted = [];

    try {
        await session.withTransaction(
            async () => {
                await ArchiveItem.updateMany(
                    {
                        _id: inIds(
                            idList(
                                plan.protectedUserArchiveItems
                            )
                        ),
                    },
                    {
                        $set: {
                            uploadedBy:
                                plan.adminId,
                        },
                    },
                    {
                        session,
                    }
                );

                await ArchiveItem.updateMany(
                    {},
                    {
                        $set: {
                            downloadCount: 0,
                        },
                    },
                    {
                        session,
                    }
                );

                if (
                    plan.affectedExamIds
                        .length > 0
                ) {
                    await PrivateMockExam.updateMany(
                        {
                            _id:
                                inIds(
                                    plan.affectedExamIds
                                ),
                        },
                        {
                            $set: {
                                rankingSummary: {
                                    participantCount: 0,
                                    averageScore: 0,
                                    medianScore: 0,
                                    scoreStandardDeviation: 0,
                                    averageElapsedMs: 0,
                                    highestScore: 0,
                                    lowestScore: 0,
                                },
                                rankingFinalizedAt:
                                    null,
                                aggregationStartedAt:
                                    null,
                                aggregationCompletedAt:
                                    null,
                            },
                        },
                        {
                            session,
                        }
                    );
                }

                await PrivateMockAnswerCorrection.updateMany(
                    {},
                    {
                        $set: {
                            sourceObjectionId:
                                null,
                            affectedAttemptCount: 0,
                            notificationStats: {
                                recipientCount: 0,
                                emailDeliveredCount: 0,
                                emailFailedCount: 0,
                            },
                        },
                    },
                    {
                        session,
                    }
                );

                for (const operation of plan.deletions) {
                    const result =
                        await operation.model.deleteMany(
                            operation.filter,
                            {
                                session,
                            }
                        );
                    deleted.push({
                        label:
                            operation.label,
                        collection:
                            operation.model
                                .collection
                                .name,
                        count:
                            result.deletedCount,
                    });
                }
            }
        );
    } finally {
        await session.endSession();
    }

    const deletedArchiveFiles =
        await deleteUserArchiveFiles(
            plan.userArchiveItems
        );

    return {
        deleted,
        deletedArchiveFiles,
    };
}

async function verifyCleanup(
    deletedUserIds
) {
    const remainingUsers =
        await User.find()
            .select("_id role")
            .lean();
    const remainingNonAdmins =
        remainingUsers.filter(
            (user) =>
                user.role !==
                "admin"
        );
    const orphanChecks = [
        [
            "conceptprogresses",
            ConceptProgress,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "problemattempts",
            ProblemAttempt,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "assessmentattempts",
            AssessmentAttempt,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "learningevents",
            LearningEvent,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "quickpracticeattempts",
            QuickPracticeAttempt,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "usernotifications",
            UserNotification,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "privatemockexamattempts",
            PrivateMockExamAttempt,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
        [
            "rankingprofiles",
            RankingProfile,
            {
                userId:
                    inIds(
                        deletedUserIds
                    ),
            },
        ],
    ];
    const orphanCounts = {};

    for (const [
        label,
        model,
        filter,
    ] of orphanChecks) {
        orphanCounts[label] =
            await model.countDocuments(
                filter
            );
    }

    const preservation = {
        adminAccounts:
            remainingUsers.length -
            remainingNonAdmins.length,
        nonAdminAccounts:
            remainingNonAdmins.length,
        conceptLessons:
            await ConceptLesson.countDocuments(),
        coreProblems:
            await Problem.countDocuments(
                {
                    $nor: derivedProblemFilter
                        .$or,
                }
            ),
        derivedProblems:
            await Problem.countDocuments(
                derivedProblemFilter
            ),
        archiveFolders:
            await ArchiveFolder.countDocuments(),
        archiveItems:
            await ArchiveItem.countDocuments(),
        announcements:
            await Announcement.countDocuments(),
        privateMockExams:
            await PrivateMockExam.countDocuments(),
        privateMockResources:
            await PrivateMockResource.countDocuments(),
    };

    const orphanTotal =
        Object.values(
            orphanCounts
        ).reduce(
            (sum, count) =>
                sum + count,
            0
        );

    if (
        remainingNonAdmins.length >
            0 ||
        orphanTotal > 0 ||
        preservation.derivedProblems >
            0
    ) {
        throw new Error(
            `삭제 후 검증 실패: ${JSON.stringify(
                {
                    remainingNonAdmins:
                        remainingNonAdmins.length,
                    orphanCounts,
                    derivedProblems:
                        preservation.derivedProblems,
                }
            )}`
        );
    }

    return {
        orphanCounts,
        preservation,
    };
}

async function main() {
    if (!process.env.DB) {
        throw new Error(
            "config.env의 DB 연결 문자열이 없습니다."
        );
    }

    await mongoose.connect(
        process.env.DB
    );

    const plan =
        await buildCleanupPlan();
    const summary = {
        mode: execute
            ? "execute"
            : "dry-run",
        adminAccounts:
            plan.adminUsers.length,
        nonAdminAccounts:
            plan.nonAdminUsers.length,
        deletions:
            plan.counts,
    };

    console.log(
        JSON.stringify(
            summary,
            null,
            2
        )
    );

    if (!execute) {
        console.log(
            "실제 삭제는 수행하지 않았습니다. --execute 옵션으로 실행하세요."
        );
        return;
    }

    const cleanupResult =
        await applyCleanup(plan);
    const verification =
        await verifyCleanup(
            plan.userIds
        );

    console.log(
        JSON.stringify(
            {
                ...cleanupResult,
                verification,
            },
            null,
            2
        )
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });

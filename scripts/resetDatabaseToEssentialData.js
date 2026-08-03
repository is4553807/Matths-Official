const fs =
    require("node:fs");
const path =
    require("node:path");
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

const {
    User,
    ConceptLesson,
    Problem,
} = require(
    "../models/matthsModel"
);

const execute =
    process.argv.includes(
        "--execute"
    );

const essentialCollections =
    new Set([
        "users",
        "conceptlessons",
        "problems",
    ]);

const knownResettableCollections =
    new Set([
        "adminactionlogs",
        "admintodos",
        "announcements",
        "archivefolders",
        "archiveitems",
        "assessmentattempts",
        "coachmessagesuggestions",
        "communitycomments",
        "communityposts",
        "communityreports",
        "communityvotes",
        "conceptprogresses",
        "dailyplans",
        "learningevents",
        "nicknamechangerequests",
        "operationsposts",
        "passwordresetcodes",
        "privatemockanswercorrections",
        "privatemockexamattempts",
        "privatemockexamevents",
        "privatemockexams",
        "privatemockintegritycases",
        "privatemockobjections",
        "privatemockresources",
        "privatemockuploadreminders",
        "privatemockweeklyresults",
        "problemattempts",
        "policychangedeliveries",
        "quickpracticeattempts",
        "rankingprofiles",
        "supportinquiries",
        "usernotifications",
    ]);

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

const nonEssentialProblemFilter = {
    externalId: /^ipad:/,
};

async function listArchiveFiles() {
    try {
        const entries =
            await fs.promises.readdir(
                archiveStorageDir,
                {
                    withFileTypes:
                        true,
                }
            );

        return entries
            .filter(
                (entry) =>
                    entry.isFile()
            )
            .map(
                (entry) =>
                    entry.name
            )
            .sort();
    } catch (error) {
        if (
            error.code ===
            "ENOENT"
        ) {
            return [];
        }
        throw error;
    }
}

async function buildPlan() {
    const collectionInfo =
        await mongoose.connection.db
            .listCollections()
            .toArray();
    const collectionNames =
        collectionInfo
            .map(
                (collection) =>
                    collection.name
            )
            .sort();
    const unknownNonEmpty = [];
    const deletions = [];

    for (const name of
        collectionNames) {
        const count =
            await mongoose.connection.db
                .collection(name)
                .countDocuments();

        if (
            essentialCollections.has(
                name
            )
        ) {
            continue;
        }

        if (
            !knownResettableCollections.has(
                name
            ) &&
            count > 0
        ) {
            unknownNonEmpty.push({
                name,
                count,
            });
            continue;
        }

        deletions.push({
            name,
            count,
        });
    }

    if (
        unknownNonEmpty.length > 0
    ) {
        throw new Error(
            `알 수 없는 비어 있지 않은 컬렉션이 있어 중단했습니다: ${JSON.stringify(
                unknownNonEmpty
            )}`
        );
    }

    const users =
        await User.find()
            .select("_id role")
            .lean();
    const nonAdminUsers =
        users.filter(
            (user) =>
                user.role !==
                "admin"
        );
    const conceptLessonCount =
        await ConceptLesson.countDocuments();
    const totalProblemCount =
        await Problem.countDocuments();
    const nonEssentialProblemCount =
        await Problem.countDocuments(
            nonEssentialProblemFilter
        );
    const problemCount =
        totalProblemCount -
        nonEssentialProblemCount;

    if (
        users.length === 0 ||
        nonAdminUsers.length > 0 ||
        conceptLessonCount === 0 ||
        problemCount === 0
    ) {
        throw new Error(
            `필수 데이터 안전 검사 실패: ${JSON.stringify(
                {
                    users:
                        users.length,
                    nonAdminUsers:
                        nonAdminUsers.length,
                    conceptLessons:
                        conceptLessonCount,
                    problems:
                        problemCount,
                }
            )}`
        );
    }

    return {
        deletions,
        nonEssentialProblemCount,
        archiveFiles:
            await listArchiveFiles(),
        preservation: {
            adminAccounts:
                users.length,
            conceptLessons:
                conceptLessonCount,
            problems:
                problemCount,
        },
    };
}

async function clearDatabase(
    plan
) {
    const session =
        await mongoose.startSession();
    const deleted = [];

    try {
        await session.withTransaction(
            async () => {
                for (const operation of plan.deletions) {
                    const result =
                        await mongoose.connection.db
                            .collection(
                                operation.name
                            )
                            .deleteMany(
                                {},
                                {
                                    session,
                                }
                            );
                    deleted.push({
                        collection:
                            operation.name,
                        count:
                            result.deletedCount,
                    });
                }

                const problemResult =
                    await Problem.deleteMany(
                        nonEssentialProblemFilter,
                        {
                            session,
                        }
                    );
                deleted.push({
                    collection:
                        "problems (API 테스트 레코드)",
                    count:
                        problemResult.deletedCount,
                });
            }
        );
    } finally {
        await session.endSession();
    }

    return deleted;
}

async function clearArchiveFiles(
    filenames
) {
    const deleted = [];

    for (const filename of filenames) {
        const safeName =
            path.basename(filename);
        const filePath =
            path.resolve(
                archiveStorageDir,
                safeName
            );

        if (
            safeName !== filename ||
            path.dirname(filePath) !==
                archiveStorageDir
        ) {
            throw new Error(
                `안전하지 않은 아카이브 경로: ${filename}`
            );
        }

        try {
            await fs.promises.unlink(
                filePath
            );
            deleted.push(
                filename
            );
        } catch (error) {
            if (
                error.code !==
                "ENOENT"
            ) {
                throw error;
            }
        }
    }

    return deleted;
}

async function verifyReset() {
    const collectionInfo =
        await mongoose.connection.db
            .listCollections()
            .toArray();
    const nonEssentialCounts = {};

    for (const {
        name,
    } of collectionInfo) {
        if (
            essentialCollections.has(
                name
            )
        ) {
            continue;
        }

        nonEssentialCounts[name] =
            await mongoose.connection.db
                .collection(name)
                .countDocuments();
    }

    const remainingNonEssential =
        Object.entries(
            nonEssentialCounts
        ).filter(
            ([, count]) =>
                count !== 0
        );
    const users =
        await User.find()
            .select("_id role")
            .lean();
    const archiveFiles =
        await listArchiveFiles();
    const preservation = {
        adminAccounts:
            users.filter(
                (user) =>
                    user.role ===
                    "admin"
            ).length,
        nonAdminAccounts:
            users.filter(
                (user) =>
                    user.role !==
                    "admin"
            ).length,
        conceptLessons:
            await ConceptLesson.countDocuments(),
        problems:
            await Problem.countDocuments(),
        nonEssentialProblems:
            await Problem.countDocuments(
                nonEssentialProblemFilter
            ),
        archiveFiles:
            archiveFiles.length,
    };

    if (
        remainingNonEssential.length >
            0 ||
        preservation.adminAccounts ===
            0 ||
        preservation.nonAdminAccounts >
            0 ||
        preservation.conceptLessons ===
            0 ||
        preservation.problems === 0 ||
        preservation.nonEssentialProblems >
            0 ||
        preservation.archiveFiles > 0
    ) {
        throw new Error(
            `초기화 후 검증 실패: ${JSON.stringify(
                {
                    remainingNonEssential,
                    preservation,
                }
            )}`
        );
    }

    return {
        nonEssentialCounts,
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
        await buildPlan();

    console.log(
        JSON.stringify(
            {
                mode: execute
                    ? "execute"
                    : "dry-run",
                deletions:
                    plan.deletions,
                archiveFileCount:
                    plan.archiveFiles
                        .length,
                nonEssentialProblemCount:
                    plan.nonEssentialProblemCount,
                preservation:
                    plan.preservation,
            },
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

    const deletedDocuments =
        await clearDatabase(plan);
    const deletedArchiveFiles =
        await clearArchiveFiles(
            plan.archiveFiles
        );
    const verification =
        await verifyReset();

    console.log(
        JSON.stringify(
            {
                deletedDocuments,
                deletedArchiveFiles:
                    deletedArchiveFiles.length,
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

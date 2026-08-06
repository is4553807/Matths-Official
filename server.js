const express = require('express');
const server = express();
const path = require('path');
const session = require('express-session');
const {
    MongoSessionStore,
} = require("./services/mongoSessionStore");
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({path: './config.env'});
const {
    getCoachView,
} = require("./services/coachMessageService");
const {
    errorHandler,
    notFoundHandler,
} = require("./middleware/errorMiddleware");
const {
    arenaPublicText,
} = require("./services/arenaPublicTerminologyService");

server.use(express.static("public"));
server.set('view engine', 'ejs');
server.use(express.urlencoded({extended:true}));
server.use(express.json());

const secret = process.env.SECRET;
if (process.env.NODE_ENV === "production") {
    server.set("trust proxy", 1);
}
const sessionTtlSeconds = Math.max(
    300,
    Number(process.env.SESSION_TTL_SECONDS) || 7 * 24 * 60 * 60
);
server.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: false,
    store: new MongoSessionStore({
        ttlSeconds: sessionTtlSeconds,
    }),
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: sessionTtlSeconds * 1000,
    },
}));
server.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.arenaPublicText = arenaPublicText;
    res.locals.coach = getCoachView({
        mode:
            req.session?.user?.preferences
                ?.coachMode,
        situation: "unanswered",
        seed:
            req.session?.user?.id ||
            req.sessionID,
    });
    next();
});

const maathsRoutes = require('./routes/matths-routes');
const goatArenaRoutes = require("./routes/goat-arena-routes");
const apiRoutes = require("./routes/api-routes");
const parentRoutes = require("./routes/parent-routes");

server.use("/api/v1", apiRoutes);
server.use("/", parentRoutes);
server.use("/", goatArenaRoutes);
server.use("/", maathsRoutes);
server.use(notFoundHandler);
server.use(errorHandler);

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB);
        console.log("MongoDB Connected Successfully");

        const {
            ensureMatchmakingControl,
        } = require("./services/arenaMatchmakingControlService");
        await ensureMatchmakingControl();

        const {
            ensureDefaultMockExamPackagePolicy,
        } = require("./services/mockExamPackageService");
        await ensureDefaultMockExamPackagePolicy();

        const {
            ensureDefaultLearningPackagePolicy,
            ensureFullAttendanceLearningPackagePolicy,
        } = require("./services/arenaPolicyService");
        await ensureDefaultLearningPackagePolicy();
        await ensureFullAttendanceLearningPackagePolicy();

        const {
            ensureDefaultArenaProblemDataVersion,
            ensureArenaProblemDataIndexes,
            startArenaProblemDataVersionWatcher,
        } = require("./services/arenaProblemDataService");
        await ensureArenaProblemDataIndexes();
        await ensureDefaultArenaProblemDataVersion();
        startArenaProblemDataVersionWatcher();

        const {
            syncProblemTypeRegistry,
        } = require("./services/problemTypeCatalogService");
        const problemTypeSync = await syncProblemTypeRegistry();
        console.log(
            `Problem type catalog ready: ${problemTypeSync.total} types (${problemTypeSync.inserted.length} new)`
        );

        const {
            ensureArenaTierCatalogIndexes,
            startArenaTierCatalogWatcher,
        } = require("./services/arenaTierQuestionCatalogService");
        await ensureArenaTierCatalogIndexes();
        startArenaTierCatalogWatcher();

        const {
            refreshCommunityCoachMessages,
        } = require("./services/coachSuggestionService");
        await refreshCommunityCoachMessages();

        const {
            startPrivateMockExamScheduler,
        } = require("./services/privateMockExamService");
        startPrivateMockExamScheduler();

        const {
            startAccessCycleScheduler,
        } = require("./services/accessCycleService");
        startAccessCycleScheduler();

        const {
            startDailyAccessCycleScheduler,
        } = require("./services/accessCycleDailyService");
        startDailyAccessCycleScheduler();

        const {
            startAccessCycleExpiryReminderScheduler,
        } = require("./services/accessCycleExpiryReminderService");
        startAccessCycleExpiryReminderScheduler();

        const {
            registerPolicyChangeOutboxHandler,
            startPolicyChangeNotificationScheduler,
        } = require("./services/policyChangeNotificationService");
        registerPolicyChangeOutboxHandler();
        startPolicyChangeNotificationScheduler();

        const {
            startArenaMatchAttemptScheduler,
        } = require("./services/arenaMatchAttemptService");
        startArenaMatchAttemptScheduler();

        const {
            startArenaEvidenceRetentionScheduler,
        } = require("./services/arenaMatchEvidenceService");
        startArenaEvidenceRetentionScheduler();

        const {
            startUserCloudUploadTempCleanupScheduler,
        } = require("./middleware/userCloudUploadStorage");
        startUserCloudUploadTempCleanupScheduler();

        const {
            cleanupStalePdfTemporaryFiles,
        } = require("./services/pdfWatermarkService");
        const pdfTempCleanup = await cleanupStalePdfTemporaryFiles();
        if (pdfTempCleanup.removedCount) {
            console.log(`Removed ${pdfTempCleanup.removedCount} stale PDF temporary files.`);
        }

        const {
            startLocalStorageBackupScheduler,
        } = require("./services/localStorageBackupService");
        startLocalStorageBackupScheduler();

        const {
            startArchiveTrashPurgeScheduler,
        } = require("./services/archiveService");
        startArchiveTrashPurgeScheduler();

        const {
            startDataAnalysisScheduler,
        } = require("./services/dataAnalysisAggregationService");
        startDataAnalysisScheduler();

        const {
            startArenaIntegrityRiskScheduler,
        } = require("./services/arenaIntegrityRiskService");
        startArenaIntegrityRiskScheduler();

        const {
            startArenaOutboxScheduler,
        } = require("./services/arenaOutboxService");
        const {
            registerArenaNotificationOutboxHandlers,
        } = require("./services/arenaNotificationService");
        registerArenaNotificationOutboxHandlers();
        startArenaOutboxScheduler();

        const {
            startParentAlertScheduler,
        } = require("./services/parentAlertService");
        startParentAlertScheduler();
    } catch (error) {
        console.error("MongoDB Connection Failed:", error);
        process.exit(1);
    }
};

function startServer() {
    const port =
        Number(process.env.PORT) || 8000;
    const hostname =
        process.env.HOST || "0.0.0.0";

    server.listen(port, hostname, () => {
        console.log(
            `Server running at http://${hostname}:${port}/`
        );
    })
}

connectDB().then(startServer);

const express = require('express');
const server = express();
const path = require('path');
const session = require('express-session');
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

server.use(express.static("public"));
server.set('view engine', 'ejs');
server.use(express.urlencoded({extended:true}));
server.use(express.json());

const secret = process.env.SECRET;
server.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: false
}));
server.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
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

server.use("/api/v1", apiRoutes);
server.use("/", goatArenaRoutes);
server.use("/", maathsRoutes);
server.use(notFoundHandler);
server.use(errorHandler);

async function connectDB() {
    try {
        await mongoose.connect(process.env.DB);
        console.log("MongoDB Connected Successfully");

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
            startArenaMatchAttemptScheduler,
        } = require("./services/arenaMatchAttemptService");
        startArenaMatchAttemptScheduler();

        const {
            startArenaEvidenceRetentionScheduler,
        } = require("./services/arenaMatchEvidenceService");
        startArenaEvidenceRetentionScheduler();

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

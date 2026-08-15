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
const {
    sameOriginProtection,
} = require("./middleware/requestSecurity");
const {
    assertRuntimeEnvironment,
} = require("./services/runtimeEnvironmentService");
const {
    canonicalHostRedirect,
} = require("./middleware/canonicalHost");

const runtimeEnvironment = assertRuntimeEnvironment();
for (const warning of runtimeEnvironment.warnings) {
    console.warn(`[startup warning] ${warning}`);
}

server.disable("x-powered-by");
if (process.env.NODE_ENV === "production") {
    server.set("trust proxy", 1);
}
server.use(canonicalHostRedirect);
server.use((req, res, next) => {
    const paymentSurface = /^\/(?:pricing\/[^/]+\/self|parent\/checkout\/)/.test(
        String(req.path || "")
    );
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cross-Origin-Opener-Policy": paymentSurface
            ? "same-origin-allow-popups"
            : "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-DNS-Prefetch-Control": "off",
        "Content-Security-Policy": [
            "default-src 'self'",
            "base-uri 'self'",
            "connect-src 'self' https://*.tosspayments.com",
            "font-src 'self' data: https://static.toss.im",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "frame-src https://*.tosspayments.com",
            "img-src 'self' data: blob: https:",
            "object-src 'none'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.tosspayments.com",
            "style-src 'self' 'unsafe-inline'",
        ].join("; "),
    });
    if (process.env.NODE_ENV === "production") {
        res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
});

server.use(express.static("public", {
    etag: true,
    lastModified: true,
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
}));
server.use("/vendor/mathjax", express.static(
    path.join(__dirname, "node_modules", "mathjax"),
    {
        dotfiles: "deny",
        etag: true,
        immutable: process.env.NODE_ENV === "production",
        lastModified: true,
        maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
    }
));
server.use("/vendor/mathjax-fonts", express.static(
    path.join(
        __dirname,
        "node_modules",
        "@mathjax"
    ),
    {
        dotfiles: "deny",
        etag: true,
        immutable: process.env.NODE_ENV === "production",
        lastModified: true,
        maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
    }
));
server.set('view engine', 'ejs');
server.use(express.urlencoded({extended:true}));
server.use(express.json());

const secret = process.env.SECRET || "matths-local-session-secret-change-before-production";
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
server.use(sameOriginProtection);
server.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.arenaPublicText = arenaPublicText;
    res.locals.publicContactEmail =
        String(process.env.PUBLIC_CONTACT_EMAIL || "admin@lsbproduction.com").trim();
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
        await mongoose.connect(process.env.DB, {
            serverSelectionTimeoutMS:
                process.env.NODE_ENV === "production" ? 15_000 : 5_000,
        });
        console.log("MongoDB Connected Successfully");

        const {
            ensureCheckoutIntentIndexes,
        } = require("./services/checkoutService");
        const checkoutIndexes = await ensureCheckoutIntentIndexes();
        if (checkoutIndexes.removedLegacyTtlIndex) {
            console.log(
                `Removed legacy checkout TTL index: ${checkoutIndexes.removedLegacyTtlIndex}`
            );
        }

        const {
            ensureAuthRequestLimitIndexes,
        } = require("./services/authRequestLimitService");
        await ensureAuthRequestLimitIndexes();

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
            ensureDefaultMainDivisionPolicy,
            ensureFullAttendanceLearningPackagePolicy,
        } = require("./services/arenaPolicyService");
        await ensureDefaultLearningPackagePolicy();
        await ensureDefaultMainDivisionPolicy();
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
            ensureCoachSuggestionIndexes,
            refreshCommunityCoachMessages,
        } = require("./services/coachSuggestionService");
        await ensureCoachSuggestionIndexes();
        await refreshCommunityCoachMessages();

        const {
            ensureSupportInquiryIndexes,
        } = require("./services/supportInquiryService");
        await ensureSupportInquiryIndexes();

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
        throw error;
    }
};

let httpServer = null;
let shutdownPromise = null;

function startServer() {
    const port =
        Number(process.env.PORT) || 8000;
    const hostname =
        process.env.HOST || "0.0.0.0";

    httpServer = server.listen(port, hostname, () => {
        console.log(
            `Server running at http://${hostname}:${port}/`
        );
    });
    return httpServer;
}

async function startApplication() {
    await connectDB();
    return startServer();
}

async function shutdown(signal = "shutdown", { exitProcess = false } = {}) {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
        console.log(`[shutdown] ${signal} received; stopping new requests.`);
        const forceTimer = setTimeout(() => {
            console.error("[shutdown] Graceful shutdown timed out.");
            if (exitProcess) process.exit(1);
        }, 20_000);
        forceTimer.unref();

        if (httpServer) {
            httpServer.closeIdleConnections?.();
            await new Promise((resolve) => httpServer.close(resolve));
            httpServer = null;
        }
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        clearTimeout(forceTimer);
        console.log("[shutdown] Server and database connection stopped.");
        if (exitProcess) process.exit(0);
    })();
    return shutdownPromise;
}

if (require.main === module) {
    startApplication().catch((error) => {
        console.error("Application startup failed:", error);
        process.exit(1);
    });
    process.once("SIGTERM", () => shutdown("SIGTERM", { exitProcess: true }));
    process.once("SIGINT", () => shutdown("SIGINT", { exitProcess: true }));
}

module.exports = {
    connectDB,
    server,
    shutdown,
    startApplication,
    startServer,
};

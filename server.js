const express = require('express');
const server = express();
const CANONICAL_PUBLIC_CONTACT_EMAIL = "dltkddbs4553@matths.kr";
const path = require('path');
const fs = require("fs");
const crypto = require("crypto");
const compression = require("compression");
const ejs = require("ejs");
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
const {
    localizationMiddleware,
} = require("./middleware/localizationMiddleware");

const runtimeEnvironment = assertRuntimeEnvironment();
for (const warning of runtimeEnvironment.warnings) {
    console.warn(`[startup warning] ${warning}`);
}

function staticAssetFingerprint() {
    const publicDirectory = path.join(__dirname, "public");
    const files = [];
    const collectFiles = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                collectFiles(filePath);
            } else if (/\.(?:css|js|svg|json)$/i.test(entry.name)) {
                files.push(filePath);
            }
        }
    };
    collectFiles(publicDirectory);
    const hash = crypto.createHash("sha256");
    for (const filePath of files.sort()) {
        hash.update(path.relative(publicDirectory, filePath));
        hash.update(fs.readFileSync(filePath));
    }
    return hash.digest("hex").slice(0, 16);
}

/*
 * CSS·JS·SVG 내용이 바뀔 때만 URL을 갱신한다. 여러 서버 프로세스에서도 같은
 * 배포본은 같은 버전을 사용하므로 장기 캐시와 화면/자산 정합성을 함께 지킨다.
 */
server.locals.assetVersion = String(
    process.env.MATTHS_ASSET_VERSION || staticAssetFingerprint()
);

function versionStaticAssetReferences(
    html,
    assetVersion = server.locals.assetVersion
) {
    const encodedVersion = encodeURIComponent(
        String(assetVersion || "")
    );
    if (!encodedVersion) return html;
    return String(html)
        .replace(
            /(<link\b[^>]*?\bhref\s*=\s*)(["'])(\/css\/[^"'?<>\s]+\.css)\2/gi,
            (match, prefix, quote, assetPath) =>
                `${prefix}${quote}${assetPath}?v=${encodedVersion}${quote}`
        )
        .replace(
            /(<script\b[^>]*?\bsrc\s*=\s*)(["'])(\/js\/[^"'?<>\s]+\.js)\2/gi,
            (match, prefix, quote, assetPath) =>
                `${prefix}${quote}${assetPath}?v=${encodedVersion}${quote}`
        );
}

server.engine("ejs", (filePath, options, callback) => {
    ejs.renderFile(filePath, options, (error, html) => {
        if (error) return callback(error);
        return callback(
            null,
            versionStaticAssetReferences(html)
        );
    });
});

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

server.use(compression({
    threshold: 1024,
}));

server.use(express.static("public", {
    etag: true,
    lastModified: true,
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    setHeaders(res, filePath) {
        if (/\.(?:css|js|svg|json)$/i.test(filePath)) {
            const requestedVersion = String(
                res.req?.query?.v || ""
            );
            if (
                process.env.NODE_ENV === "production" &&
                requestedVersion === server.locals.assetVersion
            ) {
                res.setHeader(
                    "Cache-Control",
                    "public, max-age=31536000, immutable"
                );
            } else {
                res.setHeader(
                    "Cache-Control",
                    "public, max-age=0, must-revalidate"
                );
            }
        }
    },
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
        // Apple 웹 로그인은 인증 결과를 cross-site form_post 로 돌려준다.
        // 운영 HTTPS에서만 None을 사용하고, 모든 상태 변경 요청은 아래의
        // sameOriginProtection + OAuth state 검증으로 계속 보호한다.
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: sessionTtlSeconds * 1000,
    },
}));
server.use(sameOriginProtection);
server.use(localizationMiddleware);
server.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.arenaPublicText = arenaPublicText;
    // 공개 연락처는 약관·개인정보처리방침·푸터에서 동일해야 한다. 운영 플랫폼에
    // 남은 과거 환경변수가 새 주소를 되돌리지 못하도록 배포 코드가 단일 소유한다.
    res.locals.publicContactEmail = CANONICAL_PUBLIC_CONTACT_EMAIL;
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
const academyRoutes = require("./routes/academy-routes");

server.use("/api/v1", apiRoutes);
server.use("/", parentRoutes);
server.use("/", goatArenaRoutes);
server.use("/", academyRoutes);
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
            ensureAcademyIndexes,
        } = require("./services/academyService");
        await ensureAcademyIndexes();

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
            ensureAttackParticipationLearningPackagePolicy,
        } = require("./services/arenaPolicyService");
        await ensureDefaultLearningPackagePolicy();
        await ensureDefaultMainDivisionPolicy();
        await ensureAttackParticipationLearningPackagePolicy();

        const {
            ensurePaybackDailyLearningIndexes,
            reconcileOpenPaybackAttackParticipation,
        } = require("./services/paybackDailyLearningService");
        await ensurePaybackDailyLearningIndexes();
        const paybackParticipationReconciliation =
            await reconcileOpenPaybackAttackParticipation();
        if (paybackParticipationReconciliation.updated > 0) {
            console.log(
                `Reconciled ${paybackParticipationReconciliation.updated} open payback attack participation records.`
            );
        }

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
            startPlacementExamExpiryScheduler,
        } = require("./services/placementExamService");
        startPlacementExamExpiryScheduler();

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
            startAcademyContractScheduler,
        } = require("./services/academyContractService");
        startAcademyContractScheduler();

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

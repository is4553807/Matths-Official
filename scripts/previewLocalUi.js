const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const ejs = require("ejs");
const { arenaTierGuide, arenaUpperTierPopulationGuide } = require("../services/arenaTierPolicy");
const { getArenaRulebook } = require("../services/arenaRulebookViewService");
const {
  getAdminOperationsGuideData,
} = require("../services/adminOperationsGuideService");
const {
  PRIVATE_MOCK_FORM_SCHEDULES,
} = require("../services/privateMockExamService");
const {
  ARENA_PROBLEM_DIFFICULTY_TIERS,
  availableArenaProblemTypes,
  defaultTypeSettings,
  defaultTierConfigurations,
} = require("../services/arenaProblemDataService");
const {
  getAdminProblemBankCatalog,
} = require("../services/problemBankCatalogService");
const {
  formatAdminMath,
} = require("../services/mathTextService");
const {
  generateArenaPdfOneOnOneQuestions,
} = require("../services/arenaPdfOneOnOneQuestionPool");
const {
  publicSourceAccuracyForQuestion,
} = require("../services/arenaMatchAttemptService");
const {
  buildArenaMatchPreStartContract,
} = require("../services/arenaMatchPreStartContractService");
const { getRefundDisclosure } = require("../services/refundPolicyService");
const {
  buildArenaMatchIntegrityWatermark,
} = require("../services/contentProtectionWatermarkPolicy");
const {
  ARENA_PROFILE_AVATARS,
  getArenaProfileAvatar,
} = require("../constants/arenaProfileAvatars");
const {
  localizationMiddleware,
} = require("../middleware/localizationMiddleware");
const {
  getCoachView,
} = require("../services/coachMessageService");

const app = express();
const root = path.resolve(__dirname, "..");
const port = Number(process.env.MATTHS_PREVIEW_PORT) || 8011;
app.locals.assetVersion = "local-preview";
const previewArenaActivityAudit = [];
const previewProducts = [
  { code: "MOCK_EXAM_ONLY", name: "Matths 주간 공식 모의고사 이용권", amount: 5000, periodLabel: "30일", description: "주간 공식 모의고사 응시에 집중하는 이용권" },
  { code: "LEARNING_PACKAGE_29", name: "29일 학습권 패키지", amount: 29000, periodLabel: "29일", description: "모의고사·배치고사·GOAT Arena까지 포함한 학습권" },
].map((product) => ({ ...product, refundPolicy: getRefundDisclosure(product) }));

app.set("view engine", "ejs");
app.set("views", path.join(root, "views"));
app.use(express.json({ limit: "256kb" }));
app.use(localizationMiddleware);
app.use(express.static(path.join(root, "public")));
app.use("/vendor/mathjax", express.static(path.join(root, "node_modules", "mathjax")));
app.use("/vendor/mathjax-fonts", express.static(path.join(root, "node_modules", "@mathjax")));

function universalPreviewValue() {
  let value;
  const callable = function previewValue() {
    return value;
  };
  value = new Proxy(callable, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) {
        return (hint) =>
          hint === "number"
            ? 0
            : "2026-08-19T00:00:00.000Z";
      }
      if (key === Symbol.iterator) {
        return function* emptyIterator() {};
      }
      if (key === "length") return 0;
      if (key === "toJSON") return () => null;
      if (key === "toString") return () => "";
      if (key === "valueOf") return () => 0;
      if (["map", "filter", "flatMap", "slice", "sort"].includes(key)) {
        return () => [];
      }
      if (key === "find") return () => value;
      if (key === "findIndex") return () => -1;
      if (key === "some") return () => false;
      if (key === "every") return () => true;
      if (key === "includes") return () => false;
      if (key === "reduce") return (_callback, initial) => initial;
      if (key === "join") return () => "";
      return value;
    },
    apply() {
      return value;
    },
    construct() {
      return value;
    },
  });
  return value;
}

app.get("/preview/login", (_req, res) => {
  res.locals.publicContactEmail = "dltkddbs4553@matths.kr";
  res.render("login", {
    socialAuthProviders: [
      { key: "google", configured: true },
      { key: "kakao", configured: true },
      { key: "apple", configured: true, webConfigured: true },
    ],
    loginNotice: null,
    success: null,
    error: null,
    oldInput: { email: "" },
  });
});

app.get("/preview/home-arena-tier", (_req, res) => {
  res.render("index", {
    user: {
      id: "64b000000000000000000151",
      name: "preview-student",
      role: "student",
    },
    arenaContract: {
      learningCycleDays: 29,
      minimumAttackParticipationDays: 15,
      maximumPaybackRatePercent: 100,
    },
    arenaSpotlight: {
      available: true,
      seasonLabel: "2026 S3",
      activeCount: null,
      topEntries: [],
      currentEntry: {
        displayName: "preview-student",
        division: "SUB",
        divisionLabel: "Unranked",
        tierLabel: "에메랄드",
        tierPosition: 12,
        rankPoint: 64,
        overallRank: 27,
        cohortLabel: "고등학교 순위",
        cohortRank: 4,
      },
    },
  });
});

app.get("/preview/my-learning", (_req, res) => {
  const previewUser = {
    id: "64b000000000000000000710",
    name: "홍길동",
    role: "student",
    schoolGrade: 11,
    hasAcademyMembership: true,
  };
  const concept = (id, title, progress, completedTopics = 0) => ({
    id,
    title,
    progress,
    completedTopics,
    topics: [{ id: `${id}-1` }, { id: `${id}-2` }, { id: `${id}-3` }],
    standardCode: "10공수1-01",
    status: progress >= 100 ? "completed" : progress > 0 ? "in-progress" : "not-started",
    href: `/learning/common-math-1/polynomials/${id}`,
  });
  const units = [
    {
      id: "polynomials",
      order: 1,
      title: "다항식",
      progress: 67,
      completedConcepts: 1,
      firstConceptHref: "/learning/common-math-1/polynomials/operations",
      assessmentRequired: false,
      assessmentPassed: false,
      concepts: [
        concept("operations", "다항식의 연산", 100, 3),
        concept("identities", "항등식과 나머지정리", 67, 2),
        concept("factorization", "인수분해", 0),
      ],
    },
    {
      id: "equations",
      order: 2,
      title: "방정식과 부등식",
      progress: 33,
      completedConcepts: 0,
      firstConceptHref: "/learning/common-math-1/equations/complex-numbers",
      assessmentRequired: false,
      assessmentPassed: false,
      concepts: [
        concept("complex-numbers", "복소수와 이차방정식", 67, 2),
        concept("quadratic-equations", "이차방정식과 이차함수", 33, 1),
        concept("inequalities", "여러 가지 방정식과 부등식", 0),
      ],
    },
  ];
  const totalConcepts = units.reduce((sum, unit) => sum + unit.concepts.length, 0);
  const completedConcepts = units.reduce(
    (sum, unit) => sum + unit.concepts.filter((item) => item.progress >= 100).length,
    0
  );

  res.render("my-learning", {
    user: previewUser,
    arenaProfileAvatar: getArenaProfileAvatar("ORBIT_OWL"),
    onboardingTutorial: { status: "NOT_REQUIRED", shouldAutoStart: false },
    learningData: {
      completedConcepts,
      totalConcepts,
      continueHref: units[0].firstConceptHref,
      courses: [
        {
          id: "common-math-1",
          officialTitle: "공통수학 1",
          defaultSemester: "1학기",
          progress: 50,
          completedConcepts,
          totalConcepts,
          developmentLocked: false,
          assessmentRequired: false,
          assessmentPassed: false,
          hasActivity: true,
          units,
        },
      ],
    },
  });
});

app.get("/preview/main-dashboard", (req, res) => {
  const now = new Date("2026-08-30T10:05:00.000Z");
  const previewCoachMode =
    req.query.coachMode === "spicy" ? "spicy" : "mild";
  const previewCoach = getCoachView({
    mode: previewCoachMode,
    situation: "study_prompt",
    seed: `dashboard-preview:${previewCoachMode}`,
  });
  const previewUser = {
    id: "64b000000000000000000711",
    name: "hong-gildong",
    realName: "홍길동",
    role: "admin",
    schoolGrade: 11,
    currentStreak: 12,
    hasAcademyMembership: true,
  };

  res.render("main", {
    user: previewUser,
    arenaActivityLevel: {
      level: 7,
      totalMatches: 84,
      matchesToNext: 16,
      isMaxLevel: false,
    },
    arenaProfileAvatar: getArenaProfileAvatar("ORBIT_OWL"),
    onboardingTutorial: { status: "NOT_REQUIRED", shouldAutoStart: false },
    dashboardData: {
      user: previewUser,
      completedConcepts: req.query.completedConcepts === "0" ? 0 : 24,
      notifications: [
        {
          title: "오늘의 학원 수업",
          description: "오후 7시부터 출석 코드를 입력할 수 있습니다.",
          href: "/my-academy",
          urgent: true,
        },
        {
          title: "복습할 오답이 있어요",
          description: "오늘 복습 예정인 오답 5개를 확인해 주세요.",
          href: "/wrong-notes",
          urgent: false,
        },
        {
          title: "GOAT Arena 결과",
          description: "최근 경기가 정산되었습니다.",
          href: "/war-of-masters",
          urgent: false,
        },
      ],
      hasUrgentNotification: false,
      activeDashboardNotices: [
        {
          id: "preview-integrity-notice",
          kind: "integrity",
          title: "9월 전국 모의고사 응시 규정 안내",
          content: "부정행위 방지를 위해 시험 중 화면 이탈이 감지되며 자동 제출됩니다. 응시 전 반드시 유의사항을 확인하세요.",
          href: "/notifications",
          dismissUrl: "/preview/announcements/preview-integrity-notice/dismiss",
        },
      ],
      attendance: {
        serverNow: now,
        canCheckIn: true,
        academy: { id: "preview-academy", name: "미래엔 수학학원" },
        academyClass: { id: "preview-class", name: "고2 심화 A반" },
        attendance: null,
        session: {
          id: "preview-session",
          attendanceMode: "SELF_CODE",
          state: "OPEN",
          isLateWindow: false,
          startsAt: new Date("2026-08-30T10:00:00.000Z"),
          endsAt: new Date("2026-08-30T12:00:00.000Z"),
          checkInOpensAt: new Date("2026-08-30T09:55:00.000Z"),
          lateAfterAt: new Date("2026-08-30T10:30:00.000Z"),
          checkInClosesAt: new Date("2026-08-30T12:10:00.000Z"),
        },
      },
      coach: previewCoach,
      activePlan: {
        code: "LEARNING_PACKAGE",
        name: "프리미엄 학습권",
        division: "Ranked",
        remainingLearningDays: 128,
        availableLearningDays: 96,
        reservedLearningDays: 24,
        lockedLearningDays: 8,
        expiresAt: new Date("2026-01-05T14:59:59.000Z"),
        unlimited: false,
        statusLabel: "이용 중",
      },
      accessRenewalNotice: null,
      stats: {
        weeklyStudyMinutes: 342,
        weeklyStudyDetail: "+48분",
        todayStudyMinutes: 54,
        activeStudyDays: 6,
        averageStudyMinutes: 57,
        weeklySolvedProblems: 214,
        correctRate: 82,
        correctRateDetail: "+3%p",
        pendingReviewCount: 5,
      },
      weeklyActivity: {
        maxMinutes: 71,
        days: [
          { label: "월", minutes: 42, isToday: false },
          { label: "화", minutes: 58, isToday: false },
          { label: "수", minutes: 37, isToday: false },
          { label: "목", minutes: 71, isToday: false },
          { label: "금", minutes: 49, isToday: false },
          { label: "토", minutes: 31, isToday: false },
          { label: "일", minutes: 54, isToday: true },
        ],
      },
    },
  });
});

app.post("/preview/announcements/:noticeId/dismiss", (_req, res) => {
  res.json({ dismissed: true });
});

app.post("/api/academy/attendance/check-in", (req, res) => {
  if (!/^\d{6}$/.test(String(req.body?.code || ""))) {
    return res.status(400).json({ message: "6자리 출석 코드를 입력해 주세요." });
  }
  return res.json({
    message: "출석 처리가 완료되었습니다.",
    attendance: { status: "PRESENT" },
  });
});

async function renderGenericPreview(viewName) {
  const previewValue = universalPreviewValue();
  const locals = {
    Math,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    Infinity,
    NaN,
  };
  const filename = path.join(root, "views", `${viewName}.ejs`);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      return await ejs.renderFile(filename, locals);
    } catch (error) {
      const missing = String(error?.message || "").match(
        /([A-Za-z_$][\w$]*) is not defined/
      );
      if (!missing) throw error;
      locals[missing[1]] = previewValue;
    }
  }

  throw new Error(`미리보기 변수를 준비하지 못했습니다: ${viewName}`);
}

const genericPreviewViews = fs
  .readdirSync(path.join(root, "views"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ejs"))
  .map((entry) => entry.name.replace(/\.ejs$/, ""))
  .sort();

app.get("/preview/views", (_req, res) => {
  res.type("html").send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Views 미리보기 목록</title></head><body><h1>Views 미리보기</h1><ul>${genericPreviewViews
    .map(
      (viewName) =>
        `<li><a href="/preview/view/${encodeURIComponent(viewName)}">${viewName}.ejs</a></li>`
    )
    .join("")}</ul></body></html>`);
});

app.get("/preview/view/:viewName", async (req, res, next) => {
  const viewName = String(req.params.viewName || "");
  if (!genericPreviewViews.includes(viewName)) {
    return res.status(404).send("존재하지 않는 view입니다.");
  }
  try {
    return res.type("html").send(await renderGenericPreview(viewName));
  } catch (error) {
    return next(error);
  }
});

app.post("/api/goat-arena/matches/:matchId/activity", (req, res) => {
  const signals = Array.isArray(req.body?.signals) ? req.body.signals : [];
  previewArenaActivityAudit.push({
    matchId: req.params.matchId,
    requestId: String(req.body?.requestId || ""),
    signals,
    receivedAt: new Date().toISOString(),
  });
  if (previewArenaActivityAudit.length > 100) {
    previewArenaActivityAudit.splice(0, previewArenaActivityAudit.length - 100);
  }
  res.json({ recorded: signals.length, replayed: false });
});

app.get("/preview/goat-arena/activity-audit", (_req, res) => {
  const payload = JSON.stringify({ events: previewArenaActivityAudit }, null, 2)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  res.type("html").send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Arena activity audit</title></head><body><pre data-preview-activity-audit>${payload}</pre></body></html>`);
});

app.get("/preview/goat-arena/match-pdf-pool-mobile", (_req, res) => {
  res.type("html").send(`<!doctype html>
    <html lang="ko"><head><meta charset="utf-8"><title>Arena mobile QA</title>
    <style>html,body{margin:0;min-height:100%;background:#050711;display:grid;place-items:start center}iframe{width:390px;height:844px;border:0;background:#050711}</style>
    </head><body><iframe title="GOAT Arena 모바일 매치 검수" src="/preview/goat-arena/match-pdf-pool?difficulty=R9&amp;seed=0"></iframe></body></html>`);
});

app.get("/preview/goat-arena/match-ready", (req, res) => {
  const role = String(req.query.role || "CHALLENGER").toUpperCase() === "DEFENDER"
    ? "DEFENDER"
    : "CHALLENGER";
  const match = {
    division: "SUB",
    matchType: "NORMAL",
    startDeadlineAt: new Date("2026-08-26T06:00:00.000Z"),
    challenger: { stakeDays: 1 },
    defender: { stakeDays: 0 },
    economySnapshot: {
      challengerStakeDays: 1,
      defenderStakeDays: 0,
    },
  };
  res.render("goat-arena-match", {
    activeArenaPage: "sub",
    arenaUser: {
      nickname: "preview-user",
      hasStyleEntrance: false,
      hasMainProfileBorder: false,
    },
    arenaNotifications: { unreadCount: 0, notifications: [], defenseByDivision: {} },
    rankUpPresentation: null,
    matchPrepared: false,
    matchStarted: false,
    evidenceSubmitted: false,
    matchError: "",
    questionIntroduced: 0,
    startRequestId: "preview-start",
    revengeRequestId: "preview-revenge",
    matchData: {
      id: "preview-ready-match",
      division: "SUB",
      divisionLabel: "Unranked",
      matchType: "NORMAL",
      matchTitle: "일반 쟁탈전",
      matchStatus: "READY",
      matchStatusLabel: "경기 준비 완료",
      role,
      roleLabel: role === "CHALLENGER" ? "공격자" : "방어자",
      opponentName: role === "CHALLENGER" ? "상위 수학러" : "도전 수학러",
      preStartContract: buildArenaMatchPreStartContract(match, role),
      problemPack: {
        questionCount: 5,
        timeLimitMs: 10 * 60 * 1000,
        timeLimitLabel: "10분",
        curriculumCoverage: ["algebra", "calculus-1", "probability-statistics"],
      },
      attempt: { status: "READY" },
      settled: false,
      result: null,
      divisionLocked: false,
      matchRequestLocked: false,
      canPrepare: false,
      canStart: true,
      inProgress: false,
      evidenceRequired: false,
      submitted: false,
      canUseDefenseScheduleProtection: false,
      serverNow: new Date().toISOString(),
    },
  });
});

app.get("/preview/goat-arena/match-pdf-pool", (req, res) => {
  const requestedDifficulty = String(req.query.difficulty || "R9").toUpperCase();
  const difficultyCode = /^[UR][1-9]$/.test(requestedDifficulty)
    ? requestedDifficulty
    : "R9";
  const division = difficultyCode.startsWith("R") ? "MAIN" : "SUB";
  const matchKey = `preview:${difficultyCode}:${String(req.query.seed || "0")}`;
  const now = new Date();
  const generated = generateArenaPdfOneOnOneQuestions({
    difficultyCode,
    matchKey,
    packCurve: ["LOW", "MID", "MID", "MID_HIGH", "HIGH"],
  });
  const classLabels = {
    BASIC_GENERAL: "기초 일반",
    GENERAL: "일반",
    UPPER_GENERAL: "상위 일반",
    SEMI_KILLER: "준킬러",
    KILLER: "킬러",
  };
  const questions = generated.map((question, index) => {
    return {
      questionKey: `Q${index + 1}`,
      number: index + 1,
      sourceDifficultyCode: question.design.sourceDifficultyCode,
      categoryLabel: classLabels[question.design.difficultyClass],
      courseId: question.courseId,
      points: 20,
      targetAccuracy: publicSourceAccuracyForQuestion(question),
      prompt: question.problem.prompt,
      visualization: question.problem.visualization || null,
      savedAnswer: "",
    };
  });
  res.render("goat-arena-match", {
    activeArenaPage: division === "MAIN" ? "main" : "sub",
    arenaUser: {
      nickname: "preview-user",
      hasStyleEntrance: false,
      hasMainProfileBorder: false,
    },
    arenaNotifications: { unreadCount: 0, notifications: [], defenseByDivision: {} },
    rankUpPresentation: null,
    matchPrepared: true,
    matchStarted: false,
    evidenceSubmitted: false,
    matchError: "",
    questionIntroduced: 0,
    startRequestId: "preview-start",
    revengeRequestId: "preview-revenge",
    matchData: {
      id: "preview-pdf-pool-match",
      division,
      divisionLabel: division === "MAIN" ? "Ranked" : "Unranked",
      matchType: "NORMAL",
      matchTitle: `${difficultyCode} PDF 문제 풀 렌더 검수`,
      matchStatus: "IN_PROGRESS",
      matchStatusLabel: "문제 풀이 중",
      roleLabel: "공격자",
      opponentName: "렌더 검수 상대",
      problemPack: {
        questionCount: 5,
        timeLimitMs: 10 * 60 * 1000,
        timeLimitLabel: "10분",
        curriculumCoverage: [...new Set(questions.map((question) => question.courseId))],
      },
      questions,
      integrityWatermark: buildArenaMatchIntegrityWatermark({
        matchId: "preview-pdf-pool-match",
        userId: "preview-user",
        attemptId: "preview-attempt",
        matchType: "NORMAL",
        role: "CHALLENGER",
      }),
      settled: false,
      result: null,
      divisionLocked: false,
      canPrepare: false,
      canStart: false,
      inProgress: true,
      evidenceRequired: false,
      submitted: false,
      canUseDefenseScheduleProtection: false,
      serverNow: now.toISOString(),
      attempt: {
        status: "IN_PROGRESS",
        currentQuestionIndex: 0,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    },
  });
});

app.get("/preview/goat-arena/evidence", (_req, res) => {
  const now = new Date();
  res.render("goat-arena-match", {
    activeArenaPage: "sub",
    arenaUser: {
      nickname: "preview-user",
      hasStyleEntrance: false,
      hasMainProfileBorder: false,
    },
    arenaNotifications: { unreadCount: 0, notifications: [], defenseByDivision: {} },
    rankUpPresentation: null,
    matchPrepared: false,
    matchStarted: false,
    evidenceSubmitted: false,
    matchError: "",
    questionIntroduced: 0,
    startRequestId: "preview-start",
    revengeRequestId: "preview-revenge",
    matchData: {
      id: "preview-evidence-match",
      division: "SUB",
      divisionLabel: "Unranked",
      matchTitle: "일반 쟁탈전",
      matchStatus: "IN_PROGRESS",
      matchStatusLabel: "풀이 증거 제출",
      roleLabel: "공격자",
      opponentName: "상대 사용자",
      problemPack: null,
      settled: false,
      result: null,
      divisionLocked: false,
      canPrepare: false,
      canStart: false,
      inProgress: false,
      evidenceRequired: true,
      submitted: false,
      canUseDefenseScheduleProtection: false,
      serverNow: now.toISOString(),
      attempt: {
        status: "EVIDENCE_REQUIRED",
        evidenceDeadlineAt: new Date(now.getTime() + 60 * 1000),
      },
    },
  });
});

app.get("/preview/admin/pdf-forensics/arena-match", (_req, res) => {
  res.render("admin-pdf-forensics", {
    user: {
      name: "preview-admin",
      realName: "미리보기 운영자",
      role: "admin",
    },
    error: null,
    analysis: {
      inputType: "IMAGE",
      imageCount: 1,
      pageCount: 0,
      traceCodes: ["ARM-8725C4165A65"],
      validPayloads: [],
      pageTraceCount: 0,
      ocrCandidateCount: 1,
      imageMetadata: {
        format: "PNG",
        width: 3024,
        height: 1964,
        ocrAttempts: 2,
      },
      matches: [
        {
          sourceType: "ARENA_MATCH",
          userId: "64b000000000000000000151",
          username: "eunwoopark8498",
          email: "preview-student@example.test",
          examId: "6a8d5f3b59588e8f16948314",
          downloadedAt: new Date("2026-08-25T08:14:00.000Z"),
          traceCode: "ARM-8725C4165A65",
          documentIssueId: "ARENA-ATTEMPT-6a8d5f3b59588e8f16948315",
          attemptId: "6a8d5f3b59588e8f16948315",
          role: "CHALLENGER",
          attemptStatus: "IN_PROGRESS",
          recognitionMethod: "ARENA_IMAGE_OCR",
          ocrConfidence: 1,
          matchedCandidate: "8725C4165A65",
          signatureVerified: false,
          originalName: "GOAT Arena 1대1 경기 화면",
        },
      ],
    },
  });
});

app.get("/pricing", (req, res) => {
  const user = req.query.logged === "1" ? { name: "preview-user" } : null;
  res.render("pricing", {
    user,
    activePage: "pricing",
    mockExamPolicy: { monthlyPriceAmount: 5000 },
    learningPackagePolicy: { priceAmount: 29000 },
    products: previewProducts,
    productAccess: null,
    checkoutEnabled: true,
  });
});

app.get("/preview/admin/users", (_req, res) => {
  res.render("admin-users", {
    user: {
      name: "preview-admin",
      realName: "미리보기 운영자",
      role: "admin",
    },
    feedback: null,
    usersData: {
      users: [
        {
          _id: "64b000000000000000000151",
          name: "수학하는염소",
          email: "preview-student@example.test",
          role: "student",
          school: {
            code: "PREVIEW-HS",
            name: "미리보기고등학교",
            region: "서울특별시",
          },
          schoolGrade: 11,
          isActive: true,
          accountStatus: "active",
          warningCount: 0,
          totalStudySeconds: 754,
          arenaActivityLevel: {
            level: 4,
            totalMatches: 38,
            matchesToNext: 12,
            isMaxLevel: false,
          },
          lastLoginAt: new Date(),
        },
        {
          _id: "64b000000000000000000152",
          name: "배치검증계정",
          email: "preview-test@example.test",
          role: "test",
          schoolGrade: 10,
          isActive: true,
          accountStatus: "active",
          warningCount: 0,
          totalStudySeconds: 0,
          arenaActivityLevel: {
            level: 1,
            totalMatches: 0,
            matchesToNext: 5,
            isMaxLevel: false,
          },
          lastLoginAt: null,
        },
      ],
      schools: [
        {
          code: "PREVIEW-HS",
          name: "미리보기고등학교",
        },
      ],
      filters: {
        query: "",
        schoolCode: "",
        grade: "",
        state: "",
        role: "",
      },
      page: 1,
      total: 2,
      totalPages: 1,
      perPage: 20,
    },
  });
});

app.get("/preview/admin/users/detail", (_req, res) => {
  const startedAt = new Date("2026-08-18T01:42:22+09:00");
  const deadlineAt = new Date(startedAt.getTime() + 100 * 60 * 1000);
  const placementAttempt = {
    _id: "64b000000000000000000161",
    title: "GOAT Arena 입단 배치고사",
    scopeType: "placement",
    placementPurpose: "INITIAL",
    status: "submitted",
    displayStatus: "submitted",
    disqualifiedReason: null,
    scorePercent: 67,
    hasFinalScore: true,
    answeredCount: 20,
    startedAt,
    submittedAt: deadlineAt,
    deadlineAt,
    elapsedTimeMs: 100 * 60 * 1000,
    timeLimitMs: 100 * 60 * 1000,
  };
  const member = {
    _id: "64b000000000000000000151",
    name: "수학하는염소",
    realName: "미리보기 사용자",
    email: "preview-student@example.test",
    role: "student",
    school: {
      code: "PREVIEW-HS",
      name: "미리보기고등학교",
      region: "서울특별시",
    },
    schoolGrade: 11,
    educationStatus: "enrolled",
    isActive: true,
    accountStatus: "active",
    warningCount: 0,
    totalStudySeconds: 754,
    totalConnectedSeconds: 2200,
    createdAt: new Date("2026-08-16T20:00:00+09:00"),
    lastLoginAt: new Date("2026-08-19T08:30:00+09:00"),
    lastStudyDate: new Date("2026-08-16T01:08:00+09:00"),
  };
  const conceptProgress = {
    _id: "64b000000000000000000171",
    courseTitle: "공통수학1",
    unitTitle: "다항식",
    conceptTitle: "다항식의 사칙연산",
    completionPercent: 30,
    status: "in-progress",
    lastStudiedAt: member.lastStudyDate,
  };
  res.render("admin-user-detail", {
    user: {
      id: "64b000000000000000000199",
      name: "preview-admin",
      realName: "미리보기 운영자",
      role: "admin",
    },
    feedback: null,
    detail: {
      user: member,
      identityMatches: [],
      learning: {
        progress: [conceptProgress],
        currentConcept: conceptProgress,
        progressCount: 1,
        completedCount: 0,
        totalAttempts: 12,
        correctAttempts: 0,
        correctRate: 0,
        averageResponseTimeMs: 0,
      },
      assessments: [placementAttempt],
      placement: {
        attemptCount: 1,
        completedCount: 1,
        latestAttempt: placementAttempt,
        latestCompleted: placementAttempt,
        active: null,
        latestTerminal: null,
        ranking: null,
      },
      ranking: null,
      packageAccess: {
        packageType: "FREE",
        label: "기본학습 패키지",
      },
      weeklyMockAccess: {
        active: false,
        packageType: "FREE",
      },
      arenaBadges: [],
      arenaActivityLevel: {
        level: 4,
        totalMatches: 38,
        matchesToNext: 12,
        isMaxLevel: false,
      },
      arenaRecentMatches: [
        {
          id: "64b000000000000000000701",
          division: "MAIN",
          matchType: "NORMAL",
          status: "SETTLED",
          tierPairLabel: "R3 → R2",
          completedAt: new Date("2026-08-18T18:10:00+09:00"),
          focusedParticipant: { role: "CHALLENGER", result: "WIN", score: 80 },
          opponent: { id: "64b000000000000000000702", nickname: "함수마스터", score: 60 },
        },
        {
          id: "64b000000000000000000703",
          division: "SUB",
          matchType: "REVENGE",
          status: "SETTLED",
          tierPairLabel: "U2 → U1",
          completedAt: new Date("2026-08-16T14:20:00+09:00"),
          focusedParticipant: { role: "DEFENDER", result: "LOSE", score: 40 },
          opponent: { id: "64b000000000000000000704", nickname: "미적분비둘기", score: 100 },
        },
      ],
      inquiries: [],
      notifications: [],
      actionLogs: [],
      communityPosts: [],
    },
  });
});

app.get("/preview/placement/story", (req, res) => {
  const now = new Date();
  const previewCohortSize = req.query.sample === "small" ? 37 : 128;
  const previewCohortRank = req.query.sample === "small" ? 1 : 14;
  res.render("assessment-attempt", {
    user: {
      name: "수학하는염소",
      schoolGrade: 11,
    },
    difficultyLabels: {},
    attempt: {
      _id: "64b000000000000000000091",
      scopeType: "placement",
      placementPurpose: "INITIAL",
      title: "GOAT Arena 입단 배치고사",
      subtitle: "30문항 · 100점",
      status: "submitted",
      passed: true,
      questions: [],
      earnedPoints: 82,
      totalPoints: 100,
      scorePercent: 82,
      timeLimitMs: 100 * 60 * 1000,
      elapsedTimeMs: 78 * 60 * 1000,
      deadlineAt: new Date(now.getTime() + 22 * 60 * 1000),
      placementResult: {
        totalCorrect: 25,
        placementScore: 82,
        initialMmr: 1264,
        initialRating: 1264,
        initialTier: "다이아몬드",
        tier: "다이아몬드",
        rankingStatus: "provisional",
        calibrationPolicyVersion: "PLACEMENT_REFERENCE_V2_MOE_NINE_GRADE",
        positionBasis: "MOE_NINE_GRADE_REFERENCE_DISTRIBUTION",
        referenceStandard: "MOE_NINE_GRADE_CUMULATIVE_RANK_RATIO",
        referenceGrade: 4,
        estimatedPercentile: 71.3,
        estimatedTopPercent: 28.7,
        estimatedTopPercentMin: 23,
        estimatedTopPercentMax: 40,
        estimatedRankPopulation: 10000,
        estimatedRank: 2870,
        cohortSize: previewCohortSize,
        cohortRank: previewCohortRank,
        actualRankMinimumCohortSize: 100,
        actualRankPublished: previewCohortSize >= 100,
        actualPercentile: 89.1,
        cohortAverage: 61.4,
        cohortStandardDeviation: 14.7,
        standardizedScore: 1.4,
        percentile: 71.3,
      },
    },
  });
});

app.get("/preview/refunds/checkout", (_req, res) => {
  res.render("checkout", {
    user: { id: "preview-user", name: "preview-user", role: "student" },
    product: previewProducts[1],
    intent: null,
  });
});

app.get("/preview/payments/toss", (_req, res) => {
  const intent = {
    orderId: "matths-preview-0123456789abcdef",
    customerKey: "customer-preview-0123456789abcdef",
    providerMode: "TEST",
    productName: previewProducts[1].name,
    amount: previewProducts[1].amount,
    currency: "KRW",
  };
  res.render("checkout", {
    user: { id: "preview-user", name: "김학생", email: "preview@example.com", role: "student" },
    product: previewProducts[1],
    intent,
    checkoutConfig: {
      clientKey: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
      mode: "TEST",
      customerKey: intent.customerKey,
      amount: intent.amount,
      currency: intent.currency,
      orderId: intent.orderId,
      orderName: intent.productName,
      customerEmail: "preview@example.com",
      customerName: "김학생",
      successUrl: `http://127.0.0.1:${port}/payments/toss/success`,
      failUrl: `http://127.0.0.1:${port}/payments/toss/fail`,
      paymentVariantKey: "DEFAULT",
      agreementVariantKey: "AGREEMENT",
    },
  });
});

app.get("/preview/refunds/parent-checkout", (_req, res) => {
  res.render("parent-checkout", {
    parent: { id: "preview-parent", username: "학부모" },
    child: { id: "preview-child", name: "학생", realName: "김학생" },
    familyChildren: [],
    selectedChildId: "preview-child",
    product: previewProducts[1],
    intent: null,
  });
});

app.get("/preview/parent/payments", (_req, res) => {
  res.render("parent-payments", {
    parent: { _id: "64b000000000000000000081", username: "김학부모" },
    child: { _id: "64b000000000000000000082", name: "학생", realName: "김학생" },
    familyChildren: [
      {
        childId: "64b000000000000000000082",
        child: { name: "학생", realName: "김학생" },
      },
    ],
    selectedChildId: "64b000000000000000000082",
    feedback: "",
    error: "",
    paymentData: {
      summary: {
        orderCount: 3,
        paidCount: 2,
        paidAmount: 34000,
        refundedAmount: 5000,
        refundableCount: 1,
      },
      orders: [
        {
          id: "intent-paid",
          orderId: "matths-preview-paid-order",
          productCode: "LEARNING_PACKAGE_29",
          productName: "29일 학습권 패키지",
          amount: 29000,
          currency: "KRW",
          createdAt: new Date("2026-08-13T08:00:00.000Z"),
          approvedAt: new Date("2026-08-13T08:02:00.000Z"),
          paymentMethod: "카드",
          receiptUrl: "https://dashboard.tosspayments.com/receipt/preview",
          providerMode: "TEST",
          intentStatus: "PAID",
          status: "PAID",
          paymentId: "64b000000000000000000091",
          payment: { status: "APPLIED" },
          refund: null,
          remainingAmount: 29000,
          isRefundable: true,
        },
        {
          id: "intent-refunded",
          orderId: "matths-preview-refunded-order",
          productCode: "MOCK_EXAM_ONLY",
          productName: "Matths 주간 공식 모의고사 이용권",
          amount: 5000,
          currency: "KRW",
          createdAt: new Date("2026-07-01T03:00:00.000Z"),
          approvedAt: new Date("2026-07-01T03:01:00.000Z"),
          paymentMethod: "카드",
          receiptUrl: "https://dashboard.tosspayments.com/receipt/refunded-preview",
          providerMode: "TEST",
          intentStatus: "CANCELLED",
          status: "REFUNDED",
          paymentId: "64b000000000000000000092",
          payment: { status: "REFUNDED" },
          refund: {
            status: "COMPLETED",
            requestedAt: new Date("2026-07-02T03:00:00.000Z"),
            processingDeadlineAt: new Date("2026-07-07T03:00:00.000Z"),
            decision: { approvedAmount: 5000 },
          },
          remainingAmount: 0,
          isRefundable: false,
        },
        {
          id: "intent-expired",
          orderId: "matths-preview-expired-order",
          productCode: "LEARNING_PACKAGE_29",
          productName: "29일 학습권 패키지",
          amount: 29000,
          currency: "KRW",
          createdAt: new Date("2026-06-01T03:00:00.000Z"),
          approvedAt: null,
          paymentMethod: "",
          receiptUrl: "",
          providerMode: "TEST",
          intentStatus: "EXPIRED",
          status: "EXPIRED",
          paymentId: "",
          payment: null,
          refund: null,
          remainingAmount: 0,
          isRefundable: false,
        },
      ],
    },
  });
});

app.get("/preview/refunds/contact", (_req, res) => {
  res.render("contact", {
    user: { id: "preview-user", name: "preview-user", role: "student" },
    contactData: {
      user: { nickname: "preview-user", schoolName: "미리보기 고등학교", email: "preview@example.com" },
      inquiries: [],
      refundableOrders: [{ id: "64b000000000000000000091", productName: previewProducts[1].name, orderReference: "ORDER-PREVIEW-20260813", approvedAt: new Date("2026-08-13T10:00:00+09:00"), remainingAmount: 19000 }],
    },
    feedback: null,
    inquiryRequestId: "5a8ebeb1-0b55-4d70-a200-8a1d58c85b2e",
    oldInput: { inquiryType: "REFUND", paymentId: "64b000000000000000000091", refundReasonType: "SIMPLE_CHANGE", subject: "환불을 신청합니다", content: "상품 환불 기준과 산정 금액을 확인해주세요." },
  });
});

app.get("/preview/admin/refunds", (_req, res) => {
  res.locals.adminTodoSummary = { pendingCount: 1, items: [] };
  const requestedAt = new Date("2026-08-13T10:00:00+09:00");
  res.render("admin-refunds", {
    user: { id: "preview-admin", name: "preview-admin", realName: "홍길동", role: "admin" },
    feedback: null,
    refundData: {
      requests: [{
        _id: "64b000000000000000000092",
        userId: { name: "preview-user", realName: "김학생", email: "preview@example.com" },
        paymentId: { provider: "TOSS", providerMode: "TEST" },
        productNameSnapshot: previewProducts[1].name,
        orderReferenceSnapshot: "ORDER-PREVIEW-20260813",
        reasonDetail: "상품 환불 기준과 산정 금액을 확인해주세요.",
        status: "CALCULATED",
        requestedAt,
        processingDeadlineAt: new Date("2026-08-18T10:00:00+09:00"),
        calculation: { approvedAmount: 29000, calculatedAmount: 19000, usedDays: 10, calculationType: "PARTIAL", formula: "부분 환불액 = 결제금액 - 일할 이용금액(결제금액 × 이용일수 ÷ 29일, 계산 중 발생하는 1원 미만 금액은 버림)", calculatedBy: { realName: "홍길동" } },
      }, {
        _id: "64b000000000000000000093",
        userId: { name: "preview-zero", realName: "이학생", email: "zero@example.com" },
        paymentId: { provider: "TOSS", providerMode: "TEST" },
        productNameSnapshot: previewProducts[0].name,
        orderReferenceSnapshot: "ORDER-PREVIEW-ZERO",
        reasonDetail: "이용 기간 종료 뒤 환불 가능 금액 확인 요청입니다.",
        status: "CALCULATED",
        requestedAt,
        processingDeadlineAt: new Date("2026-08-18T10:00:00+09:00"),
        calculation: { approvedAmount: 5000, calculatedAmount: 0, usedDays: 30, calculationType: "NONE", formula: "이용 기간이 종료되어 잔여 환불액 0원", calculatedBy: { realName: "홍길동" } },
      }],
      status: "",
      page: 1,
      total: 2,
      totalPages: 1,
    },
  });
});

app.get("/admin/operations-guide", (_req, res) => {
  res.locals.adminTodoSummary = { pendingCount: 0, items: [] };
  res.render("admin-operations-guide", {
    user: { name: "preview-admin", role: "admin" },
    guide: getAdminOperationsGuideData(),
  });
});

app.get("/admin/data-analysis", (_req, res) => {
  res.locals.adminTodoSummary = { pendingCount: 0, items: [] };
  const periodKey = "2026-08";
  const sampleMetric = (label, valueLabel, sampleSize = 120) => ({
    label,
    unit: "percent",
    status: sampleSize >= 100 ? "reliable" : "collecting",
    statusLabel: sampleSize >= 100 ? "판단 가능" : "표본 수집 중",
    minimumSampleSize: 100,
    observations: [{
      dimensionsLabel: "전체",
      valueLabel,
      sampleSize,
      numerator: Math.round(sampleSize * 0.63),
      denominator: sampleSize,
      note: "미리보기 원장 집계값",
    }],
  });
  res.render("admin-data-analysis", {
    user: { name: "preview-admin", role: "admin" },
    feedback: null,
    analysis: {
      period: { periodKey, label: "2026년 8월" },
      periodOptions: [{ key: periodKey, label: "2026년 8월" }],
      generatedAt: new Date(),
      periodClosed: false,
      summary: {
        catalogMetricCount: 47,
        observedMetricCount: 47,
        waitingMetricCount: 0,
        reliableMetricCount: 2,
        observationRowCount: 47,
      },
      assumptions: [{
        label: "도전자 승률",
        assumptionLabel: "50%",
        actualLabel: "52.1%",
        sampleSize: 128,
        minimumSampleSize: 100,
        ready: true,
      }],
      categories: [
        { key: "conversion", label: "전환", metrics: [sampleMetric("가격 안내 방문 후 구매율", "63%", 120)] },
        { key: "question-calibration", label: "문항 보정", metrics: [sampleMetric("유형별 정답률", "57.4%", 140)] },
      ],
    },
  });
});

app.get("/admin/private-mock-exams", (_req, res) => {
  res.locals.adminTodoSummary = { pendingCount: 0, items: [] };
  res.render("admin-private-mock-exams", {
    user: { name: "preview-admin", role: "admin" },
    examData: {
      exams: [],
      formulaResources: [],
      defaultExamDate: "2026-08-09",
      formSchedules: Object.entries(PRIVATE_MOCK_FORM_SCHEDULES).map(
        ([formCode, schedule]) => ({ formCode, ...schedule, fixedDate: "" })
      ),
    },
    feedback: null,
    error: null,
    oldInput: {},
  });
});

app.get("/admin/problem-banks", (_req, res) => {
  res.locals.adminTodoSummary = { pendingCount: 0, items: [] };
  const active = {
    _id: "66aa00000000000000000001",
    code: "ARENA-PROBLEM-DATA-V1",
    displayName: "GOAT Arena 기본 문제 데이터",
    engineVersion: "ARENA-GENERATOR-JS-V1",
    status: "ACTIVE",
    contentHash: "a".repeat(64),
    tierConfigurations: defaultTierConfigurations(),
    changeSummary: "기존 Arena 준킬러 문제 유형을 DB 버전으로 최초 등록",
    validationReport: { passed: true, sampledTypeCount: 7, sampleCount: 35 },
    activatedAt: new Date("2026-08-03T09:00:00+09:00"),
    updatedAt: new Date("2026-08-03T09:00:00+09:00"),
  };
  const draft = {
    ...active,
    _id: "66aa00000000000000000002",
    code: "ARENA-PROBLEM-DATA-V2",
    displayName: "8월 난이도 조정 초안",
    status: "DRAFT",
    changeSummary: "T4~T6 적분 유형 비중 조정",
    validationReport: { passed: true, sampledTypeCount: 7, sampleCount: 7 },
    updatedAt: new Date("2026-08-03T10:30:00+09:00"),
  };
  const previewType = {
    _id: "66aa00000000000000000011",
    category: "CONCEPT_PRACTICE",
    engineKey: "algebra/exponential-logarithmic-functions/algebra-01-01/radical-basic",
    revision: 3,
    status: "ACTIVE",
    displayName: "거듭제곱근 기본 계산",
    courseId: "algebra",
    unitId: "exponential-logarithmic-functions",
    conceptId: "algebra-01-01",
    sourceFile: "services/problemGenerators/algebra.js",
    sourceHash: "b".repeat(64),
    sourceSnapshot: "function generate() {\n  return validatedProblem;\n}",
    currentServerHash: "b".repeat(64),
    currentServerSnapshot: "function generate() {\n  return validatedProblem;\n}",
    enabled: true,
    selectionWeight: 2,
    operatorNote: "미리보기용 문제 유형",
    validationReport: {
      passed: true,
      sampleCount: 5,
      validationMode: "TYPE_SPECIFIC",
      calculatorFree: true,
      answerVerified: true,
    },
    createdAt: new Date("2026-08-03T11:00:00+09:00"),
  };
  res.render("admin-problem-banks", {
    user: { name: "preview-admin", role: "admin" },
    catalog: getAdminProblemBankCatalog(),
    problemData: {
      active,
      drafts: [draft],
      recent: [draft, active],
      editable: null,
      availableTypes: availableArenaProblemTypes(),
      difficultyTiers: ARENA_PROBLEM_DIFFICULTY_TIERS,
      form: {
        code: "",
        displayName: "",
        changeSummary: "",
        tierConfigurations: defaultTierConfigurations(),
        typeSettings: defaultTypeSettings(),
      },
    },
    typeCatalog: {
      categories: [
        { key: "CONCEPT_PRACTICE", label: "개념·유형 학습", description: "개념학습과 오답노트 문제", count: 540 },
        { key: "ASSESSMENT_CENTER", label: "평가센터", description: "평가센터 문제", count: 812 },
        { key: "PLACEMENT_EXAM", label: "배치고사", description: "배치고사 청사진", count: 51 },
      ],
      selectedCategory: "CONCEPT_PRACTICE",
      selectedCategoryInfo: { label: "개념·유형 학습", description: "개념학습과 오답노트에서 숫자를 바꾸어 출제하는 유형" },
      query: "",
      entries: [previewType],
      inspected: previewType,
      history: [previewType],
    },
    tierCatalog: {
      active: {
        _id: "66aa00000000000000000031",
        code: "GOAT-ARENA-TIER-CATALOG-4-0",
        displayName: "GOAT Arena T1~T9 준킬러 유형표",
        schemaVersion: "4.0",
        status: "ACTIVE",
        sourceFileName: "T1-T9_ALL_정답추가.json",
        sourceHash: "c".repeat(64),
        contentHash: "d".repeat(64),
        typeDefinitions: Array.from({ length: 30 }, (_, index) => ({
          typeId: `TYPE-${String(index + 1).padStart(2, "0")}`,
          label: `준킬러 유형 ${index + 1}`,
          curriculumUnit: index % 5 === 2 ? "probability-statistics" : index % 2 ? "calculus-1" : "algebra",
        })),
        tierConfigurations: Array.from({ length: 9 }, (_, tierIndex) => ({
          difficultyTier: `T${tierIndex + 1}`,
          questionCount: 30,
          typeWeights: Array.from({ length: 30 }, (_, index) => ({
            typeId: `TYPE-${String(index + 1).padStart(2, "0")}`,
            weight: 1,
          })),
        })),
        validationReport: {
          passed: true,
          typeCount: 30,
          referenceQuestionCount: 270,
          answeredReferenceQuestionCount: 270,
          solutionProcessReferenceCount: 270,
          multipleChoiceReferenceCount: 168,
          naturalNumberReferenceCount: 102,
          liveEligibleReferenceCount: 0,
          mappedEngineCount: 67,
          generatedSampleCount: 201,
        },
        activatedAt: new Date("2026-08-03T16:00:00+09:00"),
      },
      recent: [],
    },
    error: "",
    query: {},
  });
});

function previewArenaTutorial(activeDivision, requestedChapter = "") {
  const divisionChapters = activeDivision === "MAIN"
    ? ["ranked", "ranked_battle", "ranked_shop"]
    : activeDivision === "SUB"
      ? ["unranked", "unranked_match"]
      : [];
  const eligibleChapters = ["common", ...divisionChapters];
  const autoChapter = eligibleChapters.includes(requestedChapter) ? requestedChapter : null;
  return {
    version: 1,
    activeDivision,
    eligibleChapters,
    availableChapters: eligibleChapters,
    chapters: {
      common: { status: "PENDING", completedAt: null, skippedAt: null },
      unranked: { status: activeDivision === "SUB" ? "PENDING" : "NOT_REQUIRED", completedAt: null, skippedAt: null },
      unranked_match: { status: activeDivision === "SUB" ? "PENDING" : "NOT_REQUIRED", completedAt: null, skippedAt: null },
      ranked: { status: activeDivision === "MAIN" ? "PENDING" : "NOT_REQUIRED", completedAt: null, skippedAt: null },
      ranked_battle: { status: activeDivision === "MAIN" ? "PENDING" : "NOT_REQUIRED", completedAt: null, skippedAt: null },
      ranked_shop: { status: activeDivision === "MAIN" ? "PENDING" : "NOT_REQUIRED", completedAt: null, skippedAt: null },
    },
    autoChapter,
    shouldAutoStart: false,
    suspended: false,
  };
}

app.get("/goat-arena", (req, res) => {
  res.render("goat-arena", {
    activeArenaPage: "home",
    arenaUser: { nickname: "preview", displayName: "preview" },
    pendingRevengeRight: null,
    pendingRevengeRequestId: null,
    seedState: {
      ready: true,
      label: "현재 Arena 상태",
      tier: "에메랄드",
      division: "Unranked",
      gp: 60,
      tierRank: 12,
      detail: "배치고사 결과가 현재 시즌 Unranked에 반영되었습니다.",
    },
    arenaAccess: { activeDivision: "SUB" },
    arenaTutorial: previewArenaTutorial("SUB", String(req.query.tour || "")),
    arenaTierGuide: arenaTierGuide(),
    arenaUpperTierGuide: arenaUpperTierPopulationGuide(),
    activeArenaPolicy: { matchStakeDays: { normal: 1, revenge: 2 } },
    arenaMatchRules: {
      questionCount: 5,
      timeLimitMinutes: 10,
      evidenceSeconds: 60,
    },
  });
});

app.get("/goat-arena/rules/main", (_req, res) => {
  res.render("goat-arena-rules", {
    activeArenaPage: "rules",
    arenaUser: { nickname: "preview" },
    rulebook: getArenaRulebook("MAIN", {
      mainPolicy: {
        code: "MAIN-PREVIEW-INTERNAL",
        displayName: "Ranked 현재 운영 기준",
        maximumTargetTierGap: 3,
        stakeDaysByTierGap: [
          { tierGap: 1, stakeDays: 1 },
          { tierGap: 2, stakeDays: 2 },
          { tierGap: 3, stakeDays: 3 },
        ],
        repeatOpponentExclusionDays: 7,
        revengeStakeMultiplier: 2,
        revengeFeeDays: 1,
        effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
        updatedAt: new Date("2026-08-02T00:00:00+09:00"),
      },
    }),
  });
});

app.get("/goat-arena/rules/sub", (_req, res) => {
  res.render("goat-arena-rules", {
    activeArenaPage: "rules",
    arenaUser: { nickname: "preview" },
    rulebook: getArenaRulebook("SUB"),
  });
});

app.get("/goat-arena/rankings", (_req, res) => {
  const currentUserId = "preview-current-user";
  const finalOverall = Array.from({ length: 41 }, (_, index) => ({
    userId: index === 20 ? currentUserId : `preview-final-${index + 1}`,
    displayName: index === 20 ? "preview" : `랭커 ${index + 1}`,
    schoolName: index % 7 === 0 ? "" : `미리보기고 ${index % 5 + 1}`,
    division: index % 3 === 0 ? "MAIN" : "SUB",
    finalRank: index + 1,
    finalRating: 2400 - index * 17,
    rankDelta: index === 20 ? 3 : index % 6 === 0 ? -1 : 0,
    hasMainProfileBorder: index === 5,
  }));
  const tierEntries = Array.from({ length: 31 }, (_, index) => ({
    userId: index === 15 ? currentUserId : `preview-tier-${index + 1}`,
    displayName: index === 15 ? "preview" : `플레이어 ${index + 1}`,
    schoolName: `미리보기고 ${index % 5 + 1}`,
    region: index % 2 ? "서울특별시" : "경기도",
    tier: "골드",
    tierRank: index + 1,
    gp: 99 - index,
    division: "SUB",
    rankDelta: index === 15 ? 2 : 0,
    hasMainProfileBorder: index === 8,
  }));
  const emptyMainPool = {
    key: "MAIN",
    label: "Ranked",
    cohortSize: 20,
    current: null,
    dataState: "arena-standing",
    defaultTierKey: "gold",
    tierBoards: [
      {
        tier: "골드",
        tierKey: "gold",
        memberCount: 20,
        containsCurrentUser: false,
        isTopTwentyOnly: true,
        entries: tierEntries.slice(0, 20),
      },
    ],
  };

  res.render("goat-arena-rankings", {
    activeArenaPage: "rankings",
    arenaUser: { nickname: "preview" },
    user: { _id: currentUserId, name: "preview" },
    ranking: {
      current: { arenaDivision: "SUB" },
      currentFinal: finalOverall[20],
      finalOverall,
      latestCalculatedAt: new Date(),
      pools: {
        sub: {
          key: "SUB",
          label: "Unranked",
          cohortSize: tierEntries.length,
          current: tierEntries[15],
          dataState: "arena-standing",
          defaultTierKey: "gold",
          tierBoards: [
            {
              tier: "골드",
              tierKey: "gold",
              memberCount: tierEntries.length,
              containsCurrentUser: true,
              isTopTwentyOnly: false,
              entries: tierEntries,
            },
          ],
        },
        main: emptyMainPool,
      },
    },
  });
});

app.get("/goat-arena/profile", (_req, res) => {
  res.render("goat-arena-profile", {
    activeArenaPage: "profile",
    accountUpdated: false,
    avatarUpdated: false,
    accountError: null,
    arenaProfileAvatars: ARENA_PROFILE_AVATARS,
    payoutEligible: false,
    paybackAccount: {
      confirmed: false,
      bankName: "",
      last4: "",
    },
    arenaUser: {
      nickname: "긴닉네임줄바꿈확인사용자",
      displayName: "긴닉네임줄바꿈확인사용자",
      schoolName: "미리보기고등학교",
      gradeLabel: "2학년",
      hasMainProfileBorder: false,
      hasStyleEntrance: false,
      activityLevel: {
        level: 4,
        totalMatches: 38,
      },
      avatar: getArenaProfileAvatar("COMET_FOX"),
    },
    arenaActivityLevel: {
      level: 4,
      maxLevel: 10,
      totalMatches: 38,
      currentLevelStart: 30,
      nextLevelThreshold: 50,
      matchesToNext: 12,
      levelProgress: 40,
      isMaxLevel: false,
    },
    user: { totalConnectedSeconds: 372_640 },
    seedState: { gp: 73 },
    ranking: {
      pools: { sub: { current: null }, main: { current: null } },
    },
    arenaAccess: {
      activeDivision: "SUB",
      standing: {
        arenaRank: "그랜드마스터",
        division: "SUB",
        arenaPosition: 12,
        gp: 73,
      },
      learningRights: {
        availableDays: 18,
        lockedDays: 1,
        paybackScoreDays: 32,
        neededForRefund: 0,
        minimumPaybackScore: 30,
        attackParticipationDays: 8,
        minimumAttackParticipationDays: 15,
        attackParticipationDaysNeeded: 7,
        attackParticipationQualified: false,
      },
    },
    arenaTutorial: previewArenaTutorial("SUB"),
  });
});

app.get("/preview/profile", (_req, res) => {
  res.render("profile", {
    profileUser: {
      name: "수학하는염소",
      email: "preview-student@example.test",
      role: "student",
      school: {
        code: "PREVIEW-HS",
        name: "미리보기고등학교",
        region: "서울특별시",
      },
      schoolGrade: 11,
      educationStatus: "enrolled",
      totalConnectedSeconds: 372_640,
      preferences: { coachMode: "spicy" },
    },
    arenaActivityLevel: {
      level: 4,
      totalMatches: 38,
      matchesToNext: 12,
      isMaxLevel: false,
    },
    arenaProfileAvatar: getArenaProfileAvatar("COMET_FOX"),
    arenaProfileAvatars: ARENA_PROFILE_AVATARS,
    schoolRegions: {
      서울특별시: [
        { code: "PREVIEW-HS", name: "미리보기고등학교" },
      ],
    },
    feedback: null,
    formValues: {},
  });
});

function previewArenaAccess(division = "SUB") {
  return {
    canUseSub: division === "SUB",
    canUseMain: division === "MAIN",
    isAdminPreview: false,
    learningRights: {
      availableDays: division === "MAIN" ? 30 : 18,
      totalMainDays: division === "MAIN" ? 30 : null,
      unlimited: false,
    },
  };
}

function previewDivisionPage(req, res, division) {
  const isSub = division === "SUB";
  const features = [
    [isSub ? "subChallengeRequest" : "mainArenaStatus", isSub ? "일반 쟁탈전 신청" : "Ranked 상태", "현재 전장 상태와 다음 작전을 확인합니다.", isSub ? "BATTLE" : "OPERATIONS"],
    [isSub ? "subActiveMatch" : "mainUpwardChallenge", isSub ? "진행 중 경기" : "상위 티어 쟁탈전", "서버가 자격을 확인하고 적격 상대를 자동으로 정합니다.", "BATTLE"],
    [isSub ? "subRevengeMatch" : "mainLowerTierInvitation", isSub ? "복수전" : "하위 티어 초대전", "준비·진행·제출 상태인 경기를 이어서 확인합니다.", "BATTLE"],
    [isSub ? "subRankHistory" : "mainActiveMatch", isSub ? "순위 변동 기록" : "진행 중 경기", "티어·순위·GP 변동 이력을 확인합니다.", isSub ? "RECORD" : "BATTLE"],
    [isSub ? "subPaybackProgress" : "mainLearningDayLedger", isSub ? "페이백 진행" : "학습일수 장부", "학습일수와 전장 자산의 현재 상태를 확인합니다.", isSub ? "PROGRESS" : "OPERATIONS"],
  ].map(([key, name, description, group]) => ({
    key,
    name,
    description,
    group,
    href: "#",
  }));
  const groupDefinitions = isSub
    ? [
        ["BATTLE", "BATTLE CONTROL", "경기 지휘", "신청부터 진행 중 경기와 복수전까지 한곳에서 관리합니다."],
        ["RECORD", "RANK RECORD", "순위 기록", "정산이 끝난 Arena 상태 변동과 내 위치를 확인합니다."],
        ["PROGRESS", "PAYBACK TRACK", "페이백 진행", "29일 학습과 페이백 점수 조건을 분리해 확인합니다."],
      ]
    : [
        ["BATTLE", "BATTLE CONTROL", "경기 지휘", "상향 쟁탈전·하위 티어 초대전·진행 경기를 관리합니다."],
        ["OPERATIONS", "ARENA OPERATIONS", "운영 현황", "현재 상태와 학습일수 장부를 확인합니다."],
      ];
  res.render("goat-arena-division", {
    activeArenaPage: isSub ? "sub" : "main",
    arenaUser: { nickname: "preview" },
    division,
    divisionLabel: isSub ? "Unranked" : "Ranked",
    divisionKoreanLabel: isSub ? "Unranked 전장" : "Ranked 전장",
    arenaAccess: previewArenaAccess(division),
    arenaTutorial: previewArenaTutorial(division, String(req.query.tour || "")),
    ranking: {
      pools: {
        sub: { current: { tier: "에메랄드", tierRank: 12 } },
        main: { current: { tier: "다이아몬드", tierRank: 7 } },
      },
    },
    activeMainPolicy: isSub ? null : { maximumTargetTierGap: 3 },
    features,
    featureGroups: groupDefinitions.map(([key, eyebrow, title, description]) => ({
      key,
      eyebrow,
      title,
      description,
      features: features.filter((feature) => feature.group === key),
    })),
    arenaNotifications: {
      unreadCount: 2,
      notifications: [],
      defenseByDivision: { SUB: isSub ? 1 : 0, MAIN: isSub ? 0 : 1 },
      actionByDivision: { SUB: isSub ? 1 : 0, MAIN: isSub ? 0 : 1 },
    },
  });
}

app.get("/goat-arena/sub", (req, res) => previewDivisionPage(req, res, "SUB"));
app.get("/goat-arena/main", (req, res) => previewDivisionPage(req, res, "MAIN"));

app.get("/goat-arena/sub/challenge", (_req, res) => {
  res.render("goat-arena-sub-challenge", {
    activeArenaPage: "sub",
    arenaUser: { nickname: "preview" },
    arenaTutorial: previewArenaTutorial("SUB"),
    requestId: "preview-sub-challenge",
    matchCreated: false,
    matchError: "",
    challengeData: {
      currentStanding: { arenaRank: "EMERALD", arenaPosition: 12, arenaGp: 64 },
      stakeDays: 1,
      activeMatch: null,
      canRequest: true,
      hasEligibleOpponent: true,
      dailyUsage: {
        attackCount: 1,
        attackLimit: 3,
        attackRemaining: 2,
        defenseCount: 0,
        defenseLimit: 3,
        defenseRemaining: 3,
        challengerWin: false,
      },
      targetTiers: [
        { tier: "DIAMOND", label: "다이아몬드", candidateCount: 23 },
        { tier: "MASTER", label: "마스터", candidateCount: 8 },
      ],
    },
  });
});

app.get("/goat-arena/main/battle", (_req, res) => {
  res.render("goat-arena-main-battle", {
    activeArenaPage: "main",
    arenaUser: { nickname: "preview" },
    arenaTutorial: previewArenaTutorial("MAIN"),
    requestId: "preview-main-battle",
    actionError: "",
    actionMessage: "",
    friendlyData: {
      query: "",
      searchResults: [],
      receivedInvitations: [],
      sentInvitations: [],
    },
    battleData: {
      currentTier: "DIAMOND",
      availableLearningDays: 30,
      activeMatch: null,
      eligible: true,
      upwardTargets: [
        { label: "MASTER", gap: 1 },
        { label: "GRANDMASTER", gap: 2 },
        { label: "CHALLENGER", gap: 3 },
      ],
      lowerTargets: [
        { label: "EMERALD", gap: 1 },
        { label: "PLATINUM", gap: 2 },
      ],
      receivedOffers: [],
      sentInvitations: [],
    },
  });
});

app.get("/goat-arena/main/shop", (_req, res) => {
  res.render("goat-arena-main-shop", {
    activeArenaPage: "shop",
    arenaUser: {
      nickname: "preview",
      hasMainProfileBorder: true,
      hasStyleEntrance: false,
    },
    arenaTutorial: previewArenaTutorial("MAIN"),
    requestId: "preview-shop-request",
    shopMessage: null,
    shopError: null,
    shopData: {
      availableLearningDays: 18,
      policyVersionCode: "현재 시즌 운영 정책",
      policyDisplayName: "Ranked 상점 운영 정책",
      policyEffectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
      sundayLocked: false,
      invitations: [],
      effects: [],
      items: [
        { itemCode: "MATCH_ANALYSIS", displayName: "경기 분석권", priceDays: 1, releasePhase: 1 },
        { itemCode: "DEFENSE_REST", displayName: "방어 휴식권", priceDays: 1, releasePhase: 1 },
        { itemCode: "DEFENSE_SCHEDULE_PROTECTION", displayName: "방어 일정 보호권", priceDays: 2, releasePhase: 1 },
        { itemCode: "INVITATION_ACCELERATION", displayName: "초대 가속권", priceDays: 1, releasePhase: 2 },
        { itemCode: "MAIN_PROFILE_BORDER", displayName: "Ranked 프로필 테두리", priceDays: 2, releasePhase: 2 },
        { itemCode: "STYLE_ENTRANCE", displayName: "스타일 칭호·입장 연출", priceDays: 1, releasePhase: 2 },
      ],
    },
  });
});

app.get("/goat-arena/main/shop/analyses/preview", (_req, res) => {
  res.render("goat-arena-main-shop-analysis", {
    activeArenaPage: "shop",
    arenaUser: {
      nickname: "preview",
      hasMainProfileBorder: true,
      hasStyleEntrance: false,
    },
    analysis: {
      id: "preview",
      status: "APPLIED",
      analysisState: "READY",
      relatedMatchId: "preview-match",
      result: "WIN",
      score: 80,
      correctCount: 4,
      totalSolveTimeMs: 523000,
      incorrectQuestionKeys: ["5번"],
      weakSkills: ["수열의 귀납적 정의", "조건 해석"],
      reviewProblemCount: 10,
      checklist: ["점화식의 첫 세 항을 직접 쓰기", "조건에서 시작값을 먼저 확인하기"],
      questionReviews: [
        {
          number: 1,
          questionKey: "Q1",
          courseId: "algebra",
          typeId: "ALG-SEQUENCE-SUM",
          prompt: "첫째항이 2이고 공차가 3인 등차수열의 첫 5개 항의 합을 구하세요.",
          submittedAnswer: "35",
          correctAnswer: "40",
          correct: false,
          pointsAwarded: 0,
          responseTimeMs: 124000,
          solution: "첫 5개 항은 2, 5, 8, 11, 14이므로 합은 40이다.",
          referenceSolutionProcess: [
            { step: 1, explanation: "문제에서 주어진 수열의 첫째항과 공차를 확인한다." },
            { step: 2, explanation: "필요한 항을 직접 쓰거나 일반항을 구한다." },
            { step: 3, explanation: "등차수열의 합 공식을 적용한다." },
          ],
          referenceFinalCheck: "직접 나열한 항의 합과 공식 계산 결과가 같은지 확인한다.",
        },
      ],
      generatedAt: new Date("2026-08-03T10:00:00+09:00"),
    },
  });
});

app.get("/admin/arena-matches", (req, res) => {
  const previewHeldMatch = {
    id: "64b000000000000000000081",
    division: "SUB",
    matchType: "RANK_TAKEOVER",
    tierPairLabel: "실버 → 골드",
    integrityStatus: "HELD",
    todo: {
      title: "Arena 정산 보류",
      description: "빠른 정답 문항과 반복 화면 이탈이 감지되어 운영자 확인이 필요합니다.",
    },
    challengerUser: { realName: "검토 대상 사용자", name: "preview-challenger" },
    defenderUser: { realName: "방어 사용자", name: "preview-defender" },
    problemPack: { displayName: "T3 준킬러 5문항", version: "ARENA-T3-V4" },
    attempts: [
      {
        role: "CHALLENGER",
        status: "SUBMITTED",
        currentQuestionIndex: 5,
        correctCount: 4,
        activeSolveTimeMs: 284000,
        submittedAt: new Date("2026-08-04T09:12:00+09:00"),
        user: { realName: "검토 대상 사용자" },
        evidence: {
          _id: "64b000000000000000000091",
          status: "ANOMALY_FLAGGED",
          anomalyFlags: ["MULTIPLE_RAPID_CORRECT_ANSWERS", "REPEATED_FOCUS_LOSS", "MATCH_PAGE_EXITED"],
          files: [{ storedName: "preview-solution-1.jpg", originalName: "풀이과정-공격자.jpg" }],
        },
        questions: Array.from({ length: 5 }, (_, index) => ({
          number: index + 1,
          typeId: `T3-TYPE-${index + 1}`,
          prompt: `${index + 1}번 준킬러 문항의 조건을 만족하는 값을 구하세요.`,
          submittedAnswer: String(12 + index),
          correctAnswer: String(index === 3 ? 20 : 12 + index),
          correct: index !== 3,
          responseTimeMs: [42000, 51000, 58000, 76000, 57000][index],
          solution: "조건을 식으로 정리한 뒤 가능한 경우를 나누어 계산하고, 마지막에 원래 조건을 대입해 검산합니다.",
        })),
      },
      {
        role: "DEFENDER",
        status: "SUBMITTED",
        currentQuestionIndex: 5,
        correctCount: 3,
        activeSolveTimeMs: 411000,
        submittedAt: new Date("2026-08-04T09:20:00+09:00"),
        user: { realName: "방어 사용자" },
        evidence: {
          _id: "64b000000000000000000092",
          status: "ON_TIME",
          anomalyFlags: [],
          files: [{ storedName: "preview-solution-2.jpg", originalName: "풀이과정-방어자.jpg" }],
        },
        questions: Array.from({ length: 5 }, (_, index) => ({
          number: index + 1,
          typeId: `T3-TYPE-${index + 1}`,
          prompt: `${index + 1}번 준킬러 문항의 조건을 만족하는 값을 구하세요.`,
          submittedAnswer: String(index < 3 ? 12 + index : 30 + index),
          correctAnswer: String(12 + index),
          correct: index < 3,
          responseTimeMs: [69000, 72000, 81000, 93000, 96000][index],
          solution: "조건을 식으로 정리한 뒤 가능한 경우를 나누어 계산하고, 마지막에 원래 조건을 대입해 검산합니다.",
        })),
      },
    ],
    participants: [
      {
        role: "CHALLENGER",
        user: { realName: "검토 대상 사용자", accountStatus: "active", warningCount: 1 },
        history: {
          riskCases: [{ status: "CLEARED", riskScore: 25, createdAt: new Date("2026-07-20T18:00:00+09:00") }],
          adminActions: [{ action: "경고 +1", detail: "게시판 운영 규칙 위반", createdAt: new Date("2026-07-10T14:00:00+09:00") }],
        },
      },
      {
        role: "DEFENDER",
        user: { realName: "방어 사용자", accountStatus: "active", warningCount: 0 },
        history: { riskCases: [], adminActions: [] },
      },
    ],
    reviewActions: [{ action: "ARENA_MATCH_REVIEW_NOTE", detail: "풀이 증거 원본 확인 예정", createdAt: new Date("2026-08-04T09:30:00+09:00") }],
  };
  const reviewStatus = req.query.reviewStatus === "completed" ? "completed" : "pending";
  res.locals.adminTodoSummary = { pendingCount: 2, items: [] };
  res.render("admin-arena-matches", {
    user: { name: "preview-admin", role: "admin" },
    adminNotice: "",
    reviewStatus,
    evidenceEntries: [],
    formatAdminMath,
    integrityReview: {
      heldCount: 1,
      heldMatches: [previewHeldMatch],
      openCount: 1,
      highCount: 1,
      cases: [
        {
          id: "64b000000000000000000099",
          riskLevel: "CRITICAL",
          riskScore: 75,
          user: {
            realName: "검토 대상 사용자",
            email: "review@example.com",
          },
          linkedUsers: [{ realName: "연관 사용자" }],
          relatedMatchIds: ["match-1", "match-2", "match-3"],
          reasons: [
            {
              label: "같은 기기 연관 신호와 반복 경기",
              points: 30,
              description: "같은 기기 연관 신호를 가진 상대와 반복 경기했습니다.",
            },
            {
              label: "한 방향 학습일수 이전",
              points: 25,
              description: "같은 상대에게 학습일수가 반복적으로 이전되었습니다.",
            },
            {
              label: "같은 상대와 반복 경기",
              points: 20,
              description: "30일 동안 같은 상대와 5회 경기했습니다.",
            },
          ],
        },
      ],
      completedCount: 2,
      completedReviews: [
        {
          type: "MATCH",
          action: "arena.match.review.cleared",
          note: "양측 풀이 기록과 증거를 대조한 결과 이상이 없어 신규 경기 제한을 해제했습니다.",
          reviewedAt: new Date("2026-08-04T11:20:00+09:00"),
          reviewer: { name: "preview-admin" },
          user: { realName: "검토 완료 사용자" },
          matchId: "64b000000000000000000071",
        },
        {
          type: "MATCH",
          action: "arena.match.review.defender_cheating",
          note: "방어자 증거와 답안 흐름이 일치하지 않아 부정행위를 확정했습니다.",
          reviewedAt: new Date("2026-08-03T18:10:00+09:00"),
          reviewer: { name: "preview-admin" },
          user: { realName: "제재 처리 사용자" },
          matchId: "64b000000000000000000072",
        },
      ],
    },
  });
});

app.get("/admin/arena-audit", (_req, res) => {
  res.render("admin-arena-audit", {
    user: { name: "preview-admin", role: "admin" },
    operationFeedback: null,
    audit: {
      health: "HEALTHY",
      generatedAt: new Date(),
      scope: { truncated: false },
      issues: [],
      summary: {
        criticalCount: 0,
        warningCount: 0,
        pendingOutboxCount: 0,
        checkedCycles: 12,
        checkedMatches: 28,
        checkedInvitations: 3,
        checkedLocks: 0,
        checkedShopPurchases: 0,
        checkedShopEffects: 0,
        displayedIssueCount: 0,
        issueCount: 0,
        byCategory: {},
      },
    },
    rankingOperations: {
      health: {
        status: "HEALTHY",
        activeProfileCount: 120,
        duplicateRanks: [],
        missingRanks: [],
        staleCount: 0,
        alerts: [],
      },
      recalculationPreview: null,
      history: [],
      operations: {
        storage: {
          productionSafe: true,
          r2BackupConfigured: false,
          localCapacity: { usedPercent: 24.7 },
        },
        emailConfigured: true,
        sharedSessionConfigured: false,
        schedulerEnabled: true,
      },
    },
  });
});

app.get("/archive/admin", (_req, res) => {
  const now = new Date();
  const baseItem = {
    id: "64b000000000000000000071",
    folderId: null,
    title: "2026 Matths 주간 공식 모의고사 문제지",
    description: "운영자 R2 저장 미리보기",
    category: "문제지",
    originalName: "weekly-mock.pdf",
    mimeType: "application/pdf",
    sizeBytes: 42 * 1024 * 1024,
    createdAt: now,
    isPublished: true,
    storageProvider: "R2",
    storagePurpose: "ADMIN_WEEKLY_MOCK",
    backupStatus: "BACKED_UP",
    backedUpAt: now,
  };
  res.render("admin-archive", {
    user: { name: "preview-admin", role: "admin" },
    adminMode: true,
    feedback: null,
    archiveData: {
      isAdmin: true,
      categories: ["문제지", "해설", "개념 자료", "기타"],
      folders: [],
      folderOptions: [],
      breadcrumbs: [],
      selectedFolder: null,
      items: [baseItem],
      trashItems: [
        {
          ...baseItem,
          id: "64b000000000000000000072",
          title: "삭제한 아카이브 자료",
          deletedAt: now,
          purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      ],
    },
    oldInput: {
      title: "",
      description: "",
      category: "문제지",
      folderId: "",
      folderName: "",
      folderDescription: "",
      folderAccessLevel: "AUTHENTICATED",
      editFolderName: "",
      editFolderDescription: "",
      editFolderAccessLevel: "AUTHENTICATED",
      parentFolderId: "",
      notifyUsers: false,
    },
  });
});

app.get(["/assessments", "/assessment-center"], (_req, res) => {
  const emptyState = {
    passed: false,
    bestScore: null,
    attempts: 0,
    activeAttemptId: null,
    hasEmptyAttempt: false,
  };
  res.render("assessment-center", {
    user: {
      name: "preview-student",
      schoolGrade: 11,
    },
    assessmentData: {
      passScore: 80,
      courses: [
        {
          id: "common-math-1",
          title: "공통수학 1",
          available: true,
          unlockedAssessmentCount: 2,
          units: [
            {
              id: "polynomial",
              title: "다항식",
              subunits: [
                {
                  id: "operations",
                  title: "다항식의 연산",
                  concepts: [
                    { id: "addition", title: "다항식의 덧셈과 뺄셈" },
                    { id: "multiplication", title: "다항식의 곱셈" },
                  ],
                  unlocked: true,
                  lockReason: null,
                  ...emptyState,
                },
                {
                  id: "remainder",
                  title: "나머지정리",
                  concepts: [
                    { id: "remainder-theorem", title: "나머지정리와 인수정리" },
                  ],
                  unlocked: false,
                  lockReason: "연결된 개념을 모두 완료하면 열립니다.",
                  ...emptyState,
                },
              ],
              final: {
                unlocked: true,
                lockReason: null,
                ...emptyState,
              },
            },
          ],
          courseFinal: {
            unlocked: true,
            lockReason: null,
            ...emptyState,
          },
        },
        {
          id: "common-math-2",
          title: "공통수학 2",
          available: false,
          unlockedAssessmentCount: 0,
          lockReason: "공통수학 1의 학습을 먼저 완료해야 합니다.",
          units: [],
          courseFinal: {
            unlocked: false,
            lockReason: "과목 학습을 먼저 완료해야 합니다.",
            ...emptyState,
          },
        },
      ],
    },
  });
});

app.get("/admin/arena-policies", (_req, res) => {
  const now = new Date("2026-08-03T10:00:00+09:00");
  const subPolicy = {
    _id: "64b000000000000000000081",
    displayName: "Unranked 기본 운영 정책",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
    effectiveUntil: null,
    priceAmount: 29000,
    initialLearningDays: 29,
    initialPaybackScoreDays: 29,
    matchStakeDays: { normal: 1, revenge: 2 },
    payback: {
      minimumAttackParticipationDays: 15,
      minimumScoreDays: 30,
      bands: [
        { minScoreDays: 0, maxScoreDays: 29, ratePercent: 0 },
        { minScoreDays: 30, maxScoreDays: 34, ratePercent: 50 },
        { minScoreDays: 35, maxScoreDays: 39, ratePercent: 80 },
        { minScoreDays: 40, maxScoreDays: null, ratePercent: 100 },
      ],
    },
    changeSummary: "현재 Unranked 운영 기준",
  };
  const mainPolicy = {
    _id: "64b000000000000000000082",
    displayName: "Ranked 기본 운영 정책",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
    effectiveUntil: null,
    maximumTargetTierGap: 3,
    mainEntryBonusDays: 2,
    mainCarryoverBaseDays: 29,
    invitationCancellationFeeDays: 1,
    repeatOpponentExclusionDays: 7,
    maximumActiveInvitationReservationsPerTargetTier: 1,
    revengeStakeMultiplier: 2,
    revengeFeeDays: 1,
    stakeDaysByTierGap: [
      { tierGap: 1, stakeDays: 1 },
      { tierGap: 2, stakeDays: 2 },
      { tierGap: 3, stakeDays: 3 },
    ],
    changeSummary: "현재 Ranked 운영 기준",
  };
  const mockPolicy = {
    _id: "64b000000000000000000083",
    displayName: "Matths 주간 공식 모의고사 이용권",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
    monthlyPriceAmount: 5000,
    billingPeriodDays: 30,
    placementCalibrationMinimumWeeklyExams: 4,
    changeSummary: "현재 월 이용 가격",
  };
  const shopPolicy = {
    _id: "64b000000000000000000084",
    displayName: "Ranked 상점 운영 정책",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
    items: [
      { itemCode: "MATCH_ANALYSIS", displayName: "Arena 경기 분석권", priceDays: 1, enabled: true },
      { itemCode: "DEFENSE_REST", displayName: "방어 휴식권", priceDays: 1, enabled: true },
      { itemCode: "DEFENSE_SCHEDULE_PROTECTION", displayName: "방어 일정 보호권", priceDays: 2, enabled: true },
      { itemCode: "INVITATION_ACCELERATION", displayName: "초대 매칭 가속권", priceDays: 1, enabled: false },
      { itemCode: "MAIN_PROFILE_BORDER", displayName: "Ranked 프로필 테두리", priceDays: 2, enabled: true },
      { itemCode: "STYLE_ENTRANCE", displayName: "스타일 칭호·입장 연출", priceDays: 1, enabled: true },
    ],
  };
  res.render("admin-arena-policies", {
    user: { name: "preview-admin", role: "admin" },
    feedback: null,
    error: null,
    oldInput: null,
    policyData: {
      now,
      paybackRules: { cycleDays: 29, minimumAttackParticipationDays: 15 },
      sub: { activePolicy: subPolicy, upcomingPolicy: null, policies: [subPolicy] },
      learningPackage: { activePolicy: subPolicy, policies: [subPolicy] },
      policies: [subPolicy],
      main: { activePolicy: mainPolicy, upcomingPolicy: null, policies: [mainPolicy] },
      mockExamOnly: { now, activePolicy: mockPolicy, policies: [mockPolicy] },
      mainShop: { activePolicy: shopPolicy, policies: [shopPolicy] },
    },
  });
});

app.get("/preview/admin/arena-match-history", (_req, res) => {
  const users = [
    { id: "64b000000000000000000711", nickname: "수학하는염소", realName: "공격 사용자", email: "goat@example.test" },
    { id: "64b000000000000000000712", nickname: "미적분비둘기", realName: "방어 사용자", email: "pigeon@example.test" },
  ];
  const records = [
    {
      id: "64b000000000000000000721",
      matchKey: "MAIN:NORMAL:20260828:001",
      seasonKey: "2026-S3",
      division: "MAIN",
      matchType: "NORMAL",
      tierPairLabel: "R3 → R2",
      status: "SETTLED",
      integrityStatus: "CLEAR",
      challenger: { ...users[0], role: "CHALLENGER", result: "WIN", score: 80, correctCount: 4 },
      defender: { ...users[1], role: "DEFENDER", result: "LOSE", score: 60, correctCount: 3 },
      requestedAt: new Date("2026-08-28T17:20:00+09:00"),
      startedAt: new Date("2026-08-28T17:30:00+09:00"),
      completedAt: new Date("2026-08-28T18:22:00+09:00"),
    },
    {
      id: "64b000000000000000000722",
      matchKey: "SUB:REVENGE:20260827:004",
      seasonKey: "2026-S3",
      division: "SUB",
      matchType: "REVENGE",
      tierPairLabel: "U2 → U1",
      status: "HELD",
      integrityStatus: "SUSPICIOUS",
      challenger: { ...users[1], role: "CHALLENGER", result: "NO_RESULT", score: 100, correctCount: 5 },
      defender: { ...users[0], role: "DEFENDER", result: "NO_RESULT", score: 80, correctCount: 4 },
      requestedAt: new Date("2026-08-27T20:10:00+09:00"),
      startedAt: new Date("2026-08-27T20:15:00+09:00"),
      completedAt: new Date("2026-08-27T21:04:00+09:00"),
    },
  ];
  res.render("admin-arena-match-history", {
    user: { id: "64b000000000000000000799", name: "preview-admin", role: "admin" },
    history: {
      filters: {
        query: "",
        dateFrom: "",
        dateTo: "",
        division: "",
        matchType: "",
        status: "",
        integrityStatus: "",
        participantId: "",
      },
      total: records.length,
      page: 1,
      pageSize: 30,
      totalPages: 1,
      records,
      filterParticipant: null,
    },
  });
});

app.get("/preview/academy", (req, res) => {
  const academyClass = { _id: "64b000000000000000000811", name: "고1 월수반" };
  const previewStudents = [
    ["64b000000000000000000821", "이민준", 10, "평촌고등학교", "PRESENT", ""],
    ["64b000000000000000000822", "박서연", 10, "경기외국어고등학교", "LATE", "교통 지연"],
    ["64b000000000000000000823", "김도윤", 11, "백영고등학교", "ABSENT", "연락 확인 중"],
    ["64b000000000000000000824", "최지우", 10, "동안고등학교", "PRESENT", ""],
    ["64b000000000000000000825", "정하준", 12, "평촌고등학교", null, ""],
    ["64b000000000000000000826", "한예린", 11, "경기외국어고등학교", "EXCUSED", "학교 행사"],
  ].map(([id, realName, schoolGrade, schoolName, status, note], index) => ({
    membership: {
      _id: `64b00000000000000000083${index}`,
      classId: academyClass,
      studentUserId: {
        _id: id,
        name: `preview-student-${index + 1}`,
        realName,
        schoolGrade,
        school: { name: schoolName, region: "경기도" },
      },
    },
    attendance: status
      ? {
          status,
          note,
          checkedInAt: status === "PRESENT" || status === "LATE" ? new Date(`2026-08-29T0${index + 1}:20:00+09:00`) : null,
        }
      : null,
  }));
  const activeAcademyPage = req.query.tab === "attendance" ? "attendance" : "dashboard";
  res.render("academy", {
    user: {
      id: "64b000000000000000000801",
      name: "평촌수학선생님",
      realName: "김선생",
      role: "teacher",
    },
    activeAcademyPage,
    portal: {
      academy: { _id: "64b000000000000000000810", name: "평촌 하이수학" },
      pendingCount: 3,
      staffPendingCount: 0,
      isOwner: true,
      classes: [academyClass],
      students: previewStudents.map((item) => item.membership),
      requests: [],
      invites: [],
      activeStaff: [],
      staffRequests: [],
    },
    statistics: {
      period: {
        key: "2026-08",
        label: "2026년 8월 (이번 달)",
        options: [{ key: "2026-08", label: "2026년 8월 (이번 달)" }],
      },
      cards: [
        { label: "학습 건강도", value: "72점", detail: "관찰 · 데이터 반영 92%" },
        { label: "학습 참여 학생", value: "23명", detail: "92% 참여" },
        { label: "평균 학습일", value: "8.4일", detail: "학생 1인당 · 미학습 0일 포함" },
        { label: "오답 복습률", value: "76%", detail: "전체 오답 184개 기준" },
      ],
      health: {
        score: 72,
        key: "WATCH",
        label: "관찰",
        dataCoverage: 92,
        targetLearningDays: 12,
        distribution: { HEALTHY: 12, WATCH: 8, RISK: 5 },
        components: { engagement: 78, accuracy: 71, review: 76, recovery: 62 },
      },
      analytics: {
        growth: {
          points: [
            { label: "1주", attempts: 118, uniqueProblems: 91, activeStudents: 18, accuracy: 64 },
            { label: "2주", attempts: 146, uniqueProblems: 108, activeStudents: 21, accuracy: 69 },
            { label: "3주", attempts: 171, uniqueProblems: 126, activeStudents: 23, accuracy: 74 },
            { label: "4주", attempts: 158, uniqueProblems: 119, activeStudents: 22, accuracy: 79 },
            { label: "5주", attempts: 62, uniqueProblems: 48, activeStudents: 15, accuracy: 82 },
          ],
        },
        heatmap: {
          measuredConcepts: 12,
          items: [
            ["공통수학1", "방정식과 부등식", "이차함수와 직선의 위치 관계", 42, 31, 12],
            ["공통수학1", "경우의 수", "순열과 조합", 49, 28, 11],
            ["대수", "지수함수와 로그함수", "로그의 뜻과 성질", 55, 34, 14],
            ["공통수학1", "다항식", "항등식과 나머지정리", 61, 41, 17],
            ["확률과 통계", "확률", "조건부확률", 66, 29, 10],
            ["대수", "수열", "수열의 귀납적 정의", 70, 37, 15],
            ["공통수학1", "행렬", "행렬의 곱셈", 73, 45, 19],
            ["미적분Ⅰ", "미분", "함수의 증가와 감소", 78, 33, 13],
            ["공통수학1", "다항식", "다항식의 사칙연산", 82, 52, 21],
            ["대수", "수열", "등차수열", 86, 48, 20],
            ["확률과 통계", "통계", "정규분포", 91, 36, 15],
            ["미적분Ⅰ", "적분", "정적분의 활용", 94, 31, 12],
          ].map(([courseTitle, unitTitle, conceptTitle, accuracy, attempts, studentCount], index) => ({
            key: `preview-${index}`,
            courseTitle,
            unitTitle,
            conceptTitle,
            accuracy,
            weakness: 100 - accuracy,
            attempts,
            correct: Math.round((accuracy / 100) * attempts),
            studentCount,
          })),
        },
      },
      summary: {
        bullets: [
          { label: "학습 참여", text: "승인 학생 25명 중 23명이 학습해 참여율은 92%입니다." },
          { label: "학습 건강도", text: "학원 평균은 72점이며 주의 학생은 5명입니다." },
          { label: "다음 운영 방향", text: "이차함수와 순열·조합 취약 학생을 먼저 확인하는 것이 좋습니다." },
        ],
      },
      attentionStudents: [],
    },
    attendance: {
      dateKey: "2026-08-29",
      todayKey: "2026-08-29",
      classes: [academyClass],
      selectedClass: academyClass,
      roster: previewStudents,
      counts: { TOTAL: 6, PRESENT: 2, LATE: 1, ABSENT: 1, EXCUSED: 1, UNRECORDED: 1 },
    },
    studentPage: null,
    feedback: null,
    createdInviteId: "",
  });
});

const server = require.main === module
  ? app.listen(port, "0.0.0.0", () => {
      console.log(`Matths UI preview: http://127.0.0.1:${port}`);
    })
  : null;

module.exports = {
  app,
  server,
};

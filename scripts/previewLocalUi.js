const path = require("node:path");
const express = require("express");
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

const app = express();
const root = path.resolve(__dirname, "..");
const port = Number(process.env.MATTHS_PREVIEW_PORT) || 8011;

app.set("view engine", "ejs");
app.set("views", path.join(root, "views"));
app.use(express.static(path.join(root, "public")));

app.get("/pricing", (req, res) => {
  const user = req.query.logged === "1" ? { name: "preview-user" } : null;
  res.render("pricing", {
    user,
    activePage: "pricing",
    mockExamPolicy: { monthlyPriceAmount: 5000 },
    learningPackagePolicy: { priceAmount: 29000 },
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

app.get("/goat-arena", (_req, res) => {
  res.render("goat-arena", {
    activeArenaPage: "home",
    arenaUser: { nickname: "preview", displayName: "preview" },
    seedState: {
      ready: true,
      label: "현재 Arena 상태",
      tier: "에메랄드",
      division: "Sub Division",
      gp: 60,
      tierRank: 12,
      detail: "배치고사 결과가 현재 시즌 Sub Division에 반영되었습니다.",
    },
    arenaAccess: { activeDivision: "SUB" },
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
        displayName: "Main Division 현재 운영 기준",
        maximumTargetTierGap: 3,
        stakeDaysByTierGap: [
          { tierGap: 1, stakeDays: 1 },
          { tierGap: 2, stakeDays: 2 },
          { tierGap: 3, stakeDays: 3 },
        ],
        repeatOpponentExclusionDays: 7,
        requiresOpponentDaysGreaterThanStake: true,
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
    label: "Main Division",
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
          label: "Sub Division",
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
    arenaUser: {
      nickname: "긴닉네임줄바꿈확인사용자",
      displayName: "긴닉네임줄바꿈확인사용자",
      schoolName: "미리보기고등학교",
      gradeLabel: "2학년",
      hasMainProfileBorder: false,
      hasStyleEntrance: false,
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
        reservedForMainReentryDays: 9,
        lockedDays: 1,
        paybackScoreDays: 32,
        neededForRefund: 0,
        minimumPaybackScore: 30,
        studyStreakDays: 17,
        minimumStudyStreakDays: 29,
        studyDaysNeeded: 12,
        fullAttendanceQualified: false,
      },
    },
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

function previewDivisionPage(res, division) {
  const isSub = division === "SUB";
  res.render("goat-arena-division", {
    activeArenaPage: isSub ? "sub" : "main",
    arenaUser: { nickname: "preview" },
    division,
    divisionLabel: isSub ? "Sub Division" : "Main Division",
    divisionKoreanLabel: isSub ? "Sub Division 전장" : "Main Division 전장",
    arenaAccess: previewArenaAccess(division),
    ranking: {
      pools: {
        sub: { current: { tier: "에메랄드", tierRank: 12 } },
        main: { current: { tier: "다이아몬드", tierRank: 7 } },
      },
    },
    activeMainPolicy: isSub ? null : { maximumTargetTierGap: 3 },
    features: [
      [isSub ? "일반 쟁탈전 신청" : "Main Division 상태", "현재 전장 상태와 다음 작전을 확인합니다."],
      [isSub ? "방어 요청" : "상위 티어 쟁탈전", "서버가 자격을 확인하고 적격 상대를 자동으로 정합니다."],
      ["진행 중 경기", "준비·진행·제출 상태인 경기를 이어서 확인합니다."],
      ["복수전", "최근 정산으로 확보한 복수전 권리를 확인합니다."],
      ["순위 변동 기록", "티어·순위·GP 변동 이력을 확인합니다."],
      [isSub ? "페이백 진행" : "학습일수 장부", "학습일수와 전장 자산의 현재 상태를 확인합니다."],
    ].map(([name, description], index) => ({
      key: `preview-${division}-${index}`,
      name,
      description,
      href: index === 1 && !isSub ? "/goat-arena/main/battle" : "#",
    })),
  });
}

app.get("/goat-arena/sub", (_req, res) => previewDivisionPage(res, "SUB"));
app.get("/goat-arena/main", (_req, res) => previewDivisionPage(res, "MAIN"));

app.get("/goat-arena/sub/challenge", (_req, res) => {
  res.render("goat-arena-sub-challenge", {
    activeArenaPage: "sub",
    arenaUser: { nickname: "preview" },
    requestId: "preview-sub-challenge",
    matchCreated: false,
    matchError: "",
    challengeData: {
      currentStanding: { arenaRank: "EMERALD", arenaPosition: 12, arenaGp: 64 },
      stakeDays: 1,
      activeMatch: null,
      canRequest: true,
      hasEligibleOpponent: true,
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
    requestId: "preview-main-battle",
    actionError: "",
    actionMessage: "",
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
    requestId: "preview-shop-request",
    shopMessage: null,
    shopError: null,
    shopData: {
      availableLearningDays: 18,
      policyVersionCode: "현재 시즌 운영 정책",
      policyDisplayName: "Main Division 상점 운영 정책",
      policyEffectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
      sundayLocked: false,
      invitations: [],
      effects: [],
      items: [
        { itemCode: "MATCH_ANALYSIS", displayName: "경기 분석권", priceDays: 1, releasePhase: 1 },
        { itemCode: "DEFENSE_REST", displayName: "방어 휴식권", priceDays: 1, releasePhase: 1 },
        { itemCode: "DEFENSE_SCHEDULE_PROTECTION", displayName: "방어 일정 보호권", priceDays: 2, releasePhase: 1 },
        { itemCode: "INVITATION_ACCELERATION", displayName: "초대 가속권", priceDays: 1, releasePhase: 2 },
        { itemCode: "MAIN_PROFILE_BORDER", displayName: "Main 프로필 테두리", priceDays: 2, releasePhase: 2 },
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

app.get("/admin/arena-matches", (_req, res) => {
  res.render("admin-arena-matches", {
    user: { name: "preview-admin", role: "admin" },
    evidenceEntries: [],
    integrityReview: {
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
      dormancyCandidates: [],
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
    description: "운영자 로컬 저장 미리보기",
    category: "문제지",
    originalName: "weekly-mock.pdf",
    mimeType: "application/pdf",
    sizeBytes: 42 * 1024 * 1024,
    createdAt: now,
    isPublished: true,
    storageProvider: "LOCAL",
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
    displayName: "Sub Division 기본 운영 정책",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
    effectiveUntil: null,
    priceAmount: 29000,
    initialLearningDays: 29,
    initialPaybackScoreDays: 29,
    matchStakeDays: { normal: 1, revenge: 2 },
    payback: {
      minimumStreakDays: 29,
      minimumPaidNormalAttacks: 2,
      minimumScoreDays: 30,
      bands: [
        { minScoreDays: 0, maxScoreDays: 29, ratePercent: 0 },
        { minScoreDays: 30, maxScoreDays: 34, ratePercent: 50 },
        { minScoreDays: 35, maxScoreDays: 39, ratePercent: 80 },
        { minScoreDays: 40, maxScoreDays: null, ratePercent: 100 },
      ],
    },
    changeSummary: "현재 Sub Division 운영 기준",
  };
  const mainPolicy = {
    _id: "64b000000000000000000082",
    displayName: "Main Division 기본 운영 정책",
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
    changeSummary: "현재 Main Division 운영 기준",
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
    displayName: "Main Division 상점 운영 정책",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
    items: [
      { itemCode: "MATCH_ANALYSIS", displayName: "Arena 경기 분석권", priceDays: 1, enabled: true },
      { itemCode: "DEFENSE_REST", displayName: "방어 휴식권", priceDays: 1, enabled: true },
      { itemCode: "DEFENSE_SCHEDULE_PROTECTION", displayName: "방어 일정 보호권", priceDays: 2, enabled: true },
      { itemCode: "INVITATION_ACCELERATION", displayName: "초대 매칭 가속권", priceDays: 1, enabled: false },
      { itemCode: "MAIN_PROFILE_BORDER", displayName: "Main 프로필 테두리", priceDays: 2, enabled: true },
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
      learningPackage: { activePolicy: subPolicy },
      policies: [subPolicy],
      main: { activePolicy: mainPolicy, policies: [mainPolicy] },
      mockExamOnly: { now, activePolicy: mockPolicy, policies: [mockPolicy] },
      mainShop: { activePolicy: shopPolicy, policies: [shopPolicy] },
    },
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Matths UI preview: http://127.0.0.1:${port}`);
});
setInterval(() => {}, 60_000);

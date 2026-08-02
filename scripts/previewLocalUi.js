const path = require("node:path");
const express = require("express");
const { arenaTierGuide } = require("../services/arenaTierPolicy");
const { getArenaRulebook } = require("../services/arenaRulebookViewService");

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
      sundayLocked: false,
      invitations: [],
      effects: [],
      items: [
        { itemCode: "MATCH_ANALYSIS", displayName: "경기 분석권", priceDays: 1, releasePhase: 1 },
        { itemCode: "DEFENSE_REST", displayName: "방어 휴식권", priceDays: 1, releasePhase: 1 },
        { itemCode: "DEFENSE_SCHEDULE_PROTECTION", displayName: "방어 일정 보호권", priceDays: 2, releasePhase: 1 },
        { itemCode: "INVITATION_ACCELERATION", displayName: "초대 가속권", priceDays: 1, releasePhase: 2 },
        { itemCode: "MAIN_PROFILE_BORDER", displayName: "Main 프로필 테두리", priceDays: 2, releasePhase: 2 },
        { itemCode: "STYLE_ENTRANCE", displayName: "스타일 칭호·입장 연출", priceDays: 3, releasePhase: 2 },
      ],
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Matths UI preview: http://127.0.0.1:${port}`);
});
setInterval(() => {}, 60_000);

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const {
  MockExamPackagePolicyVersion,
  MockExamSubscription,
} = require("../models/goatArenaModel");
const { User } = require("../models/matthsModel");
const {
  DEFAULT_CALIBRATION_WEEKLY_EXAMS,
  DEFAULT_MONTHLY_PRICE_AMOUNT,
  policyView,
} = require("../services/mockExamPackageService");
const {
  DEFAULT_LEARNING_PACKAGE_DAYS,
  DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT,
  learningPackagePolicyView,
} = require("../services/arenaPolicyService");
const {
  getArenaRulebook,
} = require("../services/arenaRulebookViewService");
const {
  getAdminProblemBankCatalog,
} = require("../services/problemBankCatalogService");
const {
  _testing: placementTesting,
} = require("../services/placementExamService");

const root = path.resolve(__dirname, "..");
const read = (file) =>
  fs.readFileSync(path.join(root, file), "utf8");

assert.equal(DEFAULT_MONTHLY_PRICE_AMOUNT, 5000);
assert.equal(DEFAULT_CALIBRATION_WEEKLY_EXAMS, 4);
assert.equal(DEFAULT_LEARNING_PACKAGE_PRICE_AMOUNT, 29000);
assert.equal(DEFAULT_LEARNING_PACKAGE_DAYS, 29);
assert.equal(learningPackagePolicyView(null).priceAmount, 29000);
assert.equal(learningPackagePolicyView(null).initialLearningDays, 29);
assert.deepEqual(
  {
    price: policyView(null).monthlyPriceAmount,
    weeklyMockExamAllowed: policyView(null).weeklyMockExamAllowed,
    placementExamAllowed: policyView(null).placementExamAllowed,
    goatArenaAllowed: policyView(null).goatArenaAllowed,
  },
  {
    price: 5000,
    weeklyMockExamAllowed: true,
    placementExamAllowed: false,
    goatArenaAllowed: false,
  }
);

assert.ok(MockExamPackagePolicyVersion.schema.path("monthlyPriceAmount"));
assert.ok(MockExamPackagePolicyVersion.schema.path("placementExamAllowed"));
assert.ok(MockExamSubscription.schema.path("endsAt"));
assert.ok(User.schema.path("totalConnectedSeconds"));
assert.ok(User.schema.path("lastConnectedAt"));
assert.equal(
  placementTesting.isInitialPlacementPurpose("INITIAL"),
  true
);
assert.equal(
  placementTesting.isInitialPlacementPurpose(null),
  true
);
assert.equal(
  placementTesting.isInitialPlacementPurpose("SEASON"),
  false
);
assert.equal(
  placementTesting.isInitialPlacementPurpose("RENEWAL_RANK_ASSESSMENT"),
  false
);

const routes = read("routes/matths-routes.js");
for (const required of [
  '"/pricing/:product/self"',
  '"/pricing/:product/parent-request"',
  '"/api/session/heartbeat"',
  '"/admin/problem-banks"',
  '"/admin/arena-policies/mock-exam-only/price"',
  '"/admin/arena-policies/learning-package/price"',
]) {
  assert.ok(routes.includes(required), `필수 경로가 없습니다: ${required}`);
}

const pricing = read("views/pricing.ejs");
const dashboard = read("views/main.ejs");
const dashboardClient = read("public/js/main.js");
assert.ok(pricing.includes("본인 결제"));
assert.ok(pricing.includes("부모님께 결제 요청하기"));
assert.ok(pricing.includes('/pricing/mock-exam-only/self'));
assert.ok(pricing.includes('/pricing/mock-exam-only/parent-request'));
assert.ok(pricing.includes('/pricing/learning-package/self'));
assert.ok(pricing.includes('/pricing/learning-package/parent-request'));
assert.ok(pricing.includes("지금 바로 시작하기"));
assert.ok(pricing.includes("기본학습 패키지"));
assert.ok(pricing.includes("평가센터 유형별 문제 풀이"));
assert.ok(pricing.includes("배치고사"));
assert.ok(pricing.includes("최초 배치고사 1회"));
assert.ok(pricing.includes("GOAT Arena"));
const warOfMasters = read("views/war-of-masters.ejs");
assert.ok(warOfMasters.includes("모든 회원 최초 1회 무료"));
assert.ok(routes.includes("assertPlacementExamAccess"));
assert.ok(dashboard.includes("data-access-renewal-dialog"));
assert.ok(dashboard.includes("72시간 내 재구매 예상 위치"));
assert.ok(dashboard.includes("기한 후 랭크 복귀전 최고 위치"));
assert.ok(dashboardClient.includes("data-renewal-countdown"));

const parentRoutes = read("routes/parent-routes.js");
const parentDashboard = read("views/parent-dashboard.ejs");
const parentPricing = read("views/parent-pricing.ejs");
const parentRegister = read("views/parent-register.ejs");
for (const required of [
  '"/parent/invite/:token"',
  '"/parent/login"',
  '"/parent"',
  '"/parent/pricing"',
  '"/parent/checkout/:productCode"',
]) {
  assert.ok(parentRoutes.includes(required), `학부모 필수 경로가 없습니다: ${required}`);
}
assert.ok(parentRegister.includes("readonly"));
assert.ok(parentDashboard.includes("오답률"));
assert.ok(parentDashboard.includes("최종 종합 랭킹"));
assert.ok(parentPricing.includes("결제하기"));
assert.ok(parentPricing.includes("온라인 결제 준비 중"));
assert.equal(parentPricing.includes("PG 연결 전"), false);
const checkoutService = read("services/checkoutService.js");
assert.ok(checkoutService.includes("PAID_CHECKOUT_UNAVAILABLE"));
assert.ok(checkoutService.includes('provider === "TOSS"'));
assert.ok(checkoutService.includes("isTossConfigured"));

const accessService = read("services/paidFeatureAccessService.js");
const privateMockService = read("services/privateMockExamService.js");
const mmrService = read("services/mmrService.js");
assert.ok(accessService.includes("getMockExamPackageAccess"));
assert.ok(privateMockService.includes('status: "mock-exam-only-ready"'));
assert.ok(mmrService.includes("weeklyExamCount >= 4"));
assert.ok(mmrService.includes('eventType: "placement-calibration"'));

const heartbeatService = read("services/connectionUsageService.js");
const heartbeatClient = read("public/js/session-usage.js");
assert.ok(heartbeatService.includes("MAX_HEARTBEAT_DELTA_SECONDS = 90"));
assert.ok(heartbeatService.includes("totalConnectedSeconds"));
assert.ok(heartbeatClient.includes('fetch("/api/session/heartbeat"'));

const catalog = getAdminProblemBankCatalog();
assert.equal(catalog.editableInBrowser, false);
assert.ok(catalog.items.length >= 6);
for (const item of catalog.items) {
  assert.ok(item.name && item.purpose && item.status);
  if (item.sourceType === "ADMIN_UPLOAD") {
    assert.equal(item.file, null);
    continue;
  }
  assert.ok(item.file);
  assert.ok(fs.existsSync(path.join(root, item.file)), `${item.file} 파일이 없습니다.`);
}

const arenaRoutes = read("routes/goat-arena-routes.js");
const arenaHome = read("views/goat-arena.ejs");
const rulebook = read("views/goat-arena-rules.ejs");
assert.ok(arenaRoutes.includes('"/goat-arena/rules/sub"'));
assert.ok(arenaRoutes.includes('"/goat-arena/rules/main"'));
assert.ok(arenaHome.includes("Unranked 공식 규정"));
assert.ok(arenaHome.includes("Ranked 공식 규정"));
assert.ok(rulebook.includes("<details"));
assert.ok(rulebook.includes("현재 적용 기준"));
assert.ok(rulebook.includes("최근 수정일"));

const subRulebook = getArenaRulebook("SUB", {
  paybackPolicy: {
    displayName: "검증용 29일 학습 패키지",
    priceAmount: 29000,
    initialLearningDays: 29,
    initialPaybackScoreDays: 29,
    payback: {
      minimumStreakDays: 29,
      minimumScoreDays: 30,
      bands: [
        { minScoreDays: 0, maxScoreDays: 29, ratePercent: 0 },
        { minScoreDays: 30, maxScoreDays: 34, ratePercent: 50 },
        { minScoreDays: 35, maxScoreDays: null, ratePercent: 100 },
      ],
    },
    updatedAt: new Date("2026-08-02T00:00:00+09:00"),
  },
});
assert.equal(subRulebook.paybackPolicy.priceAmount, 29000);
assert.equal("minimumPaidNormalAttacks" in subRulebook.paybackPolicy, false);
assert.equal(subRulebook.paybackPolicy.bands[1].expectedPaybackAmount, 14500);
assert.equal(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(subRulebook.paybackPolicy.lastModifiedAt),
  "2026-08-02"
);
assert.equal(getArenaRulebook("MAIN").paybackPolicy, null);
const mainRulebook = getArenaRulebook("MAIN", {
  mainPolicy: {
    code: "MAIN-20260802-RULEBOOK-TEST",
    displayName: "Ranked 검증 운영 기준",
    maximumTargetTierGap: 2,
    stakeDaysByTierGap: [
      { tierGap: 1, stakeDays: 2 },
      { tierGap: 2, stakeDays: 4 },
    ],
    repeatOpponentExclusionDays: 9,
    revengeStakeMultiplier: 3,
    revengeFeeDays: 1,
    effectiveFrom: new Date("2026-08-02T14:30:00+09:00"),
    effectiveUntil: null,
    updatedAt: new Date("2026-08-02T14:35:00+09:00"),
  },
});
assert.equal(mainRulebook.mainPolicy.maximumTargetTierGap, 2);
assert.deepEqual(mainRulebook.mainPolicy.stakeDaysByTierGap, [
  { tierGap: 1, stakeDays: 2 },
  { tierGap: 2, stakeDays: 4 },
]);
assert.ok(
  JSON.stringify(mainRulebook.rules).includes(
    "상향 쟁탈전의 최대 티어 차이는 3단계입니다."
  )
);

const adminUserDetail = read("views/admin-user-detail.ejs");
assert.ok(adminUserDetail.includes('const isAdminProfile = member.role === "admin"'));
for (const hiddenAdminSection of [
  "학습 진행",
  "배치·랭킹",
  "DIRECT ACTIONS",
  "게시판 활동",
  "문의 이력",
  "개별 알림 이력",
]) {
  assert.ok(adminUserDetail.includes(hiddenAdminSection));
}

const adminRenderData = {
  user: { id: "admin-user-id", name: "운영자" },
  feedback: null,
  detail: {
    user: {
      _id: "admin-user-id",
      role: "admin",
      name: "운영자",
      realName: "운영자",
      email: "admin@example.com",
      isActive: true,
      accountStatus: "active",
      createdAt: new Date("2026-08-02T00:00:00+09:00"),
      lastLoginAt: new Date("2026-08-02T01:00:00+09:00"),
      totalConnectedSeconds: 7200,
    },
    identityMatches: [],
    learning: {
      progress: [],
      progressCount: 0,
      completedCount: 0,
      totalAttempts: 0,
      correctRate: 0,
    },
    assessments: [],
    ranking: null,
    communityPosts: [],
    inquiries: [],
    notifications: [],
    actionLogs: [],
  },
};
const renderedAdmin = ejs.render(adminUserDetail, adminRenderData, {
  filename: path.join(root, "views/admin-user-detail.ejs"),
});
for (const hiddenFromAdminHtml of [
  "학습 진행",
  "배치·랭킹",
  "DIRECT ACTIONS",
  "게시판 활동",
  "문의 이력",
  "개별 알림 이력",
  "학년·상태",
]) {
  assert.ok(
    !renderedAdmin.includes(hiddenFromAdminHtml),
    `관리자 상세에 숨겨야 할 항목이 렌더링됨: ${hiddenFromAdminHtml}`
  );
}
for (const visibleOnAdminHtml of [
  "가입일",
  "최근 로그인",
  "누적 접속",
  "역할",
  "계정 상태",
]) {
  assert.ok(
    renderedAdmin.includes(visibleOnAdminHtml),
    `관리자 상세 필수 항목이 없음: ${visibleOnAdminHtml}`
  );
}

const renderedRulebook = ejs.render(rulebook, {
  rulebook: subRulebook,
  activeArenaPage: "rules",
  arenaUser: { nickname: "검증사용자" },
}, {
  filename: path.join(root, "views/goat-arena-rules.ejs"),
});
assert.ok(renderedRulebook.includes("29,000원"));
assert.ok(renderedRulebook.includes("14,500원"));
assert.ok(renderedRulebook.includes("2026년 8월 2일"));

const renderedMainRulebook = ejs.render(rulebook, {
  rulebook: mainRulebook,
  activeArenaPage: "rules",
  arenaUser: { nickname: "검증사용자" },
}, {
  filename: path.join(root, "views/goat-arena-rules.ejs"),
});
assert.ok(renderedMainRulebook.includes("Ranked 경기 예치 기준"));
assert.ok(renderedMainRulebook.includes("최대 티어 차이"));
assert.ok(renderedMainRulebook.includes("3단계"));
assert.ok(renderedMainRulebook.includes("2~5일 예치"));
assert.ok(renderedMainRulebook.includes("2026년 8월 2일 14:30"));
assert.ok(!renderedMainRulebook.includes("MAIN-20260802-RULEBOOK-TEST"));

const goatArenaController = read("controllers/goatArenaController.js");
assert.ok(goatArenaController.includes("bypassCache: true"));
assert.ok(goatArenaController.includes("mainPolicy,"));

// Private logic documents are intentionally excluded from this public
// deployment repository. Verify the terminology only in shipped sources.
for (const terminologyFile of [
  "services/arenaRulebookViewService.js",
  "views/goat-arena.ejs",
  "views/goat-arena-division.ejs",
  "views/goat-arena-profile.ejs",
  "views/admin-arena-policies.ejs",
  "views/faq.ejs",
  "views/terms.ejs",
  "views/privacy.ejs",
]) {
  const terminologySource = read(terminologyFile);
  const disallowedWagerTerm = ["배", "팅"].join("");
  assert.ok(
    !terminologySource.includes(disallowedWagerTerm),
    `예치로 바뀌지 않은 표현이 있습니다: ${terminologyFile}`
  );
}
assert.ok(renderedRulebook.includes("예치"));

console.log(
  "상품 정책·MMR 보정·접속시간·문제은행·규정 정책 표·관리자 상세 분기 검증 완료"
);

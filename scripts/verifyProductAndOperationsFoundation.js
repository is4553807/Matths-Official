const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const { User } = require("../models/matthsModel");
const {
  getAccountPlanConfig,
} = require("../services/accountPlanService");
const {
  getGoatArenaV22Rulebook,
} = require("../services/goatArenaV22RulebookService");
const {
  getAdminProblemBankCatalog,
} = require("../services/problemBankCatalogService");
const {
  _testing: placementTesting,
} = require("../services/placementExamService");

const root = path.resolve(__dirname, "..");
const read = (file) =>
  fs.readFileSync(path.join(root, file), "utf8");

assert.deepEqual(getAccountPlanConfig({}), {
  proPriceAmount: 5500,
  proBillingPeriodDays: 30,
  currency: "KRW",
});
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
  '"/admin/problem-banks/types/sync"',
  '"/admin/arena-policies"',
  '"/admin/arena-policies/matchmaking"',
  '"/admin/arena-users/:userId/placement/reset"',
]) {
  assert.ok(routes.includes(required), `필수 경로가 없습니다: ${required}`);
}
for (const retired of [
  '"/admin/arena-policies/mock-exam-only/price"',
  '"/admin/arena-policies/learning-package/price"',
  '"/admin/paybacks"',
]) {
  assert.ok(!routes.includes(retired), `종료된 운영 경로가 남아 있습니다: ${retired}`);
}

const pricing = read("views/pricing.ejs");
const dashboard = read("views/main.ejs");
const terms = read("views/terms.ejs");
const privacy = read("views/privacy.ejs");
const faq = read("views/faq.ejs");
assert.ok(pricing.includes("본인 결제"));
assert.ok(pricing.includes("부모님께 결제 요청하기"));
assert.ok(pricing.includes('/pricing/pro/self'));
assert.ok(pricing.includes('/pricing/pro/parent-request'));
assert.ok(!pricing.includes('/pricing/mock-exam-only/'));
assert.ok(!pricing.includes('/pricing/learning-package/'));
assert.ok(pricing.includes("가입하고 시작하기"));
assert.ok(pricing.includes("무료 플랜"));
assert.ok(pricing.includes("Pro 플랜"));
assert.ok(pricing.includes("5,500"));
assert.ok(pricing.includes("평가센터 유형별 문제 풀이"));
assert.ok(pricing.includes("GOAT Arena"));
const warOfMasters = read("views/war-of-masters.ejs");
assert.ok(warOfMasters.includes("유효한 일반전 3경기"));
assert.ok(warOfMasters.includes("1~5회 배치"));
assert.ok(warOfMasters.includes("미응시 불이익 없음"));
assert.doesNotMatch(warOfMasters, /페이백|\bGP\b|Unranked|Ranked|학습일수/);
assert.ok(routes.includes("assertPlacementExamAccess"));
assert.ok(dashboard.includes("무료 플랜"));
assert.ok(dashboard.includes("Pro 플랜"));
assert.ok(dashboard.includes("5500"));
assert.ok(!dashboard.includes("data-access-renewal-dialog"));
assert.ok(!dashboard.includes("72시간 내 재구매 예상 위치"));
for (const [name, view] of [
  ["terms", terms],
  ["privacy", privacy],
  ["faq", faq],
]) {
  assert.doesNotMatch(
    view,
    /페이백|\bGP\b|Unranked|Ranked|학습일수|경기 예치|일요일 잠금/,
    `${name} 공개 문서에 폐기된 Arena 정책 문구가 남아 있습니다.`
  );
  assert.match(view, /일반전/);
  assert.match(view, /경쟁전/);
  assert.match(view, /단체 도전장/);
  assert.match(view, /3일/);
  assert.match(view, /5,500원/);
}
assert.match(terms, /요일과 관계없이 24시간/);
assert.match(faq, /문항당 10분|각 문항의 제한 시간은 (?:최대 )?10분/);
assert.match(privacy, /실력 및 문제 난도가 비슷한 유저/);

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
assert.ok(parentDashboard.includes("경쟁전 전체 랭킹"));
assert.ok(parentPricing.includes("결제하기"));
assert.ok(parentPricing.includes("온라인 결제 준비 중"));
assert.equal(parentPricing.includes("PG 연결 전"), false);
const checkoutService = read("services/checkoutService.js");
assert.ok(checkoutService.includes("PAID_CHECKOUT_UNAVAILABLE"));
assert.ok(checkoutService.includes('provider === "INICIS"'));
assert.ok(checkoutService.includes("isInicisConfigured"));

const accessService = read("services/paidFeatureAccessService.js");
const privateMockService = read("services/privateMockExamService.js");
const mmrService = read("services/mmrService.js");
assert.ok(accessService.includes("getAccountPlanAccess"));
assert.ok(privateMockService.includes("Pro 플랜이 활성화"));
assert.ok(
  accessService.includes("packageType: plan.code") &&
    accessService.includes("placementRequired: true"),
  "Pro 플랜도 배치고사로 첫 티어를 확정해야 합니다."
);
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
const rulebookIndex = read("views/goat-arena-rules-index.ejs");
assert.ok(arenaRoutes.includes('"/goat-arena/rules/sub"'));
assert.ok(arenaRoutes.includes('"/goat-arena/rules/main"'));
assert.ok(arenaRoutes.includes("goatArenaController.rulesPage"));
assert.ok(arenaHome.includes("일반전 시작하기"));
assert.ok(arenaHome.includes("경쟁전 살펴보기"));
assert.ok(!arenaHome.includes("페이백"));
assert.ok(!arenaHome.includes("Z-score"));
assert.ok(rulebookIndex.includes("공통 경기 방식"));
assert.ok(rulebookIndex.includes("mode.href"));
assert.ok(rulebook.includes("티어별 문제 난이도"));
assert.ok(rulebook.includes("arena-difficulty-plan-table"));
assert.ok(rulebook.includes("<details>"));
assert.ok(rulebook.includes("최근 수정일"));

const adminUserDetail = read("views/admin-user-detail.ejs");
assert.ok(adminUserDetail.includes('const isAdminProfile = member.role === "admin"'));
assert.ok(adminUserDetail.includes('partials/admin-weekly-mock-access'));
const adminServiceSource = read("services/adminService.js");
assert.ok(adminServiceSource.includes("getWeeklyMockExamAccess(userId)"));
assert.ok(adminServiceSource.includes("weeklyMockAccess"));
const adminWeeklyMockAccess = read(
  "views/partials/admin-weekly-mock-access.ejs"
);
const renderAdminWeeklyMockAccess = ({
  weeklyMockAccess,
  privateMockRestriction = {},
}) => ejs.render(
  adminWeeklyMockAccess,
  {
    weeklyMockAccess,
    member: {
      privateMockRestriction,
    },
  },
  {
    filename: path.join(
      root,
      "views/partials/admin-weekly-mock-access.ejs"
    ),
  }
);
const freeWeeklyMockHtml =
  renderAdminWeeklyMockAccess({
    weeklyMockAccess: {
      active: false,
      packageType: null,
    },
  });
assert.ok(
  freeWeeklyMockHtml.includes(
    'data-weekly-mock-access-state="unavailable"'
  )
);
assert.ok(freeWeeklyMockHtml.includes("권한 없음"));
assert.ok(!freeWeeklyMockHtml.includes("응시 가능"));

const paidWeeklyMockHtml =
  renderAdminWeeklyMockAccess({
    weeklyMockAccess: {
      active: true,
      packageType: "PRO",
    },
  });
assert.ok(
  paidWeeklyMockHtml.includes(
    'data-weekly-mock-access-state="available"'
  )
);
assert.ok(paidWeeklyMockHtml.includes("응시 가능"));
assert.ok(paidWeeklyMockHtml.includes("Pro 플랜"));

const restrictedWeeklyMockHtml =
  renderAdminWeeklyMockAccess({
    weeklyMockAccess: {
      active: true,
      packageType: "PRO",
    },
    privateMockRestriction: {
      active: true,
      remainingWeekCount: 2,
      reason: "무결성 제재",
    },
  });
assert.ok(
  restrictedWeeklyMockHtml.includes(
    'data-weekly-mock-access-state="restricted"'
  )
);
assert.ok(
  restrictedWeeklyMockHtml.includes(
    "권한 있음 · 응시 제한"
  )
);
assert.ok(restrictedWeeklyMockHtml.includes("남은 제한 2회(2주)"));
for (const hiddenAdminSection of [
  "학습 진행",
  "경쟁전 배치·MMR",
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
  "경쟁전 배치·MMR",
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
  rulebook: getGoatArenaV22Rulebook(new Date("2026-10-09T00:00:00+09:00"), "SUB"),
  activeArenaPage: "rules",
  arenaUser: { nickname: "검증사용자" },
}, {
  filename: path.join(root, "views/goat-arena-rules.ejs"),
});
assert.ok(renderedRulebook.includes("일반전 경기 규정"));
assert.ok(renderedRulebook.includes("각 문항의 제한 시간은 10분"));
assert.match(renderedRulebook, /내부 (?:평가|성취 지표)/);
assert.ok(renderedRulebook.includes("티어별 문제 난이도"));
assert.ok(renderedRulebook.includes("브론즈"));
assert.ok(!renderedRulebook.includes("Z-score"));
assert.ok(!renderedRulebook.includes("Glicko"));
assert.ok(!renderedRulebook.includes("비활성"));
assert.ok(!renderedRulebook.includes("페이백"));

const goatArenaController = read("controllers/goatArenaController.js");
assert.ok(goatArenaController.includes("exports.rulesPage = rulesPage()"));
assert.ok(goatArenaController.includes('exports.subRulesPage = rulesPage("SUB")'));
assert.ok(goatArenaController.includes('exports.mainRulesPage = rulesPage("MAIN")'));
assert.ok(goatArenaController.includes("rulebook: goatArenaV2Rulebook(new Date(), division)"));

for (const terminologyFile of [
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
assert.ok(!renderedRulebook.includes("예치"));

const server = read("server.js");
const evidenceService = read("services/arenaMatchEvidenceService.js");
const financeService = read("services/financeService.js");
const adminFinanceController = read("controllers/ipadAdminFinanceController.js");
const adminDashboard = read("views/admin-dashboard.ejs");
for (const retiredRuntime of [
  "startAccessCycleScheduler",
  "startDailyAccessCycleScheduler",
  "startAccessCycleExpiryReminderScheduler",
  "reconcileOpenPaybackAttackParticipation",
  "ensureDefaultLearningPackagePolicy",
  "ensureDefaultMockExamPackagePolicy",
]) {
  assert.ok(!server.includes(retiredRuntime), `서버 시작 경로에 폐기된 경제 작업이 남아 있습니다: ${retiredRuntime}`);
}
assert.ok(!evidenceService.includes("recordPaybackAttackLearningDay"));
for (const source of [financeService, adminFinanceController, adminDashboard]) {
  assert.doesNotMatch(source, /legacyObligationReserve|confirmedUnpaidPayback|paybackReserve/);
}

console.log(
  "상품 정책·MMR 보정·접속시간·문제은행·규정 정책 표·관리자 상세 분기 검증 완료"
);

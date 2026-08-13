const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const { _testing } = require("../services/placementExamService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

assert.equal(_testing.isInitialPlacementPurpose(), true);
assert.equal(_testing.isInitialPlacementPurpose(null), true);
assert.equal(_testing.isInitialPlacementPurpose("INITIAL"), true);
assert.equal(_testing.isInitialPlacementPurpose("SEASON"), false);
assert.equal(
  _testing.isInitialPlacementPurpose("RENEWAL_RANK_ASSESSMENT"),
  false
);
assert.deepEqual(
  _testing.placementAccessView({ purpose: "INITIAL" }),
  {
    purpose: "INITIAL",
    freeInitialAttempt: true,
    requiresPaidAccess: false,
  }
);
assert.deepEqual(
  _testing.placementAccessView({ purpose: "SEASON" }),
  {
    purpose: "SEASON",
    freeInitialAttempt: false,
    requiresPaidAccess: true,
  }
);

const routes = read("routes/matths-routes.js");
assert.ok(routes.includes("requirePlacementExamAccess"));
assert.equal(routes.includes("requirePaidPlacementAccess"), false);

const placementService = read("services/placementExamService.js");
assert.ok(placementService.includes('accessType: "FREE_INITIAL"'));
assert.ok(placementService.includes('accessType: "PAID_FOLLOW_UP"'));
assert.ok(placementService.includes("await assertPaidPackageAccess(userId)"));

const refundService = read("services/refundService.js");
assert.ok(refundService.includes('placementPurpose: {'));
assert.ok(refundService.includes('"RENEWAL_RANK_ASSESSMENT"'));

const arenaPage = read("views/war-of-masters.ejs");
assert.ok(
  arenaPage.includes(
    "placement.requiresPaidAccess && !paidPackageAccess.active"
  )
);
assert.ok(arenaPage.includes("모든 회원 최초 1회 무료"));
assert.ok(arenaPage.includes("배치 결과·스토리 카드 보기"));

const pricing = read("views/pricing.ejs");
assert.ok(pricing.includes("최초 배치고사 1회·티어 확인"));
assert.ok(pricing.includes("시즌 배치·랭크 복귀전 이용 불가"));

const storyTemplate = read("views/partials/placement-story-card.ejs");
const storyHtml = ejs.render(storyTemplate, {
  learner: { name: "공개닉네임" },
  placementResult: {
    initialTier: "다이아몬드",
    calibrationPolicyVersion: "PLACEMENT_REFERENCE_V2_MOE_NINE_GRADE",
    positionBasis: "MOE_NINE_GRADE_REFERENCE_DISTRIBUTION",
    referenceGrade: 3,
    estimatedTopPercent: 12.5,
    estimatedTopPercentMin: 9,
    estimatedTopPercentMax: 17,
    cohortSize: 100,
    cohortRank: 11,
    actualRankMinimumCohortSize: 100,
    actualRankPublished: true,
    estimatedRankPopulation: 10000,
    estimatedRank: 1250,
    percentile: 92.5,
  },
  placementTotalCorrect: 24,
});
assert.ok(storyHtml.includes('width="1080"'));
assert.ok(storyHtml.includes('height="1920"'));
assert.ok(storyHtml.includes("스토리 이미지 다운로드"));
assert.ok(storyHtml.includes("공개닉네임"));
assert.ok(storyHtml.includes("10,000명 기준 예상 순위"));
assert.equal(storyHtml.includes("교육부 9등급 비율"), false);
assert.equal(storyHtml.includes("별도 워터마크"), false);
assert.equal(storyHtml.includes("유효 응시자가 100명"), false);
assert.equal(storyHtml.includes("userId"), false);
assert.equal(storyHtml.includes("email"), false);

const smallCohortStoryHtml = ejs.render(storyTemplate, {
  learner: { name: "표본수집중" },
  placementResult: {
    initialTier: "브론즈",
    calibrationPolicyVersion: "PLACEMENT_REFERENCE_V2_MOE_NINE_GRADE",
    referenceStandard: "MOE_NINE_GRADE_CUMULATIVE_RANK_RATIO",
    estimatedTopPercent: 99.1,
    estimatedRankPopulation: 10000,
    estimatedRank: 9910,
    cohortSize: 99,
    cohortRank: 1,
    actualRankMinimumCohortSize: 100,
  },
  placementTotalCorrect: 1,
});
assert.ok(smallCohortStoryHtml.includes('"actualRankPublished":false'));
assert.equal(smallCohortStoryHtml.includes("실응시 99명"), false);

const storyClient = read("public/js/placement-story-card.js");
assert.ok(storyClient.includes('link.download = `matths-first-tier-'));
assert.ok(storyClient.includes("canvas.toBlob"));
assert.ok(storyClient.includes('"image/png"'));
assert.ok(storyClient.includes("GOAT ARENA · FIRST PLACEMENT"));
assert.ok(storyClient.includes("ESTIMATED RANK · 10K"));
assert.ok(storyClient.includes("actualRankPublished === true"));
assert.ok(storyClient.includes("www.matths.kr  ·  #Matths  #GOATArena"));
assert.equal(storyClient.includes("WAR OF GOAT"), false);
assert.equal(storyClient.includes("fetch("), false);
assert.equal(storyClient.includes("watermark"), false);
assert.equal(storyClient.includes("교육부 9등급 비율"), false);

const arenaNameUiFiles = [
  "views/assessment-attempt.ejs",
  "views/faq.ejs",
  "views/intro.ejs",
  "views/privacy.ejs",
  "views/private-mock-objection.ejs",
  "views/private-mock-restriction.ejs",
  "views/terms.ejs",
  "views/war-of-masters.ejs",
  "views/war-of-masters-rankings.ejs",
  "services/placementExamBank.js",
  "services/placementExamService.js",
  "services/privateMockExamService.js",
  "content/email/privateMock.js",
];
for (const file of arenaNameUiFiles) {
  assert.doesNotMatch(
    read(file),
    /war[\s-]*of[\s-]*goat/i,
    `${file}에 이전 사용자 노출 명칭이 남아 있습니다.`
  );
}
assert.ok(read("views/assessment-attempt.ejs").includes("GOAT Arena로 돌아가기"));

console.log(
  "Free initial placement access and watermark-free 1080x1920 story download verified."
);

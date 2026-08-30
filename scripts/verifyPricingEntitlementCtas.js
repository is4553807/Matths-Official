const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const {
  _testing: { buildPricingProductAccess },
} = require("../services/checkoutService");

const views = path.resolve(__dirname, "..", "views");
const products = [
  {
    code: "MOCK_EXAM_ONLY",
    name: "Matths 주간 공식 모의고사 이용권",
    amount: 5000,
    periodLabel: "30일",
    description: "검증용 모의고사 이용권",
    refundPolicy: {
      fullRefund: "검증용 전액 환불 기준",
      partialRefund: "검증용 부분 환불 기준",
      formula: "검증용 환불 산식",
    },
  },
  {
    code: "LEARNING_PACKAGE_29",
    name: "29일 학습권 패키지",
    amount: 29000,
    periodLabel: "29일",
    description: "검증용 학습권",
    refundPolicy: {
      fullRefund: "검증용 전액 환불 기준",
      partialRefund: "검증용 부분 환불 기준",
      formula: "검증용 환불 산식",
    },
  },
];
const user = {
  id: "507f1f77bcf86cd799439011",
  name: "pricing-audit-user",
  role: "student",
};

function state({ learningActive = false, mockActive = false, eligible = true } = {}) {
  return buildPricingProductAccess({
    paidPackageAccess: { active: learningActive },
    mockExamPackageAccess: { active: mockActive },
    learningPackageEligibility: {
      eligible,
      reasons: eligible ? [] : ["LOCKED_BALANCE_REMAINS"],
    },
  });
}

async function renderPricing(productAccess) {
  return ejs.renderFile(path.join(views, "pricing.ejs"), {
    user,
    activePage: "pricing",
    mockExamPolicy: { monthlyPriceAmount: 5000 },
    learningPackagePolicy: { priceAmount: 29000 },
    products,
    productAccess,
    checkoutEnabled: true,
    publicContactEmail: "dltkddbs4553@matths.kr",
  });
}

async function renderParentPricing(productAccess) {
  return ejs.renderFile(path.join(views, "parent-pricing.ejs"), {
    parent: { id: "parent", username: "parent-audit" },
    child: { _id: user.id, name: "pricing-audit-child" },
    familyChildren: [],
    selectedChildId: user.id,
    products,
    productAccess,
    checkoutEnabled: true,
  });
}

async function main() {
  const purchasable = state();
  const mockOnly = state({ mockActive: true });
  const learning = state({ learningActive: true });
  const blockedLearning = state({ eligible: false });
  const expired = state({ learningActive: false, mockActive: false, eligible: true });

  assert.equal(purchasable.MOCK_EXAM_ONLY.purchaseAllowed, true);
  assert.equal(purchasable.LEARNING_PACKAGE_29.purchaseAllowed, true);
  assert.equal(mockOnly.MOCK_EXAM_ONLY.purchaseAllowed, false);
  assert.equal(mockOnly.LEARNING_PACKAGE_29.purchaseAllowed, true);
  assert.equal(learning.MOCK_EXAM_ONLY.includedByLearningPackage, true);
  assert.equal(learning.MOCK_EXAM_ONLY.purchaseAllowed, false);
  assert.equal(learning.LEARNING_PACKAGE_29.purchaseAllowed, false);
  assert.equal(blockedLearning.LEARNING_PACKAGE_29.requiresExistingPackageResolution, true);
  assert.deepEqual(expired, purchasable);

  const purchasableHtml = await renderPricing(purchasable);
  assert.match(purchasableHtml, /\/pricing\/mock-exam-only\/self/);
  assert.match(purchasableHtml, /\/pricing\/learning-package\/self/);

  const mockOnlyHtml = await renderPricing(mockOnly);
  assert.doesNotMatch(mockOnlyHtml, /\/pricing\/mock-exam-only\/(?:self|parent-request)/);
  assert.match(mockOnlyHtml, /주간 모의고사 계속하기/);
  assert.match(mockOnlyHtml, /\/pricing\/learning-package\/self/);

  const learningHtml = await renderPricing(learning);
  assert.doesNotMatch(learningHtml, /\/pricing\/(?:mock-exam-only|learning-package)\/(?:self|parent-request)/);
  assert.match(learningHtml, /학습권 패키지에 포함 · 이용 중/);
  assert.match(learningHtml, /주간 모의고사 계속하기/);
  assert.match(learningHtml, /GOAT Arena 계속하기/);

  const blockedHtml = await renderPricing(blockedLearning);
  assert.match(blockedHtml, /\/pricing\/mock-exam-only\/self/);
  assert.doesNotMatch(blockedHtml, /\/pricing\/learning-package\/(?:self|parent-request)/);
  assert.match(blockedHtml, /기존 학습권 상태 확인하기/);

  const expiredHtml = await renderPricing(expired);
  assert.match(expiredHtml, /\/pricing\/mock-exam-only\/self/);
  assert.match(expiredHtml, /\/pricing\/learning-package\/self/);

  const parentLearningHtml = await renderParentPricing(learning);
  assert.doesNotMatch(parentLearningHtml, /\/parent\/checkout\//);
  assert.match(parentLearningHtml, /자녀 모의고사 현황 보기/);
  assert.match(parentLearningHtml, /자녀 학습 현황 보기/);

  console.log("Pricing entitlement CTA verification passed: 5 student states and parent active state.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

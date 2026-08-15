const { createHash, randomBytes } = require("node:crypto");
const AppCommerceHandoff = require("../models/appCommerceHandoffModel");
const {
  getProductCatalog,
  isPaidCheckoutEnabled,
} = require("./checkoutService");
const {
  getWeeklyMockExamAccess,
} = require("./paidFeatureAccessService");

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const PRODUCT_ROUTES = Object.freeze({
  MOCK_EXAM_ONLY: "mock-exam-only",
  LEARNING_PACKAGE_29: "learning-package",
});
const PRODUCT_FEATURES = Object.freeze({
  MOCK_EXAM_ONLY: [
    "주간 공식 모의고사",
    "응시 기록과 성적 확인",
    "학습권과 분리된 30일 이용",
  ],
  LEARNING_PACKAGE_29: [
    "모의고사와 배치고사",
    "GOAT Arena 공식 경기",
    "29일 학습 사이클",
  ],
});

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function tokenHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function productDestination(productCode, mode) {
  if (mode === "pricing") return "/pricing";
  const route = PRODUCT_ROUTES[String(productCode || "").toUpperCase()];
  if (!route || !["self", "parent-request"].includes(mode)) {
    throw statusError(400, "열 수 없는 이용권 결제 경로입니다.", "INVALID_COMMERCE_DESTINATION");
  }
  return `/pricing/${route}/${mode}`;
}

function publicBaseUrl(environment = process.env) {
  const value = String(environment.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(value)) {
    throw statusError(503, "운영 결제 주소를 확인할 수 없습니다.", "PUBLIC_BASE_URL_REQUIRED");
  }
  return value;
}

async function getAppStorefront(userId, {
  catalogLoader = getProductCatalog,
  accessLoader = getWeeklyMockExamAccess,
  environment = process.env,
} = {}) {
  const [products, access] = await Promise.all([
    catalogLoader(),
    accessLoader(userId),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    checkoutEnabled: isPaidCheckoutEnabled(environment),
    currency: "KRW",
    access: {
      packageType: access.packageType || null,
      learningPackageActive: access.learningPackage?.active === true,
      mockExamPackageActive: access.mockExamOnlyPackage?.active === true,
      arenaAllowed: access.arenaAllowed === true,
      rankedShopAvailable:
        access.learningPackage?.active === true &&
        String(access.learningPackage?.cycle?.division || "") === "MAIN",
      mockExamEndsAt: access.mockExamOnlyPackage?.subscription?.endsAt || null,
    },
    products: products.map((product) => ({
      code: product.code,
      name: product.name,
      amount: Number(product.amount),
      periodLabel: product.periodLabel,
      description: product.description,
      features: PRODUCT_FEATURES[product.code] || [],
      current:
        (product.code === "LEARNING_PACKAGE_29" && access.learningPackage?.active === true) ||
        (product.code === "MOCK_EXAM_ONLY" && access.mockExamOnlyPackage?.active === true),
    })),
  };
}

async function issueAppCommerceHandoff({
  userId,
  productCode = null,
  mode = "pricing",
  now = new Date(),
  model = AppCommerceHandoff,
  environment = process.env,
} = {}) {
  const destination = productDestination(productCode, mode);
  if (mode !== "pricing" && !isPaidCheckoutEnabled(environment)) {
    throw statusError(
      503,
      "유료 이용권 결제는 현재 준비 중입니다.",
      "CHECKOUT_NOT_AVAILABLE"
    );
  }
  const token = randomBytes(32).toString("base64url");
  await model.create({
    tokenHash: tokenHash(token),
    userId,
    destination,
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS),
  });
  return {
    url: `${publicBaseUrl(environment)}/app/commerce/${token}`,
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS).toISOString(),
  };
}

async function consumeAppCommerceHandoff(rawToken, {
  now = new Date(),
  model = AppCommerceHandoff,
} = {}) {
  const token = String(rawToken || "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return model.findOneAndUpdate(
    {
      tokenHash: tokenHash(token),
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { returnDocument: "after" }
  ).lean();
}

module.exports = {
  HANDOFF_TTL_MS,
  consumeAppCommerceHandoff,
  getAppStorefront,
  issueAppCommerceHandoff,
  productDestination,
};

const mongoose = require("mongoose");
const {
  MockExamPackagePolicyVersion,
  MockExamSubscription,
} = require("../models/goatArenaModel");
const {
  minimumPolicyEffectiveFrom,
} = require("./arenaPolicyService");
const {
  recordPolicyChangeScheduled,
} = require("./policyChangeOutboxService");

const DEFAULT_MONTHLY_PRICE_AMOUNT = 5500;
const DEFAULT_POLICY_CODE = "MOCK-ONLY-2026-INITIAL";
const DEFAULT_CALIBRATION_WEEKLY_EXAMS = 4;
const MOCK_EXAM_PRODUCT_NAME = "Matths 주간 공식 모의고사 이용권";

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function policyView(policy) {
  if (!policy) {
    return {
      _id: null,
      code: DEFAULT_POLICY_CODE,
      displayName: MOCK_EXAM_PRODUCT_NAME,
      status: "ACTIVE",
      currency: "KRW",
      monthlyPriceAmount: DEFAULT_MONTHLY_PRICE_AMOUNT,
      billingPeriodDays: 30,
      weeklyMockExamAllowed: true,
      placementExamAllowed: false,
      goatArenaAllowed: false,
      placementCalibrationMinimumWeeklyExams:
        DEFAULT_CALIBRATION_WEEKLY_EXAMS,
    };
  }
  return {
    ...policy,
    displayName: MOCK_EXAM_PRODUCT_NAME,
    _id: policy._id || null,
    monthlyPriceAmount: Number(policy.monthlyPriceAmount),
    billingPeriodDays: Number(policy.billingPeriodDays || 30),
    placementCalibrationMinimumWeeklyExams: Number(
      policy.placementCalibrationMinimumWeeklyExams ||
        DEFAULT_CALIBRATION_WEEKLY_EXAMS
    ),
  };
}

async function getActiveMockExamPackagePolicy(now = new Date()) {
  const policy = await MockExamPackagePolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: now } },
    ],
  })
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .lean();
  return policyView(policy);
}

async function ensureDefaultMockExamPackagePolicy() {
  let existing = await MockExamPackagePolicyVersion.findOne({
    code: DEFAULT_POLICY_CODE,
  }).lean();
  if (
    existing &&
    Number(existing.monthlyPriceAmount) === 5000 &&
    !existing.createdBy
  ) {
    existing = await MockExamPackagePolicyVersion.findOneAndUpdate(
      {
        _id: existing._id,
        code: DEFAULT_POLICY_CODE,
        monthlyPriceAmount: 5000,
        createdBy: null,
      },
      {
        $set: {
          monthlyPriceAmount: DEFAULT_MONTHLY_PRICE_AMOUNT,
          changeSummary:
            "월 5,500원 Matths 주간 공식 모의고사 이용권 최초 정책",
        },
      },
      { new: true }
    ).lean();
  }
  if (existing) return policyView(existing);
  try {
    const created = await MockExamPackagePolicyVersion.create({
      code: DEFAULT_POLICY_CODE,
      displayName: MOCK_EXAM_PRODUCT_NAME,
      status: "ACTIVE",
      effectiveFrom: new Date("2026-08-01T00:00:00+09:00"),
      monthlyPriceAmount: DEFAULT_MONTHLY_PRICE_AMOUNT,
      billingPeriodDays: 30,
      placementCalibrationMinimumWeeklyExams:
        DEFAULT_CALIBRATION_WEEKLY_EXAMS,
      changeSummary: "월 5,500원 Matths 주간 공식 모의고사 이용권 최초 정책",
      activatedAt: new Date(),
    });
    return policyView(created.toObject());
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return getActiveMockExamPackagePolicy();
  }
}

async function getMockExamPackageAdminData(now = new Date()) {
  const [activePolicy, policies] = await Promise.all([
    getActiveMockExamPackagePolicy(now),
    MockExamPackagePolicyVersion.find()
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .limit(30)
      .lean(),
  ]);
  return {
    now,
    activePolicy,
    policies: policies.map(policyView),
  };
}

async function updateMockExamPackagePrice({
  adminUserId,
  monthlyPriceAmount,
  changeSummary = "",
  now = new Date(),
}) {
  const price = Number(monthlyPriceAmount);
  if (!Number.isInteger(price) || price < 0 || price > 1000000) {
    throw statusError(
      400,
      `${MOCK_EXAM_PRODUCT_NAME}의 월 가격을 원 단위 정수로 입력해주세요.`,
      "INVALID_MOCK_PACKAGE_PRICE"
    );
  }
  if (!mongoose.isValidObjectId(adminUserId)) {
    throw statusError(400, "관리자 정보를 확인해주세요.");
  }
  const effectiveFrom = minimumPolicyEffectiveFrom(now);
  const code = `MOCK-ONLY-${effectiveFrom
    .toISOString()
    .replace(/[-:.TZ]/g, "")}`;
  const session = await mongoose.startSession();
  let created = null;
  try {
    await session.withTransaction(async () => {
      const existingAtStart = await MockExamPackagePolicyVersion.findOne({
        status: "ACTIVE",
        effectiveFrom,
      }).session(session).lean();
      if (existingAtStart) {
        throw statusError(409, "같은 적용 시각에 이미 모의고사 이용권 정책이 있습니다.");
      }
      const previous = await MockExamPackagePolicyVersion.findOne({
        status: "ACTIVE",
        effectiveFrom: { $lt: effectiveFrom },
      }).sort({ effectiveFrom: -1 }).session(session).lean();
      const next = await MockExamPackagePolicyVersion.findOne({
        status: "ACTIVE",
        effectiveFrom: { $gt: effectiveFrom },
      }).sort({ effectiveFrom: 1 }).session(session).lean();
      if (previous && (!previous.effectiveUntil || new Date(previous.effectiveUntil) > effectiveFrom)) {
        await MockExamPackagePolicyVersion.updateOne(
          { _id: previous._id, status: "ACTIVE" },
          { $set: { effectiveUntil: effectiveFrom } },
          { session }
        );
      }
      [created] = await MockExamPackagePolicyVersion.create(
        [
          {
            code,
            displayName: MOCK_EXAM_PRODUCT_NAME,
            status: "ACTIVE",
            effectiveFrom,
            effectiveUntil: next?.effectiveFrom || null,
            monthlyPriceAmount: price,
            billingPeriodDays: 30,
            placementCalibrationMinimumWeeklyExams:
              DEFAULT_CALIBRATION_WEEKLY_EXAMS,
            changeSummary: String(changeSummary || "").trim().slice(0, 1000),
            createdBy: adminUserId,
            activatedBy: adminUserId,
            activatedAt: new Date(now),
          },
        ],
        { session, ordered: true }
      );
      await recordPolicyChangeScheduled({
        policyType: "MOCK_EXAM_PACKAGE",
        policy: created,
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  return created;
}

async function getMockExamPackageAccess(userId, now = new Date()) {
  if (!mongoose.isValidObjectId(userId)) {
    return { active: false, reason: "INVALID_USER" };
  }
  const subscription = await MockExamSubscription.findOne({
    userId,
    status: "ACTIVE",
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  })
    .sort({ endsAt: -1 })
    .lean();
  return {
    active: Boolean(subscription),
    reason: subscription ? null : "MOCK_PACKAGE_REQUIRED",
    subscription,
    packageType: subscription ? "MOCK_EXAM_ONLY" : null,
  };
}

module.exports = {
  DEFAULT_CALIBRATION_WEEKLY_EXAMS,
  DEFAULT_MONTHLY_PRICE_AMOUNT,
  MOCK_EXAM_PRODUCT_NAME,
  ensureDefaultMockExamPackagePolicy,
  getActiveMockExamPackagePolicy,
  getMockExamPackageAccess,
  getMockExamPackageAdminData,
  policyView,
  updateMockExamPackagePrice,
};

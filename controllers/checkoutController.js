const {
  assertPaidCheckoutEnabled,
  createCheckoutIntent,
  createParentInvite,
  getProduct,
  MINOR_PAYMENT_NOTICE_VERSION,
} = require("../services/checkoutService");
const {
  buildCheckoutClientConfig,
} = require("../services/paymentService");
const { User } = require("../models/matthsModel");

const ROUTE_TO_PRODUCT = {
  "mock-exam-only": "MOCK_EXAM_ONLY",
  "learning-package": "LEARNING_PACKAGE_29",
};

function productCodeFromRoute(req) {
  const code = ROUTE_TO_PRODUCT[String(req.params.product || "")];
  if (!code) {
    const error = new Error("선택한 패키지를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return code;
}

function publicBaseUrl(req) {
  return (
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  );
}

function kstDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const result = {};
  for (const part of parts) {
    if (part.type !== "literal") result[part.type] = Number(part.value);
  }
  return result;
}

function isMinorAtKst(birthDate, now = new Date()) {
  if (!birthDate) return true;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return true;
  const today = kstDateParts(now);
  const born = kstDateParts(birth);
  let age = today.year - born.year;
  if (today.month < born.month || (today.month === born.month && today.day < born.day)) age -= 1;
  return age < 19;
}

async function requiresMinorPaymentNotice(userId) {
  const user = await User.findById(userId).select("+birthDate").lean();
  return isMinorAtKst(user?.birthDate);
}

function minorPaymentConsentKey({ userId, productCode }) {
  return `${String(userId)}:${String(productCode)}`;
}

function hasMinorPaymentNotice(req, productCode) {
  const record = req.session?.minorPaymentNotices?.[
    minorPaymentConsentKey({ userId: req.session?.user?.id, productCode })
  ];
  return record?.version === MINOR_PAYMENT_NOTICE_VERSION && Boolean(record?.acceptedAt);
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function renderCheckout(req, res, { intent = null, status = 200 } = {}) {
  const product = await getProduct(productCodeFromRoute(req));
  res.set("Cache-Control", "no-store");
  return res.status(status).render("checkout", {
    user: req.session.user,
    product,
    intent,
    checkoutConfig: intent
      ? buildCheckoutClientConfig(intent, {
          baseUrl: publicBaseUrl(req),
          customerEmail: req.session.user.email,
          customerName: req.session.user.realName || req.session.user.name,
        })
      : null,
  });
}

exports.selfCheckoutPage = async (req, res, next) => {
  try {
    assertPaidCheckoutEnabled({ email: req.session.user.email });
    const productCode = productCodeFromRoute(req);
    if (
      (await requiresMinorPaymentNotice(req.session.user.id)) &&
      !hasMinorPaymentNotice(req, productCode)
    ) {
      res.set("Cache-Control", "no-store");
      return res.render("minor-payment-consent", {
        user: req.session.user,
        product: await getProduct(productCode),
        productRoute: req.params.product,
        error: "",
      });
    }
    return await renderCheckout(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.acceptMinorPaymentNotice = async (req, res, next) => {
  try {
    assertPaidCheckoutEnabled({ email: req.session.user.email });
    const productCode = productCodeFromRoute(req);
    if (!(await requiresMinorPaymentNotice(req.session.user.id))) {
      return res.redirect(`/pricing/${req.params.product}/self`);
    }
    if (req.body.minorPaymentNoticeAccepted !== "true") {
      res.set("Cache-Control", "no-store");
      return res.status(400).render("minor-payment-consent", {
        user: req.session.user,
        product: await getProduct(productCode),
        productRoute: req.params.product,
        error: "안내 내용을 확인하고 동의해야 본인 결제를 진행할 수 있습니다.",
      });
    }
    req.session.minorPaymentNotices = {
      ...(req.session.minorPaymentNotices || {}),
      [minorPaymentConsentKey({ userId: req.session.user.id, productCode })]: {
        acceptedAt: new Date().toISOString(),
        version: MINOR_PAYMENT_NOTICE_VERSION,
      },
    };
    await saveSession(req);
    return res.redirect(`/pricing/${req.params.product}/self`);
  } catch (error) {
    return next(error);
  }
};

exports.prepareSelfCheckout = async (req, res, next) => {
  try {
    const productCode = productCodeFromRoute(req);
    const needsNotice = await requiresMinorPaymentNotice(req.session.user.id);
    const intent = await createCheckoutIntent({
      studentUserId: req.session.user.id,
      requestedBy: "STUDENT",
      productCode,
      requiresMinorPaymentNotice: needsNotice,
      minorPaymentNoticeAccepted:
        !needsNotice || hasMinorPaymentNotice(req, productCode),
      refundPolicyAccepted: req.body.refundPolicyAccepted === "true",
    });
    return await renderCheckout(req, res, { intent });
  } catch (error) {
    return next(error);
  }
};

async function renderParentRequest(
  req,
  res,
  { status = 200, feedback = null, feedbackTone = "error", oldInput = {} } = {}
) {
  const product = await getProduct(productCodeFromRoute(req));
  res.set("Cache-Control", "no-store");
  return res.status(status).render("parent-payment-request", {
    user: req.session.user,
    product,
    feedback,
    feedbackTone,
    oldInput: {
      parentEmail: String(oldInput.parentEmail || ""),
    },
  });
}

exports.parentRequestPage = async (req, res, next) => {
  try {
    assertPaidCheckoutEnabled({ email: req.session.user.email });
    return await renderParentRequest(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.sendParentRequest = async (req, res, next) => {
  try {
    assertPaidCheckoutEnabled({ email: req.session.user.email });
    const result = await createParentInvite({
      childUserId: req.session.user.id,
      parentEmail: req.body.parentEmail,
      productCode: productCodeFromRoute(req),
      baseUrl: publicBaseUrl(req),
    });
    return await renderParentRequest(req, res, {
      feedback: result.existingParent
        ? "기존 학부모 계정에 자녀를 추가할 수 있는 연결 링크를 보냈습니다. 링크는 72시간 동안 유효합니다."
        : "학부모 가입 및 자녀 연결 링크를 이메일로 보냈습니다. 링크는 72시간 동안 유효합니다.",
      feedbackTone: "success",
    });
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      return renderParentRequest(req, res, {
        status: Number(error.status),
        feedback: error.message,
        oldInput: req.body,
      });
    }
    return next(error);
  }
};

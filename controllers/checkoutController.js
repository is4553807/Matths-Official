const {
  createCheckoutIntent,
  createParentInvite,
  getProduct,
} = require("../services/checkoutService");

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

async function renderCheckout(req, res, { intent = null, status = 200 } = {}) {
  const product = await getProduct(productCodeFromRoute(req));
  res.set("Cache-Control", "no-store");
  return res.status(status).render("checkout", {
    user: req.session.user,
    product,
    intent,
  });
}

exports.selfCheckoutPage = async (req, res, next) => {
  try {
    return await renderCheckout(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.prepareSelfCheckout = async (req, res, next) => {
  try {
    const intent = await createCheckoutIntent({
      studentUserId: req.session.user.id,
      requestedBy: "STUDENT",
      productCode: productCodeFromRoute(req),
    });
    return await renderCheckout(req, res, { intent });
  } catch (error) {
    return next(error);
  }
};

async function renderParentRequest(
  req,
  res,
  { status = 200, feedback = null, oldInput = {}, previewUrl = "" } = {}
) {
  const product = await getProduct(productCodeFromRoute(req));
  res.set("Cache-Control", "no-store");
  return res.status(status).render("parent-payment-request", {
    user: req.session.user,
    product,
    feedback,
    previewUrl,
    oldInput: { parentEmail: String(oldInput.parentEmail || "") },
  });
}

exports.parentRequestPage = async (req, res, next) => {
  try {
    return await renderParentRequest(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.sendParentRequest = async (req, res, next) => {
  try {
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
      previewUrl: result.previewUrl,
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

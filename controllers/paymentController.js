const {
  confirmInicisCheckout,
  recordInicisCheckoutFailure,
} = require("../services/paymentService");
const { getInicisConfig } = require("../services/inicisPaymentService");

function clean(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function fallbackResult(recorded = null) {
  return recorded
    ? { state: "FAILED", intent: recorded.intent, backLink: recorded.backLink }
    : {
        state: "FAILED",
        intent: null,
        backLink: { href: "/pricing", label: "이용권으로 돌아가기" },
      };
}

exports.inicisReturn = async (req, res, next) => {
  try {
    const result = await confirmInicisCheckout(req.body || {});
    const failed = !result || result.state === "FAILED";
    res.set("Cache-Control", "no-store");
    return res.status(failed ? 400 : 200).render("payment-result", {
      mode: getInicisConfig().mode,
      result: result || fallbackResult(),
      failure: failed
        ? {
            code: clean(req.body?.P_STATUS || "PAYMENT_NOT_COMPLETED", 100),
            message: clean(
              req.body?.P_RMESG || "결제가 완료되지 않았습니다.",
              300
            ),
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.inicisClose = async (req, res, next) => {
  try {
    const recorded = await recordInicisCheckoutFailure({
      orderId: req.query.orderId,
      code: "PAYMENT_WINDOW_CLOSED",
      message: "결제창을 닫아 결제가 완료되지 않았습니다.",
    });
    res.set("Cache-Control", "no-store");
    return res.status(400).render("payment-result", {
      mode: getInicisConfig().mode,
      result: fallbackResult(recorded),
      failure: {
        code: "PAYMENT_WINDOW_CLOSED",
        message: "결제창을 닫아 결제가 완료되지 않았습니다.",
      },
    });
  } catch (error) {
    return next(error);
  }
};

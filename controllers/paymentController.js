const {
  confirmTossCheckout,
  recordTossCheckoutFailure,
  reconcileTossWebhook,
} = require("../services/paymentService");
const { getTossConfig } = require("../services/tossPaymentService");

function clean(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

exports.tossSuccess = async (req, res, next) => {
  try {
    const result = await confirmTossCheckout({
      paymentKey: req.query.paymentKey,
      orderId: req.query.orderId,
      amount: req.query.amount,
    });
    res.set("Cache-Control", "no-store");
    return res.render("payment-result", {
      mode: getTossConfig().mode,
      result,
      failure: null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.tossFailure = async (req, res, next) => {
  try {
    const recorded = await recordTossCheckoutFailure({
      orderId: req.query.orderId,
      code: req.query.code,
      message: req.query.message,
    });
    res.set("Cache-Control", "no-store");
    return res.status(400).render("payment-result", {
      mode: getTossConfig().mode,
      result: recorded
        ? {
            state: "FAILED",
            intent: recorded.intent,
            backLink: recorded.backLink,
          }
        : {
            state: "FAILED",
            intent: null,
            backLink: { href: "/pricing", label: "이용권으로 돌아가기" },
          },
      failure: {
        code: clean(req.query.code || "PAYMENT_NOT_COMPLETED", 100),
        message: clean(req.query.message || "결제가 완료되지 않았습니다.", 300),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.tossWebhook = async (req, res, next) => {
  try {
    const reconciliation = await reconcileTossWebhook(req.body || {});
    return res.status(200).json({ received: true, action: reconciliation.action });
  } catch (error) {
    return next(error);
  }
};

const {
  getArenaShopAnalysis,
  getArenaShopDto,
  purchaseArenaShopDto,
} = require("../services/ipadArenaShopAdapter");

const PURCHASE_FIELDS = new Set([
  "itemCode",
  "purchaseId",
  "purchaseConfirmed",
  "relatedMatchId",
  "relatedInvitationId",
]);

function badRequest(message) {
  const error = new Error(message);
  error.code = "SHOP_INPUT_INVALID";
  error.status = 400;
  error.statusCode = 400;
  return error;
}

function purchaseInput(req) {
  const body = req.body ?? {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("요청 본문은 JSON 객체여야 합니다.");
  }
  if (Object.keys(body).some((field) => !PURCHASE_FIELDS.has(field))) {
    throw badRequest("요청 본문에 허용되지 않은 필드가 있습니다.");
  }
  if (body.purchaseConfirmed !== true && body.purchaseConfirmed !== "1") {
    throw badRequest("가격·효과·사용 기간·반환 조건 확인이 필요합니다.");
  }
  const headerKey =
    typeof req.get === "function"
      ? req.get("Idempotency-Key")
      : req.headers?.["idempotency-key"];
  const purchaseId = String(body.purchaseId || headerKey || "").trim();
  if (!purchaseId) {
    throw badRequest("purchaseId 또는 Idempotency-Key 헤더가 필요합니다.");
  }
  return {
    itemCode: body.itemCode,
    purchaseId,
    relatedMatchId: body.relatedMatchId || null,
    relatedInvitationId: body.relatedInvitationId || null,
  };
}

exports.getShop = async (req, res, next) => {
  try {
    const shop = await getArenaShopDto({ userId: req.apiUser._id });
    return res.json({ shop });
  } catch (error) {
    return next(error);
  }
};

exports.purchase = async (req, res, next) => {
  try {
    const result = await purchaseArenaShopDto({
      userId: req.apiUser._id,
      ...purchaseInput(req),
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

exports.getAnalysis = async (req, res, next) => {
  try {
    const analysis = await getArenaShopAnalysis({
      userId: req.apiUser._id,
      effectId: req.params.effectId,
    });
    return res.json({ analysis });
  } catch (error) {
    return next(error);
  }
};

exports._testing = {
  purchaseInput,
};

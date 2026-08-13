const REFUND_POLICY_VERSION = "REFUND_POLICY_2026_08_13_V1";
const DAY_MS = 24 * 60 * 60 * 1000;

const PRODUCT_RULES = Object.freeze({
  MOCK_EXAM_ONLY: Object.freeze({
    periodDays: 30,
    fullRefundUnusedFeature: "Matths 주간 공식 모의고사",
    partialFormula: "부분 환불액 = 결제금액 - 일할 이용금액(결제금액 × 이용일수 ÷ 30일)",
  }),
  LEARNING_PACKAGE_29: Object.freeze({
    periodDays: 29,
    fullRefundUnusedFeature: "배치고사·주간 공식 모의고사·GOAT Arena 등 유료 기능",
    partialFormula: "부분 환불액 = 결제금액 - 일할 이용금액(결제금액 × 이용일수 ÷ 29일)",
  }),
});

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getRule(productCode) {
  const code = String(productCode || "").trim().toUpperCase();
  const rule = PRODUCT_RULES[code];
  if (!rule) throw statusError(404, "환불 기준을 찾을 수 없는 상품입니다.");
  return { code, ...rule };
}

function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Math.max(0, Number(value) || 0))}원`;
}

function getRefundDisclosure(product) {
  const rule = getRule(product?.code || product?.productCode);
  const amount = Math.max(0, Number(product?.amount) || 0);
  const perDayExample = Math.floor(amount / rule.periodDays);
  return {
    version: REFUND_POLICY_VERSION,
    productCode: rule.code,
    periodDays: rule.periodDays,
    fullRefund: `결제일과 이용 시작일 중 늦은 날부터 7일 이내이고 ${rule.fullRefundUnusedFeature}을(를) 한 번도 이용하지 않았다면 전액 환불합니다.`,
    partialRefund: `유료 기능을 이용했거나 7일이 지난 뒤에도 이용 기간이 남아 있다면 다음과 같이 계산합니다. ${rule.partialFormula}. 계산 중 발생하는 1원 미만 금액은 버리며, 이용일수는 이용 시작일부터 환불 신청일까지 포함합니다.`,
    formula: rule.partialFormula,
    example: amount
      ? `${formatWon(amount)} 상품의 1일 기준액은 약 ${formatWon(perDayExample)}입니다. 실제 계산에서는 승인액과 상품 기간을 사용하고 계산 중 발생하는 1원 미만 금액은 버립니다.`
      : "실제 승인액과 상품 기간으로 계산하며, 계산 중 발생하는 1원 미만 금액은 버립니다.",
    expired: "이용 기간이 끝난 뒤 단순 변심에 따른 잔여 환불액은 0원입니다.",
    nonconforming: "표시·광고 또는 계약 내용과 다르게 제공된 경우에는 공급일부터 3개월 이내 또는 그 사실을 안 날부터 30일 이내 중 먼저 도래하는 날까지 관계 법령에 따라 청약철회할 수 있습니다.",
    application: "로그인 후 문의하기에서 ‘환불 신청’을 선택하고 주문번호와 사유를 제출합니다.",
    processing: "환불 가능 여부와 금액을 확인한 뒤 3영업일 이내 원 결제수단의 전체 또는 부분 취소를 요청합니다. 카드사·은행 반영 시점은 각 기관에 따라 달라질 수 있습니다.",
  };
}

function inclusiveUsedDays(startsAt, requestedAt, periodDays) {
  const start = new Date(startsAt);
  const request = new Date(requestedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(request.getTime())) return 0;
  if (request < start) return 0;
  return Math.min(periodDays, Math.max(1, Math.floor((request - start) / DAY_MS) + 1));
}

function calculateRefundQuote({
  productCode,
  approvedAmount,
  approvedAt,
  serviceStartAt,
  serviceEndAt,
  requestedAt = new Date(),
  paidFeatureUsed = false,
}) {
  const rule = getRule(productCode);
  const amount = Math.max(0, Math.floor(Number(approvedAmount) || 0));
  const request = new Date(requestedAt);
  const approval = new Date(approvedAt);
  const start = new Date(serviceStartAt || approvedAt);
  const end = new Date(serviceEndAt || start.getTime() + rule.periodDays * DAY_MS);
  if ([request, approval, start, end].some((date) => Number.isNaN(date.getTime()))) {
    throw statusError(400, "환불 산정 기준 시각을 확인해주세요.");
  }
  const withdrawalAnchor = new Date(Math.max(approval.getTime(), start.getTime()));
  const withinSevenDays = request.getTime() < withdrawalAnchor.getTime() + 7 * DAY_MS;
  const usedDays = inclusiveUsedDays(start, request, rule.periodDays);
  let calculationType = "PARTIAL";
  let calculatedAmount = Math.max(
    0,
    amount - Math.floor((amount * usedDays) / rule.periodDays)
  );
  if (!paidFeatureUsed && withinSevenDays) {
    calculationType = "FULL";
    calculatedAmount = amount;
  } else if (request >= end || usedDays >= rule.periodDays) {
    calculationType = "NONE";
    calculatedAmount = 0;
  }
  return {
    policyVersion: REFUND_POLICY_VERSION,
    productCode: rule.code,
    approvedAmount: amount,
    approvedAt: approval,
    serviceStartAt: start,
    serviceEndAt: end,
    requestedAt: request,
    paidFeatureUsed: Boolean(paidFeatureUsed),
    usedDays,
    withinSevenDays,
    calculationType,
    calculatedAmount,
    formula: calculationType === "FULL" ? "결제금액 전액" : rule.partialFormula,
  };
}

module.exports = {
  PRODUCT_RULES,
  REFUND_POLICY_VERSION,
  calculateRefundQuote,
  getRefundDisclosure,
};

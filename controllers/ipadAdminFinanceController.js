"use strict";

const {
  getFinanceDashboardData,
  recordBusinessWithdrawal,
  updateOtherUnpaidCosts,
} = require("../services/financeService");
const {
  calculateRefundRequest,
  completeRefundRequest,
  getAdminRefundData,
  rejectRefundRequest,
} = require("../services/refundService");
const {
  completePaybackPayout,
  getAdminPaybackDashboard,
  resendPaybackPayoutEmail,
} = require("../services/paybackAccountService");

const SCHEMA_VERSION = "ADMIN_FINANCE_NATIVE_V1";

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    throw statusError(403, "관리자만 재무 업무를 처리할 수 있습니다.");
  }
  return req.apiUser;
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

function id(value) {
  return String(value?._id || value?.id || value || "");
}

function integer(value) {
  return Math.round(Number(value) || 0);
}

function person(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: id(value),
    name: String(value.realName || value.name || ""),
    email: String(value.email || ""),
  };
}

function financePayload(value) {
  return {
    currency: String(value.currency || "KRW"),
    grossPayments: integer(value.grossPayments),
    netCollected: integer(value.netCollected),
    refundedAndCancelled: integer(value.refundedAndCancelled),
    todayRevenue: integer(value.todayRevenue),
    actualCashBalance: integer(value.actualCashBalance),
    cumulativePaybackPaid: integer(value.cumulativePaybackPaid),
    paybackReserve: integer(value.paybackReserve),
    confirmedUnpaidPayback: integer(value.confirmedUnpaidPayback),
    pgFeeReserve: integer(value.pgFeeReserve),
    otherUnpaidCosts: integer(value.otherUnpaidCosts),
    cumulativeConfirmedProfit: integer(value.cumulativeConfirmedProfit),
    cumulativeWithdrawals: integer(value.cumulativeWithdrawals),
    withdrawableAmount: integer(value.withdrawableAmount),
    pgFeeReserveBps: integer(value.pgFeeReserveBps),
    withdrawalsEnabled: Boolean(value.withdrawalsEnabled),
    lastReconciledAt: value.lastReconciledAt || null,
    recentWithdrawals: (value.recentWithdrawals || []).map((item) => ({
      id: id(item),
      amount: integer(item.amount),
      status: String(item.status || "COMPLETED"),
      operatorNote: String(item.operatorNote || ""),
      balanceBefore: integer(item.balanceBefore),
      balanceAfter: integer(item.balanceAfter),
      completedAt: item.completedAt || null,
      completedBy: person(item.completedBy),
    })),
  };
}

function refundRow(value) {
  const calculation = value.calculation || {};
  const decision = value.decision || {};
  return {
    id: id(value),
    user: person(value.userId),
    provider: String(value.paymentId?.provider || ""),
    providerMode: String(value.paymentId?.providerMode || ""),
    requestedByType: String(value.requestedByType || "STUDENT"),
    productCode: String(value.productCode || ""),
    productName: String(value.productNameSnapshot || ""),
    orderReference: String(value.orderReferenceSnapshot || ""),
    reasonType: String(value.reasonType || "OTHER"),
    reasonDetail: String(value.reasonDetail || ""),
    status: String(value.status || "REQUESTED"),
    requestedAt: value.requestedAt || null,
    processingDeadlineAt: value.processingDeadlineAt || null,
    calculation: {
      policyVersion: String(calculation.policyVersion || ""),
      approvedAmount: integer(calculation.approvedAmount),
      paidFeatureUsed: Boolean(calculation.paidFeatureUsed),
      usedDays: integer(calculation.usedDays),
      calculationType: String(calculation.calculationType || ""),
      calculatedAmount: integer(calculation.calculatedAmount),
      formula: String(calculation.formula || ""),
      calculatedAt: calculation.calculatedAt || null,
      calculatedBy: person(calculation.calculatedBy),
    },
    decision: {
      approvedAmount: integer(decision.approvedAmount),
      cancellationMode: String(decision.cancellationMode || ""),
      providerCancellationTransactionKey: String(decision.providerCancellationTransactionKey || ""),
      providerCancelledAt: decision.providerCancelledAt || null,
      processedAt: decision.processedAt || null,
      processedBy: person(decision.processedBy),
      operatorNote: String(decision.operatorNote || ""),
    },
  };
}

function refundPayload(value) {
  return {
    items: (value.requests || []).map(refundRow),
    filter: { status: String(value.status || "") },
    pagination: {
      page: integer(value.page) || 1,
      total: integer(value.total),
      totalPages: integer(value.totalPages) || 1,
      hasPrevious: Number(value.page) > 1,
      hasNext: Number(value.page) < Number(value.totalPages),
    },
  };
}

function paybackPayload(value) {
  return {
    periodKey: String(value.periodKey || ""),
    eligible: {
      total: integer(value.eligible?.total),
      linkedTotal: integer(value.eligible?.linkedTotal),
      payoutRate: Number(value.eligible?.payoutRate || 0),
      pendingAmount: integer(value.eligible?.pendingAmount),
    },
    monthly: {
      salesAmount: integer(value.monthly?.salesAmount),
      salesCount: integer(value.monthly?.salesCount),
      payoutAmount: integer(value.monthly?.payoutAmount),
      payoutCount: integer(value.monthly?.payoutCount),
      payoutToSalesRate: Number(value.monthly?.payoutToSalesRate || 0),
    },
    rows: (value.rows || []).map((item) => ({
      cycleId: String(item.cycleId || ""),
      userId: String(item.userId || ""),
      userName: String(item.userName || "사용자"),
      email: String(item.email || ""),
      paybackRate: Number(item.paybackRate || 0),
      paybackAmount: integer(item.paybackAmount),
      evaluatedAt: item.evaluatedAt || null,
      payoutDeadlineAt: item.payoutDeadlineAt || null,
      payoutOverdue: Boolean(item.payoutOverdue),
      accountConfirmed: Boolean(item.accountConfirmed),
      bankName: String(item.bankName || ""),
      accountHolderName: String(item.accountHolderName || ""),
      accountNumber: String(item.accountNumber || ""),
      accountNumberLast4: String(item.accountNumberLast4 || ""),
      decryptError: Boolean(item.decryptError),
    })),
    history: (value.history || []).map((item) => ({
      id: id(item),
      user: person(item.userId),
      completedBy: person(item.completedBy),
      amount: integer(item.amount),
      paybackRate: Number(item.paybackRate || 0),
      bankName: String(item.bankName || ""),
      accountNumberLast4: String(item.accountNumberLast4 || ""),
      status: String(item.status || "COMPLETED"),
      completedAt: item.completedAt || null,
      emailStatus: String(item.emailStatus || "PENDING"),
      operatorNote: String(item.operatorNote || ""),
    })),
    pagination: {
      page: integer(value.pagination?.page) || 1,
      total: integer(value.pagination?.total),
      totalPages: integer(value.pagination?.totalPages) || 1,
      hasPrevious: Number(value.pagination?.page) > 1,
      hasNext: Number(value.pagination?.page) < Number(value.pagination?.totalPages),
    },
  };
}

exports.finance = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getFinanceDashboardData();
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, finance: financePayload(data) });
  } catch (error) { return next(error); }
};

exports.withdraw = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await recordBusinessWithdrawal({
      adminUserId: admin._id,
      amount: req.body.amount,
      operatorNote: req.body.operatorNote,
    });
    const data = await getFinanceDashboardData();
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, finance: financePayload(data) });
  } catch (error) { return next(error); }
};

exports.otherUnpaidCosts = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const data = await updateOtherUnpaidCosts({
      adminUserId: admin._id,
      amount: req.body.amount,
      operatorNote: req.body.operatorNote,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, finance: financePayload(data) });
  } catch (error) { return next(error); }
};

exports.refunds = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminRefundData({ page: req.query.page, status: req.query.status });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, refunds: refundPayload(data) });
  } catch (error) { return next(error); }
};

exports.calculateRefund = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await calculateRefundRequest({
      adminUserId: admin._id,
      refundRequestId: req.params.refundRequestId,
      paidFeatureUsed: req.body.paidFeatureUsed === true,
    });
    const data = await getAdminRefundData({ status: req.query.status });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, refunds: refundPayload(data) });
  } catch (error) { return next(error); }
};

exports.completeRefund = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await completeRefundRequest({
      adminUserId: admin._id,
      refundRequestId: req.params.refundRequestId,
      approvedAmount: req.body.approvedAmount,
      cancellationMode: req.body.cancellationMode,
      providerCancellationTransactionKey: req.body.providerCancellationTransactionKey,
      providerCancelledAt: req.body.providerCancelledAt,
      operatorNote: req.body.operatorNote,
    });
    const data = await getAdminRefundData({ status: req.query.status });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, refunds: refundPayload(data) });
  } catch (error) { return next(error); }
};

exports.rejectRefund = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await rejectRefundRequest({
      adminUserId: admin._id,
      refundRequestId: req.params.refundRequestId,
      operatorNote: req.body.operatorNote,
    });
    const data = await getAdminRefundData({ status: req.query.status });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, refunds: refundPayload(data) });
  } catch (error) { return next(error); }
};

exports.paybacks = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminPaybackDashboard({ page: req.query.page, periodKey: req.query.periodKey });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, paybacks: paybackPayload(data) });
  } catch (error) { return next(error); }
};

exports.completePayback = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const result = await completePaybackPayout({
      cycleId: req.params.cycleId,
      adminUserId: admin._id,
      operatorNote: req.body.operatorNote,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, emailDelivered: result.emailDelivered });
  } catch (error) { return next(error); }
};

exports.resendPaybackEmail = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const result = await resendPaybackPayoutEmail({
      payoutRecordId: req.params.payoutRecordId,
      adminUserId: admin._id,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, emailDelivered: result.emailDelivered });
  } catch (error) { return next(error); }
};

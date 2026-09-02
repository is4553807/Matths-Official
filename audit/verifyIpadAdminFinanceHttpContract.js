"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(path.join(root, "controllers/ipadAdminFinanceController.js"), "utf8");
const ADMIN_ID = "0123456789abcdef01234567";
const calls = [];

function install(filename, exports) {
  const resolved = require.resolve(filename);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const finance = {
  currency: "KRW", grossPayments: 50000, netCollected: 45000,
  refundedAndCancelled: 5000, todayRevenue: 29000, actualCashBalance: 40000,
  cumulativePaybackPaid: 5000, paybackReserve: 10000, confirmedUnpaidPayback: 3000,
  pgFeeReserve: 1500, otherUnpaidCosts: 500, cumulativeConfirmedProfit: 20000,
  cumulativeWithdrawals: 0, withdrawableAmount: 10000, pgFeeReserveBps: 300,
  withdrawalsEnabled: true, recentWithdrawals: [],
};
const refunds = {
  requests: [{
    _id: "r1", userId: { _id: "u1", realName: "학생", email: "s@example.com" },
    paymentId: { provider: "APPLE", providerMode: "LIVE" }, productCode: "LEARNING_PACKAGE_29",
    productNameSnapshot: "29일권", orderReferenceSnapshot: "order-1", reasonDetail: "단순 변심",
    status: "REQUESTED", calculation: {}, decision: {},
  }], status: "", page: 1, total: 1, totalPages: 1,
};
const paybacks = {
  periodKey: "2026-09", eligible: { total: 1, linkedTotal: 1, payoutRate: 100, pendingAmount: 14500 },
  monthly: { salesAmount: 29000, salesCount: 1, payoutAmount: 0, payoutCount: 0, payoutToSalesRate: 0 },
  rows: [{ cycleId: "c1", userId: "u1", userName: "학생", paybackAmount: 14500, accountConfirmed: true }],
  history: [], pagination: { page: 1, total: 1, totalPages: 1 },
};

install("../services/financeService", {
  getFinanceDashboardData: async () => finance,
  recordBusinessWithdrawal: async (input) => calls.push(["withdraw", input]),
  updateOtherUnpaidCosts: async (input) => { calls.push(["reserve", input]); return finance; },
});
install("../services/refundService", {
  getAdminRefundData: async () => refunds,
  calculateRefundRequest: async (input) => calls.push(["calculate", input]),
  completeRefundRequest: async (input) => calls.push(["complete-refund", input]),
  rejectRefundRequest: async (input) => calls.push(["reject", input]),
});
install("../services/paybackAccountService", {
  getAdminPaybackDashboard: async () => paybacks,
  completePaybackPayout: async (input) => { calls.push(["payout", input]); return { emailDelivered: true }; },
  resendPaybackPayoutEmail: async (input) => { calls.push(["resend", input]); return { emailDelivered: false }; },
});

async function invoke(handler, { role = "admin", query = {}, params = {}, body = {} } = {}) {
  let payload; let error; const headers = new Map();
  const req = { apiUser: { _id: ADMIN_ID, role }, query, params, body };
  const res = { set(name, value) { headers.set(name, value); return res; }, json(value) { payload = value; return res; } };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers };
}

for (const route of [
  'router.get("/admin/finance"', '"/admin/finance/withdrawals"',
  '"/admin/finance/other-unpaid-costs"', 'router.get("/admin/refunds"',
  '"/admin/refunds/:refundRequestId/calculate"', '"/admin/refunds/:refundRequestId/complete"',
  '"/admin/refunds/:refundRequestId/reject"', 'router.get("/admin/paybacks"',
  '"/admin/paybacks/:cycleId/complete"', '"/admin/paybacks/history/:payoutRecordId/resend-email"',
]) assert(routes.includes(route), `missing native admin finance route: ${route}`);
assert(routes.indexOf("router.use(requireApiAuth)") < routes.indexOf('router.get("/admin/finance"'));
assert(source.includes("req.apiUser"));
assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminFinanceController");
(async () => {
  assert.equal((await invoke(controller.finance, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.finance);
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_FINANCE_NATIVE_V1");
  assert.equal(dashboard.payload.finance.withdrawableAmount, 10000);
  assert.equal(dashboard.headers.get("Cache-Control"), "private, no-store");
  const refundList = await invoke(controller.refunds);
  assert.equal(refundList.payload.refunds.items[0].provider, "APPLE");
  const paybackList = await invoke(controller.paybacks);
  assert.equal(paybackList.payload.paybacks.rows[0].paybackAmount, 14500);
  await invoke(controller.withdraw, { body: { amount: 1000, operatorNote: "이체" } });
  await invoke(controller.otherUnpaidCosts, { body: { amount: 500, operatorNote: "외주비" } });
  await invoke(controller.calculateRefund, { params: { refundRequestId: "r1" }, body: { paidFeatureUsed: true } });
  await invoke(controller.completeRefund, { params: { refundRequestId: "r1" }, body: { approvedAmount: 1000, cancellationMode: "PARTIAL" } });
  await invoke(controller.rejectRefund, { params: { refundRequestId: "r1" }, body: { operatorNote: "반려 사유 충분" } });
  const payout = await invoke(controller.completePayback, { params: { cycleId: "c1" }, body: { operatorNote: "송금 완료" } });
  assert.equal(payout.payload.emailDelivered, true);
  const resend = await invoke(controller.resendPaybackEmail, { params: { payoutRecordId: "p1" } });
  assert.equal(resend.payload.emailDelivered, false);
  assert.deepEqual(calls.map(([name]) => name), ["withdraw", "reserve", "calculate", "complete-refund", "reject", "payout", "resend"]);
  console.log("iPad native admin finance HTTP contract passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

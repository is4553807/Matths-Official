const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculateMonthlyObservations,
  getKstMonthPeriod,
  shiftMonthKey,
} = require("../services/dataAnalysisAggregationService");
const {
  FIRST_MONTH_METRICS,
} = require("../dataAnalysis/metricCatalog");

const root = path.resolve(__dirname, "..");
const source = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const period = getKstMonthPeriod("2026-08");
assert.equal(period.startAt.toISOString(), "2026-07-31T15:00:00.000Z");
assert.equal(period.endAt.toISOString(), "2026-08-31T15:00:00.000Z");
assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
assert.throws(() => shiftMonthKey("2026-00", 1), /집계 월/);
assert.throws(() => getKstMonthPeriod("2026-13"), /집계 월/);

const now = new Date("2026-08-10T12:00:00+09:00");
const rows = calculateMonthlyObservations({
  now,
  period,
  payments: [
    { status: "APPLIED", approvedAmount: 29000, policyVersionCode: "P1" },
    { status: "REFUNDED", approvedAmount: 29000, policyVersionCode: "P1" },
    { status: "APPROVED", approvedAmount: 5000, policyVersionCode: "P1" },
  ],
  paidCycles: [
    {
      _id: "cycle-1",
      userId: "user-1",
      division: "SUB",
      policyVersionCode: "P1",
      startsAt: "2026-08-01T00:00:00+09:00",
      depletedAt: "2026-08-05T00:00:00+09:00",
      firstDayMode: "SAME_DAY",
    },
    {
      _id: "cycle-2",
      userId: "user-2",
      division: "SUB",
      policyVersionCode: "P1",
      startsAt: "2026-08-01T00:00:00+09:00",
      depletedAt: null,
      firstDayMode: "NEXT_DAY",
    },
  ],
  depletedCycles: [
    {
      _id: "old-cycle-1",
      userId: "user-1",
      division: "SUB",
      policyVersionCode: "P1",
      startsAt: "2026-07-01T00:00:00+09:00",
      depletedAt: "2026-08-02T00:00:00+09:00",
    },
    {
      _id: "old-cycle-2",
      userId: "user-2",
      division: "MAIN",
      policyVersionCode: "P1",
      startsAt: "2026-07-01T00:00:00+09:00",
      depletedAt: "2026-08-02T00:00:00+09:00",
    },
  ],
  renewalCycles: [
    { _id: "renew-1", userId: "user-1", paidAt: "2026-08-02T12:00:00+09:00" },
    { _id: "renew-2", userId: "user-2", paidAt: "2026-08-05T08:00:00+09:00" },
  ],
  renewalAssessments: [{ status: "COMPLETED" }],
  conversions: [
    {
      userId: "user-2",
      sourceAccessCycleId: "old-cycle-2",
      referenceSubRank: "GOLD",
    },
  ],
  paybackReviews: [
    {
      cycleId: "cycle-1",
      status: "QUALIFIED",
      evaluatedInputs: { paidNormalAttacksCompleted: 4 },
      result: { paybackRate: 50 },
    },
  ],
  paybackCycles: [
    {
      _id: "cycle-1",
      policyVersionCode: "P1",
      pricePaid: 29000,
      paybackAmount: 14500,
      paybackPayoutStatus: "COMPLETED",
    },
  ],
  matchesConcluded: [
    {
      status: "SETTLED",
      division: "SUB",
      winnerRole: "CHALLENGER",
      challenger: { tupleBefore: { arenaRank: "BRONZE" } },
      resultSnapshot: { settlementSummary: { returnedLearningDays: 1 } },
    },
    {
      status: "SETTLED",
      division: "MAIN",
      winnerRole: "DEFENDER",
      challenger: { tupleBefore: { arenaRank: "GOLD" } },
      resultSnapshot: { settlementSummary: { returnedLearningDays: 0 } },
    },
  ],
  includeCurrentSnapshot: true,
});

const row = (metricKey, predicate = () => true) =>
  rows.find((item) => item.metricKey === metricKey && predicate(item));
const catalogMetricKeys = new Set(FIRST_MONTH_METRICS.map((metric) => metric.key));
const connectedMetricKeys = new Set(
  rows.map((item) => item.metricKey).filter((metricKey) => catalogMetricKeys.has(metricKey))
);
assert.equal(FIRST_MONTH_METRICS.length, 40);
assert.equal(connectedMetricKeys.size, 29);
assert.equal(FIRST_MONTH_METRICS.length - connectedMetricKeys.size, 11);
assert.equal(row("payment.successful_count").numericValue, 2);
assert.equal(row("payment.net_approved_amount").numericValue, 34000);
assert.equal(Math.round(row("payment.refund_cancel_rate").numericValue * 10) / 10, 33.3);
assert.equal(row("access.zero_balance_rate").numericValue, 50);
assert.equal(row("access.average_depletion_day").numericValue, 5);
assert.equal(row("access.first_use_before_20_share").numericValue, 50);
assert.equal(row("renewal.within_24h_rate").numericValue, 50);
assert.equal(row("renewal.late_rate").numericValue, 50);
assert.equal(row("main.expiry_to_sub_rate").numericValue, 100);
assert.equal(row("payback.recipient_rate").numericValue, 100);
assert.equal(row("payback.payout_rate").numericValue, 50);
assert.equal(row("simulation.challenger_win_rate").numericValue, 50);
assert.equal(row("simulation.bronze_self_return_rate").numericValue, 100);
assert.equal(row("renewal.assessment_dropoff_rate"), undefined);
assert.equal(row("main.revenge_usage_rate").numericValue, null);

const routes = source("routes/matths-routes.js");
const controller = source("controllers/matthsController.js");
const navigation = source("views/partials/admin-navigation.ejs");
const server = source("server.js");
const view = source("views/admin-data-analysis.ejs");
assert.ok(routes.includes('"/admin/data-analysis"'));
assert.ok(routes.includes('"/admin/data-analysis/rebuild"'));
assert.ok(controller.includes("runMonthlyDataAnalysisAggregation"));
assert.ok(navigation.includes("운영 지표"));
assert.ok(server.includes("startDataAnalysisScheduler"));
assert.ok(view.includes("원본 연결 대기"));
assert.ok(view.includes("분자"));
assert.ok(view.includes("분모"));

console.log("월별 dataAnalysis KST 집계·표본·관리자 화면 연결 검증 완료");

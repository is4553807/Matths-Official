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
    { userId: "user-1", status: "APPLIED", approvedAmount: 29000, policyVersionCode: "P1" },
    { userId: "user-3", status: "REFUNDED", approvedAmount: 29000, policyVersionCode: "P1" },
    { userId: "user-2", status: "APPROVED", approvedAmount: 5000, policyVersionCode: "P1" },
  ],
  paidCycles: [
    {
      _id: "cycle-1",
      userId: "user-1",
      division: "SUB",
      policyVersionCode: "P1",
      startsAt: "2026-08-01T00:00:00+09:00",
      paidAt: "2026-08-01T00:00:00+09:00",
      depletedAt: "2026-08-05T00:00:00+09:00",
      firstDayMode: "SAME_DAY",
    },
    {
      _id: "cycle-2",
      userId: "user-2",
      division: "SUB",
      policyVersionCode: "P1",
      startsAt: "2026-08-01T00:00:00+09:00",
      paidAt: "2026-08-01T00:00:00+09:00",
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
  renewalAssessments: [{ status: "COMPLETED" }, { status: "REQUIRED" }],
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
      _id: "match-sub",
      status: "SETTLED",
      division: "SUB",
      winnerRole: "CHALLENGER",
      challenger: { tupleBefore: { arenaRank: "BRONZE" } },
      resultSnapshot: { settlementSummary: { returnedLearningDays: 1 } },
    },
    {
      _id: "match-main",
      status: "SETTLED",
      division: "MAIN",
      winnerRole: "DEFENDER",
      challenger: { tupleBefore: { arenaRank: "GOLD" } },
      resultSnapshot: { settlementSummary: { returnedLearningDays: 0 } },
    },
  ],
  matchesCreated: [
    {
      _id: "match-main",
      status: "SETTLED",
      division: "MAIN",
      matchType: "NORMAL",
      targetTier: "PLATINUM",
      challenger: { userId: "user-1", tupleBefore: { arenaRank: "GOLD", arenaPosition: 12 } },
      defender: { userId: "user-2", tupleBefore: { arenaRank: "PLATINUM", arenaPosition: 9 } },
    },
  ],
  mainTransferLedgers: [
    { userId: "user-1", sourceId: "match-main", availableLearningDaysDelta: -2 },
    { userId: "user-2", sourceId: "match-main", availableLearningDaysDelta: 1 },
  ],
  supportInquiries: [
    { subject: "첫날 학습일 차감 문의", content: "20시 이후 결제했습니다." },
  ],
  operationalEvents: [
    { eventType: "PRICING_VIEW", result: "VIEWED", userId: "user-1", occurredAt: "2026-08-01T10:00:00+09:00" },
    { eventType: "PRICING_VIEW", result: "VIEWED", userId: "user-4", occurredAt: "2026-08-01T21:00:00+09:00" },
    { eventType: "MATCH_REQUEST", result: "FAILED", division: "SUB", sourceTier: "SILVER", targetTier: "GOLD", rankBucket: "21~50위", reasonCode: "NO_CANDIDATE" },
    { eventType: "WEEKLY_MOCK_ACCESS_DENIED", result: "DENIED", userId: "user-1", occurredAt: "2026-07-31T22:00:00+09:00" },
  ],
  sundayCutoffTodos: [{ sourceId: "match-main" }],
  includeCurrentSnapshot: true,
});

const row = (metricKey, predicate = () => true) =>
  rows.find((item) => item.metricKey === metricKey && predicate(item));
const catalogMetricKeys = new Set(FIRST_MONTH_METRICS.map((metric) => metric.key));
const connectedMetricKeys = new Set(
  rows.map((item) => item.metricKey).filter((metricKey) => catalogMetricKeys.has(metricKey))
);
assert.equal(FIRST_MONTH_METRICS.length, 47);
assert.equal(connectedMetricKeys.size, FIRST_MONTH_METRICS.length);
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
assert.equal(row("renewal.assessment_dropoff_rate").numericValue, 50);
assert.equal(row("access.first_day_deduction_support_rate").numericValue, 50);
assert.equal(row("conversion.payment_view_to_purchase").numericValue, 50);
assert.equal(row("main.sunday_cutoff_hold_count").numericValue, 1);
assert.equal(row("match.request_success_rate", (item) => item.dimensions.division === "SUB").numericValue, 0);
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
assert.ok(view.includes("집계 미실행"));
assert.ok(view.includes("분자"));
assert.ok(view.includes("분모"));

console.log("월별 dataAnalysis KST 집계·표본·관리자 화면 연결 검증 완료");

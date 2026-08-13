const mongoose = require("mongoose");
const { AdminActionLog } = require("../models/matthsModel");
const { AccessCycle, ArenaPackagePayment } = require("../models/goatArenaModel");
const {
  BusinessWithdrawal,
  FinanceAccount,
  FinanceDailySnapshot,
  PaybackPayoutRecord,
} = require("../models/paybackModel");
const { getActiveAdminSender } = require("./adminIdentityService");

const ACCOUNT_KEY = "PRIMARY";
const WITHDRAWAL_HISTORY_LIMIT = 20;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function kstDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function pgFeeReserveConfiguration() {
  const raw = String(process.env.FINANCE_PG_FEE_RESERVE_BPS ?? "").trim();
  const parsed = Number.parseInt(raw, 10);
  const configured = /^\d+$/.test(raw) && parsed >= 0 && parsed <= 10000;
  return { configured, bps: configured ? parsed : 0 };
}

function maximumPaybackAmount(cycle) {
  const bands = Array.isArray(cycle?.policySnapshot?.payback?.bands)
    ? cycle.policySnapshot.payback.bands
    : [];
  const rates = bands
    .map((band) => Number(band?.ratePercent ?? band?.rate ?? band?.paybackRate))
    .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100);
  const maximumRate = rates.length ? Math.max(...rates) : 100;
  return nonNegativeInteger(Number(cycle.pricePaid || 0) * maximumRate / 100);
}

function startOfKstDay(now = new Date()) {
  const dateKey = kstDateKey(now);
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9));
}

async function paymentTotals(now = new Date()) {
  const today = startOfKstDay(now);
  const rows = await ArenaPackagePayment.aggregate([
    {
      $group: {
        _id: null,
        grossPayments: { $sum: "$approvedAmount" },
        netCollected: {
          $sum: {
            $cond: [
              { $in: ["$status", ["APPROVED", "APPLIED", "PARTIALLY_REFUNDED", "REFUNDED"]] },
              { $max: [0, { $subtract: ["$approvedAmount", { $ifNull: ["$refundedAmount", 0] }] }] },
              0,
            ],
          },
        },
        refunded: {
          $sum: { $ifNull: ["$refundedAmount", 0] },
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, "$approvedAmount", 0] },
        },
        todayRevenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$approvedAt", today] },
                  { $in: ["$status", ["APPROVED", "APPLIED", "PARTIALLY_REFUNDED"]] },
                ],
              },
              { $max: [0, { $subtract: ["$approvedAmount", { $ifNull: ["$refundedAmount", 0] }] }] },
              0,
            ],
          },
        },
      },
    },
  ]);
  const row = rows[0] || {};
  return {
    grossPayments: nonNegativeInteger(row.grossPayments),
    netCollected: nonNegativeInteger(row.netCollected),
    refunded: nonNegativeInteger(row.refunded),
    cancelled: nonNegativeInteger(row.cancelled),
    todayRevenue: nonNegativeInteger(row.todayRevenue),
  };
}

async function payoutAndWithdrawalTotals() {
  const [payoutRows, withdrawalRows] = await Promise.all([
    PaybackPayoutRecord.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    BusinessWithdrawal.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
  ]);
  return {
    cumulativePaybackPaid: nonNegativeInteger(payoutRows[0]?.amount),
    cumulativeWithdrawals: nonNegativeInteger(withdrawalRows[0]?.amount),
  };
}

async function paybackObligations() {
  const cycles = await AccessCycle.find({
    status: { $nin: ["CANCELLED"] },
  })
    .select("pricePaid policySnapshot.payback evaluatedAt paybackPayoutStatus paybackAmount")
    .lean();
  let paybackReserve = 0;
  let confirmedUnpaidPayback = 0;
  let confirmedGrossProfit = 0;
  let finalizedRevenue = 0;

  cycles.forEach((cycle) => {
    const pricePaid = nonNegativeInteger(cycle.pricePaid);
    if (!cycle.evaluatedAt) {
      paybackReserve += maximumPaybackAmount(cycle);
      return;
    }
    finalizedRevenue += pricePaid;
    const finalPayback = nonNegativeInteger(cycle.paybackAmount);
    confirmedGrossProfit += Math.max(0, pricePaid - finalPayback);
    if (cycle.paybackPayoutStatus === "PENDING") {
      confirmedUnpaidPayback += finalPayback;
    }
  });

  return {
    paybackReserve,
    confirmedUnpaidPayback,
    confirmedGrossProfit,
    finalizedRevenue,
  };
}

function deriveFinanceMetrics({
  payments,
  cashOut,
  obligations,
  existingAccount = {},
  pgFeeConfig,
}) {
  const pgFeeReserve = nonNegativeInteger(payments.netCollected * pgFeeConfig.bps / 10000);
  const finalizedPgFeeReserve = nonNegativeInteger(
    Math.min(payments.netCollected, obligations.finalizedRevenue) * pgFeeConfig.bps / 10000
  );
  const recognizedGrossProfit = Math.min(
    payments.netCollected,
    obligations.confirmedGrossProfit
  );
  const cumulativeConfirmedProfit = Math.max(
    0,
    recognizedGrossProfit - finalizedPgFeeReserve
  );
  const otherUnpaidCosts = nonNegativeInteger(existingAccount.otherUnpaidCosts);
  const actualCashBalance = Math.max(
    0,
    payments.netCollected - cashOut.cumulativePaybackPaid - cashOut.cumulativeWithdrawals
  );
  const liquidityAfterReserves = Math.max(
    0,
    actualCashBalance - obligations.paybackReserve -
      obligations.confirmedUnpaidPayback - pgFeeReserve - otherUnpaidCosts
  );
  const recognizedProfitRemaining = Math.max(
    0,
    cumulativeConfirmedProfit - cashOut.cumulativeWithdrawals
  );
  const withdrawableAmount = pgFeeConfig.configured
    ? Math.min(liquidityAfterReserves, recognizedProfitRemaining)
    : 0;

  return {
    currency: "KRW",
    grossPayments: payments.grossPayments,
    refunded: payments.refunded,
    cancelled: payments.cancelled,
    refundedAndCancelled: payments.refunded + payments.cancelled,
    netCollected: payments.netCollected,
    todayRevenue: payments.todayRevenue,
    actualCashBalance,
    cumulativePaybackPaid: cashOut.cumulativePaybackPaid,
    paybackReserve: obligations.paybackReserve,
    confirmedUnpaidPayback: obligations.confirmedUnpaidPayback,
    pgFeeReserve,
    otherUnpaidCosts,
    cumulativeConfirmedProfit,
    cumulativeWithdrawals: cashOut.cumulativeWithdrawals,
    withdrawableAmount,
    pgFeeReserveBps: pgFeeConfig.bps,
    withdrawalsEnabled: pgFeeConfig.configured,
  };
}

async function calculateFinanceMetrics(existingAccount = {}, now = new Date()) {
  const [payments, cashOut, obligations] = await Promise.all([
    paymentTotals(now),
    payoutAndWithdrawalTotals(),
    paybackObligations(),
  ]);
  return deriveFinanceMetrics({
    payments,
    cashOut,
    obligations,
    existingAccount,
    pgFeeConfig: pgFeeReserveConfiguration(),
  });
}

async function reconcileFinanceAccount({ now = new Date(), writeSnapshot = true } = {}) {
  const existing = await FinanceAccount.collection.findOne({ accountKey: ACCOUNT_KEY });
  const metrics = await calculateFinanceMetrics(existing || {}, now);
  const dateKey = kstDateKey(now);
  const account = await FinanceAccount.findOneAndUpdate(
    { accountKey: ACCOUNT_KEY },
    {
      $set: {
        ...metrics,
        lastReconciledAt: now,
        lastSettlementDateKst: dateKey,
      },
      $setOnInsert: { accountKey: ACCOUNT_KEY },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
  if (
    existing &&
    (existing.taxFeeReserve !== undefined || existing.taxFeeReserveBps !== undefined)
  ) {
    await FinanceAccount.collection.updateOne(
      { accountKey: ACCOUNT_KEY },
      { $unset: { taxFeeReserve: "", taxFeeReserveBps: "" } }
    );
  }
  if (writeSnapshot) {
    await FinanceDailySnapshot.findOneAndUpdate(
      { dateKeyKst: dateKey },
      {
        $set: { metrics, reconciledAt: now },
        $setOnInsert: { dateKeyKst: dateKey, currency: "KRW" },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  }
  return account;
}

async function reconcileFinanceDailyIfNeeded(now = new Date()) {
  const dateKey = kstDateKey(now);
  const current = await FinanceAccount.findOne({ accountKey: ACCOUNT_KEY })
    .select("lastSettlementDateKst")
    .lean();
  if (current?.lastSettlementDateKst === dateKey) return current;
  return reconcileFinanceAccount({ now, writeSnapshot: true });
}

async function getFinanceDashboardData({ now = new Date() } = {}) {
  const [account, withdrawals] = await Promise.all([
    reconcileFinanceAccount({ now }),
    BusinessWithdrawal.find({ status: "COMPLETED" })
      .sort({ completedAt: -1, _id: -1 })
      .limit(WITHDRAWAL_HISTORY_LIMIT)
      .populate("completedBy", "name realName email")
      .lean(),
  ]);
  return { ...account, recentWithdrawals: withdrawals };
}

function validateWithdrawalInput(amount, note) {
  const normalizedAmount = Number(amount);
  const operatorNote = String(note || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < 1) {
    throw statusError(400, "출금액은 1원 이상의 정수로 입력해주세요.");
  }
  if (!operatorNote) {
    throw statusError(400, "출금 목적 또는 이체 기록을 입력해주세요.");
  }
  return { amount: normalizedAmount, operatorNote };
}

async function recordBusinessWithdrawal({ adminUserId, amount, operatorNote, now = new Date() }) {
  const input = validateWithdrawalInput(amount, operatorNote);
  const actor = await getActiveAdminSender(adminUserId);
  await reconcileFinanceAccount({ now, writeSnapshot: false });
  const session = await mongoose.startSession();
  let withdrawal;
  try {
    await session.withTransaction(async () => {
      const account = await FinanceAccount.findOneAndUpdate(
        {
          accountKey: ACCOUNT_KEY,
          withdrawalsEnabled: true,
          withdrawableAmount: { $gte: input.amount },
        },
        {
          $inc: {
            actualCashBalance: -input.amount,
            cumulativeWithdrawals: input.amount,
            withdrawableAmount: -input.amount,
          },
          $set: { lastReconciledAt: now },
        },
        { returnDocument: "before", session }
      ).lean();
      if (!account) {
        const current = await FinanceAccount.findOne({ accountKey: ACCOUNT_KEY }).session(session).lean();
        if (!current?.withdrawalsEnabled) {
          throw statusError(
            503,
            "PG 수수료 준비금 비율이 설정되지 않아 출금이 잠겨 있습니다.",
            "FINANCE_PG_FEE_RESERVE_NOT_CONFIGURED"
          );
        }
        throw statusError(409, "현재 출금가능액을 초과한 출금은 처리할 수 없습니다.");
      }
      [withdrawal] = await BusinessWithdrawal.create(
        [{
          amount: input.amount,
          completedAt: now,
          completedBy: adminUserId,
          operatorNote: input.operatorNote,
          balanceBefore: account.withdrawableAmount,
          balanceAfter: account.withdrawableAmount - input.amount,
        }],
        { session }
      );
      await AdminActionLog.create(
        [{
          adminUserId,
          action: "finance.business-withdrawal",
          detail: input.operatorNote,
          metadata: {
            withdrawalId: String(withdrawal._id),
            amount: input.amount,
            balanceBefore: account.withdrawableAmount,
            balanceAfter: account.withdrawableAmount - input.amount,
            actorSnapshot: actor,
          },
        }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  await reconcileFinanceAccount({ now });
  return withdrawal?.toObject ? withdrawal.toObject() : withdrawal;
}

async function updateOtherUnpaidCosts({ adminUserId, amount, operatorNote, now = new Date() }) {
  const normalizedAmount = Number(amount);
  const note = String(operatorNote || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < 0) {
    throw statusError(400, "기타 미지급 비용은 0원 이상의 정수로 입력해주세요.");
  }
  if (!note) {
    throw statusError(400, "준비금 변경 사유를 입력해주세요.");
  }
  const actor = await getActiveAdminSender(adminUserId);
  const previous = await FinanceAccount.findOneAndUpdate(
    { accountKey: ACCOUNT_KEY },
    {
      $set: { otherUnpaidCosts: normalizedAmount, lastReconciledAt: now },
      $setOnInsert: { accountKey: ACCOUNT_KEY },
    },
    { upsert: true, returnDocument: "before", setDefaultsOnInsert: true }
  ).lean();
  await AdminActionLog.create({
    adminUserId,
    action: "finance.other-unpaid-costs",
    detail: note,
    metadata: {
      previousAmount: nonNegativeInteger(previous?.otherUnpaidCosts),
      nextAmount: normalizedAmount,
      actorSnapshot: actor,
    },
  });
  return reconcileFinanceAccount({ now });
}

module.exports = {
  calculateFinanceMetrics,
  deriveFinanceMetrics,
  getFinanceDashboardData,
  kstDateKey,
  reconcileFinanceAccount,
  reconcileFinanceDailyIfNeeded,
  recordBusinessWithdrawal,
  pgFeeReserveConfiguration,
  updateOtherUnpaidCosts,
};

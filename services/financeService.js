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

/*
 * 결제 수수료 유보율은 결제사마다 자릿수가 다르다. 토스는 3% 언저리인데 애플
 * App Store 는 15~30% 다. 한 값으로 뭉뚱그리면 출금가능액이 그대로 틀어지고,
 * 출금가능액은 페이백 지급 여력 판단에 쓰이므로 실제 은행 송금 금액이 어긋난다.
 * 그래서 유보율은 결제 기록의 provider 를 보고 고른다.
 */

/*
 * 애플 커미션 기본값(추정치). 계약상 표준 커미션이 30% 라 환경변수가 없어도
 * 이 값을 적용한다 — 여기서 조용히 0 이 되면 준비금이 비고 출금가능액이 부푼다.
 *
 * 한국 App Store 수수료 계산(2023-01 이후, 모두 추정치):
 *   - 한국은 VAT 를 제외한 기준가에 커미션을 매긴다.
 *   - 29,000원 → 기준가 약 26,364원 → 커미션 30% 약 7,909원 → 수령 약 18,455원.
 *   - Small Business Program 에 등록하면 15% 이므로 FINANCE_APPLE_FEE_RESERVE_BPS=1500
 *     으로 내려야 한다. 신청 여부에 따라 값이 바뀌기 때문에 하드코딩하지 않고
 *     환경변수로 뺐다.
 * 위 수치는 어디까지나 추정치다. 확정하려면 실제 Financial Report 의 Partner Share
 * 실측값이 필요하다. 이 숫자를 정산 근거로 그대로 인용하면 안 된다.
 *
 * 적용 기준 주의. 여기서는 VAT 포함 청구액(ArenaPackagePayment.approvedAmount)에
 * 그대로 30% 를 곱한다. 애플의 실제 커미션은 VAT 제외 기준가에 붙으므로
 * 29,000원이면 8,700원이 아니라 약 7,909원이다. 즉 준비금을 약 791원 더 잡는
 * 방향이라 출금가능액이 보수적으로 줄어든다. 이 차이를 "정확하게" 고치려고
 * 기준가로 환산하는 순간 준비금이 실제 애플 몫보다 적어질 수 있으니,
 * 실측 Partner Share 를 확보하기 전에는 지금의 보수적 방향을 유지한다.
 */
const APPLE_DEFAULT_FEE_RESERVE_BPS = 3000;

/*
 * 정식 값은 "APPLE" 이다(services/appleCommerceService.js 가 그 값으로 기록한다).
 * 나머지는 보험이다 — 다른 결제 경로가 붙으면서 이름을 조금 다르게 쓰면 유보율이
 * 3% 로 떨어져 준비금이 10배 가까이 비게 되는데, 그 사고가 페이백 송금액까지
 * 밀고 내려간다. 오탐보다 미탐이 훨씬 비싸서 후보를 넓게 잡는다.
 */
const APPLE_PROVIDER_ALIASES = new Set([
  "APPLE",
  "APPLE_APP_STORE",
  "APPLE_IAP",
  "APPSTORE",
  "APP_STORE",
  "IOS_IAP",
]);

// provider 가 비어 있거나 표에 없는 결제사를 담는 자리. 기본 유보율이 적용된다.
const DEFAULT_PROVIDER_KEY = "DEFAULT";

function normalizeProviderKey(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || DEFAULT_PROVIDER_KEY;
}

function reserveBpsFromEnvironment(name) {
  const raw = String(process.env[name] ?? "").trim();
  const parsed = Number.parseInt(raw, 10);
  const configured = /^\d+$/.test(raw) && parsed >= 0 && parsed <= 10000;
  return { configured, bps: configured ? parsed : 0 };
}

/*
 * 반환 형태를 { configured, bps } 그대로 유지한다. 이 값은 출금 잠금 판정과
 * scripts/verifyFinanceLedger.js 의 deepEqual 이 직접 들여다보기 때문에,
 * 결제사 표를 여기에 끼워 넣으면 기존 계약이 깨진다. 표는 아래에서 따로 얹는다.
 */
function pgFeeReserveConfiguration() {
  return reserveBpsFromEnvironment("FINANCE_PG_FEE_RESERVE_BPS");
}

/*
 * 기본(토스) 설정 위에 결제사별 유보율 표를 얹은 확장본.
 * FINANCE_PG_FEE_RESERVE_BPS 미설정 시 출금이 잠기는 규칙은 그대로 두고,
 * 애플 몫만 별도 비율로 계상한다 — 애플 커미션은 운영 정책이 아니라 계약 사실이라
 * 기본 유보율 설정 여부와 무관하게 빠져나가는 돈이다.
 */
function providerFeeReserveConfiguration() {
  const base = pgFeeReserveConfiguration();
  const apple = reserveBpsFromEnvironment("FINANCE_APPLE_FEE_RESERVE_BPS");
  return {
    ...base,
    providerBps: {
      // **0 은 받지 않는다.** reserveBpsFromEnvironment 는 "0" 을 유효값으로 보지만,
      // 애플 커미션이 0% 인 경우는 존재하지 않으므로 0 은 언제나 설정 사고다.
      // 기본 유보율에는 미설정 시 출금을 잠그는 안전장치가 있는데 애플 요율에는
      // 없어서, 오타 하나로 애플 몫 전액이 출금가능액으로 흘러나간다.
      // 기본 유보율보다 낮아지는 것도 막는다 — 애플이 토스보다 싼 경우는 없다.
      APPLE: Math.max(
        apple.configured && apple.bps > 0 ? apple.bps : APPLE_DEFAULT_FEE_RESERVE_BPS,
        Number.isFinite(Number(base.bps)) ? Number(base.bps) : 0
      ),
    },
  };
}

/** provider 문자열에 적용할 유보율(bps). 모르는 값이면 기본 유보율로 떨어진다. */
function resolveProviderReserveBps(provider, pgFeeConfig = {}) {
  const fallbackBps = Number(pgFeeConfig.bps);
  const fallback = Number.isFinite(fallbackBps) && fallbackBps > 0 ? fallbackBps : 0;
  const table = pgFeeConfig.providerBps;
  if (!table) return fallback;
  const key = normalizeProviderKey(provider);
  const appleBps = Number(table.APPLE);
  if (APPLE_PROVIDER_ALIASES.has(key) && Number.isFinite(appleBps)) return appleBps;
  const directBps = Number(table[key]);
  if (Number.isFinite(directBps)) return directBps;
  return fallback;
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
  /*
   * 합계 자체는 예전과 같아야 하므로 누산식은 손대지 않고 묶는 키만 결제사로 바꾼다.
   * 금액이 전부 정수(원)라서 결제사별로 나눠 더한 뒤 합쳐도 총액은 그대로다.
   */
  const rows = await ArenaPackagePayment.aggregate([
    {
      $group: {
        _id: { $toUpper: { $ifNull: ["$provider", ""] } },
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
  const totals = {
    grossPayments: 0,
    netCollected: 0,
    refunded: 0,
    cancelled: 0,
    todayRevenue: 0,
  };
  const netCollectedByProvider = {};
  rows.forEach((row) => {
    totals.grossPayments += Number(row.grossPayments) || 0;
    totals.netCollected += Number(row.netCollected) || 0;
    totals.refunded += Number(row.refunded) || 0;
    totals.cancelled += Number(row.cancelled) || 0;
    totals.todayRevenue += Number(row.todayRevenue) || 0;
    const key = normalizeProviderKey(row._id);
    const collected = nonNegativeInteger(row.netCollected);
    if (collected > 0) {
      netCollectedByProvider[key] = (netCollectedByProvider[key] || 0) + collected;
    }
  });
  return {
    grossPayments: nonNegativeInteger(totals.grossPayments),
    netCollected: nonNegativeInteger(totals.netCollected),
    refunded: nonNegativeInteger(totals.refunded),
    cancelled: nonNegativeInteger(totals.cancelled),
    todayRevenue: nonNegativeInteger(totals.todayRevenue),
    netCollectedByProvider,
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

/*
 * 수금액을 결제사 단위로 쪼갠다. 쪼갤 근거가 없으면(=예전 호출부, 또는 결제사
 * 내역이 총액과 어긋나는 경우) 예전처럼 전액을 기본 유보율 한 덩어리로 본다.
 * 그래야 토스만 있던 기존 계산이 1원도 달라지지 않는다.
 */
function providerFeeBuckets(payments, pgFeeConfig) {
  const netCollected = payments.netCollected;
  const legacyBucket = () => [
    {
      provider: DEFAULT_PROVIDER_KEY,
      amount: netCollected,
      bps: resolveProviderReserveBps(DEFAULT_PROVIDER_KEY, pgFeeConfig),
    },
  ];
  const source = payments.netCollectedByProvider;
  if (!source || typeof source !== "object") return legacyBucket();

  const buckets = Object.keys(source)
    .map((provider) => ({
      provider: normalizeProviderKey(provider),
      amount: nonNegativeInteger(source[provider]),
    }))
    .filter((bucket) => bucket.amount > 0)
    .sort((left, right) => left.provider.localeCompare(right.provider));
  if (!buckets.length) return legacyBucket();

  const tallied = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  // 내역 합이 총액을 넘으면 신뢰할 수 없는 입력이므로 통째로 예전 방식으로 되돌린다.
  if (tallied > netCollected) return legacyBucket();
  // 모자란 몫은 버리지 않고 기본 유보율 자리에 남긴다. 버리면 준비금이 과소 계상된다.
  if (tallied < netCollected) {
    buckets.push({ provider: DEFAULT_PROVIDER_KEY, amount: netCollected - tallied });
  }
  return buckets.map((bucket) => ({
    ...bucket,
    bps: resolveProviderReserveBps(bucket.provider, pgFeeConfig),
  }));
}

/*
 * 확정 매출 상한(min(수금액, 확정매출))을 결제사별로 안분한다. 확정매출은 이용 주기
 * 쪽 수치라 결제사 정보가 없어서, 수금 비중대로 나누는 것 말고는 근거가 없다.
 * 최대잔여법으로 1원 단위까지 맞춰 안분 합계가 상한과 정확히 일치하게 한다.
 * 결제사가 하나뿐이면 상한이 그대로 그 결제사 몫이 되어 예전 식과 동일해진다.
 */
function prorateAcrossBuckets(target, buckets, total) {
  if (!buckets.length) return [];
  if (buckets.length === 1) return [target];
  if (!(target > 0) || !(total > 0)) return buckets.map(() => 0);

  const shares = buckets.map((bucket, index) => {
    const exact = bucket.amount * target / total;
    const floor = Math.floor(exact);
    return { index, floor, fraction: exact - floor };
  });
  let remainder = target - shares.reduce((sum, share) => sum + share.floor, 0);
  shares
    .slice()
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    .forEach((share) => {
      if (remainder <= 0) return;
      share.floor += 1;
      remainder -= 1;
    });
  return shares
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((share) => share.floor);
}

function deriveFinanceMetrics({
  payments,
  cashOut,
  obligations,
  existingAccount = {},
  pgFeeConfig,
}) {
  const feeBuckets = providerFeeBuckets(payments, pgFeeConfig);
  const finalizedBase = Math.min(payments.netCollected, obligations.finalizedRevenue);
  const finalizedShares = prorateAcrossBuckets(
    finalizedBase,
    feeBuckets,
    payments.netCollected
  );
  const pgFeeReserveByProvider = {};
  const pgFeeReserveBpsByProvider = {};
  const netCollectedByProvider = {};
  let pgFeeReserve = 0;
  let finalizedPgFeeReserve = 0;
  feeBuckets.forEach((bucket, index) => {
    const reserve = nonNegativeInteger(bucket.amount * bucket.bps / 10000);
    pgFeeReserve += reserve;
    finalizedPgFeeReserve += nonNegativeInteger(finalizedShares[index] * bucket.bps / 10000);
    pgFeeReserveByProvider[bucket.provider] =
      (pgFeeReserveByProvider[bucket.provider] || 0) + reserve;
    pgFeeReserveBpsByProvider[bucket.provider] = bucket.bps;
    netCollectedByProvider[bucket.provider] =
      (netCollectedByProvider[bucket.provider] || 0) + bucket.amount;
  });
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
    // 아래 3개는 FinanceAccount 스키마에 없어서 계정 문서에는 저장되지 않는다.
    // FinanceDailySnapshot.metrics(Mixed)에는 그대로 남아 사후 대조에 쓸 수 있다.
    netCollectedByProvider,
    pgFeeReserveByProvider,
    pgFeeReserveBpsByProvider,
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
    pgFeeConfig: providerFeeReserveConfiguration(),
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
  providerFeeReserveConfiguration,
  resolveProviderReserveBps,
  updateOtherUnpaidCosts,
};

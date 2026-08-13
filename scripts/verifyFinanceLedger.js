const assert = require("node:assert/strict");
const {
  deriveFinanceMetrics,
  pgFeeReserveConfiguration,
} = require("../services/financeService");

function summary({
  netCollected = 29000,
  paybackPaid = 0,
  withdrawals = 0,
  paybackReserve = 0,
  confirmedUnpaidPayback = 0,
  confirmedGrossProfit = 0,
  finalizedRevenue = 0,
  reserveBps = 0,
  reserveConfigured = true,
} = {}) {
  return deriveFinanceMetrics({
    payments: {
      grossPayments: netCollected,
      netCollected,
      refunded: 0,
      cancelled: 0,
      todayRevenue: netCollected,
    },
    cashOut: {
      cumulativePaybackPaid: paybackPaid,
      cumulativeWithdrawals: withdrawals,
    },
    obligations: {
      paybackReserve,
      confirmedUnpaidPayback,
      confirmedGrossProfit,
      finalizedRevenue,
    },
    existingAccount: { otherUnpaidCosts: 0 },
    pgFeeConfig: { configured: reserveConfigured, bps: reserveBps },
  });
}

const unresolved = summary({ paybackReserve: 29000 });
assert.equal(unresolved.withdrawableAmount, 0, "판정 전 결제금은 출금할 수 없어야 합니다.");

const qualifiedPending = summary({
  confirmedUnpaidPayback: 14500,
  confirmedGrossProfit: 14500,
  finalizedRevenue: 29000,
});
assert.equal(
  qualifiedPending.withdrawableAmount,
  14500,
  "확정 페이백을 전액 보관한 뒤 남은 확정이익만 출금할 수 있어야 합니다."
);

const paid = summary({
  paybackPaid: 14500,
  confirmedGrossProfit: 14500,
  finalizedRevenue: 29000,
});
assert.equal(paid.actualCashBalance, 14500);
assert.equal(paid.withdrawableAmount, 14500);

const fullyWithdrawn = summary({
  paybackPaid: 14500,
  withdrawals: 14500,
  confirmedGrossProfit: 14500,
  finalizedRevenue: 29000,
});
assert.equal(fullyWithdrawn.withdrawableAmount, 0);

const futureUserProtected = summary({
  netCollected: 58000,
  paybackPaid: 14500,
  withdrawals: 14500,
  paybackReserve: 29000,
  confirmedGrossProfit: 14500,
  finalizedRevenue: 29000,
});
assert.equal(
  futureUserProtected.actualCashBalance,
  29000,
  "기존 확정이익을 모두 출금해도 새 유저의 최대 페이백 금액은 현금으로 남아야 합니다."
);
assert.equal(futureUserProtected.withdrawableAmount, 0);

const lockedWithoutReservePolicy = summary({
  confirmedGrossProfit: 29000,
  finalizedRevenue: 29000,
  reserveConfigured: false,
});
assert.equal(lockedWithoutReservePolicy.withdrawableAmount, 0);
assert.equal(lockedWithoutReservePolicy.withdrawalsEnabled, false);

const pgFeeOnly = summary({
  confirmedGrossProfit: 29000,
  finalizedRevenue: 29000,
  reserveBps: 330,
});
assert.equal(pgFeeOnly.pgFeeReserve, 957);
assert.equal(pgFeeOnly.cumulativeConfirmedProfit, 28043);
assert.equal(pgFeeOnly.withdrawableAmount, 28043);
assert.equal("taxFeeReserve" in pgFeeOnly, false, "세금 준비금 필드는 장부 계산에서 제외되어야 합니다.");

const originalPgFeeBps = process.env.FINANCE_PG_FEE_RESERVE_BPS;
const originalTaxFeeBps = process.env.FINANCE_TAX_FEE_RESERVE_BPS;
delete process.env.FINANCE_PG_FEE_RESERVE_BPS;
process.env.FINANCE_TAX_FEE_RESERVE_BPS = "1300";
assert.equal(
  pgFeeReserveConfiguration().configured,
  false,
  "폐기된 세금·수수료 통합 설정으로 출금 잠금이 해제되면 안 됩니다."
);
process.env.FINANCE_PG_FEE_RESERVE_BPS = "330";
assert.deepEqual(pgFeeReserveConfiguration(), { configured: true, bps: 330 });
if (originalPgFeeBps === undefined) delete process.env.FINANCE_PG_FEE_RESERVE_BPS;
else process.env.FINANCE_PG_FEE_RESERVE_BPS = originalPgFeeBps;
if (originalTaxFeeBps === undefined) delete process.env.FINANCE_TAX_FEE_RESERVE_BPS;
else process.env.FINANCE_TAX_FEE_RESERVE_BPS = originalTaxFeeBps;

console.log("Finance ledger verification passed");

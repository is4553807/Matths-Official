const assert = require("node:assert/strict");
const {
  deriveFinanceMetrics,
  pgFeeReserveConfiguration,
} = require("../services/financeService");

function summary({
  netCollected = 29000,
  withdrawals = 0,
  reserveBps = 0,
  reserveConfigured = true,
  otherUnpaidCosts = 0,
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
      cumulativeWithdrawals: withdrawals,
    },
    existingAccount: { otherUnpaidCosts },
    pgFeeConfig: { configured: reserveConfigured, bps: reserveBps },
  });
}

const fullyWithdrawn = summary({
  withdrawals: 29000,
});
assert.equal(fullyWithdrawn.withdrawableAmount, 0);

const lockedWithoutReservePolicy = summary({
  reserveConfigured: false,
});
assert.equal(lockedWithoutReservePolicy.withdrawableAmount, 0);
assert.equal(lockedWithoutReservePolicy.withdrawalsEnabled, false);

const pgFeeOnly = summary({
  reserveBps: 330,
});
assert.equal(pgFeeOnly.pgFeeReserve, 957);
assert.equal(pgFeeOnly.cumulativeConfirmedProfit, 28043);
assert.equal(pgFeeOnly.withdrawableAmount, 28043);
assert.equal("taxFeeReserve" in pgFeeOnly, false, "세금 준비금 필드는 장부 계산에서 제외되어야 합니다.");
assert.equal("paybackReserve" in pgFeeOnly, false, "폐기된 페이백 준비금이 현재 장부에 노출되면 안 됩니다.");
assert.equal("confirmedUnpaidPayback" in pgFeeOnly, false, "폐기된 페이백 지급 필드가 현재 장부에 노출되면 안 됩니다.");

const operatingCosts = summary({ reserveBps: 330, otherUnpaidCosts: 1000 });
assert.equal(operatingCosts.withdrawableAmount, 27043);

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

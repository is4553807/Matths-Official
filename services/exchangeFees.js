const EXCHANGE_WALLET_ID = "00000000000000000000fee1";
const FEE_RATES = Object.freeze({ maker: 2, taker: 5 }); // Basis points
const TP_SCALE = 100;
const INITIAL_TP = 2000 * TP_SCALE;

function initialBalance(userId) {
  return String(userId) === EXCHANGE_WALLET_ID ? 0 : INITIAL_TP;
}

function tradeFee(price, quantity, role) {
  // Round per contract so the charge is independent of how the fill is split.
  return Math.round(price * TP_SCALE * FEE_RATES[role] / 10_000) * quantity;
}

module.exports = { EXCHANGE_WALLET_ID, FEE_RATES, TP_SCALE, INITIAL_TP, initialBalance, tradeFee };

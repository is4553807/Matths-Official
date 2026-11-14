function operatorOnlyExchange() {
  return process.env.EXCHANGE_OPERATOR_ONLY === "1";
}

function publicMarketFilter() {
  return { "historicalBootstrap.status": null, replayRecordedAt: null };
}

function isPublicMarket(market) {
  return !market.historicalBootstrap?.status && !market.replayRecordedAt;
}

module.exports = { operatorOnlyExchange, publicMarketFilter, isPublicMarket };

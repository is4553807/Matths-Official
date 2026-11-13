const mongoose = require("mongoose");
const { ExchangeAccount, ExchangeMarket, ExchangeOrder, ExchangePosition, ExchangeTrade, ExchangeWallet } = require("../models/exchangeModel");
const { TP_SCALE, collateral } = require("./exchangeTradingService");
const { EXCHANGE_WALLET_ID, initialBalance } = require("./exchangeFees");
const { marketView, orderView } = require("./exchangeService");
const { submittedBots } = require("./exchangeScenarioService");
const { isBootstrap, readExamBots, traderId, botLabel } = require("./exchangeBootstrapService");

async function dashboardState(userId, now = new Date(), { section } = {}) {
  return mongoose.connection.transaction(async (session) => {
    const wallet = await ExchangeWallet.findById(userId).session(session).lean();
    const accounts = await ExchangeAccount.find({ userId, releasedAt: null }).session(session).lean();
    const positions = await ExchangePosition.find({ userId, remaining: { $gt: 0 } })
      .sort({ createdAt: -1 }).session(session).lean();
    const history = section && section !== "history" ? [] : await ExchangePosition.find({ userId, $expr: { $lt: ["$remaining", "$quantity"] } })
      .sort({ updatedAt: -1, _id: -1 }).limit(50).session(session).lean();
    const orders = await ExchangeOrder.find({ userId, status: "working" }).sort({ acceptedAt: -1 }).session(session).lean();

    const isExchange = String(userId) === EXCHANGE_WALLET_ID;
    const feeTrades = isExchange && section === "fees"
      ? await ExchangeTrade.find({ feeCollected: true }).sort({ tradedAt: -1, _id: -1 }).limit(50).session(session).lean()
      : [];
    const ids = [...new Set([...positions, ...history, ...orders, ...feeTrades].map((row) => String(row.marketId)))];
    const markets = await ExchangeMarket.find({ _id: { $in: ids } }).session(session).lean();
    const byId = new Map(markets.map((market) => [String(market._id), market]));
    function marketFor(row) {
      const market = byId.get(String(row.marketId));
      return market ? marketView(market, now) : null;
    }
    const toTp = (amount) => amount / TP_SCALE;
    const positionCollateral = positions.reduce((sum, row) => sum + collateral(row.direction, row.price, row.remaining), 0);
    const reserved = orders.reduce((sum, row) => sum + (row.feeReserved ?? 0)
      + (row.action === "open" ? collateral(row.direction, row.price, row.remaining) : 0), 0);
    const marketCash = accounts.reduce((sum, row) => sum + row.cash, 0);
    const available = wallet?.available ?? initialBalance(userId);

    return {
      collectedFees: isExchange ? toTp(wallet?.collectedFees ?? 0) : null,
      feeTrades: feeTrades.map((row) => ({
        market: marketFor(row), at: row.tradedAt, price: row.price, quantity: row.quantity,
        makerFee: toTp(row.makerFee), takerFee: toTp(row.takerFee),
        total: toTp(row.makerFee + row.takerFee),
      })),
      available: toTp(available),
      total: toTp(available + marketCash + positionCollateral + reserved),
      marketCash: toTp(marketCash),
      positionCollateral: toTp(positionCollateral),
      reserved: toTp(reserved),
      positions: positions.map((row) => {
        const market = marketFor(row);
        const reference = market?.settlement ?? market?.lastPrice;
        return {
          market, direction: row.direction, price: row.price, remaining: row.remaining,
          collateral: toTp(collateral(row.direction, row.price, row.remaining)),
          notional: row.price * row.remaining,
          unrealized: reference != null && market?.status !== "void"
            ? (reference - row.price) * row.remaining * (row.direction === "long" ? 1 : -1) : null,
        };
      }),
      history: history.map((row) => {
        const market = marketFor(row);
        const voided = byId.get(String(row.marketId))?.decision === "void";
        return {
          market, direction: row.direction, price: row.price, closed: row.quantity - row.remaining,
          realized: voided ? 0 : toTp(row.realized), updatedAt: row.updatedAt,
          status: voided ? "무효" : row.remaining ? "부분 청산"
            : market?.status === "settled" && +row.updatedAt >= +market.closeAt ? "정산 완료" : "청산 완료",
        };
      }),
      orders: orders.map((row) => ({ ...orderView(row), market: marketFor(row) })),
    };
  }, { readConcern: { level: "snapshot" } });
}

async function operatorBotsState(marketId, now = new Date()) {
  return mongoose.connection.transaction(async (session) => {
    const markets = await ExchangeMarket.find({ $or: [{ botParticipation: true }, { marketMakerId: { $ne: null } }] })
      .sort({ opensAt: -1 }).limit(20).select("+botSeed").session(session).lean();
    const market = marketId ? markets.find((row) => String(row._id) === marketId)
      : markets.find((row) => row.opensAt <= now && now < row.closeAt) ?? markets[0];
    const wallet = await ExchangeWallet.findById(EXCHANGE_WALLET_ID).session(session).lean();
    const base = { markets: markets.map((row) => marketView(row, now)), available: (wallet?.available ?? 0) / TP_SCALE };
    if (!market) return { ...base, market: null, bots: [], legacyMaker: null };

    const bootstrap = isBootstrap(market);
    const filter = { marketId: market._id, botId: { $ne: null }, ...(!bootstrap ? { userId: EXCHANGE_WALLET_ID } : {}) };
    const marketCash = await ExchangeAccount.findOne({ marketId: market._id, userId: EXCHANGE_WALLET_ID, releasedAt: null })
      .select("cash").session(session).lean();
    const orders = await ExchangeOrder.find(filter).session(session).lean();
    const positions = await ExchangePosition.find(filter).session(session).lean();
    const reference = market.settlement ?? market.lastPrice;
    const roster = bootstrap ? await readExamBots(market, now, session) : submittedBots(market, now);
    const wallets = bootstrap ? await ExchangeWallet.find({ _id: { $in: roster.map((row) => traderId(row.botId)) },
      parentWalletId: EXCHANGE_WALLET_ID }).session(session).lean() : [];
    const balances = new Map(wallets.map((row) => [String(row._id), row.available / TP_SCALE]));
    const accounts = bootstrap ? await ExchangeAccount.find({ marketId: market._id, userId: { $in: wallets.map((row) => row._id) },
      releasedAt: null }).session(session).lean() : [];
    const cash = new Map(accounts.map((row) => [String(row.userId), row.cash / TP_SCALE]));
    const bots = roster.reverse().map(({ id, botId, number, label, score, submittedAt }) => {
      const key = String(botId ?? id);
      const botOrders = orders.filter((row) => String(row.botId) === key);
      const botPositions = positions.filter((row) => String(row.botId) === key);
      const reserved = botOrders.filter((row) => row.status === "working" && row.expiresAt > now)
        .reduce((sum, row) => sum + collateral(row.direction, row.price, row.remaining), 0) / TP_SCALE;
      const locked = botPositions.reduce((sum, row) => sum + collateral(row.direction, row.price, row.remaining), 0) / TP_SCALE;
      const pnl = reference != null && botPositions.some((row) => row.remaining)
        ? botPositions.reduce((sum, row) => sum + (reference - row.price) * row.remaining * (row.direction === "long" ? 1 : -1), 0) : null;
      const child = bootstrap ? traderId(key) : "";
      const available = bootstrap ? (balances.get(child) ?? 0) + (cash.get(child) ?? 0) : null;
      return { number, score, submittedAt, order: botOrders.at(-1), position: botPositions.at(-1),
        examLabel: label ?? botLabel("ExamBot", number), traderLabel: botLabel("TraderBot", number),
        orders: botOrders, positions: botPositions, available, reserved, locked, pnl,
        realized: botPositions.length ? (market.decision === "void" ? 0 : botPositions.reduce((sum, row) => sum + row.realized, 0) / TP_SCALE) : null };
    });
    return { ...base, market: marketView(market, now), bots, legacyMaker: market.marketMakerId ?? null,
      marketCash: (marketCash?.cash ?? 0) / TP_SCALE,
      reserved: bots.reduce((sum, bot) => sum + bot.reserved, 0), locked: bots.reduce((sum, bot) => sum + bot.locked, 0) };
  }, { readConcern: { level: "snapshot" } });
}

module.exports = { dashboardState, operatorBotsState };

const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const {
  ExchangeAccount, ExchangeBotReplayMpi, ExchangeBotReplayTrade, ExchangeEvent, ExchangeExamBotAttempt, ExchangeMarket,
  ExchangeMpiDemo, ExchangeOrder, ExchangePosition, ExchangeReference, ExchangeSetting, ExchangeTick, ExchangeTrade, ExchangeWallet,
} = require("../models/exchangeModel");
const { User } = require("../models/matthsModel");
const { EXCHANGE_WALLET_ID, TP_SCALE } = require("./exchangeFees");
const { collateral } = require("./exchangeTradingService");
const { cleanupExchangeTestAccounts, previewExchangeTestAccountCleanup } = require("./exchangeTestAccountCleanupService");

const AUTOMATION_EVENTS = [
  "bot-initial-funding", "exam-bots-start", "exam-bots-backfill", "mpi-bot-fade-start", "mpi-bot-weight",
  "trading-bots-enable", "trading-bots-disable", "liquidity-scheduled", "liquidity-stop", "mm-enable", "mm-disable",
];
const DERIVED_DATA = {
  examAttempts: [ExchangeExamBotAttempt, {}],
  replayMpi: [ExchangeBotReplayMpi, {}],
  replayTrades: [ExchangeBotReplayTrade, {}],
  legacyScenarios: [ExchangeMpiDemo, {}],
  botMpiTicks: [ExchangeTick, { $or: [
    { botPopulationCount: { $gt: 0 } }, { reconstructedBotPopulationCount: { $gt: 0 } },
    { botScoreSum: { $gt: 0 } }, { contributions: /^BOT:/i },
  ] }],
  events: [ExchangeEvent, { action: { $in: AUTOMATION_EVENTS } }],
};
const DISABLED_BOOTSTRAP_VERSION = 0;
const BOT_MARKET_FIELDS = [
  "marketMakerId", "marketMakerUsedSnapshot", "liquidityPlan", "examBotsStartedAt", "botSeed",
  "mpiFade", "mpiFadeStep", "replayRecordedAt", "replayMpiCount", "replayVolume", "internalBotCount", "botScoreSum",
  "botParticipantCount", "botOnlyVolume",
];
const ids = (rows) => rows.map((row) => row._id);
const stringIds = (rows) => ids(rows).map(String);
const idFilter = (values) => ({ $in: values });
const sum = (rows, amount) => rows.reduce((total, row) => total + amount(row), 0);
const key = ({ marketId, userId }) => `${marketId}:${userId}`;
const trackedOrder = { $or: [{ source: "BOT" }, { botId: { $ne: null } }, { botLabel: { $ne: null } }, { liquidityProvider: "matths" }] };

async function buildPlan(session = null) {
  const rows = (model, filter, fields) => model.find(filter).select(fields).sort({ _id: 1 }).session(session).lean();
  const markets = await rows(ExchangeMarket, { type: "weekly" },
    `phase escrow volume lastPrice lastTradeAt bootstrapPolicy historicalBootstrap.status botParticipation botWeight tradingBotsEnabled marketMakerEnabled ${BOT_MARKET_FIELDS.filter((field) => field !== "botSeed").join(" ")} +botSeed`);
  const mmIds = new Set(markets.flatMap((market) => market.marketMakerId ? [String(market.marketMakerId)] : []));
  const wallets = await rows(ExchangeWallet, { $or: [
    { _id: idFilter([...mmIds]) }, { parentWalletId: EXCHANGE_WALLET_ID },
  ] }, "_id available collectedFees parentWalletId");
  const dedicatedIds = new Set(stringIds(wallets));
  const belongsToBot = (row) => dedicatedIds.has(String(row.userId));
  const walletFilter = idFilter(ids(wallets));
  const orders = await rows(ExchangeOrder, { $or: [{ userId: walletFilter }, trackedOrder] },
    "marketId userId action direction price quantity remaining status feeReserved feesPaid source actorId botId");
  const botOrders = orders.filter(belongsToBot);
  const accounts = await rows(ExchangeAccount, { userId: walletFilter }, "marketId userId allocated cash releasedAt credited");
  const positions = await rows(ExchangePosition, { userId: walletFilter }, "marketId userId direction price quantity remaining realized tradeId");
  const ordersById = new Map(botOrders.map((order) => [String(order._id), order]));
  const orderFilter = idFilter(ids(botOrders));
  const trades = await rows(ExchangeTrade, { $or: [
    { makerOrderId: orderFilter }, { takerOrderId: orderFilter }, { botOnly: true },
    { makerSource: "BOT" }, { takerSource: "BOT" },
  ] }, "marketId makerOrderId takerOrderId makerFee takerFee feeCollected botOnly price quantity");
  const funding = await rows(ExchangeEvent, { action: "bot-initial-funding" }, "marketId detail createdAt");
  const [parent] = await rows(ExchangeWallet, { _id: EXCHANGE_WALLET_ID }, "available collectedFees botFundingAt");
  const testAccounts = await previewExchangeTestAccountCleanup({ session });

  const blockers = [...testAccounts.blockers];
  const block = (condition, reason) => { if (condition) blockers.push(reason); };
  block(markets.some((market) => market.historicalBootstrap?.status),
    "historical Exchange activity uses the regular trading ledger");
  block(mmIds.has(EXCHANGE_WALLET_ID) || dedicatedIds.has(EXCHANGE_WALLET_ID) ||
    await User.exists({ _id: walletFilter }).session(session), "automation wallet overlaps a user or the operator");
  block(orders.some((order) => !belongsToBot(order)), "automation order outside dedicated wallets");
  block(botOrders.some((order) => order.actorId || order.source === "HUMAN" || order.feeReserved || order.feesPaid),
    "automation order has a human actor or fees");
  block(wallets.some((wallet) => wallet.collectedFees || !Number.isSafeInteger(wallet.available) || wallet.available < 0 ||
    (wallet.parentWalletId && String(wallet.parentWalletId) !== EXCHANGE_WALLET_ID)), "unexpected automation wallet balance");

  const assignedVolume = new Map();
  const positionCounts = new Map();
  const escrowByMarket = new Map();
  const validatedPositionIds = new Set();
  for (const trade of trades) {
    const maker = ordersById.get(String(trade.makerOrderId));
    const taker = ordersById.get(String(trade.takerOrderId));
    if (!maker || !taker) {
      blockers.push("trade with a human, manual operator, or unknown order");
      continue;
    }
    if (!trade.botOnly || trade.feeCollected || trade.makerFee || trade.takerFee ||
      maker.action !== "open" || taker.action !== "open" || maker.direction === taker.direction ||
      key(maker) === key(taker) || String(maker.marketId) !== String(trade.marketId) ||
      String(taker.marketId) !== String(trade.marketId) || !Number.isSafeInteger(trade.quantity) || trade.quantity < 1) {
      blockers.push("automation trade cannot be unwound as an open pair");
      continue;
    }
    for (const order of [maker, taker]) {
      const id = String(order._id);
      assignedVolume.set(id, (assignedVolume.get(id) ?? 0) + trade.quantity);
      const matches = positions.filter((position) => key(position) === key(order) &&
        String(position.tradeId) === String(trade._id) && position.direction === order.direction &&
        position.price === trade.price && position.quantity === trade.quantity && position.remaining === trade.quantity &&
        !position.realized);
      block(matches.length !== 1, "automation trade position has changed");
      for (const position of matches) {
        validatedPositionIds.add(String(position._id));
        positionCounts.set(key(position), (positionCounts.get(key(position)) ?? 0) +
          collateral(position.direction, position.price, position.quantity));
      }
    }
    const marketId = String(trade.marketId);
    escrowByMarket.set(marketId, (escrowByMarket.get(marketId) ?? 0) + trade.quantity * 1000 * TP_SCALE);
  }
  block(positions.length !== validatedPositionIds.size, "unmatched automation positions");
  const collateralByAccount = new Map(positionCounts);
  for (const order of botOrders) {
    block(order.quantity - order.remaining !== (assignedVolume.get(String(order._id)) ?? 0),
      "automation order has unmatched executions");
    if (order.status !== "working" || order.action !== "open") continue;
    const id = key(order);
    collateralByAccount.set(id, (collateralByAccount.get(id) ?? 0) + collateral(order.direction, order.price, order.remaining));
  }
  for (const account of accounts) {
    const id = key(account);
    block(account.releasedAt || account.credited || account.allocated !== account.cash + (collateralByAccount.get(id) ?? 0),
      "automation account collateral cannot be reconciled");
    collateralByAccount.delete(id);
  }
  block([...collateralByAccount.values()].some(Boolean), "automation collateral has no account");

  const marketIds = new Set(stringIds(markets));
  block([...accounts, ...botOrders].some((row) => !marketIds.has(String(row.marketId))), "automation outside weekly markets");
  for (const market of markets) {
    const held = escrowByMarket.get(String(market._id)) ?? 0;
    block(held > market.escrow || held !== (market.botOnlyVolume ?? 0) * 1000 * TP_SCALE ||
      (held > 0 && market.phase !== "scheduled"), "market escrow or automation volume cannot be reconciled");
  }

  const childWallets = wallets.filter((wallet) => String(wallet.parentWalletId) === EXCHANGE_WALLET_ID);
  const childIds = new Set(stringIds(childWallets));
  const refund = sum(childWallets, (wallet) => wallet.available) +
    sum(accounts.filter((account) => childIds.has(String(account.userId))), (account) => account.allocated);
  const grant = funding.length === 1 ? funding[0].detail?.amountTp * TP_SCALE : 0;
  const fundingRecordDelay = funding.length === 1 ? +funding[0].createdAt - +parent?.botFundingAt : null;
  block(funding.length > 1 || Boolean(parent?.botFundingAt) !== Boolean(funding.length) ||
    (funding.length > 0 && (grant !== 2000 * TP_SCALE || fundingRecordDelay < 0 || fundingRecordDelay > 120_000)),
    "operator wallet automation grant cannot be reconciled");
  block((refund || grant) && (!parent || parent.available + refund - grant < 0), "insufficient operator wallet balance");

  const derived = {};
  for (const [name, [model, filter]] of Object.entries(DERIVED_DATA)) {
    derived[name] = await rows(model, filter, "_id");
  }
  const quoteMarkets = idFilter(markets.filter((market) => market.marketMakerId).map((market) => market._id));
  const operatorRefs = await rows(ExchangeReference, { marketId: quoteMarkets, source: "operator" }, "marketId at price");
  const manualOrders = await rows(ExchangeOrder, { marketId: quoteMarkets, userId: EXCHANGE_WALLET_ID, botId: null },
    "marketId side acceptedAt");
  const botQuotes = await rows(ExchangeOrder, { userId: idFilter([...mmIds]), liquidityProvider: "matths" },
    "marketId side price acceptedAt expiresAt updatedAt");
  const refs = operatorRefs.filter((ref) => {
    const beforeRef = (order) => String(order.marketId) === String(ref.marketId) && order.acceptedAt <= ref.at;
    const possibleManualSides = new Set(manualOrders.filter(beforeRef).map(({ side }) => side));
    if (possibleManualSides.size > 1) return false;
    const active = botQuotes.filter((order) => beforeRef(order) && ref.at < order.expiresAt && ref.at <= order.updatedAt);
    return active.some((bid) => bid.side === "buy" && active.some((ask) =>
      ask.side === "sell" && ask.price > bid.price && bid.price + ask.price === 2 * ref.price));
  });
  const counts = Object.fromEntries(Object.entries(derived).map(([name, records]) => [name, records.length]));
  counts.legacyAttempts = sum(await rows(ExchangeMpiDemo, {}, "attempts"), (row) => row.attempts.length);
  Object.assign(counts, { users: testAccounts.count, wallets: wallets.length, accounts: accounts.length, orders: botOrders.length,
    positions: positions.length, trades: trades.length, quoteReferences: refs.length });
  const relevantMarkets = markets.filter((market) => BOT_MARKET_FIELDS.some((field) => market[field] != null) ||
    market.bootstrapPolicy?.version > 0 || market.botWeight > 0 || market.botParticipation || market.tradingBotsEnabled || market.marketMakerEnabled);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    markets: relevantMarkets, wallets, accounts, orders, positions, trades, funding,
    parent: refund || grant ? parent : null, testAccounts, derived, refs, counts, blockers,
  })).digest("hex");
  return { fingerprint, counts, blockers: [...new Set(blockers)], relevantMarkets, derived, refs, escrowByMarket,
    refund, grant, testAccounts, accounts, wallets, botOrders, positions, trades };
}

async function previewExchangeBotCleanup({ session } = {}) {
  const { fingerprint, counts, blockers } = await buildPlan(session);
  return { fingerprint, counts, blockers };
}

async function cleanupExchangeBots(expectedFingerprint) {
  return mongoose.connection.transaction(async (session) => {
    // Acquire the same weekly market locks as orders and settlement before reviewing the ledger.
    await ExchangeMarket.updateMany({ type: "weekly" }, { $inc: { revision: 1 } }, { session, timestamps: false });
    const plan = await buildPlan(session);
    if (plan.fingerprint !== expectedFingerprint) throw new Error("Exchange bot cleanup candidates changed after review.");
    if (plan.blockers.length) throw new Error(`Exchange bot cleanup blocked: ${plan.blockers.join(", ")}.`);
    await ExchangeSetting.updateOne({ _id: "default" }, { $set: { automatedTradingDisabled: true, historicalBootstrapEnabled: false } }, { upsert: true, session });

    if (plan.refund || plan.grant) {
      await ExchangeWallet.updateOne({ _id: EXCHANGE_WALLET_ID }, {
        $inc: { available: plan.refund - plan.grant }, ...(plan.grant ? { $unset: { botFundingAt: 1 } } : {}),
      }, { session });
    }
    // Version zero also prevents older processes from reactivating the launch bootstrap on restart.
    for (const market of plan.relevantMarkets) {
      const held = plan.escrowByMarket.get(String(market._id)) ?? 0;
      await ExchangeMarket.updateOne({ _id: market._id }, {
        $set: { marketMakerEnabled: false, tradingBotsEnabled: false, botParticipation: false, botWeight: 0,
          bootstrapPolicy: { version: DISABLED_BOOTSTRAP_VERSION } },
        $unset: Object.fromEntries([...BOT_MARKET_FIELDS, "internalMpi", "internalMpiCount", "humanScoreSum", "mpiCheckedAt"]
          .map((field) => [field, 1])),
        ...(held ? { $inc: { escrow: -held } } : {}),
      }, { session });
    }
    const deletions = [
      ...Object.entries(DERIVED_DATA).map(([name, [model]]) => [model, plan.derived[name]]),
      [ExchangeReference, plan.refs], [ExchangeTrade, plan.trades], [ExchangePosition, plan.positions],
      [ExchangeOrder, plan.botOrders], [ExchangeAccount, plan.accounts], [ExchangeWallet, plan.wallets],
    ];
    for (const [model, records] of deletions) {
      if (!records.length) continue;
      const { deletedCount } = await model.deleteMany({ _id: idFilter(ids(records)) }, { session });
      if (deletedCount !== records.length) throw new Error(`${model.modelName} changed during cleanup.`);
    }
    const { removedSessions } = await cleanupExchangeTestAccounts({ session, expectedIds: ids(plan.testAccounts.accounts) });
    return { counts: { ...plan.counts, sessions: removedSessions } };
  });
}

module.exports = { previewExchangeBotCleanup, cleanupExchangeBots };

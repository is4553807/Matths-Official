const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { PrivateMockExamAttempt, User } = require("../models/matthsModel");
const {
  ExchangeMarket, ExchangeOrder, ExchangeWallet, ExchangeAccount, ExchangePosition, ExchangeTrade, ExchangeEvent, ExchangeReference,
} = require("../models/exchangeModel");
const {
  error, integer, seoulDate, readWeeklyExam, weeklyExamReady, validAttempts, publicState,
  liveAttemptRows, liveStudent, pendingAttempts, latestPublishedMpi, activeBookOrders, activeLiquidityPlan, bookLevels, marketReference,
} = require("./exchangeMarketService");

const { EXCHANGE_WALLET_ID, TP_SCALE, INITIAL_TP, initialBalance, tradeFee } = require("./exchangeFees");
const { dueBotOrder, submittedBots } = require("./exchangeScenarioService");

const MARKET_LIMIT = 5;
const BOT_EXPOSURE_LIMIT = 5;
const BOT_INITIAL_FUNDING = 2_000 * TP_SCALE;
const MM_WALLET_TP = 2000 * TP_SCALE;
const MM_LOSS_LIMIT = 1000 * TP_SCALE;
const MM_POSITION_LIMIT = 2;
const MM_SNAPSHOT_MAX_AGE = 60 * 60_000;
const MM_CLOSE_ONLY_WINDOW = 30 * 60_000;
const MM_QUOTE_LIFETIME = 20_000;
const LIQUIDITY_CLOSE_ONLY_MS = 5 * 60_000;

const isOperator = (order) => order.liquidityProvider === "matths";



function collateral(direction, price, quantity) {
  return (direction === "long" ? price : 1000 - price) * TP_SCALE * quantity;
}

async function lockMarket(marketId, session) {
  const market = await ExchangeMarket.findByIdAndUpdate(marketId, { $inc: { revision: 1 } }, {
    session, returnDocument: "after",
  }).select("+botSeed");
  if (!market) throw error(404, "선물시장을 찾을 수 없습니다.");
  return market;
}

async function ensureTradeAccess(market, userId, now, session) {
  if (publicState(market, now) !== "open") throw error(409, "주문을 접수할 수 없는 시장입니다.");
  if (market.type !== "weekly") return;
  if (String(userId) !== EXCHANGE_WALLET_ID && await User.exists({ _id: userId, $or: [{ isTestAccount: true }, { role: "test" }, { testBatchKey: { $gt: "" } }] }).session(session)) {
    throw error(403, "학생 계정으로 주문할 수 있습니다.");
  }
  const exam = await readWeeklyExam(market.examId, session);
  if (exam?.status !== "open" || now < exam.releaseAt || now >= exam.closeAt
    || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt || !await weeklyExamReady(exam, session)) {
    throw error(409, "공개된 주간 모의고사 문제지가 있어야 시장이 열립니다.");
  }
  if (String(userId) === EXCHANGE_WALLET_ID) return;
  if (!await PrivateMockExamAttempt.exists({ ...validAttempts(exam, now), userId }).session(session)) {
    throw error(403, "이번 주 모의고사를 완료하면 주문할 수 있습니다.");
  }
}

async function accountFor(marketId, userId, session) {
  return await ExchangeAccount.findOne({ marketId, userId }).session(session)
    || new ExchangeAccount({ marketId, userId });
}

async function debitWallet(userId, amount, session) {
  if (!amount) return;
  const debited = await ExchangeWallet.updateOne({ _id: userId, available: { $gte: amount } },
    { $inc: { available: -amount } }, { session });
  if (!debited.modifiedCount) throw error(409, "주문 담보와 수수료에 필요한 가용 TP가 부족합니다.");
}

async function reserve(market, order, session) {
  const account = order.action === "open" ? await accountFor(market._id, order.userId, session) : null;
  const amount = account ? collateral(order.direction, order.price, order.quantity) : 0;
  const difference = account ? Math.max(0, amount - account.cash) : 0;
  const fees = feeReserveFor(order, "taker");
  await ExchangeWallet.updateOne({ _id: order.userId }, { $setOnInsert: { available: initialBalance(order.userId) } },
    { session, upsert: true, setDefaultsOnInsert: false });
  await debitWallet(order.userId, difference + fees, session);
  order.feeReserved = fees;
  if (account) {
    account.cash += difference - amount;
    account.allocated += difference;
    await account.save({ session });
  }
}

function feeReserveFor(order, role) {
  if (isOperator(order) || String(order.userId) === EXCHANGE_WALLET_ID) return 0;
  if (order.action === "close") {
    // The limit price bounds any fee that the proceeds cannot cover.
    const fee = tradeFee(order.price, order.remaining, role);
    return Math.max(0, fee - collateral(order.direction, order.price, order.remaining));
  }
  const highestPrice = role === "taker" && order.side === "sell" ? 1000 : order.price;
  return tradeFee(highestPrice, order.remaining, role);
}

function feeForFill(order, price, quantity, role) {
  // Orders already on the book before fees were introduced carry no fee reservation.
  if (order.feeReserved == null || isOperator(order) || String(order.userId) === EXCHANGE_WALLET_ID) return 0;
  return tradeFee(price, quantity, role);
}

async function releaseFeeReserve(order, keep, session) {
  if (order.feeReserved == null) return;
  const released = order.feeReserved - keep;
  if (released < 0) throw new Error("Exchange fee reserve is insufficient");
  if (released) await ExchangeWallet.updateOne({ _id: order.userId }, { $inc: { available: released } }, { session });
  order.feeReserved = keep;
}

async function collectFees(amount, session) {
  if (!amount) return;
  await ExchangeWallet.updateOne({ _id: EXCHANGE_WALLET_ID }, { $inc: { available: amount, collectedFees: amount } },
    { session, upsert: true, setDefaultsOnInsert: false });
}

async function creditMarket(marketId, userId, amount, session) {
  if (!amount) return;
  const updated = await ExchangeAccount.updateOne({ marketId, userId }, { $inc: { cash: amount } }, { session });
  if (!updated.matchedCount) throw new Error("Exchange market account is missing");
}

async function checkPositionLimit(order, session) {
  const filter = { marketId: order.marketId, userId: order.userId, botId: null };
  const positions = await ExchangePosition.find({ ...filter, remaining: { $gt: 0 } }).session(session).lean();
  const orders = await ExchangeOrder.find({ ...filter, status: "working" }).session(session).lean();
  if (order.action === "close") {
    const held = positions.filter((row) => row.direction === order.direction).reduce((sum, row) => sum + row.remaining, 0);
    const reserved = orders.filter((row) => row.action === "close" && row.direction === order.direction)
      .reduce((sum, row) => sum + row.remaining, 0);
    if (order.quantity > held - reserved) throw error(409, "청산할 수 있는 계약 수량을 초과했습니다.");
    return;
  }
  const potential = positions.concat(orders.filter((row) => row.action === "open"));
  if (potential.some((row) => row.direction !== order.direction)) {
    throw error(409, "기존 방향의 보유 계약과 신규 주문을 정리한 뒤 반대 방향으로 주문할 수 있습니다.");
  }
  if (potential.reduce((sum, row) => sum + row.remaining, order.quantity) > MARKET_LIMIT) {
    throw error(409, "시장당 최대 5계약까지 주문할 수 있습니다.");
  }
}

async function applyFill(order, trade, fee, session) {
  const { marketId, userId, direction } = order;
  const { price, quantity } = trade;
  const payout = collateral(direction, price, quantity);
  if (order.action === "open") {
    const improvement = collateral(direction, order.price, quantity) - payout;
    if (improvement < 0) throw new Error("Exchange fill exceeds reserved collateral");
    await creditMarket(marketId, userId, improvement, session);
    await new ExchangePosition({ marketId, userId, direction, price, quantity, remaining: quantity, tradeId: trade._id, botId: order.botId })
      .save({ session });
  } else {
    const positions = await ExchangePosition.find({ marketId, userId, direction, botId: order.botId ?? null, remaining: { $gt: 0 } })
      .sort({ _id: 1 }).session(session);
    let left = quantity;
    for (const position of positions) {
      if (!left) break;
      const closed = Math.min(left, position.remaining);
      position.remaining -= closed;
      position.realized += collateral(direction, price, closed) - collateral(direction, position.price, closed);
      await position.save({ session });
      left -= closed;
    }
    if (left) throw new Error("Exchange close exceeds reserved position");
    await creditMarket(marketId, userId, Math.max(0, payout - fee), session);
  }
  if (fee) {
    const fromReserve = order.action === "open" ? fee : Math.max(0, fee - payout);
    if (fromReserve > order.feeReserved) throw new Error("Exchange fill exceeds fee reserve");
    order.feeReserved -= fromReserve;
    order.feesPaid = (order.feesPaid ?? 0) + fee;
  }
  order.remaining -= quantity;
  if (!order.remaining) order.status = "filled";
  await order.save({ session });
}

function normalizedOrder(input) {
  const action = String(input.action);
  const direction = String(input.direction);
  const commandId = String(input.commandId || "");
  if (!["open", "close"].includes(action) || !["long", "short"].includes(direction)
    || !/^[a-zA-Z0-9_-]{16,80}$/.test(commandId)) throw error(400, "유효한 주문 정보를 입력해 주세요.");
  const side = (action === "open") === (direction === "long") ? "buy" : "sell";
  return { action, direction, side, commandId, price: integer(input.price, 0, 1000, "지정가"),
    quantity: integer(input.quantity, 1, MARKET_LIMIT, "수량") };
}

async function placeOrder({ marketId, userId, actorId, input, clock = () => new Date() }) {
  return submitOrder({ marketId, userId, actorId, input, clock });
}

async function submitOrder({ marketId, userId, actorId, input, clock, bot }) {
  if (String(userId) === EXCHANGE_WALLET_ID && !actorId && !bot) throw error(403, "운영 월렛 주문에는 관리자 계정이 필요합니다.");
  const orderInput = normalizedOrder(input);
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    const existing = await ExchangeOrder.findOne({ userId, commandId: orderInput.commandId }).session(session);
    if (existing) {
      if (String(existing.marketId) !== String(marketId) ||
          ["action", "direction", "price", "quantity"].some((field) => existing[field] !== orderInput[field])) {
        throw error(409, "같은 요청 ID에 다른 주문을 사용할 수 없습니다.");
      }
      return existing;
    }
    if (bot && (!market.botParticipation || market.marketMakerEnabled === false || bot.expiresAt <= clock())) return;
    await ensureTradeAccess(market, userId, clock(), session);
    const order = new ExchangeOrder({ ...orderInput, marketId, userId, actorId, remaining: orderInput.quantity,
      status: "working", sequence: market.revision, acceptedAt: clock(), botId: bot?.botId, expiresAt: bot?.expiresAt });
    const opposite = order.side === "buy" ? "sell" : "buy";
    const crossing = { ...activeBookOrders(market._id, order.acceptedAt), userId: EXCHANGE_WALLET_ID,
      side: opposite, price: order.side === "buy" ? { $lte: order.price } : { $gte: order.price } };
    if (bot) {
      if (await ExchangeOrder.exists({ ...crossing, botId: null }).session(session)) return;
      await cancelFundedBotOrders(marketId, session, { side: opposite, price: crossing.price });
      const filter = { marketId, userId, botId: { $ne: null } };
      const open = await ExchangePosition.countDocuments({ ...filter, remaining: { $gt: 0 } }).session(session);
      const working = await ExchangeOrder.countDocuments({ ...filter, status: "working" }).session(session);
      if (open + working >= BOT_EXPOSURE_LIMIT) return;
    } else {
      if (String(userId) === EXCHANGE_WALLET_ID && market.botParticipation &&
        await ExchangeOrder.exists({ ...crossing, botId: { $ne: null } }).session(session)) {
        throw error(409, "반대 방향의 운영 봇 주문을 먼저 취소해 주세요.");
      }
      await checkPositionLimit(order, session);
    }
    await reserve(market, order, session);
    order.acceptedAt = clock();
    if (publicState(market, order.acceptedAt) !== "open") throw error(409, "시장 거래가 마감되었습니다.");
    await order.save({ session });

    const bid = order.side === "buy";
    const counterparty = bot ? { userId: { $nin: [EXCHANGE_WALLET_ID, ...(market.marketMakerId ? [market.marketMakerId] : [])] },
      liquidityProvider: { $ne: "matths" } } : String(userId) === EXCHANGE_WALLET_ID ? { botId: null } : {};
    while (order.remaining) {
      const maker = await ExchangeOrder.findOne({
        ...activeBookOrders(market._id, clock()), ...counterparty, side: bid ? "sell" : "buy",
        price: bid ? { $lte: order.price } : { $gte: order.price },
      }).sort({ price: bid ? 1 : -1, sequence: 1 }).session(session);
      if (!maker) break;
      if (String(maker.userId) === String(userId)) throw error(409, "자신의 반대 주문을 취소한 후 다시 시도해 주세요.");
      if (isOperator(maker) && String(userId) === EXCHANGE_WALLET_ID) {
        await cancel(maker, session);
        continue;
      }
      const tradedAt = clock();
      if (maker.botId && (market.marketMakerEnabled === false || maker.expiresAt <= tradedAt)) {
        await cancel(maker, session);
        continue;
      }
      if ((bot || maker.botId) && !await User.exists({ _id: bot ? maker.userId : userId, ...liveStudent }).session(session)) {
        if (!bot) throw error(403, "유효 응시 학생만 운영 봇 주문과 체결할 수 있습니다.");
        await cancel(maker, session);
        continue;
      }
      if (bot && bot.expiresAt <= tradedAt) {
        await cancel(order, session);
        break;
      }
      if (publicState(market, tradedAt) !== "open") throw error(409, "시장 거래가 마감되었습니다.");
      if (isOperator(maker)) {
        const snapshot = await latestPublishedMpi(market, tradedAt, session);
        const plan = snapshot ? null : activeLiquidityPlan(market, tradedAt);
        if (market.marketMakerEnabled === false || !maker.expiresAt || maker.expiresAt <= tradedAt
          || !canFillOperatorOrder(market, maker, snapshot, plan, tradedAt)) {
          await cancel(maker, session);
          continue;
        }
      } else if (market.type === "weekly" && String(maker.userId) !== EXCHANGE_WALLET_ID && await User.exists({ _id: maker.userId, $or: [{ isTestAccount: true }, { role: "test" }, { testBatchKey: { $gt: "" } }] }).session(session)) {
        await cancel(maker, session);
        continue;
      }
      const quantity = Math.min(order.remaining, maker.remaining);
      const makerFee = feeForFill(maker, maker.price, quantity, "maker");
      const takerFee = feeForFill(order, maker.price, quantity, "taker");
      const totalFee = makerFee + takerFee;
      const trade = await new ExchangeTrade({
        marketId, makerOrderId: maker._id, takerOrderId: order._id, makerFee, takerFee, feeCollected: totalFee > 0,
        price: maker.price, quantity, tradedAt, sequence: market.volume + 1,
        liquidityProvider: maker.botId || bot ? "bot" : isOperator(maker) || String(maker.userId) === EXCHANGE_WALLET_ID
          || String(userId) === EXCHANGE_WALLET_ID ? "matths" : undefined,
      }).save({ session });
      await applyFill(maker, trade, makerFee, session);
      await applyFill(order, trade, takerFee, session);
      if (isOperator(maker) && maker.action === "open") {
        if (maker.scheduledLiquidity) market.liquidityPlan.openingFilledAt = tradedAt;
        else market.marketMakerUsedSnapshot = maker.mpiSnapshotId;
        await cancelOperatorOrders(market, session, { action: "open" });
      }
      await collectFees(totalFee, session);
      const opens = Number(maker.action === "open") + Number(order.action === "open");
      market.escrow += (opens - 1) * 1000 * TP_SCALE * trade.quantity;
      market.lastPrice = trade.price;
      market.lastTradeAt = trade.tradedAt;
      market.volume += trade.quantity;
    }
    await recordReference(market, clock(), session);
    if (order.status !== "cancelled") await releaseFeeReserve(order, feeReserveFor(order, "maker"), session);
    await order.save({ session });
    await market.save({ session });
    return order;
  });
}

async function cancel(order, session, actorId) {
  if (order.status !== "working") return;
  if (order.action === "open") {
    await creditMarket(order.marketId, order.userId, collateral(order.direction, order.price, order.remaining), session);
  }
  await releaseFeeReserve(order, 0, session);
  order.status = "cancelled";
  if (actorId) order.cancelledBy = actorId;
  await order.save({ session });
}

async function cancelFundedBotOrders(marketId, session, filter = {}) {
  const orders = await ExchangeOrder.find({ marketId, userId: EXCHANGE_WALLET_ID, botId: { $ne: null },
    status: "working", ...filter }).session(session);
  for (const order of orders) await cancel(order, session);
}

async function initializeBotFunding(marketId, now) {
  await mongoose.connection.transaction(async (session) => {
    await ExchangeWallet.updateOne({ _id: EXCHANGE_WALLET_ID },
      { $setOnInsert: { available: 0, collectedFees: 0 } }, { upsert: true, session });
    const result = await ExchangeWallet.updateOne({ _id: EXCHANGE_WALLET_ID, botFundingAt: null },
      { $set: { botFundingAt: now }, $inc: { available: BOT_INITIAL_FUNDING } }, { session });
    if (result.modifiedCount) await ExchangeEvent.create([{
      marketId, action: "bot-initial-funding", detail: { amountTp: BOT_INITIAL_FUNDING / TP_SCALE },
    }], { session });
  });
}

async function maintainFundedBotOrders(market, now, clock = () => now) {
  if (!market.botParticipation) return;
  const marketId = market._id;
  const closed = publicState(market, now) !== "open" || market.marketMakerEnabled === false;
  const filter = { marketId, userId: EXCHANGE_WALLET_ID, botId: { $ne: null }, status: "working",
    ...(closed ? {} : { expiresAt: { $lte: now } }) };
  if (await ExchangeOrder.exists(filter)) {
    await mongoose.connection.transaction(async (session) => {
      const current = await lockMarket(marketId, session);
      const at = clock();
      const cancelAll = publicState(current, at) !== "open" || current.marketMakerEnabled === false;
      await cancelFundedBotOrders(marketId, session, cancelAll ? {} : { expiresAt: { $lte: at } });
    });
  }
  if (closed) return;
  const scheduled = dueBotOrder(market, now);
  if (!scheduled) return;
  const commandId = `weekly-bot-${scheduled.botId}`;
  if (await ExchangeOrder.exists({ userId: EXCHANGE_WALLET_ID, commandId })) return;
  const snapshot = await latestPublishedMpi(market, now);
  const bot = snapshot ? dueBotOrder(market, now, snapshot.mpi) : scheduled;
  if (!await ExchangeWallet.exists({ _id: EXCHANGE_WALLET_ID, botFundingAt: { $ne: null } })) {
    await initializeBotFunding(marketId, now);
  }
  try {
    await submitOrder({ marketId, userId: EXCHANGE_WALLET_ID, clock, bot,
      input: { commandId, action: "open", direction: bot.direction, price: bot.price, quantity: 1 } });
  } catch (cause) {
    if (cause.status !== 409) throw cause;
  }
}

async function cancelOperatorOrders(market, session, filter = {}) {
  if (!market.marketMakerId) return;
  const working = await ExchangeOrder.find({
    marketId: market._id, userId: market.marketMakerId, status: "working", ...filter,
  }).session(session);
  for (const order of working) await cancel(order, session);
}

function operatorOpenUntil(market, snapshot, plan) {
  const referenceEndsAt = snapshot ? +snapshot.sampledAt + MM_SNAPSHOT_MAX_AGE : +plan.endsAt;
  return Math.min(referenceEndsAt, +market.closeAt - MM_CLOSE_ONLY_WINDOW);
}

function canFillOperatorOrder(market, order, snapshot, plan, now) {
  const matchingReference = snapshot ? order.mpiSnapshotId?.equals(snapshot._id) : plan && order.scheduledLiquidity;
  if (!matchingReference) return false;
  if (order.action === "close") return true;
  if (+now >= operatorOpenUntil(market, snapshot, plan)) return false;
  return snapshot ? !market.marketMakerUsedSnapshot?.equals(snapshot._id) : !plan.openingFilledAt && !plan.stoppingAt;
}

async function recordReference(market, now, session) {
  if (market.type !== "weekly") return;
  let reference = marketReference();
  if (publicState(market, now) === "open") {
    const snapshot = await latestPublishedMpi(market, now, session);
    const book = await bookLevels(market._id, now, session, snapshot?._id ?? null, EXCHANGE_WALLET_ID, Boolean(activeLiquidityPlan(market, now)));
    const bid = book.filter((row) => row._id.side === "buy").sort((a, b) => b._id.price - a._id.price)[0];
    const ask = book.filter((row) => row._id.side === "sell").sort((a, b) => a._id.price - b._id.price)[0];
    reference = marketReference(bid && { ...bid, price: bid._id.price }, ask && { ...ask, price: ask._id.price });
  }
  const previous = await ExchangeReference.findOne({ marketId: market._id })
    .sort({ at: -1, sequence: -1 }).session(session).lean();
  if ((previous?.price ?? null) === reference.price && (previous?.source ?? null) === reference.source) return;
  await ExchangeReference.create([{ marketId: market._id, at: now, sequence: market.revision, ...reference }], { session });
}

function operatorRiskAllows(positions, candidate) {
  const realized = positions.reduce((sum, row) => sum + row.realized, 0);
  const open = positions.filter((row) => row.remaining > 0);
  const closed = candidate.action === "close" ? open.find((row) => row.direction === candidate.direction) : null;
  if (candidate.action === "close" && !closed) return false;
  if (candidate.action === "open" && open.reduce((sum, row) => sum + row.remaining, 1) > MM_POSITION_LIMIT) return false;
  // From flat, the first opening fill cancels the opposite opening quote. With
  // inventory, an opening and closing fill have opposite P&L effects at each endpoint.
  return [0, 1000].every((settlement) => {
    const pnl = open.reduce((sum, row) => sum + collateral(row.direction, settlement, row.remaining)
      - collateral(row.direction, row.price, row.remaining), realized);
    const change = candidate.action === "open"
      ? collateral(candidate.direction, settlement, 1) - collateral(candidate.direction, candidate.price, 1)
      : collateral(candidate.direction, candidate.price, 1) - collateral(candidate.direction, settlement, 1);
    return pnl >= -MM_LOSS_LIMIT && pnl + change >= -MM_LOSS_LIMIT;
  });
}

async function maintainMarketMaker(marketId, clock = () => new Date()) {
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    const now = clock();
    if (market.type !== "weekly" || !market.openedAt) return;
    const exam = await readWeeklyExam(market.examId, session);
    const enabled = market.marketMakerEnabled !== false && publicState(market, now) === "open"
      && exam?.status === "open" && +exam.releaseAt === +market.opensAt && +exam.closeAt === +market.closeAt
      && await weeklyExamReady(exam, session);
    const snapshot = enabled ? await latestPublishedMpi(market, now, session) : null;
    const plan = enabled && !snapshot ? activeLiquidityPlan(market, now) : null;
    if (!snapshot && !plan) {
      await cancelOperatorOrders(market, session);
      await recordReference(market, now, session);
      return;
    }

    const userId = market.marketMakerId || new mongoose.Types.ObjectId();
    const filter = { marketId: market._id, userId };
    const positions = await ExchangePosition.find(filter).sort({ _id: 1 }).session(session).lean();
    const working = await ExchangeOrder.find({ ...filter, status: "working" }).session(session);
    if (working.some((order) => order.expiresAt <= now)) await recordReference(market, now, session);
    const levels = await bookLevels(market._id, now, session, snapshot?._id ?? null, undefined, Boolean(plan));
    const manualOrders = await ExchangeOrder.find({ ...activeBookOrders(market._id, now), userId: EXCHANGE_WALLET_ID })
      .select("side price").session(session).lean();
    const net = positions.reduce((sum, row) => sum + (row.direction === "long" ? row.remaining : -row.remaining), 0);
    const center = (snapshot?.mpi ?? plan.referencePrice) - 4 * net;
    const halfSpread = snapshot ? Math.max(8, Math.ceil(40 / Math.sqrt(snapshot.populationCount))) : 40;
    const reference = snapshot ? { mpiSnapshotId: snapshot._id } : { scheduledLiquidity: true };
    const candidates = [
      { side: "buy", direction: net < 0 ? "short" : "long", action: net < 0 ? "close" : "open", price: Math.floor(center - halfSpread) },
      { side: "sell", direction: net > 0 ? "long" : "short", action: net > 0 ? "close" : "open", price: Math.ceil(center + halfSpread) },
    ].filter((candidate) => {
      if (candidate.price < 1 || candidate.price > 999 || !operatorRiskAllows(positions, candidate)) return false;
      if (!canFillOperatorOrder(market, { ...candidate, ...reference }, snapshot, plan, now)) return false;
      if (manualOrders.some((row) => row.side !== candidate.side
        && (candidate.side === "buy" ? row.price <= candidate.price : row.price >= candidate.price))) return false;
      return !levels.some((row) => row.quantity > row.operatorQuantity && (
        row._id.side === candidate.side
          ? candidate.side === "buy" ? row._id.price >= candidate.price : row._id.price <= candidate.price
          : candidate.side === "buy" ? row._id.price <= candidate.price : row._id.price >= candidate.price
      ));
    });

    for (const order of working) {
      const candidate = candidates.find((row) => row.side === order.side);
      if (order.expiresAt <= now || !candidate || order.action !== candidate.action || order.direction !== candidate.direction
        || order.price !== candidate.price || !canFillOperatorOrder(market, order, snapshot, plan, now)) {
        await cancel(order, session);
      }
    }
    if (candidates.length && !market.marketMakerId) {
      market.marketMakerId = userId;
      await market.save({ session });
      await ExchangeWallet.create([{ _id: userId, available: MM_WALLET_TP }], { session });
    }

    for (const candidate of candidates) {
      const at = clock();
      if (publicState(market, at) !== "open") break;
      const expiresAt = new Date(Math.min(+at + MM_QUOTE_LIFETIME, +market.closeAt, plan ? +plan.endsAt : Infinity,
        candidate.action === "open" ? operatorOpenUntil(market, snapshot, plan) : Infinity));
      if (expiresAt <= at) continue;
      const existing = working.find((order) => order.status === "working" && order.side === candidate.side);
      if (existing) {
        existing.expiresAt = expiresAt;
        await existing.save({ session });
        continue;
      }
      const order = new ExchangeOrder({ ...candidate, marketId: market._id, userId, commandId: randomUUID(),
        quantity: 1, remaining: 1, status: "working", sequence: market.revision, acceptedAt: at,
        liquidityProvider: "matths", ...reference, expiresAt });
      if (candidate.action === "open") {
        const account = await ExchangeAccount.findOne(filter).session(session).lean();
        const wallet = await ExchangeWallet.findById(userId).session(session).lean();
        if (collateral(order.direction, order.price, 1) > (account?.cash ?? 0) + (wallet?.available ?? 0)) continue;
        await reserve(market, order, session);
      }
      await order.save({ session });
    }
    await recordReference(market, clock(), session);
  });
}

async function scheduleMarketLiquidity(marketId, input, actorId, clock = () => new Date()) {
  const startsAt = seoulDate(input.startsAt);
  const endsAt = seoulDate(input.endsAt);
  const referencePrice = integer(input.referencePrice, 1, 999, "운영자 기준가");
  const reason = String(input.reason || "").trim().slice(0, 300);
  if (!reason || startsAt >= endsAt) throw error(400, "호가 시작·종료 시각과 설정 사유를 확인해 주세요.");

  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    const now = clock();
    if (market.botParticipation) throw error(409, "운영 봇 참여 회차는 시간별 운영 봇이 호가를 공급합니다.");
    if (market.type !== "weekly" || market.phase !== "scheduled" || startsAt < market.opensAt
      || endsAt > market.closeAt || endsAt <= now) {
      throw error(409, "주간 시장 거래 시간 안에서 호가 일정을 설정해 주세요.");
    }
    if (!await User.exists({ _id: actorId, role: "admin" }).session(session)) {
      throw error(403, "관리자 계정으로 운영자 호가 일정을 설정할 수 있습니다.");
    }
    const openingFilledAt = market.liquidityPlan?.openingFilledAt;
    await cancelOperatorOrders(market, session, { scheduledLiquidity: true });
    market.liquidityPlan = { startsAt, endsAt, referencePrice, openingFilledAt };
    await market.save({ session });
    await recordReference(market, now, session);
    await ExchangeEvent.create([{ marketId, actorId, action: "liquidity-scheduled",
      detail: { startsAt, endsAt, referencePrice, reason } }], { session });
  });
}

async function stopMarketLiquidity(marketId, actorId, clock = () => new Date()) {
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    const now = clock();
    const plan = market.liquidityPlan;
    if (market.type !== "weekly" || market.phase !== "scheduled" || !plan?.endsAt || plan.endsAt <= now
      || market.closeAt <= now) throw error(409, "종료할 운영자 호가 일정이 없습니다.");
    if (!await User.exists({ _id: actorId, role: "admin" }).session(session)) {
      throw error(403, "관리자 계정으로 운영자 호가를 종료할 수 있습니다.");
    }
    if (plan.stoppingAt) return;
    plan.stoppingAt = now;
    plan.endsAt = new Date(Math.min(+plan.endsAt, +market.closeAt, +now + LIQUIDITY_CLOSE_ONLY_MS));
    await cancelOperatorOrders(market, session, {
      scheduledLiquidity: true, ...(plan.startsAt <= now ? { action: "open" } : {}),
    });
    if (plan.startsAt > now) plan.endsAt = now;
    await market.save({ session });
    await recordReference(market, now, session);
    await ExchangeEvent.create([{ marketId, actorId, action: "liquidity-stop",
      detail: { endsAt: plan.endsAt } }], { session });
  });
}

async function setMarketMakerEnabled(marketId, enabled, actorId, reason) {
  reason = String(reason || "").trim().slice(0, 300);
  if (!reason) throw error(400, "변경 사유를 입력해 주세요.");
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    const now = new Date();
    if (market.type !== "weekly" || market.phase !== "scheduled" || now >= market.closeAt) {
      throw error(409, "마감 전 주간 시장에서 운영자 호가를 설정할 수 있습니다.");
    }
    market.marketMakerEnabled = enabled;
    await market.save({ session });
    if (!enabled) {
      await cancelOperatorOrders(market, session);
      if (market.botParticipation) await cancelFundedBotOrders(marketId, session);
    }
    await recordReference(market, now, session);
    await ExchangeEvent.create([{ marketId, actorId, action: enabled ? "mm-enable" : "mm-disable", detail: { reason } }], { session });
  });
}

async function setPaused(marketId, paused, actorId, reason) {
  reason = String(reason || "").trim().slice(0, 300);
  if (!reason) throw error(400, "중지·재개 사유를 입력해 주세요.");
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    const now = new Date();
    if (market.phase !== "scheduled" || now >= market.closeAt) {
      throw error(409, "종료된 시장은 중지·재개할 수 없습니다.");
    }
    market.set({ paused, reason });
    await market.save({ session });
    if (paused) {
      await cancelOperatorOrders(market, session);
      if (market.botParticipation) await cancelFundedBotOrders(marketId, session);
    }
    await recordReference(market, now, session);
    await ExchangeEvent.create([{ marketId, actorId, action: paused ? "pause" : "resume", detail: { reason } }], { session });
  });
}

async function cancelOrder({ orderId, userId, actorId, clock = () => new Date() }) {
  if (String(userId) === EXCHANGE_WALLET_ID && !actorId) throw error(403, "운영 월렛 주문에는 관리자 계정이 필요합니다.");
  const found = await ExchangeOrder.findOne({ _id: orderId, userId }).select("marketId").lean();
  if (!found) throw error(404, "주문을 찾을 수 없습니다.");
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(found.marketId, session);
    const order = await ExchangeOrder.findOne({ _id: orderId, userId }).session(session);
    await cancel(order, session, actorId);
    await recordReference(market, clock(), session);
    return order;
  });
}

async function expireOrders(marketId, now) {
  const working = await ExchangeOrder.find({ marketId, status: "working" }).select("_id").limit(50).lean();
  if (!working.length) return;
  await mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    if (market.phase === "scheduled" && now < market.closeAt) return;
    const orders = await ExchangeOrder.find({ _id: { $in: working.map((row) => row._id) }, status: "working" }).session(session);
    for (const order of orders) await cancel(order, session);
  });
}

async function recordDecision(market, decision, actorId, session) {
  market.set({ ...decision, phase: "settling", paused: true });
  await cancelOperatorOrders(market, session);
  await market.save({ session });
  await ExchangeEvent.create([{
    marketId: market._id, actorId, action: decision.decision, detail: decision,
  }], { session });
  return market;
}

async function decide(marketId, decision, actorId, now = new Date()) {
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    if (market.phase !== "scheduled") throw error(409, "정산 또는 취소 결정이 이미 등록되었습니다.");
    if (decision.decision === "normal" && now < market.closeAt) throw error(409, "거래 마감 뒤에만 정산할 수 있습니다.");
    return recordDecision(market, decision, actorId, session);
  });
}

async function registerResult({ marketId, input, actorId, now = new Date() }) {
  const market = await ExchangeMarket.findById(marketId).lean();
  if (!market) throw error(404, "선물시장을 찾을 수 없습니다.");
  if (market.type === "weekly") throw error(409, "주간 시장은 공식 채점 기록으로 정산합니다.");
  const average = String(input.average || "").trim();
  const population = market.population || String(input.population || "").trim().slice(0, 200);
  const settlementSource = market.settlementSource || String(input.source || "").trim().slice(0, 200);
  const resultPublishedAt = seoulDate(input.publishedAt);
  let resultUrl;
  try { resultUrl = new URL(String(input.resultUrl)); } catch { throw error(400, "성적 발표 링크를 확인해 주세요."); }
  if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(average) || Number(average) > 100 || !population || !settlementSource
    || !/^https?:$/.test(resultUrl.protocol) || resultUrl.username || resultUrl.password || resultUrl.href.length > 1000
    || !Number.isFinite(+resultPublishedAt) || resultPublishedAt > now || resultPublishedAt < market.opensAt) {
    throw error(400, "평균 원점수(0–100점), 출처, 모집단, 유효한 발표 시각을 입력해 주세요.");
  }
  return decide(marketId, { decision: "normal", settlement: Math.round(Number(average) * 1000) / 100,
    settlementSource, population, resultUrl: resultUrl.href, resultPublishedAt }, actorId, now);
}

async function voidMarket(marketId, actorId, reason) {
  reason = String(reason || "").trim().slice(0, 300);
  if (!reason) throw error(400, "시장 취소 사유를 입력해 주세요.");
  return decide(marketId, { decision: "void", reason }, actorId);
}

async function settleAccount(marketId, accountId, now) {
  await mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    if (market.phase !== "settling") return;
    const account = await ExchangeAccount.findOne({ _id: accountId, marketId, releasedAt: null }).session(session);
    if (!account) return;
    const positions = await ExchangePosition.find({ marketId, userId: account.userId, remaining: { $gt: 0 } }).session(session);
    let payout = 0;
    for (const position of positions) {
      if (market.decision === "normal") {
        const perContract = Math.round(market.settlement * TP_SCALE);
        const proceeds = (position.direction === "long" ? perContract : 1000 * TP_SCALE - perContract) * position.remaining;
        position.realized += proceeds - collateral(position.direction, position.price, position.remaining);
        payout += proceeds;
      }
      position.remaining = 0;
      await position.save({ session });
    }
    const credited = market.decision === "void" ? account.allocated : account.cash + payout;
    if (market.decision === "normal") market.escrow -= payout;
    await ExchangeWallet.updateOne({ _id: account.userId }, { $inc: { available: credited } }, { session });
    account.releasedAt = now;
    account.credited = credited;
    account.cash = 0;
    await account.save({ session });
    await market.save({ session });
  });
}

async function decideWeeklyMarket(marketId, now) {
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    if (market.phase !== "scheduled") return market;
    const exam = await readWeeklyExam(market.examId, session);
    if (!await weeklyExamReady(exam, session) || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt) {
      return recordDecision(market, { decision: "void", reason: "정규 모의고사 또는 문제지가 취소되었습니다." }, null, session);
    }
    if (now < market.closeAt || !exam.settlementCompletedAt || exam.settlementCompletedAt > now) return market;
    if ((await pendingAttempts(exam, now, session)).length) return market;
    const [summary] = await liveAttemptRows(validAttempts(exam, now), session)
      .append({ $group: { _id: null, total: { $sum: "$score" }, count: { $sum: 1 } } });
    const bots = submittedBots(market, market.closeAt);
    const participantCount = (summary?.count ?? 0) + bots.length;
    const scoreTotal = (summary?.total ?? 0) + bots.reduce((sum, bot) => sum + bot.score, 0);
    const decision = participantCount ? { decision: "normal", settlement: Math.round(scoreTotal * 1000 / participantCount) / 100,
      participantCount, botParticipantCount: bots.length,
      settlementSource: market.botParticipation ? "주간 모의고사 채점 기록 및 공개 운영 봇 점수" : "맵쓰 주간 모의고사 채점 기록" }
      : { decision: "void", reason: "정산할 유효 응시가 없습니다." };
    return recordDecision(market, decision, null, session);
  });
}

async function processMarket(market, now = new Date()) {
  if (market.phase === "scheduled" && market.type === "weekly") {
    market = await decideWeeklyMarket(market._id, now);
  }
  if (market.phase === "scheduled" && now < market.closeAt) return;
  await expireOrders(market._id, now);
  if (await ExchangeOrder.exists({ marketId: market._id, status: "working" })) return;
  if (market.phase !== "settling") {
    await ExchangeMarket.updateOne({ _id: market._id, phase: "scheduled", closeAt: { $lte: now }, bookClosedAt: null },
      { $set: { bookClosedAt: now } });
    return;
  }

  const accounts = await ExchangeAccount.find({ marketId: market._id, releasedAt: null }).select("_id").limit(50).lean();
  for (const account of accounts) await settleAccount(market._id, account._id, now);

  await mongoose.connection.transaction(async (session) => {
    const current = await lockMarket(market._id, session);
    if (current.phase !== "settling" || await ExchangeAccount.exists({ marketId: current._id, releasedAt: null }).session(session)) return;
    if (current.decision === "normal" && current.escrow !== 0) throw new Error("Exchange settlement escrow does not reconcile");
    current.phase = current.decision === "void" ? "void" : "settled";
    current.escrow = 0;
    await current.save({ session });
  });
}

module.exports = { INITIAL_TP, TP_SCALE, collateral, ensureTradeAccess, placeOrder, cancelOrder, registerResult, voidMarket, processMarket, maintainMarketMaker, maintainFundedBotOrders, scheduleMarketLiquidity, stopMarketLiquidity, setMarketMakerEnabled, setPaused };

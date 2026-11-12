const mongoose = require("mongoose");
const { PrivateMockExamAttempt } = require("../models/matthsModel");
const {
  ExchangeMarket, ExchangeOrder, ExchangeWallet, ExchangeAccount, ExchangePosition, ExchangeTrade, ExchangeEvent,
} = require("../models/exchangeModel");
const { error, integer, seoulDate, readWeeklyExam, weeklyExamReady, validAttempts, publicState } = require("./exchangeMarketService");

const TP_SCALE = 100;
const INITIAL_TP = 2000 * TP_SCALE;
const MARKET_LIMIT = 5;

function collateral(direction, price, quantity) {
  return (direction === "long" ? price : 1000 - price) * TP_SCALE * quantity;
}

async function lockMarket(marketId, session) {
  const market = await ExchangeMarket.findByIdAndUpdate(marketId, { $inc: { revision: 1 } }, {
    session, returnDocument: "after",
  });
  if (!market) throw error(404, "선물시장을 찾을 수 없습니다.");
  return market;
}

async function ensureTradeAccess(market, userId, now, session) {
  if (publicState(market, now) !== "open") throw error(409, "주문을 접수할 수 없는 시장입니다.");
  if (market.type !== "weekly") return;
  const exam = await readWeeklyExam(market.examId, session);
  if (exam?.status !== "open" || now < exam.releaseAt || now >= exam.closeAt
    || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt || !await weeklyExamReady(exam, session)) {
    throw error(409, "공개된 주간 모의고사 문제지가 있어야 시장이 열립니다.");
  }
  if (!await PrivateMockExamAttempt.exists({ ...validAttempts(exam, now), userId }).session(session)) {
    throw error(403, "이번 주 모의고사를 완료하면 주문할 수 있습니다.");
  }
}

async function accountFor(marketId, userId, session) {
  return await ExchangeAccount.findOne({ marketId, userId }).session(session)
    || new ExchangeAccount({ marketId, userId });
}

async function reserve(market, order, session) {
  const account = await accountFor(market._id, order.userId, session);
  const amount = collateral(order.direction, order.price, order.quantity);
  await ExchangeWallet.updateOne({ _id: order.userId }, { $setOnInsert: { available: INITIAL_TP } },
    { session, upsert: true, setDefaultsOnInsert: false });
  if (account.cash < amount) {
    const difference = amount - account.cash;
    const debited = await ExchangeWallet.updateOne({ _id: order.userId, available: { $gte: difference } },
      { $inc: { available: -difference } }, { session });
    if (!debited.modifiedCount) throw error(409, "주문에 필요한 가용 TP가 부족합니다.");
    account.cash += difference;
    account.allocated += difference;
  }
  account.cash -= amount;
  await account.save({ session });
}

async function creditMarket(marketId, userId, amount, session) {
  if (!amount) return;
  const updated = await ExchangeAccount.updateOne({ marketId, userId }, { $inc: { cash: amount } }, { session });
  if (!updated.matchedCount) throw new Error("Exchange market account is missing");
}

async function checkPositionLimit(order, session) {
  const filter = { marketId: order.marketId, userId: order.userId };
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

async function applyFill(order, trade, session) {
  const { marketId, userId, direction } = order;
  const { price, quantity } = trade;
  const payout = collateral(direction, price, quantity);
  if (order.action === "open") {
    const improvement = collateral(direction, order.price, quantity) - payout;
    if (improvement < 0) throw new Error("Exchange fill exceeds reserved collateral");
    await creditMarket(marketId, userId, improvement, session);
    await new ExchangePosition({ marketId, userId, direction, price, quantity, remaining: quantity, tradeId: trade._id })
      .save({ session });
  } else {
    const positions = await ExchangePosition.find({ marketId, userId, direction, remaining: { $gt: 0 } })
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
    await creditMarket(marketId, userId, payout, session);
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

async function placeOrder({ marketId, userId, input, clock = () => new Date() }) {
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
    await ensureTradeAccess(market, userId, clock(), session);
    const order = new ExchangeOrder({ ...orderInput, marketId, userId, remaining: orderInput.quantity,
      status: "working", sequence: market.revision, acceptedAt: clock() });
    await checkPositionLimit(order, session);
    if (order.action === "open") await reserve(market, order, session);
    order.acceptedAt = clock();
    if (publicState(market, order.acceptedAt) !== "open") throw error(409, "시장 거래가 마감되었습니다.");
    await order.save({ session });

    const bid = order.side === "buy";
    while (order.remaining) {
      const maker = await ExchangeOrder.findOne({
        marketId, status: "working", side: bid ? "sell" : "buy",
        price: bid ? { $lte: order.price } : { $gte: order.price },
      }).sort({ price: bid ? 1 : -1, sequence: 1 }).session(session);
      if (!maker) break;
      if (String(maker.userId) === String(userId)) throw error(409, "자신의 반대 주문을 취소한 후 다시 시도해 주세요.");
      const tradedAt = clock();
      if (publicState(market, tradedAt) !== "open") throw error(409, "시장 거래가 마감되었습니다.");
      const trade = await new ExchangeTrade({
        marketId, makerOrderId: maker._id, takerOrderId: order._id,
        price: maker.price, quantity: Math.min(order.remaining, maker.remaining), tradedAt, sequence: market.volume + 1,
      }).save({ session });
      await applyFill(maker, trade, session);
      await applyFill(order, trade, session);
      const opens = Number(maker.action === "open") + Number(order.action === "open");
      market.escrow += (opens - 1) * 1000 * TP_SCALE * trade.quantity;
      market.lastPrice = trade.price;
      market.lastTradeAt = trade.tradedAt;
      market.volume += trade.quantity;
    }
    await market.save({ session });
    return order;
  });
}

async function cancel(order, session) {
  if (order.status !== "working") return;
  if (order.action === "open") {
    await creditMarket(order.marketId, order.userId, collateral(order.direction, order.price, order.remaining), session);
  }
  order.status = "cancelled";
  await order.save({ session });
}

async function cancelOrder({ orderId, userId }) {
  const found = await ExchangeOrder.findOne({ _id: orderId, userId }).select("marketId").lean();
  if (!found) throw error(404, "주문을 찾을 수 없습니다.");
  return mongoose.connection.transaction(async (session) => {
    await lockMarket(found.marketId, session);
    const order = await ExchangeOrder.findOne({ _id: orderId, userId }).session(session);
    await cancel(order, session);
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

async function decide(marketId, decision, actorId, now = new Date()) {
  return mongoose.connection.transaction(async (session) => {
    const market = await lockMarket(marketId, session);
    if (market.phase !== "scheduled") throw error(409, "정산 또는 취소 결정이 이미 등록되었습니다.");
    if (decision.decision === "normal" && now < market.closeAt) throw error(409, "거래 마감 뒤에만 정산할 수 있습니다.");
    market.set({ ...decision, phase: "settling", paused: true });
    await market.save({ session });
    await new ExchangeEvent({ marketId, actorId, action: decision.decision, detail: decision }).save({ session });
    return market;
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

async function processMarket(market, now = new Date()) {
  if (market.phase === "scheduled" && market.type === "weekly") {
    const exam = await readWeeklyExam(market.examId);
    if (!await weeklyExamReady(exam) || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt) {
      market = await decide(market._id, { decision: "void", reason: "정규 모의고사 또는 문제지가 취소되었습니다." }, null, now);
    } else if (now >= market.closeAt && exam.settlementCompletedAt) {
      const filter = validAttempts(exam, now);
      const pending = await PrivateMockExamAttempt.exists({ ...filter, integrityStatus: "PENDING_INTEGRITY_REVIEW" });
      if (!pending) {
        const [summary] = await PrivateMockExamAttempt.aggregate([
          { $match: filter }, { $group: { _id: null, average: { $avg: "$score" }, count: { $sum: 1 } } },
        ]);
        const result = summary ? { decision: "normal", settlement: Math.round(summary.average * 1000) / 100,
          participantCount: summary.count, settlementSource: "맵쓰 주간 모의고사 채점 기록" }
          : { decision: "void", reason: "정산할 유효 응시가 없습니다." };
        market = await decide(market._id, result, null, now);
      }
    }
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

module.exports = { INITIAL_TP, TP_SCALE, ensureTradeAccess, placeOrder, cancelOrder, registerResult, voidMarket, processMarket };

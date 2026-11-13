const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { WebSession } = require("../models/sessionModel");
const { serviceHostRedirectLocation } = require("../middleware/serviceHostRouting");
const { saveSchedule, saveMinimum, saveMpiMinimum, readMpiMinimum, syncWeeklyMarkets, seoulInput } = require("../services/exchangeMarketService");
const { EXCHANGE_WALLET_ID } = require("../services/exchangeFees");
const { dashboardState } = require("../services/exchangeDashboardService");
const { OPTIONS } = require("../services/exchangeChartService");
const { mpiState } = require("../services/exchangeMpiService");
const { terminalState, futuresChartHistory, runExchangeTick } = require("../services/exchangeService");
const { placeOrder, cancelOrder, registerResult, voidMarket, processMarket, maintainMarketMaker, scheduleMarketLiquidity, stopMarketLiquidity } = require("../services/exchangeTradingService");
const { ExchangeMarket, ExchangeWallet, ExchangeTrade, ExchangeTick, ExchangeMpiDemo, ExchangeOrder } = models;

const time = (value) => new Date(value);
const weekOpen = new Date();
weekOpen.setUTCDate(weekOpen.getUTCDate() + 7 - weekOpen.getUTCDay());
weekOpen.setUTCHours(6, 0, 0, 0);
const weekClose = new Date(+weekOpen + 141 * 60 * 60 * 1000);
const midweek = new Date(+weekOpen + (66 * 60 + 10) * 60 * 1000);
const points = [...Array(3).fill(2), ...Array(14).fill(3), ...Array(13).fill(4)];
const objectId = () => new mongoose.Types.ObjectId();

function order(market, userId, direction, price, quantity, at, options = {}) {
  return placeOrder({ marketId: market._id, userId, clock: () => at,
    input: { commandId: randomUUID(), action: "open", direction, price, quantity, ...options } });
}

async function testHttp() {
  process.env.SESSION_COOKIE_DOMAIN = "";
  const { server } = require("../server");
  const signature = require("cookie-signature");
  const http = await new Promise((resolve) => {
    const listener = server.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${http.address().port}`;
  const nextYear = new Date().getUTCFullYear() + 1;
  process.env.APP_BASE_URL = origin;
  process.env.PUBLIC_BASE_URL = origin;

  async function signedIn(role) {
    const user = await User.create({ name: `exchange-${role}`, role, email: `${role}@exchange.fixture.invalid`, passwordHash: "test" });
    const sid = randomUUID();
    await WebSession.create({ sid, expiresAt: new Date(Date.now() + 60_000), session: {
      cookie: { path: "/", httpOnly: true }, user: { id: String(user._id), role, tokenVersion: 0 },
    } });
    return `connect.sid=${encodeURIComponent("s:" + signature.sign(sid, process.env.SECRET))}`;
  }

  try {
    const student = await signedIn("student");
    const admin = await signedIn("admin");
    const response = await fetch(`${origin}/exchange`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /이번 주 시장이 아직 열리지 않았습니다/);
    assert.match(html, /value="long" disabled/);
    assert.doesNotMatch(html, /dashboard-sidebar/);
    assert.match(html, /href="\/exchange\/mpi"/);
    assert.match(html, /matths-exchange-header\.svg/);
    assert.match(html, /matths-exchange-header-light\.svg/);
    assert.match(html, /id="exchange-login" href="[^"]*\/login\?next=%2Fexchange"/);
    assert.match(html, /맵쓰로 돌아가기/);
    assert.match(html, /<fieldset class="order-fields" disabled>/);
    assert.doesNotMatch(html, /href="\/exchange\/dashboard"|로그아웃/);
    assert.match(html, /matths-exchange-x\.svg/);
    assert.doesNotMatch(html, /id="sample-price"/);
    const mpiResponse = await fetch(`${origin}/exchange/mpi`);
    assert.equal(mpiResponse.status, 200);
    const mpiHtml = await mpiResponse.text();
    assert.match(mpiHtml, /id="mpi-chart-heading">MPI 캔들/);
    assert.equal((mpiHtml.match(/<canvas\b/g) || []).length, 1);
    assert.doesNotMatch(mpiHtml, /시연|더미|공식 표본|mpi-demo-panel/);
    assert.match(mpiHtml, /회차가 공개되면 집계가 시작됩니다/);
    assert.match(mpiHtml, /제출 반영 기준 · KST/);
    assert.match(mpiHtml, /data-interval="1m"[^>]+aria-pressed="true"/);
    assert.match(mpiHtml, /id="exchange-theme-toggle"/);
    assert.match(mpiHtml, /id="exchange-login" href="[^"]*\/login\?next=%2Fexchange%2Fmpi"/);
    assert.doesNotMatch(mpiHtml, /data-mpi-source/);
    assert.deepEqual(OPTIONS.slice(0, 5).map((item) => item.code), ["1s", "15m", "1h", "4h", "3d"]);
    for (const { code } of OPTIONS) {
      assert.ok(mpiHtml.includes(`data-interval="${code}"`));
      assert.ok(html.includes(`data-interval="${code}"`));
    }
    assert.match(mpiHtml, /aria-label="차트 확대"/);
    assert.match(mpiHtml, /aria-label="가격축 자동 스케일"/);
    assert.equal((await fetch(`${origin}/api/exchange/mpi?before=0`)).status, 400);
    const guestDashboard = await fetch(`${origin}/exchange/dashboard`, { redirect: "manual" });
    assert.equal(guestDashboard.status, 200);
    assert.match(await guestDashboard.text(), /로그인하면 내 잔액과 주문, 포지션을 확인할 수 있습니다/);
    const guestPositions = await fetch(`${origin}/exchange/dashboard/positions`);
    assert.equal(guestPositions.status, 200);
    assert.doesNotMatch(await guestPositions.text(), /id="positions-heading"/);
    const dashboard = await fetch(`${origin}/exchange/dashboard`, { headers: { Cookie: student } });
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /aria-label="Exchange 월렛 메뉴"/);
    assert.match(dashboardHtml, /월렛 개요[\s\S]+2,000[\s\S]+현재 포지션/);
    assert.doesNotMatch(dashboardHtml, /id="positions-heading"|id="history-heading"/);
    for (const [section, heading] of [["positions", "positions-heading"], ["orders", "open-orders-heading"], ["history", "history-heading"]]) {
      const sectionResponse = await fetch(`${origin}/exchange/dashboard/${section}`, { headers: { Cookie: student } });
      assert.equal(sectionResponse.status, 200);
      const sectionHtml = await sectionResponse.text();
      assert.ok(sectionHtml.includes(`id="${heading}"`));
      assert.doesNotMatch(sectionHtml, /id="wallet-balance-title"/);
    }
    const feePath = "/exchange/dashboard/fees?wallet=exchange";
    assert.equal((await fetch(origin + feePath, { headers: { Cookie: student } })).status, 403);
    assert.equal((await fetch(origin + "/api/exchange/markets/current?wallet=exchange", { headers: { Cookie: student } })).status, 403);
    const fees = await fetch(origin + feePath, { headers: { Cookie: admin } });
    assert.equal(fees.status, 200);
    assert.match(await fees.text(), /Matths Exchange[\s\S]+누적 수수료[\s\S]+수수료 적립 내역/);
    const operatorFutures = await fetch(origin + "/exchange/futures?wallet=exchange", { headers: { Cookie: admin } });
    assert.equal(operatorFutures.status, 200);
    assert.match(await operatorFutures.text(), /data-wallet="exchange"[\s\S]+Matths Exchange · 가용 TP/);
    assert.match(dashboardHtml, /href="\/exchange\/dashboard" aria-current=page/);
    assert.match(dashboardHtml, /action="\/exchange\/logout" method="post"/);
    assert.match(dashboardHtml, /matths-exchange-x\.svg/);
    assert.match(dashboardHtml, /id="exchange-theme-toggle"/);
    assert.doesNotMatch(mpiHtml, /id="order-form"|id="asks"/);
    const unauthenticated = await fetch(`${origin}/api/exchange/markets/${objectId()}/orders`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await fetch(`${origin}/admin/exchange`, { headers: { Cookie: student } })).status, 403);


    const adminResponse = await fetch(`${origin}/admin/exchange?year=${nextYear}&grade=3`, { headers: { Cookie: admin } });
    assert.equal(adminResponse.status, 200);
    const adminHtml = await adminResponse.text();
    assert.match(adminHtml, /등록된 정규 시험이 없습니다/);
    assert.match(adminHtml, /matths-exchange-light\.svg/);
    assert.match(adminHtml, />10모<\/strong>[\s\S]+>수능<\/strong>/);
    assert.match(adminHtml, /name="minimumAttempts" value="0"/);
    assert.match(adminHtml, /name="minimumMpiAttempts" value="5"/);

    function postMpiMinimum(cookie, value) {
      return fetch(`${origin}/admin/exchange/mpi-minimum`, {
        method: "POST", redirect: "manual", headers: { Cookie: cookie, Origin: origin },
        body: new URLSearchParams({ minimumMpiAttempts: value }),
      });
    }
    assert.equal((await postMpiMinimum(student, "3")).status, 403);
    assert.equal((await postMpiMinimum(admin, "0")).status, 400);
    assert.equal((await postMpiMinimum(admin, "3")).status, 400);
    assert.equal((await postMpiMinimum(admin, "6")).status, 303);
    assert.equal(await readMpiMinimum(), 6);
    assert.equal((await postMpiMinimum(admin, "5")).status, 303);

    const registered = await fetch(`${origin}/admin/exchange/schedules`, {
      method: "POST", redirect: "manual", headers: { Cookie: admin, Origin: origin },
      body: new URLSearchParams({ year: nextYear, grade: "3", round: "csat",
        examDate: `${nextYear}-11-18`, closeAt: `${nextYear}-11-21T12:00` }),
    });
    assert.equal(registered.status, 303);
    const csat = await ExchangeMarket.findOne({ key: `${nextYear}:3:csat` });
    assert.equal(seoulInput(csat.opensAt), `${nextYear}-11-18T16:00`);
    const blocked = await fetch(`${origin}/api/exchange/markets/${csat._id}/orders`, {
      method: "POST", headers: { Cookie: student, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", direction: "long", price: 650, quantity: 1, commandId: randomUUID() }),
    });
    assert.equal(blocked.status, 409);
    const routeNow = Date.now();
    await ExchangeMarket.updateOne({ _id: csat._id }, {
      $set: { opensAt: new Date(routeNow - 60_000), closeAt: new Date(routeNow + 60_000) },
    });
    const adminWalletOrders = `${origin}/api/exchange/markets/${csat._id}/orders?wallet=exchange`;
    const orderBody = { action: "open", direction: "long", price: 1, quantity: 1, commandId: randomUUID() };
    function postOrder(cookie) {
      return fetch(adminWalletOrders, {
        method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(orderBody),
      });
    }
    assert.equal((await postOrder(student)).status, 403);
    assert.equal((await postOrder(admin)).status, 409, "Operations wallet cannot use the student signup credit");
    await ExchangeWallet.updateOne({ _id: EXCHANGE_WALLET_ID }, { $set: { available: 150 } }, { upsert: true });
    const posted = await postOrder(admin);
    assert.equal(posted.status, 200);
    const postedOrder = await posted.json();
    const cancelUrl = `${origin}/api/exchange/orders/${postedOrder.id}/cancel?wallet=exchange`;
    const operatorCancel = await fetch(cancelUrl, { method: "POST", headers: { Cookie: admin, Origin: origin } });
    assert.equal(operatorCancel.status, 200);
    const auditedOrder = await models.ExchangeOrder.findById(postedOrder.id);
    assert.equal(String(auditedOrder.userId), EXCHANGE_WALLET_ID);
    assert.ok(auditedOrder.actorId.equals(auditedOrder.cancelledBy));
    await models.ExchangeOrder.deleteOne({ _id: postedOrder.id });
    await models.ExchangeAccount.deleteOne({ marketId: csat._id, userId: EXCHANGE_WALLET_ID });
    await ExchangeWallet.deleteOne({ _id: EXCHANGE_WALLET_ID });
    await ExchangeMarket.deleteOne({ _id: csat._id });
    const logout = await fetch(`${origin}/exchange/logout`, {
      method: "POST", headers: { Origin: origin, Cookie: student }, redirect: "manual",
    });
    assert.equal(logout.status, 302);
    assert.equal(logout.headers.get("location"), "/exchange/futures");
    assert.match(logout.headers.get("set-cookie"), /connect\.sid=;/);
    assert.match(await (await fetch(`${origin}/exchange/futures`, { headers: { Cookie: student } })).text(), /id="exchange-login"/);
  } finally {
    await new Promise((resolve) => http.close(resolve));
  }
}

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([...Object.values(models), User, WebSession, ArchiveItem, PrivateMockExam, PrivateMockExamAttempt].map((model) => model.init()));
    assert.equal(serviceHostRedirectLocation({ hostname: "app.matths.kr", originalUrl: "/exchange",
      environment: { NODE_ENV: "production", EXCHANGE_BASE_URL: "https://exchange.matths.kr" } }), "https://exchange.matths.kr/");
    await runExchangeTick(midweek);
    assert.equal(await ExchangeMarket.countDocuments(), 0, "No weekly upload must create zero markets");
    assert.equal((await terminalState({ now: midweek })).market, null);
    await testHttp();

    const admin = objectId();
    const exam = await PrivateMockExam.create({
      title: "Matths Exchange Test", weekKey: seoulInput(weekOpen).slice(0, 10), formCode: "WEEKLY", attemptNumber: 1, status: "open",
      releaseAt: weekOpen, closeAt: weekClose, aggregationStartsAt: weekClose, rankingPublishesAt: weekClose,
      archiveAt: weekClose, reviewPublishesAt: weekClose, questionCount: points.length, points, answerKey: points.map(() => "1"),
      archiveItemId: objectId(), createdBy: admin,
    });
    await syncWeeklyMarkets(midweek);
    assert.equal(await ExchangeMarket.countDocuments(), 0, "Missing uploaded asset must not open a market");

    await ArchiveItem.create({ _id: exam.archiveItemId, title: "테스트 문제지", storedName: "exchange-test.pdf", originalName: "fixture.pdf",
      mimeType: "application/pdf", sizeBytes: 100, uploadedBy: admin, storageProvider: "R2", r2ObjectKey: "audit/fixture.pdf", isPublished: false });
    await saveMinimum({ value: 1, actorId: admin });
    await syncWeeklyMarkets(midweek);
    let weekly = await ExchangeMarket.findOne({ examId: exam._id });
    assert.equal((await terminalState({ marketId: String(weekly._id), now: midweek })).market.status, "waiting");
    await assert.rejects(order(weekly, admin, "long", 650, 1, midweek), { status: 409 });

    await saveMinimum({ marketId: weekly._id, value: 0, actorId: admin });
    await syncWeeklyMarkets(midweek);
    weekly = await ExchangeMarket.findById(weekly._id);
    assert.equal((await terminalState({ marketId: String(weekly._id), now: midweek })).market.status, "open");
    await assert.rejects(order(weekly, admin, "long", 650, 1, midweek), { status: 403 });

    await runExchangeTick(midweek, false);
    assert.equal(await ExchangeTick.countDocuments(), 0);
    assert.equal((await mpiState({ marketId: weekly._id, now: midweek })).latest, null);
    const students = await User.create(Array.from({ length: 8 }, (_, index) => ({
      name: `exchange-live-${index}`, email: `exchange-live-${index}@exchange.fixture.invalid`,
      role: "student", passwordHash: "test",
    })));
    const [buyer, seller, nextBuyer, fourth, fifth, late, invalid, excluded] = students.map((student) => student._id);
    const cohort = [buyer, seller, nextBuyer];
    function attempt(userId, score, extra = {}) {
      return PrivateMockExamAttempt.create({ examId: exam._id, userId, weekKey: exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
        status: "submitted", submittedAt: new Date(+midweek - 1000), score,
        submissionFinalization: { status: "completed" }, ...extra });
    }
    await Promise.all(cohort.map((userId, i) => attempt(userId, [70, 60, 80][i])));
    await ArchiveItem.updateOne({ _id: exam.archiveItemId }, { $set: { deletedAt: midweek } });
    assert.equal((await terminalState({ now: midweek })).market, null);
    await assert.rejects(order(weekly, buyer, "long", 650, 1, midweek), { status: 409 });
    await ArchiveItem.updateOne({ _id: exam.archiveItemId }, { $set: { deletedAt: null } });
    await attempt(excluded, 0, { demoBatchKey: "fixture" });
    await User.updateOne({ _id: excluded }, { $set: { isTestAccount: true } });
    await assert.rejects(order(weekly, excluded, "long", 650, 1, midweek), { status: 403 });
    await runExchangeTick(new Date(+midweek + 60_000), false);
    assert.equal(await ExchangeTick.countDocuments(), 0);
    await Promise.all([attempt(fourth, 70), attempt(fifth, 70)]);
    await ExchangeMpiDemo.create({ _id: weekly._id, examId: exam._id, startedAt: midweek, expiresAt: weekClose,
      attempts: [{ accountKey: "old-simulation", score: 100, exchangeMmrGrade: 1, offsetSeconds: 0 }] });
    await ExchangeTick.create({ marketId: weekly._id, sampledAt: midweek, publishAt: midweek, mpi: 999, populationCount: 90 });
    const collectedAt = new Date(+midweek + 120_000);
    const publicAt = new Date(+collectedAt + 30 * 60_000);
    await runExchangeTick(collectedAt, false);
    const early = new Date(+publicAt - 1);
    await maintainMarketMaker(weekly._id, () => early);
    assert.equal((await mpiState({ marketId: weekly._id, now: early })).latest, null);
    const unpublished = await terminalState({ marketId: String(weekly._id), now: early });
    assert.deepEqual(unpublished.ticks, []);
    assert.equal(unpublished.bids.length, 0);
    assert.equal(unpublished.asks.length, 0);
    assert.equal(unpublished.market.internalMpi, undefined);
    const published = await mpiState({ marketId: weekly._id, now: publicAt });
    assert.equal(published.source, "official");
    assert.equal(published.latest.mpi, 700);
    assert.equal(published.latest.populationCount, 5);
    assert.equal(+published.latest.publishAt - +published.latest.dataCutoffAt, 30 * 60_000);
    assert.equal(published.latest.contributions, undefined);
    assert.equal(published.candles.at(-1).close, 700);
    assert.equal((await mpiState({ marketId: weekly._id, now: publicAt, before: publicAt })).candles.length, 0);

    const sell = await order(weekly, seller, "short", 640, 2, midweek);
    const commandId = randomUUID();
    const buy = await order(weekly, buyer, "long", 650, 1, midweek, { commandId });
    const replay = await order(weekly, buyer, "long", 650, 1, midweek, { commandId });
    assert.equal(String(replay._id), String(buy._id));
    assert.equal(buy.status, "filled");
    const sellerDashboard = await dashboardState(seller, midweek);
    assert.equal(sellerDashboard.available, 1279.74);
    assert.equal(sellerDashboard.positionCollateral, 360);
    assert.equal(sellerDashboard.reserved, 360.13);
    assert.equal(sellerDashboard.total, 1999.87);
    assert.equal(sellerDashboard.positions[0].notional, 640);
    assert.equal(sellerDashboard.orders[0].remaining, 1);
    assert.equal((await dashboardState(objectId(), midweek)).positions.length, 0);
    assert.equal(await ExchangeTrade.countDocuments(), 1);
    assert.equal((await ExchangeMarket.findById(weekly._id)).lastPrice, 640);
    const firstTrade = await ExchangeTrade.findOne({ marketId: weekly._id });
    assert.deepEqual([firstTrade.makerFee, firstTrade.takerFee], [13, 32]);
    let feeWallet = await dashboardState(EXCHANGE_WALLET_ID, midweek, { section: "fees" });
    assert.equal(feeWallet.available, 0.45);
    assert.equal(feeWallet.collectedFees, 0.45);
    assert.equal(feeWallet.feeTrades.length, 1);
    assert.equal(feeWallet.feeTrades[0].total, 0.45);
    const cancelled = await cancelOrder({ orderId: sell._id, userId: seller });
    assert.equal(cancelled.feeReserved, 0);
    assert.equal((await dashboardState(seller, midweek)).available, 1279.87);
    await order(weekly, nextBuyer, "long", 680, 1, midweek);
    await order(weekly, buyer, "long", 680, 1, midweek, { action: "close" });
    const view = await terminalState({ marketId: String(weekly._id), userId: buyer, now: midweek });
    assert.deepEqual(view.candles.map((row) => [row.open, row.high, row.low, row.close, row.volume]), [[640, 680, 640, 680, 2]]);
    assert.equal(view.own.positions[0].realized, 40);
    const buyerDashboard = await dashboardState(buyer, midweek);
    assert.equal(buyerDashboard.positions.length, 0);
    assert.equal(buyerDashboard.history[0].status, "청산 완료");
    assert.equal(buyerDashboard.history[0].realized, 40);
    assert.equal(buyerDashboard.total, 2039.34);
    feeWallet = await dashboardState(EXCHANGE_WALLET_ID, midweek, { section: "fees" });
    assert.equal(feeWallet.available, 0.93);
    assert.equal(feeWallet.collectedFees, 0.93);
    const tradeCandles = await terminalState({ marketId: String(weekly._id), interval: "1s", now: midweek });
    assert.deepEqual(tradeCandles.candles.map((row) => [row.open, row.high, row.low, row.close]), [[640, 680, 640, 680]]);
    const priorTrades = await futuresChartHistory(weekly._id, "1s", new Date(+midweek + 1000), midweek);
    assert.deepEqual(priorTrades, tradeCandles.candles);
    assert.deepEqual(await futuresChartHistory(weekly._id, "1s", midweek, midweek), []);
    await assert.rejects(order(weekly, nextBuyer, "long", 650, 1, weekClose), { status: 409 });

    await runExchangeTick(publicAt);
    const mm = await terminalState({ marketId: String(weekly._id), now: publicAt });
    assert.deepEqual(mm.reference, { price: 700 });
    assert.deepEqual(mm.asks[0], { price: 718, quantity: 1 });
    assert.deepEqual(mm.bids[0], { price: 682, quantity: 1 });
    assert.equal(mm.market.volume, 2);
    const mmFill = await order(weekly, fourth, "long", mm.asks[0].price, 1, publicAt);
    assert.equal(mmFill.status, "filled");
    await maintainMarketMaker(weekly._id, () => publicAt);
    assert.equal(await ExchangeOrder.countDocuments({ liquidityProvider: "matths", status: "working", action: "open" }), 0);
    assert.equal(await ExchangeTrade.countDocuments({ liquidityProvider: "matths" }), 1);
    const oneSided = await terminalState({ marketId: String(weekly._id), now: publicAt });
    assert.equal(oneSided.reference.price, null);
    assert.deepEqual(oneSided.bids[0], { price: 686, quantity: 1 });
    const expiry = new Date(+publicAt + 21_000);
    assert.equal((await terminalState({ marketId: String(weekly._id), now: expiry })).bids.length, 0);

    const lateAttempt = await attempt(late, 100, { submittedAt: new Date(+weekClose - 1000),
      integrityStatus: "PENDING_INTEGRITY_REVIEW", submissionFinalization: { status: "pending" } });
    await attempt(invalid, 0, { submittedAt: new Date(+weekClose - 1000), integrityStatus: "INVALIDATED" });
    await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "locked", settlementCompletedAt: weekClose } });
    await processMarket(await ExchangeMarket.findById(weekly._id), weekClose);
    assert.equal((await ExchangeMarket.findById(weekly._id)).phase, "scheduled");
    await PrivateMockExamAttempt.updateOne({ _id: lateAttempt._id }, { $set: { "submissionFinalization.status": "completed" } });
    await processMarket(await ExchangeMarket.findById(weekly._id), new Date(+weekClose + 30_000));
    assert.equal((await ExchangeMarket.findById(weekly._id)).phase, "scheduled");
    await PrivateMockExamAttempt.updateOne({ _id: lateAttempt._id }, { $set: { integrityStatus: "CLEAR" } });
    await processMarket(await ExchangeMarket.findById(weekly._id), new Date(+weekClose + 60_000));
    await processMarket(await ExchangeMarket.findById(weekly._id), new Date(+weekClose + 60_000));
    const result = await ExchangeMarket.findById(weekly._id);
    assert.equal(result.phase, "settled");
    assert.equal(result.settlement, 750);
    assert.equal(result.participantCount, 6);
    assert.equal(result.escrow, 0);
    const balances = await Promise.all(cohort.map((userId) => ExchangeWallet.findById(userId)));
    assert.deepEqual(balances.map((wallet) => wallet.available / 100), [2039.34, 1889.87, 2069.86]);
    assert.equal((await ExchangeWallet.findById(result.marketMakerId)).available / 100, 1968);

    const externalInput = { year: "2026", grade: "1", round: "3", examDate: "2026-03-26", closeAt: "2026-03-30T20:00",
      settlementSource: "회차별 성적 집계", population: "고1 응시자", count2: "3", count3: "14", count4: "13" };
    const external = await saveSchedule(externalInput, admin, time("2026-03-01T00:00:00Z"));
    assert.equal(seoulInput(external.opensAt), "2026-03-26T12:10");
    await assert.rejects(order(external, admin, "long", 600, 1, time("2026-03-26T03:09:59Z")), { status: 409 });
    const open = time("2026-03-26T03:10:00Z");
    await order(external, buyer, "long", 600, 1, open);
    await order(external, seller, "short", 600, 1, open);
    const end = time("2026-03-30T11:00:00Z");
    await registerResult({ marketId: external._id, input: { average: "65.125", resultUrl: "https://example.test/scores",
      publishedAt: "2026-03-30T19:30" }, actorId: admin, now: end });
    await processMarket(await ExchangeMarket.findById(external._id), end);
    assert.equal((await ExchangeMarket.findById(external._id)).settlement, 651.25);
    assert.equal((await ExchangeWallet.findById(buyer)).available, 209047);

    const other = await saveSchedule({ ...externalInput, grade: "2" }, admin, time("2026-03-01T00:00:00Z"));
    await order(other, buyer, "long", 650, 1, open);
    await order(other, seller, "short", 650, 1, open);
    await voidMarket(other._id, admin, "테스트 취소");
    await processMarket(await ExchangeMarket.findById(other._id), end);
    assert.equal((await ExchangeMarket.findById(other._id)).phase, "void");
    assert.equal((await ExchangeWallet.findById(buyer)).available, 209034);
    feeWallet = await dashboardState(EXCHANGE_WALLET_ID, end, { section: "fees" });
    assert.equal(feeWallet.available, 2.17);
    assert.equal(feeWallet.collectedFees, 2.17);
    const ops = await saveSchedule({ ...externalInput, grade: "3", round: "3" }, admin, time("2026-03-01T00:00:00Z"));
    const input = { action: "open", direction: "long", price: 1, quantity: 1, commandId: randomUUID() };
    await assert.rejects(placeOrder({ marketId: ops._id, userId: EXCHANGE_WALLET_ID, clock: () => open, input }), { status: 403 });
    const operationsOrder = await placeOrder({
      marketId: ops._id, userId: EXCHANGE_WALLET_ID, actorId: admin, clock: () => open, input,
    });
    assert.equal(String(operationsOrder.actorId), String(admin));
    await order(ops, seller, "short", 1, 1, open);
    feeWallet = await dashboardState(EXCHANGE_WALLET_ID, open, { section: "fees" });
    assert.equal(feeWallet.available, 1.17);
    assert.equal(feeWallet.collectedFees, 2.17);
    assert.equal(feeWallet.positionCollateral, 1);
    assert.equal(feeWallet.positions.length, 1);
    assert.equal(feeWallet.total, 2.17);
    const edge = await saveSchedule({ ...externalInput, grade: "3", round: "5" }, admin, time("2026-03-01T00:00:00Z"));
    await order(edge, seller, "short", 400, 1, open);
    await order(edge, buyer, "long", 400, 1, open);
    const buyerBeforeClose = await ExchangeWallet.findById(buyer);
    await ExchangeWallet.updateOne({ _id: buyer }, { $set: { available: 0 } });
    await order(edge, nextBuyer, "long", 500, 1, open);
    const closeWithoutCash = await order(edge, buyer, "long", 500, 1, open, { action: "close" });
    assert.equal(closeWithoutCash.feesPaid, 25);
    assert.equal((await dashboardState(buyer, open)).marketCash, 499.75);
    await ExchangeWallet.updateOne({ _id: buyer }, { $set: { available: buyerBeforeClose.available } });
    const legacySeller = objectId();
    const legacyOrder = await order(edge, legacySeller, "short", 600, 1, open);
    await models.ExchangeOrder.updateOne({ _id: legacyOrder._id }, { $unset: { feeReserved: "" } });
    await ExchangeWallet.updateOne({ _id: legacySeller }, { $inc: { available: legacyOrder.feeReserved } });
    await order(edge, nextBuyer, "long", 600, 1, open);
    const legacyFill = await ExchangeTrade.findOne({ makerOrderId: legacyOrder._id });
    assert.deepEqual([legacyFill.makerFee, legacyFill.takerFee], [0, 30]);
    // Use another order book with no published MPI and a genuine student counterparty.
    await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "open" } });
    const liquidityMarket = await ExchangeMarket.create({
      key: "weekly:scheduled-liquidity-audit", type: "weekly", examId: exam._id, title: "Scheduled liquidity",
      opensAt: weekOpen, openedAt: weekOpen, closeAt: weekClose,
    });
    const operator = await User.create({ name: "exchange-operator", email: "operator@exchange.fixture.invalid",
      passwordHash: "unused", role: "admin" });
    const startsAt = new Date(+midweek + 60_000);
    const endsAt = new Date(+startsAt + 60 * 60_000);
    const plan = { startsAt: seoulInput(startsAt), endsAt: seoulInput(endsAt), referencePrice: 600, reason: "scheduled liquidity audit" };
    await assert.rejects(scheduleMarketLiquidity(liquidityMarket._id, plan, buyer, () => midweek), { status: 403 });
    await scheduleMarketLiquidity(liquidityMarket._id, plan, operator._id, () => midweek);
    await maintainMarketMaker(liquidityMarket._id, () => midweek);
    const viewAt = (now) => terminalState({ marketId: String(liquidityMarket._id), now });
    assert.equal((await viewAt(midweek)).bids.length, 0);

    await maintainMarketMaker(liquidityMarket._id, () => startsAt);
    const quoted = await viewAt(startsAt);
    assert.deepEqual(quoted.bids, [{ price: 560, quantity: 1 }]);
    assert.deepEqual(quoted.asks, [{ price: 640, quantity: 1 }]);
    assert.deepEqual(quoted.reference, { price: 600 });
    assert.ok(quoted.references.length > 0);
    assert.ok(quoted.references.every((row) => !("source" in row)));
    assert.deepEqual(quoted.ticks, []);
    assert.equal(quoted.market.lastPrice, null);
    assert.equal(quoted.market.volume, 0);
    await order(liquidityMarket, buyer, "long", 640, 1, startsAt);
    await maintainMarketMaker(liquidityMarket._id, () => startsAt);
    const filled = await viewAt(startsAt);
    assert.equal(filled.market.volume, 1);
    assert.equal(filled.market.lastPrice, 640);
    assert.deepEqual(Object.keys(filled.trades[0]).sort(), ["price", "quantity", "tradedAt"]);
    assert.equal(await ExchangeTrade.countDocuments({ marketId: liquidityMarket._id, liquidityProvider: "matths" }), 1);
    assert.equal(filled.asks.length, 0);
    assert.deepEqual(filled.bids[0], { price: 564, quantity: 1 });

    // Editing the plan or restarting the worker cannot replenish its opening limit.
    await scheduleMarketLiquidity(liquidityMarket._id, { ...plan, referencePrice: 610 }, operator._id, () => startsAt);
    await assert.rejects(stopMarketLiquidity(liquidityMarket._id, buyer, () => startsAt), { status: 403 });
    await stopMarketLiquidity(liquidityMarket._id, operator._id, () => startsAt);
    const stopEndsAt = new Date(+startsAt + 5 * 60_000);
    const nearEnd = new Date(+stopEndsAt - 1_000);
    await maintainMarketMaker(liquidityMarket._id, () => nearEnd);
    assert.equal((await viewAt(nearEnd)).asks.length, 0);
    assert.equal((await viewAt(nearEnd)).bids.length, 1);
    assert.equal((await viewAt(stopEndsAt)).bids.length, 0);
    assert.equal((await order(liquidityMarket, fifth, "short", 570, 1, stopEndsAt)).status, "working");
    assert.equal((await viewAt(stopEndsAt)).market.volume, 1);

    console.log("Exchange verified: delayed official MPI, legacy and demo exclusion, MM quotes and scheduled live liquidity, verification wait, fees, wallets and settlement.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { WebSession } = require("../models/sessionModel");
const { serviceHostRedirectLocation } = require("../middleware/serviceHostRouting");
const { saveSchedule, saveMinimum, saveMpiMinimum, readMpiMinimum, syncWeeklyMarkets, seoulInput, calculateSample } = require("../services/exchangeMarketService");
const { dashboardState } = require("../services/exchangeDashboardService");
const { OPTIONS } = require("../services/exchangeChartService");
const { mpiState, startMpiDemo } = require("../services/exchangeMpiService");
const { terminalState, futuresChartHistory, runExchangeTick } = require("../services/exchangeService");
const { placeOrder, cancelOrder, registerResult, voidMarket, processMarket } = require("../services/exchangeTradingService");
const { ExchangeMarket, ExchangeWallet, ExchangeTrade, ExchangeTick, ExchangeMpiDemo } = models;

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
    assert.match(html, /href="\/exchange\/dashboard"[\s\S]*id="exchange-theme-toggle"/);
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
    assert.match(mpiHtml, /href="\/exchange\/dashboard"/);
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
    assert.equal(guestDashboard.status, 302);
    const dashboard = await fetch(`${origin}/exchange/dashboard`, { headers: { Cookie: student } });
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /Exchange 대시보드[\s\S]+2,000 TP[\s\S]+현재 포지션[\s\S]+포지션 히스토리/);
    assert.match(dashboardHtml, /href="\/exchange\/dashboard" aria-current=page/);
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
    assert.match(adminHtml, /name="minimumMpiAttempts" value="1"/);

    function postMpiMinimum(cookie, value) {
      return fetch(`${origin}/admin/exchange/mpi-minimum`, {
        method: "POST", redirect: "manual", headers: { Cookie: cookie, Origin: origin },
        body: new URLSearchParams({ minimumMpiAttempts: value }),
      });
    }
    assert.equal((await postMpiMinimum(student, "3")).status, 403);
    assert.equal((await postMpiMinimum(admin, "0")).status, 400);
    assert.equal((await postMpiMinimum(admin, "3")).status, 303);
    assert.equal(await readMpiMinimum(), 3);
    assert.equal((await postMpiMinimum(admin, "1")).status, 303);

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
    await ExchangeMarket.deleteOne({ _id: csat._id });
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
    const weighted = calculateSample([
      ...Array.from({ length: 15 }, () => ({ exchangeMmrGrade: 1, score: 80 })),
      ...Array.from({ length: 5 }, () => ({ exchangeMmrGrade: 5, score: 20 })),
    ], () => 0);
    assert.deepEqual(weighted, { mpi: 650, populationCount: 20, sampleCount: 3 });

    const demo = await startMpiDemo({ marketId: weekly._id, examId: exam._id, actorId: admin, now: midweek });
    assert.equal(demo.attempts.length, 90);
    assert.equal(await PrivateMockExamAttempt.countDocuments({ examId: exam._id }), 0);
    assert.equal(await ExchangeTick.countDocuments(), 0);
    assert.equal(await ExchangeTrade.countDocuments(), 0);
    const sampleNow = new Date(+midweek + 50_000);
    const demoState = await mpiState({ marketId: weekly._id, interval: "1s", now: sampleNow });
    assert.equal(demoState.source, "test");
    assert.equal(demoState.latest.populationCount, 90);
    assert.equal(+demoState.latest.sampledAt, +demoState.latest.dataCutoffAt);
    assert.ok(new Set(demoState.candles.map((candle) => candle.close)).size > 10);
    assert.ok(demoState.candles.some((row) => row.open !== row.close));
    demoState.candles.slice(1).forEach((row, index) => {
      assert.equal(row.open, demoState.candles[index].close);
      assert.equal(row.high, Math.max(row.open, row.close));
      assert.equal(row.low, Math.min(row.open, row.close));
    });
    const liveNow = new Date(+midweek + 250_000);
    const recent = await mpiState({ marketId: weekly._id, interval: "1s", now: liveNow });
    assert.equal(recent.source, "test");
    const before = new Date(recent.candles[0]._id);
    const earlier = await mpiState({ marketId: weekly._id, interval: "1s", before, now: liveNow });
    assert.equal(earlier.candles.length, 120);
    assert.equal(earlier.candles.at(-1)._id + 1000, recent.candles[0]._id);
    assert.equal(earlier.candles.at(-1).close, recent.candles[0].open);
    const larger = await mpiState({ marketId: weekly._id, interval: "15m", now: sampleNow });
    assert.equal(larger.candles.length, 1);
    assert.equal(larger.candles[0].open, demoState.candles[0].open);
    assert.equal(larger.candles[0].close, demoState.latest.mpi);
    assert.equal(larger.candles[0].high, Math.max(...demoState.candles.map((row) => row.high)));
    assert.equal(larger.candles[0].low, Math.min(...demoState.candles.map((row) => row.low)));
    const day = await mpiState({ marketId: weekly._id, interval: "3d", now: sampleNow });
    assert.equal(day.interval, "3d");
    assert.equal(day.candles.at(-1).close, demoState.latest.mpi);
    const [buyer, seller, nextBuyer] = [objectId(), objectId(), objectId()];
    const cohort = [buyer, seller, nextBuyer];
    await PrivateMockExamAttempt.create(cohort.map((userId, index) => ({
      userId, examId: exam._id, weekKey: exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
      status: "submitted", submittedAt: new Date(+midweek - 1000), score: [70, 60, 80][index],
      exchangeMmrGrade: index + 1, submissionFinalization: { status: "completed" },
    })));
    await ArchiveItem.updateOne({ _id: exam.archiveItemId }, { $set: { deletedAt: midweek } });
    assert.equal((await terminalState({ now: midweek })).market, null);
    await assert.rejects(order(weekly, buyer, "long", 650, 1, midweek), { status: 409 });
    await ArchiveItem.updateOne({ _id: exam.archiveItemId }, { $set: { deletedAt: null } });

    await ExchangeTick.create({
      marketId: weekly._id, mpi: 999, populationCount: 10, sampleCount: 1,
      sampledAt: new Date(+midweek - 29 * 60_000), publishAt: new Date(+midweek + 60_000),
      expiresAt: new Date(+weekClose + 60_000),
    });
    const firstMinute = new Date(+midweek + 60_000);
    const secondMinute = new Date(+firstMinute + 60_000);
    const thirdMinute = new Date(+secondMinute + 60_000);
    const legacyHistoryAt = new Date(+midweek - 1000);
    const rollingHistoryAt = new Date(+firstMinute - 1000);
    await ExchangeTick.create([
      { mpi: 640, sampledAt: new Date(+legacyHistoryAt - 30 * 60_000), publishAt: legacyHistoryAt },
      { mpi: 660, sampledAt: rollingHistoryAt, publishAt: rollingHistoryAt, dataCutoffAt: new Date(+rollingHistoryAt - 30 * 60_000) },
      { mpi: 998, sampledAt: new Date(+firstMinute + 1000), publishAt: new Date(+firstMinute + 1000),
        dataCutoffAt: new Date(+firstMinute + 1000 - 30 * 60_000) },
    ].map((tick) => ({ ...tick, marketId: weekly._id, populationCount: 10, sampleCount: 1, expiresAt: weekClose })));

    function attempt(fields) {
      return PrivateMockExamAttempt.create({ userId: objectId(), examId: exam._id, weekKey: exam.weekKey,
        formCode: "WEEKLY", attemptNumber: 1, status: "submitted", ...fields });
    }

    const pending = await attempt({
      submittedAt: new Date(+firstMinute - 20_000), score: 100, exchangeMmrGrade: 4,
      submissionFinalization: { status: "pending" },
    });
    const afterCutoff = await attempt({
      submittedAt: new Date(+firstMinute + 1000), score: 90, exchangeMmrGrade: 5,
      submissionFinalization: { status: "completed", completedAt: new Date(+firstMinute + 2000) },
    });
    const underReview = await attempt({
      submittedAt: new Date(+firstMinute - 1000), score: 70, exchangeMmrGrade: 6,
      integrityStatus: "PENDING_INTEGRITY_REVIEW",
    });

    const collectedAt = new Date(+firstMinute + 2000);
    assert.equal(seoulInput(firstMinute).slice(-5), "09:11");
    await Promise.all([runExchangeTick(collectedAt, false), runExchangeTick(collectedAt, false)]);
    const combined = await mpiState({ marketId: weekly._id, now: collectedAt });
    assert.equal(combined.source, "test");
    assert.equal(combined.interval, "1m");
    assert.equal(combined.minimumMpiAttempts, 1);
    assert.equal(combined.latest.populationCount, 93);
    assert.equal(combined.latest.sampleCount, 12);
    assert.equal(+combined.latest.dataCutoffAt, +firstMinute);
    assert.equal(+combined.startedAt, +demo.startedAt);
    assert.equal(combined.candles.at(-1).close, combined.latest.mpi);
    assert.ok(!("demo" in combined) && !("attempts" in combined));
    assert.equal(await ExchangeTick.countDocuments({ minuteSample: true }), 1);

    const raw = (await terminalState({ marketId: String(weekly._id), now: collectedAt })).ticks.at(-1);
    assert.equal(raw.populationCount, 3);
    assert.equal(raw.mpi, 700);
    assert.equal(+raw.sampledAt, +collectedAt);
    assert.equal(+raw.publishAt, +collectedAt);

    await saveMpiMinimum({ marketId: weekly._id, value: "4", actorId: admin, now: collectedAt });
    assert.equal(await readMpiMinimum(), 1);
    const gated = await mpiState({ marketId: weekly._id, now: collectedAt });
    assert.equal(gated.market.status, "open");
    assert.equal(gated.source, "test");
    assert.equal(gated.minimumMpiAttempts, 4);
    assert.equal(gated.latest.populationCount, 90);
    assert.equal(combined.latest.mpi, Math.round((gated.latest.mpi * 90 + raw.mpi * 3) / 93 * 100) / 100);
    assert.notEqual(combined.latest.mpi, gated.latest.mpi);
    assert.deepEqual((await terminalState({ marketId: String(weekly._id), now: collectedAt })).ticks, []);

    await runExchangeTick(secondMinute, false);
    const published = await mpiState({ marketId: weekly._id, interval: "1s", now: secondMinute });
    assert.equal(published.source, "test");
    assert.equal(published.latest.populationCount, 94);
    assert.equal(published.latest.sampleCount, 13);
    assert.equal(published.candles.at(-1).close, published.latest.mpi);
    const historyBeforePublication = await mpiState({
      marketId: weekly._id, interval: "1s", before: secondMinute, now: secondMinute,
    });
    assert.equal(historyBeforePublication.latest.populationCount, 100, "Earlier qualifying tick is used for history");
    assert.ok(historyBeforePublication.candles.at(-1)._id < +secondMinute);
    const visibleTicks = (await terminalState({ marketId: String(weekly._id), now: secondMinute })).ticks;
    assert.equal(visibleTicks.at(-1).mpi, 750);
    assert.ok(visibleTicks.every((tick) => tick.populationCount >= 4));

    await ExchangeMpiDemo.deleteOne({ _id: weekly._id });
    await saveMpiMinimum({ marketId: weekly._id, value: "", actorId: admin, now: secondMinute });
    const official = await mpiState({ marketId: weekly._id, now: collectedAt });
    assert.equal(official.source, "official");
    assert.equal(official.latest.mpi, 700);
    assert.equal(official.latest.populationCount, 3);
    const history = await mpiState({ marketId: weekly._id, before: firstMinute, now: collectedAt });
    assert.ok(history.candles.some((row) => row.close === 640));
    assert.equal(history.candles.at(-1).close, 660);
    assert.ok(official.candles.every((row) => row.high < 998));

    const minuteLater = await mpiState({ marketId: weekly._id, interval: "1s", now: secondMinute });
    assert.equal(minuteLater.minimumMpiAttempts, 1);
    assert.equal(minuteLater.latest.populationCount, 4);
    assert.equal(minuteLater.latest.mpi, 750);
    assert.equal(+minuteLater.latest.dataCutoffAt, +secondMinute);
    assert.deepEqual(minuteLater.candles.at(-1), { _id: +secondMinute, open: 700, high: 750, low: 700, close: 750 });

    await PrivateMockExamAttempt.updateOne({ _id: pending._id }, { $set: {
      "submissionFinalization.status": "completed", "submissionFinalization.completedAt": new Date(+secondMinute + 20_000),
    } });
    await PrivateMockExamAttempt.updateOne({ _id: underReview._id }, { $set: {
      integrityStatus: "CLEAR", integrityClearedAt: new Date(+secondMinute + 45_000),
    } });
    await runExchangeTick(new Date(+secondMinute + 50_000), false);
    assert.equal(await ExchangeTick.countDocuments({ minuteSample: true }), 2);
    await runExchangeTick(thirdMinute, false);
    const third = await mpiState({ marketId: weekly._id, interval: "15m", now: thirdMinute });
    assert.equal(third.latest.populationCount, 6);
    assert.equal(third.latest.mpi, 783.33);
    assert.deepEqual(third.candles.at(-1), { _id: third.candles.at(-1)._id, open: 640, high: 783.33, low: 640, close: 783.33 });

    const idleMinute = new Date(+thirdMinute + 60_000);
    await runExchangeTick(idleMinute, false);
    const idle = await mpiState({ marketId: weekly._id, interval: "15m", now: idleMinute });
    assert.equal(await ExchangeTick.countDocuments({ minuteSample: true }), 3);
    assert.deepEqual(idle.latest, third.latest);
    assert.deepEqual(idle.candles, third.candles);
    await PrivateMockExamAttempt.deleteMany({ _id: { $in: [pending._id, afterCutoff._id, underReview._id] } });
    await runExchangeTick(new Date(+idleMinute + 60_000), false);
    assert.equal(await ExchangeTick.countDocuments({ minuteSample: true }), 3);

    const sell = await order(weekly, seller, "short", 640, 2, midweek);
    const commandId = randomUUID();
    const buy = await order(weekly, buyer, "long", 650, 1, midweek, { commandId });
    const replay = await order(weekly, buyer, "long", 650, 1, midweek, { commandId });
    assert.equal(String(replay._id), String(buy._id));
    assert.equal(buy.status, "filled");
    const sellerDashboard = await dashboardState(seller, midweek);
    assert.equal(sellerDashboard.available, 1280);
    assert.equal(sellerDashboard.positionCollateral, 360);
    assert.equal(sellerDashboard.reserved, 360);
    assert.equal(sellerDashboard.total, 2000);
    assert.equal(sellerDashboard.positions[0].notional, 640);
    assert.equal(sellerDashboard.orders[0].remaining, 1);
    assert.equal((await dashboardState(objectId(), midweek)).positions.length, 0);
    assert.equal(await ExchangeTrade.countDocuments(), 1);
    assert.equal((await ExchangeMarket.findById(weekly._id)).lastPrice, 640);
    await cancelOrder({ orderId: sell._id, userId: seller });
    await order(weekly, nextBuyer, "long", 680, 1, midweek);
    await order(weekly, buyer, "long", 680, 1, midweek, { action: "close" });
    const view = await terminalState({ marketId: String(weekly._id), userId: buyer, now: midweek });
    assert.deepEqual(view.candles.map((row) => [row.open, row.high, row.low, row.close, row.volume]), [[640, 680, 640, 680, 2]]);
    assert.equal(view.own.positions[0].realized, 40);
    const buyerDashboard = await dashboardState(buyer, midweek);
    assert.equal(buyerDashboard.positions.length, 0);
    assert.equal(buyerDashboard.history[0].status, "청산 완료");
    assert.equal(buyerDashboard.history[0].realized, 40);
    assert.equal(buyerDashboard.total, 2040);
    const tradeCandles = await terminalState({ marketId: String(weekly._id), interval: "1s", now: midweek });
    assert.deepEqual(tradeCandles.candles.map((row) => [row.open, row.high, row.low, row.close]), [[640, 680, 640, 680]]);
    const priorTrades = await futuresChartHistory(weekly._id, "1s", new Date(+midweek + 1000), midweek);
    assert.deepEqual(priorTrades, tradeCandles.candles);
    assert.deepEqual(await futuresChartHistory(weekly._id, "1s", midweek, midweek), []);
    await assert.rejects(order(weekly, nextBuyer, "long", 650, 1, weekClose), { status: 409 });

    await attempt({ score: 100, submittedAt: new Date(+weekClose - 1000), exchangeMmrGrade: 4 });
    await attempt({ score: 0, submittedAt: new Date(+weekClose - 1000), integrityStatus: "INVALIDATED" });
    await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "locked", settlementCompletedAt: weekClose } });
    await processMarket(await ExchangeMarket.findById(weekly._id), weekClose);
    await processMarket(await ExchangeMarket.findById(weekly._id), weekClose);
    const result = await ExchangeMarket.findById(weekly._id);
    assert.equal(result.phase, "settled");
    assert.equal(result.settlement, 775);
    assert.equal(result.participantCount, 4);
    await ExchangeMpiDemo.create(demo);
    const closedIndex = await mpiState({ marketId: weekly._id, now: weekClose });
    assert.equal(closedIndex.source, "official");
    assert.equal(closedIndex.latest.populationCount, 6);
    const another = await ExchangeMarket.create({
      key: "weekly:demo-isolation-fixture", type: "weekly", examId: exam._id, title: "다른 회차",
      opensAt: weekOpen, openedAt: weekOpen, closeAt: weekClose,
    });
    await assert.rejects(startMpiDemo({ marketId: another._id, now: midweek }), { status: 409 });
    await ExchangeMpiDemo.create({ ...demo, _id: another._id });
    const otherIndex = await mpiState({ marketId: another._id, now: midweek });
    assert.equal(otherIndex.source, "official");
    assert.equal(otherIndex.latest, null);
    await ExchangeMarket.deleteOne({ _id: another._id });
    assert.equal(result.escrow, 0);
    const balances = await Promise.all(cohort.map((userId) => ExchangeWallet.findById(userId)));
    assert.deepEqual(balances.map((wallet) => wallet.available / 100), [2040, 1865, 2095]);

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
    assert.equal((await ExchangeWallet.findById(buyer)).available, 209125);

    const other = await saveSchedule({ ...externalInput, grade: "2" }, admin, time("2026-03-01T00:00:00Z"));
    await order(other, buyer, "long", 650, 1, open);
    await order(other, seller, "short", 650, 1, open);
    await voidMarket(other._id, admin, "테스트 취소");
    await processMarket(await ExchangeMarket.findById(other._id), end);
    assert.equal((await ExchangeMarket.findById(other._id)).phase, "void");
    assert.equal((await ExchangeWallet.findById(buyer)).available, 209125);
    console.log("Exchange demo verified: empty upload gate, HTTP and admin roles, schedules, minute sampling, public threshold, blended test chart, round isolation, legacy tick transition, theme, order book, TP settlement and void.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

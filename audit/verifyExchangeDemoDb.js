const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { WebSession } = require("../models/sessionModel");
const { serviceHostRedirectLocation } = require("../middleware/serviceHostRouting");
const { saveSchedule, saveMinimum, syncWeeklyMarkets, seoulInput, calculateSample } = require("../services/exchangeMarketService");
const { mpiState, startMpiDemo } = require("../services/exchangeMpiService");
const { terminalState, runExchangeTick } = require("../services/exchangeService");
const { placeOrder, cancelOrder, registerResult, voidMarket, processMarket } = require("../services/exchangeTradingService");
const { ExchangeMarket, ExchangeWallet, ExchangeTrade, ExchangeTick } = models;

const time = (value) => new Date(value);
const weekOpen = new Date();
weekOpen.setUTCDate(weekOpen.getUTCDate() + 7 - weekOpen.getUTCDay());
weekOpen.setUTCHours(6, 0, 0, 0);
const weekClose = new Date(+weekOpen + 141 * 60 * 60 * 1000);
const midweek = new Date(+weekOpen + 70 * 60 * 60 * 1000);
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
    assert.doesNotMatch(html, /id="sample-price"/);
    const mpiResponse = await fetch(`${origin}/exchange/mpi`);
    assert.equal(mpiResponse.status, 200);
    const mpiHtml = await mpiResponse.text();
    assert.match(mpiHtml, /표본 지수 추이/);
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
    assert.match(adminHtml, />10모<\/strong>[\s\S]+>수능<\/strong>/);
    assert.match(adminHtml, /name="minimumAttempts" value="0"/);

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
      title: "Exchange 주간 검증", weekKey: seoulInput(weekOpen).slice(0, 10), formCode: "WEEKLY", attemptNumber: 1, status: "open",
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
    await runExchangeTick(midweek, false);
    assert.equal(await ExchangeTick.countDocuments(), 1);
    assert.deepEqual((await terminalState({ marketId: String(weekly._id), now: midweek })).ticks, []);
    const published = await terminalState({ marketId: String(weekly._id), now: new Date(+midweek + 30 * 60 * 1000) });
    assert.equal(published.ticks[0].mpi, 700);
    assert.equal(calculateSample([{ exchangeMmrGrade: 1, score: 80 }, { exchangeMmrGrade: 2, score: 50 }]).mpi, 650);

    const demo = await startMpiDemo({ marketId: weekly._id, examId: exam._id, actorId: admin, now: midweek });
    assert.equal(demo.attempts.length, 90);
    assert.equal(await PrivateMockExamAttempt.countDocuments({ examId: exam._id }), 3);
    assert.equal(await ExchangeTick.countDocuments(), 1);
    assert.equal(await ExchangeTrade.countDocuments(), 0);
    const demoState = await mpiState({ marketId: weekly._id, demo: true, now: new Date(+midweek + 50_000) });
    assert.equal(demoState.source, "demo");
    assert.equal(demoState.ticks.at(-1).populationCount, 90);
    assert.ok(new Set(demoState.ticks.map((tick) => tick.mpi)).size > 10);
    const official = await mpiState({ marketId: weekly._id, now: new Date(+midweek + 30 * 60 * 1000) });
    assert.equal(official.source, "official");
    assert.equal(official.ticks.at(-1).mpi, 700);
    assert.equal(official.ticks.at(-1).populationCount, 3);

    const sell = await order(weekly, seller, "short", 640, 2, midweek);
    const commandId = randomUUID();
    const buy = await order(weekly, buyer, "long", 650, 1, midweek, { commandId });
    const replay = await order(weekly, buyer, "long", 650, 1, midweek, { commandId });
    assert.equal(String(replay._id), String(buy._id));
    assert.equal(buy.status, "filled");
    assert.equal(await ExchangeTrade.countDocuments(), 1);
    assert.equal((await ExchangeMarket.findById(weekly._id)).lastPrice, 640);
    await cancelOrder({ orderId: sell._id, userId: seller });
    await order(weekly, nextBuyer, "long", 680, 1, midweek);
    await order(weekly, buyer, "long", 680, 1, midweek, { action: "close" });
    const view = await terminalState({ marketId: String(weekly._id), userId: buyer, now: midweek });
    assert.deepEqual(view.candles.map((row) => [row.open, row.high, row.low, row.close, row.volume]), [[640, 680, 640, 680, 2]]);
    assert.equal(view.own.positions[0].realized, 40);
    await assert.rejects(order(weekly, nextBuyer, "long", 650, 1, weekClose), { status: 409 });

    await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "locked", settlementCompletedAt: weekClose } });
    await processMarket(await ExchangeMarket.findById(weekly._id), weekClose);
    await processMarket(await ExchangeMarket.findById(weekly._id), weekClose);
    const result = await ExchangeMarket.findById(weekly._id);
    assert.equal(result.phase, "settled");
    assert.equal(result.settlement, 700);
    assert.equal(result.escrow, 0);
    const balances = await Promise.all(cohort.map((userId) => ExchangeWallet.findById(userId)));
    assert.deepEqual(balances.map((wallet) => wallet.available / 100), [2040, 1940, 2020]);

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
    console.log("Exchange demo verified: empty upload gate, HTTP and admin roles, schedules, sampling delay, order book, TP settlement and void.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

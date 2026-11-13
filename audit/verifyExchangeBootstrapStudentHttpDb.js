"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mock } = require("node:test");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const exchange = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { WebSession } = require("../models/sessionModel");
const { saveMpiMinimum, saveObservedMpi, syncWeeklyMarkets } = require("../services/exchangeMarketService");
const { maintainFundedBotOrders, maintainMarketMaker, processMarket } = require("../services/exchangeTradingService");

const minute = 60_000;
const points = [...Array(3).fill(2), ...Array(14).fill(3), ...Array(13).fill(4)];

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  await mongoose.connect(process.env.DB);
  let listener;
  try {
    await Promise.all([...Object.values(exchange), ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User, WebSession]
      .map((model) => model.init()));
    const releaseAt = new Date();
    releaseAt.setUTCDate(releaseAt.getUTCDate() + 7 - releaseAt.getUTCDay());
    releaseAt.setUTCHours(6, 0, 0, 0);
    const closeAt = new Date(+releaseAt + 141 * 60 * minute);
    const firstSampleAt = new Date(+releaseAt + 44 * minute);
    const studentStartsAt = new Date(+releaseAt + minute);
    mock.timers.enable({ apis: ["Date"], now: studentStartsAt });

    process.env.SESSION_COOKIE_DOMAIN = "";
    const { server } = require("../server");
    listener = await new Promise((resolve) => {
      const http = server.listen(0, "127.0.0.1", () => resolve(http));
    });
    const origin = `http://127.0.0.1:${listener.address().port}`;
    process.env.APP_BASE_URL = origin;
    process.env.PUBLIC_BASE_URL = origin;
    process.env.EXCHANGE_BASE_URL = origin;

    const password = `Audit-only-${randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const [student, admin] = await User.create(["student", "admin"].map((role) => ({
      name: `Bootstrap HTTP ${role}`, email: `bootstrap-http-${role}@fixture.invalid`,
      role, passwordHash, isActive: true, accountStatus: "active", termsAcceptedAt: firstSampleAt,
    })));
    async function signIn(account, path, next) {
      const response = await fetch(origin + path, {
        method: "POST", redirect: "manual", headers: { Origin: origin },
        body: new URLSearchParams({ email: account.email, password, next }),
      });
      assert.equal(response.status, 302, "Normal credential login must succeed");
      const cookie = response.headers.getSetCookie().find((item) => item.startsWith("connect.sid="))?.split(";")[0];
      assert.ok(cookie, "Login must issue a session cookie");
      if (account.role === "student") assert.equal(new URL(response.headers.get("location"), origin).pathname, next);
      return cookie;
    }
    const studentCookie = await signIn(student, "/login", "/exchange/futures");
    const adminCookie = await signIn(admin, "/admin/login", "/admin/exchange");

    const paper = await ArchiveItem.create({
      title: "Bootstrap HTTP paper", originalName: "bootstrap-http.pdf", storedName: "bootstrap-http.pdf",
      mimeType: "application/pdf", sizeBytes: 100, uploadedBy: admin._id, storageProvider: "R2",
      r2ObjectKey: "audit/bootstrap-http.pdf", isPublished: false,
    });
    const exam = await PrivateMockExam.create({
      title: "Bootstrap HTTP weekly round", formCode: "WEEKLY", attemptNumber: 1, status: "open",
      weekKey: releaseAt.toISOString().slice(0, 10), releaseAt, closeAt,
      aggregationStartsAt: closeAt, rankingPublishesAt: closeAt, archiveAt: closeAt, reviewPublishesAt: closeAt,
      questionCount: points.length, points, answerKey: points.map(() => "1"), questionModes: points.map(() => "multiple-choice"),
      archiveItemId: paper._id, createdBy: admin._id, notificationSentAt: releaseAt,
    });
    await syncWeeklyMarkets(studentStartsAt);
    let market = await exchange.ExchangeMarket.findOne({ examId: exam._id }).select("+botSeed");
    assert.ok(market?.openedAt, "A ready weekly exam opens a real exchange round");
    await saveMpiMinimum({ marketId: market._id, value: 1, actorId: admin._id, now: studentStartsAt });
    market = await exchange.ExchangeMarket.findById(market._id).select("+botSeed");
    const marketUrl = `/api/exchange/markets/${market._id}`;
    const futuresUrl = `/exchange/futures?market=${market._id}`;
    const mpiUrl = `/api/exchange/mpi?market=${market._id}`;
    const examUrl = `/api/private-mock-exams/${exam._id}`;
    const botsUrl = `/exchange/dashboard/bots?wallet=exchange&market=${market._id}`;

    const get = (path, cookie) => fetch(origin + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
    const post = (path, body, cookie) => fetch(origin + path, {
      method: "POST", redirect: "manual",
      headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    const request = { action: "open", direction: "long", quantity: 1, price: 500, commandId: randomUUID() };
    assert.equal((await post(marketUrl + "/orders", request)).status, 401);
    assert.equal((await post(marketUrl + "/orders", request, studentCookie)).status, 403);
    assert.equal((await get(botsUrl, studentCookie)).status, 403);
    assert.equal((await get(marketUrl + "/scenario")).status, 404);

    const examStart = await post(examUrl + "/start", {}, studentCookie);
    assert.equal(examStart.status, 200, await examStart.text());
    mock.timers.setTime(+firstSampleAt);
    await saveObservedMpi(market, firstSampleAt, () => firstSampleAt);
    const [examBot] = await exchange.ExchangeExamBotAttempt.find({ marketId: market._id }).lean();
    assert.equal(examBot?.label, "ExamBot1");
    assert.equal(examBot.source, "BOT");
    assert.equal((await (await get(mpiUrl)).json()).latest, null, "First sample must honor its publication delay");

    // Finish within the real exam window, after enough elapsed time for an ordinary scored submission.
    mock.timers.setTime(+studentStartsAt + 45 * minute);
    const expectedScore = examBot.score >= 50 ? 0 : 100;
    const answer = expectedScore ? "1" : "2";
    const examSubmit = await post(examUrl + "/submit", { answers: points.map(() => answer) }, studentCookie);
    assert.equal(examSubmit.status, 200, await examSubmit.clone().text());
    assert.equal((await examSubmit.json()).submitted, true);
    const human = await PrivateMockExamAttempt.findOne({ examId: exam._id, userId: student._id }).lean();
    assert.equal(human.source, "HUMAN");
    assert.equal(human.score, expectedScore);
    assert.equal((await (await get(marketUrl, studentCookie)).json()).own.eligible, true);

    const mixedSampleAt = new Date();
    await saveObservedMpi(market, mixedSampleAt, () => mixedSampleAt);
    const publishedAt = new Date(+mixedSampleAt + 30 * minute);
    mock.timers.setTime(+publishedAt);
    const published = (await (await get(mpiUrl)).json()).latest;
    assert.equal(published.humanPopulationCount, 1);
    assert.equal(published.botPopulationCount, 1);
    assert.equal(published.botWeight, 1);
    assert.equal(published.mpi, (expectedScore + examBot.score) * 5);
    assert.ok(market.bootstrapPolicy?.version, "Expected bootstrap policy on actual round");
    await maintainFundedBotOrders(market, publishedAt, () => publishedAt);
    const trader = await exchange.ExchangeOrder.findOne({ marketId: market._id, source: "BOT" }).lean();
    assert.equal(trader?.botLabel, "TraderBot1", "A published mixed sample should produce a funded Trading Bot quote");
    assert.equal(trader.status, "working");

    for (const path of [futuresUrl, `/exchange/mpi?market=${market._id}`]) {
      const response = await get(path, studentCookie);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.doesNotMatch(html, /시뮬레이션|모의 체결|exchange-scenario|botSeed/);
      assert.equal((html.match(/<canvas\b/g) || []).length, 1);
      assert.match(html, path === futuresUrl ? /자동화 계정 간 체결/ : /잠정 MPI에는 Exam Bot 점수가 포함될 수 있습니다/);
    }
    const quote = (await (await get(marketUrl)).json())[trader.side === "buy" ? "bids" : "asks"]
      .find((row) => row.price === trader.price);
    assert.equal(quote?.botQuantity, 1);
    const tradeRequest = { ...request, direction: trader.side === "buy" ? "short" : "long", price: trader.price };
    const tradeResponse = await post(marketUrl + "/orders", tradeRequest, studentCookie);
    assert.equal(tradeResponse.status, 200, await tradeResponse.clone().text());
    assert.equal((await tradeResponse.json()).status, "filled");
    const repeat = await post(marketUrl + "/orders", tradeRequest, studentCookie);
    assert.equal(repeat.status, 200);
    const filled = await (await get(marketUrl, studentCookie)).json();
    assert.equal(filled.market.volume, 1);
    assert.equal(filled.market.botOnlyVolume, 0);
    assert.deepEqual(filled.trades.map(({ makerSource, takerSource }) => [makerSource, takerSource]), [["BOT", "HUMAN"]]);
    assert.equal(filled.candles[0].volume, 1);
    assert.equal(filled.own.positions[0].remaining, 1);
    const positionResponse = await get("/exchange/dashboard/positions", studentCookie);
    assert.equal(positionResponse.status, 200);
    assert.match(await positionResponse.text(), /Bootstrap HTTP weekly round/);

    await maintainMarketMaker(market._id, () => publishedAt);
    const marketMaker = await exchange.ExchangeOrder.findOne({ marketId: market._id, source: "MM", status: "working" }).lean();
    assert.equal(marketMaker?.botLabel, "MM1");
    const ops = await get(botsUrl, adminCookie);
    assert.equal(ops.status, 200, await ops.clone().text());
    const botsPage = await ops.text();
    for (const label of ["ExamBot1", "TraderBot1", "MM1"]) assert.match(botsPage, new RegExp(label));
    const adminMarketUrl = `/admin/exchange/markets/${market._id}/action`;
    const adminAction = (action, cookie) => fetch(origin + adminMarketUrl, {
      method: "POST", redirect: "manual", headers: { Origin: origin, Cookie: cookie },
      body: new URLSearchParams({ action, reason: "Bootstrap audit" }),
    });
    assert.equal((await adminAction("mpi-bot-fade", studentCookie)).status, 403);
    assert.equal((await adminAction("mpi-bot-fade", adminCookie)).status, 409, "Insufficient human participation must prevent fade");
    assert.equal((await adminAction("trading-bots-disable", adminCookie)).status, 303);
    assert.equal((await exchange.ExchangeOrder.findById(marketMaker._id)).status, "working");
    assert.equal((await adminAction("mm-disable", adminCookie)).status, 303);
    assert.equal((await exchange.ExchangeOrder.findById(marketMaker._id)).status, "cancelled");
    assert.equal((await exchange.ExchangeMarket.findById(market._id)).botWeight, 1);

    // Settle the disposable market with the human score only, then check the signed-in account.
    mock.timers.setTime(+closeAt);
    await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "locked", settlementCompletedAt: closeAt } });
    await processMarket(await exchange.ExchangeMarket.findById(market._id), closeAt);
    market = await exchange.ExchangeMarket.findById(market._id).lean();
    assert.equal(market.phase, "settled");
    assert.equal(market.settlement, expectedScore * 10);
    assert.equal(market.botParticipantCount, 0);
    const position = await exchange.ExchangePosition.findOne({ marketId: market._id, userId: student._id }).lean();
    assert.equal(position.remaining, 0);
    assert.equal(market.escrow, 0);
    const historyCookie = await signIn(student, "/login", "/exchange/dashboard/history");
    const history = await get("/exchange/dashboard/history", historyCookie);
    assert.equal(history.status, 200);
    assert.match(await history.text(), /Bootstrap HTTP weekly round/);
    console.log("Bootstrap student HTTP verified: credential login, weekly exam submission, delayed mixed MPI, same-market order and candle, operator controls and labels, and human-only settlement.");
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    mock.timers.reset();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

const express = require("express");
const { isObjectIdOrHexString } = require("mongoose");
const auth = require("../middleware/authMiddleware");
const { exchangeLogout } = require("../controllers/matthsController");
const { exchangeUrl, serviceUrl } = require("../services/serviceUrlService");
const { ExchangeMarket, ExchangeWallet } = require("../models/exchangeModel");
const {
  ROUNDS, error, integer, seoulInput, saveSchedule, saveMinimum, saveMpiMinimum, syncWeeklyMarkets, startMpiBotFade, readWeeklyExam, weeklyExamReady,
} = require("../services/exchangeMarketService");
const { EXCHANGE_WALLET_ID, INITIAL_TP } = require("../services/exchangeFees");
const { placeOrder, cancelOrder, registerResult, voidMarket, setPaused, setMarketMakerEnabled, setTradingBotsEnabled, scheduleMarketLiquidity, stopMarketLiquidity } = require("../services/exchangeTradingService");
const { terminalState, futuresChartHistory, orderView, adminState, leaderboard } = require("../services/exchangeService");

const { OPTIONS, intervalFor } = require("../services/exchangeChartService");
const { dashboardState, operatorBotsState } = require("../services/exchangeDashboardService");
const { mpiState } = require("../services/exchangeMpiService");
const { scenarioState } = require("../services/exchangeScenarioService");

const router = express.Router();
const SCENARIO_INTERVALS = ["1h", "15m", "4h", "1d", "1w"].map((code) => intervalFor(code));
const FUTURES_QUICK_INTERVALS = ["1m", "1s", "5m", "15m", "1h"];
const FUTURES_INTERVALS = [
  ...FUTURES_QUICK_INTERVALS.map((code) => intervalFor(code)),
  ...OPTIONS.filter(({ code }) => !FUTURES_QUICK_INTERVALS.includes(code)),
];

function id(value) {
  if (!isObjectIdOrHexString(value)) throw error(404, "시장 또는 주문을 찾을 수 없습니다.");
  return value;
}

function viewer(req) {
  const user = req.session?.user;
  return user && ["student", "test", "admin"].includes(user.role) ? user.id : undefined;
}

function exchangeWallet(req, res, next) {
  if (req.query.wallet !== "exchange") {
    req.exchangeAccount = { userId: viewer(req) };
    return next();
  }
  function selectWallet(cause) {
    if (cause) return next(cause);
    return auth.isAdmin(req, res, (denied) => {
      if (denied) return next(denied);
      req.exchangeAccount = { userId: EXCHANGE_WALLET_ID, actorId: viewer(req) };
      return next();
    });
  }
  return req.authenticatedUser ? selectWallet() : auth.isLoggedIn(req, res, selectWallet);
}

function privateResponse(_req, res, next) {
  res.set("Cache-Control", "private, no-store");
  next();
}

function apiLogin(req, res, next) {
  if (!req.session?.user?.id) return res.status(401).json({ message: "로그인 후 주문할 수 있습니다." });
  return auth.isLoggedIn(req, res, next);
}

function exchangeNavigation(req) {
  const signedIn = Boolean(viewer(req));
  const next = req.originalUrl.startsWith("/exchange") ? req.originalUrl : `/exchange${req.originalUrl.slice(1)}`;
  return {
    signedIn,
    loginHref: serviceUrl("public", `/login?${new URLSearchParams({ next })}`),
    matthsHref: signedIn ? serviceUrl("app", "/main") : serviceUrl("public", "/"),
  };
}

router.post("/exchange/logout", privateResponse, auth.isLoggedIn, exchangeLogout);

function historyBefore(value) {
  if (value === undefined) return undefined;
  const date = new Date(Number(value));
  if (typeof value !== "string" || !/^\d{1,15}$/.test(value) || !Number.isFinite(+date) || +date <= 0) {
    throw error(400, "이전 봉의 기준 시각을 확인해 주세요.");
  }
  return date;
}

function mpiSelection(req) {
  return { marketId: req.query.market ? id(req.query.market) : undefined,
    interval: req.query.interval, before: historyBefore(req.query.before) };
}

router.get("/exchange/mpi", privateResponse, async (req, res) => {
  const initial = await mpiState(mpiSelection(req));
  res.render("exchange-mpi", {
    ...exchangeNavigation(req), initial,
    scenario: initial.market && scenarioState(initial.market),
    scenarioIntervals: SCENARIO_INTERVALS,
    intervals: OPTIONS,
    disablePageAnalytics: true,
  });
});

router.get("/api/exchange/mpi", privateResponse, async (req, res) => {
  res.json(await mpiState(mpiSelection(req)));
});

async function showFutures(req, res) {
  const { userId, actorId } = req.exchangeAccount;
  const selection = req.params.marketId || req.query.market;
  const chartInterval = intervalFor(req.query.interval, "1m").code;
  const initial = await terminalState({ userId, marketId: selection ? id(selection) : undefined, interval: chartInterval });
  const wallet = userId && !actorId ? await ExchangeWallet.findById(userId).select("rankingVisible").lean() : null;
  res.render("exchange", { ...exchangeNavigation(req), initial, exchangeWalletMode: Boolean(actorId), rankingVisible: wallet?.rankingVisible === true,
    activity: req.path === "/exchange/rankings" ? "ranking" : "positions",
    intervals: FUTURES_INTERVALS, chartInterval, disablePageAnalytics: true,
    scenario: initial.market && scenarioState(initial.market, { chart: "futures" }),
    scenarioIntervals: SCENARIO_INTERVALS });
}

router.get("/exchange", privateResponse, exchangeWallet, showFutures);
router.get("/exchange/futures", privateResponse, exchangeWallet, showFutures);
router.get("/exchange/markets/:marketId", privateResponse, exchangeWallet, showFutures);
router.get("/exchange/rankings", privateResponse, exchangeWallet, showFutures);

const walletSections = [
  { id: "overview", label: "월렛 개요", path: "" },
  { id: "positions", label: "현재 포지션", path: "/positions" },
  { id: "orders", label: "미체결 주문", path: "/orders" },
  { id: "history", label: "포지션 히스토리", path: "/history" },
  { id: "fees", label: "수수료 내역", path: "/fees" },
  { id: "bots", label: "운영 봇", path: "/bots" },
];
function verifyWalletSession(req, res, next) {
  if (!viewer(req)) return next();
  return auth.isLoggedIn(req, res, next);
}

const walletAccess = [privateResponse, verifyWalletSession, exchangeWallet];

function showDashboard(section) {
  return async (req, res) => {
    const { userId, actorId } = req.exchangeAccount;
    const operatorSections = ["fees", "bots"];
    if (operatorSections.includes(section) && !actorId) throw error(403, "운영 월렛에서만 확인할 수 있습니다.");
    const sections = walletSections.filter((item) => !operatorSections.includes(item.id) || actorId);
    const now = new Date();
    const botData = section === "bots" ? await operatorBotsState(req.query.market ? id(req.query.market) : undefined, now) : null;
    if (botData?.legacyMaker) {
      botData.legacyMaker = await dashboardState(botData.legacyMaker, now, { section: "bots" });
    }
    res.render("exchange-dashboard", {
      ...exchangeNavigation(req), section, sections,
      data: botData ?? (userId ? await dashboardState(userId, now, { section }) : null),
      exchangeWalletMode: Boolean(actorId), isAdmin: req.session?.user?.role === "admin",
      accountName: actorId ? "Matths Exchange" : req.session?.user?.name || "내 Exchange 월렛",
      disablePageAnalytics: true,
    });
  };
}

router.get("/exchange/dashboard", ...walletAccess, showDashboard("overview"));
router.get("/exchange/dashboard/positions", ...walletAccess, showDashboard("positions"));
router.get("/exchange/dashboard/orders", ...walletAccess, showDashboard("orders"));
router.get("/exchange/dashboard/history", ...walletAccess, showDashboard("history"));
router.get("/exchange/dashboard/fees", ...walletAccess, showDashboard("fees"));
router.get("/exchange/dashboard/bots", ...walletAccess, showDashboard("bots"));
router.get("/exchange/portfolio", ...walletAccess, showDashboard("overview"));

router.get(["/api/exchange/markets", "/api/exchange/markets/current", "/api/exchange/markets/:marketId",
  "/api/exchange/markets/:marketId/chart"], privateResponse, exchangeWallet, async (req, res) => {
  const selection = req.params.marketId || req.query.market;
  res.json(await terminalState({ userId: req.exchangeAccount.userId, marketId: selection ? id(selection) : undefined,
    marketType: req.path === "/api/exchange/markets/current" ? "weekly" : undefined,
    interval: typeof req.query.interval === "string" ? req.query.interval : undefined }));
});
router.get("/api/exchange/markets/:marketId/scenario", privateResponse, async (req, res) => {
  const market = await ExchangeMarket.findById(id(req.params.marketId))
    .select("type examId opensAt closeAt botParticipation").lean();
  if (!market || market.type !== "weekly" || !await weeklyExamReady(await readWeeklyExam(market.examId))) {
    return res.json(null);
  }
  const { chart, interval, before } = req.query;
  res.json(scenarioState(market, { chart, interval, before: historyBefore(before) }));
});
router.get("/api/exchange/markets/:marketId/candles", privateResponse, async (req, res) => {
  const interval = intervalFor(req.query.interval, "1m").code;
  const candles = await futuresChartHistory(id(req.params.marketId), interval, historyBefore(req.query.before), new Date(), req.query.series === "bots");
  res.json({ interval, candles });
});
router.get("/api/exchange/rankings", privateResponse, async (_req, res) => res.json(await leaderboard()));
router.post("/api/exchange/rankings/visibility", privateResponse, apiLogin, auth.isStudent, async (req, res) => {
  if (typeof req.body.visible !== "boolean") throw error(400, "공개 여부를 선택해 주세요.");
  await ExchangeWallet.updateOne({ _id: viewer(req) }, { $set: { rankingVisible: req.body.visible },
    $setOnInsert: { available: INITIAL_TP } }, { upsert: true, setDefaultsOnInsert: false });
  res.json({ visible: req.body.visible });
});
router.post("/api/exchange/markets/:marketId/orders", privateResponse, apiLogin, auth.isStudent, exchangeWallet, async (req, res) => {
  const order = await placeOrder({ marketId: id(req.params.marketId), ...req.exchangeAccount, input: req.body });
  res.json(orderView(order));
});
router.post("/api/exchange/orders/:orderId/cancel", privateResponse, apiLogin, auth.isStudent, exchangeWallet, async (req, res) => {
  res.json(orderView(await cancelOrder({ orderId: id(req.params.orderId), ...req.exchangeAccount })));
});

const admin = [privateResponse, auth.isLoggedIn, auth.isAdmin];
function adminRedirect(res, input = {}) {
  const year = /^\d{4}$/.test(input.year) ? input.year : "";
  const grade = /^[123]$/.test(input.grade) ? input.grade : "";
  const query = new URLSearchParams({ saved: "1", ...(year ? { year } : {}), ...(grade ? { grade } : {}) });
  res.redirect(303, `/admin/exchange?${query}`);
}

router.get("/admin/exchange", ...admin, async (req, res) => {
  const year = req.query.year ? integer(req.query.year, 2000, 2100, "시행 연도") : Number(seoulInput(new Date()).slice(0, 4));
  const grade = req.query.grade ? integer(req.query.grade, 1, 3, "학년") : 1;
  const data = await adminState(year, grade);
  res.render("admin-exchange", { ...data, year, grade, rounds: ROUNDS[grade], seoulInput,
    saved: req.query.saved === "1", exchangeHref: exchangeUrl(),
    exchangeWalletHref: exchangeUrl("/exchange/dashboard?wallet=exchange"), disablePageAnalytics: true });
});

router.post("/admin/exchange/schedules", ...admin, async (req, res) => {
  await saveSchedule(req.body, viewer(req));
  adminRedirect(res, req.body);
});
router.post("/admin/exchange/minimum", ...admin, async (req, res) => {
  await saveMinimum({ marketId: req.body.marketId ? id(req.body.marketId) : undefined,
    value: req.body.minimumAttempts, actorId: viewer(req) });
  await syncWeeklyMarkets();
  adminRedirect(res);
});
router.post("/admin/exchange/mpi-minimum", ...admin, async (req, res) => {
  await saveMpiMinimum({ marketId: req.body.marketId ? id(req.body.marketId) : undefined,
    value: req.body.minimumMpiAttempts, actorId: viewer(req) });
  adminRedirect(res, req.body);
});

router.post("/admin/exchange/markets/:marketId/action", ...admin, async (req, res) => {
  const marketId = id(req.params.marketId);
  const actorId = viewer(req);
  const { action, reason } = req.body;
  if (action === "pause" || action === "resume") await setPaused(marketId, action === "pause", actorId, reason);
  else if (action === "mm-enable" || action === "mm-disable") await setMarketMakerEnabled(marketId, action === "mm-enable", actorId, reason);
  else if (action === "mpi-bot-fade") await startMpiBotFade(marketId, actorId, reason);
  else if (action === "trading-bots-disable" || action === "trading-bots-enable") {
    await setTradingBotsEnabled(marketId, action === "trading-bots-enable", actorId, reason);
  }
  else if (action === "liquidity-schedule") await scheduleMarketLiquidity(marketId, req.body, actorId);
  else if (action === "liquidity-stop") await stopMarketLiquidity(marketId, actorId);
  else if (action === "void") await voidMarket(marketId, actorId, reason);
  else if (action === "settle") await registerResult({ marketId, actorId, input: req.body });
  else throw error(400, "운영 작업을 선택해 주세요.");
  adminRedirect(res);
});

router.use("/api/exchange", (cause, _req, res, next) => {
  if (!cause.status) return next(cause);
  return res.status(cause.status).json({ message: cause.message });
});

module.exports = router;

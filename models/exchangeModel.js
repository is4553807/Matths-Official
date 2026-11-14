const { Schema, model } = require("mongoose");

const objectId = Schema.Types.ObjectId;
const options = { timestamps: true, versionKey: false };
const sources = ["HUMAN", "BOT", "MM"];
const balance = () => ({ type: Number, default: 0, min: 0 });

const market = new Schema({
  key: { type: String, required: true, unique: true },
  type: { type: String, enum: ["weekly", "mock", "csat"], required: true },
  examId: objectId,
  year: Number,
  grade: Number,
  round: String,
  examDate: String,
  title: { type: String, required: true },
  opensAt: { type: Date, required: true },
  closeAt: { type: Date, required: true },
  openedAt: Date,
  bookClosedAt: Date,
  minimumAttempts: Number,
  minimumMpiAttempts: Number,
  appliedMinimum: Number,
  paused: { type: Boolean, default: false },
  phase: { type: String, enum: ["scheduled", "settling", "settled", "void"], default: "scheduled" },
  revision: { type: Number, default: 0 },
  questionCounts: { type: [Number], default: undefined },
  settlementSource: String,
  population: String,
  resultUrl: String,
  resultPublishedAt: Date,
  settlement: Number,
  decision: { type: String, enum: ["normal", "void"] },
  decisionAt: Date,
  settledAt: Date,
  participantCount: Number,
  botParticipantCount: Number,
  botParticipation: Boolean,
  examBotsStartedAt: Date,
  replayRecordedAt: Date,
  replayVolume: Number,
  replayMpiCount: Number,
  historicalBootstrap: {
    status: { type: String, enum: ["replaying", "complete"] },
    cursorAt: Date,
    startedAt: Date,
    completedAt: Date,
    previousOpenedAt: Date,
  },
  bootstrapPolicy: {
    version: Number,
    fadeMinutes: Number,
    stepMinutes: Number,
    minimumHumans: Number,
    tradingStopMinutesBeforeClose: Number,
    submissionMinutes: Number,
  },
  mpiFade: { startedAt: Date, actorId: objectId, initialWeight: Number },
  botWeight: Number,
  mpiFadeStep: Number,
  tradingBotsEnabled: Boolean,
  botOnlyVolume: Number,
  tradeSequence: Number,
  humanScoreSum: Number,
  botScoreSum: Number,
  internalBotCount: Number,
  botSeed: { type: String, select: false },
  reason: String,
  escrow: balance(),
  lastPrice: Number,
  lastTradeAt: Date,
  volume: { type: Number, default: 0 },
  marketMakerId: objectId,
  marketMakerEnabled: { type: Boolean, default: true },
  marketMakerUsedSnapshot: objectId,
  marketMakerDecision: {
    at: Date,
    mode: { type: String, enum: ["baseline", "B", "halted"] },
    reason: String,
    forecastId: objectId,
    quoteKey: String,
    bookSnapshotId: objectId,
    policyKey: String,
    calibratedRoundCount: Number,
    mark: Number,
    p10: Number,
    p90: Number,
    scenarioCount: Number,
    restorableRoundCount: Number,
    expectedLossTp: Number,
    cvarTp: Number,
    hardLossTp: Number,
    expectedQuantity: Number,
    collateralRequiredTp: Number,
    collateralReleasedTp: Number,
    quotes: { type: [Schema.Types.Mixed], default: undefined },
    flowWindowCount: Number,
    flowOrderCount: Number,
  },
  liquidityPlan: {
    startsAt: Date,
    endsAt: Date,
    referencePrice: Number,
    openingFilledAt: Date,
    stoppingAt: Date,
  },
  mpiCheckedAt: Date,
  internalMpi: Number,
  internalMpiCount: Number,
}, options);
market.index({ phase: 1, closeAt: 1 });
market.index({ type: 1, opensAt: -1 });

const setting = new Schema({
  _id: String,
  minimumAttempts: { type: Number, default: 0 },
  minimumMpiAttempts: { type: Number, default: 1 },
  automatedTradingDisabled: Boolean,
  historicalBootstrapEnabled: Boolean,
  marketMakerPolicy: { type: String, enum: ["baseline", "B"] },
  marketMakerExpectedLossLimitTp: { type: Number, min: 0, max: 1000 },
  marketMakerTailLossLimitTp: { type: Number, min: 0, max: 1000 },
}, options);
const wallet = new Schema({
  _id: objectId, available: balance(), collectedFees: balance(), rankingVisible: { type: Boolean, default: false },
  botFundingAt: Date,
  parentWalletId: objectId,
}, options);
const account = new Schema({
  marketId: { type: objectId, required: true },
  userId: { type: objectId, required: true },
  allocated: balance(),
  cash: balance(),
  releasedAt: Date,
  credited: balance(),
}, options);
account.index({ marketId: 1, userId: 1 }, { unique: true });
account.index({ userId: 1, releasedAt: 1 });
account.index({ marketId: 1, releasedAt: 1 });

const order = new Schema({
  marketId: { type: objectId, required: true },
  userId: { type: objectId, required: true },
  commandId: { type: String, required: true },
  action: { type: String, enum: ["open", "close"], required: true },
  direction: { type: String, enum: ["long", "short"], required: true },
  side: { type: String, enum: ["buy", "sell"], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  remaining: { type: Number, required: true },
  status: { type: String, enum: ["working", "filled", "cancelled"], required: true },
  sequence: { type: Number, required: true },
  acceptedAt: { type: Date, required: true },
  liquidityProvider: String,
  source: { type: String, enum: sources },
  botLabel: String,
  botId: objectId,
  mpiSnapshotId: objectId,
  marketMakerQuoteKey: String,
  scheduledLiquidity: Boolean,
  expiresAt: Date,
  actorId: objectId,
  cancelledBy: objectId,
  cancelledAt: Date,
  feeReserved: Number,
  feesPaid: Number,
}, options);
order.index({ userId: 1, commandId: 1 }, { unique: true });
order.index({ marketId: 1, status: 1, side: 1, price: 1, acceptedAt: 1, sequence: 1 });
order.index({ marketId: 1, status: 1, side: 1, price: -1, acceptedAt: 1, sequence: 1 });
order.index({ marketId: 1, userId: 1, acceptedAt: -1 });
order.index({ userId: 1, status: 1, acceptedAt: -1 });

const position = new Schema({
  marketId: objectId,
  userId: objectId,
  direction: String,
  price: Number,
  quantity: Number,
  remaining: Number,
  realized: { type: Number, default: 0 },
  tradeId: objectId,
  botId: objectId,
  openedAt: Date,
  closedAt: Date,
}, options);
position.index({ marketId: 1, userId: 1, direction: 1, _id: 1 });
position.index({ userId: 1, updatedAt: -1 });

const trade = new Schema({
  marketId: objectId,
  makerOrderId: objectId,
  takerOrderId: objectId,
  makerFee: Number,
  takerFee: Number,
  feeCollected: Boolean,
  makerSource: { type: String, enum: sources },
  takerSource: { type: String, enum: sources },
  botOnly: Boolean,
  liquidityProvider: String,
  price: Number,
  quantity: Number,
  tradedAt: Date,
  sequence: Number,
}, options);
trade.index({ marketId: 1, tradedAt: -1, _id: -1 });
trade.index({ tradedAt: -1, _id: -1 }, { partialFilterExpression: { feeCollected: true } });

const tick = new Schema({
  marketId: objectId,
  sampledAt: Date,
  dataCutoffAt: Date,
  minuteSample: Boolean,
  publishAt: Date,
  expiresAt: Date,
  mpi: Number,
  populationCount: Number,
  botPopulationCount: Number,
  reconstructedBotPopulationCount: Number,
  supersededAt: Date,
  reconstructedAt: Date,
  humanPopulationCount: Number,
  humanScoreSum: Number,
  botScoreSum: Number,
  botWeight: Number,
  unavailable: Boolean,
  sampleCount: Number,
  kind: String,
  contributions: { type: [String], select: false, default: undefined },
}, options);
tick.index({ marketId: 1, sampledAt: 1 }, { unique: true });
tick.index({ marketId: 1, publishAt: -1 });
tick.index({ marketId: 1, publishAt: 1 }, { partialFilterExpression: { dataCutoffAt: { $exists: true } } });
tick.index({ marketId: 1, dataCutoffAt: -1 }, { unique: true, partialFilterExpression: { minuteSample: true } });
tick.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const examBotAttempt = new Schema({
  marketId: { type: objectId, required: true },
  examId: { type: objectId, required: true },
  botId: { type: objectId, required: true },
  number: { type: Number, required: true },
  label: { type: String, required: true },
  source: { type: String, enum: ["BOT"], required: true },
  submittedAt: { type: Date, required: true },
  answers: { type: [String], select: false, default: undefined },
  answeredCount: { type: Number, min: 0 },
  correctCount: { type: Number, min: 0 },
  score: { type: Number, required: true, min: 0, max: 100 },
  correctByQuestion: [Boolean],
  reconstructedAt: Date,
}, options);
examBotAttempt.index({ marketId: 1, botId: 1 }, { unique: true });
examBotAttempt.index({ marketId: 1, submittedAt: 1 });

const botReplayTrade = new Schema({
  marketId: { type: objectId, required: true },
  replayId: { type: String, required: true },
  source: { type: String, enum: ["BOT_REPLAY"], required: true },
  tradedAt: { type: Date, required: true },
  reconstructedAt: { type: Date, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  makerLabel: String,
  takerLabel: String,
  makerSource: String,
  takerSource: String,
  sequence: Number,
}, options);
botReplayTrade.index({ marketId: 1, replayId: 1 }, { unique: true });
botReplayTrade.index({ marketId: 1, tradedAt: -1 });

const botReplayMpi = new Schema({
  marketId: { type: objectId, required: true },
  sampledAt: { type: Date, required: true },
  publishAt: { type: Date, required: true },
  reconstructedAt: { type: Date, required: true },
  mpi: { type: Number, required: true },
  populationCount: { type: Number, required: true },
}, options);
botReplayMpi.index({ marketId: 1, publishAt: 1 }, { unique: true });

const mpiDemo = new Schema({
  _id: objectId,
  examId: { type: objectId, required: true },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  startedBy: objectId,
  attempts: [{
    _id: false,
    accountKey: String,
    exchangeMmrGrade: Number,
    score: Number,
    offsetSeconds: Number,
  }],
}, options);

const reference = new Schema({
  marketId: { type: objectId, required: true },
  at: Date,
  sequence: Number,
  price: Number,
  source: String,
  bids: { type: [{ _id: false, price: Number, quantity: Number }], default: undefined },
  asks: { type: [{ _id: false, price: Number, quantity: Number }], default: undefined },
}, options);
reference.index({ marketId: 1, at: -1, sequence: -1 });

const event = new Schema({ marketId: objectId, actorId: objectId, at: Date, action: String, detail: Schema.Types.Mixed }, options);
event.index({ createdAt: -1 });

const marketMakerCohort = new Schema({
  snapshotId: { type: objectId, required: true },
  cutoffAt: { type: Date, required: true },
  publishAt: { type: Date, required: true },
  supersededAt: Date,
  earlyMean: Number,
  remainingCount: Number,
  remainingScoreSum: Number,
}, { _id: false });

const marketMakerHistory = new Schema({
  marketId: { type: objectId, required: true },
  examId: { type: objectId, required: true },
  version: { type: Number, required: true },
  decidedAt: { type: Date, required: true },
  participantCount: { type: Number, required: true },
  scoreSum: { type: Number, required: true },
  cohorts: { type: [marketMakerCohort], default: [] },
  flowOrderCount: { type: Number, min: 0 },
}, options);
marketMakerHistory.index({ marketId: 1, version: 1 }, { unique: true });

const marketMakerForecast = new Schema({
  marketId: { type: objectId, required: true },
  inputKey: { type: String, required: true },
  modelVersion: { type: String, required: true },
  publicSnapshotId: objectId,
  cutoffAt: Date,
  at: { type: Date, required: true },
  historicalMarketIds: [objectId],
  restorableRoundCount: Number,
  validScenarioCount: Number,
  invalidScenarioCount: Number,
  mark: Number,
  p10: Number,
  p90: Number,
  reason: String,
}, options);
marketMakerForecast.index({ marketId: 1, inputKey: 1 }, { unique: true });
marketMakerForecast.index({ marketId: 1, at: -1 });

module.exports = {
  ExchangeMarket: model("ExchangeMarket", market),
  ExchangeSetting: model("ExchangeSetting", setting),
  ExchangeWallet: model("ExchangeWallet", wallet),
  ExchangeAccount: model("ExchangeAccount", account),
  ExchangeOrder: model("ExchangeOrder", order),
  ExchangePosition: model("ExchangePosition", position),
  ExchangeTrade: model("ExchangeTrade", trade),
  ExchangeTick: model("ExchangeTick", tick),
  ExchangeExamBotAttempt: model("ExchangeExamBotAttempt", examBotAttempt),
  ExchangeBotReplayTrade: model("ExchangeBotReplayTrade", botReplayTrade),
  ExchangeBotReplayMpi: model("ExchangeBotReplayMpi", botReplayMpi),
  ExchangeMpiDemo: model("ExchangeMpiDemo", mpiDemo),
  ExchangeReference: model("ExchangeReference", reference),
  ExchangeEvent: model("ExchangeEvent", event),
  ExchangeMarketMakerHistory: model("ExchangeMarketMakerHistory", marketMakerHistory),
  ExchangeMarketMakerForecast: model("ExchangeMarketMakerForecast", marketMakerForecast),
};

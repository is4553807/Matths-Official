const { Schema, model } = require("mongoose");

const objectId = Schema.Types.ObjectId;
const options = { timestamps: true, versionKey: false };
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
  participantCount: Number,
  reason: String,
  escrow: balance(),
  lastPrice: Number,
  lastTradeAt: Date,
  volume: { type: Number, default: 0 },
}, options);
market.index({ phase: 1, closeAt: 1 });
market.index({ type: 1, opensAt: -1 });

const setting = new Schema({
  _id: String,
  minimumAttempts: { type: Number, default: 0 },
  minimumMpiAttempts: { type: Number, default: 1 },
}, options);
const wallet = new Schema({
  _id: objectId, available: balance(), collectedFees: balance(), rankingVisible: { type: Boolean, default: false },
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
  actorId: objectId,
  cancelledBy: objectId,
  feeReserved: Number,
  feesPaid: Number,
}, options);
order.index({ userId: 1, commandId: 1 }, { unique: true });
order.index({ marketId: 1, status: 1, side: 1, price: 1, sequence: 1 });
order.index({ marketId: 1, status: 1, side: 1, price: -1, sequence: 1 });
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
  sampleCount: Number,
}, options);
tick.index({ marketId: 1, sampledAt: 1 }, { unique: true });
tick.index({ marketId: 1, publishAt: -1 });
tick.index({ marketId: 1, publishAt: 1 }, { partialFilterExpression: { dataCutoffAt: { $exists: true } } });
tick.index({ marketId: 1, dataCutoffAt: -1 }, { unique: true, partialFilterExpression: { minuteSample: true } });
tick.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

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

const event = new Schema({ marketId: objectId, actorId: objectId, action: String, detail: Schema.Types.Mixed }, options);
event.index({ createdAt: -1 });

module.exports = {
  ExchangeMarket: model("ExchangeMarket", market),
  ExchangeSetting: model("ExchangeSetting", setting),
  ExchangeWallet: model("ExchangeWallet", wallet),
  ExchangeAccount: model("ExchangeAccount", account),
  ExchangeOrder: model("ExchangeOrder", order),
  ExchangePosition: model("ExchangePosition", position),
  ExchangeTrade: model("ExchangeTrade", trade),
  ExchangeTick: model("ExchangeTick", tick),
  ExchangeMpiDemo: model("ExchangeMpiDemo", mpiDemo),
  ExchangeEvent: model("ExchangeEvent", event),
};

const mongoose = require("mongoose");

const { Schema } = mongoose;

const paybackPayoutRecordSchema = new Schema(
  {
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: { type: Number, min: 0, required: true },
    paybackRate: { type: Number, min: 0, max: 100, required: true },
    currency: { type: String, enum: ["KRW"], default: "KRW" },
    bankName: { type: String, trim: true, maxlength: 40, required: true },
    accountNumberLast4: { type: String, trim: true, maxlength: 4, required: true },
    status: {
      type: String,
      enum: ["COMPLETED", "CANCELLED"],
      default: "COMPLETED",
      index: true,
    },
    completedAt: { type: Date, required: true, index: true },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completedBySnapshot: {
      name: { type: String, trim: true, maxlength: 80, default: "" },
      email: { type: String, trim: true, lowercase: true, maxlength: 320, default: "" },
    },
    siteNotificationId: {
      type: Schema.Types.ObjectId,
      ref: "UserNotification",
      default: null,
    },
    emailStatus: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED"],
      default: "PENDING",
      index: true,
    },
    emailAttemptedAt: { type: Date, default: null },
    emailDeliveredAt: { type: Date, default: null },
    emailProviderMessageId: { type: String, trim: true, maxlength: 240, default: "" },
    emailLastError: { type: String, trim: true, maxlength: 1000, default: "" },
    operatorNote: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true, versionKey: false }
);

paybackPayoutRecordSchema.index({ completedAt: -1, status: 1 });

const PaybackPayoutRecord =
  mongoose.models.PaybackPayoutRecord ||
  mongoose.model("PaybackPayoutRecord", paybackPayoutRecordSchema);

const financeAccountSchema = new Schema(
  {
    accountKey: { type: String, required: true, unique: true, default: "PRIMARY" },
    currency: { type: String, enum: ["KRW"], default: "KRW" },
    grossPayments: { type: Number, min: 0, default: 0 },
    netCollected: { type: Number, min: 0, default: 0 },
    refunded: { type: Number, min: 0, default: 0 },
    cancelled: { type: Number, min: 0, default: 0 },
    todayRevenue: { type: Number, min: 0, default: 0 },
    refundedAndCancelled: { type: Number, min: 0, default: 0 },
    actualCashBalance: { type: Number, default: 0 },
    cumulativePaybackPaid: { type: Number, min: 0, default: 0 },
    paybackReserve: { type: Number, min: 0, default: 0 },
    confirmedUnpaidPayback: { type: Number, min: 0, default: 0 },
    pgFeeReserve: { type: Number, min: 0, default: 0 },
    otherUnpaidCosts: { type: Number, min: 0, default: 0 },
    cumulativeConfirmedProfit: { type: Number, min: 0, default: 0 },
    cumulativeWithdrawals: { type: Number, min: 0, default: 0 },
    withdrawableAmount: { type: Number, min: 0, default: 0 },
    pgFeeReserveBps: { type: Number, min: 0, max: 10000, default: 0 },
    withdrawalsEnabled: { type: Boolean, default: false },
    lastReconciledAt: { type: Date, default: null },
    lastSettlementDateKst: { type: String, default: "", match: /^$|^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true, versionKey: false }
);

const businessWithdrawalSchema = new Schema(
  {
    amount: { type: Number, min: 1, required: true },
    currency: { type: String, enum: ["KRW"], default: "KRW" },
    status: {
      type: String,
      enum: ["COMPLETED", "FAILED", "CANCELLED"],
      default: "COMPLETED",
      index: true,
    },
    completedAt: { type: Date, default: null, index: true },
    completedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    operatorNote: { type: String, trim: true, maxlength: 500, required: true },
    balanceBefore: { type: Number, min: 0, required: true },
    balanceAfter: { type: Number, min: 0, required: true },
  },
  { timestamps: true, versionKey: false }
);
businessWithdrawalSchema.index({ completedAt: -1, status: 1 });

const financeDailySnapshotSchema = new Schema(
  {
    dateKeyKst: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    currency: { type: String, enum: ["KRW"], default: "KRW" },
    metrics: { type: Schema.Types.Mixed, required: true },
    reconciledAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

const FinanceAccount =
  mongoose.models.FinanceAccount || mongoose.model("FinanceAccount", financeAccountSchema);
const BusinessWithdrawal =
  mongoose.models.BusinessWithdrawal ||
  mongoose.model("BusinessWithdrawal", businessWithdrawalSchema);
const FinanceDailySnapshot =
  mongoose.models.FinanceDailySnapshot ||
  mongoose.model("FinanceDailySnapshot", financeDailySnapshotSchema);

module.exports = {
  BusinessWithdrawal,
  FinanceAccount,
  FinanceDailySnapshot,
  PaybackPayoutRecord,
};

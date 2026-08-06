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
    operatorNote: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true, versionKey: false }
);

paybackPayoutRecordSchema.index({ completedAt: -1, status: 1 });

const PaybackPayoutRecord =
  mongoose.models.PaybackPayoutRecord ||
  mongoose.model("PaybackPayoutRecord", paybackPayoutRecordSchema);

module.exports = { PaybackPayoutRecord };

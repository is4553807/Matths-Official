const mongoose = require("mongoose");

const { Schema } = mongoose;

const schedulerLeaseSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    lastCompletedAt: { type: Date, default: null },
    lastResult: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "schedulerLeases", timestamps: true, versionKey: false }
);

const SchedulerLease =
  mongoose.models.SchedulerLease || mongoose.model("SchedulerLease", schedulerLeaseSchema);

const platformControlSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 80,
    },
    isPaused: { type: Boolean, required: true, default: false, index: true },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    pausedAt: { type: Date, default: null },
    resumedAt: { type: Date, default: null },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    admissionSequence: { type: Number, min: 0, default: 0 },
    lastAdmissionAt: { type: Date, default: null },
  },
  { collection: "platformControls", timestamps: true, versionKey: false }
);

const PlatformControl =
  mongoose.models.PlatformControl ||
  mongoose.model("PlatformControl", platformControlSchema);

const operationalMetricEventSchema = new Schema(
  {
    eventKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 240,
    },
    eventType: {
      type: String,
      enum: ["PRICING_VIEW", "PAYMENT_INTENT", "MATCH_REQUEST", "WEEKLY_MOCK_ACCESS_DENIED"],
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    result: {
      type: String,
      enum: ["VIEWED", "STARTED", "SUCCEEDED", "FAILED", "DENIED"],
      required: true,
      index: true,
    },
    division: {
      type: String,
      enum: ["", "SUB", "MAIN"],
      default: "",
      index: true,
    },
    sourceTier: { type: String, trim: true, uppercase: true, maxlength: 40, default: "" },
    targetTier: { type: String, trim: true, uppercase: true, maxlength: 40, default: "" },
    rankBucket: { type: String, trim: true, maxlength: 40, default: "" },
    reasonCode: { type: String, trim: true, uppercase: true, maxlength: 120, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { collection: "operationalMetricEvents", timestamps: true, versionKey: false }
);
operationalMetricEventSchema.index({ eventType: 1, occurredAt: 1, result: 1 });
operationalMetricEventSchema.index({ userId: 1, eventType: 1, occurredAt: 1 });

const OperationalMetricEvent =
  mongoose.models.OperationalMetricEvent ||
  mongoose.model("OperationalMetricEvent", operationalMetricEventSchema);

module.exports = { OperationalMetricEvent, PlatformControl, SchedulerLease };

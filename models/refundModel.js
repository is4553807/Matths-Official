const mongoose = require("mongoose");

const { Schema } = mongoose;

const refundRequestSchema = new Schema(
  {
    requestKey: { type: String, required: true, unique: true, trim: true, maxlength: 160 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "ArenaPackagePayment", required: true, index: true },
    supportInquiryId: { type: Schema.Types.ObjectId, ref: "SupportInquiry", default: null, index: true },
    productCode: { type: String, enum: ["MOCK_EXAM_ONLY", "LEARNING_PACKAGE_29"], required: true },
    productNameSnapshot: { type: String, required: true, trim: true, maxlength: 140 },
    orderReferenceSnapshot: { type: String, required: true, trim: true, maxlength: 160 },
    providerPaymentKeySnapshot: { type: String, required: true, trim: true, maxlength: 160 },
    reasonType: {
      type: String,
      enum: ["SIMPLE_CHANGE", "NOT_AS_DESCRIBED", "SERVICE_FAILURE", "OTHER"],
      default: "SIMPLE_CHANGE",
    },
    reasonDetail: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
      type: String,
      enum: ["REQUESTED", "CALCULATED", "COMPLETED", "REJECTED"],
      default: "REQUESTED",
      index: true,
    },
    requestedAt: { type: Date, required: true, default: Date.now, index: true },
    processingDeadlineAt: { type: Date, required: true, index: true },
    calculation: {
      policyVersion: { type: String, trim: true, maxlength: 80, default: "" },
      approvedAmount: { type: Number, min: 0, default: 0 },
      serviceStartAt: { type: Date, default: null },
      serviceEndAt: { type: Date, default: null },
      paidFeatureUsed: { type: Boolean, default: false },
      usedDays: { type: Number, min: 0, default: 0 },
      calculationType: { type: String, enum: ["", "FULL", "PARTIAL", "NONE", "LEGAL_OVERRIDE"], default: "" },
      calculatedAmount: { type: Number, min: 0, default: 0 },
      formula: { type: String, trim: true, maxlength: 500, default: "" },
      calculatedAt: { type: Date, default: null },
      calculatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    decision: {
      approvedAmount: { type: Number, min: 0, default: 0 },
      cancellationMode: { type: String, enum: ["", "FULL", "PARTIAL"], default: "" },
      providerCancellationTransactionKey: { type: String, trim: true, maxlength: 200, default: undefined },
      providerCancelledAt: { type: Date, default: null },
      processedAt: { type: Date, default: null },
      processedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      processedBySnapshot: {
        name: { type: String, trim: true, maxlength: 80, default: "" },
        email: { type: String, trim: true, lowercase: true, maxlength: 320, default: "" },
        loginAt: { type: Date, default: null },
      },
      idempotencyKey: { type: String, trim: true, maxlength: 200, default: undefined },
      operatorNote: { type: String, trim: true, maxlength: 1000, default: "" },
    },
  },
  { timestamps: true, versionKey: false }
);

refundRequestSchema.index({ status: 1, requestedAt: -1 });
refundRequestSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["REQUESTED", "CALCULATED"] } } }
);
refundRequestSchema.index(
  { "decision.providerCancellationTransactionKey": 1 },
  { unique: true, sparse: true }
);
refundRequestSchema.index(
  { "decision.idempotencyKey": 1 },
  { unique: true, sparse: true }
);

const RefundRequest =
  mongoose.models.RefundRequest || mongoose.model("RefundRequest", refundRequestSchema);

module.exports = { RefundRequest };

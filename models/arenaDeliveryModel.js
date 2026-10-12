"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const emailSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  dedupeKey: { type: String, required: true, unique: true },
  payload: { type: Schema.Types.Mixed, required: true, select: false },
  status: { type: String, enum: ["PENDING", "SENDING", "RETRY", "SENT", "UNKNOWN"], default: "PENDING" },
  attempts: { type: Number, default: 0 },
  leaseToken: { type: String, default: "" },
  leaseUntil: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  lastError: { type: String, maxlength: 1000, default: "" },
}, { timestamps: true, versionKey: false });
emailSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

const receiptSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true, maxlength: 180 },
  fingerprint: { type: String, required: true },
  status: { type: String, enum: ["PROCESSING", "COMPLETE", "UNKNOWN"], required: true },
  response: { type: Schema.Types.Mixed, default: null, select: false },
  responseStatus: { type: Number, default: 200 },
  startedAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });
receiptSchema.index({ userId: 1, key: 1 }, { unique: true });

const assetDeletionSchema = new Schema({
  key: { type: String, required: true, unique: true },
  referenceKey: { type: String, required: true },
  asset: { type: Schema.Types.Mixed, select: false },
  status: { type: String, enum: ["PENDING", "DELETING", "RETRY", "DELETED"], default: "PENDING" },
  attempts: { type: Number, default: 0 },
  leaseToken: { type: String, default: "" },
  leaseUntil: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 1000 },
}, { timestamps: true, versionKey: false });
assetDeletionSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

module.exports = {
  ArenaNotificationEmailDelivery: mongoose.models.ArenaNotificationEmailDelivery || mongoose.model("ArenaNotificationEmailDelivery", emailSchema),
  ArenaNativeCommandReceipt: mongoose.models.ArenaNativeCommandReceipt || mongoose.model("ArenaNativeCommandReceipt", receiptSchema),
  ArenaAssetDeletionTask: mongoose.models.ArenaAssetDeletionTask || mongoose.model("ArenaAssetDeletionTask", assetDeletionSchema),
};

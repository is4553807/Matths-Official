const mongoose = require("mongoose");

const emailVerificationSchema = new mongoose.Schema({
  accountType: { type: String, enum: ["user", "parent"], required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  sentAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

emailVerificationSchema.index({ accountType: 1, accountId: 1 }, { unique: true });
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.EmailVerification ||
  mongoose.model("EmailVerification", emailVerificationSchema);

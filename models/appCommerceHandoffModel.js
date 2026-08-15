const mongoose = require("mongoose");

const appCommerceHandoffSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  destination: {
    type: String,
    enum: [
      "/pricing",
      "/pricing/mock-exam-only/self",
      "/pricing/mock-exam-only/parent-request",
      "/pricing/learning-package/self",
      "/pricing/learning-package/parent-request",
    ],
    required: true,
  },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.AppCommerceHandoff ||
  mongoose.model("AppCommerceHandoff", appCommerceHandoffSchema);

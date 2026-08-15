const mongoose = require("mongoose");

const { Schema } = mongoose;

const paybackDailyLearningSchema = new Schema(
  {
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateKeyKst: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    eventType: {
      type: String,
      enum: ["GOAT_ARENA_ATTACK_SUBMITTED"],
      default: "GOAT_ARENA_ATTACK_SUBMITTED",
      required: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      index: true,
    },
    attemptId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatchAttempt",
      required: true,
    },
    evidenceId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatchEvidence",
      required: true,
    },
    matchType: {
      type: String,
      enum: ["NORMAL", "REVENGE"],
      required: true,
    },
    role: {
      type: String,
      enum: ["CHALLENGER"],
      required: true,
    },
    submittedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

paybackDailyLearningSchema.index(
  { accessCycleId: 1, dateKeyKst: 1 },
  { unique: true }
);
paybackDailyLearningSchema.index(
  { attemptId: 1 },
  { unique: true }
);

const PaybackDailyLearning =
  mongoose.models.PaybackDailyLearning ||
  mongoose.model(
    "PaybackDailyLearning",
    paybackDailyLearningSchema
  );

module.exports = {
  PaybackDailyLearning,
};

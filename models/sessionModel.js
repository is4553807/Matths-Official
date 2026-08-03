const mongoose = require("mongoose");

const { Schema } = mongoose;

const webSessionSchema = new Schema(
  {
    sid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    session: {
      type: Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    collection: "webSessions",
    timestamps: true,
    versionKey: false,
  }
);

const WebSession =
  mongoose.models.WebSession || mongoose.model("WebSession", webSessionSchema);

module.exports = { WebSession };

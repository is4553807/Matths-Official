const mongoose = require("mongoose");

const mobileAuthGrantSchema =
  new mongoose.Schema(
    {
      tokenHash: {
        type: String,
        required: true,
        unique: true,
        select: false,
      },
      codeChallenge: {
        type: String,
        default: null,
        select: false,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      expiresAt: {
        type: Date,
        required: true,
        index: {
          expireAfterSeconds: 0,
        },
      },
      consumedAt: {
        type: Date,
        default: null,
      },
      accessTokenIssuedAt: {
        type: Date,
        default: null,
      },
      responseCiphertext: {
        type: String,
        default: null,
        select: false,
      },
      responseIv: {
        type: String,
        default: null,
        select: false,
      },
      responseTag: {
        type: String,
        default: null,
        select: false,
      },
      resultExpiresAt: {
        type: Date,
        default: null,
        index: {
          expireAfterSeconds: 0,
        },
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

module.exports =
  mongoose.models.MobileAuthGrant ||
  mongoose.model(
    "MobileAuthGrant",
    mobileAuthGrantSchema
  );

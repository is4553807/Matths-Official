const mongoose = require("mongoose");

/*
 * 계정 탈퇴처럼 되돌릴 수 없는 작업에만 쓰는 짧은 수명의 재인증 증명입니다.
 * 일반 모바일 로그인 grant와 컬렉션을 분리해 로그인 코드를 탈퇴 증명으로 바꾸어
 * 쓸 수 없게 합니다. 원문 proof와 PKCE verifier는 저장하지 않습니다.
 */
const accountReauthenticationGrantSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    codeChallenge: {
      type: String,
      required: true,
      select: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["google", "kakao"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports =
  mongoose.models.AccountReauthenticationGrant ||
  mongoose.model(
    "AccountReauthenticationGrant",
    accountReauthenticationGrantSchema
  );

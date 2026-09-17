const mongoose = require("mongoose");

/*
 * 네이티브 소셜 로그인에서 공급자 인증과 학생 가입 정보 입력 사이를 잇는
 * 짧은 수명의 서버 티켓입니다. 원본 티켓과 공급자 신원은 평문으로 저장하지
 * 않습니다. tokenHash 로만 조회하고, 신원 payload 는 서비스 계층에서
 * AES-256-GCM 으로 봉인합니다.
 */
const nativeSocialRegistrationTicketSchema =
  new mongoose.Schema(
    {
      tokenHash: {
        type: String,
        required: true,
        unique: true,
        select: false,
        immutable: true,
        match: /^[a-f0-9]{64}$/,
      },
      provider: {
        type: String,
        enum: ["apple", "kakao"],
        required: true,
        immutable: true,
      },
      identityDigest: {
        type: String,
        required: true,
        select: false,
        immutable: true,
        match: /^[a-f0-9]{64}$/,
      },
      codeChallenge: {
        type: String,
        required: true,
        select: false,
        immutable: true,
        match: /^[A-Za-z0-9_-]{43}$/,
      },
      existingUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
        immutable: true,
      },
      payloadCiphertext: {
        type: String,
        required: true,
        select: false,
        immutable: true,
        maxlength: 16384,
      },
      payloadIv: {
        type: String,
        required: true,
        select: false,
        immutable: true,
        maxlength: 32,
      },
      payloadTag: {
        type: String,
        required: true,
        select: false,
        immutable: true,
        maxlength: 32,
      },
      status: {
        type: String,
        enum: ["PENDING", "COMPLETED", "REVOKED"],
        default: "PENDING",
        required: true,
      },
      completionAttempt: {
        type: Number,
        min: 0,
        default: 0,
      },
      registrationFingerprint: {
        type: String,
        default: null,
        select: false,
        match: /^[a-f0-9]{64}$/,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      resultCiphertext: {
        type: String,
        default: null,
        select: false,
        maxlength: 2048,
      },
      resultIv: {
        type: String,
        default: null,
        select: false,
        maxlength: 32,
      },
      resultTag: {
        type: String,
        default: null,
        select: false,
        maxlength: 32,
      },
      completedAt: {
        type: Date,
        default: null,
      },
      resultExpiresAt: {
        type: Date,
        default: null,
      },
      expiresAt: {
        type: Date,
        required: true,
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

nativeSocialRegistrationTicketSchema.index({
  provider: 1,
  identityDigest: 1,
  status: 1,
  createdAt: -1,
});
nativeSocialRegistrationTicketSchema.index(
  { userId: 1, status: 1 },
  {
    partialFilterExpression: {
      userId: { $type: "objectId" },
    },
  }
);

module.exports =
  mongoose.models
    .NativeSocialRegistrationTicket ||
  mongoose.model(
    "NativeSocialRegistrationTicket",
    nativeSocialRegistrationTicketSchema
  );

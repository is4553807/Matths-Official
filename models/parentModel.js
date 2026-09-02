const mongoose = require("mongoose");

const { Schema } = mongoose;

const parentAccountSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    usernameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 30,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    childUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    acceptedTermsAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

const parentInviteSchema = new Schema(
  {
    childUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    parentEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    productCode: {
      type: String,
      enum: ["MOCK_EXAM_ONLY", "LEARNING_PACKAGE_29"],
      required: true,
    },
    // 학생이 결제 요청 전 법정대리인의 최종 동의 필요성을 확인했다는 감사 기록입니다.
    legalGuardianConsentAt: {
      type: Date,
      default: null,
    },
    legalGuardianConsentVersion: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    emailDelivery: {
      delivered: { type: Boolean, default: false },
      providerMessageId: { type: String, default: "" },
    },
  },
  { timestamps: true, versionKey: false }
);

parentInviteSchema.index({ childUserId: 1, status: 1, createdAt: -1 });

const parentChildLinkSchema = new Schema(
  {
    parentAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ParentAccount",
      required: true,
      index: true,
    },
    childUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      default: "ACTIVE",
      required: true,
      index: true,
    },
    linkedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    notificationSettings: {
      emailEnabled: {
        type: Boolean,
        default: true,
      },
      lowLearning: {
        enabled: { type: Boolean, default: false },
        minimumMinutesPerDay: {
          type: Number,
          min: 10,
          max: 180,
          default: 20,
        },
        consecutiveDays: {
          type: Number,
          min: 2,
          max: 7,
          default: 3,
        },
      },
      inactivity: {
        enabled: { type: Boolean, default: false },
        days: {
          type: Number,
          min: 3,
          max: 30,
          default: 7,
        },
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true, versionKey: false }
);

parentChildLinkSchema.index(
  { parentAccountId: 1, childUserId: 1 },
  { unique: true }
);
parentChildLinkSchema.index(
  { childUserId: 1 },
  {
    unique: true,
    name: "active_child_parent_unique",
    partialFilterExpression: { status: "ACTIVE" },
  }
);

const parentAlertDeliverySchema = new Schema(
  {
    parentChildLinkId: {
      type: Schema.Types.ObjectId,
      ref: "ParentChildLink",
      required: true,
      index: true,
    },
    parentAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ParentAccount",
      required: true,
      index: true,
    },
    childUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    alertType: {
      type: String,
      enum: ["LOW_LEARNING", "INACTIVITY"],
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "PREVIEW", "FAILED"],
      required: true,
      index: true,
    },
    reasonSnapshot: {
      type: Schema.Types.Mixed,
      default: {},
    },
    providerMessageId: {
      type: String,
      default: "",
    },
    sentAt: {
      type: Date,
      default: null,
    },
    failureMessage: {
      type: String,
      maxlength: 500,
      default: "",
    },
    attemptCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

parentAlertDeliverySchema.index(
  { parentChildLinkId: 1, alertType: 1, dateKey: 1 },
  { unique: true }
);

const checkoutIntentSchema = new Schema(
  {
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    parentAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ParentAccount",
      default: null,
      index: true,
    },
    requestedBy: {
      type: String,
      enum: ["STUDENT", "PARENT"],
      required: true,
    },
    // 실제 학부모 결제 주문 준비 단계에서 다시 받는 동의 기록입니다.
    legalGuardianConsentAt: {
      type: Date,
      default: null,
    },
    legalGuardianConsentVersion: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    // 학생이 본인 결제로 진행할 때 미성년자 결제 안내를 확인한 기록입니다.
    // 실제 법정대리인의 결제 동의와 혼동하지 않도록 별도 필드로 보관합니다.
    minorPaymentNoticeAcceptedAt: {
      type: Date,
      default: null,
    },
    minorPaymentNoticeVersion: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    refundPolicyAcceptedAt: {
      type: Date,
      default: null,
    },
    refundPolicyVersion: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    productCode: {
      type: String,
      enum: ["MOCK_EXAM_ONLY", "LEARNING_PACKAGE_29"],
      required: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      maxlength: 140,
    },
    amount: {
      type: Number,
      min: 0,
      required: true,
    },
    currency: {
      type: String,
      default: "KRW",
      enum: ["KRW"],
    },
    provider: {
      type: String,
      // TOSS는 기존 결제 감사 기록을 읽기 위한 레거시 값입니다. 신규 주문은
      // 반드시 INICIS로 생성되며 토스 API를 다시 호출하지 않습니다.
      enum: ["INICIS", "TOSS"],
      default: "INICIS",
      required: true,
    },
    providerMode: {
      type: String,
      enum: ["TEST", "LIVE"],
      required: true,
    },
    orderId: {
      type: String,
      trim: true,
      minlength: 6,
      maxlength: 64,
      required: true,
    },
    customerKey: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 300,
      required: true,
      select: false,
    },
    confirmIdempotencyKey: {
      type: String,
      trim: true,
      minlength: 6,
      maxlength: 160,
      required: true,
      select: false,
    },
    providerPaymentKey: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
      select: false,
    },
    providerStatus: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    paymentMethod: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    receiptUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    failureCode: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    failureMessage: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "AWAITING_PG",
        "APPROVING",
        "REVIEW_REQUIRED",
        "AWAITING_DEPOSIT",
        "CANCELLED",
        "EXPIRED",
        "PAID",
      ],
      default: "AWAITING_PG",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

checkoutIntentSchema.index({ studentUserId: 1, status: 1, createdAt: -1 });
checkoutIntentSchema.index({ expiresAt: 1, status: 1 });
checkoutIntentSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: "string" } } }
);
checkoutIntentSchema.index(
  { confirmIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { confirmIdempotencyKey: { $type: "string" } },
  }
);

const ParentAccount =
  mongoose.models.ParentAccount ||
  mongoose.model("ParentAccount", parentAccountSchema);
const ParentInvite =
  mongoose.models.ParentInvite ||
  mongoose.model("ParentInvite", parentInviteSchema);
const ParentChildLink =
  mongoose.models.ParentChildLink ||
  mongoose.model("ParentChildLink", parentChildLinkSchema);
const ParentAlertDelivery =
  mongoose.models.ParentAlertDelivery ||
  mongoose.model("ParentAlertDelivery", parentAlertDeliverySchema);
const CheckoutIntent =
  mongoose.models.CheckoutIntent ||
  mongoose.model("CheckoutIntent", checkoutIntentSchema);

module.exports = {
  ParentAccount,
  ParentAlertDelivery,
  ParentChildLink,
  ParentInvite,
  CheckoutIntent,
};

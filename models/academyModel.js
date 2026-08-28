const mongoose = require("mongoose");

const { Schema } = mongoose;

const academySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    nameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "REJECTED", "PAUSED"],
      default: "PENDING",
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

const academyStaffSchema = new Schema(
  {
    academyId: {
      type: Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["OWNER", "TEACHER"],
      default: "TEACHER",
    },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "REJECTED", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
    currentStaffKey: {
      type: String,
      trim: true,
      default: undefined,
      select: false,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

academyStaffSchema.index({ academyId: 1, userId: 1 }, { unique: true });
academyStaffSchema.index(
  { currentStaffKey: 1 },
  {
    unique: true,
    sparse: true,
    name: "current_academy_staff_user_unique",
  }
);
academyStaffSchema.index(
  { userId: 1 },
  {
    unique: true,
    name: "active_academy_staff_user_unique",
    partialFilterExpression: { status: "ACTIVE" },
  }
);

const academyClassSchema = new Schema(
  {
    academyId: {
      type: Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    nameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

academyClassSchema.index(
  { academyId: 1, nameNormalized: 1 },
  { unique: true }
);

const academyStudentMembershipSchema = new Schema(
  {
    academyId: {
      type: Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    studentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activeStudentKey: {
      type: String,
      trim: true,
      default: undefined,
      select: false,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "LEFT"],
      default: "PENDING",
      required: true,
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyClass",
      default: null,
      index: true,
    },
    joinSource: {
      type: String,
      enum: ["PROFILE", "INVITE_CODE", "INVITE_LINK", "ADMIN_ASSIGNMENT"],
      default: "PROFILE",
    },
    inviteId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyInvite",
      default: null,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    dataConsentAt: {
      type: Date,
      required: true,
    },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

academyStudentMembershipSchema.index(
  { academyId: 1, studentUserId: 1 },
  { unique: true }
);
academyStudentMembershipSchema.index(
  { activeStudentKey: 1 },
  { unique: true, sparse: true, name: "active_academy_student_unique" }
);
academyStudentMembershipSchema.index({ academyId: 1, status: 1, requestedAt: 1 });

const academyInviteSchema = new Schema(
  {
    academyId: {
      type: Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "학생 초대",
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^MTH-[A-Z2-9]{6}$/,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyClass",
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    maxUses: {
      type: Number,
      min: 1,
      max: 200,
      default: 30,
    },
    useCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

const Academy = mongoose.models.Academy || mongoose.model("Academy", academySchema);
const AcademyStaff = mongoose.models.AcademyStaff || mongoose.model("AcademyStaff", academyStaffSchema);
const AcademyClass = mongoose.models.AcademyClass || mongoose.model("AcademyClass", academyClassSchema);
const AcademyStudentMembership =
  mongoose.models.AcademyStudentMembership ||
  mongoose.model("AcademyStudentMembership", academyStudentMembershipSchema);
const AcademyInvite = mongoose.models.AcademyInvite || mongoose.model("AcademyInvite", academyInviteSchema);

module.exports = {
  Academy,
  AcademyStaff,
  AcademyClass,
  AcademyStudentMembership,
  AcademyInvite,
};

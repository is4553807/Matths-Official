const mongoose = require("mongoose");

const { Schema } = mongoose;

const academyProfileImageAssetSchema = new Schema(
  {
    storageProvider: {
      type: String,
      enum: ["CLOUDINARY"],
      required: true,
    },
    storagePurpose: {
      type: String,
      enum: ["ACADEMY_PROFILE_IMAGE"],
      required: true,
    },
    cloudPublicId: {
      type: String,
      maxlength: 500,
      required: true,
    },
    cloudResourceType: {
      type: String,
      enum: ["image"],
      default: "image",
    },
    cloudDeliveryType: {
      type: String,
      enum: ["authenticated", "private", "upload"],
      default: "authenticated",
    },
    cloudVersion: {
      type: Number,
      default: null,
    },
    cloudFormat: {
      type: String,
      enum: ["webp"],
      default: "webp",
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

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
    profileImageAsset: {
      type: academyProfileImageAssetSchema,
      default: undefined,
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
    homeroomTeacherUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    coTeacherUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    schedule: {
      weekdays: {
        type: [Number],
        default: [],
        validate: {
          validator: (values) => values.every((value) => Number.isInteger(value) && value >= 0 && value <= 6),
          message: "수업 요일이 올바르지 않습니다.",
        },
      },
      startTime: {
        type: String,
        match: /^([01]\d|2[0-3]):[0-5]\d$/,
        default: "",
      },
      endTime: {
        type: String,
        match: /^([01]\d|2[0-3]):[0-5]\d$/,
        default: "",
      },
      effectiveFrom: {
        type: String,
        match: /^\d{4}-\d{2}-\d{2}$/,
        default: "",
      },
      timezone: {
        type: String,
        enum: ["Asia/Seoul"],
        default: "Asia/Seoul",
      },
    },
    attendancePolicy: {
      mode: {
        type: String,
        enum: ["MANUAL", "SELF_CODE"],
        default: "MANUAL",
      },
      opensBeforeMinutes: {
        type: Number,
        min: 0,
        max: 120,
        default: 10,
      },
      lateAfterMinutes: {
        type: Number,
        min: 0,
        max: 120,
        default: 5,
      },
      closesAfterMinutes: {
        type: Number,
        min: 1,
        max: 240,
        default: 20,
      },
    },
    teacherHistory: {
      type: [new Schema({
        previousTeacherUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        nextTeacherUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        changedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        changedAt: { type: Date, default: Date.now },
      }, { _id: false })],
      default: [],
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

const academyAttendanceSchema = new Schema(
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
    classId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyClass",
      default: null,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyAttendanceSession",
      default: null,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    status: {
      type: String,
      enum: ["PRESENT", "LATE", "ABSENT", "EXCUSED"],
      required: true,
      index: true,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    checkedOutAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    recordedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    source: {
      type: String,
      enum: ["MANUAL", "SELF_CODE", "AUTO_ABSENT", "ADMIN", "SEED"],
      default: "MANUAL",
    },
    seedRunId: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

academyAttendanceSchema.index(
  { sessionId: 1, studentUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { sessionId: { $type: "objectId" } },
    name: "academy_attendance_session_student_unique",
  }
);
academyAttendanceSchema.index(
  { academyId: 1, studentUserId: 1, dateKey: 1 },
  { name: "academy_attendance_legacy_date_lookup" }
);
academyAttendanceSchema.index({ academyId: 1, dateKey: 1, classId: 1, status: 1 });

const academyAttendanceSessionSchema = new Schema(
  {
    academyId: { type: Schema.Types.ObjectId, ref: "Academy", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "AcademyClass", required: true, index: true },
    sessionKey: { type: String, required: true, trim: true, maxlength: 180, unique: true },
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    checkInOpensAt: { type: Date, required: true },
    lateAfterAt: { type: Date, required: true },
    checkInClosesAt: { type: Date, required: true, index: true },
    attendanceMode: { type: String, enum: ["MANUAL", "SELF_CODE"], required: true },
    codeVersion: { type: Number, min: 1, default: 1 },
    codeIssuedAt: { type: Date, default: Date.now },
    rosterStudentUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "OPEN", "CLOSED", "CANCELED"],
      default: "SCHEDULED",
      index: true,
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

academyAttendanceSessionSchema.index({ academyId: 1, classId: 1, dateKey: 1, startsAt: 1 });

const academyAttendanceAuditSchema = new Schema(
  {
    academyId: { type: Schema.Types.ObjectId, ref: "Academy", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "AcademyClass", default: null, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "AcademyAttendanceSession", default: null, index: true },
    attendanceId: { type: Schema.Types.ObjectId, ref: "AcademyAttendance", default: null },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorType: { type: String, enum: ["TEACHER", "STUDENT", "SYSTEM", "ADMIN"], required: true },
    action: { type: String, enum: ["CREATED", "UPDATED", "CLEARED", "AUTO_ABSENT"], required: true },
    previousStatus: { type: String, enum: ["PRESENT", "LATE", "ABSENT", "EXCUSED", null], default: null },
    nextStatus: { type: String, enum: ["PRESENT", "LATE", "ABSENT", "EXCUSED", null], default: null },
    note: { type: String, trim: true, maxlength: 200, default: "" },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, versionKey: false }
);

const academyAttendanceCodeAttemptSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "AcademyAttendanceSession", required: true, index: true },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    failedAttempts: { type: Number, min: 0, default: 0 },
    lastFailedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

academyAttendanceCodeAttemptSchema.index(
  { sessionId: 1, studentUserId: 1 },
  { unique: true, name: "academy_attendance_code_attempt_unique" }
);

const Academy = mongoose.models.Academy || mongoose.model("Academy", academySchema);
const AcademyStaff = mongoose.models.AcademyStaff || mongoose.model("AcademyStaff", academyStaffSchema);
const AcademyClass = mongoose.models.AcademyClass || mongoose.model("AcademyClass", academyClassSchema);
const AcademyStudentMembership =
  mongoose.models.AcademyStudentMembership ||
  mongoose.model("AcademyStudentMembership", academyStudentMembershipSchema);
const AcademyInvite = mongoose.models.AcademyInvite || mongoose.model("AcademyInvite", academyInviteSchema);
const AcademyAttendance =
  mongoose.models.AcademyAttendance ||
  mongoose.model("AcademyAttendance", academyAttendanceSchema);
const AcademyAttendanceSession =
  mongoose.models.AcademyAttendanceSession ||
  mongoose.model("AcademyAttendanceSession", academyAttendanceSessionSchema);
const AcademyAttendanceAudit =
  mongoose.models.AcademyAttendanceAudit ||
  mongoose.model("AcademyAttendanceAudit", academyAttendanceAuditSchema);
const AcademyAttendanceCodeAttempt =
  mongoose.models.AcademyAttendanceCodeAttempt ||
  mongoose.model("AcademyAttendanceCodeAttempt", academyAttendanceCodeAttemptSchema);

module.exports = {
  Academy,
  AcademyStaff,
  AcademyClass,
  AcademyStudentMembership,
  AcademyInvite,
  AcademyAttendance,
  AcademyAttendanceSession,
  AcademyAttendanceAudit,
  AcademyAttendanceCodeAttempt,
};

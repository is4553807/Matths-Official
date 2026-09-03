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
      enum: ["PENDING", "ACTIVE", "REJECTED", "PAUSED", "ARCHIVED"],
      default: "PENDING",
      index: true,
    },
    contractStartsAt: {
      type: Date,
      default: null,
    },
    contractEndsAt: {
      type: Date,
      default: null,
      index: true,
    },
    contractReminderSentAt: {
      type: Date,
      default: null,
    },
    contractReminderForEndsAt: {
      type: Date,
      default: null,
    },
    contractExpiredAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archiveReason: {
      type: String,
      enum: ["CONTRACT_EXPIRED", "TEACHER_ACCESS_REVOKED", null],
      default: null,
    },
    statusBeforeArchive: {
      type: String,
      enum: ["PENDING", "ACTIVE", "PAUSED", null],
      default: null,
    },
    planCode: {
      type: String,
      enum: ["ACADEMY_MOCK_INCLUDED"],
      default: "ACADEMY_MOCK_INCLUDED",
    },
    includesMockExam: {
      type: Boolean,
      default: true,
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
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    lifecycleHistory: {
      type: [new Schema({
        action: { type: String, enum: ["ARCHIVED", "RESTORED"], required: true },
        actedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        actorType: { type: String, enum: ["OWNER", "ADMIN"], required: true },
        occurredAt: { type: Date, default: Date.now },
        unassignedStudentCount: { type: Number, min: 0, default: 0 },
        canceledSessionCount: { type: Number, min: 0, default: 0 },
        revokedInviteCount: { type: Number, min: 0, default: 0 },
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
academyStudentMembershipSchema.index({ classId: 1, status: 1, approvedAt: 1 });

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
    canceledAt: { type: Date, default: null },
    cancellationReason: {
      type: String,
      enum: ["SCHEDULE_CHANGED", "CLASS_ARCHIVED", "CONTRACT_EXPIRED", "TEACHER_ACCESS_REVOKED", null],
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

academySchema.index({ status: 1, contractEndsAt: 1 });

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

const academyClassWeekFileSchema = new Schema(
  {
    originalName: { type: String, required: true, trim: true, maxlength: 240 },
    mimeType: { type: String, required: true, trim: true, maxlength: 160 },
    sizeBytes: { type: Number, required: true, min: 0 },
    storageProvider: { type: String, enum: ["R2", "CLOUDINARY"], required: true },
    storagePurpose: { type: String, enum: ["ACADEMY_ASSIGNMENT"], required: true },
    storedName: { type: String, trim: true, maxlength: 500, default: "" },
    r2ObjectKey: { type: String, trim: true, maxlength: 1000, default: "" },
    r2Sha256: { type: String, trim: true, maxlength: 128, default: "" },
    r2ETag: { type: String, trim: true, maxlength: 300, default: "" },
    cloudPublicId: { type: String, trim: true, maxlength: 500, default: "" },
    cloudResourceType: { type: String, trim: true, maxlength: 30, default: "" },
    cloudDeliveryType: { type: String, trim: true, maxlength: 30, default: "" },
    cloudVersion: { type: Number, default: null },
    cloudFormat: { type: String, trim: true, maxlength: 30, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const academyAssignmentOmrSectionSchema = new Schema(
  {
    startNumber: { type: Number, required: true, min: 1, max: 100 },
    endNumber: { type: Number, required: true, min: 1, max: 100 },
    answerType: {
      type: String,
      enum: ["MULTIPLE_CHOICE", "SHORT_ANSWER"],
      required: true,
    },
    choiceCount: { type: Number, min: 2, max: 9, default: 5 },
  },
  { _id: false, versionKey: false }
);

const academyAssignmentOmrSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    questionCount: { type: Number, required: true, min: 1, max: 100 },
    sections: {
      type: [academyAssignmentOmrSectionSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length >= 1 && items.length <= 100,
        message: "OMR 문항 설정은 1개 이상 100개 이하로 저장해야 합니다.",
      },
    },
    answerKey: {
      type: [String],
      default: [],
      select: false,
    },
    configuredAt: { type: Date, default: Date.now },
    configuredByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    missedSubmissionsFinalizedAt: { type: Date, default: null },
  },
  { _id: false, versionKey: false }
);

const academyClassWeekSchema = new Schema(
  {
    academyId: { type: Schema.Types.ObjectId, ref: "Academy", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "AcademyClass", required: true, index: true },
    academicYear: { type: Number, required: true, min: 2022, max: 2100 },
    weekNumber: { type: Number, required: true, min: 1, max: 60 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    lessonSummary: { type: String, trim: true, maxlength: 2000, default: "" },
    concepts: {
      type: [new Schema({
        curriculumId: { type: String, required: true, trim: true, maxlength: 80 },
        courseId: { type: String, required: true, trim: true, maxlength: 100 },
        courseTitle: { type: String, required: true, trim: true, maxlength: 120 },
        unitId: { type: String, required: true, trim: true, maxlength: 100 },
        unitTitle: { type: String, required: true, trim: true, maxlength: 160 },
        conceptId: { type: String, required: true, trim: true, maxlength: 140 },
        conceptTitle: { type: String, required: true, trim: true, maxlength: 180 },
      }, { _id: false })],
      validate: {
        validator: (items) => Array.isArray(items) && items.length >= 1 && items.length <= 30,
        message: "주차별 개념은 1개 이상 30개 이하로 선택해야 합니다.",
      },
    },
    assignmentTitle: { type: String, required: true, trim: true, maxlength: 120 },
    assignmentInstructions: { type: String, trim: true, maxlength: 3000, default: "" },
    dueAt: { type: Date, default: null },
    files: { type: [academyClassWeekFileSchema], default: [] },
    assignmentOmr: { type: academyAssignmentOmrSchema, default: undefined },
    status: { type: String, enum: ["PUBLISHED", "ARCHIVED"], default: "PUBLISHED", index: true },
    publishedAt: { type: Date, default: Date.now },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

academyClassWeekSchema.index(
  { academyId: 1, classId: 1, academicYear: 1, weekNumber: 1 },
  { unique: true, name: "academy_class_week_unique" }
);
academyClassWeekSchema.index({ classId: 1, status: 1, academicYear: -1, weekNumber: -1 });
academyClassWeekSchema.index(
  {
    status: 1,
    "assignmentOmr.enabled": 1,
    "assignmentOmr.missedSubmissionsFinalizedAt": 1,
    dueAt: 1,
  },
  { name: "academy_assignment_deadline_queue" }
);

const academyAssignmentSubmissionSchema = new Schema(
  {
    academyId: { type: Schema.Types.ObjectId, ref: "Academy", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "AcademyClass", required: true, index: true },
    weekId: { type: Schema.Types.ObjectId, ref: "AcademyClassWeek", required: true, index: true },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answers: { type: [String], default: [] },
    answerModes: {
      type: [{ type: String, enum: ["MULTIPLE_CHOICE", "SHORT_ANSWER"] }],
      default: [],
    },
    answeredCount: { type: Number, min: 0, default: 0 },
    correctByQuestion: { type: [Boolean], default: [] },
    correctCount: { type: Number, min: 0, default: 0 },
    questionCount: { type: Number, min: 1, max: 100, required: true },
    scorePercent: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: ["SUBMITTED", "MISSED"], default: "SUBMITTED", index: true },
    submittedAt: { type: Date, default: null, index: true },
    gradedAt: { type: Date, default: Date.now },
    autoZeroedAt: { type: Date, default: null },
    answerKeyConfiguredAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

academyAssignmentSubmissionSchema.index(
  { weekId: 1, studentUserId: 1 },
  { unique: true, name: "academy_assignment_submission_unique" }
);
academyAssignmentSubmissionSchema.index({ classId: 1, submittedAt: -1 });

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
const AcademyClassWeek =
  mongoose.models.AcademyClassWeek ||
  mongoose.model("AcademyClassWeek", academyClassWeekSchema);
const AcademyAssignmentSubmission =
  mongoose.models.AcademyAssignmentSubmission ||
  mongoose.model("AcademyAssignmentSubmission", academyAssignmentSubmissionSchema);

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
  AcademyClassWeek,
  AcademyAssignmentSubmission,
};

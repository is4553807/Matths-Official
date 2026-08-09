const mongoose = require("mongoose");

const CONTENT_TYPES = Object.freeze([
  "NJE",
  "DAILY_HALF",
  "PRACTICE_MOCK",
  "FINAL",
  "CONCEPT",
  "ERROR_REPORT",
]);

const studyHallAssetSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["THUMBNAIL", "QUESTION_PDF", "SOLUTION_PDF", "CONTENT_FILE"],
      required: true,
    },
    originalName: { type: String, required: true, maxlength: 240 },
    mimeType: { type: String, required: true, maxlength: 120 },
    sizeBytes: { type: Number, default: 0, min: 0 },
    storageProvider: { type: String, enum: ["R2"], default: "R2" },
    r2ObjectKey: { type: String, required: true, maxlength: 900 },
    r2Sha256: { type: String, default: "", match: /^$|^[a-f0-9]{64}$/ },
    r2ETag: { type: String, default: "", maxlength: 200 },
    downloadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const studyHallQuestionSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, min: 1, max: 500 },
    stem: { type: String, default: "", maxlength: 10000 },
    choices: { type: [String], default: [] },
    correctAnswer: { type: String, required: true, maxlength: 100 },
    explanation: { type: String, default: "", maxlength: 20000 },
  },
  { _id: true }
);

const studyHallContentSchema = new mongoose.Schema(
  {
    contentType: { type: String, enum: CONTENT_TYPES, required: true, index: true },
    series: { type: String, default: "", trim: true, maxlength: 120, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    grade: { type: String, enum: ["고2", "고3", "공통"], default: "공통" },
    subject: { type: String, default: "", trim: true, maxlength: 80 },
    itemCount: { type: Number, default: 0, min: 0, max: 500 },
    difficulty: { type: String, default: "", trim: true, maxlength: 80 },
    timeLimitMinutes: { type: Number, default: 0, min: 0, max: 600 },
    recommendedStudyDays: { type: Number, default: 0, min: 0, max: 365 },
    estimatedMinutes: { type: Number, default: 0, min: 0, max: 10000 },
    year: { type: Number, default: 0, min: 0, max: 2200 },
    month: { type: Number, default: 0, min: 0, max: 12 },
    week: { type: Number, default: 0, min: 0, max: 6 },
    session: { type: Number, default: 0, min: 0, max: 100 },
    phase: { type: String, default: "", trim: true, maxlength: 100 },
    finalCategory: { type: String, default: "", trim: true, maxlength: 100 },
    errorCategory: { type: String, default: "", trim: true, maxlength: 100 },
    commonMistake: { type: String, default: "", maxlength: 4000 },
    wrongApproach: { type: String, default: "", maxlength: 8000 },
    correctApproach: { type: String, default: "", maxlength: 8000 },
    relatedProblem: { type: String, default: "", maxlength: 10000 },
    questions: { type: [studyHallQuestionSchema], default: [] },
    assets: { type: [studyHallAssetSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    sortOrder: { type: Number, default: 0, min: 0, max: 100000, index: true },
    publishAt: { type: Date, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

studyHallContentSchema.index({ status: 1, contentType: 1, sortOrder: 1, publishAt: -1 });
studyHallContentSchema.index({ series: 1, contentType: 1, sortOrder: 1 });

const studyHallAnswerSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, min: 1, max: 500 },
    answer: { type: String, default: "", maxlength: 100 },
  },
  { _id: false }
);

const studyHallDownloadSchema = new mongoose.Schema(
  {
    assetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    downloadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const studyHallProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudyHallContent", required: true, index: true },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED"],
      default: "NOT_STARTED",
      index: true,
    },
    answers: { type: [studyHallAnswerSchema], default: [] },
    lastQuestionNumber: { type: Number, default: 0, min: 0, max: 500 },
    answeredCount: { type: Number, default: 0, min: 0, max: 500 },
    correctCount: { type: Number, default: 0, min: 0, max: 500 },
    scorePercent: { type: Number, default: 0, min: 0, max: 100 },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    downloads: { type: [studyHallDownloadSchema], default: [] },
  },
  { timestamps: true }
);

studyHallProgressSchema.index({ userId: 1, contentId: 1 }, { unique: true });

const StudyHallContent = mongoose.models.StudyHallContent
  || mongoose.model("StudyHallContent", studyHallContentSchema);
const StudyHallProgress = mongoose.models.StudyHallProgress
  || mongoose.model("StudyHallProgress", studyHallProgressSchema);

module.exports = { CONTENT_TYPES, StudyHallContent, StudyHallProgress };

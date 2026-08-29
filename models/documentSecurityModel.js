const mongoose = require("mongoose");

const pdfWatermarkIssuanceSchema = new mongoose.Schema(
  {
    issuanceId: { type: String, required: true, unique: true, index: true, maxlength: 80 },
    documentIssueId: { type: String, required: true, unique: true, index: true, maxlength: 100 },
    traceCode: { type: String, required: true, unique: true, index: true, maxlength: 80 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    examId: { type: String, required: true, index: true, maxlength: 180 },
    sourceType: {
      type: String,
      enum: ["ARCHIVE", "WEEKLY_MOCK", "STORE", "STUDY_HALL", "FORMULA", "ACADEMY_ASSIGNMENT"],
      required: true,
      index: true,
    },
    sourceId: { type: String, required: true, index: true, maxlength: 180 },
    assetId: { type: String, default: "", maxlength: 180 },
    academyId: { type: mongoose.Schema.Types.ObjectId, ref: "Academy", default: null, index: true },
    academyClassId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademyClass", default: null, index: true },
    academyClassWeekId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademyClassWeek", default: null },
    academyAssignmentFileId: { type: String, default: "", maxlength: 80 },
    downloaderRole: {
      type: String,
      enum: ["student", "test", "teacher", "admin", ""],
      default: "",
    },
    originalName: { type: String, required: true, maxlength: 300 },
    downloadedAt: { type: Date, required: true, index: true },
    pageCount: { type: Number, min: 0, default: 0 },
    forensicPayloadHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    status: {
      type: String,
      enum: ["GENERATING", "READY", "FAILED"],
      default: "GENERATING",
      index: true,
    },
    failureCode: { type: String, default: "", maxlength: 120 },
  },
  { collection: "pdfWatermarkIssuances", timestamps: true, versionKey: false }
);

pdfWatermarkIssuanceSchema.index({ userId: 1, downloadedAt: -1 });
pdfWatermarkIssuanceSchema.index({ sourceType: 1, sourceId: 1, downloadedAt: -1 });
pdfWatermarkIssuanceSchema.index({ academyId: 1, academyClassId: 1, sourceType: 1, downloadedAt: -1 });
pdfWatermarkIssuanceSchema.index({
  academyId: 1,
  academyClassId: 1,
  sourceType: 1,
  status: 1,
  downloaderRole: 1,
  traceCode: 1,
});

const PdfWatermarkIssuance =
  mongoose.models.PdfWatermarkIssuance ||
  mongoose.model("PdfWatermarkIssuance", pdfWatermarkIssuanceSchema);

module.exports = { PdfWatermarkIssuance };

const mongoose = require("mongoose");

const { Schema } = mongoose;

const problemTypeValidationSchema = new Schema(
  {
    passed: { type: Boolean, default: false },
    sampleCount: { type: Number, min: 0, default: 0 },
    validationMode: {
      type: String,
      enum: ["TYPE_SPECIFIC", "BOUNDED_ENGINE", "PAPER_BLUEPRINT"],
      default: "BOUNDED_ENGINE",
    },
    calculatorFree: { type: Boolean, default: false },
    answerVerified: { type: Boolean, default: false },
    failures: { type: [String], default: [] },
    validatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const problemTypeVersionSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["CONCEPT_PRACTICE", "ASSESSMENT_CENTER", "PLACEMENT_EXAM"],
      required: true,
      index: true,
    },
    engineKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 360,
    },
    revision: { type: Number, min: 1, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "RETIRED"],
      default: "ACTIVE",
      index: true,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 240 },
    courseId: { type: String, trim: true, maxlength: 100, default: "" },
    unitId: { type: String, trim: true, maxlength: 140, default: "" },
    conceptId: { type: String, trim: true, maxlength: 140, default: "" },
    sourceFile: { type: String, trim: true, maxlength: 500, default: "" },
    sourceHash: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },
    sourceSnapshot: { type: String, required: true, maxlength: 24000 },
    enabled: { type: Boolean, default: true, index: true },
    selectionWeight: { type: Number, min: 1, max: 100, default: 1 },
    calculatorPolicyId: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "CALCULATOR_FREE_BOUNDED_V1",
    },
    operatorNote: { type: String, trim: true, maxlength: 1000, default: "" },
    validationReport: {
      type: problemTypeValidationSchema,
      default: () => ({}),
    },
    basedOnVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ProblemTypeVersion",
      default: null,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    retiredAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

problemTypeVersionSchema.index(
  { category: 1, engineKey: 1, revision: 1 },
  { unique: true, name: "problem_type_revision_unique" }
);
problemTypeVersionSchema.index(
  { category: 1, engineKey: 1, status: 1 },
  {
    unique: true,
    name: "problem_type_active_unique",
    partialFilterExpression: { status: "ACTIVE" },
  }
);

const ProblemTypeVersion =
  mongoose.models.ProblemTypeVersion ||
  mongoose.model("ProblemTypeVersion", problemTypeVersionSchema);

module.exports = { ProblemTypeVersion };

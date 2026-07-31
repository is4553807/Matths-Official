const mongoose = require("mongoose");

const { Schema } = mongoose;

const dataAnalysisSchema = new Schema(
  {
    kind: {
      type: String,
      enum: [
        "METRIC_DEFINITION",
        "ASSUMPTION",
        "OBSERVATION",
        "POLICY_SNAPSHOT",
      ],
      required: true,
      index: true,
    },
    metricKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
      index: true,
    },
    unit: {
      type: String,
      trim: true,
      maxlength: 40,
      required: true,
    },
    periodKey: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "CATALOG",
      index: true,
    },
    numericValue: {
      type: Number,
      default: null,
    },
    numerator: {
      type: Number,
      min: 0,
      default: null,
    },
    denominator: {
      type: Number,
      min: 0,
      default: null,
    },
    sampleSize: {
      type: Number,
      min: 0,
      default: 0,
    },
    minimumSampleSize: {
      type: Number,
      min: 0,
      default: 100,
    },
    dimensionNames: {
      type: [String],
      default: [],
    },
    dimensions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    dimensionKey: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "_all",
    },
    policyVersionCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
      index: true,
    },
    source: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "operator",
    },
    measuredAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  {
    collection: "dataAnalysis",
    timestamps: true,
    versionKey: false,
  }
);

dataAnalysisSchema.index(
  {
    kind: 1,
    metricKey: 1,
    periodKey: 1,
    dimensionKey: 1,
    policyVersionCode: 1,
  },
  { unique: true }
);
dataAnalysisSchema.index({
  periodKey: 1,
  category: 1,
  metricKey: 1,
});

const DataAnalysis =
  mongoose.models.DataAnalysis ||
  mongoose.model(
    "DataAnalysis",
    dataAnalysisSchema
  );

module.exports = {
  DataAnalysis,
};


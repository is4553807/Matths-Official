const mongoose = require("mongoose");

const storeAssetSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["THUMBNAIL", "DETAIL_IMAGE", "PRODUCT_FILE"],
      required: true,
    },
    originalName: { type: String, required: true, maxlength: 240 },
    storedName: { type: String, required: true, maxlength: 300 },
    mimeType: { type: String, required: true, maxlength: 120 },
    sizeBytes: { type: Number, default: 0, min: 0 },
    storageProvider: {
      type: String,
      enum: ["R2"],
      default: "R2",
    },
    r2ObjectKey: { type: String, default: "", maxlength: 900 },
    r2Sha256: {
      type: String,
      default: "",
      match: /^$|^[a-f0-9]{64}$/,
    },
    r2ETag: { type: String, default: "", maxlength: 200 },
    altText: { type: String, default: "", maxlength: 180 },
    downloadCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const storeDetailBlockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["TEXT", "IMAGE"], required: true },
    text: { type: String, default: "", maxlength: 8000 },
    fontSize: {
      type: String,
      enum: ["small", "normal", "large", "title"],
      default: "normal",
    },
    color: { type: String, default: "#e9edf3", maxlength: 7 },
    bold: { type: Boolean, default: false },
    underline: { type: Boolean, default: false },
    align: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },
    assetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    caption: { type: String, default: "", maxlength: 300 },
  },
  { _id: true }
);

const storeProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true, maxlength: 150 },
    category: { type: String, default: "교재", trim: true, maxlength: 60 },
    badge: { type: String, default: "", trim: true, maxlength: 50 },
    subtitle: { type: String, default: "", trim: true, maxlength: 180 },
    summary: { type: String, default: "", trim: true, maxlength: 1000 },
    price: { type: Number, required: true, min: 0, max: 100000000 },
    originalPrice: { type: Number, default: 0, min: 0, max: 100000000 },
    bundleItems: [
      {
        name: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, default: "", trim: true, maxlength: 500 },
      },
    ],
    assets: { type: [storeAssetSchema], default: [] },
    detailBlocks: { type: [storeDetailBlockSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    viewCount: { type: Number, default: 0, min: 0 },
    salesCount: { type: Number, default: 0, min: 0 },
    freeDownloadCount: { type: Number, default: 0, min: 0 },
    popularityScore: { type: Number, default: 0, min: 0 },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

storeProductSchema.index({ status: 1, popularityScore: -1, createdAt: -1 });
storeProductSchema.index({ name: "text", subtitle: "text", summary: "text", category: "text" });

const StoreProduct =
  mongoose.models.StoreProduct || mongoose.model("StoreProduct", storeProductSchema);

const storeCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
    slug: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
    sortOrder: { type: Number, required: true, min: 0, max: 10000, index: true },
    isVisible: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

storeCategorySchema.index({ isVisible: 1, sortOrder: 1, name: 1 });

const StoreCategory =
  mongoose.models.StoreCategory || mongoose.model("StoreCategory", storeCategorySchema);

module.exports = { StoreCategory, StoreProduct };

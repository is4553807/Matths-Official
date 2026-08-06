const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { StoreCategory, StoreProduct } = require("../models/storeModel");
const {
  assertR2Configured,
  createR2ObjectKey,
  deleteR2Object,
  signedR2Url,
  uploadLocalFileToR2,
} = require("./r2ObjectStorageService");

const LEGACY_STORE_STORAGE_DIR = path.resolve(
  process.env.STORE_STORAGE_DIR || path.join(__dirname, "..", "storage", "store")
);

function httpError(status, message, code = "STORE_REQUEST_FAILED") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanText(value, maxLength = 1000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugBase(value) {
  const base = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return base || "matths-product";
}

const DEFAULT_STORE_CATEGORIES = ["진단", "N제", "모의고사", "파이널", "커리큘럼"];

async function ensureDefaultStoreCategories() {
  const categoryCount = await StoreCategory.estimatedDocumentCount();
  if (categoryCount > 0) return;
  await StoreCategory.bulkWrite(
    DEFAULT_STORE_CATEGORIES.map((name, index) => ({
      updateOne: {
        filter: { name },
        update: {
          $setOnInsert: {
            name,
            slug: slugBase(name),
            sortOrder: index,
            isVisible: true,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  ).catch((error) => {
    if (error?.code !== 11000) throw error;
  });
}

async function listStoreCategories({ includeHidden = false } = {}) {
  await ensureDefaultStoreCategories();
  const categories = await StoreCategory.find(includeHidden ? {} : { isVisible: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return categories.map((category) => ({
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    sortOrder: Number(category.sortOrder) || 0,
    isVisible: category.isVisible !== false,
  }));
}

async function uniqueSlug(name, excludeId = null) {
  const base = slugBase(name);
  for (let index = 0; index < 1000; index += 1) {
    const slug = index ? `${base}-${index + 1}` : base;
    const filter = { slug };
    if (excludeId) filter._id = { $ne: excludeId };
    if (!(await StoreProduct.exists(filter))) return slug;
  }
  return `${base}-${Date.now()}`;
}

function parseBundleItems(value) {
  return cleanText(value, 12000)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const [name, ...descriptionParts] = line.split("|");
      return {
        name: cleanText(name, 160),
        description: cleanText(descriptionParts.join("|"), 500),
      };
    })
    .filter((item) => item.name);
}

function validColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "#e9edf3";
}

function parseDetailBlocks(value) {
  let blocks = [];
  try {
    blocks = JSON.parse(String(value || "[]"));
  } catch (_error) {
    throw httpError(400, "상세 설명 편집 데이터가 올바르지 않습니다.", "INVALID_STORE_DETAIL");
  }
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 120).flatMap((block) => {
    if (block?.type !== "TEXT") return [];
    const text = cleanText(block.text, 8000);
    if (!text) return [];
    return [{
      type: "TEXT",
      text,
      fontSize: ["small", "normal", "large", "title"].includes(block.fontSize)
        ? block.fontSize : "normal",
      color: validColor(block.color),
      bold: block.bold === true,
      underline: block.underline === true,
      align: ["left", "center", "right"].includes(block.align) ? block.align : "left",
    }];
  });
}

function numberField(value, label, { min = 0, max = 100000000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw httpError(400, `${label}을(를) 올바르게 입력해주세요.`);
  }
  return Math.round(number);
}

async function fileAsset(file, kind, ownerId) {
  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  const imageMimeByExtension = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const originalName = path.basename(String(file.originalname || "file"));
  const objectKey = createR2ObjectKey({
    namespace: "store",
    ownerId,
    kind,
    originalName,
  });
  const stored = await uploadLocalFileToR2({
    filePath: file.path,
    objectKey,
    contentType: kind === "PRODUCT_FILE"
      ? String(file.mimetype || "application/octet-stream")
      : imageMimeByExtension[extension] || "application/octet-stream",
    metadata: { assetkind: String(kind).toLowerCase() },
  });
  return {
    kind,
    originalName,
    storedName: path.basename(String(file.filename || "")),
    mimeType: kind === "PRODUCT_FILE"
      ? String(file.mimetype || "application/octet-stream")
      : imageMimeByExtension[extension] || "application/octet-stream",
    sizeBytes: stored.sizeBytes || Number(file.size) || 0,
    storageProvider: "R2",
    r2ObjectKey: stored.r2ObjectKey,
    r2Sha256: stored.r2Sha256,
    r2ETag: stored.r2ETag,
    altText: kind === "THUMBNAIL" ? "상품 썸네일" : "상품 상세 이미지",
  };
}

async function deleteStoreAsset(asset) {
  if (asset?.storageProvider === "R2" && asset?.r2ObjectKey) {
    return deleteR2Object(asset.r2ObjectKey);
  }
  if (asset?.storedName) {
    await fs.promises
      .unlink(path.join(LEGACY_STORE_STORAGE_DIR, path.basename(asset.storedName)))
      .catch(() => {});
  }
  return { deleted: true };
}

async function assertValidUploadedImages(files = {}) {
  const images = [...(files.thumbnail || []), ...(files.detailImages || [])];
  for (const file of images) {
    const handle = await fs.promises.open(file.path, "r");
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const bytes = header.subarray(0, bytesRead);
      const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
      const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isWebp = bytes.length >= 12
        && bytes.subarray(0, 4).toString("ascii") === "RIFF"
        && bytes.subarray(8, 12).toString("ascii") === "WEBP";
      if (!isPng && !isJpeg && !isWebp) {
        throw httpError(400, "이미지로 확인할 수 없는 파일이 포함되어 있습니다.", "INVALID_STORE_IMAGE");
      }
    } finally {
      await handle.close();
    }
  }
}

function serializeAsset(asset) {
  return {
    id: String(asset._id),
    kind: asset.kind,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.sizeBytes) || 0,
    storageProvider: asset.storageProvider || "LOCAL",
    altText: asset.altText || "",
    downloadCount: Number(asset.downloadCount) || 0,
  };
}

function serializeProduct(product, { admin = false } = {}) {
  const allAssets = (product.assets || []).map(serializeAsset);
  const assets = admin
    ? allAssets
    : allAssets.filter((asset) => asset.kind !== "PRODUCT_FILE");
  const thumbnail = assets.find((asset) => asset.kind === "THUMBNAIL") || null;
  const freeDownloadFiles = !admin && Number(product.price) === 0 && product.status === "PUBLISHED"
    ? allAssets.filter((asset) => asset.kind === "PRODUCT_FILE")
    : [];
  const detailBlocks = (product.detailBlocks || []).map((block) => ({
    id: String(block._id), type: block.type, text: block.text || "",
    fontSize: block.fontSize || "normal", color: validColor(block.color),
    bold: block.bold === true, underline: block.underline === true,
    align: block.align || "left", assetId: block.assetId ? String(block.assetId) : null,
    caption: block.caption || "",
  }));
  return {
    id: String(product._id), name: product.name, slug: product.slug,
    category: product.category || "교재", badge: product.badge || "",
    subtitle: product.subtitle || "", summary: product.summary || "",
    price: Number(product.price) || 0, originalPrice: Number(product.originalPrice) || 0,
    bundleItems: (product.bundleItems || []).map((item) => ({ name: item.name, description: item.description || "" })),
    thumbnail, assets, detailBlocks, status: product.status,
    viewCount: Number(product.viewCount) || 0, salesCount: Number(product.salesCount) || 0,
    freeDownloadCount: Number(product.freeDownloadCount) || 0,
    popularityScore: Number(product.popularityScore) || 0,
    freeDownloadFiles,
    createdAt: product.createdAt, updatedAt: product.updatedAt, publishedAt: product.publishedAt,
    ...(admin ? { productFiles: allAssets.filter((asset) => asset.kind === "PRODUCT_FILE") } : {}),
  };
}

async function listPublishedProducts({ query = "", sort = "popular", category = "" } = {}) {
  const filter = { status: "PUBLISHED" };
  const categories = await listStoreCategories();
  const cleanQuery = cleanText(query, 80);
  const normalizedCategory = categories.some((item) => item.name === String(category || ""))
    ? String(category)
    : "";
  if (normalizedCategory) filter.category = normalizedCategory;
  if (cleanQuery) {
    const pattern = new RegExp(escapeRegex(cleanQuery), "i");
    filter.$or = [{ name: pattern }, { subtitle: pattern }, { summary: pattern }, { category: pattern }];
  }
  const sorts = {
    popular: { popularityScore: -1, salesCount: -1, viewCount: -1, createdAt: -1 },
    price_asc: { price: 1, createdAt: -1 },
    price_desc: { price: -1, createdAt: -1 },
    newest: { publishedAt: -1, createdAt: -1 },
  };
  const normalizedSort = Object.prototype.hasOwnProperty.call(sorts, sort) ? sort : "popular";
  const products = await StoreProduct.find(filter).sort(sorts[normalizedSort]).lean();
  return {
    products: products.map((product) => serializeProduct(product)),
    query: cleanQuery,
    sort: normalizedSort,
    category: normalizedCategory,
    categories,
  };
}

async function getPublishedProduct(slug) {
  const product = await StoreProduct.findOne({ slug: String(slug || ""), status: "PUBLISHED" }).lean();
  if (!product) throw httpError(404, "판매 중인 상품을 찾을 수 없습니다.", "STORE_PRODUCT_NOT_FOUND");
  await StoreProduct.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } });
  product.viewCount = Number(product.viewCount || 0) + 1;
  return {
    product: serializeProduct(product),
    categories: await listStoreCategories(),
  };
}

async function getAdminStoreData({ editId = "" } = {}) {
  const [products, categories] = await Promise.all([
    StoreProduct.find({}).sort({ status: 1, updatedAt: -1 }).lean(),
    listStoreCategories({ includeHidden: true }),
  ]);
  const editing = mongoose.isValidObjectId(editId)
    ? products.find((product) => String(product._id) === String(editId)) : null;
  const productCountByCategory = products.reduce((counts, product) => {
    counts[product.category] = Number(counts[product.category] || 0) + 1;
    return counts;
  }, {});
  return {
    products: products.map((product) => serializeProduct(product, { admin: true })),
    editing: editing ? serializeProduct(editing, { admin: true }) : null,
    categories: categories.map((category) => ({
      ...category,
      productCount: Number(productCountByCategory[category.name] || 0),
    })),
  };
}

async function saveProduct({ productId = "", input, files, adminUserId }) {
  if (!mongoose.isValidObjectId(adminUserId)) throw httpError(403, "운영자 정보를 확인할 수 없습니다.");
  await assertValidUploadedImages(files);
  const existing = productId && mongoose.isValidObjectId(productId)
    ? await StoreProduct.findById(productId) : null;
  if (productId && !existing) throw httpError(404, "수정할 상품을 찾을 수 없습니다.");
  const name = cleanText(input.name, 120);
  if (!name) throw httpError(400, "묶음 상품 이름을 입력해주세요.");
  await ensureDefaultStoreCategories();
  const categoryName = cleanText(input.category, 40);
  const categoryExists = categoryName && await StoreCategory.exists({ name: categoryName });
  if (!categoryExists) throw httpError(400, "등록된 상점 카테고리를 선택해주세요.", "INVALID_STORE_CATEGORY");
  const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(input.status) ? input.status : "DRAFT";
  const detailBlocks = parseDetailBlocks(input.detailBlocksJson);
  const price = numberField(input.price, "판매 가격");
  const originalPrice = input.originalPrice === "" ? 0 : numberField(input.originalPrice, "정가");
  const popularityScore = input.popularityScore === ""
    ? 0
    : numberField(input.popularityScore, "인기 점수", { max: 1000000 });
  const removeAssetIds = new Set(
    (Array.isArray(input.removeAssetIds) ? input.removeAssetIds : input.removeAssetIds ? [input.removeAssetIds] : [])
      .map(String)
      .filter((id) => mongoose.isValidObjectId(id))
  );
  const existingAssets = existing ? existing.assets.map((asset) => asset.toObject()) : [];
  const removedAssets = existingAssets.filter((asset) => removeAssetIds.has(String(asset._id)));
  const nextAssets = existingAssets.filter((asset) => !removeAssetIds.has(String(asset._id)));
  const newThumbnail = files?.thumbnail?.[0];
  let replacedThumbnails = [];
  const incomingFiles = [
    ...(newThumbnail ? [{ file: newThumbnail, kind: "THUMBNAIL" }] : []),
    ...(files?.productFiles || []).map((file) => ({ file, kind: "PRODUCT_FILE" })),
    ...(files?.detailImages || []).map((file) => ({ file, kind: "DETAIL_IMAGE" })),
  ];
  if (!newThumbnail && !nextAssets.some((asset) => asset.kind === "THUMBNAIL")) {
    throw httpError(400, "상품 썸네일을 1장 업로드해주세요.");
  }
  if (incomingFiles.length) assertR2Configured();

  const uploadedAssets = [];
  try {
    for (const entry of incomingFiles) {
      uploadedAssets.push(await fileAsset(entry.file, entry.kind, existing?._id || adminUserId));
    }
    if (newThumbnail) {
      replacedThumbnails = nextAssets.filter((asset) => asset.kind === "THUMBNAIL");
      for (let index = nextAssets.length - 1; index >= 0; index -= 1) {
        if (nextAssets[index].kind === "THUMBNAIL") nextAssets.splice(index, 1);
      }
    }
    nextAssets.push(...uploadedAssets);

    const document = existing || new StoreProduct({ createdBy: adminUserId });
    document.name = name;
    document.slug = await uniqueSlug(name, existing?._id || null);
    document.category = categoryName;
    document.badge = cleanText(input.badge, 50);
    document.subtitle = cleanText(input.subtitle, 180);
    document.summary = cleanText(input.summary, 1000);
    document.price = price;
    document.originalPrice = originalPrice;
    document.bundleItems = parseBundleItems(input.bundleItems);
    document.assets = nextAssets;
    document.detailBlocks = detailBlocks;
    document.assets
      .filter((asset) => asset.kind === "DETAIL_IMAGE")
      .forEach((asset) => {
        document.detailBlocks.push({ type: "IMAGE", assetId: asset._id, caption: "" });
      });
    document.status = status;
    document.popularityScore = popularityScore;
    document.updatedBy = adminUserId;
    if (status === "PUBLISHED" && !document.publishedAt) document.publishedAt = new Date();
    await document.save();
    await Promise.all(
      [...removedAssets, ...replacedThumbnails]
        .filter((asset, index, collection) =>
          collection.findIndex((candidate) => String(candidate._id) === String(asset._id)) === index
        )
        .map((asset) => deleteStoreAsset(asset).catch(() => {}))
    );
    await discardUploadedFiles(files);
    return serializeProduct(document.toObject(), { admin: true });
  } catch (error) {
    await Promise.all(uploadedAssets.map((asset) => deleteStoreAsset(asset).catch(() => {})));
    throw error;
  }
}

async function deleteProduct(productId) {
  if (!mongoose.isValidObjectId(productId)) throw httpError(404, "삭제할 상품을 찾을 수 없습니다.");
  const product = await StoreProduct.findById(productId).lean();
  if (!product) throw httpError(404, "삭제할 상품을 찾을 수 없습니다.");
  const deletion = await StoreProduct.deleteOne({ _id: product._id });
  if (deletion.deletedCount !== 1) throw httpError(409, "상품 삭제 상태가 변경되었습니다. 다시 시도해주세요.");
  await Promise.all((product.assets || []).map((asset) => deleteStoreAsset(asset)));
}

async function createStoreCategory({ input, adminUserId }) {
  if (!mongoose.isValidObjectId(adminUserId)) throw httpError(403, "운영자 정보를 확인할 수 없습니다.");
  const name = cleanText(input.name, 40);
  if (!name) throw httpError(400, "카테고리 이름을 입력해주세요.");
  await ensureDefaultStoreCategories();
  const duplicate = await StoreCategory.exists({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
  if (duplicate) throw httpError(409, "이미 같은 이름의 카테고리가 있습니다.", "STORE_CATEGORY_DUPLICATE");
  const last = await StoreCategory.findOne({}).sort({ sortOrder: -1 }).select({ sortOrder: 1 }).lean();
  const baseSlug = slugBase(name);
  let slug = baseSlug;
  for (let index = 2; await StoreCategory.exists({ slug }); index += 1) slug = `${baseSlug}-${index}`;
  const category = await StoreCategory.create({
    name,
    slug,
    sortOrder: Number(last?.sortOrder || 0) + 1,
    isVisible: true,
    createdBy: adminUserId,
    updatedBy: adminUserId,
  });
  return { id: String(category._id), name: category.name };
}

async function updateStoreCategory({ categoryId, input, adminUserId }) {
  if (!mongoose.isValidObjectId(adminUserId)) throw httpError(403, "운영자 정보를 확인할 수 없습니다.");
  if (!mongoose.isValidObjectId(categoryId)) throw httpError(404, "카테고리를 찾을 수 없습니다.");
  const category = await StoreCategory.findById(categoryId);
  if (!category) throw httpError(404, "카테고리를 찾을 수 없습니다.");
  const name = cleanText(input.name, 40);
  if (!name) throw httpError(400, "카테고리 이름을 입력해주세요.");
  const duplicate = await StoreCategory.exists({
    _id: { $ne: category._id },
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  });
  if (duplicate) throw httpError(409, "이미 같은 이름의 카테고리가 있습니다.", "STORE_CATEGORY_DUPLICATE");
  const previousName = category.name;
  if (previousName !== name) {
    const baseSlug = slugBase(name);
    let slug = baseSlug;
    for (let index = 2; await StoreCategory.exists({ _id: { $ne: category._id }, slug }); index += 1) {
      slug = `${baseSlug}-${index}`;
    }
    category.name = name;
    category.slug = slug;
  }
  category.isVisible = input.isVisible === "on" || input.isVisible === "true" || input.isVisible === true;
  category.updatedBy = adminUserId;
  await category.save();
  if (previousName !== name) await StoreProduct.updateMany({ category: previousName }, { $set: { category: name } });
  return { id: String(category._id), name: category.name };
}

async function deleteStoreCategory(categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) throw httpError(404, "카테고리를 찾을 수 없습니다.");
  const category = await StoreCategory.findById(categoryId).lean();
  if (!category) throw httpError(404, "카테고리를 찾을 수 없습니다.");
  const categoryCount = await StoreCategory.countDocuments({});
  if (categoryCount <= 1) throw httpError(409, "상점에는 최소 1개의 카테고리가 필요합니다.", "LAST_STORE_CATEGORY");
  const connectedProducts = await StoreProduct.countDocuments({ category: category.name });
  if (connectedProducts > 0) {
    throw httpError(409, `이 카테고리에 연결된 상품이 ${connectedProducts}개 있습니다. 상품 분류를 먼저 변경해주세요.`, "STORE_CATEGORY_IN_USE");
  }
  await StoreCategory.deleteOne({ _id: category._id });
}

async function reorderStoreCategories({ categoryOrderJson, adminUserId }) {
  if (!mongoose.isValidObjectId(adminUserId)) throw httpError(403, "운영자 정보를 확인할 수 없습니다.");
  let categoryIds;
  try {
    categoryIds = JSON.parse(String(categoryOrderJson || "[]"));
  } catch (_error) {
    throw httpError(400, "카테고리 순서 데이터가 올바르지 않습니다.");
  }
  if (!Array.isArray(categoryIds)) throw httpError(400, "카테고리 순서 데이터가 올바르지 않습니다.");
  const uniqueIds = [...new Set(categoryIds.map(String))];
  if (uniqueIds.length !== categoryIds.length || uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw httpError(400, "카테고리 순서 데이터가 올바르지 않습니다.");
  }
  const existingIds = (await StoreCategory.find({}).select({ _id: 1 }).lean()).map((item) => String(item._id));
  if (uniqueIds.length !== existingIds.length || existingIds.some((id) => !uniqueIds.includes(id))) {
    throw httpError(409, "카테고리 목록이 변경되었습니다. 새로고침 후 다시 정렬해주세요.");
  }
  await StoreCategory.bulkWrite(uniqueIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { sortOrder: index, updatedBy: adminUserId } },
    },
  })));
}

async function getFreeProductDownload({ slug, assetId }) {
  if (!mongoose.isValidObjectId(assetId)) throw httpError(404, "다운로드 자료를 찾을 수 없습니다.");
  const product = await StoreProduct.findOne({
    slug: String(slug || ""),
    status: "PUBLISHED",
    price: 0,
    "assets._id": assetId,
  }).lean();
  const asset = product?.assets?.find((item) => String(item._id) === String(assetId));
  if (!asset || asset.kind !== "PRODUCT_FILE") {
    throw httpError(403, "무료로 공개된 자료만 결제 없이 다운로드할 수 있습니다.", "FREE_DOWNLOAD_NOT_ALLOWED");
  }
  const signedUrl = await signedR2Url(asset, {
    download: true,
    originalName: asset.originalName,
  });
  const filePath = asset.storageProvider === "R2"
    ? null
    : path.join(LEGACY_STORE_STORAGE_DIR, path.basename(asset.storedName));
  if (!signedUrl && (!filePath || !fs.existsSync(filePath))) {
    throw httpError(404, "저장된 자료 원본을 찾을 수 없습니다.");
  }
  await StoreProduct.updateOne(
    { _id: product._id, "assets._id": assetId },
    { $inc: { freeDownloadCount: 1, "assets.$.downloadCount": 1 } }
  );
  return {
    filePath,
    signedUrl,
    originalName: path.basename(String(asset.originalName || "matths-resource")),
    mimeType: String(asset.mimeType || "application/octet-stream"),
    sourceRecord: asset,
    sourceId: String(product._id),
    examId: `STORE:${product._id}`,
    assetId: String(asset._id),
  };
}

async function getStoreMedia({ productId, assetId, admin = false }) {
  if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(assetId)) {
    throw httpError(404, "이미지를 찾을 수 없습니다.");
  }
  const product = await StoreProduct.findOne({
    _id: productId,
    ...(admin ? {} : { status: "PUBLISHED" }),
    "assets._id": assetId,
  }).lean();
  const asset = product?.assets?.find((item) => String(item._id) === String(assetId));
  if (!asset || !["THUMBNAIL", "DETAIL_IMAGE"].includes(asset.kind)) throw httpError(404, "이미지를 찾을 수 없습니다.");
  const signedUrl = await signedR2Url(asset, {
    download: false,
    originalName: asset.originalName,
  });
  const filePath = asset.storageProvider === "R2"
    ? null
    : path.join(LEGACY_STORE_STORAGE_DIR, path.basename(asset.storedName));
  if (!signedUrl && (!filePath || !fs.existsSync(filePath))) {
    throw httpError(404, "저장된 이미지 원본을 찾을 수 없습니다.");
  }
  return { filePath, signedUrl, mimeType: asset.mimeType, originalName: asset.originalName };
}

async function discardUploadedFiles(files = {}) {
  const uploaded = Object.values(files).flat().filter(Boolean);
  await Promise.all(uploaded.map((file) => fs.promises.unlink(file.path).catch(() => {})));
}

module.exports = {
  createStoreCategory, deleteProduct, deleteStoreCategory, discardUploadedFiles,
  getAdminStoreData, getFreeProductDownload, getPublishedProduct, getStoreMedia,
  listPublishedProducts, listStoreCategories, reorderStoreCategories, saveProduct,
  updateStoreCategory,
};

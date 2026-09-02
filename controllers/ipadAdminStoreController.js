"use strict";

const {
  archiveStudyHallContent,
  discardStudyHallUploads,
  listAdminStudyHall,
  saveStudyHallContent,
} = require("../services/studyHallService");
const {
  createStoreCategory,
  deleteProduct,
  deleteStoreCategory,
  discardUploadedFiles,
  getAdminStoreData,
  reorderStoreCategories,
  saveProduct,
  updateStoreCategory,
} = require("../services/storeService");

const SCHEMA_VERSION = "ADMIN_STORE_NATIVE_V1";
function statusError(status, message) { const error = new Error(message); error.status = status; return error; }
function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") throw statusError(403, "관리자만 수험관과 상점을 편집할 수 있습니다.");
  return req.apiUser;
}
function noStore(res) { res.set("Cache-Control", "private, no-store"); }
async function data() {
  const [studyHall, store] = await Promise.all([listAdminStudyHall(), getAdminStoreData()]);
  return { studyHall, store };
}
async function result(res, extra = {}) {
  noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, ...extra, dashboard: await data() });
}

exports.dashboard = async (req, res, next) => {
  try { requireAdmin(req); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, dashboard: await data() }); }
  catch (error) { return next(error); }
};
exports.saveStudyHall = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const content = await saveStudyHallContent({ contentId: req.params.contentId || "", input: req.body || {}, files: req.files || {}, adminUserId: admin._id || admin.id });
    return result(res, { contentId: content.id });
  } catch (error) {
    await discardStudyHallUploads(req.files || {}); return next(error);
  }
};
exports.archiveStudyHall = async (req, res, next) => {
  try { const admin = requireAdmin(req); await archiveStudyHallContent(req.params.contentId, admin._id || admin.id); return result(res); }
  catch (error) { return next(error); }
};
exports.saveProduct = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const product = await saveProduct({ productId: req.params.productId || "", input: req.body || {}, files: req.files || {}, adminUserId: admin._id || admin.id });
    return result(res, { productId: product.id });
  } catch (error) {
    await discardUploadedFiles(req.files || {}); return next(error);
  }
};
exports.deleteProduct = async (req, res, next) => {
  try { requireAdmin(req); await deleteProduct(req.params.productId); return result(res); }
  catch (error) { return next(error); }
};
exports.createCategory = async (req, res, next) => {
  try { const admin = requireAdmin(req); await createStoreCategory({ input: req.body || {}, adminUserId: admin._id || admin.id }); return result(res); }
  catch (error) { return next(error); }
};
exports.updateCategory = async (req, res, next) => {
  try { const admin = requireAdmin(req); await updateStoreCategory({ categoryId: req.params.categoryId, input: req.body || {}, adminUserId: admin._id || admin.id }); return result(res); }
  catch (error) { return next(error); }
};
exports.deleteCategory = async (req, res, next) => {
  try { requireAdmin(req); await deleteStoreCategory(req.params.categoryId); return result(res); }
  catch (error) { return next(error); }
};
exports.reorderCategories = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const raw = Array.isArray(req.body?.categoryIds) ? JSON.stringify(req.body.categoryIds) : req.body?.categoryOrderJson;
    await reorderStoreCategories({ categoryOrderJson: raw, adminUserId: admin._id || admin.id });
    return result(res);
  } catch (error) { return next(error); }
};

"use strict";

const {
  createArchiveFolder,
  createArchiveItems,
  deleteArchiveFolder,
  deleteArchiveItem,
  deleteArchiveItems,
  discardArchiveUpload,
  getArchiveData,
  moveArchiveItems,
  purgeArchiveItem,
  restoreArchiveItem,
  setArchiveFolderPinned,
  updateArchiveFolder,
} = require("../services/archiveService");
const { createAnnouncement } = require("../services/adminService");

const SCHEMA_VERSION = "ADMIN_ARCHIVE_NATIVE_V1";
function statusError(status, message) { const error = new Error(message); error.status = status; return error; }
function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") throw statusError(403, "관리자만 자료실을 편집할 수 있습니다.");
  return req.apiUser;
}
function noStore(res) { res.set("Cache-Control", "private, no-store"); }
async function archive(user, folderId = "") { return getArchiveData(user, { includeUnpublished: true, folderId }); }
async function result(res, user, folderId = "", extra = {}) {
  noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, ...extra, archive: await archive(user, folderId) });
}

exports.dashboard = async (req, res, next) => {
  try { const admin = requireAdmin(req); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, archive: await archive(admin, req.query.folderId) }); }
  catch (error) { return next(error); }
};
exports.createFolder = async (req, res, next) => {
  try { const admin = requireAdmin(req); await createArchiveFolder({ user: admin, name: req.body?.name, description: req.body?.description, parentFolderId: req.body?.parentFolderId, accessLevel: req.body?.accessLevel }); return result(res, admin, req.body?.parentFolderId); }
  catch (error) { return next(error); }
};
exports.updateFolder = async (req, res, next) => {
  try { const admin = requireAdmin(req); const folder = await updateArchiveFolder({ user: admin, folderId: req.params.folderId, name: req.body?.name, description: req.body?.description, accessLevel: req.body?.accessLevel }); return result(res, admin, folder.id); }
  catch (error) { return next(error); }
};
exports.pinFolder = async (req, res, next) => {
  try { const admin = requireAdmin(req); const folder = await setArchiveFolderPinned({ user: admin, folderId: req.params.folderId, pinned: req.body?.pinned === true || req.body?.pinned === "true" }); return result(res, admin, folder.id); }
  catch (error) { return next(error); }
};
exports.deleteFolder = async (req, res, next) => {
  try { const admin = requireAdmin(req); const folder = await deleteArchiveFolder({ user: admin, folderId: req.params.folderId }); return result(res, admin, folder.parentFolderId || ""); }
  catch (error) { return next(error); }
};
exports.upload = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const items = await createArchiveItems({ user: admin, files: req.files, description: req.body?.description, category: req.body?.category, folderId: req.body?.folderId });
    let notified = false;
    if (["true", "1", "on"].includes(String(req.body?.notifyUsers || ""))) {
      await createAnnouncement({ adminUserId: admin._id, title: "아카이브 자료 업데이트", content: `아카이브에 새 자료 ${items.length}개가 등록되었습니다. 지금 확인해보세요.`, publishNow: true, href: "/archive" });
      notified = true;
    }
    return result(res, admin, req.body?.folderId, { uploadedCount: items.length, notified });
  } catch (error) {
    await Promise.all((req.files || []).map((file) => discardArchiveUpload(file))); return next(error);
  }
};
exports.deleteItem = async (req, res, next) => {
  try { const admin = requireAdmin(req); await deleteArchiveItem({ itemId: req.params.itemId, user: admin }); return result(res, admin, req.body?.folderId); }
  catch (error) { return next(error); }
};
exports.bulkDelete = async (req, res, next) => {
  try { const admin = requireAdmin(req); const value = await deleteArchiveItems({ itemIds: req.body?.itemIds, user: admin }); return result(res, admin, req.body?.folderId, { affectedCount: Number(value.deletedCount) || 0 }); }
  catch (error) { return next(error); }
};
exports.moveItems = async (req, res, next) => {
  try { const admin = requireAdmin(req); const value = await moveArchiveItems({ itemIds: req.body?.itemIds, destinationFolderId: req.body?.destinationFolderId, user: admin }); return result(res, admin, req.body?.folderId, { affectedCount: Number(value.movedCount) || 0 }); }
  catch (error) { return next(error); }
};
exports.restoreItem = async (req, res, next) => {
  try { const admin = requireAdmin(req); await restoreArchiveItem({ itemId: req.params.itemId, user: admin }); return result(res, admin, ""); }
  catch (error) { return next(error); }
};
exports.purgeItem = async (req, res, next) => {
  try { const admin = requireAdmin(req); await purgeArchiveItem({ itemId: req.params.itemId, user: admin }); return result(res, admin, ""); }
  catch (error) { return next(error); }
};

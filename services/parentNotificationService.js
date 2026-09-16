const mongoose = require("mongoose");
const { ParentAccount, ParentNotification } = require("../models/parentModel");

const PAGE_SIZE = 20;
function safeHref(value) {
  const href = String(value || "").trim();
  return /^\/parent(?:\/|\?|$)/.test(href) ? href : "/parent";
}
function notFound() {
  const error = new Error("알림을 찾을 수 없습니다.");
  error.status = 404;
  return error;
}
async function getParentNotificationInbox({ parentId, page }) {
  const filter = { parentAccountId: parentId };
  const [total, unread] = await Promise.all([
    ParentNotification.countDocuments(filter),
    ParentNotification.countDocuments({ ...filter, readAt: null }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(totalPages, Math.max(1, Number.parseInt(page, 10) || 1));
  const notifications = await ParentNotification.find(filter).sort({ createdAt: -1 }).skip((current - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
  return {
    notifications: notifications.map((item) => ({ ...item, id: String(item._id), targetHref: safeHref(item.href) })),
    stats: { total, unread, read: total - unread },
    pagination: { page: current, totalPages, hasPrevious: current > 1, hasNext: current < totalPages },
  };
}
async function getParentNotificationDetail({ parentId, notificationId, readOnly = false }) {
  if (!mongoose.isValidObjectId(notificationId)) throw notFound();
  const filter = { _id: notificationId, parentAccountId: parentId };
  const item = readOnly
    ? await ParentNotification.findOne(filter).lean()
    : await ParentNotification.findOneAndUpdate(filter, { $set: { readAt: new Date() } }, { returnDocument: "after" }).lean();
  if (!item) throw notFound();
  return { ...item, id: String(item._id), targetHref: safeHref(item.href) };
}
async function markAllParentNotificationsRead(parentId) {
  await ParentNotification.updateMany({ parentAccountId: parentId, readAt: null }, { $set: { readAt: new Date() } });
}
async function createParentDirectNotification({ parentId, adminUserId, title, message, href }) {
  const parent = mongoose.isValidObjectId(parentId) && await ParentAccount.exists({ _id: parentId, isActive: true });
  if (!parent) throw notFound();
  const cleanTitle = String(title || "").trim();
  const cleanMessage = String(message || "").trim();
  if (!cleanTitle || !cleanMessage || cleanTitle.length > 100 || cleanMessage.length > 1000) {
    const error = new Error("알림 제목과 내용을 입력하고 길이를 확인해주세요.");
    error.status = 400;
    throw error;
  }
  return ParentNotification.create({ parentAccountId: parentId, title: cleanTitle, message: cleanMessage, href: safeHref(href), kind: "admin", createdBy: adminUserId });
}
module.exports = { createParentDirectNotification, getParentNotificationInbox, getParentNotificationDetail, markAllParentNotificationsRead };

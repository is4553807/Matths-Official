"use strict";

const {
  createCommunityNotice,
  getAdminCommunityData,
  moderateCommunityComment,
  moderateCommunityNotice,
  moderateCommunityPost,
  reviewCommunityReport,
  setCommunityNoticePinned,
  setCommunityPostPinned,
  updateCommunityNotice,
  updateCommunityPostByAdmin,
  warnCommunityComment,
  warnCommunityPost,
} = require("../services/communityService");

const SCHEMA_VERSION = "ADMIN_COMMUNITY_NATIVE_V1";

function statusError(status, message) { const error = new Error(message); error.status = status; return error; }
function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    throw statusError(403, "관리자만 게시판을 관리할 수 있습니다.");
  }
  return req.apiUser;
}
function noStore(res) { res.set("Cache-Control", "private, no-store"); }
function id(value) { return String(value?._id || value?.id || value || ""); }
function person(value, fallback = "") {
  if (!value || typeof value !== "object") return { id: "", name: String(fallback || "탈퇴 사용자"), email: "", role: "", warningCount: 0 };
  return {
    id: id(value), name: String(value.realName || value.name || fallback || "사용자"),
    email: String(value.email || ""), role: String(value.role || ""),
    warningCount: Math.round(Number(value.warningCount) || 0),
  };
}
function postRow(value) {
  return {
    id: id(value), boardType: String(value.boardType || "high-school"),
    schoolCode: String(value.schoolCode || ""), schoolName: String(value.schoolName || ""),
    title: String(value.title || "게시글"), content: String(value.content || ""),
    status: String(value.status || "published"), isPinned: Boolean(value.isPinned),
    warningIssued: Boolean(value.warningIssued), moderationReason: String(value.moderationReason || ""),
    viewCount: Math.round(Number(value.viewCount) || 0), createdAt: value.createdAt || null,
    author: person(value.authorId, value.authorName),
  };
}
function noticeRow(value) {
  return {
    id: id(value), boardType: String(value.boardType || "high-school"),
    schoolCode: String(value.schoolCode || ""), schoolName: String(value.schoolName || ""),
    universityCode: String(value.universityCode || ""), universityName: String(value.universityName || ""),
    title: String(value.title || "공지"), content: String(value.content || ""),
    status: String(value.status || "published"), isPinned: Boolean(value.isPinned),
    isSystem: Boolean(value.systemKey), createdAt: value.createdAt || null, updatedAt: value.updatedAt || null,
  };
}
function commentRow(value) {
  return {
    id: id(value), postId: id(value.postId), postTitle: String(value.postId?.title || "원문 삭제됨"),
    content: String(value.content || ""), status: String(value.status || "published"),
    warningIssued: Boolean(value.warningIssued), moderationReason: String(value.moderationReason || ""),
    createdAt: value.createdAt || null, author: person(value.authorId, value.authorName),
  };
}
function reportRow(value) {
  const post = value.postId && typeof value.postId === "object" ? postRow(value.postId) : null;
  return {
    id: id(value), status: String(value.status || "pending"), reason: String(value.reason || ""),
    resolution: String(value.resolution || ""), createdAt: value.createdAt || null,
    reporter: person(value.reporterUserId), reportedUser: person(value.reportedUserId), post,
  };
}
function payload(value) {
  return {
    posts: (value.posts || []).map(postRow), notices: (value.notices || []).map(noticeRow),
    comments: (value.comments || []).map(commentRow), reports: (value.reports || []).map(reportRow),
    boardLabels: value.boardLabels || {}, filters: value.filters || { board: "", status: "", search: "" },
    stats: value.stats || { total: 0, published: 0, hidden: 0, deleted: 0 },
    pagination: value.pagination || { page: 1, totalPages: 1, total: 0, hasPrevious: false, hasNext: false },
  };
}
async function refreshed(req) {
  return payload(await getAdminCommunityData({
    board: req.query.board, status: req.query.status, search: req.query.search, page: req.query.page,
  }));
}
async function resolveReport({ adminUserId, reportId, action, reason }) {
  if (!reportId || !["hide", "delete", "warn"].includes(action)) return;
  const label = action === "delete" ? "게시글 DB 삭제" : action === "warn" ? "게시글 숨김 및 작성자 경고 +1" : "게시글 숨김";
  await reviewCommunityReport({
    adminUserId, reportId, status: "resolved",
    resolution: `신고 검토 후 ${label}: ${String(reason || "").trim()}`,
  });
}
async function mutation(req, res, next, operation) {
  try {
    const admin = requireAdmin(req);
    const result = await operation(admin);
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, result: result || null, community: await refreshed(req) });
  } catch (error) { return next(error); }
}

exports.dashboard = async (req, res, next) => {
  try { requireAdmin(req); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, community: await refreshed(req) }); }
  catch (error) { return next(error); }
};
exports.createNotice = (req, res, next) => mutation(req, res, next, (admin) => createCommunityNotice({
  adminUserId: admin._id, board: req.body.board, schoolCode: req.body.schoolCode,
  schoolName: req.body.schoolName, universityCode: req.body.universityCode,
  universityName: req.body.universityName, title: req.body.title, content: req.body.content,
}));
exports.updateNotice = (req, res, next) => mutation(req, res, next, (admin) => updateCommunityNotice({
  adminUserId: admin._id, noticeId: req.params.noticeId, board: req.body.board,
  schoolCode: req.body.schoolCode, schoolName: req.body.schoolName,
  universityCode: req.body.universityCode, universityName: req.body.universityName,
  title: req.body.title, content: req.body.content,
}));
exports.pinNotice = (req, res, next) => mutation(req, res, next, (admin) => setCommunityNoticePinned({
  adminUserId: admin._id, noticeId: req.params.noticeId, pinned: req.body.pinned === true,
}));
exports.moderateNotice = (req, res, next) => mutation(req, res, next, (admin) => moderateCommunityNotice({
  adminUserId: admin._id, noticeId: req.params.noticeId, action: req.body.action,
}));
exports.reviewReport = (req, res, next) => mutation(req, res, next, (admin) => reviewCommunityReport({
  adminUserId: admin._id, reportId: req.params.reportId, status: req.body.status, resolution: req.body.resolution,
}));
exports.editPost = (req, res, next) => mutation(req, res, next, (admin) => updateCommunityPostByAdmin({
  adminUserId: admin._id, postId: req.params.postId, title: req.body.title,
  content: req.body.content, reason: req.body.reason,
}));
exports.pinPost = (req, res, next) => mutation(req, res, next, (admin) => setCommunityPostPinned({
  adminUserId: admin._id, postId: req.params.postId, pinned: req.body.pinned === true,
}));
exports.moderatePost = (req, res, next) => mutation(req, res, next, async (admin) => {
  const result = await moderateCommunityPost({
    adminUserId: admin._id, postId: req.params.postId, action: req.body.action, reason: req.body.reason,
  });
  await resolveReport({ adminUserId: admin._id, reportId: req.body.reportId, action: req.body.action, reason: req.body.reason });
  return result;
});
exports.warnPost = (req, res, next) => mutation(req, res, next, async (admin) => {
  const result = await warnCommunityPost({ adminUserId: admin._id, postId: req.params.postId, reason: req.body.reason });
  await resolveReport({ adminUserId: admin._id, reportId: req.body.reportId, action: "warn", reason: req.body.reason });
  return result;
});
exports.moderateComment = (req, res, next) => mutation(req, res, next, (admin) => moderateCommunityComment({
  adminUserId: admin._id, commentId: req.params.commentId, action: req.body.action, reason: req.body.reason,
}));
exports.warnComment = (req, res, next) => mutation(req, res, next, (admin) => warnCommunityComment({
  adminUserId: admin._id, commentId: req.params.commentId, reason: req.body.reason,
}));

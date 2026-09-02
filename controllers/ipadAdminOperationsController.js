"use strict";

const {
  createAnnouncement,
  getAdminDashboardData,
  getAdminInquiryData,
  replyToInquiry,
  toggleAnnouncement,
  updateInquiryStatus,
} = require("../services/adminService");
const {
  completeAdminTodo,
  getAdminTodoData,
  getAdminTodoSummary,
  reopenAdminTodo,
} = require("../services/adminTodoService");
const { Announcement } = require("../models/matthsModel");

const SCHEMA_VERSION = "ADMIN_OPERATIONS_NATIVE_V1";

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    throw statusError(403, "관리자만 운영 업무를 처리할 수 있습니다.");
  }
  return req.apiUser;
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

function objectId(value) {
  return value?._id ? String(value._id) : value ? String(value) : "";
}

function person(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: objectId(value),
    name: String(value.realName || value.name || "").trim(),
    email: String(value.email || "").trim(),
  };
}

function todoRow(value) {
  return {
    id: objectId(value),
    category: String(value.category || "other"),
    title: String(value.title || "운영 확인 필요"),
    description: String(value.description || ""),
    href: String(value.href || ""),
    status: String(value.status || "pending"),
    createdAt: value.createdAt || null,
    completedAt: value.completedAt || null,
    actor: person(value.actorUserId),
    target: person(value.targetUserId),
    completedBy: person(value.completedBy),
  };
}

function inquiryRow(value) {
  const reply = value.adminReply || {};
  return {
    id: objectId(value),
    subject: String(value.subject || "문의"),
    content: String(value.content || value.message || ""),
    status: String(value.status || "pending"),
    inquiryType: String(value.inquiryType || value.type || "general"),
    contactEmail: String(value.contactEmail || ""),
    createdAt: value.createdAt || null,
    adminReply: reply.message
      ? {
          message: String(reply.message),
          sentTo: String(reply.sentTo || value.contactEmail || ""),
          repliedAt: reply.repliedAt || null,
        }
      : null,
  };
}

function announcementRow(value) {
  return {
    id: objectId(value),
    title: String(value.title || "공지"),
    content: String(value.content || ""),
    boardCategory: String(value.boardCategory || "notice"),
    href: String(value.href || ""),
    isPublished: Boolean(value.isPublished),
    createdAt: value.createdAt || null,
    publishedAt: value.publishedAt || null,
    dashboardEndsAt: value.dashboardEndsAt || null,
    deliveredAt: value.deliveredAt || null,
  };
}

function todoPayload(data) {
  return {
    items: data.items.map(todoRow),
    filter: data.filter,
    pagination: data.pagination,
  };
}

function inquiryPayload(data) {
  return {
    items: data.inquiries.map(inquiryRow),
    filter: { status: data.status },
    pagination: {
      page: data.page,
      total: data.total,
      totalPages: data.totalPages,
      hasPrevious: data.page > 1,
      hasNext: data.page < data.totalPages,
    },
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    requireAdmin(req);
    const [dashboard, todos] = await Promise.all([
      getAdminDashboardData(),
      getAdminTodoSummary(),
    ]);
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      operations: {
        stats: dashboard.stats,
        pendingTodoCount: todos.pendingCount,
        priorityTodos: todos.items.map(todoRow),
        recentInquiries: dashboard.inquiries.map(inquiryRow),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.todos = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminTodoData({
      category: req.query.category,
      status: req.query.status,
      page: req.query.page,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      nickname: req.query.nickname,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, todos: todoPayload(data) });
  } catch (error) {
    return next(error);
  }
};

exports.completeTodo = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await completeAdminTodo({ todoId: req.params.todoId, adminUserId: admin._id });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.reopenTodo = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await reopenAdminTodo({ todoId: req.params.todoId, adminUserId: admin._id });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.inquiries = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminInquiryData({
      status: req.query.status,
      page: req.query.page,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, inquiries: inquiryPayload(data) });
  } catch (error) {
    return next(error);
  }
};

exports.replyToInquiry = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const message = String(req.body?.message || "").trim();
    const delivery = await replyToInquiry({
      adminUserId: admin._id,
      inquiryId: req.params.inquiryId,
      message,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      delivered: Boolean(delivery?.delivered),
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateInquiryStatus = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateInquiryStatus({
      adminUserId: admin._id,
      inquiryId: req.params.inquiryId,
      status: String(req.body?.status || ""),
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.announcements = async (req, res, next) => {
  try {
    requireAdmin(req);
    const status = String(req.query.status || "all");
    const filter = status === "published"
      ? { isPublished: true }
      : status === "draft"
        ? { isPublished: false }
        : {};
    const items = await Announcement.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .lean();
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      announcements: {
        status: ["all", "published", "draft"].includes(status) ? status : "all",
        items: items.map(announcementRow),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.createAnnouncement = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const announcement = await createAnnouncement({
      adminUserId: admin._id,
      title: req.body?.title,
      content: req.body?.content,
      publishNow: req.body?.publishNow,
      dashboardEndDate: req.body?.dashboardEndDate,
      boardCategory: req.body?.boardCategory,
    });
    noStore(res);
    return res.status(201).json({
      schemaVersion: SCHEMA_VERSION,
      announcement: announcementRow(announcement),
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateAnnouncementStatus = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await toggleAnnouncement({
      adminUserId: admin._id,
      announcementId: req.params.announcementId,
      publish: req.body?.publish,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

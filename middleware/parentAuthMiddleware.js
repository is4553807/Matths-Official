const mongoose = require("mongoose");
const { ParentAccount, ParentNotification } = require("../models/parentModel");
const { serviceUrl } = require("../services/serviceUrlService");
const auth = require("./authMiddleware");
const { getParentFamily } = require("../services/parentFamilyService");
const { installAdminPreview, previewWriteError, renderAdminPageSelector } = require("./adminPagePreview");

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function clearInvalidParentSession(req) {
  if (!req.session?.parent) return;
  delete req.session.parent;
  await saveSession(req);
}

async function activeParentForSession(req) {
  const parentId = req.session?.parent?.id;
  if (!parentId || !mongoose.isValidObjectId(parentId)) return null;
  return ParentAccount.findOne({ _id: parentId, isActive: true })
    .select("_id")
    .lean();
}

async function isParentLoggedIn(req, res, next) {
  if (req.session?.user) {
    return auth.isLoggedIn(req, res, async (error) => {
      if (error) return next(error);
      if (req.authenticatedUser?.role !== "admin") {
        return res.redirect(serviceUrl("parents", "/parent/login"));
      }
      try {
        if (!["GET", "HEAD"].includes(req.method)) return next(previewWriteError());
        const saved = req.session.adminPagePreview || {};
        if (req.query.clearAdminPreview === "1") { delete saved.parentId; delete saved.childUserId; }
        const parentId = req.query.parentId || saved.parentId;
        if (!parentId) {
          req.session.adminPagePreview = saved;
          const parents = await ParentAccount.find({}).select("username email isActive").sort({ username: 1, _id: 1 }).lean();
          return renderAdminPageSelector(res, { surface: "parent", targetPath: "/parent", choices: parents.map(parent => ({ id: String(parent._id), label: parent.username, detail: parent.email })) });
        }
        if (!mongoose.isValidObjectId(parentId)) return next(Object.assign(new Error("학부모를 다시 선택해주세요."), { status: 400 }));
        const parent = await ParentAccount.findById(parentId).select("username email childUserId isActive").lean();
        if (!parent) return next(Object.assign(new Error("미리 볼 학부모 계정을 찾을 수 없습니다."), { status: 404 }));
        if (String(saved.parentId) !== String(parentId)) delete saved.childUserId;
        saved.parentId = String(parentId);
        saved.childUserId = String(req.query.childUserId || saved.childUserId || "");
        req.session.adminPagePreview = saved;
        req.adminParentView = { id: String(parent._id), email: parent.email, selectedChildUserId: saved.childUserId };
        installAdminPreview(res, "/parent?clearAdminPreview=1");
        try {
          req.adminParentFamily = await getParentFamily({ parentId: parent._id, selectedChildUserId: saved.childUserId, readOnly: true });
        } catch (failure) {
          if (failure.code === "PARENT_CHILD_LINK_REQUIRED") return res.render("parent-onboarding", { parent });
          throw failure;
        }
        res.locals.parentUnreadCount = await ParentNotification.countDocuments({ parentAccountId: parent._id, readAt: null });
        return next();
      } catch (failure) { return next(failure); }
    });
  }
  try {
    if (await activeParentForSession(req)) {
      if (["GET", "HEAD"].includes(req.method)) {
        res.locals.parentUnreadCount = await ParentNotification.countDocuments({ parentAccountId: req.session.parent.id, readAt: null });
      }
      return next();
    }
    await clearInvalidParentSession(req);
  } catch (error) {
    return next(error);
  }
  const nextPath = encodeURIComponent(req.originalUrl || "/parent");
  return res.redirect(serviceUrl("parents", `/parent/login?next=${nextPath}`));
}

async function isParentLoggedOut(req, res, next) {
  if (req.session?.user) return auth.isLoggedOut(req, res, next);
  try {
    if (await activeParentForSession(req)) {
      return res.redirect(serviceUrl("parents", "/parent"));
    }
    await clearInvalidParentSession(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { isParentLoggedIn, isParentLoggedOut };

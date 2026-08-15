const mongoose = require("mongoose");
const { ParentAccount } = require("../models/parentModel");

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
  try {
    if (await activeParentForSession(req)) return next();
    await clearInvalidParentSession(req);
  } catch (error) {
    return next(error);
  }
  const nextPath = encodeURIComponent(req.originalUrl || "/parent");
  return res.redirect(`/parent/login?next=${nextPath}`);
}

async function isParentLoggedOut(req, res, next) {
  try {
    if (await activeParentForSession(req)) return res.redirect("/parent");
    await clearInvalidParentSession(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { isParentLoggedIn, isParentLoggedOut };

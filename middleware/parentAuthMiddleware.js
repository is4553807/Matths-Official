function isParentLoggedIn(req, res, next) {
  if (req.session?.parent?.id) return next();
  const nextPath = encodeURIComponent(req.originalUrl || "/parent");
  return res.redirect(`/parent/login?next=${nextPath}`);
}

function isParentLoggedOut(req, res, next) {
  if (!req.session?.parent?.id) return next();
  return res.redirect("/parent");
}

module.exports = { isParentLoggedIn, isParentLoggedOut };

const DEFAULT_SOURCE_HOST = "matths.kr";
const DEFAULT_CANONICAL_HOST = "www.matths.kr";

function cleanHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function canonicalRedirectLocation({
  hostname,
  originalUrl = "/",
  environment = process.env,
}) {
  if (String(environment.NODE_ENV || "") !== "production") return "";
  const sourceHost = cleanHost(
    environment.CANONICAL_REDIRECT_SOURCE_HOST || DEFAULT_SOURCE_HOST
  );
  const canonicalHost = cleanHost(
    environment.CANONICAL_HOST || DEFAULT_CANONICAL_HOST
  );
  if (!sourceHost || !canonicalHost || sourceHost === canonicalHost) return "";
  if (cleanHost(hostname) !== sourceHost) return "";
  const requestTarget = String(originalUrl || "/");
  const safeTarget = requestTarget.startsWith("/") ? requestTarget : "/";
  return `https://${canonicalHost}${safeTarget}`;
}

function canonicalHostRedirect(req, res, next) {
  const location = canonicalRedirectLocation({
    hostname: req.hostname,
    originalUrl: req.originalUrl,
  });
  if (!location) return next();
  return res.redirect(308, location);
}

module.exports = {
  DEFAULT_CANONICAL_HOST,
  DEFAULT_SOURCE_HOST,
  canonicalHostRedirect,
  canonicalRedirectLocation,
};

const {
  DEFAULT_SERVICE_ORIGINS,
  serviceOrigins,
} = require("../services/serviceUrlService");

const DEFAULT_SERVICE_HOSTS = Object.freeze({
  public: new URL(DEFAULT_SERVICE_ORIGINS.public).hostname,
  app: new URL(DEFAULT_SERVICE_ORIGINS.app).hostname,
  academy: new URL(DEFAULT_SERVICE_ORIGINS.academy).hostname,
  admin: new URL(DEFAULT_SERVICE_ORIGINS.admin).hostname,
  parents: new URL(DEFAULT_SERVICE_ORIGINS.parents).hostname,
});

const ROOT_PATH_BY_SURFACE = Object.freeze({
  app: "/main",
  academy: "/academy",
  admin: "/admin",
  parents: "/parent",
});

function cleanHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function serviceHosts(environment = process.env) {
  return Object.fromEntries(
    Object.entries(serviceOrigins(environment)).map(([surface, origin]) => [
      surface,
      cleanHost(origin ? new URL(origin).hostname : DEFAULT_SERVICE_HOSTS[surface]),
    ])
  );
}

function safeRequestTarget(originalUrl) {
  const target = String(originalUrl || "/");
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
}

function pathnameOf(originalUrl) {
  return safeRequestTarget(originalUrl).split("?", 1)[0];
}

function isPublicPath(pathname) {
  if (/^\/(?:login|register|forgot-password)(?:\/|$)/.test(pathname)) {
    return true;
  }
  if (/^\/auth\/(?:google|kakao|apple)(?:\/|$)/.test(pathname)) {
    return true;
  }
  if (/^\/parent\/login(?:\/|$)/.test(pathname)) return true;
  if (/^\/(?:intro|visual-learning|learning-flow|curriculum|faq|terms|privacy)(?:\/|$)/.test(pathname)) {
    return true;
  }
  if (/^\/community(?:\/|$)/.test(pathname)) return true;
  if (/^\/archive(?:\/|$)/.test(pathname) && !/^\/archive\/admin(?:\/|$)/.test(pathname)) {
    return true;
  }
  return pathname === "/pricing" || pathname === "/contact";
}

function publicTarget(originalUrl) {
  const target = safeRequestTarget(originalUrl);
  if (pathnameOf(target) !== "/parent/login") return target;
  const queryIndex = target.indexOf("?");
  return `/login${queryIndex >= 0 ? target.slice(queryIndex) : ""}`;
}

function surfaceForPath(pathname) {
  if (
    /^\/admin(?:\/|$)/.test(pathname) ||
    /^\/archive\/admin(?:\/|$)/.test(pathname)
  ) {
    return "admin";
  }
  if (/^\/academy(?:\/|$)/.test(pathname)) return "academy";
  if (
    /^\/(?:main|my-learning|my-academy|learn|war-of-masters|goat-arena|profile|store|notifications|announcements|account|private-mock-exams|integrity|nickname-change|log-curriculum|assessments|wrong-notes|quick-practice|coach-suggestions)(?:\/|$)/.test(pathname)
  ) {
    return "app";
  }
  if (/^\/pricing\/[^/]+\/(?:self|parent-request)(?:\/|$)/.test(pathname)) {
    return "app";
  }
  if (/^\/parent(?:\/|$)/.test(pathname)) return "parents";
  return "";
}

function serviceHostRedirectLocation({
  hostname,
  method = "GET",
  originalUrl = "/",
  environment = process.env,
}) {
  if (String(environment.NODE_ENV || "") !== "production") return "";
  if (!["GET", "HEAD"].includes(String(method || "GET").toUpperCase())) return "";

  const hosts = serviceHosts(environment);
  const currentHost = cleanHost(hostname);
  if (!Object.values(hosts).includes(currentHost)) return "";

  const target = safeRequestTarget(originalUrl);
  const pathname = pathnameOf(target);
  const surface = isPublicPath(pathname) ? "public" : surfaceForPath(pathname);
  if (!surface || currentHost === hosts[surface]) return "";
  const origin = serviceOrigins(environment)[surface];
  return `${origin}${surface === "public" ? publicTarget(target) : target}`;
}

function serviceHostRouting(req, res, next) {
  const environment = process.env;
  const location = serviceHostRedirectLocation({
    hostname: req.hostname,
    method: req.method,
    originalUrl: req.originalUrl,
    environment,
  });
  if (location) return res.redirect(308, location);

  if (String(environment.NODE_ENV || "") !== "production") return next();
  if (pathnameOf(req.originalUrl) !== "/") return next();

  const hosts = serviceHosts(environment);
  const currentHost = cleanHost(req.hostname);
  const surface = Object.entries(hosts).find(
    ([name, host]) => name !== "public" && host === currentHost
  )?.[0];
  const rootPath = ROOT_PATH_BY_SURFACE[surface];
  if (!rootPath) return next();

  const queryIndex = String(req.url || "").indexOf("?");
  const query = queryIndex >= 0 ? String(req.url).slice(queryIndex) : "";
  req.url = `${rootPath}${query}`;
  return next();
}

module.exports = {
  DEFAULT_SERVICE_HOSTS,
  ROOT_PATH_BY_SURFACE,
  cleanHost,
  serviceHostRedirectLocation,
  serviceHostRouting,
  serviceHosts,
  surfaceForPath,
  isPublicPath,
  publicTarget,
};

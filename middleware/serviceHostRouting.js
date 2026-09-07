const DEFAULT_SERVICE_HOSTS = Object.freeze({
  public: "matths.kr",
  app: "app.matths.kr",
  academy: "academy.matths.kr",
  admin: "admin.matths.kr",
  parents: "parents.matths.kr",
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

function configuredHost(environment, key, fallback) {
  try {
    return cleanHost(new URL(String(environment?.[key] || "")).hostname) || fallback;
  } catch (_error) {
    return fallback;
  }
}

function serviceHosts(environment = process.env) {
  return {
    public: configuredHost(
      environment,
      "PUBLIC_BASE_URL",
      DEFAULT_SERVICE_HOSTS.public
    ),
    app: configuredHost(
      environment,
      "APP_BASE_URL",
      DEFAULT_SERVICE_HOSTS.app
    ),
    academy: configuredHost(
      environment,
      "ACADEMY_BASE_URL",
      DEFAULT_SERVICE_HOSTS.academy
    ),
    admin: configuredHost(
      environment,
      "ADMIN_BASE_URL",
      DEFAULT_SERVICE_HOSTS.admin
    ),
    parents: configuredHost(
      environment,
      "PARENTS_BASE_URL",
      DEFAULT_SERVICE_HOSTS.parents
    ),
  };
}

function safeRequestTarget(originalUrl) {
  const target = String(originalUrl || "/");
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
}

function pathnameOf(originalUrl) {
  return safeRequestTarget(originalUrl).split("?", 1)[0];
}

function surfaceForPath(pathname) {
  if (
    /^\/admin(?:\/|$)/.test(pathname) ||
    /^\/archive\/admin(?:\/|$)/.test(pathname)
  ) {
    return "admin";
  }
  if (/^\/academy(?:\/|$)/.test(pathname)) return "academy";
  if (/^\/main(?:\/|$)/.test(pathname)) return "app";
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
  const surface = surfaceForPath(pathnameOf(target));
  if (!surface || currentHost === hosts[surface]) return "";
  return `https://${hosts[surface]}${target}`;
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
};

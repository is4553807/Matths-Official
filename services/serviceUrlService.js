const DEFAULT_SERVICE_ORIGINS = Object.freeze({
  public: "https://www.matths.kr",
  app: "https://app.matths.kr",
  academy: "https://academy.matths.kr",
  admin: "https://admin.matths.kr",
  parents: "https://parents.matths.kr",
});

const ENV_KEY_BY_SURFACE = Object.freeze({
  public: "PUBLIC_BASE_URL",
  app: "APP_BASE_URL",
  academy: "ACADEMY_BASE_URL",
  admin: "ADMIN_BASE_URL",
  parents: "PARENTS_BASE_URL",
});

function originOf(value) {
  try {
    return new URL(String(value || "").trim()).origin;
  } catch (_error) {
    return "";
  }
}

function serviceOrigins(environment = process.env) {
  const production = String(environment?.NODE_ENV || "") === "production";
  const localFallback =
    originOf(environment?.PUBLIC_BASE_URL) ||
    originOf(environment?.APP_BASE_URL);

  return Object.fromEntries(
    Object.entries(ENV_KEY_BY_SURFACE).map(([surface, key]) => [
      surface,
      originOf(environment?.[key]) ||
        (production ? DEFAULT_SERVICE_ORIGINS[surface] : localFallback),
    ])
  );
}

function safePath(value = "/") {
  const path = String(value || "/");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function serviceUrl(surface, path = "/", environment = process.env) {
  const target = safePath(path);
  const origin = serviceOrigins(environment)[surface] || "";
  return origin ? `${origin}${target}` : target;
}

function accountNavigation(session = {}, environment = process.env) {
  const role = String(session?.user?.role || "").toLowerCase();
  const parentSignedIn = Boolean(session?.parent?.id);
  const userSignedIn = Boolean(session?.user?.id);

  if (!userSignedIn && !parentSignedIn) {
    return {
      authenticated: false,
      role: "guest",
      dashboardHref: serviceUrl("public", "/login", environment),
      dashboardLabel: "로그인",
      primaryHref: serviceUrl("public", "/register", environment),
      primaryLabel: "무료로 시작하기",
      arenaHref: serviceUrl("public", "/#goat-arena", environment),
    };
  }

  let dashboardHref;
  let primaryHref;
  let accountRole = role || "parent";
  if (parentSignedIn && !userSignedIn) {
    dashboardHref = serviceUrl("parents", "/parent", environment);
    primaryHref = dashboardHref;
  } else if (role === "admin") {
    dashboardHref = serviceUrl("admin", "/admin", environment);
    primaryHref = dashboardHref;
  } else if (role === "teacher") {
    dashboardHref = serviceUrl("academy", "/academy", environment);
    primaryHref = dashboardHref;
  } else {
    accountRole = role || "student";
    dashboardHref = serviceUrl("app", "/main", environment);
    primaryHref = serviceUrl("app", "/my-learning", environment);
  }

  const studentAccount = ["student", "test"].includes(accountRole);
  return {
    authenticated: true,
    role: accountRole,
    dashboardHref,
    dashboardLabel: "대시보드",
    primaryHref,
    primaryLabel: "학습 계속하기",
    arenaHref: studentAccount
      ? serviceUrl("app", "/war-of-masters", environment)
      : dashboardHref,
  };
}

module.exports = {
  DEFAULT_SERVICE_ORIGINS,
  ENV_KEY_BY_SURFACE,
  accountNavigation,
  originOf,
  safePath,
  serviceOrigins,
  serviceUrl,
};

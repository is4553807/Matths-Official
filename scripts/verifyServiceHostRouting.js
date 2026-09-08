const assert = require("node:assert/strict");

const {
  isAuthenticationPath,
  isPublicPath,
  serviceHostRedirectLocation,
  serviceHostRouting,
  serviceHosts,
  surfaceForPath,
} = require("../middleware/serviceHostRouting");
const {
  accountNavigation,
  serviceUrl,
} = require("../services/serviceUrlService");

const production = {
  NODE_ENV: "production",
  PUBLIC_BASE_URL: "https://www.matths.kr",
  APP_BASE_URL: "https://app.matths.kr",
  ACADEMY_BASE_URL: "https://academy.matths.kr",
  ADMIN_BASE_URL: "https://admin.matths.kr",
  PARENTS_BASE_URL: "https://parents.matths.kr",
};

assert.deepEqual(serviceHosts(production), {
  public: "www.matths.kr",
  app: "app.matths.kr",
  academy: "academy.matths.kr",
  admin: "admin.matths.kr",
  parents: "parents.matths.kr",
});

for (const [hostname, originalUrl, expected] of [
  ["www.matths.kr", "/main?week=2", "https://app.matths.kr/main?week=2"],
  ["app.matths.kr", "/academy/classes/42", "https://academy.matths.kr/academy/classes/42"],
  ["academy.matths.kr", "/admin/users", "https://admin.matths.kr/admin/users"],
  ["www.matths.kr", "/archive/admin?folder=1", "https://admin.matths.kr/archive/admin?folder=1"],
  ["www.matths.kr", "/parent/notifications", "https://parents.matths.kr/parent/notifications"],
  ["academy.matths.kr", "/login", "https://www.matths.kr/login"],
  ["admin.matths.kr", "/register?from=nav", "https://www.matths.kr/register?from=nav"],
  ["parents.matths.kr", "/parent/login?next=%2Fparent%2Fpayments", "https://www.matths.kr/login?next=%2Fparent%2Fpayments"],
  ["app.matths.kr", "/intro", "https://www.matths.kr/intro"],
  ["www.matths.kr", "/my-learning", "https://app.matths.kr/my-learning"],
  ["academy.matths.kr", "/goat-arena", "https://app.matths.kr/goat-arena"],
  ["admin.matths.kr", "/my-academy", "https://app.matths.kr/my-academy"],
  ["www.matths.kr", "/pricing/learning-package/self", "https://app.matths.kr/pricing/learning-package/self"],
]) {
  assert.equal(
    serviceHostRedirectLocation({
      hostname,
      originalUrl,
      environment: production,
    }),
    expected
  );
}

assert.equal(
  serviceHostRedirectLocation({
    hostname: "app.matths.kr",
    originalUrl: "/main",
    environment: production,
  }),
  ""
);
assert.equal(isPublicPath("/login"), true);
assert.equal(isAuthenticationPath("/login"), true);
assert.equal(isAuthenticationPath("/auth/apple/callback"), true);
assert.equal(isAuthenticationPath("/community"), false);
assert.equal(isPublicPath("/parent/login"), true);
assert.equal(isPublicPath("/archive"), true);
assert.equal(isPublicPath("/archive/admin"), false);
assert.equal(surfaceForPath("/academy/classes/42"), "academy");
assert.equal(surfaceForPath("/private-mock-exams"), "app");
assert.equal(surfaceForPath("/parent/payments"), "parents");
assert.equal(serviceUrl("public", "/login", production), "https://www.matths.kr/login");

for (const [session, expected] of [
  [{}, ["guest", "로그인", "무료로 시작하기", "https://www.matths.kr/login", "https://www.matths.kr/register"]],
  [{ user: { id: "student", role: "student" } }, ["student", "대시보드", "학습 계속하기", "https://app.matths.kr/main", "https://app.matths.kr/my-learning"]],
  [{ user: { id: "teacher", role: "teacher" } }, ["teacher", "대시보드", "학습 계속하기", "https://academy.matths.kr/academy", "https://academy.matths.kr/academy"]],
  [{ user: { id: "admin", role: "admin" } }, ["admin", "대시보드", "학습 계속하기", "https://admin.matths.kr/admin", "https://admin.matths.kr/admin"]],
  [{ parent: { id: "parent" } }, ["parent", "대시보드", "학습 계속하기", "https://parents.matths.kr/parent", "https://parents.matths.kr/parent"]],
]) {
  const navigation = accountNavigation(session, production);
  assert.deepEqual(
    [navigation.role, navigation.dashboardLabel, navigation.primaryLabel, navigation.dashboardHref, navigation.primaryHref],
    expected
  );
}
assert.equal(
  serviceHostRedirectLocation({
    hostname: "mpzm0tyz6f7ddb63.sel3.cloudtype.app",
    originalUrl: "/admin",
    environment: production,
  }),
  ""
);
assert.equal(
  serviceHostRedirectLocation({
    hostname: "app.matths.kr",
    method: "POST",
    originalUrl: "/login",
    environment: production,
  }),
  "https://www.matths.kr/login"
);
assert.equal(
  serviceHostRedirectLocation({
    hostname: "academy.matths.kr",
    method: "POST",
    originalUrl: "/community",
    environment: production,
  }),
  ""
);
assert.equal(
  serviceHostRedirectLocation({
    hostname: "www.matths.kr",
    method: "POST",
    originalUrl: "/admin/users/42",
    environment: production,
  }),
  ""
);

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  APP_BASE_URL: process.env.APP_BASE_URL,
  ACADEMY_BASE_URL: process.env.ACADEMY_BASE_URL,
  ADMIN_BASE_URL: process.env.ADMIN_BASE_URL,
  PARENTS_BASE_URL: process.env.PARENTS_BASE_URL,
};

try {
  Object.assign(process.env, production);
  {
    const req = {
      hostname: "app.matths.kr",
      method: "POST",
      originalUrl: "/login",
      url: "/login",
    };
    let redirect = null;
    serviceHostRouting(
      req,
      {
        redirect(status, location) {
          redirect = { status, location };
        },
      },
      () => assert.fail("POST /login must redirect to the public host")
    );
    assert.deepEqual(redirect, {
      status: 307,
      location: "https://www.matths.kr/login",
    });
  }
  for (const [hostname, expectedUrl] of [
    ["app.matths.kr", "/main?tab=today"],
    ["academy.matths.kr", "/academy?tab=today"],
    ["admin.matths.kr", "/admin?tab=today"],
    ["parents.matths.kr", "/parent?tab=today"],
  ]) {
    const req = {
      hostname,
      method: "GET",
      originalUrl: "/?tab=today",
      url: "/?tab=today",
    };
    let nextCalled = false;
    serviceHostRouting(req, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.url, expectedUrl);
  }
} finally {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log(
  "Service host routing verified: shared auth/public routes, account CTAs, and app, academy, admin, and parents destinations use their canonical HTTPS hosts."
);

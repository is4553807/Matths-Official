const assert = require("node:assert/strict");

const {
  serviceHostRedirectLocation,
  serviceHostRouting,
  serviceHosts,
} = require("../middleware/serviceHostRouting");

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
};

try {
  Object.assign(process.env, production);
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
  "Service host routing verified: app, academy, admin, and parents roots map internally while legacy surface paths move to their dedicated HTTPS hosts."
);

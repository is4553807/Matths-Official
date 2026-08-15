const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  authRequestKey,
  createRateLimit,
  sameOriginProtection,
} = require("../middleware/requestSecurity");

function request({
  method = "POST",
  url = "/profile/password",
  protocol = "https",
  host = "www.matths.kr",
  headers = {},
  body = {},
  ip = "203.0.113.10",
} = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    method,
    originalUrl: url,
    url,
    protocol,
    ip,
    body,
    socket: { remoteAddress: ip },
    get(name) {
      if (String(name).toLowerCase() === "host") return host;
      return normalizedHeaders[String(name).toLowerCase()] || "";
    },
  };
}

function response() {
  return {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

function invoke(middleware, req, res = response()) {
  let result = Symbol("not-called");
  middleware(req, res, (error) => {
    result = error || null;
  });
  assert.notEqual(typeof result, "symbol", "보안 미들웨어가 next를 호출해야 합니다.");
  return { error: result, res };
}

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  APP_BASE_URL: process.env.APP_BASE_URL,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
};

try {
  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = "https://www.matths.kr";
  delete process.env.PUBLIC_BASE_URL;

  assert.equal(invoke(sameOriginProtection, request({ method: "GET" })).error, null);
  assert.equal(
    invoke(sameOriginProtection, request({
      headers: { origin: "https://www.matths.kr", "sec-fetch-site": "same-origin" },
    })).error,
    null
  );
  assert.equal(
    invoke(sameOriginProtection, request({
      headers: { referer: "https://www.matths.kr/profile" },
    })).error,
    null
  );

  const crossSite = invoke(sameOriginProtection, request({
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  })).error;
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.code, "CROSS_SITE_REQUEST_BLOCKED");

  const missingOrigin = invoke(sameOriginProtection, request()).error;
  assert.equal(missingOrigin.status, 403);
  assert.equal(missingOrigin.code, "REQUEST_ORIGIN_REQUIRED");

  assert.equal(
    invoke(sameOriginProtection, request({ url: "/api/v1/auth/login" })).error,
    null,
    "네이티브 Bearer API는 브라우저 Origin 검사와 분리해야 합니다."
  );

  const limiter = createRateLimit({
    name: "verify",
    limit: 2,
    windowMs: 60_000,
  });
  const authReq = request({ body: { identifier: "Student@Example.com" } });
  assert.equal(invoke(limiter, authReq).error, null);
  const second = invoke(limiter, authReq);
  assert.equal(second.error, null);
  assert.equal(second.res.headers["RateLimit-Remaining"], "0");
  const blocked = invoke(limiter, authReq);
  assert.equal(blocked.error.status, 429);
  assert.equal(blocked.error.code, "AUTH_RATE_LIMITED");
  assert.ok(Number(blocked.res.headers["Retry-After"]) >= 1);
  assert.doesNotMatch(authRequestKey(authReq), /student@example\.com/i);

  const root = path.resolve(__dirname, "..");
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const webRoutes = fs.readFileSync(path.join(root, "routes", "matths-routes.js"), "utf8");
  const apiRoutes = fs.readFileSync(path.join(root, "routes", "api-routes.js"), "utf8");
  const parentRoutes = fs.readFileSync(path.join(root, "routes", "parent-routes.js"), "utf8");
  const parentController = fs.readFileSync(
    path.join(root, "controllers", "parentController.js"),
    "utf8"
  );

  assert.match(serverSource, /server\.use\(sameOriginProtection\)/);
  assert.match(
    webRoutes,
    /loginIpRateLimit[\s\S]*loginRateLimit[\s\S]*matthsController\.login/
  );
  assert.match(
    webRoutes,
    /registrationIpRateLimit[\s\S]*registrationRateLimit[\s\S]*matthsController\.register/
  );
  assert.match(
    webRoutes,
    /passwordResetIpRateLimit[\s\S]*passwordResetRateLimit[\s\S]*matthsController\.requestPasswordReset/
  );
  assert.match(
    apiRoutes,
    /loginIpRateLimit[\s\S]*loginRateLimit[\s\S]*apiController\.login/
  );
  assert.match(
    apiRoutes,
    /passwordResetIpRateLimit[\s\S]*passwordResetRateLimit[\s\S]*apiController\.requestPasswordReset/
  );
  assert.match(
    parentRoutes,
    /loginIpRateLimit[\s\S]*loginRateLimit[\s\S]*parentController\.login/
  );
  assert.match(
    parentController,
    /await regenerateSession\(req\);\s*req\.session\.parent = parentSession\(parent\);/
  );
} finally {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("동일 출처 요청 보호, 인증 요청 제한, 학부모 세션 재발급 검증 완료");

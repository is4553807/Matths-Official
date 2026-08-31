"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateKey = ec.privateKey.export({ type: "pkcs8", format: "pem" });
const environment = {
  NODE_ENV: "production",
  PUBLIC_BASE_URL: "https://www.matths.kr",
  SECRET: "s".repeat(64),
  APPLE_BUNDLE_ID: "kr.matths.app",
  APPLE_SERVICES_ID: "kr.matths.web",
  APPLE_TEAM_ID: "64U874RU4D",
  APPLE_KEY_ID: "TESTKEY123",
  APPLE_PRIVATE_KEY: privateKey,
  APPLE_OAUTH_REDIRECT_URI: "https://www.matths.kr/auth/apple/callback",
};

Object.assign(process.env, environment);

const {
  appleWebProviderStatus,
  beginAppleWebAuthorization,
  completeAppleWebAuthorization,
  isAppleWebConfigured,
  _testing,
} = require("../services/appleWebAuthService");
const {
  sameOriginProtection,
} = require("../middleware/requestSecurity");
const {
  publicProviderStatus,
} = require("../services/socialAuthService");

function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function runSecurityBoundary(request) {
  return new Promise((resolve) => {
    sameOriginProtection(request, {}, (error) => resolve(error || null));
  });
}

async function main() {
  assert.equal(isAppleWebConfigured(environment), true);
  assert.deepEqual(appleWebProviderStatus(environment), {
    webConfigured: true,
    webRedirectUri: "https://www.matths.kr/auth/apple/callback",
  });
  const appleStatus = publicProviderStatus().find(
    (provider) => provider.key === "apple"
  );
  assert.equal(appleStatus.configured, true);
  assert.equal(appleStatus.webConfigured, true);
  assert.equal(
    _testing.appleWebConfig({
      ...environment,
      API_TOKEN_SECRET: "too-short",
    }).stateSecret,
    environment.SECRET
  );

  const now = Date.UTC(2026, 7, 31, 12, 0, 0);
  const authorizationUrl = new URL(
    beginAppleWebAuthorization({ environment, now })
  );
  assert.equal(authorizationUrl.origin, "https://appleid.apple.com");
  assert.equal(authorizationUrl.pathname, "/auth/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "kr.matths.web");
  assert.equal(
    authorizationUrl.searchParams.get("redirect_uri"),
    "https://www.matths.kr/auth/apple/callback"
  );
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code id_token");
  assert.equal(authorizationUrl.searchParams.get("response_mode"), "form_post");
  assert.equal(authorizationUrl.searchParams.get("scope"), "name email");
  assert.match(authorizationUrl.searchParams.get("nonce"), /^[a-f0-9]{64}$/);

  const config = _testing.appleWebConfig(environment);
  const state = authorizationUrl.searchParams.get("state");
  const statePayload = _testing.consumeState(state, config, now);
  assert.match(statePayload.nonce, /^[A-Za-z0-9_-]{43}$/);
  await assert.rejects(
    async () => _testing.consumeState(`${state}x`, config, now),
    (error) => error?.code === "SOCIAL_AUTH_STATE_INVALID"
  );
  await assert.rejects(
    async () =>
      _testing.consumeState(
        state,
        config,
        now + _testing.APPLE_WEB_STATE_MAX_AGE_MS + 1
      ),
    (error) => error?.code === "SOCIAL_AUTH_STATE_INVALID"
  );

  assert.equal(
    _testing.appleFullName(JSON.stringify({
      name: { firstName: "수빈", lastName: "이" },
      email: "ignored@example.com",
    })),
    "수빈 이"
  );
  assert.equal(_testing.appleFullName("not-json"), "");

  let exchangeInput;
  const completed = await completeAppleWebAuthorization(
    {
      code: "apple-web-code",
      identityToken: "header.payload.signature",
      state,
      user: JSON.stringify({ name: { firstName: "수빈", lastName: "이" } }),
    },
    {
      environment,
      now,
      exchangeImpl: async (input) => {
        exchangeInput = input;
        return { user: { _id: "apple-web-user" } };
      },
    }
  );
  assert.equal(completed.user._id, "apple-web-user");
  assert.equal(exchangeInput.authorizationCode, "apple-web-code");
  assert.equal(exchangeInput.identityToken, "header.payload.signature");
  assert.equal(exchangeInput.nonce, statePayload.nonce);
  assert.equal(exchangeInput.fullName, "수빈 이");
  assert.equal(
    exchangeInput.redirectUri,
    "https://www.matths.kr/auth/apple/callback"
  );
  await assert.rejects(
    completeAppleWebAuthorization(
      { state, error: "user_cancelled_authorize" },
      { environment, now, exchangeImpl: async () => assert.fail("교환되면 안 됨") }
    ),
    (error) => error?.code === "SOCIAL_AUTH_CANCELLED"
  );

  const callbackAllowed = await runSecurityBoundary({
    method: "POST",
    path: "/auth/apple/callback",
    originalUrl: "/auth/apple/callback",
    get(name) {
      const headers = {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        origin: "https://appleid.apple.com",
        "sec-fetch-site": "cross-site",
      };
      return headers[String(name).toLowerCase()] || "";
    },
  });
  assert.equal(callbackAllowed, null);

  const unrelatedCrossSitePost = await runSecurityBoundary({
    method: "POST",
    path: "/profile/password",
    originalUrl: "/profile/password",
    get(name) {
      const headers = {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      };
      return headers[String(name).toLowerCase()] || "";
    },
  });
  assert.equal(unrelatedCrossSitePost?.code, "CROSS_SITE_REQUEST_BLOCKED");

  const routes = source("routes/matths-routes.js");
  const controller = source("controllers/matthsController.js");
  const login = source("views/login.ejs");
  const css = source("public/css/auth.css");
  const cloudtype = source(".cloudtype/app.yaml");
  const preview = source("scripts/previewLocalUi.js");
  assert.match(
    routes,
    /router\.get\(\s*"\/auth\/apple",\s*authMiddleware\.isLoggedOut,\s*appleWebOAuthStartIpRateLimit,/
  );
  assert.match(
    routes,
    /router\.post\(\s*"\/auth\/apple\/callback",\s*appleWebOAuthCallbackIpRateLimit,/
  );
  const requestSecurity = source("middleware/requestSecurity.js");
  assert.match(requestSecurity, /name: "apple-web-oauth-start-ip"/);
  assert.match(requestSecurity, /name: "apple-web-oauth-callback-ip"/);
  assert.match(controller, /completeAppleWebAuthorization/);
  assert.match(login, /Apple로 계속하기/);
  assert.match(login, /href="<%= socialProviderConfigured\('apple'\) \? '\/auth\/apple'/);
  assert.match(css, /\.social-auth-button\.is-apple/);
  assert.match(preview, /app\.get\("\/preview\/login"/);
  assert.match(cloudtype, /name: APPLE_SERVICES_ID\s+value: kr\.matths\.web/);
  assert.match(
    cloudtype,
    /name: APPLE_OAUTH_REDIRECT_URI\s+value: https:\/\/www\.matths\.kr\/auth\/apple\/callback/
  );

  console.log("Apple web Sign in authorization, state, CSRF boundary, UI, and deployment contract verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

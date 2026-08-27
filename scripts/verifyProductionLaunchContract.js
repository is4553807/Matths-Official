const assert = require("node:assert/strict");
const http = require("node:http");
const {
  parseArguments,
  runProductionChecks,
} = require("./verifyProductionLaunch");

const expectedContact = "dltkddbs4553@matths.kr";

function createFixtureServer(mode = "valid") {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://fixture.local");
    const json = (status, body) => {
      response.writeHead(status, {
        "content-type": "application/json",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "strict-transport-security": "max-age=31536000",
      });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === "/api/v1/health") return json(200, { status: "ok" });
    if (url.pathname === "/api/v1/ready") return json(200, { status: "ready" });
    if (url.pathname === "/api/v1/auth/providers") {
      const providers = [
        { key: "google", configured: true },
        { key: "kakao", configured: true },
        { key: "apple", configured: mode !== "apple-disabled", revocable: true },
      ];
      return json(200, { providers });
    }
    if (["/auth/google", "/auth/kakao", "/auth/kakao/app"].includes(url.pathname)) {
      const isGoogle = url.pathname === "/auth/google";
      const host = mode === "wrong-oauth-host"
        ? "attacker.example"
        : (isGoogle ? "accounts.google.com" : "kauth.kakao.com");
      const callback = isGoogle ? "google" : "kakao";
      response.writeHead(302, {
        location:
          `https://${host}/oauth?state=fixture-state&redirect_uri=` +
          encodeURIComponent(`${fixtureBaseUrl}/auth/${callback}/callback`),
        "set-cookie": "session=fixture; HttpOnly; Secure; SameSite=Lax",
      });
      return response.end();
    }
    if ([
      "/api/v1/auth/social/exchange",
      "/api/v1/auth/google/exchange",
    ].includes(url.pathname)) {
      return json(mode === "missing-exchange" ? 404 : 401, {
        code: "SOCIAL_AUTH_GRANT_INVALID",
      });
    }
    if (url.pathname === "/api/v1/auth/apple/exchange") {
      return json(400, { code: "APPLE_AUTH_NONCE_REQUIRED" });
    }
    if (url.pathname === "/api/v1/commerce/storefront") {
      return json(401, { code: "UNAUTHORIZED" });
    }
    if (url.pathname === "/api/v1/commerce/apple/notifications") {
      return json(400, { received: false });
    }
    if (["/privacy", "/terms"].includes(url.pathname)) {
      response.writeHead(200, { "content-type": "text/html" });
      const stale = mode === "stale-contact" ? " admin@lsbproduction.com" : "";
      return response.end(`<main>${expectedContact}${stale}</main>`);
    }
    return json(404, { code: "NOT_FOUND" });
  });
}

let fixtureBaseUrl = "";
async function runFixture(mode) {
  const server = createFixtureServer(mode);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  fixtureBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const options = parseArguments([
      "--base-url", fixtureBaseUrl,
      "--expected-contact", expectedContact,
      "--timeout-seconds", "2",
    ], {});
    return await runProductionChecks(options);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

async function main() {
  const valid = await runFixture("valid");
  assert.equal(valid.length, 13);
  assert.ok(valid.every((result) => result.ok));

  const stale = await runFixture("stale-contact");
  assert.ok(stale.some((result) => (
    !result.ok && result.name === "privacy public contact"
  )));
  assert.ok(stale.some((result) => (
    !result.ok && result.name === "terms public contact"
  )));

  const disabled = await runFixture("apple-disabled");
  assert.ok(disabled.some((result) => (
    !result.ok && result.name === "configured auth providers"
  )));

  const wrongHost = await runFixture("wrong-oauth-host");
  assert.ok(wrongHost.filter((result) => (
    !result.ok && result.name.includes("OAuth redirect")
  )).length >= 3);

  const missingRoute = await runFixture("missing-exchange");
  assert.ok(missingRoute.some((result) => (
    !result.ok && result.name === "social exchange route"
  )));
  assert.ok(missingRoute.some((result) => (
    !result.ok && result.name === "Google legacy exchange route"
  )));

  assert.throws(
    () => parseArguments(["--base-url", "http://www.matths.kr"], {}),
    /HTTPS/
  );
  assert.throws(
    () => parseArguments(["--wait-seconds", "invalid"], {}),
    /숫자/
  );

  console.log(
    "Production verifier contract passed: valid surface accepted; stale contact, " +
      "disabled Apple, wrong OAuth host, missing exchange, and insecure URL rejected."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

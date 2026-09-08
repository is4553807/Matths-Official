const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const express = require("express");

const root = path.join(__dirname, "..");
const associationPath = path.join(
  root,
  "public",
  ".well-known",
  "apple-app-site-association"
);
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const association = JSON.parse(fs.readFileSync(associationPath, "utf8"));
const details = association?.applinks?.details;

if (!Array.isArray(details) || details.length !== 1) {
  throw new Error("AASA applinks.details must contain exactly one app binding");
}
if (details[0].appID !== "64U874RU4D.kr.matths.app") {
  throw new Error("AASA appID must match the Apple Team ID and iOS bundle ID");
}

const paths = new Set(details[0].paths || []);
const requiredPaths = [
  "/goat-arena/*",
  "/academy/*",
  "/admin/*",
  "/parent/*",
  "/community/*",
  "/learn/*",
  "/private-mock-exams/*",
  "/notifications/*",
  "/pricing/*",
  "/forgot-password/link",
  "/terms",
  "/privacy",
];
for (const requiredPath of requiredPaths) {
  if (!paths.has(requiredPath)) {
    throw new Error(`AASA is missing app-owned route: ${requiredPath}`);
  }
}

if (!serverSource.includes('"/.well-known/apple-app-site-association"')) {
  throw new Error("server must expose the well-known AASA URL");
}
if (!serverSource.includes('"Content-Type": "application/json"')) {
  throw new Error("server must serve AASA as application/json");
}

async function verifyActualHTTPRoute() {
  const app = express();
  const start = serverSource.indexOf("const appleAppSiteAssociationPath = path.join(");
  const end = serverSource.indexOf("server.use(express.static", start);
  assert.ok(start >= 0 && end > start, "Actual AASA route registration must remain before static files");
  const explicitDotfileGrants = [...serverSource.matchAll(/dotfiles\s*:\s*["']allow["']/g)];
  assert.equal(explicitDotfileGrants.length, 1, "Only the fixed AASA sendFile may allow dotfiles");
  assert.ok(explicitDotfileGrants[0].index > start && explicitDotfileGrants[0].index < end,
    "General static-file middleware must not expose hidden files");
  assert.ok(start < serverSource.indexOf("server.use(session("), "AASA must remain before authenticated/session middleware");
  // Use actual host-routing middleware with isolated production defaults.
  // No environment variables or hosting configuration outside this test change.
  for (const [file, middlewareName] of [
    ["canonicalHost.js", "canonicalHostRedirect"], ["serviceHostRouting.js", "serviceHostRouting"],
  ]) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, "middleware", file), "utf8"), {
      module, require, URL, process: { env: { NODE_ENV: "production" } },
    });
    app.use(module.exports[middlewareName]);
  }
  // Execute the exact production route: text/path existence checks alone did
  // not detect sendFile's default rejection of the .well-known directory.
  vm.runInNewContext(serverSource.slice(start, end), { server: app, path, __dirname: root });
  app.use(express.static(path.join(root, "public")));
  app.use((error, _req, res, _next) => res.status(error.status || 500).end());
  const listener = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  let checks = 0;
  try {
    const base = `http://127.0.0.1:${listener.address().port}`;
    const hosts = ["www.matths.kr", "app.matths.kr", "academy.matths.kr", "admin.matths.kr", "parents.matths.kr"];
    for (const host of hosts) {
      for (const target of ["/.well-known/apple-app-site-association", "/apple-app-site-association"]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await fetch(base + target, {
            method, headers: { Host: host }, redirect: "manual", signal: AbortSignal.timeout(5000),
          });
          assert.equal(response.status, 200, `${method} AASA must be served without login or redirect`);
          assert.match(response.headers.get("content-type") || "", /^application\/json\b/);
          assert.equal(response.headers.get("set-cookie"), null, "AASA must not create a login session");
          assert.match(response.headers.get("cache-control") || "", /max-age=3600/);
          if (method === "GET") assert.deepEqual(await response.json(), association);
          checks += 1;
        }
      }
    }
    for (const target of ["/.well-known/.env", "/.env", "/.git/config", "/.well-known/apple-app-site-association/extra"]) {
      const response = await fetch(base + target, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 404, "Only the fixed AASA resource is public");
      checks += 1;
    }
  } finally {
    listener.closeAllConnections();
    await new Promise((resolve) => listener.close(resolve));
  }
  console.log(`Associated Domains source + actual anonymous HTTP contract passed (${checks} cases)`);
}

verifyActualHTTPRoute().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

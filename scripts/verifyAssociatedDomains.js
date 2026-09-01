const fs = require("fs");
const path = require("path");

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

console.log("Associated Domains server contract passed");

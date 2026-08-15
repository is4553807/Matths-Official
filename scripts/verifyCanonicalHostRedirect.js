const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalRedirectLocation,
} = require("../middleware/canonicalHost");

const production = { NODE_ENV: "production" };
assert.equal(
  canonicalRedirectLocation({
    hostname: "matths.kr",
    originalUrl: "/auth/google?next=%2Fmain",
    environment: production,
  }),
  "https://www.matths.kr/auth/google?next=%2Fmain"
);
assert.equal(
  canonicalRedirectLocation({
    hostname: "MATTHS.KR:443",
    originalUrl: "/",
    environment: production,
  }),
  "https://www.matths.kr/"
);
assert.equal(
  canonicalRedirectLocation({
    hostname: "www.matths.kr",
    originalUrl: "/login",
    environment: production,
  }),
  ""
);
assert.equal(
  canonicalRedirectLocation({
    hostname: "mpzm0tyz6f7ddb63.sel3.cloudtype.app",
    originalUrl: "/api/v1/health",
    environment: production,
  }),
  ""
);
assert.equal(
  canonicalRedirectLocation({
    hostname: "matths.kr",
    originalUrl: "/login",
    environment: { NODE_ENV: "development" },
  }),
  ""
);
assert.equal(
  canonicalRedirectLocation({
    hostname: "legacy.example.com",
    originalUrl: "/path?q=1",
    environment: {
      NODE_ENV: "production",
      CANONICAL_REDIRECT_SOURCE_HOST: "legacy.example.com",
      CANONICAL_HOST: "app.example.com",
    },
  }),
  "https://app.example.com/path?q=1"
);

const cloudtypeConfig = fs.readFileSync(
  path.resolve(__dirname, "..", ".cloudtype", "app.yaml"),
  "utf8"
);
assert.match(
  cloudtypeConfig,
  /name:\s*CANONICAL_REDIRECT_SOURCE_HOST\s+value:\s*matths\.kr/
);
assert.match(
  cloudtypeConfig,
  /name:\s*CANONICAL_HOST\s+value:\s*www\.matths\.kr/
);

console.log(
  "Canonical host redirect verified: bare production host preserves path/query, www and platform health hosts pass through, and non-production stays local."
);

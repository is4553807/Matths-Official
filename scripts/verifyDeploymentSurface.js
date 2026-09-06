const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const cloudtype = read(".cloudtype/app.yaml");
const dockerignore = read(".dockerignore");
const gitignore = read(".gitignore");
const environmentExample = read(".env.example");
const homepage = read("views/index.ejs");
const robots = read("public/robots.txt");
const sitemap = read("public/sitemap.xml");

assert.match(packageJson.engines?.node || "", />=24/);
assert.equal(packageLock.packages?.[""]?.engines?.node, packageJson.engines.node);
assert.match(cloudtype, /app: node@24/);
assert.match(
  cloudtype,
  /install: rm -rf node_modules && npm ci --omit=dev --no-audit/
);
assert.match(cloudtype, /APP_BASE_URL[\s\S]*https:\/\/www\.matths\.kr/);
assert.match(cloudtype, /PUBLIC_BASE_URL[\s\S]*https:\/\/www\.matths\.kr/);
assert.match(
  cloudtype,
  /GOOGLE_OAUTH_REDIRECT_URI[\s\S]*https:\/\/www\.matths\.kr\/auth\/google\/callback/
);
assert.match(
  cloudtype,
  /KAKAO_OAUTH_REDIRECT_URI[\s\S]*https:\/\/www\.matths\.kr\/auth\/kakao\/callback/
);
assert.doesNotMatch(
  cloudtype,
  /GOOGLE_OAUTH_CLIENT_(?:ID|SECRET)|KAKAO_OAUTH_(?:REST_API_KEY|CLIENT_SECRET)/
);

assert.match(homepage, /<link rel="canonical" href="https:\/\/www\.matths\.kr\/" \/>/);
for (const property of ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image"]) {
  assert.match(homepage, new RegExp(`<meta(?:\\s|\\n)+property="${property}"`));
}
assert.match(robots, /^User-agent: \*$/m);
assert.match(robots, /^Allow: \/$/m);
assert.match(robots, /^Sitemap: https:\/\/www\.matths\.kr\/sitemap\.xml$/m);
assert.match(sitemap, /<loc>https:\/\/www\.matths\.kr\/<\/loc>/);

for (const required of [
  "config.env",
  "*.env",
  "credentials*.json",
  "node_modules",
  "uploads",
  "docs",
  "scripts",
  "ipad",
  "dataAnalysis/arenaPdfSkeletonImplementation/*",
]) {
  assert.ok(dockerignore.includes(required), `.dockerignore에 ${required} 제외 규칙이 없습니다.`);
}
for (const runtimeDataFile of [
  "!dataAnalysis/arenaPdfSkeletonImplementation/canonical-structure-catalog-v1.json",
  "!dataAnalysis/arenaPdfSkeletonImplementation/generator-blueprints-v1.json",
]) {
  assert.ok(
    dockerignore.includes(runtimeDataFile),
    `.dockerignore가 운영 문제 데이터 ${runtimeDataFile.slice(1)}를 다시 포함하지 않습니다.`
  );
}
assert.ok(gitignore.includes("config.env") || gitignore.includes("*.env"));

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);
const allowedEnvironmentExample = (file) =>
  file === ".env.example" || /\.env(?:\.[^/]+)?\.example$/.test(file);
const forbiddenTracked = trackedFiles.filter((file) =>
  (
    /^(?:config\.env|\.env(?:\.|$)|node_modules\/|uploads\/|tmp\/|temp\/|outputs?\/)/.test(file) &&
    !allowedEnvironmentExample(file)
  ) ||
  /(?:credentials|service-account).*\.json$/i.test(file) ||
  /\.(?:pem|key|enc|p12|pfx)$/i.test(file)
);
assert.deepEqual(forbiddenTracked, [], `Git에 민감·런타임 파일이 추적 중입니다: ${forbiddenTracked.join(", ")}`);

const viewFiles = fs.readdirSync(path.join(root, "views"), { recursive: true })
  .filter((file) => file.endsWith(".ejs"));
const forbiddenLaunchCopy = /로컬 개발|개발 환경 확인용|PG 연결 전|현재 PG는 연결|나중에 이 주문|localhost|127\.0\.0\.1/;
for (const relative of viewFiles) {
  const source = read(path.join("views", relative));
  assert.equal(
    forbiddenLaunchCopy.test(source),
    false,
    `${relative}에 출시 화면용이 아닌 문구가 남아 있습니다.`
  );
}

const checkoutService = read("services/checkoutService.js");
assert.match(checkoutService, /provider === "INICIS"/);
assert.match(checkoutService, /isInicisConfigured/);
assert.match(checkoutService, /PAID_CHECKOUT_UNAVAILABLE/);
assert.match(cloudtype, /PAID_CHECKOUT_ENABLED[\s\S]*value: "true"/);
assert.match(cloudtype, /INICIS_PAYMENTS_MODE[\s\S]*value: LIVE/);
assert.doesNotMatch(
  cloudtype,
  /^\s*-\s+name:\s+INICIS_TEST_(?:REVIEW_EMAILS|MID|HASH_KEY|API_KEY|CLIENT_IP)\s*$/m
);
assert.match(checkoutService, /INICIS_TEST_REVIEW_ACCOUNT_REQUIRED/);
assert.doesNotMatch(
  cloudtype,
  /^\s*-\s+name:\s+INICIS_LIVE_(?:MID|HASH_KEY|API_KEY|CLIENT_IP)\s*$/m
);
for (const required of [
  "PAYMENT_PROVIDER=INICIS",
  "INICIS_PAYMENTS_MODE=LIVE",
  "INICIS_LIVE_MID=",
  "INICIS_LIVE_HASH_KEY=",
  "INICIS_LIVE_API_KEY=",
  "INICIS_LIVE_CLIENT_IP=",
]) {
  assert.ok(environmentExample.includes(required), `.env.example에 ${required}가 없습니다.`);
}
assert.doesNotMatch(
  environmentExample,
  /^INICIS_TEST_(?:REVIEW_EMAILS|MID|HASH_KEY|API_KEY|CLIENT_IP)=/m
);

const inicisService = read("services/inicisPaymentService.js");
const paymentService = read("services/paymentService.js");
assert.match(inicisService, /payAppl\.ini/);
assert.match(inicisService, /P_CHKFAKE/);
assert.match(inicisService, /api\/v1\/refund/);
assert.match(paymentService, /PAYMENT_AMOUNT_MISMATCH/);
assert.match(paymentService, /applyApprovedPackagePayment/);
assert.match(paymentService, /applyApprovedMockExamPayment/);

for (const [dependency, expected] of [
  ["js-yaml", "^5.2.3"],
  ["nodemailer", "^9.0.5"],
  ["pdfjs-dist", "6.2.108"],
]) {
  assert.equal(packageJson.dependencies?.[dependency], expected);
  assert.equal(packageLock.packages?.[""]?.dependencies?.[dependency], expected);
}

console.log(
  `Deployment surface verified: ${trackedFiles.length} tracked files, ` +
    `${viewFiles.length} launch views, no tracked secrets or development-only copy.`
);

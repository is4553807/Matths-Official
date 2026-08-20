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

assert.match(packageJson.engines?.node || "", />=24/);
assert.equal(packageLock.packages?.[""]?.engines?.node, packageJson.engines.node);
assert.match(cloudtype, /app: node@24/);
assert.match(cloudtype, /install: npm ci --omit=dev --no-audit/);
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
  /\.(?:pem|key|p12|pfx)$/i.test(file)
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
assert.match(checkoutService, /provider === "TOSS"/);
assert.match(checkoutService, /isTossConfigured/);
assert.match(checkoutService, /PAID_CHECKOUT_UNAVAILABLE/);
assert.doesNotMatch(cloudtype, /PAID_CHECKOUT_ENABLED[\s\S]*true/);

const tossService = read("services/tossPaymentService.js");
const paymentService = read("services/paymentService.js");
assert.match(tossService, /\/v1\/payments\/confirm/);
assert.match(tossService, /Idempotency-Key/);
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

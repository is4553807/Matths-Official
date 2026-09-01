const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...segments) =>
  fs.readFileSync(path.join(root, ...segments), "utf8");

[
  ["middleware", "localizationMiddleware.js"],
  ["services", "localizationService.js"],
  ["public", "js", "i18n.js"],
  ["public", "css", "language-switcher.css"],
  ["public", "i18n", "en.json"],
  ["scripts", "buildEnglishTranslations.js"],
].forEach((segments) => {
  assert.equal(
    fs.existsSync(path.join(root, ...segments)),
    false,
    `영어 변환 파일이 다시 추가되면 안 됩니다: ${segments.join("/")}`
  );
});

const runtimeSources = [
  read("server.js"),
  read("scripts", "previewLocalUi.js"),
  read("public", "js", "auth.js"),
  read("views", "goat-arena-rules.ejs"),
  read("views", "partials", "business-footer.ejs"),
  read("package.json"),
].join("\n");

[
  "localizationMiddleware",
  "matths_language",
  "matths-language-switcher",
  "data-i18n",
  "usesEnglishInterface",
  "i18n:build-en",
  "i18n:verify",
].forEach((token) => {
  assert.equal(
    runtimeSources.includes(token),
    false,
    `영어 변환 경로가 남아 있습니다: ${token}`
  );
});

const viewFiles = fs
  .readdirSync(path.join(root, "views"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ejs"))
  .map((entry) => entry.name);

for (const fileName of viewFiles) {
  const source = read("views", fileName);
  if (!/<html\b/i.test(source)) continue;
  assert.match(
    source,
    /<html\b[^>]*\blang=["']ko["']/i,
    `${fileName}의 문서 언어는 한국어여야 합니다.`
  );
}

const footer = read("views", "partials", "business-footer.ejs");
assert.match(footer, />맵쓰 \(Matths\)</);
assert.match(footer, />이상윤</);
assert.match(footer, />주식회사 클라우드타입</);

console.log(`Korean-only interface verification passed: ${viewFiles.length} views checked.`);

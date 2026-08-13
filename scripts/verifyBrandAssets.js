const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const viewsDir = path.join(root, "views");

function imageInfo(relativePath) {
  const fullPath = path.join(publicDir, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} 자산이 필요합니다.`);
  const output = execFileSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", fullPath],
    { encoding: "utf8" }
  );
  const number = (key) => Number(new RegExp(`${key}: (\\d+)`).exec(output)?.[1]);
  return {
    width: number("pixelWidth"),
    height: number("pixelHeight"),
    hasAlpha: /hasAlpha: yes/.test(output),
  };
}

const mark = imageInfo("images/matths-mark.png");
assert.deepEqual([mark.width, mark.height, mark.hasAlpha], [512, 512, true]);
for (const [file, size] of [
  ["images/favicon-32.png", 32],
  ["images/favicon-64.png", 64],
  ["apple-touch-icon.png", 180],
]) {
  const info = imageInfo(file);
  assert.deepEqual([info.width, info.height, info.hasAlpha], [size, size, true]);
}
assert.ok(fs.existsSync(path.join(publicDir, "favicon.ico")), "favicon.ico가 필요합니다.");

const viewFiles = fs
  .readdirSync(viewsDir, { recursive: true })
  .filter((file) => file.endsWith(".ejs"));
for (const relativePath of viewFiles) {
  const source = fs.readFileSync(path.join(viewsDir, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /goat-arena-logo\.jpg|<link(?=[^>]*rel="icon")(?=[^>]*type="image\/jpeg")[^>]*>/,
    `${relativePath}에 이전 로고 또는 JPEG 파비콘 참조가 남아 있습니다.`
  );
}

const brandCss = fs.readFileSync(path.join(publicDir, "css/brand.css"), "utf8");
const arenaCss = fs.readFileSync(path.join(publicDir, "css/goat-arena.css"), "utf8");
const themeCss = fs.readFileSync(path.join(publicDir, "css/matths-theme.css"), "utf8");
assert.match(brandCss, /background-image:\s*url\("\/images\/matths-mark\.png"\)/);
assert.match(brandCss, /background-size:\s*contain/);
assert.match(arenaCss, /\.arena-brand-logo[\s\S]*?object-fit:\s*contain/);
assert.doesNotMatch(themeCss, /\.brand-mark,[\s\S]{0,180}background-color:\s*var\(--matths-navy\)/);
assert.match(themeCss, /\.brand-mark,[\s\S]{0,180}background-color:\s*transparent\s*!important/);

console.log(`Brand asset verification passed: ${viewFiles.length} EJS templates checked`);

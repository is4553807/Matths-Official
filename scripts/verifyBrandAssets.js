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
const logoPath = path.join(publicDir, "images/brand/matths-logo.svg");
assert.ok(fs.existsSync(logoPath), "images/brand/matths-logo.svg 자산이 필요합니다.");
const lightLogoPath = path.join(publicDir, "images/brand/matths-logo-light.svg");
assert.ok(
  fs.existsSync(lightLogoPath),
  "images/brand/matths-logo-light.svg 자산이 필요합니다."
);
const logoSource = fs.readFileSync(logoPath, "utf8");
const lightLogoSource = fs.readFileSync(lightLogoPath, "utf8");
assert.match(
  logoSource,
  /viewBox="285 160 790 240"/,
  "메인 내비게이션 기준 Matths 풀 로고 SVG여야 합니다."
);
assert.match(
  lightLogoSource,
  /viewBox="285 160 790 240"/,
  "어두운 배경용 로고도 같은 Matths 풀 로고 비율이어야 합니다."
);
assert.match(lightLogoSource, /stroke="#F7F8FF"/);
assert.match(lightLogoSource, /fill="#F7F8FF"/);
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
    /goat-arena-logo\.jpg|\/images\/matths-mark\.png|class="brand-mark"|business-site-footer__brand-mark|arena-brand-logo|<link(?=[^>]*rel="icon")(?=[^>]*type="image\/jpeg")[^>]*>/,
    `${relativePath}에 공통 풀 로고가 아닌 이전 로고 또는 JPEG 파비콘 참조가 남아 있습니다.`
  );
  assert.doesNotMatch(
    source,
    /surface:\s*true|matths-brand-lockup--surface/,
    `${relativePath}에 로고 뒤 흰색 배경을 만드는 이전 surface 변형이 남아 있습니다.`
  );
  const sidebarBlocks = source.match(
    /<aside\b[^>]*class="[^"]*\bsidebar\b[^"]*"[^>]*>[\s\S]*?<\/aside>/g
  ) || [];
  for (const sidebarBlock of sidebarBlocks) {
    if (!sidebarBlock.includes('include("partials/matths-brand"')) continue;
    assert.match(
      sidebarBlock,
      /tone:\s*"light"/,
      `${relativePath}의 어두운 대시보드 사이드바 로고는 흰색 워드마크를 사용해야 합니다.`
    );
  }
}

const brandCss = fs.readFileSync(path.join(publicDir, "css/brand.css"), "utf8");
const arenaCss = fs.readFileSync(path.join(publicDir, "css/goat-arena.css"), "utf8");
const logoCss = fs.readFileSync(path.join(publicDir, "css/matths-logo.css"), "utf8");
const logoPartial = fs.readFileSync(path.join(viewsDir, "partials/matths-brand.ejs"), "utf8");
assert.match(brandCss, /@import url\("\/css\/matths-logo\.css"\)/);
assert.match(arenaCss, /@import url\("\/css\/matths-logo\.css"\)/);
assert.match(logoCss, /\.matths-brand-lockup__image/);
assert.match(logoCss, /object-fit:\s*contain/);
assert.match(logoPartial, /\/images\/brand\/matths-logo\.svg/);
assert.match(logoPartial, /\/images\/brand\/matths-logo-light\.svg/);
assert.match(logoPartial, /matthsBrandTone === "light"/);
assert.doesNotMatch(logoCss, /matths-brand-lockup--surface/);
assert.match(logoPartial, /width="132"/);
assert.match(logoPartial, /height="41"/);

console.log(`Brand asset verification passed: ${viewFiles.length} EJS templates checked`);

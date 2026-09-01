const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const viewRoot = path.join(root, "views");
const cssRoot = path.join(root, "public", "css");
const publicRoot = path.join(root, "public");

const officialRankCrestHashes = Object.freeze({
  bronze: "a14a17eefd0ac571d457f3c423c07b6deeaf429c30dcaa05cf4b151413ec23d5",
  silver: "ba3560970f1af5e4b2e29450d66769f066b893081416d9fc913c1bde31ba831f",
  gold: "6654d11b680b008a2dba02bccc0a32940f257650452421cf47ebc30d3ccae38a",
  platinum: "d919f76d695f42e29756a06db22c1c62fd1a0c00f56c7772fc9811d5f0c721fb",
  emerald: "3df266adf7a441d606d80231cca90f77be2dd53608a31830dd5e316a2434c79a",
  diamond: "a6b37e97af64f557fde698c50d7b462b05e2052087c60a4abc1b425fa95d97ad",
  master: "e117e7f9afdb00f3ab57e6f2b67083b92b94b98ca0b7c6dc8bb94e69b57e9ab6",
  grandmaster: "e7543310a16b6ade1b0fd787b676bb5ededc06ace0e16e7ba487cd767ef6098c",
  challenger: "139444e653a3c910b6126fbd1c6092aac7f6e18e9acf5fbc986e7738bb2cc8d3",
});

for (const [tier, expectedHash] of Object.entries(officialRankCrestHashes)) {
  const asset = path.join(publicRoot, "images", "ranks", `${tier}.webp`);
  assert.ok(fs.existsSync(asset), `${tier} 공식 휘장 파일이 없습니다.`);
  const actualHash = createHash("sha256").update(fs.readFileSync(asset)).digest("hex");
  assert.equal(actualHash, expectedHash, `${tier} 휘장은 승인된 최적화 WebP여야 합니다.`);
}

function filesIn(directory, extension) {
  return fs
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      const absolute = path.join(
        directory,
        entry.name
      );
      if (entry.isDirectory()) {
        return filesIn(absolute, extension);
      }
      return entry.name.endsWith(extension)
        ? [absolute]
        : [];
    });
}

const viewFiles = filesIn(viewRoot, ".ejs");
for (const filename of viewFiles) {
  const markup = fs.readFileSync(
    filename,
    "utf8"
  );
  ejs.compile(
    markup,
    { filename }
  );

  if (/<!doctype html>/i.test(markup)) {
    assert.match(
      markup,
      /<link[^>]+rel=["'](?:shortcut )?icon["']/i,
      `favicon이 없는 화면: ${path.relative(
        root,
        filename
      )}`
    );
  }

  for (const match of markup.matchAll(
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["'](\/css\/[^"']+)["']/gi
  )) {
    const stylesheet = path.join(
      publicRoot,
      match[1].split("?")[0]
    );
    assert.ok(
      fs.existsSync(stylesheet),
      `존재하지 않는 stylesheet: ${match[1]} (${path.relative(
        root,
        filename
      )})`
    );
  }
}

const cssFiles = filesIn(cssRoot, ".css");
const css = cssFiles
  .map((filename) =>
    fs.readFileSync(filename, "utf8")
  )
  .join("\n");

assert.doesNotMatch(
  css,
  /rank-crests-(?:grid|v2)/i,
  "화면은 임의 편집한 통합 휘장 이미지가 아니라 티어별 공식 PNG를 사용해야 합니다."
);

assert.doesNotMatch(
  css,
  /font-size:\s*[5-8]px\b/,
  "5~8px 안내 문구는 화면 배율에 따라 읽을 수 없으므로 최소 9px을 사용해야 합니다."
);

const publicNavigationCss = fs.readFileSync(
  path.join(cssRoot, "public-navigation.css"),
  "utf8"
);
assert.match(
  publicNavigationCss,
  /@import\s+url\(["']\/css\/home-public-navigation\.css["']\)/,
  "공개 페이지 Navbar는 index.ejs와 같은 스타일 원본을 사용해야 합니다."
);

const homePublicNavigationCss = fs.readFileSync(
  path.join(cssRoot, "home-public-navigation.css"),
  "utf8"
);

const communityCss = fs.readFileSync(
  path.join(cssRoot, "community.css"),
  "utf8"
);
assert.match(
  communityCss,
  /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)[\s\S]*?\.community-hero\s*\{[\s\S]*?min-height:\s*0[\s\S]*?\.community-board-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/,
  "작은 iPhone 가로 게시판은 데스크톱 영웅 영역을 압축하고 게시판 전환을 한 줄로 유지해야 합니다."
);
assert.match(
  homePublicNavigationCss,
  /@media\s*\(max-width:\s*1100px\)/,
  "공개 Navbar는 중간 화면 폭에서 메뉴 버튼이 삐져나오기 전에 축소 메뉴로 전환해야 합니다."
);

const publicNavigationPartial = fs.readFileSync(
  path.join(viewRoot, "partials", "public-navigation.ejs"),
  "utf8"
);
assert.match(
  publicNavigationPartial,
  /include\(["']home-public-navigation["']/,
  "공개 페이지 Navbar는 index.ejs와 같은 partial을 사용해야 합니다."
);

const homePublicNavigationPartial = fs.readFileSync(
  path.join(viewRoot, "partials", "home-public-navigation.ejs"),
  "utf8"
);
for (const label of [
  "시각화 학습",
  "학습 과정",
  "교육과정",
  "이용권",
  "게시판",
  "FAQ",
  "아카이브",
]) {
  assert.match(
    homePublicNavigationPartial,
    new RegExp(`[,\"]${label}[\"]\\]`),
    `공개 Navbar 메뉴명이 누락되었습니다: ${label}`
  );
}

const adminCss = fs.readFileSync(
  path.join(cssRoot, "admin.css"),
  "utf8"
);
assert.match(
  adminCss,
  /@media\s*\(max-width:\s*1180px\)/,
  "관리자 Navbar는 1180px 이하에서 두 줄 레이아웃을 사용해야 합니다."
);

const forensicMarkup = fs.readFileSync(
  path.join(viewRoot, "admin-pdf-forensics.ejs"),
  "utf8"
);
assert.match(
  forensicMarkup,
  /data-forensic-analysis-form[\s\S]*?유출 자료 추적중/,
  "유출 자료 분석 요청에는 즉시 표시되는 진행 상태가 필요합니다."
);
assert.match(
  forensicMarkup,
  /form\.classList\.add\("is-submitting"\)/,
  "유출 자료 분석 요청은 중복 제출을 막는 상태 전환이 필요합니다."
);
assert.match(
  forensicMarkup,
  /name="traceCode"[\s\S]*?data-forensic-trace-code/,
  "유출 자료 분석 화면에는 추적 코드 직접 입력 기능이 필요합니다."
);
assert.match(
  forensicMarkup,
  /hasFile === hasTraceCode[\s\S]*?파일과 추적 코드 중 한 가지만 선택해야 합니다/,
  "유출 자료 분석은 파일과 추적 코드의 동시 제출을 막아야 합니다."
);
assert.match(
  adminCss,
  /\.forensic-analysis-spinner[\s\S]*?animation:\s*forensic-analysis-spin/,
  "유출 자료 분석 진행 상태에는 로딩 애니메이션이 필요합니다."
);

for (const filename of cssFiles) {
  const source = fs.readFileSync(
    filename,
    "utf8"
  );
  for (const match of source.matchAll(
    /url\(\s*["']?(\/[^"')?#]+)[^"')]*["']?\s*\)/gi
  )) {
    const asset = path.join(
      publicRoot,
      match[1]
    );
    assert.ok(
      fs.existsSync(asset),
      `CSS가 참조하는 파일이 없음: ${match[1]} (${path.relative(
        root,
        filename
      )})`
    );
  }
}

const registerMarkup = fs.readFileSync(
  path.join(viewRoot, "register.ejs"),
  "utf8"
);
const realNameIndex =
  registerMarkup.indexOf('id="realName"');
const birthDateIndex =
  registerMarkup.indexOf('id="birthDate"');
const nicknameIndex =
  registerMarkup.indexOf('id="name"');
assert.ok(
  realNameIndex >= 0 &&
    birthDateIndex > realNameIndex &&
    nicknameIndex > birthDateIndex,
  "회원가입 생년월일은 실명 다음, 닉네임 전에 있어야 합니다."
);

const auditedViews = viewFiles.map((filename) =>
  path.relative(viewRoot, filename)
);
// These hooks are intentionally styled through an element, parent, or attribute selector.
const structuralClasses = new Set([
  "active",
  "admin-nav-home",
  "archive-download-link",
  "arena-analysis-exact-solution",
  "arena-analysis-problem-copy",
  "arena-back-link",
  "arena-candidate-auto-tier",
  "arena-random-tier-mark",
  "course-panels",
  "faq-error-reference",
  "goat-arena-entry",
  "is-me",
  "is-result",
  "mode-button",
  "not-started",
  "parent-page",
  "previous",
  "progress-unit-list",
  "step-button",
]);
const missing = new Map();

for (const relative of auditedViews) {
  const markup = fs.readFileSync(
    path.join(viewRoot, relative),
    "utf8"
  );
  const staticMarkup = markup.replace(
    /<%[\s\S]*?%>/g,
    " "
  );
  const attributes = staticMarkup.matchAll(
    /class\s*=\s*"([^"]+)"/g
  );
  for (const attribute of attributes) {
    const classNames = attribute[1]
      .split(/\s+/)
      .filter(
        (className) =>
          /^[a-z][a-z0-9_-]*$/i.test(
            className
          ) &&
          !className.endsWith("-")
      );
    const hasStyledClass = classNames.some((className) => {
      const selector = new RegExp(
        `\\.${className.replace(
          /[-/\\^$*+?.()|[\]{}]/g,
          "\\$&"
        )}(?![a-zA-Z0-9_-])`
      );
      return selector.test(css);
    });

    if (
      classNames.length > 0 &&
      !hasStyledClass &&
      !classNames.some((className) =>
        structuralClasses.has(className)
      )
    ) {
      const classGroup = classNames.join(" ");
      if (!missing.has(classGroup)) {
        missing.set(classGroup, new Set());
      }
      missing.get(classGroup).add(relative);
    }
  }
}

assert.deepEqual(
  [...missing.keys()].sort(),
  [],
  `스타일 정의를 상속할 기준 class가 없는 요소:\n${[
    ...missing.entries(),
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([className, files]) => `- ${className}: ${[...files].join(", ")}`)
    .join("\n")}`
);

const copyFiles = [
  ...viewFiles,
  ...filesIn(
    path.join(publicRoot, "js"),
    ".js"
  ),
];
const informalCopy =
  /해주세요|해보세요|반가워요|할게요|해줄게요|줄게요|괜찮아|들켰네|보자\.|빼자\.|읽자\.|(?<!니)까\?|원점이야|공부다\.|시작된다\.|안전해요|있어요|이에요|예요\.|완료됐어요/u;

for (const filename of copyFiles) {
  assert.doesNotMatch(
    fs.readFileSync(filename, "utf8"),
    informalCopy,
    `사용자 문구의 높임말·띄어쓰기를 확인해야 합니다: ${path.relative(
      root,
      filename
    )}`
  );
}

const rulebookCopyFiles = [
  path.join(
    root,
    "services",
    "arenaRulebookViewService.js"
  ),
  path.join(
    root,
    "dataAnalysis",
    "arena2028MathAlignment.json"
  ),
];

for (const filename of rulebookCopyFiles) {
  assert.doesNotMatch(
    fs.readFileSync(filename, "utf8"),
    /(?<!니)다\./u,
    `경기 규정 사용자 문구는 높임말로 작성해야 합니다: ${path.relative(
      root,
      filename
    )}`
  );
}

console.log(
  `UI verification passed: ${viewFiles.length} EJS templates compiled and audited styles are present`
);

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const braceDepthAt = (source, index) => {
  let depth = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "{") depth += 1;
    if (source[cursor] === "}") depth -= 1;
  }
  return depth;
};
const topLevelRuleBodies = (source, selector) => {
  const bodies = [];
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{`, "g");
  for (const match of source.matchAll(pattern)) {
    if (braceDepthAt(source, match.index) !== 0) continue;
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let cursor = bodyStart;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    bodies.push(source.slice(bodyStart, cursor - 1));
  }
  return bodies;
};
const blockBodies = (source, headerPattern) => {
  const bodies = [];
  for (const match of source.matchAll(headerPattern)) {
    const open = source.indexOf("{", match.index + match[0].length);
    assert.notEqual(open, -1, `CSS block 시작을 찾지 못했습니다: ${match[0]}`);
    let depth = 1;
    let quote = null;
    let cursor = open + 1;
    while (cursor < source.length && depth > 0) {
      const character = source[cursor];
      if (quote) {
        if (character === "\\") cursor += 1;
        else if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, `CSS block이 닫히지 않았습니다: ${match[0]}`);
    bodies.push(source.slice(open + 1, cursor - 1));
  }
  return bodies;
};
const singleRuleBody = (source, selector) => {
  const bodies = topLevelRuleBodies(source, selector);
  assert.equal(bodies.length, 1, `${selector}: 해당 범위의 소유자는 정확히 하나여야 합니다.`);
  return bodies[0];
};

const profileView = read("views/profile.ejs");
const profileCss = stripComments(read("public/css/profile.css")).trim();
const legacyProfileCss = stripComments(read("public/css/profile-v2.css")).trim();

assert.doesNotMatch(
  profileView,
  /\/css\/profile-v2\.css/,
  "프로필 화면은 profile-v2.css를 별도 page layer로 참조하면 안 됩니다."
);
assert.equal(
  (profileView.match(/\/css\/profile\.css/g) || []).length,
  1,
  "프로필 화면은 profile.css 한 개만 page layer로 참조해야 합니다."
);
assert.ok(
  profileView.indexOf('/css/brand.css') <
    profileView.indexOf('/css/profile.css'),
  "profile.css는 공통 브랜드 계층 뒤에서 프로필 최종 시각을 소유해야 합니다."
);
assert.ok(legacyProfileCss.length > 0, "보존된 profile-v2.css 기준 파일을 읽지 못했습니다.");
assert.ok(
  !profileCss.endsWith(legacyProfileCss),
  "profile-v2.css를 profile.css 끝에 복사해 cascade로 덮는 방식은 실질 통합이 아닙니다."
);
for (const selector of [
  ".profile-page-shell",
  ".profile-main",
  ".profile-hero",
  ".profile-summary",
  ".profile-section-nav",
  ".settings-card",
  ".save-button",
  ".withdrawal-card",
]) {
  assert.equal(
    topLevelRuleBodies(profileCss, selector).length,
    1,
    `${selector}: profile.css 최상위 소유자는 정확히 하나여야 합니다.`
  );
}
assert.match(
  topLevelRuleBodies(profileCss, ".profile-hero")[0],
  /background:\s*var\(--matths-surface\)[\s\S]*border-left:\s*4px solid var\(--matths-progress-blue\)/,
  "프로필 hero의 최종 surface와 역할색은 단일 규칙에 병합되어야 합니다."
);
assert.match(
  topLevelRuleBodies(profileCss, ".save-button")[0],
  /min-height:\s*48px[\s\S]*background:\s*var\(--matths-action-primary\)/,
  "프로필 저장 버튼은 단일 규칙에서 48px와 정본 Violet 역할을 소유해야 합니다."
);
const tabletProfileBlocks = blockBodies(
  profileCss,
  /@media\s*\(max-width:\s*860px\)/g,
);
assert.equal(tabletProfileBlocks.length, 1, "860px profile media block은 하나여야 합니다.");
assert.match(
  singleRuleBody(tabletProfileBlocks[0], ".profile-section-nav"),
  /position:\s*static/,
  "860px 이하에서는 sticky profile section nav를 정상 문서 흐름으로 돌려야 합니다."
);
const mobileProfileBlocks = blockBodies(
  profileCss,
  /@media\s*\(max-width:\s*620px\)/g,
);
assert.equal(mobileProfileBlocks.length, 1, "620px profile media block은 하나여야 합니다.");
const mobileProfileCss = mobileProfileBlocks[0];
assert.match(singleRuleBody(mobileProfileCss, ".profile-main"), /width:\s*min\(100% - 24px, 1120px\)/);
assert.match(singleRuleBody(mobileProfileCss, ".profile-hero"), /padding:\s*24px 20px/);
assert.match(singleRuleBody(mobileProfileCss, ".profile-section-nav"), /overflow-x:\s*visible/);
assert.match(singleRuleBody(mobileProfileCss, ".profile-section-nav > div"), /flex-wrap:\s*wrap/);
assert.match(singleRuleBody(mobileProfileCss, ".profile-section-nav span"), /width:\s*100%/);
assert.match(singleRuleBody(mobileProfileCss, ".profile-section-nav a"), /min-width:\s*96px/);

const parentNavigation = read("views/partials/parent-navigation.ejs");
assert.match(
  parentNavigation,
  /class="parent-skip-link"\s+href="#parent-main-content"/,
  "학부모 공통 내비게이션에는 본문 바로가기 링크가 있어야 합니다."
);

const parentViews = fs
  .readdirSync(path.join(root, "views"))
  .filter((filename) => /^parent-.*\.ejs$/.test(filename))
  .filter((filename) =>
    read(path.join("views", filename)).includes(
      "partials/parent-navigation"
    )
  );

assert.ok(
  parentViews.length > 0,
  "학부모 공통 내비게이션을 포함하는 화면을 찾지 못했습니다."
);
for (const filename of parentViews) {
  const markup = read(path.join("views", filename));
  assert.equal(
    (markup.match(/id="parent-main-content"/g) || []).length,
    1,
    `${filename}: 공통 본문 target id가 정확히 하나여야 합니다.`
  );
  assert.match(
    markup,
    /<main\b[^>]*id="parent-main-content"[^>]*tabindex="-1"/,
    `${filename}: skip link가 이동할 수 있는 focusable main이 필요합니다.`
  );
}

const parentCss = stripComments(read("public/css/parent.css"));
assert.match(
  parentCss,
  /\.parent-skip-link\s*\{[\s\S]*?min-height:\s*44px/,
  "본문 바로가기 링크는 44px 이상이어야 합니다."
);
assert.match(
  parentCss,
  /\.parent-nav nav a,[\s\S]*?\.parent-nav button[\s\S]*?\{[\s\S]*?min-height:\s*44px/,
  "학부모 공통 내비게이션 링크와 버튼은 44px 이상이어야 합니다."
);
assert.match(
  parentCss,
  /\.parent-page\s+:where\([^)]*a[^)]*button[^)]*\):focus-visible\s*\{[\s\S]*?outline:/,
  "학부모 화면의 키보드 상호작용 요소에는 명시적 focus-visible 표시가 필요합니다."
);
assert.match(
  parentCss,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*0\.01ms\s*!important;[\s\S]*?transition-duration:\s*0\.01ms\s*!important;/,
  "학부모 화면은 reduced-motion 계약을 고정해야 합니다."
);

console.log(
  `Profile single-layer ownership and parent shell accessibility verification passed (${parentViews.length} parent views).`
);

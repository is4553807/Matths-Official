const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const root = path.resolve(
  process.env.MATTHS_WEB_DESIGN_ROOT || projectRoot,
);
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

function stripDocumentComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const cssRuleCache = new Map();

function matchingBrace(source, openIndex, limit = source.length) {
  let depth = 1;
  let quote = null;
  for (let cursor = openIndex + 1; cursor < limit; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === "\\") cursor += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  throw new Error(`닫히지 않은 CSS block: ${openIndex}`);
}

function splitSelectorList(prelude) {
  const selectors = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let cursor = 0; cursor < prelude.length; cursor += 1) {
    const character = prelude[cursor];
    if (quote) {
      if (character === "\\") cursor += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      selectors.push(prelude.slice(start, cursor).trim().replace(/\s+/g, " "));
      start = cursor + 1;
    }
  }
  selectors.push(prelude.slice(start).trim().replace(/\s+/g, " "));
  return selectors.filter(Boolean);
}

function parseCssRules(css) {
  if (cssRuleCache.has(css)) return cssRuleCache.get(css);
  const rules = [];
  const parseRange = (start, end, atRules) => {
    let cursor = start;
    while (cursor < end) {
      while (cursor < end && /[\s;]/.test(css[cursor])) cursor += 1;
      if (cursor >= end) break;
      const preludeStart = cursor;
      let quote = null;
      let parenthesisDepth = 0;
      while (cursor < end) {
        const character = css[cursor];
        if (quote) {
          if (character === "\\") cursor += 1;
          else if (character === quote) quote = null;
        } else if (character === '"' || character === "'") {
          quote = character;
        } else if (character === "(") {
          parenthesisDepth += 1;
        } else if (character === ")") {
          parenthesisDepth -= 1;
        } else if (parenthesisDepth === 0 && (character === "{" || character === ";")) {
          break;
        }
        cursor += 1;
      }
      if (cursor >= end || css[cursor] === ";") {
        cursor += 1;
        continue;
      }
      const prelude = css.slice(preludeStart, cursor).trim();
      const close = matchingBrace(css, cursor, end);
      const bodyStart = cursor + 1;
      const body = css.slice(bodyStart, close);
      if (/^@(media|supports|container|layer)\b/i.test(prelude)) {
        parseRange(bodyStart, close, [...atRules, prelude]);
      } else if (!prelude.startsWith("@")) {
        rules.push({ prelude, selectors: splitSelectorList(prelude), body, atRules });
      }
      cursor = close + 1;
    }
  };
  parseRange(0, css.length, []);
  cssRuleCache.set(css, rules);
  return rules;
}

function topLevelRulesFor(css, selector) {
  const normalizedSelector = selector.trim().replace(/\s+/g, " ");
  return parseCssRules(css).filter(
    (rule) => rule.atRules.length === 0 && rule.selectors.includes(normalizedSelector),
  );
}

function allRulesFor(css, selector) {
  const normalizedSelector = selector.trim().replace(/\s+/g, " ");
  return parseCssRules(css).filter((rule) => rule.selectors.includes(normalizedSelector));
}

function ruleBody(css, selector) {
  const matches = topLevelRulesFor(css, selector);
  assert.equal(matches.length, 1, `${selector} 최상위 규칙은 정확히 하나여야 합니다.`);
  return matches[0].body;
}

function exactRuleCount(css, selector) {
  return topLevelRulesFor(css, selector).length;
}

function duplicateTopLevelSelectors(css) {
  const ownerCounts = new Map();
  for (const rule of parseCssRules(css)) {
    if (rule.atRules.length > 0) continue;
    for (const selector of rule.selectors) {
      ownerCounts.set(selector, (ownerCounts.get(selector) || 0) + 1);
    }
  }
  return [...ownerCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([selector, count]) => ({ selector, count }))
    .sort((left, right) => left.selector.localeCompare(right.selector));
}

function assertRoleBackground(css, selector, expectedValue) {
  const values = allRulesFor(css, selector).flatMap((rule) =>
    [...rule.body.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/gi)]
      .map((match) => match[1].trim()),
  );
  assert.ok(values.length > 0, `${selector}: 역할 background 선언이 필요합니다.`);
  assert.deepEqual(
    [...new Set(values)],
    [expectedValue],
    `${selector}: breakpoint를 포함한 모든 background는 ${expectedValue}만 사용해야 합니다.`,
  );
}

function assertNoSmallMinBlockSize(css, selector) {
  let declarationCount = 0;
  for (const rule of allRulesFor(css, selector)) {
    for (const declaration of rule.body.matchAll(/min-(?:height|block-size)\s*:\s*([^;]+)/gi)) {
      declarationCount += 1;
      const value = declaration[1].trim().toLowerCase();
      const simpleLength = /^(\d*\.?\d+)(px|rem|em)$/.exec(value);
      assert.ok(
        simpleLength,
        `${selector}: ${rule.atRules.join(" > ") || "base"}의 min block 값 ${value}는 검증 가능한 고정 길이여야 합니다.`,
      );
      const numeric = Number.parseFloat(simpleLength[1]);
      const pixels = simpleLength[2] === "px" ? numeric : numeric * 16;
      assert.ok(
        pixels >= 44,
        `${selector}: ${rule.atRules.join(" > ") || "base"}에서 44px 미만 override 금지`,
      );
    }
  }
  assert.ok(declarationCount > 0, `${selector}: 명시적 44px min block 계약이 필요합니다.`);
}

function undersizedFontDeclarations(css) {
  const violations = [];
  for (const declaration of css.matchAll(/(?:^|[;{])\s*(font-size|font)\s*:\s*([^;}{]+)/gi)) {
    for (const size of declaration[2].matchAll(/(\d*\.?\d+)(px|rem|em|%)\b/gi)) {
      const numeric = Number.parseFloat(size[1]);
      const unit = size[2].toLowerCase();
      const pixels = unit === "px" ? numeric : unit === "%" ? numeric * 0.16 : numeric * 16;
      if (numeric > 0 && pixels < 12) {
        violations.push(`${declaration[1].toLowerCase()}: ${declaration[2].trim()}`);
      }
    }
  }
  return [...new Set(violations)];
}

function allFiles(directory, suffix) {
  return fs
    .readdirSync(path.join(root, directory), { recursive: true })
    .filter((relativePath) => relativePath.endsWith(suffix));
}

const tokens = stripDocumentComments(read("public/css/matths-brand-tokens.css"));
const theme = stripDocumentComments(read("public/css/matths-theme.css"));
const system = stripDocumentComments(read("public/css/matths-system.css"));
const indexCss = stripDocumentComments(read("public/css/index.css"));
const mainCss = stripDocumentComments(read("public/css/main.css"));
const arenaCss = stripDocumentComments(read("public/css/goat-arena.css"));
const privateMockCss = stripDocumentComments(
  read("public/css/private-mock-exams.css"),
);
const parentCss = stripDocumentComments(read("public/css/parent.css"));

// CI palette and semantic action ownership.
for (const [name, value] of [
  ["magenta", "#ca44e3"],
  ["violet", "#7b4efc"],
  ["blue", "#327ffa"],
  ["cyan", "#0cdcf1"],
  ["navy", "#090c1b"],
]) {
  assert.match(tokens, new RegExp(`--matths-${name}:\\s*${value}`, "i"));
}
assert.match(
  tokens,
  /--matths-gradient:\s*linear-gradient\(\s*90deg,\s*var\(--matths-magenta\) 0%,\s*var\(--matths-violet\) 35%,\s*var\(--matths-blue\) 70%,\s*var\(--matths-cyan\) 100%\s*\)/,
);
assert.match(tokens, /--matths-action-primary:\s*var\(--matths-violet\)/);
assert.match(tokens, /\.c-button--primary\s*\{[^}]*background:\s*var\(--matths-action-primary\)/);
assert.match(tokens, /\.c-button--arena\s*\{[^}]*background:\s*var\(--matths-arena-accent\)/);
assert.doesNotMatch(theme, /#d842ee|#7654f7|#3157f6|#19c7e9/i);
assert.doesNotMatch(mainCss, /#5d3fd2|#4930b8/i);
assert.match(
  ruleBody(indexCss, ".button-primary"),
  /background:\s*var\(--matths-action-primary\)/,
);
assert.match(
  ruleBody(indexCss, ".button-primary:hover"),
  /background:\s*var\(--matths-action-primary-pressed\)/,
);
assert.match(ruleBody(indexCss, ".button-small"), /min-height:\s*44px/);
assert.match(ruleBody(indexCss, ".skip-link"), /min-height:\s*44px[\s\S]*display:\s*inline-flex/);
assert.match(
  ruleBody(mainCss, ".primary-action"),
  /min-height:\s*44px[\s\S]*background:\s*var\(--matths-action-primary\)/,
);
assert.match(
  ruleBody(mainCss, ".primary-action:hover"),
  /background:\s*var\(--matths-action-primary-pressed\)/,
);
assert.match(
  ruleBody(mainCss, ".next-study-card .primary-action"),
  /background:\s*var\(--matths-action-primary\)/,
);
assert.match(
  ruleBody(mainCss, ".next-study-card .primary-action:hover"),
  /background:\s*var\(--matths-action-primary-pressed\)/,
);
for (const [css, selector, token] of [
  [indexCss, ".button-primary", "var(--matths-action-primary)"],
  [indexCss, ".button-primary:hover", "var(--matths-action-primary-pressed)"],
  [mainCss, ".primary-action", "var(--matths-action-primary)"],
  [mainCss, ".primary-action:hover", "var(--matths-action-primary-pressed)"],
  [mainCss, ".next-study-card .primary-action", "var(--matths-action-primary)"],
  [mainCss, ".next-study-card .primary-action:hover", "var(--matths-action-primary-pressed)"],
]) {
  assertRoleBackground(css, selector, token);
}
for (const [css, selector] of [
  [indexCss, ".button-small"],
  [indexCss, ".skip-link"],
  [indexCss, ".arena-ranking-unavailable a"],
  [mainCss, ".skip-link"],
  [mainCss, ".brand"],
  [mainCss, ".primary-action"],
  [mainCss, ".next-study-card .primary-action"],
  [mainCss, ".notification-panel > .notification-inbox-cta"],
  [mainCss, ".dashboard-announcements article > a"],
  [mainCss, ".card-heading > a"],
  [mainCss, ".section-empty a"],
  [mainCss, ".dashboard-coach-card > a"],
  [mainCss, ".usage-plan-card > a"],
  [mainCss, ".dashboard-footer a"],
  [mainCss, ".math-keyboard button"],
  [mainCss, ".access-renewal-dialog__actions a"],
  [mainCss, ".access-renewal-dialog__actions button"],
]) {
  assertNoSmallMinBlockSize(css, selector);
}

// The cascade is head-owned: base/theme, page styles, contrast last.
assert.match(system, /@import\s+url\("\/css\/matths-theme\.css"\)/);
assert.doesNotMatch(system, /contrast\.css/);
const completeViews = allFiles("views", ".ejs").filter((relativePath) =>
  /<!doctype html>/i.test(read(path.join("views", relativePath))),
);
let orderedHeads = 0;
for (const relativePath of completeViews) {
  const source = stripDocumentComments(read(path.join("views", relativePath)));
  const links = [...source.matchAll(/<link\b[^>]*href=["'](\/css\/[^"']+\.css)["'][^>]*>/gi)]
    .map((match) => match[1]);
  if (!links.length) continue;
  const contrastIndex = links.indexOf("/css/contrast.css");
  assert.equal(
    contrastIndex,
    links.length - 1,
    `${relativePath}: contrast.css는 마지막 stylesheet여야 합니다.`,
  );
  const brandIndex = links.indexOf("/css/brand.css");
  const arenaIndex = links.indexOf("/css/goat-arena.css");
  assert.ok(
    brandIndex === 0 || arenaIndex === 0,
    `${relativePath}: brand.css 또는 goat-arena.css가 base를 소유해야 합니다.`,
  );
  assert.equal(
    links.filter((href) => href === "/css/contrast.css").length,
    1,
    `${relativePath}: contrast.css 중복 로드를 금지합니다.`,
  );
  orderedHeads += 1;
}
assert.equal(orderedHeads, completeViews.length);
for (const relativePath of [
  "views/partials/public-navigation.ejs",
  "views/partials/dashboard-navigation.ejs",
  "views/partials/admin-navigation.ejs",
]) {
  assert.doesNotMatch(stripDocumentComments(read(relativePath)), /<link\b/i);
}

// Focus, motion and touch targets are shared; audited link controls opt in.
assert.match(tokens, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--matths-violet\)/);
assert.match(tokens, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(tokens, /:where\(button, \[role="button"\]\)\s*\{[^}]*min-inline-size:\s*44px[^}]*min-block-size:\s*44px/);
for (const [css, selector] of [
  [mainCss, ".skip-link"],
  [mainCss, ".brand"],
  [mainCss, ".profile-avatar"],
  [mainCss, ".back-dashboard"],
  [mainCss, "a.learning-home-button"],
  [mainCss, ".notification-button"],
  [arenaCss, ".arena-main-navigation a"],
  [arenaCss, ".arena-mailbox-button"],
]) {
  assert.match(ruleBody(css, selector), /(?:min-height|height):\s*44px/);
}
assert.match(
  mainCss,
  /\.dashboard-announcements\s+article\s*>\s*a\s*\{[^}]*min-height:\s*44px/,
);
assert.match(
  ruleBody(mainCss, ".math-keyboard"),
  /grid-template-columns:\s*repeat\(10, minmax\(44px, 1fr\)\)/,
);
assert.match(ruleBody(mainCss, ".math-keyboard button"), /min-height:\s*44px/);
const mobileMathKeyboardRules = allRulesFor(mainCss, ".math-keyboard").filter(
  (rule) => rule.atRules.some((atRule) => /@media\s*\(max-width:\s*620px\)/i.test(atRule)),
);
assert.equal(mobileMathKeyboardRules.length, 1, "620px math keyboard override는 media 내부에 하나여야 합니다.");
assert.match(
  mobileMathKeyboardRules[0].body,
  /repeat\(5, minmax\(44px, 1fr\)\)/,
);
assert.match(ruleBody(mainCss, ".dashboard-coach-card > a"), /min-height:\s*44px/);
assert.match(
  mainCss,
  /(?:^|\})\s*\.usage-plan-card\s*>\s*a\s*\{[^}]*min-height:\s*44px/m,
);
assert.match(
  ruleBody(mainCss, ".dashboard-footer a"),
  /min-inline-size:\s*44px[\s\S]*min-block-size:\s*44px/,
);
assert.match(
  ruleBody(indexCss, ".step-button"),
  /flex:\s*0 0 48px[\s\S]*inline-size:\s*48px[\s\S]*block-size:\s*48px/,
);
assert.match(ruleBody(mainCss, ".section-empty a"), /min-height:\s*44px/);
assert.match(ruleBody(indexCss, ".arena-ranking-unavailable a"), /min-height:\s*44px/);
assert.match(ruleBody(mainCss, ".card-heading > a"), /min-height:\s*44px/);
assert.match(
  mainCss,
  /\.notification-panel\s*>\s*\.notification-inbox-cta\s*\{[^}]*min-height:\s*44px/,
);
assert.match(
  mainCss,
  /\.access-renewal-dialog__actions\s+a,\s*\.access-renewal-dialog__actions\s+button\s*\{[^}]*min-height:\s*44px/,
);
assert.match(parentCss, /\.parent-nav nav a,[\s\S]*?min-height:\s*44px/);
assert.match(
  ruleBody(arenaCss, ".arena-page-rail > a"),
  /(?:min-)?width:\s*44px[\s\S]*(?:min-)?height:\s*44px/,
);
assert.doesNotMatch(
  arenaCss,
  /\.arena-page-rail\s*\{[^}]*scale\s*\(/s,
  "Arena page rail의 실제 44px hit area를 transform으로 축소하면 안 됩니다.",
);
for (const body of arenaCss.matchAll(/\.arena-main-navigation a\s*\{([^}]*)\}/g)) {
  assert.doesNotMatch(
    body[1],
    /min-height:\s*(?:[1-3]?\d|4[0-3])px/,
    "Arena 내비게이션의 breakpoint override도 44px 이상이어야 합니다.",
  );
}

// Arena file ownership: every exact top-level selector has one owner. A
// selector may still have responsive variants inside at-rules.
assert.deepEqual(
  duplicateTopLevelSelectors(arenaCss),
  [],
  "Arena 최상위 exact selector 중복 금지",
);
assert.equal(exactRuleCount(arenaCss, ".arena-brand-mark"), 0);
assert.doesNotMatch(arenaCss, /White action labels must remain readable/);
assert.doesNotMatch(arenaCss, /#5b2bbf|#2049bb 58%|#0d6887\)/i);
assert.match(arenaCss, /\.goat-arena-page \.c-button--primary\s*\{[^}]*var\(--matths-action-primary\)/);

// Readability floor for every public stylesheet. Inspect comments-stripped
// font-size and font shorthand declarations, including clamp/rem/em values.
for (const relativePath of allFiles("public/css", ".css").sort()) {
  const css = stripDocumentComments(read(path.join("public/css", relativePath)));
  assert.deepEqual(
    undersizedFontDeclarations(css),
    [],
    `public/css/${relativePath}: 12px 미만 텍스트 금지`,
  );
}
assert.match(ruleBody(mainCss, ".profile-copy small"), /font-size:\s*12px/);
assert.match(ruleBody(mainCss, ".dashboard-announcements p"), /font-size:\s*13px/);
assert.match(ruleBody(arenaCss, ".arena-rule-strip dd"), /font-size:\s*12px/);
assert.match(ruleBody(privateMockCss, ".private-mock-keyboard button"), /min-height:\s*44px[^}]*font-size:\s*14px/);

// Markup semantics and responsive table contracts.
const rulesView = stripDocumentComments(read("views/goat-arena-rules.ejs"));
assert.ok((rulesView.match(/arena-mobile-card-table/g) || []).length >= 2);
assert.ok((rulesView.match(/data-label=/g) || []).length >= 12);
for (const relativePath of [
  "views/assessment-center.ejs",
  "views/assessment-attempt.ejs",
]) {
  const source = stripDocumentComments(read(relativePath));
  assert.equal((source.match(/<h1\b/g) || []).length, 1, `${relativePath}: H1은 하나`);
}
assert.match(read("views/community.ejs"), /<label(?=[^>]*for="community-search")(?=[^>]*class="sr-only")[^>]*>/);
assert.match(read("views/coach-suggestions.ejs"), /class="sr-only" for="rejection-reason-/);
assert.match(read("views/coach-suggestions.ejs"), />반려 사유<\/label>/);
assert.match(read("views/main.ejs"), /aria-labelledby="access-renewal-title"/);
assert.match(read("views/main.ejs"), /aria-describedby="access-renewal-description"/);
assert.doesNotMatch(read("views/learning-flow.ejs"), /<article[^>]*role="button"/);
assert.equal((read("views/learning-flow.ejs").match(/<button\b[^>]*class="flow-step/g) || []).length, 5);
assert.doesNotMatch(read("public/js/learning-flow.js"), /keydown/);

// Media, long math, source ownership and shell consolidation.
assert.match(read("views/goat-arena.ejs"), /<video[^>]*autoplay[^>]*muted[^>]*playsinline[^>]*preload="metadata"/s);
assert.match(arenaCss, /mjx-container\[display="true"\]\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
assert.doesNotMatch(read("views/index.ejs"), /<style\b/);
assert.doesNotMatch(read("views/profile.ejs"), /profile-v2\.css/);
assert.match(read("views/partials/parent-navigation.ejs"), /class="parent-skip-link"[^>]*href="#parent-main-content"/);
for (const relativePath of [
  "views/parent-dashboard.ejs",
  "views/parent-pricing.ejs",
  "views/parent-checkout.ejs",
  "views/parent-payments.ejs",
  "views/parent-inquiries.ejs",
  "views/parent-notification-settings.ejs",
]) {
  assert.match(read(relativePath), /id="parent-main-content"[^>]*tabindex="-1"/);
}
for (const relativePath of [
  "public/css/main.css",
  "public/css/goat-arena.css",
  "public/css/private-mock-exams.css",
  "public/css/profile.css",
  "public/css/parent.css",
  "public/css/learning-flow.css",
  "public/css/curriculum.css",
  "public/css/visual-learning.css",
  "views/parent-checkout.ejs",
]) {
  const lines = read(relativePath).split(/\r?\n/);
  const longest = Math.max(...lines.map((line) => line.length));
  assert.ok(longest <= 240, `${relativePath}: 포맷된 원본 최대 줄 길이 ${longest}`);
}

// Critical first-screen and timed-attempt evidence is wired, not merely styled.
assert.match(read("views/index.ejs"), /partials\/arena-contract/);
assert.match(read("views/main.ejs"), /class="continue-card next-study-card"/);
assert.match(read("views/partials/timed-attempt-network-state.ejs"), /aria-live="polite"/);
assert.match(read("public/js/timed-attempt-network.js"), /addEventListener\("offline"/);
assert.match(read("public/js/goat-arena-match.js"), /requestId/);
assert.match(read("public/js/private-mock-exam.js"), /beforeunload/);

console.log(
  `Web design system verification passed: ${completeViews.length} heads, 24 finding contracts`,
);

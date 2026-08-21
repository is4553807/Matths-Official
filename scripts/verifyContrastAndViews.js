const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  contrastRatio,
  findings,
  parseColor,
} = require("./auditCssContrast");
const {
  renderView,
  viewNames,
} = require("./previewContrastAudit");

const root = path.resolve(__dirname, "..");
const contrastFile = path.join(root, "public", "css", "contrast.css");
const parentFile = path.join(root, "public", "css", "parent.css");
const brandFile = path.join(root, "public", "css", "brand.css");
const systemFile = path.join(root, "public", "css", "matths-system.css");
const contrastCss = fs.readFileSync(contrastFile, "utf8");
const parentCss = fs.readFileSync(parentFile, "utf8");
const brandCss = fs.readFileSync(brandFile, "utf8");
const systemCss = fs.readFileSync(systemFile, "utf8");

assert.match(brandCss, /@import\s+url\(["']\/css\/matths-system\.css["']\)/);
assert.doesNotMatch(
  systemCss,
  /@import\s+url\(["']\/css\/contrast\.css["']\)/,
  "contrast.css는 페이지 CSS 뒤에서 문서가 직접 로드해야 합니다."
);

function normalizeSelector(selector) {
  return String(selector)
    .replace(/\s*>\s*/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function selectorsIn(source) {
  const selectors = new Set();
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of stripped.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    if (rule[1].trim().startsWith("@")) continue;
    for (const selector of rule[1].split(",")) {
      selectors.add(normalizeSelector(selector));
    }
  }
  return selectors;
}

function declarationsIn(source) {
  const declarationsBySelector = new Map();
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (rule[1].trim().startsWith("@")) continue;
    const declarations = {};
    for (const declaration of rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) {
      declarations[declaration[1].toLowerCase()] = declaration[2]
        .trim()
        .replace(/\s*!important\s*$/, "");
    }
    for (const selector of rule[1].split(",")) {
      const normalized = normalizeSelector(selector);
      declarationsBySelector.set(normalized, {
        ...(declarationsBySelector.get(normalized) || {}),
        ...declarations,
      });
    }
  }
  return declarationsBySelector;
}

const guardrailSelectors = selectorsIn(contrastCss);
const parentSelectors = selectorsIn(parentCss);
const guardrailDeclarations = declarationsIn(contrastCss);
const parentDeclarations = declarationsIn(parentCss);
const uncovered = [];
const stillLowContrast = [];

for (const finding of findings) {
  const background = parseColor(finding.background);
  if (!background || background.a !== 1) continue;

  for (const selector of finding.selector.split(",")) {
    const normalized = normalizeSelector(selector);
    const covered = finding.file === "parent.css"
      ? parentSelectors.has(normalized)
      : guardrailSelectors.has(normalized);
    if (!covered) {
      uncovered.push(
        `${finding.file}: ${normalized} (${finding.ratio}:1)`
      );
      continue;
    }

    const override = finding.file === "parent.css"
      ? parentDeclarations.get(normalized)
      : guardrailDeclarations.get(normalized);
    const foreground = parseColor(
      override?.color || finding.foreground
    );
    const overrideBackground =
      override?.["background-color"] ||
      override?.background;
    const finalBackground = parseColor(
      overrideBackground || finding.background
    );
    if (foreground && finalBackground?.a === 1) {
      const ratio = contrastRatio(
        foreground,
        finalBackground
      );
      if (ratio < 4.5) {
        stillLowContrast.push(
          `${finding.file}: ${normalized} (${ratio.toFixed(2)}:1)`
        );
      }
    }
  }
}

assert.deepEqual(
  uncovered,
  [],
  `불투명 배경 저대비 규칙 중 보정되지 않은 selector:\n${uncovered.join("\n")}`
);
assert.deepEqual(
  stillLowContrast,
  [],
  `보정 후에도 4.5:1 미만인 selector:\n${stillLowContrast.join("\n")}`
);

async function main() {
  const rendered = [];
  for (const viewName of viewNames) {
    for (const filled of [false, true]) {
      const html = await renderView(viewName, { filled });
      assert.match(
        html,
        /<!doctype html>/i,
        `${viewName} ${filled ? "데이터 있음" : "빈 상태"}가 완전한 HTML 문서를 렌더링하지 못했습니다.`
      );
      if (
        !/\/css\/(?:goat-arena|parent)\.css/.test(html)
      ) {
        assert.match(
          html,
          /\/css\/brand\.css/,
          `${viewName}의 head에 Matths system entry stylesheet가 없습니다.`
        );
      }
    }
    rendered.push(viewName);
  }

  assert.equal(rendered.length, viewNames.length);
  assert.ok(viewNames.length >= 100, "views 최상위 EJS 전수 범위가 예상보다 작습니다.");

  const placementService = fs.readFileSync(
    path.join(root, "services", "placementExamService.js"),
    "utf8"
  );
  const placementClient = fs.readFileSync(
    path.join(root, "public", "js", "assessment.js"),
    "utf8"
  );
  const placementView = fs.readFileSync(
    path.join(root, "views", "assessment-attempt.ejs"),
    "utf8"
  );

  assert.match(placementService, /autoSubmitExpiredPlacementAttempt/);
  assert.doesNotMatch(placementService, /async function disqualify\s*\(/);
  assert.match(placementView, /0초에 자동 제출/);
  assert.match(placementView, /자동 제출·채점/);
  assert.match(
    placementClient,
    /config\?\.placement[\s\S]{0,120}자동 제출 중…[\s\S]{0,120}실격 처리 중…/
  );

  console.log(
    `저대비 CSS 보정 selector ${guardrailSelectors.size}개 · views ${rendered.length}/${viewNames.length}개 빈 상태+데이터 상태 렌더 · 배치고사 자동 제출 계약 PASS`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

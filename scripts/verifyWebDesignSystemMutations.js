const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const verifierPath = path.join(projectRoot, "scripts/verifyWebDesignSystem.js");

function runVerifier(testRoot) {
  return spawnSync(process.execPath, [verifierPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      MATTHS_WEB_DESIGN_ROOT: testRoot,
    },
    encoding: "utf8",
  });
}

function resultOutput(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

const testRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "matths-web-design-mutation-"),
);

try {
  fs.cpSync(path.join(projectRoot, "views"), path.join(testRoot, "views"), {
    recursive: true,
  });
  fs.cpSync(
    path.join(projectRoot, "public/css"),
    path.join(testRoot, "public/css"),
    { recursive: true },
  );
  fs.mkdirSync(path.join(testRoot, "public/js"), { recursive: true });
  for (const fileName of [
    "goat-arena-match.js",
    "learning-flow.js",
    "private-mock-exam.js",
    "timed-attempt-network.js",
  ]) {
    fs.copyFileSync(
      path.join(projectRoot, "public/js", fileName),
      path.join(testRoot, "public/js", fileName),
    );
  }

  const baseline = runVerifier(testRoot);
  assert.equal(
    baseline.status,
    0,
    `mutation baseline 실패:\n${resultOutput(baseline)}`,
  );

  const arenaPath = path.join(testRoot, "public/css/goat-arena.css");
  const arenaBaseline = fs.readFileSync(arenaPath, "utf8");
  fs.writeFileSync(
    arenaPath,
    `${arenaBaseline}\n@media (max-width: 1px) { .arena-hero { color: red; } }\n`,
  );
  const responsiveVariant = runVerifier(testRoot);
  assert.equal(
    responsiveVariant.status,
    0,
    `미디어 변형은 최상위 중복으로 판정하면 안 됩니다:\n${resultOutput(responsiveVariant)}`,
  );

  fs.writeFileSync(
    arenaPath,
    `${arenaBaseline}\n.arena-hero { color: red; }\n`,
  );
  const duplicateOwner = runVerifier(testRoot);
  const duplicateOutput = resultOutput(duplicateOwner);
  assert.notEqual(
    duplicateOwner.status,
    0,
    "최상위 exact selector 중복 mutation을 놓쳤습니다.",
  );
  assert.match(duplicateOutput, /Arena 최상위 exact selector 중복 금지/);
  assert.match(duplicateOutput, /\.arena-hero/);

  fs.writeFileSync(arenaPath, arenaBaseline);
  const adminPath = path.join(testRoot, "public/css/admin.css");
  const adminBaseline = fs.readFileSync(adminPath, "utf8");
  fs.writeFileSync(
    adminPath,
    `${adminBaseline}\n.m08-font-size-mutation { font-size: clamp(.5em, 1vw, 12px); }\n`,
  );
  const smallFontSize = runVerifier(testRoot);
  assert.notEqual(
    smallFontSize.status,
    0,
    "전체 CSS font-size 하한 mutation을 놓쳤습니다.",
  );
  assert.match(resultOutput(smallFontSize), /12px 미만 텍스트 금지/);

  fs.writeFileSync(
    adminPath,
    `${adminBaseline}\n.m08-font-shorthand-mutation { font: 9px\/1.2 sans-serif; }\n`,
  );
  const smallFontShorthand = runVerifier(testRoot);
  assert.notEqual(
    smallFontShorthand.status,
    0,
    "전체 CSS font shorthand 하한 mutation을 놓쳤습니다.",
  );
  assert.match(resultOutput(smallFontShorthand), /12px 미만 텍스트 금지/);

  console.log(
    "Web design mutation verification passed: responsive variant allowed, duplicate owner and font-floor regressions killed",
  );
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}

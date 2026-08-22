const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const verifier = path.join(__dirname, "verifyPublicArenaHeroContracts.js");

function copyFixture(target) {
  fs.cpSync(path.join(root, "views"), path.join(target, "views"), {
    recursive: true,
  });
  for (const relative of [
    "controllers/matthsController.js",
    "controllers/goatArenaController.js",
    "public/css/index.css",
    "public/css/goat-arena.css",
    "public/js/goat-arena.js",
  ]) {
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
}

function mutate(relativePath, transform, label) {
  const target = fs.mkdtempSync(
    path.join(os.tmpdir(), "matths-public-arena-contract-")
  );
  try {
    copyFixture(target);
    const filename = path.join(target, relativePath);
    const source = fs.readFileSync(filename, "utf8");
    const changed = transform(source);
    assert.notEqual(changed, source, `${label}: 돌연변이가 소스를 바꾸지 못했습니다.`);
    fs.writeFileSync(filename, changed);
    const result = spawnSync(process.execPath, [verifier], {
      cwd: root,
      env: {
        ...process.env,
        MATTHS_CONTRACT_ROOT: target,
      },
      encoding: "utf8",
    });
    assert.notEqual(
      result.status,
      0,
      `${label}: 계약 검사가 돌연변이를 놓쳤습니다.\n${result.stdout}\n${result.stderr}`
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

const mutations = [
  [
    "controllers/matthsController.js",
    (source) => source.replace(
      "arenaPublicContractView(activeArenaPolicy)",
      "null"
    ),
    "랜딩 활성 정책 계약 연결 제거",
  ],
  [
    "views/partials/arena-contract.ejs",
    (source) => source.replace(
      /\s*<li data-arena-contract="ranked">[\s\S]*?<\/li>/,
      ""
    ),
    "Ranked 계약 제거",
  ],
  [
    "views/index.ejs",
    (source) => source.replace(
      /(<%- include\("partials\/arena-contract", \{ contract: arenaContractView \}\) %>)([\s\S]*?)(<div class="arena-hero-actions">[\s\S]*?<\/div>)/,
      "$2$3\n            $1"
    ),
    "계약을 CTA 뒤로 이동",
  ],
  [
    "public/css/index.css",
    (source) => source.replace(
      /(@media \(max-width: 640px\) \{\s*\.arena-contract \{\s*grid-template-columns:) 1fr/,
      "$1 repeat(2, minmax(0, 1fr))"
    ),
    "640px 계약 2열 복원",
  ],
  [
    "public/css/goat-arena.css",
    (source) => source.replace(
      ".arena-contract {\n  display: grid;",
      ".arena-contract {\n  overflow-x: auto;\n  display: grid;"
    ),
    "계약 가로 스크롤 복원",
  ],
  [
    "views/goat-arena.ejs",
    (source) => source
      .replace(" autoplay muted playsinline", " autoplay playsinline")
      .replace('preload="metadata"', 'preload="auto"'),
    "영상 sound-on 마크업 복원",
  ],
  [
    "public/js/goat-arena.js",
    (source) => source.replace(
      "arenaVideo.muted = true;\n  updateArenaSoundControl();",
      "arenaVideo.muted = false;\n  updateArenaSoundControl();"
    ),
    "영상 sound-on 초기화 복원",
  ],
  [
    "views/index.ejs",
    (source) => source.replace("  </head>", "    <style>.fixture { color: red; }</style>\n  </head>"),
    "랜딩 인라인 style 복원",
  ],
  [
    "public/css/goat-arena.css",
    (source) => source.replace(
      "line-height: 1.1;\n  letter-spacing: -0.04em;",
      "line-height: 0.9;\n  letter-spacing: -6px;"
    ),
    "한국어 hero 과압축 복원",
  ],
];

for (const [relativePath, transform, label] of mutations) {
  mutate(relativePath, transform, label);
}

console.log(`Public Arena hero mutation PASS: ${mutations.length}/${mutations.length} killed`);

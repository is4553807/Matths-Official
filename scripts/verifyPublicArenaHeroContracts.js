const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const projectRoot = path.resolve(__dirname, "..");
const root = path.resolve(
  process.env.MATTHS_CONTRACT_ROOT || projectRoot
);
const viewRoot = path.join(root, "views");
const {
  arenaPublicContractView,
} = require(path.join(
  projectRoot,
  "services/arenaPublicContractViewService"
));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function universalValue() {
  let value;
  const callable = function fixtureValue() {
    return value;
  };
  value = new Proxy(callable, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) {
        return (hint) => (hint === "number" ? 0 : "fixture");
      }
      if (key === Symbol.iterator) {
        return function* emptyIterator() {};
      }
      if (key === "length") return 0;
      if (key === "toJSON") return () => null;
      if (key === "toString") return () => "";
      if (key === "valueOf") return () => 0;
      if (["map", "filter", "flatMap", "sort", "slice"].includes(key)) {
        return () => [];
      }
      if (key === "forEach") return () => {};
      if (key === "find") return () => undefined;
      if (key === "findIndex") return () => -1;
      if (key === "some") return () => false;
      if (key === "every") return () => true;
      if (key === "includes") return () => false;
      if (key === "reduce") return (_callback, initial) => initial;
      if (key === "join") return () => "";
      return value;
    },
    apply() {
      return value;
    },
  });
  return value;
}

async function render(viewName, overrides) {
  const previewValue = universalValue();
  const locals = {
    Math,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    Infinity,
    NaN,
    ...overrides,
  };
  const filename = path.join(viewRoot, `${viewName}.ejs`);

  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      return await ejs.renderFile(filename, locals);
    } catch (error) {
      const missing = String(error?.message || "").match(
        /([A-Za-z_$][\w$]*) is not defined/
      );
      if (!missing) throw error;
      locals[missing[1]] = previewValue;
    }
  }
  throw new Error(`${viewName} 렌더 fixture를 준비하지 못했습니다.`);
}

function heroSection(html) {
  const start = html.indexOf('<section class="arena-hero');
  const end = html.indexOf("</section>", start);
  assert.ok(start >= 0 && end > start, "Arena hero section을 찾지 못했습니다.");
  return html.slice(start, end);
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function assertContractHero(html, primaryClass) {
  const hero = heroSection(html).replace(/<!--[\s\S]*?-->/g, "");
  const contractAt = hero.indexOf('aria-label="GOAT Arena 핵심 규칙"');
  const primaryAt = hero.indexOf(primaryClass);
  assert.ok(contractAt >= 0, "첫 화면에 Arena 계약 목록이 없습니다.");
  assert.ok(primaryAt > contractAt, "Arena 계약은 primary CTA보다 먼저 나와야 합니다.");
  assert.equal(
    occurrences(hero, /data-arena-contract="ranked"/g),
    1,
    "Ranked 계약은 정확히 한 번 보여야 합니다."
  );
  assert.equal(
    occurrences(hero, /data-arena-contract="unranked"/g),
    1,
    "Unranked 계약은 정확히 한 번 보여야 합니다."
  );
  assert.match(hero, /학습일수를 예치하고 경기합니다/);
  assert.match(hero, /29일 이용 주기의 조건/);
  assert.match(hero, /공격 출석 15일/);
  assert.match(hero, /최대 100%/);
}

function assertContractCss(source, surfaceToken) {
  const css = withoutComments(source);
  assert.match(
    css,
    /\.arena-contract\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s
  );
  assert.match(
    css,
    new RegExp(`\\.arena-contract li\\s*\\{[^}]*background\\s*:\\s*${surfaceToken}`, "s")
  );
  assert.doesNotMatch(
    css,
    /\.arena-contract li\s*\{[^}]*(?:linear|radial)-gradient/s,
    "계약 카드는 그라디언트 장식 없이 읽기 쉬운 단색 surface여야 합니다."
  );
  assert.doesNotMatch(
    css,
    /\.arena-contract(?:\s+[^,{]+)?\s*\{[^}]*overflow-x\s*:/s,
    "계약 블록은 가로 스크롤을 만들면 안 됩니다."
  );
  assert.match(css, /\.arena-contract strong\s*\{[^}]*font-size\s*:\s*15px/s);
  assert.match(css, /\.arena-contract span\s*\{[^}]*font-size\s*:\s*13px/s);
  assert.match(
    css,
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.arena-contract(?:,\s*\.arena-rule-strip)?\s*\{[^}]*grid-template-columns\s*:\s*1fr/s,
    "640px 이하 계약 블록은 한 열이어야 합니다."
  );
}

async function main() {
  const fallbackContract = arenaPublicContractView(null);
  assert.deepEqual(fallbackContract, {
    learningCycleDays: 29,
    minimumAttackParticipationDays: 15,
    maximumPaybackRatePercent: 100,
  });
  assert.deepEqual(
    arenaPublicContractView({
      initialLearningDays: 31,
      payback: {
        minimumAttackParticipationDays: 12,
        bands: [
          { minScoreDays: 0, maxScoreDays: 29, ratePercent: 0 },
          { minScoreDays: 30, maxScoreDays: null, ratePercent: 80 },
        ],
      },
    }),
    {
      learningCycleDays: 31,
      minimumAttackParticipationDays: 12,
      maximumPaybackRatePercent: 80,
    },
    "공개 계약 수치는 활성 정책의 표시값을 그대로 따라야 합니다."
  );

  const [landingHtml, arenaHtml] = await Promise.all([
    render("index", { user: null, arenaContract: fallbackContract }),
    render("goat-arena", { arenaContract: fallbackContract }),
  ]);
  assertContractHero(landingHtml, "button-arena-primary");
  assertContractHero(arenaHtml, "arena-primary-action");

  const landingHero = heroSection(landingHtml);
  const arenaHero = heroSection(arenaHtml);
  assert.equal(occurrences(landingHero, /button-arena-primary/g), 1);
  assert.equal(occurrences(landingHero, /button-arena-secondary/g), 0);
  assert.equal(occurrences(arenaHero, /arena-primary-action/g), 1);

  const videoTag = arenaHero.match(/<video\b[^>]*>/)?.[0] || "";
  assert.match(videoTag, /\bautoplay\b/);
  assert.match(videoTag, /\bmuted\b/);
  assert.match(videoTag, /\bplaysinline\b/);
  assert.match(videoTag, /preload="metadata"/);
  assert.doesNotMatch(videoTag, /preload="auto"/);
  assert.match(arenaHero, /aria-label="GOAT Arena 영상 소리 켜기"/);
  assert.match(arenaHero, /aria-pressed="false"/);

  const arenaClient = withoutComments(read("public/js/goat-arena.js"));
  assert.match(
    arenaClient,
    /async function startArenaIntroVideo\(\)[\s\S]*?arenaVideo\.muted\s*=\s*true;[\s\S]*?await arenaVideo\.play\(\)/
  );
  assert.doesNotMatch(arenaClient, /arenaVideo\.muted\s*=\s*false/);
  assert.doesNotMatch(arenaClient, /arenaVideo\.volume\s*=\s*1/);

  const indexView = read("views/index.ejs");
  assert.doesNotMatch(indexView, /<style\b/i, "랜딩 반응형 CSS가 EJS에 남아 있습니다.");

  const publicController = withoutComments(read("controllers/matthsController.js"));
  const arenaController = withoutComments(read("controllers/goatArenaController.js"));
  assert.match(
    publicController,
    /arenaContract\s*:\s*arenaPublicContractView\(activeArenaPolicy\)/,
    "공개 랜딩은 활성 정책에서 만든 표시 전용 계약을 전달해야 합니다."
  );
  assert.match(
    arenaController,
    /arenaContract\s*:\s*arenaPublicContractView\(activeArenaPolicy\)/,
    "Arena 첫 화면은 이미 조회한 활성 정책에서 표시 전용 계약을 전달해야 합니다."
  );

  const indexCss = withoutComments(read("public/css/index.css"));
  const arenaCss = withoutComments(read("public/css/goat-arena.css"));
  assert.match(
    arenaCss,
    /html\s*\{[^}]*overflow-x\s*:\s*clip/s,
    "GOAT Arena 페이지는 장식 레이어가 모바일 문서 폭을 넓히지 않게 해야 합니다."
  );
  assert.match(arenaCss, /body\s*\{[^}]*overflow-x\s*:\s*clip/s);
  assert.match(
    indexCss,
    /\.hero-layout\s*>\s*\*,\s*\.arena-hero-layout\s*>\s*\*\s*\{[^}]*min-width\s*:\s*0/s
  );
  assert.match(indexCss, /\.window-footer\s*\{[^}]*flex-wrap\s*:\s*wrap/s);
  assert.match(indexCss, /\.window-footer a\s*\{[^}]*white-space\s*:\s*nowrap/s);

  assertContractCss(read("public/css/index.css"), "var\\(--matths-navy-soft\\)");
  assertContractCss(read("public/css/goat-arena.css"), "var\\(--arena-panel\\)");
  assert.doesNotMatch(
    arenaCss,
    /\.arena-rule-strip\s*\{[^}]*overflow-x\s*:\s*auto/s,
    "모바일 경기 규칙은 가로 스크롤 대신 반응형 grid를 사용해야 합니다."
  );

  assert.match(
    indexCss,
    /\.arena-hero h1\s*\{[^}]*line-height\s*:\s*1\.1;[^}]*letter-spacing\s*:\s*-0\.04em/s
  );
  assert.match(
    arenaCss,
    /\.arena-hero-copy h1\s*\{[^}]*line-height\s*:\s*1\.1;[^}]*letter-spacing\s*:\s*-0\.04em/s
  );

  console.log(
    "Public Arena hero contract PASS: policy-backed Ranked/Unranked cards, muted-first video, owned mobile CSS, restrained Korean display type"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

// 개념 모션 컴포지션 자산 검증.
//
// 이 검증기가 막으려는 사고는 하나가 압도적으로 크다 — **음성 유입**이다.
// 모션 원본에는 compositions/ 바로 옆에 assets/voice(144MB)·voice-female(78MB)
// 가 형제로 들어앉아 있다. `cp -R compositions/ public/` 처럼 디렉터리째 복사하면
// 그 146MB 가 통째로 딸려 온다. 서버 총용량이 500MB 라 그대로 배포가 죽는다.
// 그래서 확장자·총용량·컴포지션 내부 참조까지 세 겹으로 잠근다.
//
// 나머지 검사는 "붙였다고 했는데 실제로는 안 붙은" 상태를 잡는다.

const root = path.resolve(__dirname, "..");
const motionDir = path.join(root, "public", "concept-motion");
const compositionDir = path.join(motionDir, "compositions");
const curriculumDir = path.join(root, "curriculum_folder");
const viewsDir = path.join(root, "views");

const EXPECTED_COMPOSITIONS = 448;

// 실측 35MB 다. 여유를 두되 음성 한 갈래(78MB)조차 못 들어오게 낮게 잠근다.
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

// 웹은 무음 모션으로 간다. 어떤 형태로도 음원이 들어오면 안 된다.
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".aiff",
  ".aif",
  ".ogg",
  ".opus",
  ".flac",
  ".weba",
  ".mp4",
  ".mov",
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

// 모션 자산(약 35MB, 448개 컴포지션)은 아직 저장소에 올리지 않았다. 커리큘럼
// 작업이 검수 대기 중이라, 검수 전에 배포 표면으로 들어가면 안 된다.
//
// 그래서 자산이 없으면 **무엇을 검사하지 못했는지 남기고** 넘어간다. 조용히
// 통과시키지 않는 이유는, 나중에 자산을 올리면서 이 검사가 도는 줄 알았는데
// 사실은 계속 건너뛰고 있었다는 상황을 만들지 않기 위해서다.
//
// 자산이 없어도 웹이 퇴보하지는 않는다 — main 에도 없다. 앱은 자체 번들을 쓴다.
if (!fs.existsSync(compositionDir)) {
  console.log("Concept motion assets absent — 검사 건너뜀");
  console.log("  · 검사하지 못한 것: 컴포지션 448개 수량, 음성 파일 유입, 총용량 상한, gsap 경로");
  console.log("  · 자산을 배치한 뒤 다시 돌려야 한다: npm run concept-motion:verify");
  process.exit(0);
}

const allFiles = walk(motionDir);

// ── 1. 음성 유입 차단 (가장 중요) ─────────────────────────────────────
const audioFiles = allFiles.filter((file) =>
  AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase())
);
assert.deepEqual(
  audioFiles.map((file) => path.relative(root, file)).sort(),
  [],
  "음성·영상 파일이 public/concept-motion 에 들어왔습니다. 웹은 무음 모션으로 가야 하며 음성 146MB 는 서버 용량(500MB)을 넘깁니다."
);

const voiceDirs = allFiles.filter((file) => /[/\\]voice(-female)?[/\\]/.test(file));
assert.deepEqual(
  voiceDirs.map((file) => path.relative(root, file)).sort(),
  [],
  "voice / voice-female 디렉터리가 복사됐습니다. compositions/ 를 디렉터리째 복사하면 형제로 딸려 옵니다."
);

const totalBytes = allFiles.reduce(
  (sum, file) => sum + fs.statSync(file).size,
  0
);
assert.ok(
  totalBytes <= MAX_TOTAL_BYTES,
  `public/concept-motion 총용량이 상한을 넘었습니다: ${(totalBytes / 1024 / 1024).toFixed(1)}MB > ${MAX_TOTAL_BYTES / 1024 / 1024}MB`
);

// ── 2. 컴포지션 개수와 개념 매핑 ───────────────────────────────────────
const compositions = fs
  .readdirSync(compositionDir)
  .filter((file) => file.endsWith(".html"));

assert.equal(
  compositions.length,
  EXPECTED_COMPOSITIONS,
  `컴포지션 수가 기대치와 다릅니다: ${compositions.length}`
);

const compositionNames = new Set(
  compositions.map((file) => file.replace(/\.html$/, ""))
);

const conceptIds = [];
for (const file of fs.readdirSync(curriculumDir)) {
  if (!file.endsWith(".yaml")) continue;
  const document = yaml.load(
    fs.readFileSync(path.join(curriculumDir, file), "utf8")
  );
  for (const course of document.courses || []) {
    for (const unit of course.units || []) {
      for (const concept of unit.concepts || []) {
        conceptIds.push(concept.id);
      }
    }
  }
}

assert.ok(conceptIds.length > 0, "커리큘럼에서 개념 ID를 읽지 못했습니다.");

// 매핑 규칙은 그대로다: 개념 ID == 컴포지션 파일명.
// 규칙이 단순한 만큼 어긋나면 조용히 폴백만 남으므로 여기서 못 박는다.
const missing = conceptIds.filter((id) => !compositionNames.has(id));
assert.deepEqual(
  missing.sort(),
  [],
  "남성 낭독 타이밍 컴포지션이 없는 개념이 있습니다."
);

const missingFemale = conceptIds.filter(
  (id) => !compositionNames.has(`${id}.female`)
);
assert.deepEqual(
  missingFemale.sort(),
  [],
  "여성 낭독 타이밍 컴포지션이 없는 개념이 있습니다."
);

// ── 3. 폰트·vendor ───────────────────────────────────────────────────
// 폰트가 없으면 한글이 두부(□)로 나오고, gsap 이 없으면 무대가 통째로 선다.
const requiredSiblings = [
  "assets/fonts/matths-kr.woff2",
  "assets/fonts/matths-kr-500.woff2",
  "assets/fonts/matths-kr-700.woff2",
  "assets/fonts/matths-math.woff2",
  "assets/fonts/matths-math-italic.woff2",
  "vendor/gsap.min.js",
];
for (const relative of requiredSiblings) {
  assert.ok(
    fs.existsSync(path.join(motionDir, relative)),
    `모션 자산이 없습니다: public/concept-motion/${relative}`
  );
}

// ── 4. 컴포지션 내부 규약 ─────────────────────────────────────────────
// base href="../" 덕분에 compositions/x.html 안의 "assets/fonts/..." 와
// "vendor/gsap.min.js" 가 /concept-motion/ 기준으로 풀린다. 이 한 줄이 빠지면
// 폰트와 gsap 이 /concept-motion/compositions/ 아래에서 404 가 된다.
// 개념에서 실제로 열리는 컴포지션과, 아무 개념도 가리키지 않는 레거시를 나눈다.
// 레거시(01-discriminant.* · 02-quadratic-max-min.* · _verify-*)는 컴포지션
// 규약이 굳기 전 파일이라 base href 와 로컬 gsap 이 없다. 웹에서는 어떤 개념
// ID 로도 도달할 수 없으므로 규약을 강제하지 않고 존재만 허용한다.
const conceptCompositions = compositions.filter((file) => {
  const name = file.replace(/\.html$/, "").replace(/\.female$/, "");
  return conceptIds.includes(name);
});

assert.equal(
  conceptCompositions.length,
  conceptIds.length * 2,
  "개념 ID 에 매핑되는 컴포지션 수가 남녀 한 쌍씩이 아닙니다."
);

for (const file of compositions) {
  const html = fs.readFileSync(path.join(compositionDir, file), "utf8");
  const name = `compositions/${file}`;

  // 음성 src 는 data-voice-src 로 이름만 바꿔 둔다. src 로 남아 있으면
  // 브라우저가 없는 mp3 를 긁어 콘솔이 404 로 뒤덮인다. 레거시도 예외가 아니다.
  assert.doesNotMatch(
    html,
    /\ssrc="assets\/voice/,
    `${name}: 음성 src 가 살아 있습니다. 웹에는 음원을 올리지 않으므로 404 가 납니다.`
  );

  if (!conceptCompositions.includes(file)) continue;

  // base href 가 빠지면 폰트와 gsap 이 /concept-motion/compositions/ 아래에서
  // 풀려 404 가 된다 — 두부 글자가 나오고 무대가 통째로 선다.
  assert.match(html, /<base href="\.\.\/"\s*\/?>/, `${name}: base href 가 없습니다.`);
  assert.match(
    html,
    /data-composition-id="[^"]+"/,
    `${name}: data-composition-id 가 없습니다. 호스트가 타임라인을 못 찾습니다.`
  );
  // CDN 만 남으면 교실 오프라인에서 무대가 서고, 외부 요청이 CSP 에도 걸린다.
  assert.match(
    html,
    /src="vendor\/gsap\.min\.js"/,
    `${name}: 로컬 gsap 참조가 없습니다.`
  );
}

// ── 5. 배선이 실제로 이 경로를 가리키는지 ─────────────────────────────
const experienceJs = fs.readFileSync(
  path.join(root, "public", "js", "concept-experience.js"),
  "utf8"
);

assert.match(
  experienceJs,
  /"\/concept-motion\/compositions\/"/,
  "concept-experience.js 가 컴포지션 경로를 가리키지 않습니다."
);
assert.match(
  experienceJs,
  /live=0&voice=off/,
  "컴포지션은 ?live=0&voice=off 로 열어야 합니다. live=1 은 없는 음성을 시계로 삼아 첫 프레임에서 멈춥니다."
);
// GSAP seek 의 suppressEvents 기본값이 true 라, false 를 넘기지 않으면
// onUpdate 가 안 불려 실시간 리드아웃이 0 에 얼어붙는다.
assert.match(
  experienceJs,
  /\.seek\([^)]*,\s*false\)/,
  "타임라인 seek 은 suppressEvents 를 false 로 넘겨야 합니다."
);

const experienceCss = fs.readFileSync(
  path.join(root, "public", "css", "concept-experience.css"),
  "utf8"
);
for (const selector of [
  ".concept-motion-embed",
  ".concept-motion-frame",
  ".concept-motion-controls",
]) {
  assert.ok(
    experienceCss.includes(selector),
    `concept-experience.css 에 ${selector} 스타일이 없습니다.`
  );
}

const mountedViews = [
  "partials/concept-experience.ejs",
  "partials/basic-concept-experience.ejs",
];
for (const relative of mountedViews) {
  const markup = fs.readFileSync(path.join(viewsDir, relative), "utf8");
  assert.match(
    markup,
    /data-concept-motion="<%= concept\.id %>"/,
    `${relative}: 모션 마운트가 없습니다.`
  );
  assert.match(
    markup,
    /class="concept-motion-frame"/,
    `${relative}: 모션 무대 컨테이너가 없습니다.`
  );
  // hidden 으로 시작해야 컴포지션을 못 잡았을 때 빈 상자가 안 남는다.
  assert.match(
    markup,
    /data-concept-motion="<%= concept\.id %>"[\s\S]{0,40}hidden/,
    `${relative}: 마운트는 hidden 으로 시작해야 폴백이 조용합니다.`
  );
}

console.log(
  `Concept motion asset verification passed: ${compositions.length} compositions, ` +
    `${conceptIds.length} concepts mapped, ` +
    `${(totalBytes / 1024 / 1024).toFixed(1)}MB total, 0 audio files`
);

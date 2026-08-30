const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

function readAvcDimensions(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  const marker = Buffer.from("avc1");
  let offset = 0;

  while ((offset = buffer.indexOf(marker, offset)) >= 0) {
    if (offset + 32 <= buffer.length) {
      const width = buffer.readUInt16BE(offset + 28);
      const height = buffer.readUInt16BE(offset + 30);
      if (width > 0 && height > 0) return { width, height };
    }
    offset += marker.length;
  }

  throw new Error(`${relativePath}에서 H.264 영상 크기를 확인할 수 없습니다.`);
}

const navigationHtml = ejs.render(
  read("views/partials/dashboard-navigation.ejs"),
  {
    user: { role: "admin" },
    activePage: "main",
    data: {},
    stats: {},
    assetVersion: "verify",
  }
);
assert.match(
  navigationHtml,
  /href="\/admin"[^>]*>[\s\S]*?관리자/,
  "학습 홈에서도 관리자 계정의 운영센터 버튼이 보여야 합니다."
);

const dashboardService = read("services/dashboardService.js");
assert.match(
  dashboardService,
  /user:\s*\{[\s\S]*?role:\s*user\.role\s*\|\|\s*"student"/,
  "학습 홈용 사용자 데이터에 역할 정보가 포함되어야 합니다."
);

const arenaView = read("views/goat-arena.ejs");
assert.match(arenaView, /<video[^>]*\bmuted\b[^>]*\bpreload="auto"/);
assert.match(arenaView, /arena-sound-toggle is-muted/);
assert.match(arenaView, /GOAT Arena 영상 소리 켜기/);

const arenaScript = read("public/js/goat-arena.js");
assert.match(
  arenaScript,
  /arenaVideo\.volume\s*=\s*1;\s*arenaVideo\.muted\s*=\s*true;/,
  "GOAT Arena 영상은 최초 재생 때 무음이어야 합니다."
);

const arenaStyles = read("public/css/goat-arena.css");
assert.match(arenaStyles, /\.arena-hero-copy h1\s*\{[\s\S]*?overflow:\s*visible;/);
assert.match(arenaStyles, /\.arena-hero-copy h1 em\s*\{[\s\S]*?padding:/);

assert.deepEqual(
  readAvcDimensions("public/videos/goatArena-desktop.mp4"),
  { width: 1920, height: 1080 }
);
assert.deepEqual(
  readAvcDimensions("public/videos/goatArena-mobile.mp4"),
  { width: 1280, height: 720 }
);

console.log(
  "학습 홈 관리자 버튼·Arena 기본 무음·HD 영상·제목 여백 검증을 통과했습니다."
);

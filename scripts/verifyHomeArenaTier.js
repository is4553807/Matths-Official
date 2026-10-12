"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const controller = read("controllers/matthsController.js");
const view = read("views/index.ejs");
const styles = read("public/css/index.css");
const homeScript = read("public/js/index.js");

assert.match(controller, /exports\.mainPage[\s\S]*res\.render\("index", \{ user \}\)/);
assert.doesNotMatch(controller, /getArenaLandingSpotlight|arenaSpotlight/);
assert.doesNotMatch(view, /arenaSpotlight|arenaContract|현재 GP|공식 Arena Standing/);
assert.match(view, /GOAT Arena 입장/);
assert.match(view, /일반전/);
assert.match(view, /경쟁전/);
assert.match(view, /https:\/\/apps\.apple\.com\/app\/id6803569629/);
assert.match(view, /data-home-theme="light"/);
assert.match(view, /matths-ipad-light\.jpg/);
assert.match(view, /matths-ipad-dark\.jpg/);
assert.match(view, /matths-iphone-light\.jpg/);
assert.match(view, /matths-iphone-dark\.jpg/);
assert.match(view, /serviceHref\("app", "\/private-mock-exams"\)/);
assert.match(view, /serviceHref\("academy", "\/academy"\)/);
assert.match(view, /serviceHref\("parents", "\/parent"\)/);
assert.doesNotMatch(view, /serviceHref\("admin"/);

assert.match(styles, /\.app-download/);
assert.match(styles, /\.service-entry-grid/);
assert.match(styles, /html\[data-home-theme="dark"\]/);
assert.match(styles, /\.theme-device-shot-dark/);
assert.match(homeScript, /matths-home-theme/);
assert.match(homeScript, /root\.dataset\.homeTheme/);
assert.match(homeScript, /window\.localStorage\.setItem/);

for (const asset of [
  "matths-ipad-light.jpg",
  "matths-ipad-dark.jpg",
  "matths-iphone-light.jpg",
  "matths-iphone-dark.jpg",
]) {
  const assetPath = path.join(root, "public/images/home-devices", asset);
  assert.ok(fs.existsSync(assetPath), `${asset} 파일이 없습니다.`);
  assert.ok(fs.statSync(assetPath).size > 200_000, `${asset} 원본 이미지가 너무 작습니다.`);
}

console.log("Matths 메인 GOAT Arena 소개와 현재 서비스 이동 경로 검증을 통과했습니다.");

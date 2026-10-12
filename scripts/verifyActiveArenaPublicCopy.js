"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const ROOT = path.resolve(__dirname, "..");
const ACTIVE_SURFACES = [
  "views/index.ejs",
  "views/intro.ejs",
  "views/learning-flow.ejs",
  "views/parent-dashboard.ejs",
  "views/profile.ejs",
  "public/js/onboarding-tutorial.js",
  "views/war-of-masters.ejs",
  "views/war-of-masters-rankings.ejs",
  "views/private-mock-exams.ejs",
];
const ARENA_PUBLIC_SURFACES = [
  "views/goat-arena.ejs",
  "views/goat-arena-division.ejs",
  "views/goat-arena-match.ejs",
  "views/goat-arena-rules.ejs",
  "views/goat-arena-rules-index.ejs",
  "views/goat-arena-profile.ejs",
  "views/faq.ejs",
  "views/terms.ejs",
  "views/privacy.ejs",
  "public/js/arena-tutorial.js",
  "public/js/onboarding-tutorial.js",
  "services/goatArenaV22RulebookService.js",
  "services/arenaMatchAttemptService.js",
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const sources = new Map(
  ACTIVE_SURFACES.map((relativePath) => [relativePath, read(relativePath)])
);

for (const [relativePath, source] of sources) {
  assert.doesNotMatch(
    source,
    /\ud398\uc774\ubc31|\bpayback\b|\ud559\uc2b5\s*\uc77c\uc218|\bGP\b|Unranked|Ranked/i,
    `${relativePath}: \ud604\ud589 \ud654\uba74\uc5d0 \uad6c\ud615 Arena \uacbd\uc81c\u00b7Division \ubb38\uad6c\uac00 \ub0a8\uc544 \uc788\uc2b5\ub2c8\ub2e4.`
  );
  assert.doesNotMatch(
    source,
    /\uc77c\uc694\uc77c[^\n]{0,40}(\uc7a0\uae40|\uc774\uc6a9\s*\ubd88\uac00|\uc6b4\uc601\ud558\uc9c0\s*\uc54a)/,
    `${relativePath}: \uc77c\uc694\uc77c \uc774\uc6a9 \uc81c\ud55c \ubb38\uad6c\uac00 \ub0a8\uc544 \uc788\uc2b5\ub2c8\ub2e4.`
  );
  if (relativePath.endsWith(".ejs")) {
    ejs.compile(source, { filename: path.join(ROOT, relativePath) });
  }
}

for (const relativePath of ARENA_PUBLIC_SURFACES) {
  assert.doesNotMatch(
    read(relativePath),
    /과거\s*경기\s*기록|과거\s*기록|비동기|기록\s*매칭|기록\s*대결|비교\s*기록\s*없음/,
    `${relativePath}: 사용자 화면에 내부 경기 연결 방식이 노출되어 있습니다.`
  );
}

const controller = read("controllers/matthsController.js");
assert.doesNotMatch(controller, /getActiveArenaPolicy|arenaPublicContractView/);
assert.match(
  controller,
  /exports\.mainPage\s*=\s*\(req, res\)[\s\S]*?res\.render\("index", \{ user \}\)/
);

const home = sources.get("views/index.ejs");
assert.doesNotMatch(home, /partials\/arena-contract/);
assert.match(home, /\uc77c\ubc18\uc804/);
assert.match(home, /\uacbd\uc7c1\uc804/);
assert.match(home, /\uce5c\uc120\uc804\s*\u00b7\s*\ub3c4\uc804\uc7a5/);
assert.match(home, /\ubb38\ud56d\ub2f9 10\ubd84/);

const onboarding = sources.get("public/js/onboarding-tutorial.js");
assert.match(onboarding, /Free\u00b7Pro \ud50c\ub79c/);
assert.match(onboarding, /\uc720\ud6a8\ud55c \uc77c\ubc18\uc804 3\uacbd\uae30/);

const weeklyMock = sources.get("views/private-mock-exams.ejs");
assert.match(weeklyMock, /응시자 본인의 내부 실력 지표에만 반영/);
assert.match(weeklyMock, /응시하지 않은 사용자에게도 불이익이 없습니다/);

const masters = sources.get("views/war-of-masters.ejs");
assert.match(masters, /1~5\ud68c \ubc30\uce58/);
assert.match(masters, /\ubbf8\uc751\uc2dc \ubd88\uc774\uc775 \uc5c6\uc74c/);

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedSurfaces: ACTIVE_SURFACES.length,
      checks: [
        "legacy-public-copy-absent",
        "landing-policy-hot-read-absent",
        "current-arena-modes-present",
        "free-pro-onboarding-present",
        "weekly-mock-one-sided-rating-policy-present",
        "arena-internal-matchmaking-copy-hidden",
      ],
    },
    null,
    2
  )
);

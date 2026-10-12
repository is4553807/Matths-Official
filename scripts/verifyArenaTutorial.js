const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  arenaTutorialView,
  eligibleArenaTutorialChapters,
} = require("../services/arenaTutorialService");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

assert.deepEqual(
  eligibleArenaTutorialChapters({ activeDivision: "SUB" }),
  ["common", "normal", "competitive", "friends"]
);
assert.deepEqual(
  eligibleArenaTutorialChapters({ activeDivision: "MAIN" }),
  ["common", "normal", "competitive", "friends"]
);

const firstUnrankedVisit = arenaTutorialView({}, { activeDivision: "SUB" });
assert.equal(firstUnrankedVisit.autoChapter, null);
assert.equal(firstUnrankedVisit.shouldAutoStart, false);
assert.equal(firstUnrankedVisit.chapters.normal.status, "PENDING");
assert.equal(firstUnrankedVisit.chapters.competitive.status, "PENDING");
assert.equal(firstUnrankedVisit.chapters.friends.status, "PENDING");

const afterCommon = arenaTutorialView(
  { arenaTutorial: { common: { status: "COMPLETED" } } },
  { activeDivision: "SUB" }
);
assert.equal(afterCommon.autoChapter, null);
assert.equal(afterCommon.shouldAutoStart, false);

const promoted = arenaTutorialView(
  {
    arenaTutorial: {
      common: { status: "COMPLETED" },
      normal: { status: "COMPLETED" },
    },
  },
  { activeDivision: "MAIN" }
);
assert.equal(promoted.autoChapter, null);
assert.equal(promoted.chapters.normal.status, "COMPLETED");
assert.equal(promoted.chapters.competitive.status, "PENDING");
assert.equal(promoted.chapters.friends.status, "PENDING");

const suspended = arenaTutorialView({}, {
  activeDivision: "MAIN",
  suspendAutoStart: true,
});
assert.equal(suspended.autoChapter, null);
assert.equal(suspended.shouldAutoStart, false);
assert.equal(suspended.suspended, true);

const model = read("models/matthsModel.js");
const controller = read("controllers/goatArenaController.js");
const routes = read("routes/goat-arena-routes.js");
const navigation = read("views/partials/goat-arena-navigation.ejs");
const partial = read("views/partials/arena-tutorial.ejs");
const client = read("public/js/arena-tutorial.js");
const styles = read("public/css/goat-arena.css");
const profile = read("views/goat-arena-profile.ejs");

assert.match(model, /arenaTutorial:/);
assert.match(controller, /suspendAutoStart: false/);
assert.match(controller, /exports\.updateArenaTutorial/);
assert.match(controller, /exports\.restartArenaTutorial/);
assert.match(routes, /\/api\/goat-arena\/tutorial/);
assert.match(routes, /\/goat-arena\/profile\/tutorial\/restart/);
assert.match(navigation, /include\("arena-tutorial"\)/);
assert.match(navigation, /data-arena-tutorial-nav=/);
assert.match(partial, /data-arena-tour-character-image/);
assert.match(client, /common:/);
assert.match(client, /normal:/);
assert.match(client, /competitive:/);
assert.match(client, /friends:/);
assert.doesNotMatch(client, /unranked|ranked_battle|ranked_shop|main\/battle|main\/shop/);
assert.match(client, /setInterval/);
assert.match(client, /2000/);
assert.match(client, /waitForScroll/);
assert.match(client, /requestAnimationFrame\(trackSpotlight\)/);
assert.match(client, /rectChanged\(lastTrackedRect, currentRect\)/);
assert.match(client, /postTutorial\("SKIP", chapter\)/);
assert.match(client, /root\.classList\.add\("is-positioning"\)/);
assert.match(client, /window\.requestAnimationFrame\(\(\) => root\.classList\.remove\("is-positioning"\)\)/);
assert.doesNotMatch(client, /\/goat-arena\/rules\//);
const pageChapterBlock = client.match(/const pageChapters = \{([\s\S]*?)\n  \};/)?.[1] || "";
assert.doesNotMatch(pageChapterBlock, /"\/goat-arena"\s*:/);
assert.match(styles, /\.arena-tour-spotlight\.is-pulsing/);
assert.match(styles, /border-radius: 28px/);
assert.match(profile, /GOAT Arena 튜토리얼/);
assert.match(profile, /profileTutorialChapters\.forEach/);

const targetFiles = [
  "views/goat-arena.ejs",
  "views/goat-arena-division.ejs",
  "views/goat-arena-match.ejs",
  "views/goat-arena-profile.ejs",
  "views/goat-arena-friends.ejs",
];
const targetCount = targetFiles.reduce(
  (count, file) => count + (read(file).match(/data-arena-tutorial-target=/g) || []).length,
  0
);
assert.ok(targetCount >= 8, "Arena 현재 화면의 주요 기능을 충분히 안내해야 합니다.");

console.log("GOAT Arena chapter tutorial verification passed.");

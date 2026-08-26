const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.join(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

async function renderHome(arenaSpotlight) {
  return ejs.renderFile(path.join(root, "views/index.ejs"), {
    assetVersion: "tier-verification",
    user: {
      id: "64b000000000000000000151",
      name: "tier-preview",
      role: "student",
    },
    arenaContract: {
      learningCycleDays: 29,
      minimumAttackParticipationDays: 15,
      maximumPaybackRatePercent: 100,
    },
    arenaSpotlight,
  });
}

async function run() {
  const controller = read("controllers/matthsController.js");
  const view = read("views/index.ejs");
  const styles = read("public/css/index.css");

  const service = read("services/arenaLandingSpotlightService.js");
  assert.match(controller, /getArenaLandingSpotlight/);
  assert.match(controller, /getRankingData/);
  assert.match(controller, /getLandingRankingSummary/);
  assert.match(service, /ArenaAccessState\.findOne/);
  assert.match(service, /ArenaStanding\.findOne/);
  assert.match(service, /currentEntry:/);
  assert.match(view, /arena-my-standing/);
  assert.match(view, /티어 내 순위/);
  assert.match(styles, /\.arena-my-standing/);

  const connected = await renderHome({
    available: true,
    seasonLabel: "2026 S3",
    activeCount: null,
    topEntries: [],
    currentEntry: {
      displayName: "tier-preview",
      division: "MAIN",
      divisionLabel: "Ranked",
      tierLabel: "다이아몬드",
      tierPosition: 7,
      rankPoint: 83,
      overallRank: 21,
      cohortLabel: "대학교 순위",
      cohortRank: 3,
    },
  });
  assert.match(connected, /현재 내 티어/);
  assert.match(connected, /다이아몬드/);
  assert.match(connected, /7위/);
  assert.match(connected, />83</);
  assert.match(connected, /종합랭킹 순위/);
  assert.match(connected, /21위/);
  assert.match(connected, /대학교 순위/);
  assert.match(connected, /3위/);
  assert.match(connected, /공식 Arena Standing과 실시간으로 연결됩니다/);

  const pending = await renderHome({
    available: false,
    seasonLabel: null,
    activeCount: null,
    topEntries: [],
    currentEntry: null,
  });
  assert.match(pending, /Arena 티어가 아직 연결되지 않았습니다/);
  assert.doesNotMatch(pending, /class="arena-my-standing"/);

  console.log("Matths 메인 사용자 Arena 티어 연결 검증을 통과했습니다.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

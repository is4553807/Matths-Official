const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.join(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

async function renderHome(arenaSpotlight, { loggedIn = true } = {}) {
  return ejs.renderFile(path.join(root, "views/index.ejs"), {
    assetVersion: "tier-verification",
    user: loggedIn
      ? {
          id: "64b000000000000000000151",
          name: "tier-preview",
          role: "student",
        }
      : null,
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

  const loggedOut = await renderHome(
    {
      available: true,
      seasonLabel: "2026 S3",
      activeCount: 2,
      topEntries: [
        {
          displayName: "hidden-player",
          tierLabel: "챌린저",
          rankPoint: 99,
        },
      ],
      currentEntry: null,
    },
    { loggedIn: false }
  );
  assert.match(loggedOut, /로그인 후 Arena 순위를 확인할 수 있습니다/);
  assert.match(loggedOut, /로그인하면 현재 티어와 종합랭킹, 사용자군 순위를 확인할 수 있습니다/);
  assert.match(loggedOut, /href="\/login">로그인하고 확인/);
  assert.doesNotMatch(loggedOut, /이번 시즌 랭킹은 준비 중입니다/);
  assert.doesNotMatch(loggedOut, /hidden-player/);

  console.log("Matths 메인 사용자 Arena 티어 연결 검증을 통과했습니다.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

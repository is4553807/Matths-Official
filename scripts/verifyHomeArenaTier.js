const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const {
  accountNavigation,
  serviceOrigins,
} = require("../services/serviceUrlService");

const root = path.join(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const environment = {
  NODE_ENV: "production",
  PUBLIC_BASE_URL: "https://www.matths.kr",
  APP_BASE_URL: "https://app.matths.kr",
  ACADEMY_BASE_URL: "https://academy.matths.kr",
  ADMIN_BASE_URL: "https://admin.matths.kr",
  PARENTS_BASE_URL: "https://parents.matths.kr",
};
const serviceUrls = serviceOrigins(environment);

async function renderHome(
  arenaSpotlight,
  {
    session = {
      user: {
        id: "64b000000000000000000151",
        name: "tier-preview",
        role: "student",
      },
    },
  } = {}
) {
  return ejs.renderFile(path.join(root, "views/index.ejs"), {
    assetVersion: "tier-verification",
    user: session.user || null,
    accountNavigation: accountNavigation(session, environment),
    serviceUrls,
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
  const homeScript = read("public/js/index.js");

  const service = read("services/arenaLandingSpotlightService.js");
  assert.match(controller, /getArenaLandingSpotlight/);
  assert.match(controller, /getRankingData/);
  assert.match(controller, /getLandingRankingSummary/);
  assert.match(service, /ArenaAccessState\.findOne/);
  assert.match(service, /ArenaStanding\.findOne/);
  assert.match(service, /currentEntry:/);
  assert.match(view, /arena-my-standing/);
  assert.match(view, /티어 내 순위/);
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
  assert.match(styles, /\.arena-my-standing/);
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
  assert.match(connected, /data-home-theme-toggle/);
  assert.match(connected, /모바일 앱 다운로드/);

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
    { session: {} }
  );
  assert.match(loggedOut, /로그인 후 Arena 순위를 확인할 수 있습니다/);
  assert.match(loggedOut, /로그인하면 현재 티어와 종합랭킹, 사용자군 순위를 확인할 수 있습니다/);
  assert.match(loggedOut, /href="https:\/\/www\.matths\.kr\/login">로그인하고 확인/);
  assert.match(loggedOut, /href="https:\/\/app\.matths\.kr\/main"/);
  assert.match(loggedOut, /href="https:\/\/academy\.matths\.kr\/academy"/);
  assert.match(loggedOut, /href="https:\/\/parents\.matths\.kr\/parent"/);
  assert.match(loggedOut, /href="https:\/\/app\.matths\.kr\/private-mock-exams"/);
  assert.match(loggedOut, /href="https:\/\/app\.matths\.kr\/goat-arena"/);
  assert.doesNotMatch(loggedOut, /href="https:\/\/admin\.matths\.kr\//);
  assert.doesNotMatch(loggedOut, /이번 시즌 랭킹은 준비 중입니다/);
  assert.doesNotMatch(loggedOut, /hidden-player/);

  const teacher = await renderHome(null, {
    session: { user: { id: "teacher", role: "teacher" } },
  });
  assert.match(teacher, /href="https:\/\/academy\.matths\.kr\/academy"[^>]*>\s*학원 대시보드/);

  const parent = await renderHome(null, {
    session: { parent: { id: "parent" } },
  });
  assert.match(parent, /href="https:\/\/parents\.matths\.kr\/parent"[^>]*>\s*학부모 대시보드/);

  console.log("Matths 메인 사용자 Arena 티어 연결 검증을 통과했습니다.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

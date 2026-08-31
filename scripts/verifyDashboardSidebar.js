"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const viewsDirectory = path.join(root, "views");
const navigationPath = path.join(
  viewsDirectory,
  "partials/dashboard-navigation.ejs"
);
const sidebarPath = path.join(
  viewsDirectory,
  "partials/dashboard-sidebar.ejs"
);

async function renderNavigation(completedConcepts) {
  return ejs.renderFile(navigationPath, {
    activePage: "main",
    assetVersion: "verification",
    data: {
      completedConcepts,
      stats: { pendingReviewCount: 0 },
    },
    stats: { due: 0 },
    user: { role: "student" },
    academyMembershipAvailable: false,
  });
}

async function main() {
  const zeroNavigation = await renderNavigation(0);
  assert.doesNotMatch(
    zeroNavigation,
    /id="completed-concept-badge"/,
    "완료 개념이 0개일 때 내 학습 배지를 표시하면 안 됩니다."
  );

  const positiveNavigation = await renderNavigation(7);
  assert.match(
    positiveNavigation,
    /id="completed-concept-badge"[^>]*>7<\/b>/,
    "완료 개념이 있을 때만 실제 개수를 배지로 표시해야 합니다."
  );

  const sidebar = await ejs.renderFile(sidebarPath, {
    activePage: "main",
    assetVersion: "verification",
    navigationData: { completedConcepts: 0, stats: {} },
    navigationStats: { due: 0 },
    navigationUser: { role: "student", realName: "테스트 학생" },
    academyMembershipAvailable: false,
    profileName: "테스트 학생",
    profileSubtitle: "고등학교 2학년",
    profileImageSrc: "",
    profileLevel: 1,
  });
  assert.match(
    sidebar,
    /\/images\/brand\/matths-logo-light\.svg/,
    "대시보드 사이드바는 프로필과 같은 공식 Matths 풀 로고를 사용해야 합니다."
  );
  assert.doesNotMatch(
    sidebar,
    /\/images\/dashboard\/matths-logo\.png|>Matths<\/span>/,
    "별도 마크와 텍스트를 조합한 임시 로고를 사용하면 안 됩니다."
  );

  const dashboardViews = fs
    .readdirSync(viewsDirectory)
    .filter((file) => file.endsWith(".ejs"))
    .map((file) => ({
      file,
      source: fs.readFileSync(path.join(viewsDirectory, file), "utf8"),
    }))
    .filter(({ source }) =>
      source.includes('include("partials/dashboard-sidebar"')
    );

  assert.equal(
    dashboardViews.length,
    24,
    "공용 사이드바를 사용하는 대시보드 화면 수가 달라졌습니다."
  );
  for (const { file, source } of dashboardViews) {
    assert.match(source, /id="sidebar-overlay"/, `${file}: 모바일 오버레이가 필요합니다.`);
    assert.match(source, /id="sidebar-open"/, `${file}: 모바일 메뉴 열기 버튼이 필요합니다.`);
    assert.doesNotMatch(
      source,
      /include\("partials\/dashboard-navigation"/,
      `${file}: 공용 사이드바 밖에서 내비게이션을 중복 렌더링하면 안 됩니다.`
    );
  }

  console.log(
    `Dashboard sidebar verification passed: ${dashboardViews.length} shared views, zero badge hidden.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

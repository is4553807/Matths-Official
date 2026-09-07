"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const {
  accountNavigation,
  serviceOrigins,
} = require("../services/serviceUrlService");

const environment = {
  NODE_ENV: "production",
  PUBLIC_BASE_URL: "https://www.matths.kr",
  APP_BASE_URL: "https://app.matths.kr",
  ACADEMY_BASE_URL: "https://academy.matths.kr",
  ADMIN_BASE_URL: "https://admin.matths.kr",
  PARENTS_BASE_URL: "https://parents.matths.kr",
};
const serviceUrls = serviceOrigins(environment);
const viewsDirectory = path.resolve(__dirname, "..", "views");

async function renderNavigation(session) {
  return ejs.renderFile(
    path.join(viewsDirectory, "partials", "home-public-navigation.ejs"),
    {
      accountNavigation: accountNavigation(session, environment),
      activePage: "home",
      assetVersion: "test",
      serviceUrls,
      suppressGlobalSkipLink: false,
      user: session.user || null,
    }
  );
}

async function main() {
  const cases = [
    [{}, "https://www.matths.kr/login", "https://www.matths.kr/register", "로그인", "무료로 시작하기"],
    [{ user: { id: "student", role: "student" } }, "https://app.matths.kr/main", "https://app.matths.kr/my-learning", "대시보드", "학습 계속하기"],
    [{ user: { id: "teacher", role: "teacher" } }, "https://academy.matths.kr/academy", "https://academy.matths.kr/academy", "대시보드", "학습 계속하기"],
    [{ user: { id: "admin", role: "admin" } }, "https://admin.matths.kr/admin", "https://admin.matths.kr/admin", "대시보드", "학습 계속하기"],
    [{ parent: { id: "parent" } }, "https://parents.matths.kr/parent", "https://parents.matths.kr/parent", "대시보드", "학습 계속하기"],
  ];

  for (const [session, dashboardHref, primaryHref, dashboardLabel, primaryLabel] of cases) {
    const html = await renderNavigation(session);
    assert.ok(html.includes(`href="${dashboardHref}"`));
    assert.ok(html.includes(`href="${primaryHref}"`));
    assert.ok(html.includes(dashboardLabel));
    assert.ok(html.includes(primaryLabel));
    assert.ok(html.includes('href="https://www.matths.kr/"'));
  }

  const loginHtml = await ejs.renderFile(path.join(viewsDirectory, "login.ejs"), {
    accountNavigation: accountNavigation({}, environment),
    assetVersion: "test",
    error: null,
    loginNotice: null,
    next: "/parent/payments",
    oldInput: { email: "parent-id" },
    publicContactEmail: "support@example.invalid",
    serviceUrls,
    socialAuthProviders: [],
    success: null,
  });
  assert.ok(loginHtml.includes('href="https://www.matths.kr/"'));
  assert.ok(loginHtml.includes('action="https://www.matths.kr/login"'));
  assert.ok(loginHtml.includes('name="identifier"'));
  assert.ok(loginHtml.includes('name="next" value="/parent/payments"'));

  console.log("공용 로그인·로고·역할별 메인 네비게이션 링크 검증 완료");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

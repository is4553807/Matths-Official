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
    [{}, "https://www.matths.kr/login", "https://www.matths.kr/student/register", "로그인", "무료로 시작하기"],
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
    oldInput: { email: "parent@example.com" },
    publicContactEmail: "support@example.invalid",
    serviceUrls,
    socialAuthProviders: [],
    success: null,
    accountType: "student",
  });
  assert.ok(loginHtml.includes('href="https://www.matths.kr/"'));
  assert.ok(loginHtml.includes('action="/student/login"'));
  assert.ok(loginHtml.includes('type="email"'));
  assert.ok(loginHtml.includes('name="email"'));
  assert.ok(loginHtml.includes('value="parent@example.com"'));
  assert.ok(!loginHtml.includes('name="identifier"'));
  assert.ok(loginHtml.includes('name="next" value="/parent/payments"'));
  assert.ok(loginHtml.includes('href="/academy/login"'));
  assert.ok(loginHtml.includes('href="/parent/login"'));

  const unifiedLoginHtml = await ejs.renderFile(path.join(viewsDirectory, "login.ejs"), {
    accountNavigation: accountNavigation({}, environment),
    assetVersion: "test",
    error: null,
    loginNotice: null,
    next: "/academy",
    oldInput: { email: "teacher@example.com" },
    publicContactEmail: "support@example.invalid",
    serviceUrls,
    socialAuthProviders: [],
    success: null,
    accountType: "academy",
    unifiedLogin: true,
  });
  assert.ok(unifiedLoginHtml.includes("<title>통합 로그인 | Matths</title>"));
  assert.ok(unifiedLoginHtml.includes('action="/login"'));
  assert.ok(unifiedLoginHtml.includes('name="accountType" value="academy"'));
  assert.ok(unifiedLoginHtml.includes('href="/login?accountType=student&amp;next=%2Facademy"'));
  assert.ok(unifiedLoginHtml.includes('href="/login?accountType=academy&amp;next=%2Facademy"'));
  assert.ok(unifiedLoginHtml.includes('href="/login?accountType=parent&amp;next=%2Facademy"'));
  assert.ok(!unifiedLoginHtml.includes("accountType=admin"));
  assert.ok(unifiedLoginHtml.includes("로그인 후 실제 계정 역할에 맞는 화면으로 이동합니다."));

  console.log("통합 로그인 역할 선택·학생 로그인·로고·역할별 메인 네비게이션 링크 검증 완료");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

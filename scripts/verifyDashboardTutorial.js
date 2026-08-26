"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  dashboardTutorialView,
} = require("../services/dashboardTutorialService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const model = read("models/matthsModel.js");
const controller = read("controllers/matthsController.js");
const routes = read("routes/matths-routes.js");
const mainView = read("views/main.ejs");
const learningView = read("views/my-learning.ejs");
const tutorialPageViews = {
  "/log-curriculum": read("views/log-curriculum.ejs"),
  "/quick-practice": read("views/quick-practice.ejs"),
  "/assessments": read("views/assessment-center.ejs"),
  "/wrong-notes": read("views/wrong-notes.ejs"),
  "/war-of-masters": read("views/war-of-masters.ejs"),
  "/store": read("views/store.ejs"),
  "/coach-suggestions": read("views/coach-suggestions.ejs"),
};
const navigationView = read("views/partials/dashboard-navigation.ejs");
const tutorialView = read("views/partials/onboarding-tutorial.ejs");
const profileView = read("views/profile.ejs");
const script = read("public/js/onboarding-tutorial.js");
const styles = read("public/css/onboarding-tutorial.css");

assert.equal(dashboardTutorialView({}).status, "NOT_REQUIRED");
assert.equal(dashboardTutorialView({}).shouldAutoStart, false);
assert.equal(
  dashboardTutorialView({ dashboardTutorialStatus: "PENDING" }).shouldAutoStart,
  true
);
assert.equal(
  dashboardTutorialView({ dashboardTutorialStatus: "COMPLETED" }).shouldAutoStart,
  false
);

assert.match(
  model,
  /dashboardTutorialStatus:[\s\S]*enum: \["NOT_REQUIRED", "PENDING", "COMPLETED", "SKIPPED"\][\s\S]*default: "NOT_REQUIRED"/,
  "기존 계정에는 튜토리얼이 자동 실행되지 않아야 합니다."
);
assert.match(
  controller,
  /User\.create\(\{[\s\S]*dashboardTutorialStatus: "PENDING"/,
  "새로 가입한 계정은 튜토리얼 대기 상태로 생성되어야 합니다."
);
assert.match(controller, /exports\.restartDashboardTutorial/);
assert.match(controller, /exports\.updateDashboardTutorial/);
assert.match(routes, /"\/api\/dashboard-tutorial"/);
assert.match(routes, /"\/profile\/tutorial\/restart"/);

assert.match(mainView, /include\("partials\/onboarding-tutorial", \{ page: "main" \}\)/);
assert.match(
  learningView,
  /include\("partials\/onboarding-tutorial", \{ page: "my-learning" \}\)/
);
Object.entries(tutorialPageViews).forEach(([pagePath, view]) => {
  const page = pagePath.slice(1);
  assert.match(
    view,
    new RegExp(`include\\("partials/onboarding-tutorial", \\{ page: "${page}" \\}\\)`),
    `${pagePath} 화면에도 튜토리얼이 포함되어야 합니다.`
  );
  assert.match(view, /\/css\/onboarding-tutorial\.css/);
  assert.match(view, /\/js\/onboarding-tutorial\.js/);
});
assert.match(navigationView, /data-tutorial-nav="<%= item\.id %>"/);
assert.match(tutorialView, /data-tutorial-skip/);
assert.match(tutorialView, /data-tutorial-next/);
assert.match(tutorialView, /data-tutorial-spotlight/);
assert.match(tutorialView, /mild-goat-1\.webp/);
assert.match(profileView, /action="\/profile\/tutorial\/restart"/);
assert.match(profileView, />\s*튜토리얼 시작하기/);

const requiredPathSteps = {
  "/main": 5,
  "/my-learning": 3,
  "/log-curriculum": 4,
  "/quick-practice": 4,
  "/assessments": 4,
  "/wrong-notes": 5,
  "/war-of-masters": 7,
  "/store": 5,
  "/coach-suggestions": 5,
};
Object.entries(requiredPathSteps).forEach(([pagePath, expectedSteps]) => {
  assert.equal(
    (script.match(new RegExp(`path: "${pagePath}"`, "g")) || []).length,
    expectedSteps,
    `${pagePath} 화면 안의 핵심 기능을 모두 설명해야 합니다.`
  );
});
assert.equal(
  Object.values(requiredPathSteps).reduce((total, count) => total + count, 0),
  42
);
assert.match(script, /data-tutorial-target=\"quick-controls\"/);
assert.match(script, /data-tutorial-target=\"assessment-course\"/);
assert.match(script, /data-tutorial-target=\"wrong-filter\"/);
assert.match(script, /data-tutorial-target=\"arena-match\"/);
assert.match(script, /data-tutorial-target=\"store-catalog\"/);
assert.match(script, /data-tutorial-target=\"suggestion-form\"/);
assert.match(script, /window\.location\.assign\(`\$\{step\.path\}\?tutorialStep=\$\{index\}`\)/);
assert.match(script, /finish\("COMPLETE"\)/);
assert.match(script, /finish\("SKIP"\)/);
assert.match(script, /window\.setInterval\(\(\) => \{[\s\S]*?\}, 2000\)/);
assert.match(script, /prefers-reduced-motion: reduce/);
assert.match(styles, /\.matths-tutorial-close/);
assert.match(styles, /\.matths-tutorial-target/);
assert.match(styles, /\.matths-tutorial-spotlight/);
assert.match(styles, /z-index: 9002/);
const targetRule = styles.match(/\.matths-tutorial-target\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.doesNotMatch(targetRule, /box-shadow|border-radius|rgba\(111, 239, 197/);
assert.match(styles, /9999px rgba\(3, 6, 20, 0\.82\)/);
assert.match(styles, /@keyframes matths-tutorial-attention/);
assert.match(styles, /@keyframes matths-tutorial-spotlight-reveal/);
assert.equal((script.match(/attention: true/g) || []).length, 27);
assert.match(script, /function prepareTargetAppearance\(target, attention\)/);
assert.match(script, /function revealAfterViewportSettles/);
assert.match(script, /stableFrames >= 4/);
assert.match(script, /targetNeedsScroll\(target\)/);
assert.match(script, /behavior: reducedMotion \? "auto" : "smooth"/);
assert.match(script, /nextButton\.disabled = Boolean\(target\)/);
assert.match(script, /const gapX = compactTarget \? 18 : 28/);
assert.match(script, /const gapY = compactTarget \? 11 : 20/);

console.log("신규 가입 자동 시작·페이지 이동·완료·스킵·프로필 재시작 튜토리얼 검증을 통과했습니다.");

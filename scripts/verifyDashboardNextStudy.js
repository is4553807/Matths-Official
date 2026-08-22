const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const {
  _testing: { selectCurrentLearningCandidate },
} = require("../services/dashboardService");

const root = path.resolve(__dirname, "..");
const mainView = path.join(root, "views", "main.ejs");
const mainCss = path.join(root, "public", "css", "main.css");

function itemKey(courseId, unitId, conceptId) {
  return `${courseId}/${unitId}/${conceptId}`;
}

function metadata(courseId, unitId, conceptId, options = {}) {
  return {
    course: {
      id: courseId,
      officialTitle: options.courseTitle || courseId,
      developmentLocked: Boolean(options.developmentLocked),
    },
    unit: { id: unitId, title: options.unitTitle || unitId },
    concept: { id: conceptId, title: options.conceptTitle || conceptId },
  };
}

function progress(courseId, unitId, conceptId, completionPercent, status = "in-progress") {
  return {
    courseId,
    unitId,
    conceptId,
    completionPercent,
    status,
  };
}

function verifyCandidateSelection() {
  const staleKey = itemKey("common-math-1", "deleted-unit", "deleted-concept");
  const unavailableKey = itemKey("geometry", "geometry-unit", "geometry-concept");
  const lockedKey = itemKey("common-math-1", "locked-unit", "locked-concept");
  const unpublishedKey = itemKey("common-math-1", "unit-a", "unpublished");
  const completedKey = itemKey("common-math-1", "unit-a", "completed");
  const validKey = itemKey("common-math-2", "unit-b", "valid");
  const curriculumIndex = new Map([
    [unavailableKey, metadata("geometry", "geometry-unit", "geometry-concept")],
    [
      lockedKey,
      metadata("common-math-1", "locked-unit", "locked-concept", {
        developmentLocked: true,
      }),
    ],
    [unpublishedKey, metadata("common-math-1", "unit-a", "unpublished")],
    [completedKey, metadata("common-math-1", "unit-a", "completed")],
    [validKey, metadata("common-math-2", "unit-b", "valid")],
  ]);
  const lessonMap = new Map([
    [unavailableKey, { isPublished: true }],
    [lockedKey, { isPublished: true }],
    [completedKey, { isPublished: true }],
    [validKey, { isPublished: true }],
  ]);

  const selected = selectCurrentLearningCandidate({
    progressDocuments: [
      progress("common-math-1", "deleted-unit", "deleted-concept", 35),
      progress("geometry", "geometry-unit", "geometry-concept", 20),
      progress("common-math-1", "locked-unit", "locked-concept", 15),
      progress("common-math-1", "unit-a", "unpublished", 10),
      progress("common-math-1", "unit-a", "completed", 100, "completed"),
      progress("common-math-2", "unit-b", "valid", 37),
    ],
    learningData: { courses: [] },
    curriculumIndex,
    lessonMap,
  });

  assert.equal(staleKey, "common-math-1/deleted-unit/deleted-concept");
  assert.equal(selected.key, validKey);
  assert.equal(selected.progress.completionPercent, 37);

  const fallbackCompleteKey = itemKey("common-math-1", "unit-a", "done");
  const fallbackUnpublishedKey = itemKey("common-math-1", "unit-a", "draft");
  const fallbackValidKey = itemKey("common-math-1", "unit-a", "first-published");
  const laterValidKey = itemKey("common-math-2", "unit-b", "later-published");
  const fallbackIndex = new Map([
    [fallbackCompleteKey, metadata("common-math-1", "unit-a", "done")],
    [fallbackUnpublishedKey, metadata("common-math-1", "unit-a", "draft")],
    [fallbackValidKey, metadata("common-math-1", "unit-a", "first-published")],
    [laterValidKey, metadata("common-math-2", "unit-b", "later-published")],
  ]);
  const fallbackLessons = new Map([
    [fallbackCompleteKey, { isPublished: true }],
    [fallbackValidKey, { isPublished: true }],
    [laterValidKey, { isPublished: true }],
  ]);
  const fallbackLearningData = {
    courses: [
      {
        id: "geometry",
        developmentLocked: false,
        units: [{ id: "geometry-unit", concepts: [{ id: "geometry-concept", progress: 0 }] }],
      },
      {
        id: "common-math-1",
        developmentLocked: false,
        units: [
          {
            id: "unit-a",
            concepts: [
              { id: "done", progress: 100 },
              { id: "draft", progress: 0 },
              { id: "first-published", progress: 0 },
            ],
          },
        ],
      },
      {
        id: "common-math-2",
        developmentLocked: false,
        units: [{ id: "unit-b", concepts: [{ id: "later-published", progress: 0 }] }],
      },
    ],
  };

  const fallback = selectCurrentLearningCandidate({
    progressDocuments: [
      progress("common-math-1", "deleted-unit", "deleted-concept", 12),
    ],
    learningData: fallbackLearningData,
    curriculumIndex: fallbackIndex,
    lessonMap: fallbackLessons,
  });

  assert.equal(fallback.key, fallbackValidKey);
  assert.equal(fallback.progress, null);

  const noCandidate = selectCurrentLearningCandidate({
    progressDocuments: [],
    learningData: {
      courses: [
        {
          id: "common-math-1",
          developmentLocked: false,
          units: [
            {
              id: "unit-a",
              concepts: [
                { id: "done", progress: 100 },
                { id: "draft", progress: 0 },
              ],
            },
          ],
        },
      ],
    },
    curriculumIndex: fallbackIndex,
    lessonMap: new Map([[fallbackCompleteKey, { isPublished: true }]]),
  });

  assert.equal(noCandidate, null);
}

function dashboardData(currentLearning, overrides = {}) {
  return {
    notifications: [],
    hasUrgentNotification: false,
    activeDashboardNotices: [
      {
        id: "notice-1",
        kind: "notice",
        title: "운영 공지",
        content: "검증용 공지입니다.",
        href: "/notifications/notice-1",
        dismissUrl: "/notifications/notice-1/dismiss",
      },
    ],
    currentLearning,
    coach: {
      mode: "gentle",
      label: "차분하게",
      message: "한 단계씩 이어가세요.",
    },
    activePlan: {
      code: "FREE",
      name: "기본학습 패키지",
      statusLabel: "기본학습 이용",
      unlimited: false,
      remainingLearningDays: 0,
      expiresAt: null,
    },
    accessRenewalNotice: null,
    weeklyActivity: { days: [], maxMinutes: 0 },
    stats: {
      weeklyStudyMinutes: 0,
      todayStudyMinutes: 0,
      activeStudyDays: 0,
      averageStudyMinutes: 0,
      weeklySolvedProblems: 0,
      correctRate: 0,
    },
    completedConcepts: 0,
    ...overrides,
  };
}

async function renderDashboard(currentLearning, overrides = {}) {
  return ejs.renderFile(mainView, {
    user: {
      id: "507f1f77bcf86cd799439011",
      name: "검증학생",
      realName: "김검증",
      role: "student",
      schoolGrade: 10,
      currentStreak: 3,
    },
    dashboardData: dashboardData(currentLearning, overrides),
  });
}

function nextStudyCard(html) {
  const match = html.match(
    /<section\s+class="continue-card next-study-card"[\s\S]*?<\/section>/,
  );
  assert.ok(match, "다음 학습 카드가 렌더링되어야 합니다.");
  return match[0];
}

async function verifyDashboardRendering() {
  const currentLearning = {
    courseTitle: "공통수학 1",
    unitTitle: "다항식",
    conceptTitle: "다항식의 <연산>",
    progress: 37.4,
    href: "/learn/common-math-1/polynomial/operations",
    estimatedMinutes: 12,
    stepTitle: "곱셈 공식을 확인합니다.",
  };
  const html = await renderDashboard(currentLearning);
  const card = nextStudyCard(html);

  assert.equal(
    (html.match(/class="continue-card next-study-card"/g) || []).length,
    1,
    "학습 홈에는 다음 학습 카드가 하나만 있어야 합니다.",
  );
  assert.equal(
    (card.match(/class="[^"]*\bprimary-action\b[^"]*"/g) || []).length,
    1,
    "다음 학습 카드에는 주 CTA가 하나만 있어야 합니다.",
  );
  assert.match(card, /다항식의 &lt;연산&gt;/);
  assert.match(card, /href="\/learn\/common-math-1\/polynomial\/operations"/);
  assert.match(card, />\s*이어서 학습\s*<span aria-hidden="true">→<\/span>/);
  assert.match(card, /role="progressbar"/);
  assert.match(card, /aria-valuemin="0"/);
  assert.match(card, /aria-valuemax="100"/);
  assert.match(card, /aria-valuenow="37"/);
  assert.match(card, /--next-study-progress:37%/);

  const topbarIndex = html.indexOf('class="topbar"');
  const cardIndex = html.indexOf('class="continue-card next-study-card"');
  const noticeIndex = html.indexOf('class="dashboard-announcements"');
  const coachIndex = html.indexOf('class="dashboard-coach-card"');
  const planIndex = html.indexOf('class="usage-plan-section"');
  assert.ok(
    topbarIndex >= 0 &&
      cardIndex > topbarIndex &&
      noticeIndex > cardIndex &&
      coachIndex > noticeIndex &&
      planIndex > coachIndex,
    "다음 학습 카드는 topbar 직후이며 공지·코치·이용 플랜보다 앞이어야 합니다.",
  );

  const emptyHtml = await renderDashboard(null);
  const emptyCard = nextStudyCard(emptyHtml);
  assert.equal(
    (emptyHtml.match(/class="continue-card next-study-card"/g) || []).length,
    1,
  );
  assert.match(emptyCard, /이어갈 학습을 선택하세요/);
  assert.match(emptyCard, /href="\/my-learning"/);
  assert.match(emptyCard, /내 학습에서 선택하기/);
  assert.doesNotMatch(emptyCard, /role="progressbar"/);

  const dialogHtml = await renderDashboard(null, {
    accessRenewalNotice: {
      kind: "SUB_ACCESS_EXPIRED_LOCKED",
      graceDeadline: null,
    },
  });
  assert.match(
    dialogHtml,
    /<dialog[\s\S]*?aria-labelledby="access-renewal-title"[\s\S]*?aria-describedby="access-renewal-description"/,
  );
  assert.match(dialogHtml, /<h2 id="access-renewal-title">/);
  assert.match(dialogHtml, /<span id="access-renewal-description">/);
}

function cssRule(css, selector) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [];
  for (const match of source.matchAll(new RegExp(`${escaped}\\s*\\{`, "g"))) {
    let depth = 0;
    for (let cursor = 0; cursor < match.index; cursor += 1) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
    }
    if (depth !== 0) continue;
    const previousRule = source.lastIndexOf("}", match.index - 1);
    const previousStatement = source.lastIndexOf(";", match.index - 1);
    const preludeStart = Math.max(previousRule, previousStatement) + 1;
    const prelude = source.slice(preludeStart, match.index + selector.length).trim();
    if (!prelude.split(",").map((part) => part.trim()).includes(selector)) continue;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = source.indexOf("}", bodyStart);
    assert.notEqual(bodyEnd, -1, `닫히지 않은 CSS 규칙: ${selector}`);
    matches.push(source.slice(bodyStart, bodyEnd));
  }
  assert.equal(matches.length, 1, `${selector}: 최상위 CSS 소유자는 정확히 하나여야 합니다.`);
  return matches[0];
}

function cssBlock(css, headerPattern, label) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const matches = [...source.matchAll(headerPattern)];
  assert.equal(matches.length, 1, `${label}: CSS block은 정확히 하나여야 합니다.`);
  const open = source.indexOf("{", matches[0].index + matches[0][0].length);
  assert.notEqual(open, -1, `${label}: CSS block 시작을 찾지 못했습니다.`);
  let depth = 1;
  let quote = null;
  let cursor = open + 1;
  while (cursor < source.length && depth > 0) {
    const character = source[cursor];
    if (quote) {
      if (character === "\\") cursor += 1;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    cursor += 1;
  }
  assert.equal(depth, 0, `${label}: CSS block이 닫히지 않았습니다.`);
  return source.slice(open + 1, cursor - 1);
}

function verifyCssContract() {
  const css = fs.readFileSync(mainCss, "utf8");
  const card = cssRule(css, ".continue-card.next-study-card");
  const ornament = cssRule(css, ".continue-card.next-study-card::after");
  const action = cssRule(css, ".next-study-card .primary-action");
  const progressTrack = cssRule(css, ".next-study-progress-track");
  const progressFill = cssRule(css, ".next-study-progress-track > span");
  const relevantRules = [...css.matchAll(/[^{}]*next-study[^{}]*\{[^{}]*\}/g)]
    .map((match) => match[0])
    .join("\n");

  assert.match(card, /min-height:\s*0/);
  assert.match(card, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(card, /background:\s*var\(--white\)/);
  assert.match(card, /box-shadow:\s*none/);
  assert.match(ornament, /content:\s*none/);
  assert.match(action, /min-height:\s*48px/);
  assert.match(action, /font-size:\s*14px/);
  assert.match(action, /background:\s*var\(--matths-action-primary\)/);
  assert.match(action, /box-shadow:\s*none/);
  assert.match(progressTrack, /height:\s*4px/);
  assert.match(progressFill, /background:\s*var\(--matths-progress-blue\)/);
  assert.doesNotMatch(relevantRules, /(?:linear|radial)-gradient|\bfilter:\s*blur/i);
  const mobileCss = cssBlock(
    css,
    /@media\s*\(max-width:\s*700px\)/g,
    "700px next-study",
  );
  assert.match(cssRule(mobileCss, ".next-study-heading"), /grid-template-columns:\s*1fr/);
}

async function main() {
  verifyCandidateSelection();
  await verifyDashboardRendering();
  verifyCssContract();
  console.log("Dashboard next-study verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

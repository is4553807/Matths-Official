const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { CONTENT_TYPES } = require("../models/studyHallModel");
const { STUDY_HALL_TABS, validateStudyHallAnswerKeyJson } = require("../services/studyHallService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

assert.deepEqual(CONTENT_TYPES, [
  "NJE",
  "DAILY_HALF",
  "PRACTICE_MOCK",
  "FINAL",
  "CONCEPT",
  "ERROR_REPORT",
]);
assert.deepEqual(STUDY_HALL_TABS.map((tab) => tab.code), CONTENT_TYPES);

for (const view of ["views/store.ejs", "views/store-study.ejs", "views/admin-store.ejs"]) {
  ejs.compile(read(view), { filename: path.join(root, view) });
}

const routes = read("routes/matths-routes.js");
for (const route of [
  '"/store"',
  '"/store/content/:contentId"',
  '"/store/content/:contentId/save"',
  '"/store/content/:contentId/submit"',
  '"/store/content/:contentId/files/:assetId"',
  '"/admin/store/content"',
  '"/admin/store/content/:contentId"',
  '"/admin/store/content/:contentId/archive"',
]) assert.ok(routes.includes(route), `missing route ${route}`);

const service = read("services/studyHallService.js");
for (const guard of [
  'status: { $ne: "SUBMITTED" }',
  'publishAt: { $lte: now }',
  'contentType === "DAILY_HALF" && questions.length !== 15',
  'itemCount !== questions.length',
]) assert.ok(service.includes(guard), `missing study-hall guard ${guard}`);

const flexibleAnswerKey = validateStudyHallAnswerKeyJson({
  schemaVersion: "matths-answer-key-v1",
  questions: Array.from({ length: 15 }, (_unused, index) => ({
    number: index + 1,
    answer: String((index % 5) + 1),
    points: index === 14 ? 2 : 1,
    type: "multiple-choice",
  })),
}, { expectedCount: 15 });
assert.equal(flexibleAnswerKey.questionCount, 15);
assert.equal(flexibleAnswerKey.totalPoints, 16);
assert.equal(flexibleAnswerKey.questions[14].points, 2);

const weeklyPoints = [
  2, 2, 2, 3, 3,
  3, 3, 3, 3, 3,
  3, 3, 3, 4, 4,
  4, 4, 4, 4, 4,
  4, 3, 3, 3, 3,
  4, 4, 4, 4, 4,
];
const weeklyFormatAnswerKey = validateStudyHallAnswerKeyJson({
  schemaVersion: "matths-answer-key-v1",
  answers: Array.from({ length: 30 }, (_unused, index) => index < 21 ? String((index % 5) + 1) : String(index + 10)),
  points: weeklyPoints,
  questionModes: Array.from({ length: 30 }, (_unused, index) => index < 21 ? "multiple-choice" : "short-answer"),
  explanations: Array.from({ length: 30 }, (_unused, index) => ({
    number: index + 1,
    concept: `${index + 1}번 핵심 개념`,
    steps: [`${index + 1}번 풀이`],
  })),
});
assert.equal(weeklyFormatAnswerKey.questionCount, 30);
assert.equal(weeklyFormatAnswerKey.totalPoints, 100);
assert.equal(weeklyFormatAnswerKey.questions[21].answerType, "short-answer");
assert.match(weeklyFormatAnswerKey.questions[0].explanation, /핵심 개념/);

const userView = read("views/store.ejs");
for (const label of [
  "자체제작 N제",
  "데일리 하프",
  "실전 모의고사",
  "수능 파이널",
  "개념 학습",
  "오답 유형 리포트",
  "최근 학습 이어서 하기",
]) assert.ok(userView.includes(label) || read("services/studyHallService.js").includes(label), `missing user feature ${label}`);

const detailView = read("views/store-study.ejs");
for (const label of ["임시 저장", "최종 제출", "답안 마킹", "해설 PDF"]) {
  assert.ok(detailView.includes(label), `missing learning flow ${label}`);
}

const adminView = read("views/admin-store.ejs");
for (const field of [
  'name="contentType"',
  'name="series"',
  'name="title"',
  'name="description"',
  'name="questionPdf"',
  'name="solutionPdf"',
  'name="answerKeyJson"',
  'name="status"',
  'name="sortOrder"',
  'name="publishAt"',
]) assert.ok(adminView.includes(field), `missing admin field ${field}`);

const styles = read("public/css/store.css");
assert.ok(styles.includes("@media"), "responsive study-hall CSS is missing");
assert.ok(styles.includes(".study-hall-tabs"), "study-hall tabs CSS is missing");
assert.ok(styles.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "mobile two-column tabs are missing");

console.log("Study hall foundation verified: 6 tabs, user learning flow, admin lifecycle, R2 asset routes, responsive UI.");

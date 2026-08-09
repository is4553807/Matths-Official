const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { CONTENT_TYPES } = require("../models/studyHallModel");
const { STUDY_HALL_TABS } = require("../services/studyHallService");

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
  'name="status"',
  'name="sortOrder"',
  'name="publishAt"',
]) assert.ok(adminView.includes(field), `missing admin field ${field}`);

const styles = read("public/css/store.css");
assert.ok(styles.includes("@media"), "responsive study-hall CSS is missing");
assert.ok(styles.includes(".study-hall-tabs"), "study-hall tabs CSS is missing");
assert.ok(styles.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "mobile two-column tabs are missing");

console.log("Study hall foundation verified: 6 tabs, user learning flow, admin lifecycle, R2 asset routes, responsive UI.");

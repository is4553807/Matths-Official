"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildAdminArenaConceptInsights,
} = require("../services/adminArenaConceptInsightService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const problemPacks = [
  {
    _id: "pack-1",
    questions: [
      {
        questionKey: "q1",
        typeId: "test-exponential",
        courseId: "algebra",
        skillTags: ["지수방정식"],
        answer: "4",
        points: 20,
      },
      {
        questionKey: "q2",
        typeId: "test-sequence",
        courseId: "algebra",
        skillTags: ["수열의 귀납적 정의"],
        answer: "7",
        points: 20,
      },
      {
        questionKey: "q3",
        typeId: "test-integral",
        courseId: "calculus-1",
        skillTags: ["정적분 넓이"],
        answer: "9",
        points: 20,
      },
    ],
  },
];
const attempts = [
  {
    matchId: "match-1",
    problemPackId: "pack-1",
    submittedAt: new Date("2026-08-30T10:00:00.000Z"),
    answers: [
      { questionKey: "q1", value: "3" },
      { questionKey: "q2", value: "7" },
      { questionKey: "q3", value: "9" },
    ],
  },
  {
    matchId: "match-2",
    problemPackId: "pack-1",
    submittedAt: new Date("2026-08-31T10:00:00.000Z"),
    answers: [
      { questionKey: "q1", value: "2" },
      { questionKey: "q2", value: "7" },
      { questionKey: "q3", value: "8" },
    ],
  },
];

const insights = buildAdminArenaConceptInsights({ attempts, problemPacks });
assert.equal(insights.summary.matchCount, 2);
assert.equal(insights.summary.questionCount, 6);
assert.equal(insights.summary.correctCount, 3);
assert.equal(insights.summary.correctRate, 50);
assert.equal(insights.summary.conceptCount, 3);
assert.deepEqual(
  insights.weakConcepts.map((concept) => [concept.label, concept.correctRate]),
  [
    ["지수방정식", 0],
    ["정적분 넓이", 50],
  ]
);
assert.deepEqual(
  insights.strongConcepts.map((concept) => [concept.label, concept.correctRate]),
  [["수열의 귀납적 정의", 100]]
);
assert.equal(insights.weakConcepts[0].courseLabel, "대수");
assert.equal(insights.strongConcepts[0].confidence, "초기");

const adminService = read("services/adminService.js");
const adminView = read("views/admin-user-detail.ejs");
const userFacingSources = [
  "services/dashboardService.js",
  "controllers/apiController.js",
  "controllers/goatArenaController.js",
  "views/main.ejs",
  "views/war-of-masters.ejs",
].map(read).join("\n");

assert.match(adminService, /getAdminArenaConceptInsights\(userId\)/);
assert.match(adminView, /운영자 전용 · 사용자 비공개/);
assert.match(adminView, /경기 기반 개념 강·약점/);
assert.doesNotMatch(
  userFacingSources,
  /adminArenaConceptInsight|arenaConceptInsights/,
  "운영자용 개념 지표가 학생 화면이나 공개 API에 연결되면 안 됩니다."
);

console.log("운영자 전용 1:1 경기 개념 강·약점 집계 검증을 통과했습니다.");

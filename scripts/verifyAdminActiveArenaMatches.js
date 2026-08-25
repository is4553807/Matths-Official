const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  LIVE_HEARTBEAT_WINDOW_MS,
  buildAdminActiveArenaMatchesData,
} = require("../services/adminActiveArenaMatchesService");

const now = new Date("2026-08-25T12:00:00.000Z");
const user = (id, name) => ({
  _id: id,
  name,
  email: `${name}@arena-test.invalid`,
});
const participant = (userId) => ({ userId });
const match = (id, status, updatedAt = now) => ({
  _id: id,
  status,
  division: "MAIN",
  matchType: "NORMAL",
  tierPairLabel: "R3 → R2",
  challenger: participant(`challenger-${id}`),
  defender: participant(`defender-${id}`),
  startDeadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
  requestedAt: new Date(now.getTime() - 10 * 60 * 1000),
  updatedAt,
});
const attempt = (matchId, role, status, extra = {}) => ({
  _id: `${matchId}-${role}`,
  matchId,
  userId: `${role.toLowerCase()}-${matchId}`,
  role,
  status,
  answers: [],
  currentQuestionIndex: 0,
  ...extra,
});

const matches = [
  match("live", "IN_PROGRESS"),
  match("waiting", "READY"),
  match("preparing", "MATCHED"),
  match("stale", "IN_PROGRESS"),
  match("evidence", "IN_PROGRESS"),
  match("finished-defender", "IN_PROGRESS"),
  match("resolved", "RESOLVED"),
];
const attempts = [
  attempt("live", "CHALLENGER", "SUBMITTED"),
  attempt("live", "DEFENDER", "IN_PROGRESS", {
    lastHeartbeatAt: new Date(now.getTime() - LIVE_HEARTBEAT_WINDOW_MS + 1000),
    currentQuestionIndex: 2,
    answers: [{ value: "4" }, { value: "" }],
  }),
  attempt("waiting", "CHALLENGER", "IN_PROGRESS"),
  attempt("waiting", "DEFENDER", "READY"),
  attempt("stale", "DEFENDER", "IN_PROGRESS", {
    lastHeartbeatAt: new Date(now.getTime() - LIVE_HEARTBEAT_WINDOW_MS - 1000),
  }),
  attempt("evidence", "DEFENDER", "EVIDENCE_REQUIRED", {
    currentQuestionIndex: 5,
    evidenceDeadlineAt: new Date(now.getTime() + 30 * 60 * 1000),
  }),
  attempt("finished-defender", "DEFENDER", "SUBMITTED"),
];
const users = matches.flatMap((entry) => [
  user(`challenger-${entry._id}`, `공격자-${entry._id}`),
  user(`defender-${entry._id}`, `방어자-${entry._id}`),
]);

const data = buildAdminActiveArenaMatchesData({ matches, attempts, users, now });
assert.equal(data.stats.total, 5);
assert.equal(data.stats.live, 1);
assert.equal(data.stats.waiting, 2);
assert.equal(data.stats.stale, 1);
assert.equal(data.stats.evidence, 1);
assert.equal(data.matches[0].id, "live", "현재 풀이 중인 경기가 목록 맨 위에 있어야 합니다.");
assert.equal(data.matches[0].defenderAttempt.currentQuestion, 3);
assert.equal(data.matches[0].defenderAttempt.answeredCount, 1);
assert.equal(data.matches.find((entry) => entry.id === "preparing").stage.key, "PREPARING");
assert.equal(data.matches.some((entry) => entry.id === "finished-defender"), false);
assert.equal(data.matches.some((entry) => entry.id === "resolved"), false);

const root = path.resolve(__dirname, "..");
const source = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
assert.match(source("routes/matths-routes.js"), /"\/admin\/arena-live-matches"/);
assert.match(source("controllers/matthsController.js"), /adminActiveArenaMatchesPage/);
assert.match(source("views/partials/admin-navigation.ejs"), /진행 중인 경기/);
assert.match(source("views/admin-arena-live-matches.ejs"), /15초마다 자동 갱신/);
assert.match(source("services/adminActiveArenaMatchesService.js"), /방어자 현재 풀이 중/);

console.log(
  `진행 중인 Arena 경기 운영 화면 검증 완료: ${data.stats.total}건 · 현재 풀이 ${data.stats.live}건 · 응답 대기 ${data.stats.waiting}건`
);

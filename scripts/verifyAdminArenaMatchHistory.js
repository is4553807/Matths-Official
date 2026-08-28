const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  HISTORY_MATCH_STATUSES,
  buildAdminArenaMatchHistoryData,
  buildHistoryMatchFilter,
  normalizeHistoryFilters,
} = require("../services/adminArenaMatchHistoryService");

const ids = {
  match: "64b000000000000000000701",
  challenger: "64b000000000000000000702",
  defender: "64b000000000000000000703",
};
const filters = normalizeHistoryFilters({
  query: "challenger",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-28",
  division: "main",
  matchType: "normal",
  status: "settled",
  integrityStatus: "clear",
  participantId: ids.challenger,
});
assert.equal(filters.division, "MAIN");
assert.equal(filters.status, "SETTLED");
assert.equal(filters.participantId, ids.challenger);

const mongoFilter = buildHistoryMatchFilter(filters, [ids.challenger]);
assert.ok(mongoFilter.$and, "날짜·닉네임·상태 필터가 Mongo 조건으로 합쳐져야 합니다.");
assert.match(JSON.stringify(mongoFilter), /challenger\.userId/);
assert.match(JSON.stringify(mongoFilter), /createdAt/);

const match = {
  _id: ids.match,
  matchKey: "MAIN:NORMAL:20260828:001",
  seasonKey: "2026-S3",
  division: "MAIN",
  matchType: "NORMAL",
  status: "SETTLED",
  integrityStatus: "CLEAR",
  tierPairLabel: "R3 → R2",
  challenger: { userId: ids.challenger, stakeDays: 1 },
  defender: { userId: ids.defender, stakeDays: 1 },
  winnerRole: "CHALLENGER",
  resultSnapshot: {
    challenger: { score: 80, correctCount: 4 },
    defender: { score: 60, correctCount: 3 },
  },
  requestedAt: new Date("2026-08-28T08:00:00.000Z"),
  startedAt: new Date("2026-08-28T08:05:00.000Z"),
  settledAt: new Date("2026-08-28T09:00:00.000Z"),
  createdAt: new Date("2026-08-28T08:00:00.000Z"),
};
const data = buildAdminArenaMatchHistoryData({
  matches: [match],
  attempts: [
    { matchId: ids.match, role: "CHALLENGER", status: "SUBMITTED" },
    { matchId: ids.match, role: "DEFENDER", status: "SUBMITTED" },
  ],
  users: [
    { _id: ids.challenger, name: "challenger", email: "a@example.com" },
    { _id: ids.defender, name: "defender", email: "b@example.com" },
  ],
  total: 1,
  filters,
  focusUserId: ids.challenger,
});
assert.equal(data.records.length, 1);
assert.equal(data.records[0].challenger.score, 80);
assert.equal(data.records[0].challenger.result, "WIN");
assert.equal(data.records[0].defender.result, "LOSE");
assert.equal(data.records[0].focusedParticipant.nickname, "challenger");
assert.equal(data.records[0].opponent.nickname, "defender");
assert.deepEqual(
  HISTORY_MATCH_STATUSES,
  [
    "SUBMITTED",
    "RESOLVED",
    "HELD",
    "INVALID",
    "SETTLED",
    "CANCELLED",
    "INSURED_CANCELLED",
  ],
  "부정행위 여부와 무관한 모든 종료 상태를 포함해야 합니다."
);

const root = path.resolve(__dirname, "..");
const source = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
assert.match(source("routes/matths-routes.js"), /"\/admin\/arena-match-history"/);
assert.match(source("controllers/matthsController.js"), /adminArenaMatchHistoryPage/);
assert.match(source("views/partials/admin-navigation.ejs"), /전체 경기 기록/);
assert.match(source("views/admin-arena-match-history.ejs"), /닉네임·실명·이메일·경기 ID/);
assert.match(source("views/admin-arena-match-history.ejs"), /부정행위 검토 여부와 관계없이/);
assert.match(source("services/adminService.js"), /getAdminUserRecentArenaMatches\(userId, 5\)/);
assert.match(source("views/admin-user-detail.ejs"), /최근 5경기/);

console.log("전체 Arena 경기 기록·필터·유저 최근 5경기 검증을 통과했습니다.");

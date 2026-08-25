const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ARENA_ACTIVITY_COUNTED_STATUS,
  ARENA_ACTIVITY_MATCH_TYPES,
  ARENA_ACTIVITY_MAX_LEVEL,
  buildArenaActivityLevel,
  requiredMatchesForLevel,
} = require("../services/arenaActivityLevelService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

assert.equal(ARENA_ACTIVITY_MAX_LEVEL, 10);
assert.equal(ARENA_ACTIVITY_COUNTED_STATUS, "SETTLED");
assert.deepEqual(ARENA_ACTIVITY_MATCH_TYPES, ["NORMAL", "REVENGE"]);

const expectedThresholds = [0, 5, 15, 30, 50, 75, 105, 140, 180, 225];
expectedThresholds.forEach((threshold, index) => {
  assert.equal(requiredMatchesForLevel(index + 1), threshold);
  assert.equal(buildArenaActivityLevel(threshold).level, index + 1);
});

assert.deepEqual(
  buildArenaActivityLevel(14),
  {
    level: 2,
    maxLevel: 10,
    totalMatches: 14,
    currentLevelStart: 5,
    nextLevelThreshold: 15,
    matchesToNext: 1,
    levelProgress: 90,
    isMaxLevel: false,
  }
);
assert.equal(buildArenaActivityLevel(-10).totalMatches, 0);
assert.equal(buildArenaActivityLevel(999).level, 10);
assert.equal(buildArenaActivityLevel(999).isMaxLevel, true);

const navigationView = read("views/partials/goat-arena-navigation.ejs");
const levelService = read("services/arenaActivityLevelService.js");
const profileView = read("views/profile.ejs");
const arenaProfileView = read("views/goat-arena-profile.ejs");
const adminUsersView = read("views/admin-users.ejs");
const adminDetailView = read("views/admin-user-detail.ejs");

assert.match(navigationView, /arena-level-plate/);
assert.match(navigationView, /activityLevel\?\.level/);
assert.match(levelService, /ArenaMatchEvidence\.aggregate/);
assert.match(levelService, /originalEvidenceSubmitted:\s*true/);
assert.match(levelService, /submittedAt:\s*\{\s*\$ne:\s*null\s*\}/);
assert.match(profileView, /arenaActivityLevel\.level/);
assert.match(arenaProfileView, /공식 Arena Match/);
assert.match(adminUsersView, /member\.arenaActivityLevel/);
assert.match(adminDetailView, /detail\.arenaActivityLevel/);

console.log("Arena 활동 레벨 계산·표시 검증을 통과했습니다.");

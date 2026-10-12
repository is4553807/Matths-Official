const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../services/arenaNotificationService.js"),
  "utf8"
);

assert.doesNotMatch(source, /방어해야 할 경기가 배정되었습니다/);
assert.doesNotMatch(source, /notifyArenaMatchDefender/);
assert.doesNotMatch(source, /ArenaMatchCreated/);
assert.doesNotMatch(source, /ArenaRevengeMatchCreated/);
assert.doesNotMatch(source, /ArenaAutomaticDefenseSuspended/);
assert.doesNotMatch(source, /MainInvitationOffered/);
assert.doesNotMatch(source, /MainFriendlyInvitationCreated/);
assert.match(source, /ArenaMatchSettled/);
assert.match(source, /ArenaMatchIntegrityReviewStarted/);

console.log("Arena notification routing verified: no defense-assignment email or stale event handler.");

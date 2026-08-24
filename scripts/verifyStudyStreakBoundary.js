"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  getEffectiveStreak,
} = require("../services/userLifecycleService");
const {
  _private: { groupIpadLearningEvents, isStreakLearningEvent },
} = require("../controllers/ipadLearningSyncController");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const now = new Date("2026-08-23T03:00:00.000Z");
assert.equal(
  getEffectiveStreak(
    { currentStreak: 7, lastStudyDate: new Date("2026-08-23T00:00:00.000Z") },
    now
  ),
  7
);
assert.equal(
  getEffectiveStreak(
    { currentStreak: 7, lastStudyDate: new Date("2026-08-22T00:00:00.000Z") },
    now
  ),
  7
);
assert.equal(
  getEffectiveStreak(
    { currentStreak: 7, lastStudyDate: new Date("2026-08-20T00:00:00.000Z") },
    now
  ),
  0
);

assert.equal(
  isStreakLearningEvent({ eventType: "problem-correct", metadata: {} }),
  true
);
assert.equal(
  isStreakLearningEvent({
    eventType: "concept-closed",
    metadata: { analyticsExcluded: true, syncKind: "protected-screen-event" },
  }),
  false
);
assert.equal(
  isStreakLearningEvent({ eventType: "recommendation-shown", metadata: {} }),
  false
);
const groupedIpadDays = groupIpadLearningEvents(
  [
    {
      userId: "student-1",
      clientEventId: "a",
      eventType: "problem-correct",
      durationMs: 1_000,
      occurredAt: new Date("2026-08-22T16:00:00.000Z"),
      metadata: {},
    },
    {
      userId: "student-1",
      clientEventId: "b",
      eventType: "problem-wrong",
      durationMs: 2_000,
      occurredAt: new Date("2026-08-22T17:00:00.000Z"),
      metadata: {},
    },
    {
      userId: "student-1",
      clientEventId: "protected",
      eventType: "concept-closed",
      durationMs: 9_000,
      occurredAt: new Date("2026-08-22T17:30:00.000Z"),
      metadata: { analyticsExcluded: true },
    },
  ],
  new Set(["a", "b", "protected"])
);
assert.equal(groupedIpadDays.length, 1);
assert.equal(groupedIpadDays[0].durationMs, 3_000);

const lifecycleSource = read("services/userLifecycleService.js");
const arenaControllerSource = read("controllers/goatArenaController.js");
const ipadSyncSource = read("controllers/ipadLearningSyncController.js");
const adminServiceSource = read("services/adminService.js");
const adminUsersView = read("views/admin-users.ejs");
const adminDetailView = read("views/admin-user-detail.ejs");
const arenaSeedSource = read("scripts/seedArenaTestUsers.js");

assert.doesNotMatch(lifecycleSource, /goatArena|ArenaMatch|attackParticipationDays/);
assert.match(arenaControllerSource, /attackParticipationDays/);
assert.doesNotMatch(
  arenaControllerSource,
  /studyStreakDays|minimumStudyStreakDays|studyDaysNeeded/
);
assert.match(ipadSyncSource, /recordIpadLearningEvents\(documents, acceptedClientEventIds\)/);
assert.match(adminServiceSource, /getEffectiveStreak\(student\)/);
assert.match(adminUsersView, /학습 streak/);
assert.match(adminDetailView, /detail\.streak\?\.current/);
assert.match(arenaSeedSource, /const TEST_COUNT_PER_DIVISION = 50/);
assert.match(arenaSeedSource, /const TEST_TOTAL_COUNT = TEST_COUNT_PER_DIVISION \* 2/);
assert.match(arenaSeedSource, /currentStreak,\s*\n\s*longestStreak,\s*\n\s*lastStudyDate: now/);

console.log("Study streak is web/iPad-recorded, admin-visible, and independent from GOAT Arena 15-of-29 participation");

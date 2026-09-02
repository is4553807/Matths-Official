const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const coverage = [
  ["services/accessCycleService.js", "ACCESS_CYCLE_FIRST_DAY"],
  ["services/accessCycleDailyService.js", "ACCESS_CYCLE_DAILY"],
  ["services/accessCycleExpiryReminderService.js", "ACCESS_CYCLE_EXPIRY_REMINDERS"],
  ["services/academyClassworkService.js", "ACADEMY_ASSIGNMENT_DEADLINES"],
  ["services/policyChangeNotificationService.js", "POLICY_CHANGE_NOTIFICATION_DELIVERY"],
  ["services/privateMockExamService.js", "PRIVATE_MOCK_EXAM_STATE"],
  ["services/placementExamService.js", "PLACEMENT_EXAM_EXPIRY"],
  ["services/arenaMatchAttemptService.js", "ARENA_MATCH_TIMERS"],
  ["services/arenaMatchEvidenceService.js", "ARENA_EVIDENCE_RETENTION"],
  ["services/archiveService.js", "ARCHIVE_TRASH_RETENTION"],
  ["services/dataAnalysisAggregationService.js", "DATA_ANALYSIS_MONTHLY"],
  ["services/arenaIntegrityRiskService.js", "ARENA_INTEGRITY_RISK"],
  ["services/arenaOutboxService.js", "ARENA_OUTBOX_DELIVERY"],
  ["middleware/userCloudUploadStorage.js", "USER_CLOUD_TEMP_CLEANUP"],
];

for (const [relativePath, leaseName] of coverage) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.ok(source.includes("withSchedulerLease"), `${relativePath}에 공용 임대 호출이 없습니다.`);
  assert.ok(source.includes(leaseName), `${relativePath}에 ${leaseName} 작업명이 없습니다.`);
}

const seasonSource = fs.readFileSync(path.join(root, "services/arenaSeasonService.js"), "utf8");
assert.ok(seasonSource.includes("SchedulerLease"));
assert.ok(seasonSource.includes("ARENA_SEASON_OPEN"));

console.log(`다중 서버 자동 작업 공용 임대 ${coverage.length}개와 시즌 catch-up 임대 검증 완료`);

const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({
  path: path.join(__dirname, "..", "config.env"),
  quiet: true,
});

const {
  getRankingOperationsDashboard,
  previewFinalRankingRecalculation,
} = require("../services/rankingOperationsService");

async function main() {
  await mongoose.connect(process.env.DB);
  const [dashboard, preview] = await Promise.all([
    getRankingOperationsDashboard(),
    previewFinalRankingRecalculation(),
  ]);
  assert.ok(["HEALTHY", "REVIEW"].includes(dashboard.health.status));
  assert.ok(Number.isInteger(dashboard.health.activeProfileCount));
  assert.ok(Array.isArray(dashboard.history));
  assert.ok(Array.isArray(dashboard.dormancyCandidates));
  assert.equal(typeof dashboard.operations.storage.provider, "string");
  assert.ok(Number.isInteger(preview.totalRows));
  assert.ok(Number.isInteger(preview.changedCount));
  console.log(
    JSON.stringify({
      ok: true,
      activeProfiles: dashboard.health.activeProfileCount,
      alerts: dashboard.health.alerts.length,
      previewChanges: preview.changedCount,
      dormancyCandidates: dashboard.dormancyCandidates.length,
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());

// Explicit prerequisites for verification scripts that expect an existing DB.
// Invoked only by runTests.js with a fresh local replica set and testIsolation preload.
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const requireApp = createRequire(path.join(process.cwd(), "package.json"));
const target = process.argv[2];
async function main() {
  assert.equal(process.env.DB, process.env.PERFORMANCE_TEST_DB);
  assert.match(process.env.DB, /^mongodb:\/\/127\.0\.0\.1:/);
  if (target === "audit/verifyPricingEntitlementDb.js") {
    requireApp(`./${target}`);
    return;
  } else {
    const mongoose = requireApp("mongoose");
    await mongoose.connect(process.env.DB);
    try {
      if (target === "scripts/verifyPrivateMockRestriction.js") {
        await requireApp("./models/matthsModel").User.create({
          name: "launchwarning",
          realName: "격리 검증 사용자",
          email: "launchwarning@offline.test",
          passwordHash: "not-used",
          role: "student",
        });
      } else if (target === "scripts/verifyProblemTypeCatalogDb.js") {
        await requireApp("./services/problemTypeCatalogService").syncProblemTypeRegistry({ activateSourceChanges: false });
      } else if (target === "scripts/verifyStudyHallDb.js") {
        await requireApp("./models/matthsModel").User.create({ name: "fixture-admin", realName: "격리검증", email: "fixture-admin@offline.test", passwordHash: "not-used", role: "admin" });
      } else {
        throw new Error(`No reviewed fixture setup for ${target}`);
      }
    } finally { await mongoose.disconnect(); }
  }
  requireApp(`./${target}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { MongoClient } = require("mongodb");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultTargets = [
  { target: "scripts/verifyAccountDeletionDb.js", dropAfter: true },
  { target: "audit/verifyRefundRejectionDb.js", dropAfter: true },
  { target: "scripts/seedFocusedLaunchTestAccounts.js", dropAfter: false },
  { target: "audit/verifyPricingEntitlementDb.js", dropAfter: true },
  { target: "audit/verifyLiveSupportInquiryDb.js", dropAfter: true },
  { target: "audit/verifyIpadNotificationDb.js", dropAfter: true },
  { target: "audit/verifyIpadArenaCommandDb.js", dropAfter: true },
  { target: "audit/verifyPaybackDailyLearningDb.js", dropAfter: true },
  { target: "audit/verifyAdminUserDataDb.js", dropAfter: true },
  { target: "audit/verifySubDefenseFairnessDb.js", dropAfter: true },
  { target: "audit/verifyMultiProcessSchedulerLease.js", dropAfter: true },
];

function runTarget(target, databaseUri) {
  const manifestPath = path.join(
    os.tmpdir(),
    `matths-memory-audit-${process.pid}-${path.basename(target, ".js")}.json`
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["audit/runInIsolatedAuditEnvironment.js", target],
      {
        cwd: repositoryRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          DB: databaseUri,
          AUDIT_DATABASE_NAME: "matths_audit_zero_assumption_20260815",
          DISABLE_SCHEDULERS: "1",
          ALLOW_TEST_DATA_MUTATION: "1",
          SECRET: "memory-audit-session-secret-that-is-never-used-in-production",
          PAYBACK_ACCOUNT_ENCRYPTION_KEY:
            "memory-audit-payback-key-that-is-never-used-in-production",
          TEST_ACCOUNT_OUTPUT_PATH: manifestPath,
        },
      }
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      fs.rmSync(manifestPath, { force: true });
      if (code === 0) return resolve();
      reject(new Error(
        `${target} 실패${signal ? ` (signal ${signal})` : ` (exit ${code})`}`
      ));
    });
  });
}

async function dropAuditDatabase(databaseUri) {
  const client = new MongoClient(databaseUri);
  try {
    await client.connect();
    await client.db("matths_audit_zero_assumption_20260815").dropDatabase();
  } finally {
    await client.close();
  }
}

async function main() {
  const targets = process.argv.slice(2);
  const selectedTargets = targets.length
    ? targets.map((target) => ({ target, dropAfter: true }))
    : defaultTargets;
  const mongoVersion = process.env.MONGOMS_VERSION || "8.2.6";
  console.log(
    `Starting isolated MongoDB ${mongoVersion} replica set for ${selectedTargets.length} audit(s).`
  );
  const replicaSet = await MongoMemoryReplSet.create({
    binary: { version: mongoVersion },
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
    },
  });
  try {
    const databaseUri = replicaSet.getUri("bootstrap");
    for (let index = 0; index < selectedTargets.length; index += 1) {
      const step = selectedTargets[index];
      const target = step.target;
      console.log(`\n[memory Mongo audit ${index + 1}/${selectedTargets.length}] ${target}`);
      await runTarget(target, databaseUri);
      if (step.dropAfter) await dropAuditDatabase(databaseUri);
    }
  } finally {
    await replicaSet.stop();
  }
  console.log(`\nIsolated memory Mongo suite passed: ${selectedTargets.length} audit(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

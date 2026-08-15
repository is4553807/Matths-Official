const assert = require("node:assert/strict");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");

const { SchedulerLease } = require("../models/operationModel");

function runWorker({ name, startAt }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve(__dirname, "schedulerLeaseProcessWorker.js")],
      {
        env: {
          ...process.env,
          AUDIT_SCHEDULER_LEASE_NAME: name,
          AUDIT_SCHEDULER_START_AT: String(startAt),
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Scheduler worker exited ${code}`));
        return;
      }
      const line = stdout
        .trim()
        .split(/\r?\n/)
        .findLast((item) => item.trim().startsWith("{"));
      resolve(JSON.parse(line || "{}"));
    });
  });
}

async function run() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/
  );
  const name = `SCHEDULER_PROCESS_E2E:${randomUUID()}`;
  await mongoose.connect(process.env.DB);
  try {
    const firstWave = await Promise.all([
      runWorker({ name, startAt: Date.now() + 1_500 }),
      runWorker({ name, startAt: Date.now() + 1_500 }),
    ]);
    assert.equal(firstWave.filter((item) => item.executed).length, 1);
    assert.equal(firstWave.filter((item) => item.skipped).length, 1);
    assert.equal(
      firstWave.find((item) => item.skipped)?.reason,
      "RUNNING_ON_ANOTHER_SERVER"
    );

    const recovered = await runWorker({ name, startAt: Date.now() });
    assert.equal(recovered.executed, true);
    const stored = await SchedulerLease.findOne({ name }).lean();
    assert.ok(stored?.lastCompletedAt);
    assert.equal(stored?.lastResult?.ok, true);
    console.log(
      "Multi-process scheduler lease verification passed: one of two processes executed, the peer skipped, and a later process recovered."
    );
  } finally {
    await SchedulerLease.deleteMany({ name });
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

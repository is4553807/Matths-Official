const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { SchedulerLease } = require("../models/operationModel");
const { withSchedulerLease } = require("../services/schedulerLeaseService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  const name = `SCHEDULER_E2E:${randomUUID()}`;
  let executions = 0;
  const task = async () => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 75));
    return { executions };
  };
  try {
    const firstWave = await Promise.all([
      withSchedulerLease({ name, leaseMs: 10_000 }, task),
      withSchedulerLease({ name, leaseMs: 10_000 }, task),
    ]);
    assert.equal(executions, 1);
    assert.equal(firstWave.filter((result) => result?.skipped).length, 1);
    await withSchedulerLease({ name, leaseMs: 10_000 }, task);
    assert.equal(executions, 2);
    const stored = await SchedulerLease.findOne({ name }).lean();
    assert.ok(stored?.lastCompletedAt);
    assert.equal(stored?.lastResult?.ok, true);
    console.log(JSON.stringify({ ok: true, concurrentExecutions: 1, nextRunRecovered: true }));
  } finally {
    await SchedulerLease.deleteMany({ name });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

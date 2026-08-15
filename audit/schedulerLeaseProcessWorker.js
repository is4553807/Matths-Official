const mongoose = require("mongoose");

const {
  withSchedulerLease,
} = require("../services/schedulerLeaseService");

async function run() {
  const name = String(process.env.AUDIT_SCHEDULER_LEASE_NAME || "");
  const startAt = Number(process.env.AUDIT_SCHEDULER_START_AT || 0);
  if (!name || !Number.isFinite(startAt) || !process.env.DB) {
    throw new Error("Scheduler process audit environment is incomplete.");
  }

  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  try {
    const delayMs = Math.max(0, startAt - Date.now());
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const result = await withSchedulerLease(
      { name, leaseMs: 10_000 },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        return { executed: true };
      }
    );
    process.stdout.write(
      `${JSON.stringify({
        executed: result?.executed === true,
        skipped: result?.skipped === true,
        reason: result?.reason || "",
      })}\n`
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

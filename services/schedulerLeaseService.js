const { randomUUID } = require("node:crypto");
const { SchedulerLease } = require("../models/operationModel");

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

async function acquireSchedulerLease({ name, leaseMs = DEFAULT_LEASE_MS, now = new Date() }) {
  const token = randomUUID();
  const expiresAt = new Date(new Date(now).getTime() + Math.max(5_000, Number(leaseMs) || DEFAULT_LEASE_MS));
  const updated = await SchedulerLease.findOneAndUpdate(
    { name, expiresAt: { $lte: now } },
    { $set: { token, expiresAt } },
    { returnDocument: "after" }
  ).lean();
  if (updated) return { name, token, expiresAt };
  try {
    await SchedulerLease.create({ name, token, expiresAt });
    return { name, token, expiresAt };
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function renewSchedulerLease({ lease, leaseMs = DEFAULT_LEASE_MS }) {
  const expiresAt = new Date(Date.now() + Math.max(5_000, Number(leaseMs) || DEFAULT_LEASE_MS));
  const result = await SchedulerLease.updateOne(
    { name: lease.name, token: lease.token },
    { $set: { expiresAt } }
  );
  return result.modifiedCount === 1;
}

async function releaseSchedulerLease({ lease, result = null, error = null, now = new Date() }) {
  if (!lease) return;
  await SchedulerLease.updateOne(
    { name: lease.name, token: lease.token },
    {
      $set: {
        expiresAt: now,
        lastCompletedAt: now,
        lastResult: error
          ? { ok: false, error: String(error?.message || error).slice(0, 500) }
          : {
              ok: true,
              resultType: Array.isArray(result) ? "array" : typeof result,
              resultCount: Array.isArray(result) ? result.length : undefined,
            },
      },
    }
  );
}

async function withSchedulerLease({ name, leaseMs = DEFAULT_LEASE_MS }, task) {
  const lease = await acquireSchedulerLease({ name, leaseMs });
  if (!lease) return { skipped: true, reason: "RUNNING_ON_ANOTHER_SERVER" };
  let heartbeat = null;
  try {
    heartbeat = setInterval(() => {
      renewSchedulerLease({ lease, leaseMs }).catch((error) => {
        console.error(`스케줄러 임대 갱신 실패 (${name}):`, error.message);
      });
    }, Math.max(1_000, Math.floor(leaseMs / 3)));
    heartbeat.unref?.();
    const result = await task();
    await releaseSchedulerLease({ lease, result });
    return result;
  } catch (error) {
    await releaseSchedulerLease({ lease, error }).catch(() => {});
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

module.exports = {
  DEFAULT_LEASE_MS,
  acquireSchedulerLease,
  releaseSchedulerLease,
  renewSchedulerLease,
  withSchedulerLease,
};

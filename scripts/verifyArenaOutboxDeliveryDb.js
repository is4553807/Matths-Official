const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { ArenaOutboxEvent } = require("../models/goatArenaModel");
const {
  processArenaOutboxEvents,
  registerArenaOutboxHandler,
} = require("../services/arenaOutboxService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  const aggregateId = new mongoose.Types.ObjectId();
  const idempotencyKey = `outbox-e2e:${randomUUID()}`;
  const isolatedUntil = new Date(Date.now() + 5 * 60 * 1000);
  const simulatedWorkerNow = new Date(isolatedUntil.getTime() + 1000);
  let handled = 0;
  try {
    registerArenaOutboxHandler("MainQualifyingActivityRecorded", async (event) => {
      assert.equal(String(event.aggregateId), String(aggregateId));
      handled += 1;
    });
    await ArenaOutboxEvent.create({
      eventType: "MainQualifyingActivityRecorded",
      aggregateType: "ArenaOutboxE2E",
      aggregateId,
      idempotencyKey,
      payload: { verification: true },
      processingToken: "e2e-isolation",
      processingLeaseExpiresAt: isolatedUntil,
    });
    const result = await processArenaOutboxEvents({
      now: simulatedWorkerNow,
      filter: { aggregateId, idempotencyKey },
      limit: 2,
    });
    const stored = await ArenaOutboxEvent.findOne({ idempotencyKey }).lean();
    assert.deepEqual(result, { claimed: 1, published: 1, failed: 0 });
    assert.equal(handled, 1);
    assert.ok(stored.publishedAt);
    assert.equal(stored.processingToken, "");
    assert.equal(stored.publishAttempts, 1);
    console.log(JSON.stringify({ ok: true, claimedOnce: true, published: true }));
  } finally {
    await ArenaOutboxEvent.deleteMany({ idempotencyKey });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

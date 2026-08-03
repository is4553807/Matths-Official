const { randomUUID } = require("node:crypto");
const { ArenaOutboxEvent } = require("../models/goatArenaModel");
const { withSchedulerLease } = require("./schedulerLeaseService");

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_LEASE_MS = 30_000;
const handlers = new Map();
let schedulerTimer = null;
let schedulerRunning = false;

function registerArenaOutboxHandler(eventType, handler) {
  if (typeof handler !== "function") {
    throw new TypeError("Arena outbox 처리 함수가 필요합니다.");
  }
  handlers.set(String(eventType), handler);
}

async function claimNextEvent({ now, leaseMs, filter = {} }) {
  const token = randomUUID();
  const event = await ArenaOutboxEvent.findOneAndUpdate(
    {
      ...filter,
      publishedAt: null,
      $or: [
        { processingLeaseExpiresAt: null },
        { processingLeaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        processingToken: token,
        processingLeaseExpiresAt: new Date(now.getTime() + leaseMs),
        lastPublishError: "",
      },
      $inc: { publishAttempts: 1 },
    },
    { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" }
  ).lean();
  return event ? { event, token } : null;
}

async function acknowledgeEvent({ event, token, now }) {
  const handler = handlers.get(String(event.eventType));
  if (handler) await handler(event);
  const result = await ArenaOutboxEvent.updateOne(
    { _id: event._id, publishedAt: null, processingToken: token },
    {
      $set: {
        publishedAt: now,
        processingToken: "",
        processingLeaseExpiresAt: null,
        lastPublishError: "",
      },
    }
  );
  return result.modifiedCount === 1;
}

async function releaseFailedEvent({ event, token, error }) {
  await ArenaOutboxEvent.updateOne(
    { _id: event._id, publishedAt: null, processingToken: token },
    {
      $set: {
        processingToken: "",
        processingLeaseExpiresAt: null,
        lastPublishError: String(error?.message || error || "이벤트 처리 실패").slice(0, 1000),
      },
    }
  );
}

async function processArenaOutboxEvents({
  now = new Date(),
  limit = 100,
  leaseMs = DEFAULT_LEASE_MS,
  filter = {},
} = {}) {
  const currentTime = new Date(now);
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
  const summary = { claimed: 0, published: 0, failed: 0 };
  for (let index = 0; index < safeLimit; index += 1) {
    const claim = await claimNextEvent({
      now: currentTime,
      leaseMs: Math.max(1000, Number(leaseMs) || DEFAULT_LEASE_MS),
      filter,
    });
    if (!claim) break;
    summary.claimed += 1;
    try {
      const published = await acknowledgeEvent({
        event: claim.event,
        token: claim.token,
        now: currentTime,
      });
      if (published) summary.published += 1;
    } catch (error) {
      summary.failed += 1;
      await releaseFailedEvent({ event: claim.event, token: claim.token, error });
    }
  }
  return summary;
}

async function runArenaOutboxSchedule() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    await processArenaOutboxEvents();
  } finally {
    schedulerRunning = false;
  }
}

function startArenaOutboxScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (schedulerTimer) return schedulerTimer;
  const run = () => withSchedulerLease(
    { name: "ARENA_OUTBOX_DELIVERY", leaseMs: 2 * 60 * 1000 },
    runArenaOutboxSchedule
  );
  run().catch((error) => {
    console.error("Arena 처리 대기 이벤트 초기 처리 실패:", error);
  });
  schedulerTimer = setInterval(() => {
    run().catch((error) => {
      console.error("Arena 처리 대기 이벤트 재처리 실패:", error);
    });
  }, Math.max(1000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  schedulerTimer.unref?.();
  return schedulerTimer;
}

function stopArenaOutboxScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  DEFAULT_LEASE_MS,
  processArenaOutboxEvents,
  registerArenaOutboxHandler,
  startArenaOutboxScheduler,
  stopArenaOutboxScheduler,
};

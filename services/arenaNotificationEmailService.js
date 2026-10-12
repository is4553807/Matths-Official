"use strict";
const { randomUUID } = require("node:crypto");
const { ArenaNotificationEmailDelivery } = require("../models/arenaDeliveryModel");
const { User } = require("../models/matthsModel");

async function enqueueArenaNotificationEmail({ userId, dedupeKey, payload }) {
  try {
    return await ArenaNotificationEmailDelivery.findOneAndUpdate({ dedupeKey }, {
      $setOnInsert: { userId, dedupeKey, payload, status: "PENDING" },
    }, { upsert: true, returnDocument: "after" }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return ArenaNotificationEmailDelivery.findOne({ dedupeKey }).lean();
  }
}

async function processArenaNotificationEmails({ now = new Date(), limit = 20, dedupeKey, sendEmail } = {}) {
  const send = sendEmail || require("./emailService").sendAdminUserEmail;
  // An expired SMTP lease has an unknown outcome: a process might have died
  // after acceptance. Keep it visible for reconciliation, never blindly resend.
  await ArenaNotificationEmailDelivery.updateMany({ status: "SENDING", leaseUntil: { $lte: now } }, {
    $set: { status: "UNKNOWN", leaseToken: "", lastError: "Delivery outcome unknown after worker interruption" },
  });
  const summary = { sent: 0, failed: 0, unknown: 0 };
  for (let i = 0; i < limit; i += 1) {
    const token = randomUUID();
    const job = await ArenaNotificationEmailDelivery.findOneAndUpdate({
      ...(dedupeKey ? { dedupeKey } : {}), status: { $in: ["PENDING", "RETRY"] },
      $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
    }, { $set: { status: "SENDING", leaseToken: token, leaseUntil: new Date(now.getTime() + 120_000) }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" }).select("+payload").lean();
    if (!job) break;
    const filter = { _id: job._id, status: "SENDING", leaseToken: token };
    try {
      const user = await User.findById(job.userId).select("accountStatus").lean();
      if (!user || user.accountStatus === "withdrawn") {
        await ArenaNotificationEmailDelivery.deleteOne(filter);
        continue;
      }
      await send(job.payload);
      await ArenaNotificationEmailDelivery.updateOne(filter, { $set: { status: "SENT", sentAt: now, leaseToken: "", leaseUntil: null, lastError: "" }, $unset: { payload: 1 } });
      summary.sent += 1;
    } catch (error) {
      const unknown = ["ETIMEDOUT", "ECONNRESET", "ESOCKET"].includes(error.code) && !["CONN", "CONNECT"].includes(error.command);
      await ArenaNotificationEmailDelivery.updateOne(filter, { $set: {
        status: unknown ? "UNKNOWN" : "RETRY", leaseToken: "", leaseUntil: null,
        nextAttemptAt: new Date(now.getTime() + Math.min(86_400_000, 60_000 * 2 ** Math.min(10, job.attempts - 1))),
        lastError: String(error.message || "Email delivery failed").slice(0, 1000),
      } });
      summary[unknown ? "unknown" : "failed"] += 1;
    }
  }
  return summary;
}

module.exports = { enqueueArenaNotificationEmail, processArenaNotificationEmails };

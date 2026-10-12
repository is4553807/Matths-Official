"use strict";
const { createHash, randomUUID } = require("node:crypto");
const { ArenaAssetDeletionTask } = require("../models/arenaDeliveryModel");

async function enqueueArenaAssetDeletion({ asset, referenceKey, session }) {
  const plain = typeof asset?.toObject === "function" ? asset.toObject() : asset;
  const key = createHash("sha256").update(JSON.stringify([referenceKey, plain.storageProvider, plain.cloudPublicId, plain.cloudResourceType, plain.cloudDeliveryType, plain.cloudVersion, plain.r2ObjectKey, plain.path || plain.filePath, plain.sha256])).digest("hex");
  await ArenaAssetDeletionTask.updateOne({ key }, {
    $setOnInsert: { key, referenceKey, asset: plain, status: "PENDING" },
  }, { session, upsert: true });
}

async function processArenaAssetDeletionTasks({ now = new Date(), limit = 50, referenceKey, destroy } = {}) {
  const remove = destroy || require("./fileStorageService").destroyStoredAsset;
  let deleted = 0, failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const token = randomUUID();
    const job = await ArenaAssetDeletionTask.findOneAndUpdate({
      ...(referenceKey ? { referenceKey } : {}),
      $and: [
        { $or: [{ status: { $in: ["PENDING", "RETRY"] } }, { status: "DELETING", leaseUntil: { $lte: now } }] },
        { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
      ],
    }, { $set: { status: "DELETING", leaseToken: token, leaseUntil: new Date(now.getTime() + 120000) }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" }).select("+asset").lean();
    if (!job) break;
    const filter = { _id: job._id, status: "DELETING", leaseToken: token };
    try {
      await remove(job.asset);
      await ArenaAssetDeletionTask.updateOne(filter, { $set: { status: "DELETED", deletedAt: now, leaseToken: "", leaseUntil: null, lastError: "" }, $unset: { asset: 1 } });
      deleted += 1;
    } catch (error) {
      await ArenaAssetDeletionTask.updateOne(filter, { $set: { status: "RETRY", leaseToken: "", leaseUntil: null,
        nextAttemptAt: new Date(now.getTime() + Math.min(86400000, 60000 * 2 ** Math.min(10, job.attempts - 1))),
        lastError: String(error.message || "Asset deletion failed").slice(0, 1000) } });
      failed += 1;
    }
  }
  return { deleted, failed };
}

module.exports = { enqueueArenaAssetDeletion, processArenaAssetDeletionTasks };

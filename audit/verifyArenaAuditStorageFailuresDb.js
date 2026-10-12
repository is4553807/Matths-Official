"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
let deletes = 0, mails = 0, storageFails = true, emailFails = true;
const deletesByName = new Map();
require("../services/fileStorageService").destroyStoredAsset = async (record) => { deletes += 1; deletesByName.set(record.storedName, (deletesByName.get(record.storedName) || 0) + 1); if (storageFails === true || storageFails === record.storedName) throw new Error("Injected deletion failure"); };
require("../services/emailService").sendAdminUserEmail = async () => { mails += 1; if (emailFails) throw new Error("Injected email failure"); };
const { ArenaMatch, ArenaMatchEvidence } = require("../models/goatArenaModel");
const { User, UserNotification } = require("../models/matthsModel");
const { ArenaNotificationEmailDelivery } = require("../models/arenaDeliveryModel");
const { purgeExpiredArenaEvidence } = require("../services/arenaMatchEvidenceService");
const { ensureArenaNotification } = require("../services/arenaNotificationService");
const { processArenaNotificationEmails } = require("../services/arenaNotificationEmailService");

async function main() {
  assert.match(process.env.DB, /matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    await ArenaNotificationEmailDelivery.init();
    const now = new Date(), matchId = new mongoose.Types.ObjectId(), evidenceId = new mongoose.Types.ObjectId(), userId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: userId, email: "fixture@example.invalid", accountStatus: "active" });
    await ArenaMatch.collection.insertOne({ _id: matchId, status: "SETTLED", integrityStatus: "CLEAR" });
    await ArenaMatchEvidence.collection.insertOne({ _id: evidenceId, matchId, userId, retentionUntil: new Date(0), contentPurgedAt: null, retentionHoldReason: "", status: "ON_TIME",
      files: [{ storedName: "fixture.png", storageProvider: "CLOUDINARY", cloudPublicId: "fixture-only", sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 1 }] });
    const first = await purgeExpiredArenaEvidence({ now });
    assert.equal(first.failed, 1); assert.equal(first.purged, 0);
    const pending = await ArenaMatchEvidence.findById(evidenceId).lean();
    assert.equal(pending.contentPurgedAt, null); assert.equal(pending.files[0].cloudPublicId, "fixture-only");
    await purgeExpiredArenaEvidence({ now }); assert.equal(deletes, 1);
    storageFails = false;
    const retry = await purgeExpiredArenaEvidence({ now: new Date(now.getTime() + 61_000) });
    assert.equal(retry.purged, 1); assert.equal(deletes, 2);
    assert.ok((await ArenaMatchEvidence.findById(evidenceId).lean()).contentPurgedAt);
    const partialMatchId = new mongoose.Types.ObjectId(), partialEvidenceId = new mongoose.Types.ObjectId();
    await ArenaMatch.collection.insertOne({ _id: partialMatchId, matchKey: "AUDIT-PARTIAL-PURGE", status: "SETTLED", integrityStatus: "CLEAR" });
    await ArenaMatchEvidence.collection.insertOne({ _id: partialEvidenceId, attemptId: new mongoose.Types.ObjectId(), matchId: partialMatchId, userId,
      retentionUntil: new Date(0), contentPurgedAt: null, retentionHoldReason: "", status: "ON_TIME", files: [1, 2].map((index) => ({
        storedName: `partial-${index}.png`, storageProvider: "CLOUDINARY", cloudPublicId: `fixture-partial-${index}`, sha256: String(index).repeat(64), mimeType: "image/png", sizeBytes: 1,
      })) });
    storageFails = "partial-2.png";
    assert.equal((await purgeExpiredArenaEvidence({ now })).failed, 1);
    assert.equal((await ArenaMatchEvidence.findById(partialEvidenceId).lean()).purgeDeletedAssetKeys.length, 1);
    storageFails = false;
    assert.equal((await purgeExpiredArenaEvidence({ now: new Date(now.getTime() + 61000) })).purged, 1);
    assert.equal(deletesByName.get("partial-1.png"), 1, "confirmed individual deletes are not repeated");
    assert.equal(deletesByName.get("partial-2.png"), 2);
    const { enqueueArenaAssetDeletion, processArenaAssetDeletionTasks } = require("../services/arenaAssetDeletionService");
    const { ArenaAssetDeletionTask } = require("../models/arenaDeliveryModel");
    await ArenaAssetDeletionTask.init();
    await enqueueArenaAssetDeletion({ referenceKey: "ACCOUNT_PURGE:fixture", asset: { storedName: "queued.png", storageProvider: "CLOUDINARY", cloudPublicId: "fixture-queued" } });
    storageFails = true;
    assert.equal((await processArenaAssetDeletionTasks({ now })).failed, 1);
    assert.ok((await ArenaAssetDeletionTask.findOne({ referenceKey: "ACCOUNT_PURGE:fixture" }).select("+asset").lean()).asset.cloudPublicId);
    storageFails = false;
    assert.equal((await processArenaAssetDeletionTasks({ now: new Date(now.getTime() + 61000) })).deleted, 1);
    assert.equal((await ArenaAssetDeletionTask.findOne({ referenceKey: "ACCOUNT_PURGE:fixture" }).select("+asset").lean()).asset, undefined);
    const input = { user: { _id: userId, email: "fixture@example.invalid" }, dedupeKey: "audit-email-retry", title: "fixture", message: "fixture", email: true };
    await ensureArenaNotification(input); await ensureArenaNotification(input);
    assert.equal(mails, 1); assert.equal(await UserNotification.countDocuments({ dedupeKey: input.dedupeKey }), 1);
    assert.equal((await ArenaNotificationEmailDelivery.findOne({ dedupeKey: input.dedupeKey }).lean()).status, "RETRY");
    emailFails = false;
    await processArenaNotificationEmails({ now: new Date(now.getTime() + 61_000) });
    assert.equal(mails, 2);
    assert.equal((await ArenaNotificationEmailDelivery.findOne({ dedupeKey: input.dedupeKey }).lean()).status, "SENT");
    await processArenaNotificationEmails({ now: new Date(now.getTime() + 122_000) }); assert.equal(mails, 2);
    console.log("Storage/email fault regressions passed: failed delete keeps provider keys, retries after backoff, and independent email delivery retries without duplicate inbox or successful sends.");
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

const { ArchiveItem } = require("../models/matthsModel");
const ARCHIVE_STORAGE_DIR = path.resolve(
  process.env.ARCHIVE_STORAGE_DIR || path.join(__dirname, "..", "storage", "archive")
);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAILY_BACKUP_HOUR_KST = 3;
const DAILY_BACKUP_MINUTE_KST = 30;
let localStorageBackupTimer = null;

function isR2BackupConfigured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

function r2Client() {
  if (!isR2BackupConfigured()) return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function backupObjectKey(item) {
  const purpose = String(item.storagePurpose || "ADMIN_ARCHIVE").toLowerCase();
  return `matths-admin-files/${purpose}/${String(item._id)}/${path.basename(item.storedName)}`;
}

async function remoteSha256(client, key) {
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
    return String(result.Metadata?.sha256 || "");
  } catch (error) {
    if (["NotFound", "NoSuchKey"].includes(error?.name) || error?.$metadata?.httpStatusCode === 404) {
      return "";
    }
    throw error;
  }
}

async function runLocalStorageR2Backup({ limit = 500 } = {}) {
  if (!isR2BackupConfigured()) {
    return { configured: false, scanned: 0, backedUp: 0, skipped: 0, missing: 0, failed: 0 };
  }

  const client = r2Client();
  const items = await ArchiveItem.find({
    storageProvider: "LOCAL",
    storagePurpose: { $in: ["ADMIN_ARCHIVE", "ADMIN_WEEKLY_MOCK", "GENERIC"] },
  })
    .sort({ backedUpAt: 1, createdAt: 1 })
    .limit(Math.max(1, Math.min(5000, Number(limit) || 500)))
    .lean();
  const summary = {
    configured: true,
    scanned: items.length,
    backedUp: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  };

  for (const item of items) {
    const filePath = path.resolve(ARCHIVE_STORAGE_DIR, path.basename(item.storedName || ""));
    if (path.dirname(filePath) !== ARCHIVE_STORAGE_DIR || !fs.existsSync(filePath)) {
      summary.missing += 1;
      await ArchiveItem.updateOne(
        { _id: item._id },
        { $set: { backupStatus: "FAILED", backupError: "로컬 원본 파일을 찾을 수 없습니다." } }
      );
      continue;
    }

    try {
      const sha256 = await sha256File(filePath);
      const key = backupObjectKey(item);
      if (item.backupSha256 === sha256 && (await remoteSha256(client, key)) === sha256) {
        summary.skipped += 1;
        continue;
      }
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: fs.createReadStream(filePath),
          ContentType: item.mimeType || "application/octet-stream",
          Metadata: {
            sha256,
            archiveitemid: String(item._id),
            storagepurpose: String(item.storagePurpose || "ADMIN_ARCHIVE"),
          },
        })
      );
      await ArchiveItem.updateOne(
        { _id: item._id },
        {
          $set: {
            backupProvider: "R2",
            backupObjectKey: key,
            backupSha256: sha256,
            backupStatus: "BACKED_UP",
            backedUpAt: new Date(),
            backupError: "",
          },
        }
      );
      summary.backedUp += 1;
    } catch (error) {
      summary.failed += 1;
      await ArchiveItem.updateOne(
        { _id: item._id },
        {
          $set: {
            backupStatus: "FAILED",
            backupError: String(error?.message || "R2 백업 실패").slice(0, 500),
          },
        }
      );
    }
  }

  client.destroy();
  return summary;
}

async function deleteR2BackupObject(item) {
  if (item?.backupProvider !== "R2" || !item?.backupObjectKey) {
    return { deleted: false, reason: "NO_R2_BACKUP" };
  }
  if (!isR2BackupConfigured()) {
    const error = new Error("R2 백업 원본을 삭제하려면 R2 연결 정보가 필요합니다.");
    error.code = "R2_BACKUP_DELETE_CONFIGURATION_REQUIRED";
    throw error;
  }
  const client = r2Client();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: item.backupObjectKey,
      })
    );
  } finally {
    client.destroy();
  }
  return { deleted: true };
}

function millisecondsUntilNextKstBackup(now = new Date()) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  let nextUtcMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    DAILY_BACKUP_HOUR_KST,
    DAILY_BACKUP_MINUTE_KST
  ) - KST_OFFSET_MS;
  if (nextUtcMs <= now.getTime()) nextUtcMs += 24 * 60 * 60 * 1000;
  return nextUtcMs - now.getTime();
}

function startLocalStorageBackupScheduler() {
  if (process.env.DISABLE_SCHEDULERS === "1" || localStorageBackupTimer) return null;
  const scheduleNext = () => {
    localStorageBackupTimer = setTimeout(async () => {
      try {
        await runLocalStorageR2Backup();
      } catch (error) {
        console.error("Local storage R2 backup failed:", error.message);
      } finally {
        localStorageBackupTimer = null;
        scheduleNext();
      }
    }, millisecondsUntilNextKstBackup());
    localStorageBackupTimer.unref?.();
  };
  scheduleNext();
  return localStorageBackupTimer;
}

module.exports = {
  backupObjectKey,
  deleteR2BackupObject,
  isR2BackupConfigured,
  millisecondsUntilNextKstBackup,
  runLocalStorageR2Backup,
  startLocalStorageBackupScheduler,
};

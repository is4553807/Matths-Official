const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { pipeline } = require("node:stream/promises");
const { randomUUID } = require("node:crypto");

const { ArchiveItem } = require("../models/matthsModel");
const { withSchedulerLease } = require("./schedulerLeaseService");
const ARCHIVE_STORAGE_DIR = path.resolve(
  process.env.ARCHIVE_STORAGE_DIR || path.join(__dirname, "..", "storage", "archive")
);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAILY_BACKUP_HOUR_KST = 3;
const DAILY_BACKUP_MINUTE_KST = 30;
let localStorageBackupTimer = null;
let localStorageBackupSoonTimer = null;

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

async function downloadAndVerifyR2Backup({ item, destinationPath }) {
  if (item?.backupProvider !== "R2" || !item?.backupObjectKey || !item?.backupSha256) {
    const error = new Error("검증 가능한 R2 백업 메타데이터가 없습니다.");
    error.code = "R2_BACKUP_METADATA_REQUIRED";
    throw error;
  }
  if (!isR2BackupConfigured()) {
    const error = new Error("R2 복원에는 R2 연결 정보가 필요합니다.");
    error.code = "R2_RESTORE_CONFIGURATION_REQUIRED";
    throw error;
  }
  const targetPath = path.resolve(destinationPath);
  const temporaryPath = `${targetPath}.restore-${randomUUID()}.tmp`;
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const client = r2Client();
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: item.backupObjectKey })
    );
    if (!object.Body) throw new Error("R2 백업 본문을 읽을 수 없습니다.");
    await pipeline(object.Body, fs.createWriteStream(temporaryPath, { flags: "wx" }));
    const restoredSha256 = await sha256File(temporaryPath);
    if (restoredSha256 !== item.backupSha256) {
      const error = new Error("R2 복원 파일의 SHA-256이 백업 원장과 일치하지 않습니다.");
      error.code = "R2_RESTORE_HASH_MISMATCH";
      throw error;
    }
    await fs.promises.rename(temporaryPath, targetPath);
    return { restored: true, sha256: restoredSha256, destinationPath: targetPath };
  } finally {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    client.destroy();
  }
}

async function restoreArchiveItemFromR2({ itemId, overwrite = false }) {
  const item = await ArchiveItem.findOne({
    _id: itemId,
    storageProvider: "LOCAL",
    backupProvider: "R2",
    backupStatus: "BACKED_UP",
  }).lean();
  if (!item) throw new Error("복원 가능한 운영자 파일 백업을 찾을 수 없습니다.");
  const destinationPath = path.resolve(ARCHIVE_STORAGE_DIR, path.basename(item.storedName || ""));
  if (path.dirname(destinationPath) !== ARCHIVE_STORAGE_DIR) {
    throw new Error("복원 대상 경로가 운영자 파일 저장소 밖입니다.");
  }
  if (fs.existsSync(destinationPath) && !overwrite) {
    return { restored: false, reason: "LOCAL_ORIGINAL_EXISTS", itemId: String(item._id) };
  }
  const result = await downloadAndVerifyR2Backup({ item, destinationPath });
  await ArchiveItem.updateOne(
    { _id: item._id },
    { $set: { backupError: "", lastRestoredAt: new Date() } }
  );
  return { ...result, itemId: String(item._id) };
}

async function verifyR2RestoreDrill({ itemId = null } = {}) {
  const query = {
    storageProvider: "LOCAL",
    backupProvider: "R2",
    backupStatus: "BACKED_UP",
    backupSha256: { $ne: "" },
  };
  if (itemId) query._id = itemId;
  const item = await ArchiveItem.findOne(query).sort({ backedUpAt: -1 }).lean();
  if (!item) return { checked: false, reason: "NO_BACKED_UP_FILE" };
  const verificationDir = path.resolve(
    process.env.USER_CLOUD_UPLOAD_TEMP_DIR || path.join(__dirname, "..", "storage", "tmp"),
    "r2-restore-check"
  );
  const destinationPath = path.join(verificationDir, `${item._id}-${randomUUID()}.verify`);
  try {
    const result = await downloadAndVerifyR2Backup({ item, destinationPath });
    return { checked: true, itemId: String(item._id), sha256: result.sha256 };
  } finally {
    await fs.promises.unlink(destinationPath).catch(() => {});
  }
}

async function restoreMissingLocalFilesFromR2({ limit = 50 } = {}) {
  const items = await ArchiveItem.find({
    storageProvider: "LOCAL",
    backupProvider: "R2",
    backupStatus: "BACKED_UP",
    deletedAt: null,
  })
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Math.min(500, Number(limit) || 50)))
    .lean();
  const summary = { scanned: items.length, restored: 0, existing: 0, failed: 0 };
  for (const item of items) {
    const destinationPath = path.resolve(ARCHIVE_STORAGE_DIR, path.basename(item.storedName || ""));
    if (path.dirname(destinationPath) !== ARCHIVE_STORAGE_DIR) {
      summary.failed += 1;
      continue;
    }
    if (fs.existsSync(destinationPath)) {
      summary.existing += 1;
      continue;
    }
    try {
      await restoreArchiveItemFromR2({ itemId: item._id });
      summary.restored += 1;
    } catch (error) {
      summary.failed += 1;
      await ArchiveItem.updateOne(
        { _id: item._id },
        { $set: { backupError: String(error?.message || "R2 복원 실패").slice(0, 500) } }
      );
    }
  }
  return summary;
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
        await withSchedulerLease(
          { name: "LOCAL_STORAGE_R2_BACKUP", leaseMs: 60 * 60 * 1000 },
          () => runLocalStorageR2Backup()
        );
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

function scheduleLocalStorageR2BackupSoon({ delayMs = 10_000 } = {}) {
  if (
    process.env.DISABLE_SCHEDULERS === "1" ||
    !isR2BackupConfigured() ||
    localStorageBackupSoonTimer
  ) {
    return localStorageBackupSoonTimer;
  }
  localStorageBackupSoonTimer = setTimeout(async () => {
    try {
      await withSchedulerLease(
        { name: "LOCAL_STORAGE_R2_BACKUP", leaseMs: 60 * 60 * 1000 },
        () => runLocalStorageR2Backup()
      );
    } catch (error) {
      console.error("Immediate local storage R2 backup failed:", error.message);
    } finally {
      localStorageBackupSoonTimer = null;
    }
  }, Math.max(1_000, Number(delayMs) || 10_000));
  localStorageBackupSoonTimer.unref?.();
  return localStorageBackupSoonTimer;
}

module.exports = {
  backupObjectKey,
  deleteR2BackupObject,
  downloadAndVerifyR2Backup,
  isR2BackupConfigured,
  millisecondsUntilNextKstBackup,
  runLocalStorageR2Backup,
  restoreArchiveItemFromR2,
  restoreMissingLocalFilesFromR2,
  scheduleLocalStorageR2BackupSoon,
  startLocalStorageBackupScheduler,
  verifyR2RestoreDrill,
};

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const multer = require("multer");
const { withSchedulerLease } = require("../services/schedulerLeaseService");

const USER_CLOUD_UPLOAD_TEMP_DIR = path.resolve(
  process.env.USER_CLOUD_UPLOAD_TEMP_DIR ||
    path.join(os.tmpdir(), "matths-user-cloud")
);
const USER_CLOUD_UPLOAD_TEMP_RETENTION_MS = 24 * 60 * 60 * 1000;
const USER_CLOUD_UPLOAD_TEMP_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let userCloudUploadCleanupTimer = null;

fs.mkdirSync(USER_CLOUD_UPLOAD_TEMP_DIR, { recursive: true });

const userCloudUploadStorage = multer.diskStorage({
  destination(_req, _file, callback) {
    callback(null, USER_CLOUD_UPLOAD_TEMP_DIR);
  },
  filename(_req, file, callback) {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    callback(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});

async function purgeStaleUserCloudUploadTemps({ now = new Date() } = {}) {
  const entries = await fs.promises
    .readdir(USER_CLOUD_UPLOAD_TEMP_DIR, { withFileTypes: true })
    .catch(() => []);
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const filePath = path.resolve(USER_CLOUD_UPLOAD_TEMP_DIR, entry.name);
    if (path.dirname(filePath) !== USER_CLOUD_UPLOAD_TEMP_DIR) continue;
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (!stats || now.getTime() - stats.mtimeMs < USER_CLOUD_UPLOAD_TEMP_RETENTION_MS) {
      continue;
    }
    await fs.promises.unlink(filePath).catch(() => {});
    deleted += 1;
  }
  return { scanned: entries.length, deleted };
}

function startUserCloudUploadTempCleanupScheduler() {
  if (process.env.DISABLE_SCHEDULERS === "1" || userCloudUploadCleanupTimer) {
    return null;
  }
  const run = () => withSchedulerLease(
    { name: "USER_CLOUD_TEMP_CLEANUP", leaseMs: 30 * 60 * 1000 },
    () => purgeStaleUserCloudUploadTemps()
  );
  run().catch((error) => {
    console.error("User cloud upload temp cleanup failed:", error.message);
  });
  userCloudUploadCleanupTimer = setInterval(() => {
    run().catch((error) => {
      console.error("User cloud upload temp cleanup failed:", error.message);
    });
  }, USER_CLOUD_UPLOAD_TEMP_CLEANUP_INTERVAL_MS);
  userCloudUploadCleanupTimer.unref?.();
  return userCloudUploadCleanupTimer;
}

module.exports = {
  purgeStaleUserCloudUploadTemps,
  startUserCloudUploadTempCleanupScheduler,
  USER_CLOUD_UPLOAD_TEMP_DIR,
  USER_CLOUD_UPLOAD_TEMP_RETENTION_MS,
  userCloudUploadStorage,
};

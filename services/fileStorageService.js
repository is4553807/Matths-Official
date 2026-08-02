const fs = require("node:fs");
const path = require("node:path");
const { v2: cloudinary } = require("cloudinary");

const STORAGE_PURPOSES = Object.freeze({
  GENERIC: "GENERIC",
  ADMIN_ARCHIVE: "ADMIN_ARCHIVE",
  ADMIN_WEEKLY_MOCK: "ADMIN_WEEKLY_MOCK",
  USER_COMMUNITY: "USER_COMMUNITY",
  USER_ARENA_EVIDENCE: "USER_ARENA_EVIDENCE",
  USER_PRIVATE_MOCK_INTEGRITY: "USER_PRIVATE_MOCK_INTEGRITY",
});

const STORAGE_POLICIES = Object.freeze({
  [STORAGE_PURPOSES.ADMIN_ARCHIVE]: {
    provider: "local",
    requiresPersistentDisk: true,
  },
  [STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK]: {
    provider: "local",
    requiresPersistentDisk: true,
  },
  [STORAGE_PURPOSES.USER_COMMUNITY]: {
    provider: "cloudinary",
    requiresCloudinary: true,
  },
  [STORAGE_PURPOSES.USER_ARENA_EVIDENCE]: {
    provider: "cloudinary",
    requiresCloudinary: true,
  },
  [STORAGE_PURPOSES.USER_PRIVATE_MOCK_INTEGRITY]: {
    provider: "cloudinary",
    requiresCloudinary: true,
  },
});

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET)
  );
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) return false;
  const config = { secure: true };
  if (!process.env.CLOUDINARY_URL) {
    config.cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    config.api_key = process.env.CLOUDINARY_API_KEY;
    config.api_secret = process.env.CLOUDINARY_API_SECRET;
  }
  cloudinary.config(config);
  return true;
}

function storagePolicyFor(purpose = STORAGE_PURPOSES.GENERIC) {
  const normalizedPurpose = String(purpose || STORAGE_PURPOSES.GENERIC).trim().toUpperCase();
  return {
    purpose: STORAGE_PURPOSES[normalizedPurpose] || normalizedPurpose,
    ...(STORAGE_POLICIES[normalizedPurpose] || {}),
  };
}

function requestedProvider(purpose = STORAGE_PURPOSES.GENERIC) {
  const policy = storagePolicyFor(purpose);
  if (policy.provider) return policy.provider;
  const requested = String(process.env.FILE_STORAGE_PROVIDER || "").trim().toLowerCase();
  if (requested === "local" || requested === "cloudinary") return requested;
  return isCloudinaryConfigured() ? "cloudinary" : "local";
}

function resourceTypeFor(file) {
  const mimeType = String(file?.mimetype || file?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "video";
  return "raw";
}

function getLocalStorageCapacity(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const stats = fs.statfsSync(directory);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    return {
      totalBytes,
      availableBytes,
      usedBytes,
      usedPercent: Math.round(usedPercent * 10) / 10,
      level:
        usedPercent >= 95
          ? "BLOCKED"
          : usedPercent >= 85
            ? "WARNING"
            : usedPercent >= 70
              ? "NOTICE"
              : "NORMAL",
    };
  } catch (error) {
    return {
      totalBytes: 0,
      availableBytes: 0,
      usedBytes: 0,
      usedPercent: null,
      level: "UNKNOWN",
    };
  }
}

function storageFields(asset = {}) {
  return {
    storageProvider: asset.storageProvider || "LOCAL",
    storagePurpose: asset.storagePurpose || STORAGE_PURPOSES.GENERIC,
    cloudPublicId: asset.cloudPublicId || "",
    cloudResourceType: asset.cloudResourceType || "",
    cloudDeliveryType: asset.cloudDeliveryType || "",
    cloudVersion: asset.cloudVersion ?? null,
    cloudFormat: asset.cloudFormat || "",
  };
}

async function storeUploadedFile(
  file,
  {
    folder = "matths/user-uploads",
    localDirectory = null,
    purpose = STORAGE_PURPOSES.GENERIC,
  } = {}
) {
  if (!file) return null;
  if (file.storageAsset) return file.storageAsset;
  const policy = storagePolicyFor(purpose);
  const provider = requestedProvider(policy.purpose);
  if (provider === "local") {
    if (
      policy.requiresPersistentDisk &&
      process.env.NODE_ENV === "production" &&
      process.env.LOCAL_STORAGE_PERSISTENT !== "1"
    ) {
      const error = new Error(
        "운영자 파일을 보관할 영구 디스크 확인이 필요합니다. LOCAL_STORAGE_PERSISTENT=1 설정을 확인해주세요."
      );
      error.status = 503;
      error.code = "PERSISTENT_LOCAL_STORAGE_REQUIRED";
      throw error;
    }
    if (localDirectory) {
      const expectedDirectory = path.resolve(localDirectory);
      const capacity = getLocalStorageCapacity(expectedDirectory);
      if (capacity.level === "BLOCKED") {
        const error = new Error(
          "운영자 파일 저장소 사용량이 95% 이상이어서 신규 업로드를 차단했습니다. 백업과 디스크 용량을 확인해주세요."
        );
        error.status = 507;
        error.code = "LOCAL_STORAGE_CAPACITY_BLOCKED";
        throw error;
      }
      const actualPath = path.resolve(String(file.path || ""));
      if (!actualPath || path.dirname(actualPath) !== expectedDirectory) {
        const error = new Error("로컬 파일 저장 경로가 허용된 운영자 저장소와 일치하지 않습니다.");
        error.status = 500;
        error.code = "LOCAL_STORAGE_PATH_MISMATCH";
        throw error;
      }
    }
    file.storageAsset = {
      storageProvider: "LOCAL",
      storagePurpose: policy.purpose,
      storedName: String(file.filename || path.basename(file.path || "")),
    };
    return file.storageAsset;
  }
  if (!configureCloudinary()) {
    const error = new Error("Cloudinary 연결 정보가 없습니다.");
    error.status = 503;
    error.code = "CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }
  const resourceType = resourceTypeFor(file);
  const result = await cloudinary.uploader.upload(file.path, {
    resource_type: resourceType,
    type: "authenticated",
    folder,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  });
  const asset = {
    storageProvider: "CLOUDINARY",
    storagePurpose: policy.purpose,
    storedName: String(file.filename || path.basename(file.path || result.public_id)),
    cloudPublicId: result.public_id,
    cloudResourceType: result.resource_type || resourceType,
    cloudDeliveryType: result.type || "authenticated",
    cloudVersion: Number(result.version) || null,
    cloudFormat:
      result.format || path.extname(String(file.originalname || "")).slice(1).toLowerCase(),
  };
  file.storageAsset = asset;
  await fs.promises.unlink(file.path).catch(() => {});
  return asset;
}

function cloudAssetFromRecord(record = {}) {
  if (record.storageProvider !== "CLOUDINARY" || !record.cloudPublicId) return null;
  return {
    storageProvider: "CLOUDINARY",
    storagePurpose: record.storagePurpose || STORAGE_PURPOSES.GENERIC,
    cloudPublicId: record.cloudPublicId,
    cloudResourceType: record.cloudResourceType || "raw",
    cloudDeliveryType: record.cloudDeliveryType || "authenticated",
    cloudVersion: record.cloudVersion || null,
    cloudFormat: record.cloudFormat || "",
  };
}

function signedCloudinaryUrl(record, { download = false, originalName = "file" } = {}) {
  const asset = cloudAssetFromRecord(record);
  if (!asset || !configureCloudinary()) return null;
  if (download) {
    return cloudinary.utils.private_download_url(
      asset.cloudPublicId,
      asset.cloudFormat || undefined,
      {
        resource_type: asset.cloudResourceType,
        type: asset.cloudDeliveryType,
        attachment: path.basename(String(originalName || "file")),
        expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
      }
    );
  }
  return cloudinary.url(asset.cloudPublicId, {
    secure: true,
    sign_url: true,
    resource_type: asset.cloudResourceType,
    type: asset.cloudDeliveryType,
    version: asset.cloudVersion || undefined,
    format: asset.cloudFormat || undefined,
  });
}

async function destroyStoredAsset(record = {}) {
  const asset = cloudAssetFromRecord(record.storageAsset || record);
  if (asset && configureCloudinary()) {
    await cloudinary.uploader.destroy(asset.cloudPublicId, {
      resource_type: asset.cloudResourceType,
      type: asset.cloudDeliveryType,
      invalidate: true,
    });
    return;
  }
  const localPath = record.path || record.filePath;
  if (localPath) await fs.promises.unlink(localPath).catch(() => {});
}

function getFileStorageStatus() {
  const provider = requestedProvider();
  const persistentLocalReady =
    process.env.NODE_ENV !== "production" || process.env.LOCAL_STORAGE_PERSISTENT === "1";
  const purposes = Object.fromEntries(
    Object.values(STORAGE_PURPOSES)
      .filter((purpose) => purpose !== STORAGE_PURPOSES.GENERIC)
      .map((purpose) => {
        const purposeProvider = requestedProvider(purpose);
        return [
          purpose,
          {
            provider: purposeProvider,
            configured:
              purposeProvider === "cloudinary"
                ? isCloudinaryConfigured()
                : persistentLocalReady,
          },
        ];
      })
  );
  const r2BackupConfigured = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
  const defaultLocalDirectory = path.resolve(
    process.env.ARCHIVE_STORAGE_DIR || path.join(__dirname, "..", "storage", "archive")
  );
  return {
    provider,
    configured: provider === "local" || isCloudinaryConfigured(),
    privateDelivery: provider === "cloudinary",
    productionSafe: isCloudinaryConfigured() && persistentLocalReady,
    mode: "split",
    persistentLocalReady,
    r2BackupConfigured,
    localCapacity: getLocalStorageCapacity(defaultLocalDirectory),
    purposes,
  };
}

module.exports = {
  cloudAssetFromRecord,
  destroyStoredAsset,
  getFileStorageStatus,
  getLocalStorageCapacity,
  isCloudinaryConfigured,
  signedCloudinaryUrl,
  STORAGE_POLICIES,
  STORAGE_PURPOSES,
  storagePolicyFor,
  storageFields,
  storeUploadedFile,
};

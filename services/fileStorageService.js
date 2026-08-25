const fs = require("node:fs");
const path = require("node:path");
const { v2: cloudinary } = require("cloudinary");
const {
  createR2ObjectKey,
  deleteR2Object,
  isR2Configured,
  signedR2Url,
  uploadLocalFileToR2,
} = require("./r2ObjectStorageService");

const STORAGE_PURPOSES = Object.freeze({
  GENERIC: "GENERIC",
  ADMIN_ARCHIVE: "ADMIN_ARCHIVE",
  ADMIN_WEEKLY_MOCK: "ADMIN_WEEKLY_MOCK",
  USER_COMMUNITY: "USER_COMMUNITY",
  USER_PROFILE_AVATAR: "USER_PROFILE_AVATAR",
  USER_ARENA_EVIDENCE: "USER_ARENA_EVIDENCE",
  USER_PRIVATE_MOCK_INTEGRITY: "USER_PRIVATE_MOCK_INTEGRITY",
});

const STORAGE_POLICIES = Object.freeze({
  [STORAGE_PURPOSES.ADMIN_ARCHIVE]: {
    provider: "r2",
    requiresR2: true,
  },
  [STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK]: {
    provider: "r2",
    requiresR2: true,
  },
  [STORAGE_PURPOSES.USER_COMMUNITY]: {
    provider: "cloudinary",
    requiresCloudinary: true,
  },
  [STORAGE_PURPOSES.USER_PROFILE_AVATAR]: {
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
  if (["local", "cloudinary", "r2"].includes(requested)) return requested;
  return isCloudinaryConfigured() ? "cloudinary" : "local";
}

function resourceTypeFor(file) {
  const mimeType = String(file?.mimetype || file?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "video";
  return "raw";
}

function storageFields(asset = {}) {
  return {
    storageProvider: asset.storageProvider || "R2",
    storagePurpose: asset.storagePurpose || STORAGE_PURPOSES.GENERIC,
    cloudPublicId: asset.cloudPublicId || "",
    cloudResourceType: asset.cloudResourceType || "",
    cloudDeliveryType: asset.cloudDeliveryType || "",
    cloudVersion: asset.cloudVersion ?? null,
    cloudFormat: asset.cloudFormat || "",
    r2ObjectKey: asset.r2ObjectKey || "",
    r2Sha256: asset.r2Sha256 || "",
    r2ETag: asset.r2ETag || "",
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
    const error = new Error("로컬 원본 저장은 지원하지 않습니다. R2 또는 Cloudinary 저장소를 설정해주세요.");
    error.status = 503;
    error.code = "PERSISTENT_LOCAL_STORAGE_DISABLED";
    throw error;
  }
  if (provider === "r2") {
    if (!isR2Configured()) {
      const error = new Error("R2 저장소 연결 정보가 없습니다.");
      error.status = 503;
      error.code = "R2_STORAGE_NOT_CONFIGURED";
      throw error;
    }
    const objectKey = createR2ObjectKey({
      namespace: folder,
      ownerId: policy.purpose,
      kind: resourceTypeFor(file),
      originalName: file.originalname,
    });
    const stored = await uploadLocalFileToR2({
      filePath: file.path,
      objectKey,
      contentType: file.mimetype || "application/octet-stream",
      metadata: { storagepurpose: String(policy.purpose).toLowerCase() },
    });
    const asset = {
      storageProvider: "R2",
      storagePurpose: policy.purpose,
      storedName: String(file.filename || path.basename(file.path || objectKey)),
      r2ObjectKey: stored.r2ObjectKey,
      r2Sha256: stored.r2Sha256,
      r2ETag: stored.r2ETag,
    };
    file.storageAsset = asset;
    await fs.promises.unlink(file.path).catch(() => {});
    return asset;
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
  const source = record.storageAsset || record;
  if (source?.storageProvider === "R2" && source?.r2ObjectKey) {
    await deleteR2Object(source.r2ObjectKey);
    return;
  }
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

async function signedStoredAssetUrl(record, options = {}) {
  if (record?.storageProvider === "R2") return signedR2Url(record, options);
  return signedCloudinaryUrl(record, options);
}

function getFileStorageStatus() {
  const provider = requestedProvider();
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
                : purposeProvider === "r2"
                  ? isR2Configured()
                  : false,
          },
        ];
      })
  );
  const r2BackupConfigured = isR2Configured();
  return {
    provider,
    configured:
      provider === "r2"
          ? isR2Configured()
          : isCloudinaryConfigured(),
    privateDelivery: provider === "cloudinary" || provider === "r2",
    productionSafe: isCloudinaryConfigured() && isR2Configured(),
    mode: "split",
    persistentLocalReady: false,
    r2BackupConfigured,
    localCapacity: {
      totalBytes: 0,
      availableBytes: 0,
      usedBytes: 0,
      usedPercent: null,
      level: "TEMPORARY_ONLY",
    },
    purposes,
  };
}

module.exports = {
  cloudAssetFromRecord,
  destroyStoredAsset,
  getFileStorageStatus,
  isCloudinaryConfigured,
  signedCloudinaryUrl,
  signedStoredAssetUrl,
  STORAGE_POLICIES,
  STORAGE_PURPOSES,
  storagePolicyFor,
  storageFields,
  storeUploadedFile,
};

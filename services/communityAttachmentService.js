const fs = require("fs");
const path = require("path");
const {
  destroyStoredAsset,
  signedCloudinaryUrl,
  STORAGE_PURPOSES,
  storageFields,
  storeUploadedFile,
} = require("./fileStorageService");

const COMMUNITY_STORAGE_DIR =
  path.resolve(
    process.env
      .COMMUNITY_STORAGE_DIR ||
      path.join(
        __dirname,
        "..",
        "storage",
        "community"
      )
  );
const COMMUNITY_ATTACHMENT_LIMIT =
  5;
const COMMUNITY_ATTACHMENT_MAX_BYTES =
  25 * 1024 * 1024;
const COMMUNITY_IMAGE_MAX_BYTES =
  10 * 1024 * 1024;
const COMMUNITY_ATTACHMENT_TOTAL_MAX_BYTES =
  50 * 1024 * 1024;
const COMMUNITY_ATTACHMENT_EXTENSIONS =
  new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".hwp",
    ".hwpx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".zip",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".heic",
  ]);
const COMMUNITY_IMAGE_EXTENSIONS =
  new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".heic",
  ]);
const COMMUNITY_SAFE_MIME_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".hwp":
    "application/x-hwp",
  ".hwpx":
    "application/vnd.hancom.hwpx",
  ".xls":
    "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt":
    "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

function repairCommunityFilename(
  value
) {
  const original = String(
    value || ""
  );
  if (!original) return "file";

  const decoded = Buffer.from(
    original,
    "latin1"
  ).toString("utf8");
  const originalDamage =
    (
      original.match(
        /\uFFFD/g
      ) || []
    ).length;
  const decodedDamage =
    (
      decoded.match(
        /\uFFFD/g
      ) || []
    ).length;
  const looksBroken =
    /[\u0080-\u009f]|Ã|Â|á[\u0080-\u00bf]|\uFFFD/.test(
      original
    );
  const recoveredHangul =
    /[가-힣]/.test(decoded) &&
    !/[가-힣]/.test(original);

  return (
    decodedDamage <=
      originalDamage &&
    (looksBroken || recoveredHangul)
      ? decoded
      : original
  ).normalize("NFC");
}

function safeCommunityAttachmentPath(
  storedName
) {
  const cleanStoredName =
    path.basename(
      String(storedName || "")
    );
  const resolvedPath =
    path.resolve(
      COMMUNITY_STORAGE_DIR,
      cleanStoredName
    );

  if (
    !cleanStoredName ||
    path.dirname(resolvedPath) !==
      COMMUNITY_STORAGE_DIR
  ) {
    return null;
  }

  return resolvedPath;
}

function isCommunityImage(
  attachment
) {
  return (
    String(
      attachment?.mimeType || ""
    ).startsWith("image/") &&
    COMMUNITY_IMAGE_EXTENSIONS.has(
      path.extname(
        String(
          attachment?.originalName ||
          attachment?.storedName ||
          ""
        )
      ).toLowerCase()
    )
  );
}

async function serializeCommunityUpload(
  file
) {
  const extension =
    path.extname(
      String(
        file?.originalname || ""
      )
    ).toLowerCase();
  const asset = await storeUploadedFile(file, {
    folder: "matths/community",
    purpose: STORAGE_PURPOSES.USER_COMMUNITY,
  });
  return {
    originalName:
      repairCommunityFilename(
        file?.originalname
      ).slice(0, 255),
    storedName:
      String(asset?.storedName || file?.filename || ""),
    mimeType:
      COMMUNITY_SAFE_MIME_TYPES[
        extension
      ] ||
      "application/octet-stream",
    sizeBytes:
      Math.max(
        1,
        Number(file?.size) || 1
      ),
    uploadedAt: new Date(),
    ...storageFields(asset),
  };
}

async function discardCommunityUploads(
  files = []
) {
  await Promise.all(
    (Array.isArray(files)
      ? files
      : []
    ).map(async (file) => {
      const filePath =
        file?.path ||
        safeCommunityAttachmentPath(
          file?.storedName
        );

      if (
        file?.storageAsset?.storageProvider === "CLOUDINARY" ||
        file?.storageProvider === "CLOUDINARY"
      ) {
        await destroyStoredAsset(file.storageAsset || file).catch(() => {});
        return;
      }
      if (filePath) await fs.promises.unlink(filePath).catch(() => {});
    })
  );
}

function communityAttachmentCloudUrl(attachment, { download = false } = {}) {
  return signedCloudinaryUrl(attachment, {
    download,
    originalName: attachment?.originalName,
  });
}

module.exports = {
  COMMUNITY_ATTACHMENT_EXTENSIONS,
  COMMUNITY_ATTACHMENT_LIMIT,
  COMMUNITY_ATTACHMENT_MAX_BYTES,
  COMMUNITY_ATTACHMENT_TOTAL_MAX_BYTES,
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_STORAGE_DIR,
  discardCommunityUploads,
  communityAttachmentCloudUrl,
  isCommunityImage,
  safeCommunityAttachmentPath,
  serializeCommunityUpload,
};

const path = require("node:path");
const multer = require("multer");
const {
  userCloudUploadStorage,
} = require("./userCloudUploadStorage");
const {
  discardRequestUploads,
  validateRequestUploads,
} = require("./uploadContentValidation");

const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PROFILE_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const profileAvatarUpload = multer({
  storage: userCloudUploadStorage,
  limits: {
    files: 1,
    fileSize: PROFILE_AVATAR_MAX_BYTES,
  },
  fileFilter(_req, file, callback) {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const mimeType = String(file.mimetype || "").toLowerCase();
    if (
      !PROFILE_AVATAR_EXTENSIONS.has(extension) ||
      !PROFILE_AVATAR_MIME_TYPES.has(mimeType)
    ) {
      const error = new Error("프로필 사진은 JPG, PNG 또는 WEBP 파일만 올릴 수 있습니다.");
      error.status = 400;
      error.code = "PROFILE_AVATAR_TYPE_NOT_ALLOWED";
      return callback(error);
    }
    return callback(null, true);
  },
});

function normalizeUploadError(error) {
  if (error?.code === "LIMIT_FILE_SIZE") {
    const sizeError = new Error("프로필 사진은 5MB 이하로 올려 주세요.");
    sizeError.status = 413;
    sizeError.code = "PROFILE_AVATAR_TOO_LARGE";
    return sizeError;
  }
  if (error?.code === "LIMIT_UNEXPECTED_FILE" || error?.code === "LIMIT_FILE_COUNT") {
    const countError = new Error("프로필 사진은 한 장만 선택할 수 있습니다.");
    countError.status = 400;
    countError.code = "PROFILE_AVATAR_FILE_COUNT";
    return countError;
  }
  if (error) error.status = Number(error.status) || 400;
  return error;
}

function handleProfileAvatarUpload(req, res, next) {
  profileAvatarUpload.single("profileImage")(req, res, async (uploadError) => {
    if (uploadError) {
      await discardRequestUploads(req);
      req.file = undefined;
      req.profileAvatarUploadError = normalizeUploadError(uploadError);
      return next();
    }

    if (!req.file) return next();

    try {
      await validateRequestUploads(req, {
        maxTotalBytes: PROFILE_AVATAR_MAX_BYTES,
      });
    } catch (validationError) {
      await discardRequestUploads(req);
      req.file = undefined;
      req.profileAvatarUploadError = normalizeUploadError(validationError);
    }
    return next();
  });
}

module.exports = {
  handleProfileAvatarUpload,
  PROFILE_AVATAR_EXTENSIONS,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_MIME_TYPES,
};

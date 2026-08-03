const path = require("node:path");
const multer = require("multer");
const {
  USER_CLOUD_UPLOAD_TEMP_DIR,
  userCloudUploadStorage,
} = require("./userCloudUploadStorage");

const ARENA_EVIDENCE_STORAGE_DIR = USER_CLOUD_UPLOAD_TEMP_DIR;

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
]);

const arenaEvidenceUpload = multer({
  storage: userCloudUploadStorage,
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      const error = new Error(
        "풀이 증거는 JPG, PNG, WEBP 또는 HEIC 이미지로 제출해주세요."
      );
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

module.exports = {
  ARENA_EVIDENCE_STORAGE_DIR,
  arenaEvidenceUpload,
};

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const multer = require("multer");

const ARENA_EVIDENCE_STORAGE_DIR = path.resolve(
  process.env.ARENA_EVIDENCE_STORAGE_DIR ||
    path.join(__dirname, "..", "storage", "arena-evidence")
);

fs.mkdirSync(ARENA_EVIDENCE_STORAGE_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
]);

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    callback(null, ARENA_EVIDENCE_STORAGE_DIR);
  },
  filename(_req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});

const arenaEvidenceUpload = multer({
  storage,
  limits: {
    files: 5,
    fileSize: 15 * 1024 * 1024,
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

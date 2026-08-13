const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const multer = require("multer");

const PDF_FORENSICS_UPLOAD_DIR = path.join(os.tmpdir(), "matths-pdf-forensics");
fs.mkdirSync(PDF_FORENSICS_UPLOAD_DIR, { recursive: true });

const ALLOWED_FORENSIC_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/heic", ".heic"],
  ["image/heif", ".heif"],
]);

const pdfForensicsUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      callback(null, PDF_FORENSICS_UPLOAD_DIR);
    },
    filename(_req, file, callback) {
      const extension = ALLOWED_FORENSIC_TYPES.get(String(file.mimetype || "").toLowerCase()) ||
        path.extname(String(file.originalname || "")).toLowerCase() ||
        ".upload";
      callback(null, `${Date.now()}-${randomUUID()}${extension}`);
    },
  }),
  limits: {
    files: 1,
    fileSize: Math.max(
      1024 * 1024,
      Number(process.env.PDF_FORENSICS_MAX_BYTES) || 50 * 1024 * 1024
    ),
  },
  fileFilter(_req, file, callback) {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"]);
    if (!ALLOWED_FORENSIC_TYPES.has(mimeType) && !allowedExtensions.has(extension)) {
      const error = new Error("PDF 또는 PNG·JPG·WEBP·HEIC 스크린샷만 유출 추적 분석에 올릴 수 있습니다.");
      error.status = 422;
      error.code = "PDF_FORENSICS_FILE_TYPE";
      return callback(error);
    }
    return callback(null, true);
  },
});

module.exports = { ALLOWED_FORENSIC_TYPES, PDF_FORENSICS_UPLOAD_DIR, pdfForensicsUpload };

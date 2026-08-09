const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const multer = require("multer");

const STORE_UPLOAD_TEMP_DIR = path.resolve(
  process.env.STORE_UPLOAD_TEMP_DIR || path.join(os.tmpdir(), "matths-store-uploads")
);

fs.mkdirSync(STORE_UPLOAD_TEMP_DIR, { recursive: true });

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PRODUCT_EXTENSIONS = new Set([
  ".pdf", ".zip", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
]);

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    callback(null, STORE_UPLOAD_TEMP_DIR);
  },
  filename(_req, file, callback) {
    callback(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const storeUpload = multer({
  storage,
  limits: { files: 32, fileSize: 500 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    const imageField = ["thumbnail", "detailImages", "studyThumbnail"].includes(file.fieldname);
    const pdfField = ["questionPdf", "solutionPdf"].includes(file.fieldname);
    const allowed = imageField
      ? IMAGE_EXTENSIONS.has(extension) && IMAGE_MIME_TYPES.has(String(file.mimetype || "").toLowerCase())
      : pdfField
        ? extension === ".pdf" && String(file.mimetype || "").toLowerCase() === "application/pdf"
        : PRODUCT_EXTENSIONS.has(extension);
    if (!allowed) {
      const error = new Error(
        imageField
          ? "썸네일과 상세 이미지는 PNG, JPG 또는 WEBP만 올릴 수 있습니다."
          : pdfField
            ? "문제지와 해설지는 PDF만 올릴 수 있습니다."
            : "수험관 연결 자료는 PDF, ZIP 또는 문서 파일만 올릴 수 있습니다."
      );
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

function handleStoreUpload(req, res, next) {
  storeUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "detailImages", maxCount: 20 },
    { name: "productFiles", maxCount: 20 },
    { name: "studyThumbnail", maxCount: 1 },
    { name: "questionPdf", maxCount: 1 },
    { name: "solutionPdf", maxCount: 1 },
    { name: "contentFiles", maxCount: 20 },
  ])(req, res, (error) => {
    if (error) {
      error.status = error.status || 400;
      return next(error);
    }
    return next();
  });
}

module.exports = { STORE_UPLOAD_TEMP_DIR, handleStoreUpload };

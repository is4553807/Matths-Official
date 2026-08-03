const fs = require("fs");
const path = require("path");
const {
  randomUUID,
} = require("crypto");
const multer = require("multer");
const {
  userCloudUploadStorage,
} = require("./userCloudUploadStorage");

const {
  ARCHIVE_STORAGE_DIR,
} = require("../services/archiveService");

fs.mkdirSync(
  ARCHIVE_STORAGE_DIR,
  {
    recursive: true,
  }
);

const ADMIN_ARCHIVE_EXTENSIONS =
  new Set([
    ".pdf",
    ".doc",
    ".docx",
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
    ".json",
  ]);

const ADMIN_WEEKLY_MOCK_EXTENSIONS = new Set([
  ".pdf",
  ".json",
]);

const ADMIN_FORMULA_EXTENSIONS = new Set([
  ".pdf",
]);

const USER_INTEGRITY_EVIDENCE_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".heic",
]);

const adminStorage =
  multer.diskStorage({
    destination(
      req,
      file,
      callback
    ) {
      callback(
        null,
        ARCHIVE_STORAGE_DIR
      );
    },
    filename(
      req,
      file,
      callback
    ) {
      const extension =
        path.extname(
          file.originalname
        ).toLowerCase();
      callback(
        null,
        `${Date.now()}-${randomUUID()}${extension}`
      );
    },
  });

function createArchiveUpload({ extensions, files, fileSize, errorMessage, storage = adminStorage }) {
  return multer({
    storage,
    limits: {
      files,
      fileSize,
    },
    fileFilter(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase();
      if (!extensions.has(extension)) {
        const error = new Error(errorMessage);
        error.status = 400;
        return callback(error);
      }
      return callback(null, true);
    },
  });
}

const adminArchiveUpload = createArchiveUpload({
  extensions: ADMIN_ARCHIVE_EXTENSIONS,
  files: 20,
  fileSize: 500 * 1024 * 1024,
  errorMessage:
    "아카이브에는 PDF, 문서, 스프레드시트, 프레젠테이션, ZIP, JSON 또는 이미지 파일만 올릴 수 있습니다.",
});

const adminWeeklyMockUpload = createArchiveUpload({
  extensions: ADMIN_WEEKLY_MOCK_EXTENSIONS,
  files: 30,
  fileSize: 100 * 1024 * 1024,
  errorMessage: "Matths 주간 공식 모의고사는 PDF와 채점용 JSON 파일만 올릴 수 있습니다.",
});

const adminFormulaUpload = createArchiveUpload({
  extensions: ADMIN_FORMULA_EXTENSIONS,
  files: 1,
  fileSize: 100 * 1024 * 1024,
  errorMessage: "공식 암기 자료는 PDF 파일로 올려주세요.",
});

const userIntegrityEvidenceUpload = createArchiveUpload({
  extensions: USER_INTEGRITY_EVIDENCE_EXTENSIONS,
  files: 10,
  fileSize: 10 * 1024 * 1024,
  errorMessage: "소명 자료는 PDF, JPG, PNG, WEBP 또는 HEIC 파일로 올려주세요.",
  storage: userCloudUploadStorage,
});

module.exports = {
  adminArchiveUpload,
  adminFormulaUpload,
  adminWeeklyMockUpload,
  userIntegrityEvidenceUpload,
};

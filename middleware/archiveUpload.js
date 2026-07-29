const fs = require("fs");
const path = require("path");
const {
  randomUUID,
} = require("crypto");
const multer = require("multer");

const {
  ARCHIVE_STORAGE_DIR,
} = require("../services/archiveService");

fs.mkdirSync(
  ARCHIVE_STORAGE_DIR,
  {
    recursive: true,
  }
);

const ALLOWED_EXTENSIONS =
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

const storage =
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

module.exports = multer({
  storage,
  limits: {
    files: 60,
    fileSize:
      30 * 1024 * 1024,
  },
  fileFilter(
    req,
    file,
    callback
  ) {
    const extension =
      path.extname(
        file.originalname
      ).toLowerCase();

    if (
      !ALLOWED_EXTENSIONS.has(
        extension
      )
    ) {
      const error = new Error(
        "PDF, 문서, 스프레드시트, 프레젠테이션, ZIP 또는 이미지 파일만 올릴 수 있습니다."
      );
      error.status = 400;
      return callback(error);
    }

    return callback(null, true);
  },
});

const path = require("node:path");
const multer = require("multer");
const { userCloudUploadStorage } = require("./userCloudUploadStorage");
const {
  discardRequestUploads,
  validateRequestUploads,
} = require("./uploadContentValidation");

const ACADEMY_ASSIGNMENT_EXTENSIONS = new Set([
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
]);

function normalizeUploadError(error) {
  if (error?.code === "LIMIT_FILE_SIZE") {
    const sizeError = new Error("과제 파일은 파일당 30MB 이하로 올려 주세요.");
    sizeError.status = 413;
    sizeError.code = "ACADEMY_ASSIGNMENT_TOO_LARGE";
    return sizeError;
  }
  if (error?.code === "LIMIT_UNEXPECTED_FILE" || error?.code === "LIMIT_FILE_COUNT") {
    const countError = new Error("한 주차에는 과제 파일을 최대 10개까지 올릴 수 있습니다.");
    countError.status = 400;
    countError.code = "ACADEMY_ASSIGNMENT_FILE_COUNT";
    return countError;
  }
  if (error) error.status = Number(error.status) || 400;
  return error;
}

const academyAssignmentUpload = multer({
  storage: userCloudUploadStorage,
  limits: { files: 10, fileSize: 30 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    if (!ACADEMY_ASSIGNMENT_EXTENSIONS.has(extension)) {
      const error = new Error("과제는 PDF, 문서, 스프레드시트, 프레젠테이션, ZIP 또는 이미지 파일만 올릴 수 있습니다.");
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

function handleAcademyAssignmentUpload(req, _res, next) {
  academyAssignmentUpload.array("assignmentFiles", 10)(req, _res, async (uploadError) => {
    try {
      if (uploadError) throw uploadError;
      await validateRequestUploads(req, { maxTotalBytes: 100 * 1024 * 1024 });
    } catch (error) {
      await discardRequestUploads(req);
      req.files = [];
      req.academyAssignmentUploadError = normalizeUploadError(error);
    }
    return next();
  });
}

module.exports = {
  ACADEMY_ASSIGNMENT_EXTENSIONS,
  handleAcademyAssignmentUpload,
  normalizeUploadError,
};

const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_JSON_BYTES = 10 * 1024 * 1024;

const EXPECTED_FAMILY = new Map([
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".png", "png"],
  [".webp", "webp"],
  [".heic", "heif"],
  [".heif", "heif"],
  [".pdf", "pdf"],
  [".zip", "zip"],
  [".doc", "cfb"],
  [".xls", "cfb"],
  [".ppt", "cfb"],
  [".hwp", "cfb"],
  [".docx", "zip"],
  [".xlsx", "zip"],
  [".pptx", "zip"],
  [".hwpx", "zip"],
  [".json", "json"],
]);

const CANONICAL_MIME = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".pdf", "application/pdf"],
  [".zip", "application/zip"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".hwp", "application/x-hwp"],
  [".hwpx", "application/vnd.hancom.hwpx"],
  [".json", "application/json"],
]);

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requestFiles(req) {
  const uploaded = [];
  if (req.file) uploaded.push(req.file);
  if (Array.isArray(req.files)) uploaded.push(...req.files);
  else if (req.files && typeof req.files === "object") {
    uploaded.push(...Object.values(req.files).flat().filter(Boolean));
  }
  return [...new Set(uploaded.filter(Boolean))];
}

async function fileSize(file) {
  const declared = Number(file?.size);
  if (Number.isSafeInteger(declared) && declared >= 0) return declared;
  const stat = await fs.promises.stat(file.path);
  return stat.size;
}

async function readHeader(filePath, bytes = 64) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function isZipHeader(buffer) {
  return (
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
  );
}

function isHeifHeader(buffer) {
  if (buffer.length < 16 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const brands = buffer.subarray(8).toString("ascii");
  return /(?:heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(brands);
}

function detectedBinaryFamily(buffer) {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "webp";
  if (isHeifHeader(buffer)) return "heif";
  if (isZipHeader(buffer)) return "zip";
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return "cfb";
  }
  return "unknown";
}

async function validateJsonFile(file) {
  const size = await fileSize(file);
  if (size > MAX_JSON_BYTES) {
    throw statusError(413, "JSON 파일은 10MB 이하로 올려주세요.", "UPLOAD_JSON_TOO_LARGE");
  }
  let source;
  try {
    source = await fs.promises.readFile(file.path, "utf8");
    JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (_error) {
    throw statusError(422, "내용을 읽을 수 있는 올바른 JSON 파일만 올릴 수 있습니다.", "UPLOAD_JSON_INVALID");
  }
}

async function validateDecodableImage(file, family) {
  if (family === "heif") return;
  try {
    const options = {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    };
    const metadata = await sharp(file.path, options).metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new Error("invalid image dimensions");
    }
    await sharp(file.path, options)
      .resize({ width: 1, height: 1, fit: "inside", withoutEnlargement: true })
      .toBuffer();
  } catch (_error) {
    throw statusError(
      422,
      "파일 확장자는 이미지이지만 실제 이미지 내용을 읽을 수 없습니다.",
      "UPLOAD_IMAGE_DECODE_FAILED"
    );
  }
}

async function validateUploadedFile(file) {
  if (!file?.path) {
    throw statusError(422, "업로드된 임시 파일을 확인할 수 없습니다.", "UPLOAD_FILE_MISSING");
  }
  const extension = path.extname(String(file.originalname || file.filename || "")).toLowerCase();
  const expectedFamily = EXPECTED_FAMILY.get(extension);
  if (!expectedFamily) {
    throw statusError(422, "허용되지 않은 파일 형식입니다.", "UPLOAD_EXTENSION_NOT_ALLOWED");
  }

  if (expectedFamily === "json") {
    await validateJsonFile(file);
  } else {
    const family = detectedBinaryFamily(await readHeader(file.path));
    if (family !== expectedFamily) {
      throw statusError(
        422,
        "파일 확장자와 실제 파일 형식이 일치하지 않습니다.",
        "UPLOAD_CONTENT_TYPE_MISMATCH"
      );
    }
    if (["jpeg", "png", "webp", "heif"].includes(family)) {
      await validateDecodableImage(file, family);
    }
  }

  file.mimetype = CANONICAL_MIME.get(extension) || "application/octet-stream";
  file.contentValidated = true;
  return file;
}

async function discardRequestUploads(req) {
  await Promise.all(
    requestFiles(req).map((file) =>
      file?.path ? fs.promises.unlink(file.path).catch(() => {}) : null
    )
  );
}

async function validateRequestUploads(req, { maxTotalBytes = 100 * 1024 * 1024 } = {}) {
  const files = requestFiles(req);
  const sizes = await Promise.all(files.map(fileSize));
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  if (totalBytes > maxTotalBytes) {
    throw statusError(
      413,
      `한 번에 올리는 파일의 전체 용량은 ${Math.floor(maxTotalBytes / 1024 / 1024)}MB 이하여야 합니다.`,
      "UPLOAD_TOTAL_SIZE_EXCEEDED"
    );
  }
  for (const file of files) await validateUploadedFile(file);
  return files;
}

function createUploadContentValidator(options = {}) {
  return async (req, _res, next) => {
    try {
      await validateRequestUploads(req, options);
      return next();
    } catch (error) {
      await discardRequestUploads(req);
      req.file = undefined;
      req.files = Array.isArray(req.files) ? [] : {};
      return next(error);
    }
  };
}

module.exports = {
  createUploadContentValidator,
  detectedBinaryFamily,
  discardRequestUploads,
  requestFiles,
  validateRequestUploads,
  validateUploadedFile,
};

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { pipeline } = require("node:stream/promises");

let sharedClient = null;

function isR2Configured() {
  return Boolean(
    String(process.env.R2_ACCOUNT_ID || "").trim() &&
      String(process.env.R2_ACCESS_KEY_ID || "").trim() &&
      String(process.env.R2_SECRET_ACCESS_KEY || "").trim() &&
      String(process.env.R2_BUCKET || "").trim()
  );
}

function assertR2Configured() {
  if (isR2Configured()) return;
  const error = new Error(
    "R2 저장소 연결 정보가 없습니다. R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET을 확인해주세요."
  );
  error.status = 503;
  error.code = "R2_STORAGE_NOT_CONFIGURED";
  throw error;
}

function getR2Client() {
  assertR2Configured();
  if (!sharedClient) {
    sharedClient = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return sharedClient;
}

function safeKeySegment(value, fallback = "asset") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function createR2ObjectKey({ namespace, ownerId = "shared", kind = "file", originalName = "file" }) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = path.extname(String(originalName || "")).toLowerCase().slice(0, 16);
  return [
    "matths",
    safeKeySegment(namespace, "files"),
    safeKeySegment(ownerId, "shared"),
    safeKeySegment(kind, "file"),
    year,
    month,
    `${randomUUID()}${extension}`,
  ].join("/");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function uploadLocalFileToR2({
  filePath,
  objectKey,
  contentType = "application/octet-stream",
  metadata = {},
}) {
  assertR2Configured();
  const absolutePath = path.resolve(String(filePath || ""));
  const stats = await fs.promises.stat(absolutePath);
  if (!stats.isFile()) throw new Error("R2에 업로드할 파일을 찾을 수 없습니다.");
  const sha256 = await sha256File(absolutePath);
  const result = await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: objectKey,
      Body: fs.createReadStream(absolutePath),
      ContentLength: stats.size,
      ContentType: contentType,
      Metadata: {
        ...metadata,
        sha256,
      },
    })
  );
  return {
    storageProvider: "R2",
    r2ObjectKey: objectKey,
    r2Sha256: sha256,
    r2ETag: String(result.ETag || "").replace(/^"|"$/g, ""),
    sizeBytes: stats.size,
  };
}

async function deleteR2Object(objectKey) {
  if (!objectKey) return { deleted: false };
  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: String(objectKey) })
  );
  return { deleted: true };
}

async function downloadR2ObjectToFile(record, destinationPath) {
  if (record?.storageProvider !== "R2" || !record?.r2ObjectKey) {
    throw new Error("R2에서 내려받을 파일 정보를 확인할 수 없습니다.");
  }
  assertR2Configured();
  const result = await getR2Client().send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: record.r2ObjectKey })
  );
  if (!result.Body) throw new Error("R2 원본 파일의 응답 본문이 없습니다.");
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(result.Body, fs.createWriteStream(destinationPath, { flags: "wx" }));
  return {
    contentType: result.ContentType || record.mimeType || "application/octet-stream",
    sizeBytes: Number(result.ContentLength || 0),
  };
}

async function r2ObjectExists(objectKey, expectedSha256 = "") {
  if (!objectKey) return false;
  try {
    const head = await getR2Client().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: String(objectKey) })
    );
    return !expectedSha256 || String(head.Metadata?.sha256 || "") === String(expectedSha256);
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(error?.name)) {
      return false;
    }
    throw error;
  }
}

function contentDisposition({ download, originalName }) {
  const mode = download ? "attachment" : "inline";
  const encoded = encodeURIComponent(path.basename(String(originalName || "matths-file")));
  return `${mode}; filename*=UTF-8''${encoded}`;
}

async function signedR2Url(
  record,
  { download = false, originalName = "matths-file", expiresIn = 300 } = {}
) {
  if (record?.storageProvider !== "R2" || !record?.r2ObjectKey) return null;
  assertR2Configured();
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: record.r2ObjectKey,
    ResponseContentType: record.mimeType || "application/octet-stream",
    ResponseContentDisposition: contentDisposition({ download, originalName }),
  });
  return getSignedUrl(getR2Client(), command, {
    expiresIn: Math.max(60, Math.min(900, Number(expiresIn) || 300)),
  });
}

module.exports = {
  assertR2Configured,
  createR2ObjectKey,
  deleteR2Object,
  downloadR2ObjectToFile,
  getR2Client,
  isR2Configured,
  r2ObjectExists,
  safeKeySegment,
  sha256File,
  signedR2Url,
  uploadLocalFileToR2,
};

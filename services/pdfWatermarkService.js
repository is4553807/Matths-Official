const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} = require("node:crypto");
const mongoose = require("mongoose");
const sharp = require("sharp");
const { createWorker, OEM, PSM } = require("tesseract.js");
const englishOcrData = require("@tesseract.js-data/eng");
const {
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  degrees,
  rgb,
} = require("pdf-lib");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const { ArenaMatchAttempt } = require("../models/goatArenaModel");
const {
  DOWNLOAD_AI_WATERMARK,
  buildArenaMatchIntegrityWatermark,
} = require("./contentProtectionWatermarkPolicy");
const { downloadR2ObjectToFile } = require("./r2ObjectStorageService");
const { signedStoredAssetUrl } = require("./fileStorageService");

const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024;
const FORENSIC_PREFIX = "MTHS1";
const TRACE_PATTERN = /MTH-[A-F0-9]{16}/g;
const TOKEN_PATTERN = /MTHS1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const GENERATED_TEMP_PREFIX = "matths-pdf-";
const FORENSICS_TEMP_DIRECTORY = path.join(os.tmpdir(), "matths-pdf-forensics");
const DEFAULT_TEMP_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_PIXELS = 40 * 1000 * 1000;
const IMAGE_OCR_ROTATIONS = [0, 7, -7, 31, -31];
const IMAGE_OCR_THRESHOLDS = [245, 248, 248, 248, 251];
const MAX_ARENA_ATTEMPT_FORENSIC_SCAN = 20000;
let imageOcrWorkerPromise = null;
let imageOcrQueue = Promise.resolve();

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function watermarkSecret() {
  const secret = String(process.env.DOCUMENT_WATERMARK_SECRET || process.env.SECRET || "");
  if (secret.length < 16) {
    throw statusError(
      503,
      "PDF 개인 식별 발급용 서버 비밀키가 준비되지 않았습니다.",
      "PDF_WATERMARK_SECRET_MISSING"
    );
  }
  return secret;
}

function hmacHex(value) {
  return createHmac("sha256", watermarkSecret()).update(String(value), "utf8").digest("hex");
}

function signedPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", watermarkSecret()).update(encoded, "utf8").digest("base64url");
  return `${FORENSIC_PREFIX}.${encoded}.${signature}`;
}

function decodeSignedPayload(token) {
  const [prefix, encoded, signature] = String(token || "").split(".");
  if (prefix !== FORENSIC_PREFIX || !encoded || !signature) return null;
  const expected = createHmac("sha256", watermarkSecret()).update(encoded, "utf8").digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch (_error) {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload?.v === 1 && payload?.issuance_id ? payload : null;
  } catch (_error) {
    return null;
  }
}

function formatKstCompact(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} KST`;
}

function safeDownloadName(originalName) {
  const base = path.basename(String(originalName || "matths-document.pdf"));
  const stem = path.basename(base, path.extname(base)).slice(0, 180) || "matths-document";
  return `${stem}_MATTHS_개인발급.pdf`;
}

function textFromPdfObject(value) {
  if (!value) return "";
  if (typeof value.decodeText === "function") {
    try {
      return value.decodeText();
    } catch (_error) {
      return "";
    }
  }
  return String(value || "");
}

function mapIssuanceForAdmin(issuance, extra = {}) {
  return {
    issuanceId: issuance.issuanceId,
    documentIssueId: issuance.documentIssueId,
    traceCode: issuance.traceCode,
    userId: String(issuance.userId?._id || issuance.userId || ""),
    // Matths의 닉네임은 User.username이 아니라 User.name에 저장된다.
    // 과거 호환 필드만 읽으면 정상 계정도 "미등록"으로 표시된다.
    username: issuance.userId?.name || issuance.userId?.username || "",
    email: issuance.userId?.email || "",
    name: issuance.userId?.name || "",
    examId: issuance.examId,
    sourceType: issuance.sourceType,
    sourceId: issuance.sourceId,
    originalName: issuance.originalName,
    downloadedAt: issuance.downloadedAt,
    pageCount: issuance.pageCount,
    ...extra,
  };
}

async function getImageOcrWorker() {
  if (!imageOcrWorkerPromise) {
    imageOcrWorkerPromise = createWorker(englishOcrData.code, OEM.LSTM_ONLY, {
      langPath: englishOcrData.langPath,
      gzip: englishOcrData.gzip,
      cachePath: path.join(os.tmpdir(), "matths-tesseract-cache"),
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-: ",
        preserve_interword_spaces: "1",
      });
      return worker;
    }).catch((error) => {
      imageOcrWorkerPromise = null;
      throw error;
    });
  }
  return imageOcrWorkerPromise;
}

function runImageOcr(imageBytes) {
  const job = imageOcrQueue
    .catch(() => undefined)
    .then(async () => {
      const worker = await getImageOcrWorker();
      const result = await worker.recognize(imageBytes);
      return String(result?.data?.text || "");
    });
  imageOcrQueue = job;
  return job;
}

async function closeForensicImageOcrWorker() {
  const pendingWorker = imageOcrWorkerPromise;
  imageOcrWorkerPromise = null;
  imageOcrQueue = Promise.resolve();
  if (!pendingWorker) return;
  const worker = await pendingWorker.catch(() => null);
  if (worker) await worker.terminate();
}

function normalizeOcrHex(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[OQ]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/Z/g, "2")
    .replace(/G/g, "6")
    .replace(/T/g, "7")
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 20);
}

function extractOcrTraceCandidates(text) {
  const candidates = new Map();
  for (const rawLine of String(text || "").toUpperCase().split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const markerAt = line.lastIndexOf("MTH");
    if (markerAt < 0) continue;
    const tail = line.slice(markerAt + 3).replace(/^[\s:-]+/, "");
    const beforeTimestamp = tail.split(/\b20\d{2}(?:[-/.]|\s)|\bKST\b|\bMATTHS\b/)[0];
    const rawCode = beforeTimestamp.replace(/[^A-Z0-9]/g, "").slice(0, 24);
    const normalizedCode = normalizeOcrHex(rawCode);
    if (normalizedCode.length < 6) continue;
    const existing = candidates.get(normalizedCode);
    candidates.set(normalizedCode, {
      rawCode,
      normalizedCode,
      occurrences: Number(existing?.occurrences || 0) + 1,
    });
  }
  return [...candidates.values()].sort((left, right) =>
    right.normalizedCode.length - left.normalizedCode.length ||
    right.occurrences - left.occurrences
  );
}

function extractOcrArenaTraceCandidates(text) {
  const candidates = new Map();
  for (const rawLine of String(text || "").toUpperCase().split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const markerAt = line.lastIndexOf("ARM");
    if (markerAt < 0) continue;
    const tail = line.slice(markerAt + 3).replace(/^[\s:-]+/, "");
    const beforeContext = tail.split(
      /\b(?:MATCH|ACTIVE|CHALLENGER|DEFENDER|GOAT|ARENA|PROHIBITED)\b/
    )[0];
    const rawCode = beforeContext.replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const normalizedCode = normalizeOcrHex(rawCode).slice(0, 12);
    if (normalizedCode.length < 6) continue;
    const existing = candidates.get(normalizedCode);
    candidates.set(normalizedCode, {
      rawCode,
      normalizedCode,
      occurrences: Number(existing?.occurrences || 0) + 1,
    });
  }
  return [...candidates.values()].sort((left, right) =>
    right.normalizedCode.length - left.normalizedCode.length ||
    right.occurrences - left.occurrences
  );
}

function levenshteinDistance(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const row = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = above;
    }
  }
  return row[b.length];
}

function scoreOcrCandidate(candidateCode, traceCode) {
  const candidate = normalizeOcrHex(candidateCode);
  const target = normalizeOcrHex(String(traceCode || "").replace(/^MTH-?/i, ""));
  if (candidate.length < 6 || target.length !== 16) return 0;
  if (candidate === target) return 1;
  if (target.includes(candidate) || candidate.includes(target)) {
    return Math.max(0.72, 1 - Math.abs(target.length - candidate.length) * 0.035);
  }
  const distance = levenshteinDistance(candidate, target);
  const commonPrefix = [...candidate].findIndex((character, index) => target[index] !== character);
  const prefixLength = commonPrefix < 0 ? Math.min(candidate.length, target.length) : commonPrefix;
  if (prefixLength < 3 || distance > Math.max(3, Math.ceil(target.length * 0.25))) return 0;
  return Math.max(0, 1 - distance / Math.max(candidate.length, target.length));
}

function scoreArenaOcrCandidate(candidateCode, traceCode) {
  const candidate = normalizeOcrHex(candidateCode).slice(0, 12);
  const target = normalizeOcrHex(String(traceCode || "").replace(/^ARM-?/i, "")).slice(0, 12);
  if (candidate.length < 6 || target.length !== 12) return 0;
  if (candidate === target) return 1;
  if (target.includes(candidate) || candidate.includes(target)) {
    return Math.max(0.74, 1 - Math.abs(target.length - candidate.length) * 0.045);
  }
  const distance = levenshteinDistance(candidate, target);
  const commonPrefix = [...candidate].findIndex((character, index) => target[index] !== character);
  const prefixLength = commonPrefix < 0 ? Math.min(candidate.length, target.length) : commonPrefix;
  if (prefixLength < 3 || distance > 3) return 0;
  return Math.max(0, 1 - distance / Math.max(candidate.length, target.length));
}

function mapArenaAttemptForAdmin(attempt, ranked, traceCode) {
  const user = attempt.userId || {};
  const userId = String(user?._id || user || "");
  const matchId = String(attempt.matchId?._id || attempt.matchId || "");
  return {
    issuanceId: "",
    documentIssueId: `ARENA-ATTEMPT-${String(attempt._id)}`,
    traceCode,
    userId,
    username: user?.name || user?.username || "",
    email: user?.email || "",
    name: user?.name || "",
    examId: matchId,
    sourceType: "ARENA_MATCH",
    sourceId: matchId,
    originalName: "GOAT Arena 1대1 경기 화면",
    downloadedAt: attempt.startedAt || attempt.createdAt || null,
    signatureVerified: false,
    recognitionMethod: "ARENA_IMAGE_OCR",
    ocrConfidence: ranked.score,
    matchedCandidate: ranked.candidate.rawCode,
    matchId,
    attemptId: String(attempt._id),
    role: attempt.role,
    attemptStatus: attempt.status,
  };
}

function matchArenaCandidatesToAttempts(candidates, attempts) {
  return attempts
    .map((attempt) => {
      const traceCode = attempt.integrityWatermarkTraceCode ||
        buildArenaMatchIntegrityWatermark({
          matchId: attempt.matchId,
          userId: attempt.userId?._id || attempt.userId,
          attemptId: attempt._id,
          role: attempt.role,
        }).traceCode;
      const ranked = candidates
        .map((candidate) => ({
          candidate,
          score: scoreArenaOcrCandidate(candidate.normalizedCode, traceCode),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (!ranked || ranked.score < 0.74) return null;
      return mapArenaAttemptForAdmin(attempt, ranked, traceCode);
    })
    .filter(Boolean)
    .sort((left, right) => right.ocrConfidence - left.ocrConfidence)
    .slice(0, 20);
}

async function lookupArenaScreenshotAttempts(candidates) {
  if (!candidates.length) return [];
  const exactCodes = candidates
    .filter((candidate) => candidate.normalizedCode.length === 12)
    .map((candidate) => `ARM-${candidate.normalizedCode}`);
  const attemptsById = new Map();
  if (exactCodes.length) {
    const directMatches = await ArenaMatchAttempt.find({
      integrityWatermarkTraceCode: { $in: exactCodes },
    })
      .populate("userId", "username email name")
      .lean();
    directMatches.forEach((attempt) => attemptsById.set(String(attempt._id), attempt));
  }

  if (attemptsById.size < candidates.length) {
    const recentAttempts = await ArenaMatchAttempt.find({})
      .select("_id matchId userId role status startedAt createdAt integrityWatermarkTraceCode")
      .populate("userId", "username email name")
      .sort({ createdAt: -1 })
      .limit(MAX_ARENA_ATTEMPT_FORENSIC_SCAN)
      .lean();
    recentAttempts.forEach((attempt) => attemptsById.set(String(attempt._id), attempt));
  }

  return matchArenaCandidatesToAttempts(candidates, [...attemptsById.values()]);
}

async function lookupScreenshotIssuances(candidates) {
  const exactCodes = candidates
    .filter((candidate) => candidate.normalizedCode.length === 16)
    .map((candidate) => `MTH-${candidate.normalizedCode}`);
  const prefixes = [...new Set(
    candidates
      .filter((candidate) => candidate.normalizedCode.length >= 6)
      .map((candidate) => candidate.normalizedCode.slice(0, 3))
  )].slice(0, 24);
  const clauses = [
    ...(exactCodes.length ? [{ traceCode: { $in: exactCodes } }] : []),
    ...prefixes.map((prefix) => ({ traceCode: new RegExp(`^MTH-${prefix}`) })),
  ];
  if (!clauses.length) return [];
  const issuances = await PdfWatermarkIssuance.find({ $or: clauses })
    .populate("userId", "username email name")
    .sort({ downloadedAt: -1 })
    .limit(500)
    .lean();
  return issuances
    .map((issuance) => {
      const ranked = candidates
        .map((candidate) => ({
          candidate,
          score: scoreOcrCandidate(candidate.normalizedCode, issuance.traceCode),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (!ranked || ranked.score < 0.7) return null;
      return mapIssuanceForAdmin(issuance, {
        signatureVerified: false,
        recognitionMethod: "IMAGE_OCR",
        ocrConfidence: ranked.score,
        matchedCandidate: ranked.candidate.rawCode,
      });
    })
    .filter(Boolean)
    .sort((left, right) => right.ocrConfidence - left.ocrConfidence);
}

async function copyRemoteUrlToFile(url, destinationPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw statusError(502, "클라우드 PDF 원본을 불러오지 못했습니다.", "PDF_SOURCE_FETCH_FAILED");
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destinationPath, { flags: "wx" }));
}

async function materializeSource({ storageRecord, localPath, destinationPath }) {
  if (storageRecord?.storageProvider === "R2") {
    return downloadR2ObjectToFile(storageRecord, destinationPath);
  }
  if (storageRecord?.storageProvider === "CLOUDINARY") {
    const signedUrl = await signedStoredAssetUrl(storageRecord, {
      download: false,
      originalName: storageRecord.originalName || "matths-document.pdf",
    });
    if (!signedUrl) throw statusError(404, "클라우드 PDF 원본을 찾을 수 없습니다.");
    await copyRemoteUrlToFile(signedUrl, destinationPath);
    return;
  }
  if (!localPath || !fs.existsSync(localPath)) {
    throw statusError(404, "PDF 원본 파일을 찾을 수 없습니다.");
  }
  await fs.promises.copyFile(localPath, destinationPath, fs.constants.COPYFILE_EXCL);
}

function drawForensicLayer({ pdfDoc, traceCode, token, downloadedAt }) {
  return pdfDoc.embedFont(StandardFonts.Helvetica).then((font) => {
    const kstTime = formatKstCompact(downloadedAt);
    const visible = `MATTHS  ${traceCode}  ${kstTime}`;
    const aiVisible = `${DOWNLOAD_AI_WATERMARK.shortText}  ${traceCode}`;
    const pages = pdfDoc.getPages();
    pages.forEach((page, pageIndex) => {
      const { width, height } = page.getSize();
      const pageNumber = pageIndex + 1;
      const pageToken = hmacHex(`${traceCode}:PAGE:${pageNumber}`).slice(0, 20).toUpperCase();
      page.node.set(
        PDFName.of("MatthsPageTrace"),
        PDFHexString.fromText(`${token}|PAGE=${pageNumber}|CODE=${pageToken}`)
      );

      const fontSize = Math.max(7, Math.min(10.5, width / 64));
      const rowGap = Math.max(92, height / 7.2);
      const colGap = Math.max(245, width / 2.05);
      for (let y = -30; y < height + rowGap; y += rowGap) {
        for (let x = -width * 0.18; x < width + colGap; x += colGap) {
          page.drawText(visible, {
            x,
            y,
            size: fontSize,
            font,
            rotate: degrees(31),
            color: rgb(0.28, 0.18, 0.42),
            opacity: 0.045,
          });
          page.drawText(aiVisible, {
            x: x + 18,
            y: y + 16,
            size: Math.max(7, fontSize * 0.92),
            font,
            rotate: degrees(31),
            color: rgb(0.58, 0.08, 0.2),
            opacity: 0.075,
          });
        }
      }

      const footerText = `${DOWNLOAD_AI_WATERMARK.detailedText}  |  ${traceCode}`;
      const footerSize = Math.max(
        4.8,
        Math.min(7.2, ((width - 18) * 7.2) / font.widthOfTextAtSize(footerText, 7.2))
      );
      const footerWidth = font.widthOfTextAtSize(footerText, footerSize);
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height: Math.max(12, footerSize + 6),
        color: rgb(0.58, 0.08, 0.2),
        opacity: 0.035,
      });
      page.drawText(footerText, {
        x: Math.max(9, (width - footerWidth) / 2),
        y: 4,
        size: footerSize,
        font,
        color: rgb(0.46, 0.04, 0.14),
        opacity: 0.34,
      });

      const micro = `MTHS-P${String(pageNumber).padStart(3, "0")}-${traceCode}-${pageToken}`;
      const xSeed = parseInt(pageToken.slice(0, 6), 16);
      const ySeed = parseInt(pageToken.slice(6, 12), 16);
      const microPositions = [
        [8 + (xSeed % Math.max(12, Math.floor(width * 0.2))), 7 + (ySeed % 18)],
        [Math.max(8, width * 0.46 + (xSeed % 31)), Math.max(9, height * 0.48 + (ySeed % 41))],
        [Math.max(8, width - 190 - (xSeed % 41)), Math.max(9, height - 20 - (ySeed % 23))],
      ];
      microPositions.forEach(([x, y]) => {
        page.drawText(micro, {
          x,
          y,
          size: 1.15,
          font,
          color: rgb(0.08, 0.08, 0.08),
          opacity: 0.018,
        });
      });
      for (let point = 0; point < 12; point += 1) {
        page.drawCircle({
          x: 4 + ((xSeed + point * 47) % Math.max(10, Math.floor(width - 8))),
          y: 4 + ((ySeed + point * 71) % Math.max(10, Math.floor(height - 8))),
          size: 0.38 + (point % 3) * 0.08,
          color: rgb(0.18, 0.13, 0.28),
          opacity: 0.012,
        });
      }
    });
    return pages.length;
  });
}

function buildForensicIdentity({
  userId,
  examId,
  sourceType,
  sourceId,
  downloadedAt = new Date(),
}) {
  if (!mongoose.isValidObjectId(userId)) throw statusError(401, "PDF 발급 사용자를 확인할 수 없습니다.");
  if (!["ARCHIVE", "WEEKLY_MOCK", "STORE", "STUDY_HALL", "FORMULA"].includes(sourceType)) {
    throw statusError(400, "PDF 발급 자료 유형을 확인할 수 없습니다.");
  }
  const normalizedDownloadedAt = new Date(downloadedAt);
  const issuanceId = randomUUID();
  const documentIssueId = `MATTHS-${normalizedDownloadedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${issuanceId.slice(0, 12).toUpperCase()}`;
  const traceCode = `MTH-${hmacHex(`${issuanceId}:${userId}:${examId}:${normalizedDownloadedAt.toISOString()}`)
    .slice(0, 16)
    .toUpperCase()}`;
  const payload = {
    v: 1,
    issuer: "MATTHS",
    issuance_id: issuanceId,
    document_issue_id: documentIssueId,
    trace_code: traceCode,
    user_id: String(userId),
    exam_id: String(examId),
    downloaded_at: normalizedDownloadedAt.toISOString(),
    source_type: sourceType,
    source_id: String(sourceId),
  };
  const token = signedPayload(payload);
  return {
    downloadedAt: normalizedDownloadedAt,
    issuanceId,
    documentIssueId,
    traceCode,
    payload,
    token,
    payloadHash: createHash("sha256").update(token, "utf8").digest("hex"),
  };
}

async function createPersonalizedPdfBytes({
  sourceBytes,
  originalName,
  identity,
}) {
  const bytes = Buffer.from(sourceBytes || []);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw statusError(422, "업로드된 원본이 유효한 PDF가 아닙니다.", "INVALID_PDF_SOURCE");
  }
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  pdfDoc.setTitle(path.basename(String(originalName || "Matths protected document")));
  pdfDoc.setAuthor("MATTHS");
  pdfDoc.setCreator("MATTHS Personalized Document Issuer");
  pdfDoc.setProducer(`MATTHS Dual Protection PDF Layer v${DOWNLOAD_AI_WATERMARK.version}`);
  pdfDoc.setSubject(
    `MATTHS protected copy | ${identity.traceCode} | ${identity.documentIssueId} | ${DOWNLOAD_AI_WATERMARK.metadataText}`
  );
  pdfDoc.setKeywords([
    "MATTHS",
    DOWNLOAD_AI_WATERMARK.shortText,
    DOWNLOAD_AI_WATERMARK.detailedText,
    `TRACE=${identity.traceCode}`,
    `ISSUE=${identity.documentIssueId}`,
    `TOKEN=${identity.token}`,
  ]);
  pdfDoc.setModificationDate(identity.downloadedAt);
  pdfDoc.catalog.set(PDFName.of("MatthsForensicPayload"), PDFHexString.fromText(identity.token));
  pdfDoc.catalog.set(PDFName.of("MatthsTraceCode"), PDFHexString.fromText(identity.traceCode));
  pdfDoc.catalog.set(PDFName.of("MatthsDocumentIssueId"), PDFHexString.fromText(identity.documentIssueId));
  pdfDoc.catalog.set(
    PDFName.of("MatthsAiUsePolicy"),
    PDFHexString.fromText(DOWNLOAD_AI_WATERMARK.metadataText)
  );
  const pageCount = await drawForensicLayer({
    pdfDoc,
    traceCode: identity.traceCode,
    token: identity.token,
    downloadedAt: identity.downloadedAt,
  });
  const outputBytes = await pdfDoc.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 40,
  });
  return {
    outputBytes,
    pageCount,
    protectionWatermarkVersion: DOWNLOAD_AI_WATERMARK.version,
  };
}

async function issuePersonalizedPdf({
  userId,
  examId,
  sourceType,
  sourceId,
  assetId = "",
  originalName,
  storageRecord = null,
  localPath = null,
  downloadedAt = new Date(),
}) {
  const identity = buildForensicIdentity({
    userId,
    examId,
    sourceType,
    sourceId,
    downloadedAt,
  });
  const { issuanceId, documentIssueId, traceCode, payloadHash } = identity;
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), GENERATED_TEMP_PREFIX));
  const sourcePath = path.join(tempDirectory, "source.pdf");
  const outputPath = path.join(tempDirectory, "issued.pdf");
  const issuance = await PdfWatermarkIssuance.create({
    issuanceId,
    documentIssueId,
    traceCode,
    userId,
    examId: String(examId),
    sourceType,
    sourceId: String(sourceId),
    assetId: String(assetId || ""),
    originalName: path.basename(String(originalName || "matths-document.pdf")),
    downloadedAt: identity.downloadedAt,
    forensicPayloadHash: payloadHash,
    status: "GENERATING",
  });
  try {
    await materializeSource({ storageRecord, localPath, destinationPath: sourcePath });
    const stat = await fs.promises.stat(sourcePath);
    const maxBytes = Math.max(1024 * 1024, Number(process.env.PDF_WATERMARK_MAX_BYTES) || DEFAULT_MAX_PDF_BYTES);
    if (stat.size > maxBytes) {
      throw statusError(
        413,
        `개인 식별 PDF 발급 한도(${Math.round(maxBytes / 1024 / 1024)}MB)를 초과했습니다.`,
        "PDF_WATERMARK_SOURCE_TOO_LARGE"
      );
    }
    const sourceBytes = await fs.promises.readFile(sourcePath);
    const { outputBytes, pageCount } = await createPersonalizedPdfBytes({
      sourceBytes,
      originalName,
      identity,
    });
    await fs.promises.writeFile(outputPath, outputBytes, { flag: "wx" });
    await PdfWatermarkIssuance.updateOne(
      { _id: issuance._id },
      { $set: { status: "READY", pageCount, failureCode: "" } }
    );
    return {
      filePath: outputPath,
      downloadName: safeDownloadName(originalName),
      traceCode,
      documentIssueId,
      issuanceId,
      cleanup: () => fs.promises.rm(tempDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    await PdfWatermarkIssuance.updateOne(
      { _id: issuance._id },
      { $set: { status: "FAILED", failureCode: String(error.code || "PDF_GENERATION_FAILED").slice(0, 120) } }
    ).catch(() => {});
    await fs.promises.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function cleanupStalePdfTemporaryFiles({
  now = new Date(),
  olderThanMs = DEFAULT_TEMP_RETENTION_MS,
} = {}) {
  const cutoff = new Date(now).getTime() - Math.max(60 * 60 * 1000, Number(olderThanMs) || 0);
  const removed = [];
  const tempRoot = os.tmpdir();
  const rootEntries = await fs.promises.readdir(tempRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of rootEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith(GENERATED_TEMP_PREFIX)) continue;
    if (entry.name === path.basename(FORENSICS_TEMP_DIRECTORY)) continue;
    const target = path.join(tempRoot, entry.name);
    const stat = await fs.promises.stat(target).catch(() => null);
    if (!stat || stat.mtimeMs > cutoff) continue;
    await fs.promises.rm(target, { recursive: true, force: true });
    removed.push(target);
  }
  const forensicEntries = await fs.promises
    .readdir(FORENSICS_TEMP_DIRECTORY, { withFileTypes: true })
    .catch(() => []);
  for (const entry of forensicEntries) {
    if (!entry.isFile()) continue;
    const target = path.join(FORENSICS_TEMP_DIRECTORY, entry.name);
    const stat = await fs.promises.stat(target).catch(() => null);
    if (!stat || stat.mtimeMs > cutoff) continue;
    await fs.promises.rm(target, { force: true });
    removed.push(target);
  }
  return { removedCount: removed.length, removed };
}

function addCandidates(target, text) {
  const value = String(text || "");
  for (const token of value.match(TOKEN_PATTERN) || []) target.tokens.add(token);
  for (const trace of value.match(TRACE_PATTERN) || []) target.traceCodes.add(trace);
}

async function extractPageText(bytes, candidateSet) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    });
    const document = await task.promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      addCandidates(candidateSet, content.items.map((item) => item.str || "").join(" "));
      page.cleanup();
    }
    await document.destroy();
  } catch (_error) {
    // Catalog metadata and custom page keys remain the primary extraction path.
  }
}

async function analyzeForensicPdf(filePath, { lookupIssuances = true } = {}) {
  const stat = await fs.promises.stat(filePath);
  const maxBytes = Math.max(1024 * 1024, Number(process.env.PDF_FORENSICS_MAX_BYTES) || DEFAULT_MAX_PDF_BYTES);
  if (!stat.isFile() || stat.size > maxBytes) {
    throw statusError(413, "분석할 PDF의 파일 크기가 허용 범위를 초과했습니다.");
  }
  const bytes = await fs.promises.readFile(filePath);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw statusError(422, "유효한 PDF 파일만 분석할 수 있습니다.");
  }
  const candidates = { tokens: new Set(), traceCodes: new Set(), pageCodes: new Set() };
  let pageCount = 0;
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pageCount = pdfDoc.getPageCount();
    addCandidates(candidates, pdfDoc.getSubject());
    const keywords = pdfDoc.getKeywords();
    addCandidates(candidates, Array.isArray(keywords) ? keywords.join(" ") : keywords);
    ["MatthsForensicPayload", "MatthsTraceCode", "MatthsDocumentIssueId"].forEach((key) => {
      addCandidates(candidates, textFromPdfObject(pdfDoc.catalog.get(PDFName.of(key))));
    });
    pdfDoc.getPages().forEach((page) => {
      const pageTrace = textFromPdfObject(page.node.get(PDFName.of("MatthsPageTrace")));
      addCandidates(candidates, pageTrace);
      if (pageTrace) candidates.pageCodes.add(pageTrace);
    });
  } catch (error) {
    throw statusError(422, `PDF 구조를 읽지 못했습니다: ${error.message}`, "PDF_FORENSICS_PARSE_FAILED");
  }
  if (!candidates.tokens.size && !candidates.traceCodes.size) {
    await extractPageText(bytes, candidates);
  }
  const validPayloads = [...candidates.tokens]
    .map(decodeSignedPayload)
    .filter(Boolean);
  validPayloads.forEach((payload) => candidates.traceCodes.add(payload.trace_code));
  const issuanceIds = validPayloads.map((payload) => payload.issuance_id);
  const lookupClauses = [
    ...(issuanceIds.length ? [{ issuanceId: { $in: issuanceIds } }] : []),
    ...(candidates.traceCodes.size ? [{ traceCode: { $in: [...candidates.traceCodes] } }] : []),
  ];
  const issuances = lookupIssuances && lookupClauses.length
    ? await PdfWatermarkIssuance.find({ $or: lookupClauses })
        .populate("userId", "username email name")
        .sort({ downloadedAt: -1 })
        .lean()
    : [];
  return {
    inputType: "PDF",
    pageCount,
    imageCount: 0,
    traceCodes: [...candidates.traceCodes],
    validPayloads,
    pageTraceCount: candidates.pageCodes.size,
    ocrCandidateCount: 0,
    matches: issuances.map((issuance) => mapIssuanceForAdmin(issuance, {
      signatureVerified: validPayloads.some((payload) => payload.issuance_id === issuance.issuanceId),
      recognitionMethod: "PDF_SIGNATURE",
      ocrConfidence: null,
      matchedCandidate: "",
    })),
  };
}

async function analyzeForensicImage(filePath, { lookupIssuances = true } = {}) {
  let metadata;
  try {
    metadata = await sharp(filePath, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch (_error) {
    throw statusError(
      422,
      "지원되는 PNG·JPG·WEBP·HEIC 스크린샷인지 확인해주세요.",
      "PDF_FORENSICS_IMAGE_PARSE_FAILED"
    );
  }
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
    throw statusError(413, "스크린샷 해상도가 분석 한도를 초과했습니다.");
  }

  const allCandidates = new Map();
  const allArenaCandidates = new Map();
  let attempts = 0;
  for (let index = 0; index < IMAGE_OCR_ROTATIONS.length; index += 1) {
    const rotation = IMAGE_OCR_ROTATIONS[index];
    const threshold = IMAGE_OCR_THRESHOLDS[index];
    let prepared;
    try {
      prepared = await sharp(filePath, {
        failOn: "error",
        limitInputPixels: MAX_IMAGE_PIXELS,
        sequentialRead: true,
      })
        .autoOrient()
        .flatten({ background: "#ffffff" })
        .rotate(rotation, { background: "#ffffff" })
        .resize({ width: 3500, withoutEnlargement: false, fit: "inside" })
        .grayscale()
        .threshold(threshold)
        .png()
        .toBuffer();
    } catch (_error) {
      throw statusError(
        422,
        "스크린샷을 OCR 분석용 이미지로 변환하지 못했습니다.",
        "PDF_FORENSICS_IMAGE_PREPROCESS_FAILED"
      );
    }
    attempts += 1;
    const ocrText = await runImageOcr(prepared).catch((error) => {
      throw statusError(
        503,
        `스크린샷 문자 인식기를 시작하지 못했습니다: ${error.message}`,
        "PDF_FORENSICS_OCR_UNAVAILABLE"
      );
    });
    for (const candidate of extractOcrTraceCandidates(ocrText)) {
      const existing = allCandidates.get(candidate.normalizedCode);
      allCandidates.set(candidate.normalizedCode, {
        ...candidate,
        occurrences: Number(existing?.occurrences || 0) + candidate.occurrences,
      });
    }
    for (const candidate of extractOcrArenaTraceCandidates(ocrText)) {
      const existing = allArenaCandidates.get(candidate.normalizedCode);
      allArenaCandidates.set(candidate.normalizedCode, {
        ...candidate,
        occurrences: Number(existing?.occurrences || 0) + candidate.occurrences,
      });
    }
    const strongCandidate =
      [...allCandidates.values()].some(
        (candidate) => candidate.normalizedCode.length >= 16
      ) ||
      [...allArenaCandidates.values()].some(
        (candidate) => candidate.normalizedCode.length >= 12
      );
    if (strongCandidate) break;
  }
  const candidates = [...allCandidates.values()].sort((left, right) =>
    right.normalizedCode.length - left.normalizedCode.length ||
    right.occurrences - left.occurrences
  );
  const arenaCandidates = [...allArenaCandidates.values()].sort((left, right) =>
    right.normalizedCode.length - left.normalizedCode.length ||
    right.occurrences - left.occurrences
  );
  const [documentMatches, arenaMatches] = lookupIssuances
    ? await Promise.all([
        lookupScreenshotIssuances(candidates),
        lookupArenaScreenshotAttempts(arenaCandidates),
      ])
    : [[], []];
  const matches = [...documentMatches, ...arenaMatches];
  const recognizedTraceCodes = [
    ...candidates.map((candidate) => `MTH-${candidate.normalizedCode}`),
    ...arenaCandidates.map((candidate) => `ARM-${candidate.normalizedCode}`),
  ];
  return {
    inputType: "IMAGE",
    pageCount: 0,
    imageCount: 1,
    imageMetadata: {
      format: String(metadata.format || "").toUpperCase(),
      width,
      height,
      ocrAttempts: attempts,
    },
    traceCodes: [...new Set(
      matches.length
        ? matches.map((match) => match.traceCode)
        : recognizedTraceCodes
    )],
    validPayloads: [],
    pageTraceCount: 0,
    ocrCandidateCount: candidates.length + arenaCandidates.length,
    ocrCandidates: [
      ...candidates.map((candidate) => candidate.normalizedCode),
      ...arenaCandidates.map((candidate) => candidate.normalizedCode),
    ],
    arenaOcrCandidates: arenaCandidates.map((candidate) => candidate.normalizedCode),
    matches,
  };
}

async function analyzeForensicUpload(filePath, options = {}) {
  const handle = await fs.promises.open(filePath, "r");
  let head;
  try {
    head = Buffer.alloc(16);
    await handle.read(head, 0, head.length, 0);
  } finally {
    await handle.close();
  }
  if (head.subarray(0, 5).toString("ascii") === "%PDF-") {
    return analyzeForensicPdf(filePath, options);
  }
  return analyzeForensicImage(filePath, options);
}

function isPdfDownload(file = {}) {
  return String(file.mimeType || "").toLowerCase() === "application/pdf" ||
    path.extname(String(file.originalName || file.name || "")).toLowerCase() === ".pdf";
}

module.exports = {
  analyzeForensicImage,
  analyzeForensicPdf,
  analyzeForensicUpload,
  buildForensicIdentity,
  cleanupStalePdfTemporaryFiles,
  closeForensicImageOcrWorker,
  createPersonalizedPdfBytes,
  decodeSignedPayload,
  isPdfDownload,
  issuePersonalizedPdf,
  matchArenaCandidatesToAttempts,
  scoreArenaOcrCandidate,
  scoreOcrCandidate,
  DOWNLOAD_AI_WATERMARK,
};

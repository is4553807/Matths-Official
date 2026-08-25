const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const mongoose = require("mongoose");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
require("dotenv").config({ path: path.resolve(__dirname, "..", "config.env") });

const {
  analyzeForensicImage,
  analyzeForensicPdf,
  buildForensicIdentity,
  cleanupStalePdfTemporaryFiles,
  closeForensicImageOcrWorker,
  createPersonalizedPdfBytes,
  DOWNLOAD_AI_WATERMARK,
  scoreOcrCandidate,
  shouldScanRecentArenaAttempts,
} = require("../services/pdfWatermarkService");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createVerificationSourcePdf(destinationPath) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
    const page = document.addPage([595, 842]);
    page.drawText("Matths PDF watermark verification source", {
      x: 62,
      y: 760,
      size: 18,
      font,
      color: rgb(0.06, 0.1, 0.22),
    });
    page.drawText(`Verification page ${pageNumber}`, {
      x: 62,
      y: 720,
      size: 13,
      font,
      color: rgb(0.25, 0.3, 0.45),
    });
  }
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.promises.writeFile(destinationPath, await document.save());
  return destinationPath;
}

async function main() {
  const exactArenaCode = "ARM-8A73787C399A";
  assert(
    !shouldScanRecentArenaAttempts(
      [exactArenaCode],
      [{ integrityWatermarkTraceCode: exactArenaCode }]
    ),
    "정확한 Arena 추적 코드를 찾은 뒤에도 대량 응시 기록 스캔이 실행됩니다."
  );
  assert(
    shouldScanRecentArenaAttempts([exactArenaCode], []),
    "정확한 Arena 추적 코드가 DB에 없을 때 보조 검색이 실행되지 않습니다."
  );
  assert(
    shouldScanRecentArenaAttempts([], []),
    "부분 Arena 추적 코드만 인식됐을 때 보조 검색이 실행되지 않습니다."
  );

  const requestedSourcePath = String(process.argv[2] || "").trim();
  const sourcePath = requestedSourcePath
    ? path.resolve(requestedSourcePath)
    : await createVerificationSourcePdf(
        path.resolve(__dirname, "..", "tmp", "pdfs", "watermark-qa-source.pdf")
      );
  assert(fs.existsSync(sourcePath), `검증 원본 PDF가 없습니다: ${sourcePath}`);
  const outputPath = path.resolve(__dirname, "..", "tmp", "pdfs", "watermark-qa.pdf");
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const userId = new mongoose.Types.ObjectId();
  const identity = buildForensicIdentity({
    userId,
    examId: "PDF-WATERMARK-QA",
    sourceType: "STORE",
    sourceId: "PDF-WATERMARK-QA",
    downloadedAt: new Date("2026-08-07T03:04:05.000Z"),
  });
  const sourceBytes = await fs.promises.readFile(sourcePath);
  const generated = await createPersonalizedPdfBytes({
    sourceBytes,
    originalName: path.basename(sourcePath),
    identity,
  });
  await fs.promises.writeFile(outputPath, generated.outputBytes);
  const issuedDocument = await PDFDocument.load(generated.outputBytes);
  assert(
    generated.protectionWatermarkVersion === DOWNLOAD_AI_WATERMARK.version,
    "이중 보호 워터마크 버전이 기록되지 않았습니다."
  );
  assert(
    String(issuedDocument.getKeywords() || "").includes("AI ASSISTANCE PROHIBITED") &&
      String(issuedDocument.getKeywords() || "").includes(identity.traceCode),
    "PDF 보호 메타데이터에 AI 사용 금지 문구와 사용자 추적 코드가 함께 기록되지 않았습니다."
  );
  const analysis = await analyzeForensicPdf(outputPath, { lookupIssuances: false });
  const verified = analysis.validPayloads.find(
    (payload) => payload.issuance_id === identity.issuanceId
  );
  assert(analysis.pageCount > 0, "PDF 페이지를 읽지 못했습니다.");
  assert(analysis.pageTraceCount === analysis.pageCount, "페이지별 식별 코드가 일부 누락되었습니다.");
  assert(verified, "서명된 숨김 식별정보를 복원하지 못했습니다.");
  assert(verified.user_id === String(userId), "숨김 사용자 ID가 발급 사용자와 다릅니다.");
  assert(verified.exam_id === "PDF-WATERMARK-QA", "숨김 시험 ID가 다릅니다.");
  assert(verified.downloaded_at === "2026-08-07T03:04:05.000Z", "숨김 다운로드 시각이 다릅니다.");
  const screenshotPrefix = path.resolve(__dirname, "..", "tmp", "pdfs", "screenshot-qa");
  execFileSync("pdftoppm", [
    "-f", "4",
    "-l", "4",
    "-singlefile",
    "-r", "160",
    "-png",
    outputPath,
    screenshotPrefix,
  ], { stdio: "ignore" });
  const screenshotPath = `${screenshotPrefix}.png`;
  const imageAnalysis = await analyzeForensicImage(screenshotPath, { lookupIssuances: false });
  assert(imageAnalysis.inputType === "IMAGE", "스크린샷 분석 유형이 올바르지 않습니다.");
  const bestScreenshotScore = Math.max(
    0,
    ...imageAnalysis.ocrCandidates.map((candidate) => scoreOcrCandidate(candidate, identity.traceCode))
  );
  assert(bestScreenshotScore >= 0.7, "스크린샷에서 개인 추적 코드를 복원하지 못했습니다.");
  const staleDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "matths-pdf-local-qa-"));
  const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await fs.promises.utimes(staleDirectory, staleAt, staleAt);
  const cleanup = await cleanupStalePdfTemporaryFiles({ olderThanMs: 60 * 60 * 1000 });
  assert(!fs.existsSync(staleDirectory), "비정상 종료 뒤 남은 PDF 임시 폴더가 정리되지 않았습니다.");
  assert(cleanup.removedCount >= 1, "PDF 임시 폴더 정리 결과가 기록되지 않았습니다.");
  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath,
        pageCount: analysis.pageCount,
        pageTraceCount: analysis.pageTraceCount,
        signatureVerified: true,
        staleTemporaryFilesRemoved: true,
        screenshotTraceRecognized: true,
        arenaExactMatchSkipsBroadScan: true,
        dualWatermarkTextEmbedded: true,
        protectionWatermarkVersion: generated.protectionWatermarkVersion,
        screenshotTraceConfidence: Number(bestScreenshotScore.toFixed(3)),
        traceCode: identity.traceCode,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeForensicImageOcrWorker().catch(() => {}));

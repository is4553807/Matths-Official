const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "..", "config.env") });

const { User } = require("../models/matthsModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const {
  analyzeForensicPdf,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const sourcePath = path.resolve(
    process.argv[2] ||
      path.join(__dirname, "..", "storage", "store", "1786041053867-df9aaeb0-5d27-40d9-a87c-55dcb52ecd14.pdf")
  );
  if (!fs.existsSync(sourcePath)) throw new Error(`검증 원본 PDF가 없습니다: ${sourcePath}`);
  await mongoose.connect(process.env.DB);
  const user = await User.findOne({ role: "admin" }).select("_id username email").lean() ||
    await User.findOne({}).select("_id username email").lean();
  assert(user, "PDF 발급 검증에 사용할 사용자가 없습니다.");
  const sourceId = `PDF-WATERMARK-E2E-${Date.now()}`;
  const outputPath = path.resolve(__dirname, "..", "tmp", "pdfs", "watermark-qa.pdf");
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.unlink(outputPath).catch(() => {});
  let issued;
  try {
    issued = await issuePersonalizedPdf({
      userId: user._id,
      examId: sourceId,
      sourceType: "STORE",
      sourceId,
      originalName: path.basename(sourcePath),
      localPath: sourcePath,
    });
    await fs.promises.copyFile(issued.filePath, outputPath);
    const analysis = await analyzeForensicPdf(issued.filePath);
    const matched = analysis.matches.find((item) => item.issuanceId === issued.issuanceId);
    assert(analysis.pageCount > 0, "PDF 페이지를 읽지 못했습니다.");
    assert(analysis.pageTraceCount === analysis.pageCount, "페이지별 식별 코드가 일부 누락되었습니다.");
    assert(matched, "발급 기록과 사용자 매핑을 복원하지 못했습니다.");
    assert(matched.signatureVerified, "서명된 숨김 식별정보 검증에 실패했습니다.");
    assert(String(matched.userId) === String(user._id), "복원한 사용자 ID가 발급 사용자와 다릅니다.");
    console.log(JSON.stringify({
      ok: true,
      outputPath,
      pageCount: analysis.pageCount,
      traceCode: issued.traceCode,
      documentIssueId: issued.documentIssueId,
      matchedUser: user.username || user.email || String(user._id),
      signatureVerified: matched.signatureVerified,
    }, null, 2));
  } finally {
    if (issued) await issued.cleanup().catch(() => {});
    await PdfWatermarkIssuance.deleteMany({ sourceId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

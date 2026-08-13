const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const {
  createUploadContentValidator,
  validateRequestUploads,
  validateUploadedFile,
} = require("../middleware/uploadContentValidation");

function uploadedFile(filePath, originalname, mimetype = "application/octet-stream") {
  return {
    path: filePath,
    originalname,
    filename: path.basename(filePath),
    mimetype,
    size: fs.statSync(filePath).size,
  };
}

async function expectCode(operation, expectedCode) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

async function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}

async function main() {
  const tempDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "matths-upload-security-")
  );

  try {
    const pngPath = path.join(tempDirectory, "valid.png");
    await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 80, g: 40, b: 220, alpha: 1 },
      },
    }).png().toFile(pngPath);

    const png = uploadedFile(pngPath, "evidence.png", "text/plain");
    await validateUploadedFile(png);
    assert.equal(png.mimetype, "image/png");
    assert.equal(png.contentValidated, true);

    const pdfPath = path.join(tempDirectory, "valid.pdf");
    await fs.promises.writeFile(
      pdfPath,
      Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
    );
    const pdf = uploadedFile(pdfPath, "document.pdf", "image/jpeg");
    await validateUploadedFile(pdf);
    assert.equal(pdf.mimetype, "application/pdf");

    const validJsonPath = path.join(tempDirectory, "valid.json");
    await fs.promises.writeFile(validJsonPath, "\uFEFF{\"answers\":[1,2,3]}");
    const json = uploadedFile(validJsonPath, "answers.json", "text/plain");
    await validateUploadedFile(json);
    assert.equal(json.mimetype, "application/json");

    const disguisedTextPath = path.join(tempDirectory, "disguised.jpg");
    await fs.promises.writeFile(disguisedTextPath, "this is not an image");
    await expectCode(
      () => validateUploadedFile(uploadedFile(disguisedTextPath, "photo.jpg")),
      "UPLOAD_CONTENT_TYPE_MISMATCH"
    );

    const disguisedPdfPath = path.join(tempDirectory, "disguised-as-jpeg.jpg");
    await fs.promises.writeFile(disguisedPdfPath, "%PDF-1.4\n%%EOF\n");
    await expectCode(
      () => validateUploadedFile(uploadedFile(disguisedPdfPath, "photo.jpg")),
      "UPLOAD_CONTENT_TYPE_MISMATCH"
    );

    const brokenPngPath = path.join(tempDirectory, "broken.png");
    await fs.promises.writeFile(
      brokenPngPath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    await expectCode(
      () => validateUploadedFile(uploadedFile(brokenPngPath, "broken.png")),
      "UPLOAD_IMAGE_DECODE_FAILED"
    );

    const invalidJsonPath = path.join(tempDirectory, "invalid.json");
    await fs.promises.writeFile(invalidJsonPath, "{not-json}");
    await expectCode(
      () => validateUploadedFile(uploadedFile(invalidJsonPath, "answers.json")),
      "UPLOAD_JSON_INVALID"
    );

    await expectCode(
      () => validateRequestUploads(
        { files: [uploadedFile(pngPath, "evidence.png")] },
        { maxTotalBytes: 1 }
      ),
      "UPLOAD_TOTAL_SIZE_EXCEEDED"
    );

    const cleanupPath = path.join(tempDirectory, "cleanup.jpg");
    await fs.promises.writeFile(cleanupPath, "invalid upload");
    const req = { file: uploadedFile(cleanupPath, "cleanup.jpg") };
    const validationError = await runMiddleware(
      createUploadContentValidator({ maxTotalBytes: 1024 }),
      req
    );
    assert.equal(validationError?.code, "UPLOAD_CONTENT_TYPE_MISMATCH");
    assert.equal(req.file, undefined);
    assert.equal(fs.existsSync(cleanupPath), false);

    const matthsRoutes = fs.readFileSync(
      path.resolve(__dirname, "../routes/matths-routes.js"),
      "utf8"
    );
    const arenaRoutes = fs.readFileSync(
      path.resolve(__dirname, "../routes/goat-arena-routes.js"),
      "utf8"
    );
    for (const validator of [
      "validateAdminArchiveContent",
      "validateAdminExamContent",
      "validateForensicContent",
      "validateIntegrityEvidenceContent",
      "validateStoreContent",
    ]) {
      assert.match(matthsRoutes, new RegExp(`\\b${validator}\\b`));
    }
    assert.match(arenaRoutes, /validateArenaEvidenceContent/);

    console.log("Upload content validation verification passed.");
  } finally {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

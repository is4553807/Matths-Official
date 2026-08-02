const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

require("dotenv").config({ path: path.resolve(__dirname, "..", "config.env") });

const {
  destroyStoredAsset,
  getFileStorageStatus,
  signedCloudinaryUrl,
  STORAGE_PURPOSES,
  storeUploadedFile,
} = require("../services/fileStorageService");

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function run() {
  const status = getFileStorageStatus();
  assert.equal(status.provider, "cloudinary", "Cloudinary 저장소를 선택해야 합니다.");
  assert.equal(status.configured, true, "Cloudinary 인증 정보가 필요합니다.");

  const temporaryPath = path.join(os.tmpdir(), `matths-cloudinary-${randomUUID()}.png`);
  fs.writeFileSync(temporaryPath, ONE_PIXEL_PNG);

  let asset = null;
  try {
    asset = await storeUploadedFile(
      {
        path: temporaryPath,
        filename: path.basename(temporaryPath),
        originalname: "matths-cloudinary-connection-test.png",
        mimetype: "image/png",
      },
      {
        folder: "matths/connection-tests",
        purpose: STORAGE_PURPOSES.USER_ARENA_EVIDENCE,
      }
    );

    assert.equal(asset.storageProvider, "CLOUDINARY");
    assert.equal(asset.storagePurpose, "USER_ARENA_EVIDENCE");
    assert.equal(asset.cloudDeliveryType, "authenticated");
    assert.ok(asset.cloudPublicId.startsWith("matths/connection-tests/"));

    const signedUrl = signedCloudinaryUrl(asset, {
      download: true,
      originalName: "matths-cloudinary-connection-test.png",
    });
    assert.match(signedUrl, /^https:\/\//);
    assert.equal(signedUrl.includes(String(process.env.CLOUDINARY_API_SECRET || "__never__")), false);

    const downloadResponse = await fetch(signedUrl, { redirect: "follow" });
    assert.equal(
      downloadResponse.ok,
      true,
      `서명된 비공개 파일 다운로드에 실패했습니다. (${downloadResponse.status})`
    );
    assert.ok((await downloadResponse.arrayBuffer()).byteLength > 0);

    console.log("Cloudinary 비공개 업로드·서명 다운로드·삭제 연결 검증 완료");
  } finally {
    if (asset) await destroyStoredAsset(asset);
    await fs.promises.unlink(temporaryPath).catch(() => {});
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      name: error?.name || "CloudinaryConnectionError",
      code: error?.code || error?.error?.code || null,
      httpCode: error?.http_code || error?.error?.http_code || null,
      message: String(error?.message || error?.error?.message || "연결 검증 실패"),
    })
  );
  process.exitCode = 1;
});

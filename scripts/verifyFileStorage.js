const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

process.env.FILE_STORAGE_PROVIDER = "local";
process.env.NODE_ENV = "test";

const {
  getFileStorageStatus,
  STORAGE_PURPOSES,
  storagePolicyFor,
  storageFields,
  storeUploadedFile,
} = require("../services/fileStorageService");

const temporaryPath = path.join(os.tmpdir(), `matths-storage-${randomUUID()}.png`);
fs.writeFileSync(temporaryPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

storeUploadedFile({
  path: temporaryPath,
  filename: path.basename(temporaryPath),
  originalname: "test.png",
  mimetype: "image/png",
})
  .then(() => {
    throw new Error("영구 로컬 저장 요청은 거부되어야 합니다.");
  })
  .catch((error) => {
    assert.equal(error.code, "PERSISTENT_LOCAL_STORAGE_DISABLED");
    assert.equal(getFileStorageStatus().persistentLocalReady, false);
    assert.deepEqual(storageFields({}), {
      storageProvider: "R2",
      storagePurpose: "GENERIC",
      cloudPublicId: "",
      cloudResourceType: "",
      cloudDeliveryType: "",
      cloudVersion: null,
      cloudFormat: "",
      r2ObjectKey: "",
      r2Sha256: "",
      r2ETag: "",
    });
    assert.equal(
      storagePolicyFor(STORAGE_PURPOSES.ADMIN_ARCHIVE).provider,
      "r2"
    );
    assert.equal(
      storagePolicyFor(STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK).provider,
      "r2"
    );
    assert.equal(
      storagePolicyFor(STORAGE_PURPOSES.USER_ARENA_EVIDENCE).provider,
      "cloudinary"
    );
    assert.equal(
      storagePolicyFor(STORAGE_PURPOSES.USER_COMMUNITY).provider,
      "cloudinary"
    );
    for (const sourcePath of [
      "services/communityAttachmentService.js",
      "services/archiveService.js",
      "services/arenaMatchEvidenceService.js",
    ]) {
      const source = fs.readFileSync(path.resolve(__dirname, "..", sourcePath), "utf8");
      assert.ok(source.includes("storeUploadedFile"));
      assert.ok(source.includes("storageFields"));
    }
    console.log("영구 로컬 저장 차단과 R2·Cloudinary 분리 저장 정책 검증 완료");
  })
  .finally(() => fs.promises.unlink(temporaryPath).catch(() => {}))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

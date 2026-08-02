const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.NODE_ENV = "test";
process.env.FILE_STORAGE_PROVIDER = "cloudinary";
delete process.env.CLOUDINARY_URL;
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

const {
  STORAGE_PURPOSES,
  storagePolicyFor,
  storeUploadedFile,
} = require("../services/fileStorageService");

async function run() {
  assert.equal(storagePolicyFor(STORAGE_PURPOSES.ADMIN_ARCHIVE).provider, "local");
  assert.equal(storagePolicyFor(STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK).provider, "local");
  assert.equal(storagePolicyFor(STORAGE_PURPOSES.USER_COMMUNITY).provider, "cloudinary");
  assert.equal(storagePolicyFor(STORAGE_PURPOSES.USER_ARENA_EVIDENCE).provider, "cloudinary");

  const localDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "matths-admin-storage-"));
  const filePath = path.join(localDirectory, "archive.pdf");
  await fs.promises.writeFile(filePath, Buffer.from("admin archive"));
  try {
    const asset = await storeUploadedFile(
      {
        path: filePath,
        filename: "archive.pdf",
        originalname: "archive.pdf",
        mimetype: "application/pdf",
      },
      {
        localDirectory,
        purpose: STORAGE_PURPOSES.ADMIN_ARCHIVE,
      }
    );
    assert.equal(asset.storageProvider, "LOCAL");
    assert.equal(asset.storagePurpose, "ADMIN_ARCHIVE");
    assert.equal(fs.existsSync(filePath), true, "운영자 로컬 원본은 업로드 뒤 유지되어야 합니다.");
  } finally {
    await fs.promises.rm(localDirectory, { recursive: true, force: true });
  }

  await assert.rejects(
    () =>
      storeUploadedFile(
        {
          path: path.join(os.tmpdir(), "missing-user-evidence.png"),
          filename: "evidence.png",
          originalname: "evidence.png",
          mimetype: "image/png",
        },
        { purpose: STORAGE_PURPOSES.USER_ARENA_EVIDENCE }
      ),
    (error) => error?.code === "CLOUDINARY_NOT_CONFIGURED"
  );

  const sourceChecks = [
    ["services/archiveService.js", "STORAGE_PURPOSES.ADMIN_ARCHIVE"],
    ["services/privateMockExamService.js", "STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK"],
    ["services/communityAttachmentService.js", "STORAGE_PURPOSES.USER_COMMUNITY"],
    ["services/arenaMatchEvidenceService.js", "STORAGE_PURPOSES.USER_ARENA_EVIDENCE"],
  ];
  for (const [file, text] of sourceChecks) {
    assert.ok(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8").includes(text), `${file} 저장 목적 누락`);
  }

  const archiveSource = fs.readFileSync(
    path.resolve(__dirname, "..", "services", "archiveService.js"),
    "utf8"
  );
  for (const feature of [
    "ARCHIVE_TRASH_RETENTION_MS",
    "restoreArchiveItem",
    "purgeExpiredArchiveTrash",
    "startArchiveTrashPurgeScheduler",
  ]) {
    assert.ok(archiveSource.includes(feature), `아카이브 휴지통 기능 누락: ${feature}`);
  }

  const evidenceSource = fs.readFileSync(
    path.resolve(__dirname, "..", "services", "arenaMatchEvidenceService.js"),
    "utf8"
  );
  for (const feature of ["ARENA_EVIDENCE_RETENTION_MS", "retentionUntil", "purgeExpiredArenaEvidence"]) {
    assert.ok(evidenceSource.includes(feature), `풀이 증거 보존 기능 누락: ${feature}`);
  }

  console.log("운영자 LOCAL·사용자 Cloudinary 분리 저장 정책 검증 완료");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

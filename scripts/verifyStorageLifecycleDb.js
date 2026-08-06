const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.resolve(__dirname, "..", "config.env") });

const { ArchiveItem, User } = require("../models/matthsModel");
const { r2ObjectExists } = require("../services/r2ObjectStorageService");
const {
  ARCHIVE_STORAGE_DIR,
  createArchiveItem,
  deleteArchiveItem,
  purgeArchiveItem,
  restoreArchiveItem,
} = require("../services/archiveService");

async function run() {
  await mongoose.connect(process.env.DB);
  const admin = await User.findOne({ role: "admin", isActive: { $ne: false } })
    .select("_id role email")
    .lean();
  assert.ok(admin, "저장 수명주기 검증에 사용할 운영자 계정이 필요합니다.");

  await fs.promises.mkdir(ARCHIVE_STORAGE_DIR, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}.pdf`;
  const filePath = path.join(ARCHIVE_STORAGE_DIR, storedName);
  await fs.promises.writeFile(filePath, Buffer.from("Matths storage lifecycle verification"));
  let itemId = null;

  try {
    const created = await createArchiveItem({
      user: { id: admin._id, role: admin.role, email: admin.email },
      file: {
        path: filePath,
        filename: storedName,
        originalname: "storage-lifecycle-test.pdf",
        mimetype: "application/pdf",
        size: (await fs.promises.stat(filePath)).size,
      },
      title: "Storage lifecycle verification",
      description: "자동 검증 뒤 삭제되는 파일",
      category: "기타",
      folderId: null,
      isPublished: false,
    });
    itemId = created.id;
    let row = await ArchiveItem.findById(itemId).lean();
    assert.equal(row.storageProvider, "R2");
    assert.equal(row.storagePurpose, "ADMIN_ARCHIVE");
    assert.equal(fs.existsSync(filePath), false, "R2 업로드 성공 뒤 임시 파일을 삭제해야 합니다.");
    assert.equal(await r2ObjectExists(row.r2ObjectKey, row.r2Sha256), true);

    await deleteArchiveItem({
      itemId,
      user: { id: admin._id, role: admin.role, email: admin.email },
    });
    row = await ArchiveItem.findById(itemId).lean();
    assert.ok(row.deletedAt);
    assert.ok(row.purgeAfter);
    assert.equal(await r2ObjectExists(row.r2ObjectKey, row.r2Sha256), true, "휴지통 기간에는 R2 원본을 유지해야 합니다.");

    await restoreArchiveItem({
      itemId,
      user: { id: admin._id, role: admin.role, email: admin.email },
    });
    row = await ArchiveItem.findById(itemId).lean();
    assert.equal(row.deletedAt, null);

    await deleteArchiveItem({
      itemId,
      user: { id: admin._id, role: admin.role, email: admin.email },
    });
    await purgeArchiveItem({
      itemId,
      user: { id: admin._id, role: admin.role, email: admin.email },
    });
    assert.equal(await ArchiveItem.exists({ _id: itemId }), null);
    assert.equal(await r2ObjectExists(row.r2ObjectKey), false);

    console.log("운영자 R2 저장·30일 휴지통·복구·영구 삭제 Atlas E2E 검증 완료");
  } finally {
    if (itemId) await ArchiveItem.deleteOne({ _id: itemId }).catch(() => {});
    await fs.promises.unlink(filePath).catch(() => {});
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error.message);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => {});
});

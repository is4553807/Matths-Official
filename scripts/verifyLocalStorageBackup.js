const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  backupObjectKey,
  isR2BackupConfigured,
  millisecondsUntilNextKstBackup,
} = require("../services/localStorageBackupService");

assert.equal(
  backupObjectKey({
    _id: "archive-item-id",
    storedName: "../unsafe.pdf",
    storagePurpose: "ADMIN_ARCHIVE",
  }),
  "matths-admin-files/admin_archive/archive-item-id/unsafe.pdf"
);

const beforeBackup = new Date("2026-08-03T18:29:00.000Z");
const afterBackup = new Date("2026-08-03T18:31:00.000Z");
assert.equal(millisecondsUntilNextKstBackup(beforeBackup), 60 * 1000);
assert.equal(millisecondsUntilNextKstBackup(afterBackup), 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
assert.equal(typeof isR2BackupConfigured(), "boolean");

const modelSource = fs.readFileSync(
  path.resolve(__dirname, "..", "models", "matthsModel.js"),
  "utf8"
);
for (const field of ["backupObjectKey", "backupSha256", "backupStatus", "backedUpAt"]) {
  assert.ok(modelSource.includes(field), `${field} 백업 메타데이터가 없습니다.`);
}

console.log("운영자 로컬 파일 03:30 KST R2 증분 백업 골격 검증 완료");

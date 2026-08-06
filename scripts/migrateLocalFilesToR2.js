require("dotenv").config({ path: "config.env" });

const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { ArchiveItem } = require("../models/matthsModel");
const { StoreProduct } = require("../models/storeModel");
const {
  createR2ObjectKey,
  r2ObjectExists,
  uploadLocalFileToR2,
} = require("../services/r2ObjectStorageService");

const APPLY = process.argv.includes("--apply");
const ARCHIVE_STORAGE_DIR = path.resolve(
  process.env.ARCHIVE_STORAGE_DIR || path.join(__dirname, "..", "storage", "archive")
);
const STORE_STORAGE_DIR = path.resolve(
  process.env.STORE_STORAGE_DIR || path.join(__dirname, "..", "storage", "store")
);

function localPath(directory, storedName) {
  const result = path.resolve(directory, path.basename(String(storedName || "")));
  return path.dirname(result) === directory ? result : "";
}

async function migrateArchiveItems(summary) {
  const items = await ArchiveItem.find({ storageProvider: "LOCAL" });
  summary.archive.scanned = items.length;
  for (const item of items) {
    try {
      let stored = null;
      if (
        item.backupProvider === "R2" &&
        item.backupObjectKey &&
        item.backupSha256 &&
        await r2ObjectExists(item.backupObjectKey, item.backupSha256)
      ) {
        stored = {
          r2ObjectKey: item.backupObjectKey,
          r2Sha256: item.backupSha256,
          r2ETag: "",
        };
        summary.archive.promotedBackup += 1;
      } else {
        const filePath = localPath(ARCHIVE_STORAGE_DIR, item.storedName);
        if (!filePath || !fs.existsSync(filePath)) {
          summary.archive.missing += 1;
          continue;
        }
        if (!APPLY) {
          summary.archive.ready += 1;
          continue;
        }
        const objectKey = createR2ObjectKey({
          namespace: "archive",
          ownerId: item._id,
          kind: item.storagePurpose || "ADMIN_ARCHIVE",
          originalName: item.originalName,
        });
        stored = await uploadLocalFileToR2({
          filePath,
          objectKey,
          contentType: item.mimeType,
          metadata: { archiveitemid: String(item._id) },
        });
        summary.archive.uploaded += 1;
      }
      if (!APPLY) continue;
      item.storageProvider = "R2";
      item.r2ObjectKey = stored.r2ObjectKey;
      item.r2Sha256 = stored.r2Sha256;
      item.r2ETag = stored.r2ETag || "";
      item.backupProvider = "NONE";
      item.backupObjectKey = "";
      item.backupSha256 = "";
      item.backupStatus = "NOT_CONFIGURED";
      item.backedUpAt = null;
      item.backupError = "";
      await item.save();
      summary.archive.migrated += 1;
    } catch (error) {
      summary.archive.failed += 1;
      console.error(`ArchiveItem ${item._id}: ${error.message}`);
    }
  }
}

async function migrateStoreAssets(summary) {
  const products = (await StoreProduct.find({})).filter((product) =>
    product.assets.some((asset) => asset.storageProvider !== "R2" || !asset.r2ObjectKey)
  );
  summary.store.products = products.length;
  for (const product of products) {
    let changed = false;
    for (const asset of product.assets) {
      if (asset.storageProvider === "R2" && asset.r2ObjectKey) continue;
      summary.store.scanned += 1;
      const filePath = localPath(STORE_STORAGE_DIR, asset.storedName);
      if (!filePath || !fs.existsSync(filePath)) {
        summary.store.missing += 1;
        continue;
      }
      if (!APPLY) {
        summary.store.ready += 1;
        continue;
      }
      try {
        const objectKey = createR2ObjectKey({
          namespace: "store",
          ownerId: product._id,
          kind: asset.kind,
          originalName: asset.originalName,
        });
        const stored = await uploadLocalFileToR2({
          filePath,
          objectKey,
          contentType: asset.mimeType,
          metadata: { storeproductid: String(product._id) },
        });
        asset.storageProvider = "R2";
        asset.r2ObjectKey = stored.r2ObjectKey;
        asset.r2Sha256 = stored.r2Sha256;
        asset.r2ETag = stored.r2ETag || "";
        changed = true;
        summary.store.migrated += 1;
      } catch (error) {
        summary.store.failed += 1;
        console.error(`StoreProduct ${product._id} / asset ${asset._id}: ${error.message}`);
      }
    }
    if (APPLY && changed) await product.save();
  }
}

async function run() {
  if (!process.env.DB) throw new Error("DB 연결 정보가 없습니다.");
  await mongoose.connect(process.env.DB);
  const summary = {
    mode: APPLY ? "APPLY" : "PREVIEW",
    archive: { scanned: 0, ready: 0, promotedBackup: 0, uploaded: 0, migrated: 0, missing: 0, failed: 0 },
    store: { products: 0, scanned: 0, ready: 0, migrated: 0, missing: 0, failed: 0 },
  };
  await migrateArchiveItems(summary);
  await migrateStoreAssets(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) console.log("실제 이전은 npm run storage-r2:migrate -- --apply 로 실행합니다.");
}

run()
  .catch((error) => {
    console.error(`R2 migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

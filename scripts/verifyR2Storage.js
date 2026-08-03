require("dotenv").config({ path: "config.env" });

const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const {
  downloadAndVerifyR2Backup,
} = require("../services/localStorageBackupService");

const REQUIRED_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

function missingEnvironmentKeys() {
  return REQUIRED_ENV.filter((key) => !String(process.env[key] || "").trim());
}

async function verifyR2Storage() {
  const missing = missingEnvironmentKeys();
  if (missing.length) {
    throw new Error(`config.env에 다음 값을 입력해주세요: ${missing.join(", ")}`);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const bucket = process.env.R2_BUCKET;
  const shouldVerifyWrite = process.env.R2_VERIFY_WRITE === "1";
  const testKey = `matths-connection-check/${Date.now()}.txt`;
  const testBody = Buffer.from("Matths R2 connection verification", "utf8");
  const testSha256 = createHash("sha256").update(testBody).digest("hex");
  const restoredPath = path.join("/tmp", `matths-r2-restore-${randomUUID()}.txt`);

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`R2 bucket access verified: ${bucket}`);

    if (!shouldVerifyWrite) {
      console.log(
        "Bucket access check complete. This message does not mean the token is read-only."
      );
      console.log(
        "Set R2_VERIFY_WRITE=1 to perform a temporary upload-and-delete permission check."
      );
      return;
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testBody,
        ContentType: "text/plain; charset=utf-8",
        Metadata: { sha256: testSha256 },
      })
    );
    const restoreResult = await downloadAndVerifyR2Backup({
      item: {
        backupProvider: "R2",
        backupObjectKey: testKey,
        backupSha256: testSha256,
      },
      destinationPath: restoredPath,
    });
    assert.equal(restoreResult.sha256, testSha256);
    assert.equal(fs.readFileSync(restoredPath, "utf8"), testBody.toString("utf8"));
    fs.unlinkSync(restoredPath);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log("R2 upload, hash-verified restore, and deletion verified. Temporary files were removed.");
  } finally {
    fs.rmSync(restoredPath, { force: true });
    client.destroy();
  }
}

verifyR2Storage().catch((error) => {
  console.error(`R2 verification failed: ${error.message}`);
  process.exitCode = 1;
});

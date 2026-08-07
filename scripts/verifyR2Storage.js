require("dotenv").config({ path: "config.env" });

const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");

const {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

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
    const uploaded = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: testKey })
    );
    assert.equal(String(uploaded.Metadata?.sha256 || ""), testSha256);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log("R2 upload, object metadata hash, and deletion verified. No local restore copy was created.");
  } finally {
    client.destroy();
  }
}

verifyR2Storage().catch((error) => {
  console.error(`R2 verification failed: ${error.message}`);
  process.exitCode = 1;
});

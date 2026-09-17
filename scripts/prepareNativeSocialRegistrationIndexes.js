/* Read-only by default. --apply only creates missing schema indexes. */
const mongoose = require("mongoose");
mongoose.set({ autoCreate: false, autoIndex: false });
require("dotenv").config({ path: "config.env", quiet: true });

const NativeSocialRegistrationTicket = require(
  "../models/nativeSocialRegistrationTicketModel"
);

function signature(key) {
  return JSON.stringify(Object.entries(key || {}));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) {
    throw new Error(
      "Usage: node scripts/prepareNativeSocialRegistrationIndexes.js [--apply]"
    );
  }
  if (!process.env.DB) {
    throw new Error(
      "Set DB using the deployment secret provider. Do not paste connection strings into logs."
    );
  }

  await mongoose.connect(process.env.DB, {
    autoCreate: false,
    autoIndex: false,
  });
  try {
    if (args.includes("--apply")) {
      await NativeSocialRegistrationTicket.createIndexes();
    }
    const actual = await NativeSocialRegistrationTicket.collection
      .indexes()
      .catch((error) => {
        if (error.code === 26) return [];
        throw error;
      });
    const actualBySignature = new Map(
      actual
        .filter((index) => index.name !== "_id_")
        .map((index) => [signature(index.key), index])
    );
    const expected = NativeSocialRegistrationTicket.schema.indexes();
    const missing = expected
      .filter(([key]) => !actualBySignature.has(signature(key)))
      .map(([key]) => key);
    const tokenIndex = actualBySignature.get(signature({ tokenHash: 1 }));
    const ttlIndex = actualBySignature.get(signature({ expiresAt: 1 }));
    const identityIndex = actualBySignature.get(signature({
      provider: 1,
      identityDigest: 1,
      status: 1,
      createdAt: -1,
    }));
    const userStatusIndex = actualBySignature.get(signature({
      userId: 1,
      status: 1,
    }));
    const ready =
      missing.length === 0 &&
      tokenIndex?.unique === true &&
      ttlIndex?.expireAfterSeconds === 0 &&
      Boolean(identityIndex) &&
      userStatusIndex?.partialFilterExpression?.userId?.$type === "objectId";
    console.log(JSON.stringify({
      collection: NativeSocialRegistrationTicket.collection.name,
      ready,
      missing,
    }));
    if (!ready) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(
    "Native social registration index preparation failed:",
    error.code || error.name
  );
  process.exitCode = 1;
});
